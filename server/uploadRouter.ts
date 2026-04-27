import { Router } from "express";
import { PDFParse } from "pdf-parse";
import { parseExtratoBB } from "./parsers/extratoBB";
import multer from "multer";
import * as XLSX from "xlsx";
import { storagePut } from "./storage";
import {
  criarExtratoUpload, inserirLinhasExtrato,
  criarInadimplenteUpload, inserirInadimplentes,
} from "./comissoesDb";
import { criarUploadCancelados, inserirCancelados } from "./canceladosDb";
import { criarUploadExtrato } from "./extratoBancarioDb";
import { InsertExtratoComissao, InsertInadimplente } from "../drizzle/schema";
import { getDb } from "./db";
import { clientes } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import mysql from "mysql2/promise";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Pool para operações de produtos/vínculos
let _pool: mysql.Pool | null = null;
function getPool(): mysql.Pool {
  if (!_pool && process.env.DATABASE_URL) {
    _pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      connectionLimit: 5,
      waitForConnections: true,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
  }
  if (!_pool) throw new Error("DATABASE_URL não configurado");
  return _pool;
}
async function queryPool<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const pool = getPool();
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

// --- Helpers ---

function parseValor(v: unknown): string {
  if (v == null) return "0";
  const s = String(v).replace(/[R$\s]/g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? "0" : n.toFixed(2);
}

function parseNum(v: unknown): number {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function removeAcentos(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x00-\x7F]/g, "");
}

function parseCPF(v: unknown): string {
  if (v == null) return "";
  const digits = String(v).replace(/\D/g, "").trim();
  if (!digits) return "";
  // CPF tem 11 dígitos, CNPJ tem 14 — completar com zeros à esquerda
  if (digits.length <= 11) return digits.padStart(11, "0");
  if (digits.length <= 14) return digits.padStart(14, "0");
  return digits;
}

// --- UPLOAD EXTRATO COMISSÃO ---

router.post("/upload/extrato-comissao", upload.single("arquivo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });

    const mes = parseInt(req.body.mes);
    const ano = parseInt(req.body.ano);
    if (!mes || !ano) return res.status(400).json({ error: "Mês e ano são obrigatórios" });

     // Detectar se é CSV (por extensão ou conteúdo)
    const fileName = req.file.originalname?.toLowerCase() ?? "";
    const isCsv = fileName.endsWith(".csv") || req.file.mimetype?.includes("csv") ||
      req.file.buffer.slice(0, 200).toString("utf8").includes(";");
    let rows: unknown[][];
    if (isCsv) {
      // CSV com separador ; e decimal , (padrão brasileiro)
      // Detectar encoding: tentar UTF-8 primeiro (com ou sem BOM), fallback para latin1
      let text: string;
      try {
        text = req.file.buffer.toString("utf8");
        // Remover BOM se presente
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      } catch {
        text = req.file.buffer.toString("latin1");
      }
      const lines = text.split(/\r?\n/);
      rows = lines.map(line => {
        // Dividir por ; respeitando aspas
        const cols: string[] = [];
        let cur = "";
        let inQuote = false;
        for (const ch of line) {
          if (ch === '"') { inQuote = !inQuote; }
          else if (ch === ';' && !inQuote) { cols.push(cur.trim()); cur = ""; }
          else { cur += ch; }
        }
        cols.push(cur.trim());
        return cols;
      });
    } else {
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const nomesAbas = wb.SheetNames;
      const abaAlvo = nomesAbas.find(n =>
        n.toUpperCase().includes("EXTRATO") || n.toUpperCase().includes("COMISS")
      ) ?? nomesAbas[0];
      const ws = wb.Sheets[abaAlvo];
      rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
    };

    // Encontrar linha de cabeçalho (procura "CPF" ou "Nome" ou "Produtor")
    let headerRow = 0;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i] as unknown[];
      const rowStr = row.map(c => String(c ?? "").toUpperCase()).join("|");
      if (rowStr.includes("CPF") || rowStr.includes("PRODUTOR") || rowStr.includes("NOME")) {
        headerRow = i;
        break;
      }
    }

    // Normalizar headers: remover acentos e BOM para busca robusta
    const headers = (rows[headerRow] as string[]).map(h => removeAcentos(String(h ?? "").trim().toUpperCase()));

    // Mapear colunas pelo nome do cabeçalho (busca sem acentos)
    const col = (nome: string) => {
      const nomeNorm = removeAcentos(nome.toUpperCase());
      return headers.findIndex(h => h.includes(nomeNorm));
    };

    const iCpfProdutor = col("CPF/CNPJ DO PRODUTOR") !== -1 ? col("CPF/CNPJ DO PRODUTOR") : col("CPF");
    const iCodProdutor = col("CODIGO DO PRODUTOR");
    const iTipoCliente = col("TIPO DE CLIENTE");
    const iNomeCliente = col("NOME/RAZAO SOCIAL") !== -1 ? col("NOME/RAZAO SOCIAL") : col("NOME");
    const iCpfCliente = col("CPF/CNPJ DO CLIENTE") !== -1 ? col("CPF/CNPJ DO CLIENTE") : col("CPF DO CLIENTE");
    const iProposta = col("PROPOSTA");
    const iUp = col("UP DA VENDA") !== -1 ? col("UP DA VENDA") : col("UP");
    const iInscricao = col("INSCRICAO") !== -1 ? col("INSCRICAO") : col("INSCRI");
    const iDescProduto = col("DESCRICAO PRODUTO") !== -1 ? col("DESCRICAO PRODUTO") : col("PRODUTO");
    const iCodProduto = col("CODIGO DO PRODUTO") !== -1 ? col("CODIGO DO PRODUTO") : col("COD");
    const iValorBase = col("VALOR BASE");
    const iParcelaComis = col("PARCELA COMISSIONADA");
    const iCompComis = col("COMPETENCIA COMISSIONADA");
    const iParcelaFat = col("PARCELA FATURADA");
    const iCompFat = col("COMPETENCIA FATURADA");
    const iAngariacao = col("VALOR ANGARIACAO") !== -1 ? col("VALOR ANGARIACAO") : col("ANGARIA");

    // Mapear colunas de comissão e incentivo
    const iValorComissao = col("VALOR COMISSAO") !== -1 ? col("VALOR COMISSAO") : col("COMISSAO");
    const iPctComissao = col("%  COMISSAO") !== -1 ? col("%  COMISSAO") : col("% COMISSAO");
    const iValorIncentivo = col("VALOR INCENTIVO") !== -1 ? col("VALOR INCENTIVO") : col("INCENTIVO");
    const iPctIncentivo = col("%  INCENTIVO") !== -1 ? col("%  INCENTIVO") : col("% INCENTIVO");
    // Coluna tipo de lançamento — usada para filtrar apenas CARTEIRA_COMISSAO no valorBase
    const iTipoLancamento = col("TIPO DE LANCAMENTO") !== -1 ? col("TIPO DE LANCAMENTO") : col("TIPO DE LAN");

    // --- PASSO 1: Agrupar por CPF do cliente (unificar duplicatas) ---
    // Estrutura: cpf -> { nome, valorBase, valorComissao, pctComissao, valorIncentivo, pctIncentivo, produtos }
    type CpfEntry = {
      nome: string;
      cpfProdutor: string;
      codProdutor: string;
      tipoCliente: string;
      proposta: string;
      upVenda: string;
      inscricao: string;
      valorBase: number;
      valorComissao: number;
      pctComissao: number;
      valorIncentivo: number;
      pctIncentivo: number;
      parcelaComissionada: number;
      competenciaComissionada: string;
      parcelaFaturada: number;
      competenciaFaturada: string;
      valorAngariacao: number;
      produtos: Map<string, string>; // codigo -> descricao
    };

    const cpfMap = new Map<string, CpfEntry>();

    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      if (!row || row.every(c => c == null || String(c).trim() === "")) continue;

      const nomeCliente = String(iNomeCliente >= 0 ? row[iNomeCliente] ?? "" : "").trim();
      const cpfRaw = iCpfCliente >= 0 ? row[iCpfCliente] : null;
      const cpfCliente = parseCPF(cpfRaw);
      if (!cpfCliente && !nomeCliente) continue;

      // Usar CPF como chave, ou nome se não tiver CPF
      const chave = cpfCliente || nomeCliente;

      // Filtrar: só acumula valorBase de linhas CARTEIRA_COMISSAO (não INCENTIVO nem ANGARIACAO)
      const tipoLancamento = String(iTipoLancamento >= 0 ? row[iTipoLancamento] ?? "" : "").trim().toUpperCase();
      const isCarteiraComissao = tipoLancamento === "" || tipoLancamento.includes("CARTEIRA");
      const valorBase = isCarteiraComissao ? parseNum(iValorBase >= 0 ? row[iValorBase] : null) : 0;
      const valorComissao = parseNum(iValorComissao >= 0 ? row[iValorComissao] : null);
      const pctComissao = parseNum(iPctComissao >= 0 ? row[iPctComissao] : null);
      const valorIncentivo = parseNum(iValorIncentivo >= 0 ? row[iValorIncentivo] : null);
      const pctIncentivo = parseNum(iPctIncentivo >= 0 ? row[iPctIncentivo] : null);

      const codigoProduto = String(iCodProduto >= 0 ? row[iCodProduto] ?? "" : "").trim();
      const descricaoProduto = String(iDescProduto >= 0 ? row[iDescProduto] ?? "" : "").trim();

      if (!cpfMap.has(chave)) {
        cpfMap.set(chave, {
          nome: nomeCliente,
          cpfProdutor: parseCPF(iCpfProdutor >= 0 ? row[iCpfProdutor] : null),
          codProdutor: String(iCodProdutor >= 0 ? row[iCodProdutor] ?? "" : "").trim(),
          tipoCliente: String(iTipoCliente >= 0 ? row[iTipoCliente] ?? "" : "").trim(),
          proposta: String(iProposta >= 0 ? row[iProposta] ?? "" : "").trim(),
          upVenda: String(iUp >= 0 ? row[iUp] ?? "" : "").trim(),
          inscricao: String(iInscricao >= 0 ? row[iInscricao] ?? "" : "").trim(),
          valorBase: 0,
          valorComissao: 0,
          pctComissao: 0,
          valorIncentivo: 0,
          pctIncentivo: 0,
          parcelaComissionada: parseNum(iParcelaComis >= 0 ? row[iParcelaComis] : null),
          competenciaComissionada: String(iCompComis >= 0 ? row[iCompComis] ?? "" : "").trim(),
          parcelaFaturada: parseNum(iParcelaFat >= 0 ? row[iParcelaFat] : null),
          competenciaFaturada: String(iCompFat >= 0 ? row[iCompFat] ?? "" : "").trim(),
          valorAngariacao: 0,
          produtos: new Map(),
        });
      }

      const entry = cpfMap.get(chave)!;
      entry.valorBase += valorBase; // só acumula se for CARTEIRA_COMISSAO
      entry.valorComissao += valorComissao;
      entry.valorIncentivo += valorIncentivo;
      entry.valorAngariacao += parseNum(iAngariacao >= 0 ? row[iAngariacao] : null);
      // Para % comissão: usar o maior valor encontrado
      if (pctComissao > entry.pctComissao) entry.pctComissao = pctComissao;
      if (pctIncentivo > entry.pctIncentivo) entry.pctIncentivo = pctIncentivo;
      // Adicionar produto ao mapa
      if (codigoProduto && descricaoProduto) {
        entry.produtos.set(codigoProduto, descricaoProduto);
      }
    }

    // --- PASSO 2: Inserir/atualizar produtos no banco ---
    const produtosGlobal = new Map<string, string>(); // codigo -> descricao
    for (const [, entry] of Array.from(cpfMap.entries())) {
      for (const [cod, desc] of Array.from(entry.produtos.entries())) {
        if (!produtosGlobal.has(cod)) produtosGlobal.set(cod, desc);
      }
    }

    for (const [codigo, descricao] of Array.from(produtosGlobal.entries())) {
      await queryPool(
        `INSERT INTO produtos (codigo, descricao) VALUES (?, ?) ON DUPLICATE KEY UPDATE descricao = VALUES(descricao)`,
        [codigo, descricao]
      );
    }

    // Buscar mapa de produtos (codigo -> id)
    const prodRows = await queryPool<{ id: number; codigo: string }>(
      `SELECT id, codigo FROM produtos`
    );
    const prodIdMap = new Map(prodRows.map(p => [p.codigo, p.id]));

    // --- PASSO 3: Montar linhas do extrato (1 linha por CPF unificado) ---
    const linhas: InsertExtratoComissao[] = [];
    let totalComissao = 0;

    for (const [cpf, entry] of Array.from(cpfMap.entries())) {
      const valorComissaoTotal = entry.valorComissao + entry.valorIncentivo;
      // % total = % comissão + (% comissão * % incentivo)
      const pctComissaoTotal = entry.pctComissao + (entry.pctComissao * entry.pctIncentivo);
      totalComissao += valorComissaoTotal;

      const produtosArr = Array.from(entry.produtos.keys());
      const codigoProduto = produtosArr[0] || "";
      const descricaoProduto = codigoProduto ? (entry.produtos.get(codigoProduto) || "") : "";

      linhas.push({
        uploadId: 0,
        mes,
        ano,
        cpfProdutor: entry.cpfProdutor,
        codigoProdutor: entry.codProdutor,
        nomeProdutor: "",
        tipoCliente: entry.tipoCliente,
        nomeCliente: entry.nome,
        cpfCliente: cpf,
        proposta: entry.proposta,
        upVenda: entry.upVenda,
        inscricao: entry.inscricao,
        descricaoProduto,
        codigoProduto,
        valorBase: entry.valorBase.toFixed(2),
        parcelaComissionada: entry.parcelaComissionada,
        competenciaComissionada: entry.competenciaComissionada,
        parcelaFaturada: entry.parcelaFaturada,
        competenciaFaturada: entry.competenciaFaturada,
        valorAngariacao: entry.valorAngariacao.toFixed(2),
        valorComissao: entry.valorComissao.toFixed(2),
        pctComissao: entry.pctComissao.toFixed(4),
        valorIncentivo: entry.valorIncentivo.toFixed(2),
        pctIncentivo: entry.pctIncentivo.toFixed(4),
        valorComissaoTotal: valorComissaoTotal.toFixed(2),
        pctComissaoTotal: pctComissaoTotal.toFixed(4),
      });
    }

    // --- PASSO 4: Criar registro de upload ---
    const uploadId = await criarExtratoUpload({
      nomeArquivo: req.file.originalname,
      mes, ano,
      totalRegistros: linhas.length,
      totalComissao: totalComissao.toFixed(2),
    });

    // Atualizar uploadId em todas as linhas
    linhas.forEach(l => (l.uploadId = uploadId));
    await inserirLinhasExtrato(linhas);
    // --- PASSO 5: Atualizar contribuição E valorComissao na Base de Clientes ---
    // Regra: sempre sobrescreve com os valores mais recentes do extrato
    let clientesAtualizados = 0;
    for (const [cpf, entry] of Array.from(cpfMap.entries())) {
      if (entry.valorBase <= 0) continue;
      try {
        // Normaliza CPF dos dois lados: remove não-dígitos e completa com zeros à esquerda
        const cpfNorm = cpf.replace(/\D/g, '');
        const valorComissaoTotal = (entry.valorComissao + entry.valorIncentivo).toFixed(2);
        await queryPool(
          `UPDATE clientes SET contribuicao = ?, valorComissao = ? WHERE LPAD(REGEXP_REPLACE(cpf, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(cpf, '[^0-9]', '')) <= 11, 11, 14), '0') = ?`,
          [entry.valorBase.toFixed(2), valorComissaoTotal, cpfNorm.padStart(cpfNorm.length <= 11 ? 11 : 14, '0')]
        );
        clientesAtualizados++;
      } catch (e) {
        // Ignorar erros individuais
      }
    }
    // --- PASSO 6: Vincular produtos aos clientes ---
    let vinculosInseridos = 0;
    for (const [cpf, entry] of Array.from(cpfMap.entries())) {
      if (entry.produtos.size === 0) continue;

      // Buscar cliente pelo CPF
      const cpfNorm2 = cpf.replace(/\D/g, '');
      const clienteRows = await queryPool<{ id: number }>(
        `SELECT id FROM clientes WHERE LPAD(REGEXP_REPLACE(cpf, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(cpf, '[^0-9]', '')) <= 11, 11, 14), '0') = ?`,
        [cpfNorm2.padStart(cpfNorm2.length <= 11 ? 11 : 14, '0')]
      );
      if (clienteRows.length === 0) continue;
      const clienteId = clienteRows[0].id;

      // Substitui todos os produtos do cliente pelos do extrato atual (mantém base atualizada)
      try {
        await queryPool(`DELETE FROM cliente_produtos WHERE clienteId = ?`, [clienteId]);
      } catch (e) { /* ignorar */ }
      for (const codigoProd of Array.from(entry.produtos.keys())) {
        const produtoId = prodIdMap.get(codigoProd);
        if (!produtoId) continue;
        try {
          await queryPool(
            `INSERT IGNORE INTO cliente_produtos (clienteId, produtoId) VALUES (?, ?)`,
            [clienteId, produtoId]
          );
          vinculosInseridos++;
        } catch (e) {
          // Ignorar duplicatas
        }
      }
    }

    res.json({
      success: true,
      uploadId,
      totalRegistros: linhas.length,
      totalComissao,
      clientesAtualizados,
      vinculosInseridos,
      produtosCadastrados: produtosGlobal.size,
    });
  } catch (err) {
    console.error("[Upload Extrato]", err);
    res.status(500).json({ error: String(err) });
  }
});

// --- PREVIEW INADIMPLENTES (processa sem salvar) ---

router.post("/upload/inadimplentes/preview", upload.single("arquivo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
    const mes = parseInt(req.body.mes);
    const ano = parseInt(req.body.ano);
    if (!mes || !ano) return res.status(400).json({ error: "Mês e ano são obrigatórios" });

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const nomesAbas = wb.SheetNames;
    const abaAlvo = nomesAbas.find(n =>
      n.toUpperCase().includes("JANEIRO") || n.toUpperCase().includes("FEVEREIRO") ||
      n.toUpperCase().includes("MARÇO") || n.toUpperCase().includes("INADIM") || n.toUpperCase().includes("BASE")
    ) ?? nomesAbas.find(n => !n.toUpperCase().includes("DASHBOARD")) ?? nomesAbas[0];

    const ws = wb.Sheets[abaAlvo];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    let headerRow = 0;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i] as unknown[];
      const rowStr = row.map(c => String(c ?? "").toUpperCase()).join("|");
      if (rowStr.includes("NOME") || rowStr.includes("CPF") || rowStr.includes("SEGURADO")) { headerRow = i; break; }
    }

    const headers = (rows[headerRow] as string[]).map(h => String(h ?? "").trim().toUpperCase());
    const col = (nome: string) => headers.findIndex(h => h.includes(nome));
    const iNome   = col("NOME DO CLIENTE") !== -1 ? col("NOME DO CLIENTE") : (col("NOME") !== -1 ? col("NOME") : col("SEGURADO"));
    const iCpf    = col("CPF DO CLIENTE") !== -1 ? col("CPF DO CLIENTE") : col("CPF");
    const iCompet = col("COMPET") !== -1 ? col("COMPET") : (col("MES_PARCELA") !== -1 ? col("MES_PARCELA") : col("MÊS"));
    const iValor  = col("VALOR (R$)") !== -1 ? col("VALOR (R$)") : (col("SOMA DE VALOR") !== -1 ? col("SOMA DE VALOR") : col("VALOR"));

    // Agrupar por CPF (igual ao upload real)
    const mapaGrupos = new Map<string, { nome: string; cpf: string; somaTotal: number; competencias: string[] }>();
    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      if (!row || row.every(c => c == null || String(c).trim() === "")) continue;
      const nome = String(iNome >= 0 ? row[iNome] ?? "" : "").trim();
      if (!nome || nome.toUpperCase() === "NOME DO CLIENTE" || nome.toUpperCase() === "NOME") continue;
      const cpf = parseCPF(iCpf >= 0 ? row[iCpf] : null);
      const chave = cpf || nome.toUpperCase();
      let competencia = String(iCompet >= 0 ? row[iCompet] ?? "" : "").trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(competencia)) { const p = competencia.split("-"); competencia = `${p[1]}/${p[0].slice(2)}`; }
      const valorNum = parseFloat(String(iValor >= 0 ? row[iValor] ?? "0" : "0").replace(",", ".")) || 0;
      if (!mapaGrupos.has(chave)) mapaGrupos.set(chave, { nome, cpf, somaTotal: 0, competencias: [] });
      const g = mapaGrupos.get(chave)!;
      g.somaTotal += valorNum;
      // Deduplicar competências: não adicionar se já existe
      if (competencia && !g.competencias.includes(competencia)) g.competencias.push(competencia);
    }

    // Verificar quais CPFs já existem no banco para este mês/ano
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB indisponível" });

    const { inadimplentes: tbl } = await import("../drizzle/schema");
    const { and, eq: eqOp } = await import("drizzle-orm");

    const cpfsArquivo = Array.from(mapaGrupos.values()).map(g => g.cpf).filter(Boolean);
    let cpfsExistentes = new Set<string>();
    if (cpfsArquivo.length > 0) {
      // Buscar em lotes de 100
      for (let i = 0; i < cpfsArquivo.length; i += 100) {
        const lote = cpfsArquivo.slice(i, i + 100);
        const rows2 = await db.select({ cpf: tbl.cpf })
          .from(tbl)
          .where(and(eqOp(tbl.mes, mes), eqOp(tbl.ano, ano)));
        rows2.forEach(r => { if (r.cpf) cpfsExistentes.add(r.cpf); });
        break; // uma única query já retorna todos do mês
      }
    }

    // Montar preview
    const previewItens: { nome: string; cpf: string; competencias: string; valorTotal: number; acao: "ATUALIZAR" | "INSERIR" }[] = [];
    let totalAtualizar = 0, totalInserir = 0, somaValor = 0;

    for (const [, g] of Array.from(mapaGrupos)) {
      const acao = g.cpf && cpfsExistentes.has(g.cpf) ? "ATUALIZAR" : "INSERIR";
      if (acao === "ATUALIZAR") totalAtualizar++; else totalInserir++;
      somaValor += g.somaTotal;
      previewItens.push({
        nome: g.nome, cpf: g.cpf,
        competencias: g.competencias.join(", "),
        valorTotal: g.somaTotal,
        acao,
      });
    }

    res.json({
      success: true,
      totalRegistros: mapaGrupos.size,
      totalAtualizar,
      totalInserir,
      somaValor,
      itens: previewItens,
    });
  } catch (err) {
    console.error("[Preview Inadimplentes]", err);
    res.status(500).json({ error: String(err) });
  }
});

// --- UPLOAD INADIMPLENTES ---

router.post("/upload/inadimplentes", upload.single("arquivo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });

    const mes = parseInt(req.body.mes);
    const ano = parseInt(req.body.ano);
    if (!mes || !ano) return res.status(400).json({ error: "Mês e ano são obrigatórios" });

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });

    // Pegar a primeira aba com dados de inadimplentes
    const nomesAbas = wb.SheetNames;
    const abaAlvo = nomesAbas.find(n =>
      n.toUpperCase().includes("JANEIRO") ||
      n.toUpperCase().includes("FEVEREIRO") ||
      n.toUpperCase().includes("MARÇO") ||
      n.toUpperCase().includes("INADIM") ||
      n.toUpperCase().includes("BASE")
    ) ?? nomesAbas.find(n => !n.toUpperCase().includes("DASHBOARD")) ?? nomesAbas[0];

    const ws = wb.Sheets[abaAlvo];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // Encontrar linha de cabeçalho
    let headerRow = 0;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i] as unknown[];
      const rowStr = row.map(c => String(c ?? "").toUpperCase()).join("|");
      if (rowStr.includes("NOME") || rowStr.includes("CPF") || rowStr.includes("SEGURADO")) {
        headerRow = i;
        break;
      }
    }

    const headers = (rows[headerRow] as string[]).map(h => String(h ?? "").trim().toUpperCase());
    const col = (nome: string) => headers.findIndex(h => h.includes(nome));

    // Mapear colunas do arquivo da seguradora (ex: "Nome do Cliente", "CPF do Cliente", "Competência Inadimplente")
    const iNome      = col("NOME DO CLIENTE") !== -1 ? col("NOME DO CLIENTE") : (col("NOME") !== -1 ? col("NOME") : col("SEGURADO"));
    const iCpf       = col("CPF DO CLIENTE") !== -1 ? col("CPF DO CLIENTE") : col("CPF");
    const iTel1      = col("TELEFONE");
    const iTel2      = headers.findIndex((h, ii) => h.includes("TELEFONE") && ii > iTel1);
    const iCompet    = col("COMPET") !== -1 ? col("COMPET") : (col("MES_PARCELA") !== -1 ? col("MES_PARCELA") : col("MÊS"));
    const iForma     = col("FORMA DE COBRAN") !== -1 ? col("FORMA DE COBRAN") : (col("FORMA_PAGAMENTO") !== -1 ? col("FORMA_PAGAMENTO") : col("FORMA"));
    const iValor     = col("VALOR (R$)") !== -1 ? col("VALOR (R$)") : (col("SOMA DE VALOR") !== -1 ? col("SOMA DE VALOR") : col("VALOR"));
    const iProduto   = col("PRODUTO");
    const iStatus    = col("STATUS DE TRABALHO") !== -1 ? col("STATUS DE TRABALHO") : col("STATUS");
    const iHistorico = col("HISTORICO") !== -1 ? col("HISTORICO") : col("HISTÓRICO");

    // Agrupar por CPF: todas as linhas do mesmo cliente viram 1 registro
    // (igual ao comportamento de janeiro e fevereiro)
    type Grupo = {
      nome: string; cpf: string; tel1: string; tel2: string; forma: string;
      competencias: string[]; valores: string[];
      somaTotal: number; produtos: Set<string>;
      status: string; historico: string;
    };
    const mapaGrupos = new Map<string, Grupo>();

    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      if (!row || row.every(c => c == null || String(c).trim() === "")) continue;

      const nome = String(iNome >= 0 ? row[iNome] ?? "" : "").trim();
      if (!nome || nome.toUpperCase() === "NOME DO CLIENTE" || nome.toUpperCase() === "NOME") continue;

      const cpf = parseCPF(iCpf >= 0 ? row[iCpf] : null);
      const chave = cpf || nome.toUpperCase();

      // Formatar competência: 2025-09-01 → 09/25
      let competencia = String(iCompet >= 0 ? row[iCompet] ?? "" : "").trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(competencia)) {
        const p = competencia.split("-");
        competencia = `${p[1]}/${p[0].slice(2)}`;
      }

      const valorRaw = String(iValor >= 0 ? row[iValor] ?? "" : "").trim();
      const valorNum = parseFloat(valorRaw.replace(",", ".")) || 0;

      // Produto: remover sufixo " - XXXX" (código)
      const produtoRaw = String(iProduto >= 0 ? row[iProduto] ?? "" : "").trim();
      const produtoNome = produtoRaw.replace(/\s*-\s*\d+\s*$/, "").trim();

      const statusRaw = String(iStatus >= 0 ? row[iStatus] ?? "" : "").trim();
      const historico = String(iHistorico >= 0 ? row[iHistorico] ?? "" : "").trim();
      const forma = String(iForma >= 0 ? row[iForma] ?? "" : "").trim();

      if (!mapaGrupos.has(chave)) {
        mapaGrupos.set(chave, {
          nome, cpf,
          tel1: String(iTel1 >= 0 ? row[iTel1] ?? "" : "").trim(),
          tel2: String(iTel2 >= 0 ? row[iTel2] ?? "" : "").trim(),
          forma, competencias: [], valores: [],
          somaTotal: 0, produtos: new Set(),
          status: statusRaw || "PENDENTE", historico,
        });
      }

      const g = mapaGrupos.get(chave)!;
      // Deduplicar competências: não adicionar se já existe
      if (competencia && !g.competencias.includes(competencia)) g.competencias.push(competencia);
      if (valorRaw) g.valores.push(valorRaw);
      g.somaTotal += valorNum;
      if (produtoNome) g.produtos.add(produtoNome);
      if (statusRaw && statusRaw !== "Não trabalhada" && statusRaw !== "PENDENTE") g.status = statusRaw;
      if (historico && !g.historico) g.historico = historico;
    }

    // Montar registros finais (1 por CPF)
    const registros: InsertInadimplente[] = [];
    let totalValor = 0;

    for (const [, g] of Array.from(mapaGrupos)) {
      totalValor += g.somaTotal;
      registros.push({
        uploadId: 0, mes, ano,
        nome: g.nome, cpf: g.cpf,
        telefone1: g.tel1, telefone2: g.tel2,
        mesParcela: g.competencias.join(", "),
        parcela: g.competencias.length > 1 ? `${g.competencias.length} parcelas` : "1",
        formaPagamento: g.forma,
        valorParcelas: g.valores.join(", "),
        valorTotal: g.somaTotal.toFixed(2),
        produtos: Array.from(g.produtos).join(", "),
        status: g.status || "PENDENTE",
        historicoCobranca: g.historico,
      });
    }

    const uploadId = await criarInadimplenteUpload({
      nomeArquivo: req.file.originalname,
      mes, ano,
      totalRegistros: registros.length,
      totalValor: totalValor.toFixed(2),
    });

    registros.forEach(r => (r.uploadId = uploadId));
    await inserirInadimplentes(registros);

    // Enriquecer contatos automaticamente: buscar email/telefone da Base de Clientes por CPF
    // Normaliza telefone para remover DDD duplicado (ex: "(48)48996172474" → "(48) 99617-2474")
    const normalizarTelefone = (tel: string): string => {
      if (!tel) return tel;
      const raw = tel.trim();
      const matchParen = raw.match(/^\((\d{2})\)/);
      let ddd = "", numero = "";
      if (matchParen) {
        ddd = matchParen[1];
        const resto = raw.replace(/^\(\d{2}\)/, "").replace(/\D/g, "");
        numero = resto.startsWith(ddd) ? resto.slice(ddd.length) : resto;
      } else {
        const digits = raw.replace(/\D/g, "");
        if (digits.length >= 10) { ddd = digits.slice(0, 2); numero = digits.slice(2); }
        else return raw;
      }
      if (!ddd || !numero) return raw;
      if (numero.length === 9) return `(${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`;
      if (numero.length === 8) return `(${ddd}) ${numero.slice(0, 4)}-${numero.slice(4)}`;
      return `(${ddd}) ${numero}`;
    }
    let enriquecidos = 0;
    try {
      const conn2 = await mysql.createConnection(process.env.DATABASE_URL!);
      const [rowsEnr]: any = await conn2.execute(`
        SELECT i.id,
               COALESCE(NULLIF(TRIM(c.email), ''), NULL) as emailCliente,
               COALESCE(NULLIF(TRIM(c.celular), ''), NULLIF(TRIM(c.telefone), ''), NULL) as telCliente
        FROM inadimplentes i
        INNER JOIN clientes c ON
          LPAD(REGEXP_REPLACE(i.cpf, '[^0-9]', ''), 11, '0') = LPAD(REGEXP_REPLACE(c.cpf, '[^0-9]', ''), 11, '0')
        WHERE c.cpf IS NOT NULL AND i.cpf IS NOT NULL AND i.uploadId = ?
      `, [uploadId]);
      for (const row of rowsEnr) {
        const telNorm = row.telCliente ? normalizarTelefone(row.telCliente) : null;
        await conn2.execute(
          `UPDATE inadimplentes SET emailContato = COALESCE(?, emailContato), telefoneContato = COALESCE(?, telefoneContato) WHERE id = ?`,
          [row.emailCliente ?? null, telNorm ?? null, row.id]
        );
        enriquecidos++;
      }
      await conn2.end().catch(() => {});
    } catch (e) {
      console.warn('[Upload Inadimplentes] Enriquecimento automático falhou (não crítico):', e);
    }

    res.json({ success: true, uploadId, totalRegistros: registros.length, totalValor, enriquecidos });
  } catch (err) {
    console.error("[Upload Inadimplentes]", err);
    res.status(500).json({ error: String(err) });
  }
});

// --- Upload de Cancelados ---
router.post("/upload/cancelados", upload.single("arquivo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
    const mes = parseInt(req.body.mes);
    const ano = parseInt(req.body.ano);
    if (!mes || !ano || mes < 1 || mes > 12 || ano < 2020 || ano > 2050) {
      return res.status(400).json({ error: "Mês/Ano inválido" });
    }
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (raw.length < 2) return res.status(400).json({ error: "Planilha vazia" });

    const headers: string[] = raw[0].map((h: any) => String(h).toLowerCase().trim());
    const idx = {
      nome: headers.findIndex(h => h.includes("nome")),
      cpf: headers.findIndex(h => h.includes("cpf")),
      produto: headers.findIndex(h => h.includes("produto")),
      status: headers.findIndex(h => h.includes("status") || h.includes("motivo")),
      observacao: headers.findIndex(h => h.includes("obs") || h.includes("observa")),
    };

    const STATUS_MAP: Record<string, string> = {
      "desistiu": "DESISTIU",
      "desistência": "DESISTIU",
      "inadimplente": "INADIMPLENTE",
      "inadimplência": "INADIMPLENTE",
      "óbito": "OBITO",
      "obito": "OBITO",
      "regulação": "REGULACAO",
      "regulacao": "REGULACAO",
      "alteração de benefício": "ALTERACAO_BENEFICIO",
      "alteracao de beneficio": "ALTERACAO_BENEFICIO",
      "alteração benefício": "ALTERACAO_BENEFICIO",
      "alteracao beneficio": "ALTERACAO_BENEFICIO",
    };

    const registros: { uploadId: number; mes: number; ano: number; nome: string; cpf?: string; produto?: string; status: string; observacao?: string; }[] = [];
    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      const nome = idx.nome >= 0 ? String(row[idx.nome] || "").trim() : "";
      if (!nome) continue;
      const cpf = idx.cpf >= 0 ? String(row[idx.cpf] || "").trim() : undefined;
      const produto = idx.produto >= 0 ? String(row[idx.produto] || "").trim() : undefined;
      const statusRaw = idx.status >= 0 ? String(row[idx.status] || "").toLowerCase().trim() : "";
      const status = STATUS_MAP[statusRaw] || "INADIMPLENTE";
      const observacao = idx.observacao >= 0 ? String(row[idx.observacao] || "").trim() : undefined;
      registros.push({ uploadId: 0, mes, ano, nome, cpf: cpf || undefined, produto: produto || undefined, status, observacao: observacao || undefined });
    }

    if (registros.length === 0) return res.status(400).json({ error: "Nenhum registro válido encontrado" });

    const uploadId = await criarUploadCancelados({
      mes, ano,
      nomeArquivo: req.file.originalname,
      totalRegistros: registros.length,
    });
    registros.forEach(r => (r.uploadId = uploadId));
    await inserirCancelados(registros);
    res.json({ success: true, uploadId, totalRegistros: registros.length });
  } catch (err) {
    console.error("[Upload Cancelados]", err);
    res.status(500).json({ error: String(err) });
  }
});

// --- UPLOAD EXTRATO BANCÁRIO ---
router.post("/extrato-bancario", upload.single("file"), async (req, res) => {
  try {
    console.log("[Upload Extrato] Iniciando upload...");
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
    const mes = parseInt(req.body.mes);
    const ano = parseInt(req.body.ano);
    console.log(`[Upload Extrato] Mês: ${mes}, Ano: ${ano}`);
    if (!mes || !ano) return res.status(400).json({ error: "Mês e ano são obrigatórios" });

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];

    const lancamentos: Array<{
      data: string; lancamento: string; detalhes: string;
      nrDocumento: string; valor: number; tipo: "Entrada" | "Saída";
    }> = [];

    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      const tipo = String(row[5] || "").trim();
      if (tipo !== "Entrada" && tipo !== "Saída") continue;

      const data = String(row[0] || "").trim();
      const lancamento = String(row[1] || "").trim();
      const detalhes = String(row[2] || "").trim();
      const nrDocumento = String(row[3] || "").trim();

      // Parsear valor: "1.550,21 C" ou "-53,00 D" ou número puro
      const valorRaw = String(row[4] || "0");
      const valorStr = valorRaw.replace(/ [CD]$/, "").replace(/\./g, "").replace(",", ".");
      const valor = Math.abs(parseFloat(valorStr) || 0);

      if (!data || !lancamento || valor === 0) continue;
      lancamentos.push({ data, lancamento, detalhes, nrDocumento, valor, tipo: tipo as "Entrada" | "Saída" });
    }

    if (lancamentos.length === 0) return res.status(400).json({ error: "Nenhum lançamento válido encontrado" });

    console.log(`[Upload Extrato] Criando upload com ${lancamentos.length} lançamentos...`);
    const { uploadId, total } = await criarUploadExtrato({
      mes, ano,
      nomeArquivo: req.file.originalname,
      lancamentos,
    });
    console.log(`[Upload Extrato] Upload criado com sucesso! ID: ${uploadId}`);

    res.json({ success: true, uploadId, total });
  } catch (err) {
    console.error("[Upload Extrato Bancário]", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errorMsg, details: String(err) });
  }
});

// --- UPLOAD EXTRATO BANCÁRIO PDF (Banco do Brasil) ---
router.post("/upload/extrato-bancario-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });
    const mes = parseInt(req.body.mes);
    const ano = parseInt(req.body.ano);
    if (!mes || !ano) return res.status(400).json({ error: "Mês e ano são obrigatórios" });

    // Verificar se é PDF
    const isPDF =
      req.file.mimetype === "application/pdf" ||
      req.file.originalname.toLowerCase().endsWith(".pdf");
    if (!isPDF) return res.status(400).json({ error: "Apenas arquivos PDF são aceitos nesta rota" });

    // Extrair texto do PDF usando PDFParse v2
    const parser = new PDFParse({ data: req.file.buffer });
    const parsed = await parser.getText();
    const text: string = parsed.text;

    if (!text || text.trim().length < 50) {
      return res.status(400).json({ error: "Não foi possível extrair texto do PDF. Verifique se o arquivo não está protegido." });
    }

    // Verificar se é extrato do Banco do Brasil
    if (!text.includes("Extrato de Conta Corrente") && !text.includes("Banco do Brasil")) {
      return res.status(400).json({ error: "PDF não reconhecido como extrato do Banco do Brasil" });
    }

    // Parsear lançamentos
    const lancamentosBB = parseExtratoBB(text);

    if (lancamentosBB.length === 0) {
      return res.status(400).json({ error: "Nenhum lançamento válido encontrado no PDF" });
    }

    // Converter para o formato esperado pelo criarUploadExtrato
    const lancamentos = lancamentosBB.map((l) => ({
      data: l.data,
      lancamento: l.lancamento,
      detalhes: "",
      nrDocumento: "",
      valor: l.valor,
      tipo: l.tipo,
    }));

    const { uploadId, total } = await criarUploadExtrato({
      mes,
      ano,
      nomeArquivo: req.file.originalname,
      lancamentos,
    });

    res.json({ success: true, uploadId, total });
  } catch (err) {
    console.error("[Upload Extrato Bancário PDF]", err);
    res.status(500).json({ error: String(err) });
  }
});

// Upload de midia para automacao de aniversario WhatsApp
const uploadMidia = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
router.post("/upload-midia-aniversario", uploadMidia.single("file"), async (req: any, res: any) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
    const ext = req.file.originalname.split(".").pop()?.toLowerCase() || "mp4";
    const key = `aniversario/midia_${Date.now()}.${ext}`;
    const contentType = req.file.mimetype || "video/mp4";
    const { url } = await storagePut(key, req.file.buffer, contentType);
    // Salvar URL no banco
    const pool = getPool();
    await pool.execute(
      `INSERT INTO system_config (chave, valor, descricao) VALUES ('wa_automacao_aniversario_video', ?, 'URL da mídia de aniversário para WhatsApp') ON DUPLICATE KEY UPDATE valor = ?`,
      [url, url]
    );
    res.json({ success: true, url });
  } catch (err) {
    console.error("[Upload Mídia Aniversário]", err);
    res.status(500).json({ error: String(err) });
  }
});

// Upload de mídia para campanhas WhatsApp Marketing
router.post("/upload-midia-campanha", uploadMidia.single("file"), async (req: any, res: any) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
    const ext = req.file.originalname.split(".").pop()?.toLowerCase() || "jpg";
    const key = `campanhas/midia_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const contentType = req.file.mimetype || "image/jpeg";
    const { url } = await storagePut(key, req.file.buffer, contentType);
    // Determinar tipo de mídia
    let mediaType = "document";
    if (contentType.startsWith("image/")) mediaType = "image";
    else if (contentType.startsWith("video/")) mediaType = "video";
    res.json({ success: true, url, mediaType });
  } catch (err) {
    console.error("[Upload Mídia Campanha]", err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;

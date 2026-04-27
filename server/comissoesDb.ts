import { eq, and, or, like, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { getDb } from "./db";
import {
  extratoUploads, extratoComissao, inadimplenteUploads, inadimplentes,
  InsertExtratoComissao, InsertInadimplente,
} from "../drizzle/schema";

// Pool de conexões mysql2 para queries com JOIN complexo
// Usa pool em vez de conexão única para evitar "connection is in closed state"
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

// ─── UPLOADS DE EXTRATO ───────────────────────────────────────────────────────

export async function criarExtratoUpload(data: {
  nomeArquivo: string; mes: number; ano: number;
  totalRegistros: number; totalComissao: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  const [result] = await db.insert(extratoUploads).values(data).$returningId();
  return result.id;
}

export async function listarExtratoUploads() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(extratoUploads).orderBy(desc(extratoUploads.createdAt));
}

export async function deletarExtratoUpload(uploadId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  await db.delete(extratoComissao).where(eq(extratoComissao.uploadId, uploadId));
  await db.delete(extratoUploads).where(eq(extratoUploads.id, uploadId));
}

// ─── LINHAS DO EXTRATO ────────────────────────────────────────────────────────

export async function inserirLinhasExtrato(linhas: InsertExtratoComissao[]) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  if (linhas.length === 0) return;
  for (let i = 0; i < linhas.length; i += 500) {
    await db.insert(extratoComissao).values(linhas.slice(i, i + 500));
  }
}

// ─── CRUD DE VENDEDORES POR CLIENTE ─────────────────────────────────────────────────

export async function listarVendedoresCliente(clienteId: number) {
  const rows = await queryPool<{ id: number; nomeVendedor: string; percentual: string }>(
    `SELECT id, nomeVendedor, percentual FROM cliente_vendedores WHERE clienteId = ? ORDER BY id`,
    [clienteId]
  );
  return rows.map(r => ({ id: r.id, nomeVendedor: r.nomeVendedor, percentual: parseFloat(r.percentual) }));
}

export async function salvarVendedoresCliente(
  clienteId: number,
  vendedores: { nomeVendedor: string; percentual: number }[]
) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM cliente_vendedores WHERE clienteId = ?`, [clienteId]);
    if (vendedores.length > 0) {
      const placeholders = vendedores.map(() => `(?, ?, ?)`).join(", ");
      const flat = vendedores.flatMap(v => [clienteId, v.nomeVendedor, v.percentual.toFixed(2)]);
      await conn.execute(
        `INSERT INTO cliente_vendedores (clienteId, nomeVendedor, percentual) VALUES ${placeholders}`,
        flat
      );
      await conn.execute(
        `UPDATE clientes SET vendedor = ? WHERE id = ?`,
        [vendedores[0].nomeVendedor, clienteId]
      );
    } else {
      await conn.execute(`UPDATE clientes SET vendedor = NULL WHERE id = ?`, [clienteId]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ─── RESUMO POR CORRETOR (usando cliente_vendedores para divisão proporcional) ───

export async function resumoComissoesPorCorretor(mes?: number, ano?: number, vendedor?: string) {
  let query = `
    SELECT 
      cv.nomeVendedor as corretor,
      COUNT(DISTINCT e.cpfCliente) as totalClientes,
      COUNT(*) as totalRegistros,
      COALESCE(SUM(e.valorBase * cv.percentual / 100), 0) as totalBase,
      COALESCE(SUM(e.valorComissao * cv.percentual / 100), 0) as totalValorComissao,
      COALESCE(SUM(e.valorIncentivo * cv.percentual / 100), 0) as totalValorIncentivo,
      COALESCE(SUM(e.valorComissaoTotal * cv.percentual / 100), 0) as totalComissao,
      COALESCE(SUM(e.valorBase * cv.percentual / 100 * 0.15), 0) as totalPrevisao15,
      COALESCE(SUM(e.valorComissaoTotal * cv.percentual / 100), 0) as totalRealizado50
    FROM extrato_comissao e
    INNER JOIN clientes c ON LPAD(REGEXP_REPLACE(e.cpfCliente, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(e.cpfCliente, '[^0-9]', '')) <= 11, 11, 14), '0') = LPAD(REGEXP_REPLACE(c.cpf, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(c.cpf, '[^0-9]', '')) <= 11, 11, 14), '0')
    INNER JOIN cliente_vendedores cv ON cv.clienteId = c.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (mes) { query += ` AND e.mes = ?`; params.push(mes); }
  if (ano) { query += ` AND e.ano = ?`; params.push(ano); }
  if (vendedor) { query += ` AND cv.nomeVendedor = ?`; params.push(vendedor); }
  query += ` GROUP BY cv.nomeVendedor ORDER BY totalComissao DESC`;

  const rows = await queryPool<Record<string, unknown>>(query, params);
  return rows.map(r => ({
    corretor: String(r.corretor ?? ""),
    totalClientes: Number(r.totalClientes),
    totalRegistros: Number(r.totalRegistros),
    totalBase: parseFloat(String(r.totalBase ?? "0")),
    totalValorComissao: parseFloat(String(r.totalValorComissao ?? "0")),
    totalValorIncentivo: parseFloat(String(r.totalValorIncentivo ?? "0")),
    totalComissao: parseFloat(String(r.totalComissao ?? "0")),
    totalPrevisao15: parseFloat(String(r.totalPrevisao15 ?? "0")),
    totalRealizado50: parseFloat(String(r.totalRealizado50 ?? "0")),
    isElisia: String(r.corretor ?? "").toUpperCase() === 'ELISIA',
  }));
}

// ─── DETALHE DOS CLIENTES DE UM CORRETOR ─────────────────────────────────────────

export async function detalheCorretorExtrato(vendedor: string, mes?: number, ano?: number) {
  let query = `
    SELECT 
      e.id, e.nomeCliente, e.cpfCliente, e.descricaoProduto,
      e.valorBase, e.valorComissao, e.pctComissao, e.valorIncentivo, e.pctIncentivo,
      e.valorComissaoTotal, e.pctComissaoTotal,
      e.competenciaComissionada, e.proposta, e.inscricao, e.mes, e.ano,
      cv.nomeVendedor as vendedor,
      cv.percentual as percentualVendedor,
      e.valorBase * cv.percentual / 100 * 0.15 as previsao15,
      e.valorComissaoTotal * cv.percentual / 100 as realizado50
    FROM extrato_comissao e
    INNER JOIN clientes c ON LPAD(REGEXP_REPLACE(e.cpfCliente, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(e.cpfCliente, '[^0-9]', '')) <= 11, 11, 14), '0') = LPAD(REGEXP_REPLACE(c.cpf, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(c.cpf, '[^0-9]', '')) <= 11, 11, 14), '0')
    INNER JOIN cliente_vendedores cv ON cv.clienteId = c.id AND cv.nomeVendedor = ?
    WHERE 1=1
  `;
  const params: (string | number)[] = [vendedor];
  if (mes) { query += ` AND e.mes = ?`; params.push(mes); }
  if (ano) { query += ` AND e.ano = ?`; params.push(ano); }
  query += ` ORDER BY e.nomeCliente LIMIT 500`;

  return queryPool<Record<string, unknown>>(query, params);
}

// ─── MÉTRICAS GERAIS ───────────────────────────────────────────────────────────────────

export async function metricasComissoes(mes?: number, ano?: number, vendedor?: string) {
  let query = `
    SELECT 
      COALESCE(SUM(e.valorComissaoTotal * cv.percentual / 100), 0) as totalComissao,
      COUNT(DISTINCT cv.nomeVendedor) as totalCorretores,
      COUNT(DISTINCT e.cpfCliente) as totalClientes,
      COUNT(*) as totalRegistros
    FROM extrato_comissao e
    INNER JOIN clientes c ON LPAD(REGEXP_REPLACE(e.cpfCliente, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(e.cpfCliente, '[^0-9]', '')) <= 11, 11, 14), '0') = LPAD(REGEXP_REPLACE(c.cpf, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(c.cpf, '[^0-9]', '')) <= 11, 11, 14), '0')
    INNER JOIN cliente_vendedores cv ON cv.clienteId = c.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (mes) { query += ` AND e.mes = ?`; params.push(mes); }
  if (ano) { query += ` AND e.ano = ?`; params.push(ano); }
  if (vendedor) { query += ` AND cv.nomeVendedor = ?`; params.push(vendedor); }

  const rows = await queryPool<Record<string, unknown>>(query, params);
  const row = rows[0];

  return {
    totalComissao: parseFloat(String(row?.totalComissao ?? "0")),
    totalCorretores: Number(row?.totalCorretores ?? 0),
    totalClientes: Number(row?.totalClientes ?? 0),
    totalRegistros: Number(row?.totalRegistros ?? 0),
  };
}


// ─── INADIMPLENTES ────────────────────────────────────────────────────────────

export async function criarInadimplenteUpload(data: {
  nomeArquivo: string; mes: number; ano: number;
  totalRegistros: number; totalValor: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  const [result] = await db.insert(inadimplenteUploads).values(data).$returningId();
  return result.id;
}

export async function listarInadimplenteUploads() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inadimplenteUploads).orderBy(desc(inadimplenteUploads.createdAt));
}

export async function deletarInadimplenteUpload(uploadId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  await db.delete(inadimplentes).where(eq(inadimplentes.uploadId, uploadId));
  await db.delete(inadimplenteUploads).where(eq(inadimplenteUploads.id, uploadId));
}

export async function inserirInadimplentes(linhas: InsertInadimplente[]) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  if (linhas.length === 0) return;

  // Opção B: upsert por CPF + mês + ano
  // - Se o cliente já existe naquele mês/ano: atualiza dados (competências, valores, produtos)
  //   MAS preserva o status se já foi alterado manualmente (diferente de PENDENTE)
  // - Se não existe: insere novo
  for (const linha of linhas) {
    if (!linha.cpf) {
      // Sem CPF: sempre insere (não conseguimos identificar duplicata)
      await db.insert(inadimplentes).values(linha);
      continue;
    }

    // Buscar registro existente pelo CPF + mês + ano
    const existentes = await db
      .select()
      .from(inadimplentes)
      .where(and(
        eq(inadimplentes.cpf, linha.cpf),
        eq(inadimplentes.mes, linha.mes),
        eq(inadimplentes.ano, linha.ano),
      ))
      .limit(1);

    if (existentes.length === 0) {
      // Não existe: inserir novo
      await db.insert(inadimplentes).values(linha);
    } else {
      // Já existe: atualizar dados do arquivo, MAS preservar status se foi alterado manualmente
      const existente = existentes[0];
      const statusAtual = existente.status ?? "PENDENTE";
      const statusFoiAlterado = statusAtual !== "PENDENTE" && statusAtual !== "Não trabalhada";

      await db
        .update(inadimplentes)
        .set({
          nome: linha.nome,
          telefone1: linha.telefone1,
          telefone2: linha.telefone2,
          mesParcela: linha.mesParcela,
          parcela: linha.parcela,
          formaPagamento: linha.formaPagamento,
          valorParcelas: linha.valorParcelas,
          valorTotal: linha.valorTotal,
          produtos: linha.produtos,
          // Só atualiza status se ainda estava PENDENTE (não foi alterado manualmente)
          status: statusFoiAlterado ? statusAtual : (linha.status ?? "PENDENTE"),
          // Atualiza uploadId para referenciar o upload mais recente
          uploadId: linha.uploadId,
        })
        .where(eq(inadimplentes.id, existente.id));
    }
  }
}

export async function listarInadimplentes(mes?: number, ano?: number, status?: string, busca?: string, formaPagamento?: string) {
  // Usa query raw para fazer LEFT JOIN com clientes e buscar telefone/celular da base pelo CPF
  const whereClause: string[] = [];
  const params: unknown[] = [];
  if (mes) { whereClause.push('i.mes = ?'); params.push(mes); }
  if (ano) { whereClause.push('i.ano = ?'); params.push(ano); }
  if (status) {
    if (status === 'PENDENTE') {
      // PENDENTE pode estar como NULL no banco (registros antigos) ou como string 'PENDENTE'
      whereClause.push("(i.status IS NULL OR i.status = '' OR i.status = 'PENDENTE')");
    } else {
      whereClause.push('i.status = ?');
      params.push(status);
    }
  }
  if (busca) { whereClause.push('(i.nome LIKE ? OR i.cpf LIKE ?)'); params.push(`%${busca}%`, `%${busca}%`); }
  if (formaPagamento) { whereClause.push('i.formaPagamento = ?'); params.push(formaPagamento); }
  const whereSQL = whereClause.length > 0 ? 'WHERE ' + whereClause.join(' AND ') : '';
  const rows = await queryPool<any>(`
    SELECT
      i.*,
      COALESCE(
        NULLIF(i.telefoneContato, ''),
        NULLIF(i.telefone1, ''),
        NULLIF(i.telefone2, ''),
        c.celular,
        c.telefone
      ) AS telefoneFinal,
      c.celular AS clienteCelular,
      c.telefone AS clienteTelefone,
      COALESCE(NULLIF(i.emailContato, ''), c.email) AS emailFinal
    FROM inadimplentes i
    LEFT JOIN clientes c ON LPAD(REGEXP_REPLACE(i.cpf, '[^0-9]', ''), 11, '0') = LPAD(REGEXP_REPLACE(c.cpf, '[^0-9]', ''), 11, '0')
    ${whereSQL}
    ORDER BY i.nome
    LIMIT 500
  `, params);
  return rows;
}

export async function metricasInadimplentes(mes?: number, ano?: number) {
  const db = await getDb();
  if (!db) return {
    total: 0, totalValor: 0, valorRecuperado: 0, ticketMedio: 0,
    pagos: 0, boleto: 0, emContato: 0, desistiu: 0, especial: 0, pendente: 0,
    maisDeUmaCompetencia: 0, primeirasParcelas: 0,
    porFormaPagamento: [],
    porStatus: [],
  };
  const conditions = [];
  if (mes) conditions.push(eq(inadimplentes.mes, mes));
  if (ano) conditions.push(eq(inadimplentes.ano, ano));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      totalValor: sql<string>`COALESCE(SUM(${inadimplentes.valorTotal}), 0)`,
      valorRecuperado: sql<string>`COALESCE(SUM(CASE WHEN ${inadimplentes.status} = 'PAGO' THEN ${inadimplentes.valorTotal} ELSE 0 END), 0)`,
      pagos: sql<number>`SUM(CASE WHEN ${inadimplentes.status} = 'PAGO' THEN 1 ELSE 0 END)`,
      boleto: sql<number>`SUM(CASE WHEN ${inadimplentes.status} = 'BOLETO' THEN 1 ELSE 0 END)`,
      emContato: sql<number>`SUM(CASE WHEN ${inadimplentes.status} = 'EM CONTATO' THEN 1 ELSE 0 END)`,
      desistiu: sql<number>`SUM(CASE WHEN ${inadimplentes.status} = 'DESISTIU' THEN 1 ELSE 0 END)`,
      especial: sql<number>`SUM(CASE WHEN ${inadimplentes.status} = 'ESPECIAL' THEN 1 ELSE 0 END)`,
      pendente: sql<number>`SUM(CASE WHEN ${inadimplentes.status} NOT IN ('PAGO','BOLETO','EM CONTATO','DESISTIU','ESPECIAL') THEN 1 ELSE 0 END)`,
    })
    .from(inadimplentes)
    .where(where);
  const porForma = await db
    .select({
      forma: inadimplentes.formaPagamento,
      qtd: sql<number>`COUNT(*)`,
      valor: sql<string>`COALESCE(SUM(${inadimplentes.valorTotal}), 0)`,
    })
    .from(inadimplentes)
    .where(where)
    .groupBy(inadimplentes.formaPagamento)
    .orderBy(desc(sql`COUNT(*)`));
  const porStatus = await db
    .select({
      status: inadimplentes.status,
      qtd: sql<number>`COUNT(*)`,
      valor: sql<string>`COALESCE(SUM(${inadimplentes.valorTotal}), 0)`,
    })
    .from(inadimplentes)
    .where(where)
    .groupBy(inadimplentes.status)
    .orderBy(desc(sql`COUNT(*)`));
  // 2+ competências: mesParcela contém vírgula ou múltiplas datas separadas por espaço
  const [multiComp] = await db
    .select({ qtd: sql<number>`COUNT(*)` })
    .from(inadimplentes)
    .where(and(
      ...(conditions.length > 0 ? conditions : [sql`1=1`]),
      sql`(${inadimplentes.mesParcela} LIKE '%,%' OR ${inadimplentes.mesParcela} REGEXP '[0-9]/[0-9][0-9] [0-9]')`
    ));
  // 12 primeiras parcelas: clientes com apenas 1 competência em aberto E status não PAGO
  // (indicando que é a primeira vez que aparecem na lista de inadimplentes)
  const [primParcelas] = await db
    .select({ qtd: sql<number>`COUNT(*)` })
    .from(inadimplentes)
    .where(and(
      ...(conditions.length > 0 ? conditions : [sql`1=1`]),
      sql`${inadimplentes.status} NOT IN ('PAGO', 'DESISTIU')`,
      sql`(${inadimplentes.mesParcela} NOT LIKE '%,%' AND ${inadimplentes.mesParcela} NOT REGEXP '[0-9]/[0-9][0-9] [0-9]')`
    ));
  const total = row?.total ?? 0;
  const totalValor = parseFloat(row?.totalValor ?? "0");
  return {
    total,
    totalValor,
    valorRecuperado: parseFloat(row?.valorRecuperado ?? "0"),
    ticketMedio: total > 0 ? totalValor / total : 0,
    pagos: row?.pagos ?? 0,
    boleto: row?.boleto ?? 0,
    emContato: row?.emContato ?? 0,
    desistiu: row?.desistiu ?? 0,
    especial: row?.especial ?? 0,
    pendente: row?.pendente ?? 0,
    maisDeUmaCompetencia: multiComp?.qtd ?? 0,
    primeirasParcelas: primParcelas?.qtd ?? 0,
    porFormaPagamento: porForma.map(f => ({
      forma: f.forma ?? 'Não informado',
      qtd: f.qtd,
      valor: parseFloat(f.valor),
      pct: total > 0 ? (f.qtd / total) : 0,
    })),
    porStatus: porStatus.map(s => ({
      status: s.status ?? 'PENDENTE',
      qtd: s.qtd,
      valor: parseFloat(s.valor),
    })),
  };
}

export async function atualizarStatusInadimplente(id: number, status: string, historico?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  const updateData: Record<string, unknown> = { status };
  if (historico !== undefined) updateData.historicoCobranca = historico;
  await db.update(inadimplentes).set(updateData).where(eq(inadimplentes.id, id));
}

export async function criarInadimplente(data: Partial<InsertInadimplente> & { mes: number; ano: number; nome: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  // Sanitizar: converter strings vazias em null, garantir uploadId padrão para cadastros manuais
  const sanitized = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v === "" ? null : v])
  ) as InsertInadimplente;
  if (!sanitized.uploadId) sanitized.uploadId = 0;
  const [result] = await db.insert(inadimplentes).values(sanitized).$returningId();
  return result.id;
}

export async function atualizarInadimplente(id: number, data: Partial<InsertInadimplente>) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  // Sanitizar: converter strings vazias em null
  const sanitized = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v === "" ? null : v])
  ) as Partial<InsertInadimplente>;
  await db.update(inadimplentes).set(sanitized as Record<string, unknown>).where(eq(inadimplentes.id, id));
}

export async function excluirInadimplente(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  await db.delete(inadimplentes).where(eq(inadimplentes.id, id));
}

export async function resumoAnualInadimplentes(ano: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      mes: inadimplentes.mes,
      total: sql<number>`COUNT(*)`,
      totalValor: sql<string>`COALESCE(SUM(${inadimplentes.valorTotal}), 0)`,
      valorRecuperado: sql<string>`COALESCE(SUM(CASE WHEN ${inadimplentes.status} = 'PAGO' THEN ${inadimplentes.valorTotal} ELSE 0 END), 0)`,
      pagos: sql<number>`SUM(CASE WHEN ${inadimplentes.status} = 'PAGO' THEN 1 ELSE 0 END)`,
      emContato: sql<number>`SUM(CASE WHEN ${inadimplentes.status} = 'EM CONTATO' THEN 1 ELSE 0 END)`,
      boleto: sql<number>`SUM(CASE WHEN ${inadimplentes.status} = 'BOLETO' THEN 1 ELSE 0 END)`,
      desistiu: sql<number>`SUM(CASE WHEN ${inadimplentes.status} = 'DESISTIU' THEN 1 ELSE 0 END)`,
    })
    .from(inadimplentes)
    .where(eq(inadimplentes.ano, ano))
    .groupBy(inadimplentes.mes)
    .orderBy(inadimplentes.mes);
  return rows.map(r => ({
    mes: r.mes,
    total: r.total,
    totalValor: parseFloat(r.totalValor),
    valorRecuperado: parseFloat(r.valorRecuperado),
    pagos: r.pagos,
    emContato: r.emContato,
    boleto: r.boleto,
    desistiu: r.desistiu,
    taxaRecuperacao: r.total > 0 ? (r.pagos / r.total) * 100 : 0,
  }));
}

// ─── COMISSÕES PENDENTES: clientes da Base sem comissão no extrato do mês ─────

export async function comissoesPendentesDetalhado(mes: number, ano: number, vendedor?: string) {
  // Clientes ativos na Base que NÃO aparecem no extrato de comissão do mês/ano
  let query = `
    SELECT 
      c.id, c.nome, c.cpf, c.vendedor, c.produtos, c.contribuicao,
      c.status as statusCliente,
      -- Previsão de comissão: 15% da contribuição (para não-ELISIA)
      CASE WHEN UPPER(COALESCE(c.vendedor,'')) != 'ELISIA' THEN COALESCE(c.contribuicao, 0) * 0.15 ELSE NULL END as previsao15
    FROM clientes c
    WHERE c.status NOT IN ('CANCELADO', 'INATIVO', 'DESISTIU')
      AND c.cpf IS NOT NULL AND c.cpf != ''
      AND NOT EXISTS (
        SELECT 1 FROM extrato_comissao e
        WHERE LPAD(REGEXP_REPLACE(e.cpfCliente, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(e.cpfCliente, '[^0-9]', '')) <= 11, 11, 14), '0') = LPAD(REGEXP_REPLACE(c.cpf, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(c.cpf, '[^0-9]', '')) <= 11, 11, 14), '0')
          AND e.mes = ? AND e.ano = ?
      )
  `;
  const params: (string | number)[] = [mes, ano];
  if (vendedor) { query += ` AND UPPER(COALESCE(c.vendedor,'')) = UPPER(?)`; params.push(vendedor); }
  query += ` ORDER BY c.vendedor, c.nome LIMIT 1000`;
  return queryPool<Record<string, unknown>>(query, params);
}
export async function metricasComissoesPendentes(mes: number, ano: number) {
  const query = `
    SELECT 
      COALESCE(c.vendedor, 'Sem Corretor') as vendedor,
      COUNT(*) as totalPendentes,
      COALESCE(SUM(CASE WHEN UPPER(COALESCE(c.vendedor,'')) != 'ELISIA' THEN COALESCE(c.contribuicao, 0) * 0.15 ELSE 0 END), 0) as totalPrevisao
    FROM clientes c
    WHERE c.status NOT IN ('CANCELADO', 'INATIVO', 'DESISTIU')
      AND c.cpf IS NOT NULL AND c.cpf != ''
      AND NOT EXISTS (
        SELECT 1 FROM extrato_comissao e
        WHERE LPAD(REGEXP_REPLACE(e.cpfCliente, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(e.cpfCliente, '[^0-9]', '')) <= 11, 11, 14), '0') = LPAD(REGEXP_REPLACE(c.cpf, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(c.cpf, '[^0-9]', '')) <= 11, 11, 14), '0')
          AND e.mes = ? AND e.ano = ?
      )
    GROUP BY COALESCE(c.vendedor, 'Sem Corretor')
    ORDER BY totalPendentes DESC
  `;
  return queryPool<Record<string, unknown>>(query, [mes, ano]);
}

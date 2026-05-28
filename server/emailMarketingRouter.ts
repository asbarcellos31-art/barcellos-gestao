import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import mysql from "mysql2/promise";
import {
  listarTemplates, criarTemplate, atualizarTemplate, excluirTemplate, buscarTemplate, duplicarTemplate,
  listarListas, criarLista, excluirLista, inserirContatos, listarContatos,
  listarCampanhas, criarCampanha, atualizarCampanha, excluirCampanha, buscarCampanha, duplicarCampanha,
  listarEnviosCampanha, marcarEnvioSucesso, marcarEnvioErro,
  registrarAbertura, listarAberturasCampanha,
} from "./emailMarketingDb";
import { getDb } from "./db";
import { emailEnvios, emailContatos } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { resolverCorpoTemplate } from "./emailBlocosHtml";
import { storagePut } from "./storage";

// Pool mysql2/promise para queries raw com parâmetros
const rawPool = mysql.createPool({
  uri: process.env.DATABASE_URL!,
  connectionLimit: 5,
  enableKeepAlive: true,
});
async function rawQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await rawPool.execute(sql, params);
  return rows as T[];
}

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── STATUS SENDGRID ─────────────────────────────────────────────────────────
router.get("/email-marketing/status", (_req, res) => {
  res.json({ sendgridConfigurado: !!process.env.SENDGRID_API_KEY });
});

// ─── TEMPLATES ───────────────────────────────────────────────────────────────

router.get("/email-marketing/templates", async (_req, res) => {
  try {
    const templates = await listarTemplates();
    res.json(templates);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/email-marketing/templates", async (req, res) => {
  try {
    const { nome, assunto, corpo, saudacao, assinatura } = req.body;
    if (!nome || !assunto || !corpo) return res.status(400).json({ error: "Campos obrigatórios: nome, assunto, corpo" });
    await criarTemplate({ nome, assunto, corpo, saudacao: saudacao || "Olá, {{nome}}!", assinatura: assinatura || "Atenciosamente,\nEquipe Barcellos Seguros" });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/email-marketing/templates/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await atualizarTemplate(id, req.body);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/email-marketing/templates/:id", async (req, res) => {
  try {
    await excluirTemplate(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/email-marketing/templates/:id/duplicar", async (req, res) => {
  try {
    const novoTemplate = await duplicarTemplate(parseInt(req.params.id));
    res.json({ ok: true, id: (novoTemplate as any).insertId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── LISTAS ───────────────────────────────────────────────────────────────────

router.get("/email-marketing/listas", async (_req, res) => {
  try {
    res.json(await listarListas());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/email-marketing/listas", async (req, res) => {
  try {
    const { nome, descricao } = req.body;
    if (!nome) return res.status(400).json({ error: "Nome obrigatório" });
    await criarLista({ nome, descricao, totalContatos: 0 });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/email-marketing/listas/:id", async (req, res) => {
  try {
    await excluirLista(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/email-marketing/listas/:id/contatos", async (req, res) => {
  try {
    res.json(await listarContatos(parseInt(req.params.id)));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Upload de planilha para uma lista
router.post("/email-marketing/listas/:id/upload", upload.single("arquivo"), async (req, res) => {
  try {
    const listaId = parseInt(req.params.id);
    if (!req.file) return res.status(400).json({ error: "Arquivo não enviado" });

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

    if (rows.length === 0) return res.status(400).json({ error: "Planilha vazia" });

    // Detectar colunas de nome e email (case-insensitive)
    const keys = Object.keys(rows[0]);
    const colNome = keys.find(k => /nome/i.test(k)) ?? keys[0];
    const colEmail = keys.find(k => /e.?mail/i.test(k)) ?? "";
    const colCpf = keys.find(k => /cpf/i.test(k)) ?? "";
    const colTel = keys.find(k => /tel|fone|celular/i.test(k)) ?? "";

    if (!colEmail) return res.status(400).json({ error: "Coluna de e-mail não encontrada na planilha" });

    const contatos = rows
      .filter(r => r[colEmail] && String(r[colEmail]).includes("@"))
      .map(r => ({
        nome: String(r[colNome] ?? "").trim(),
        email: String(r[colEmail]).trim().toLowerCase(),
        cpf: colCpf ? String(r[colCpf] ?? "").trim() : undefined,
        telefone: colTel ? String(r[colTel] ?? "").trim() : undefined,
        dadosExtras: JSON.stringify(r),
      }));

    await inserirContatos(listaId, contatos);
    res.json({ ok: true, totalImportados: contatos.length, totalLinhas: rows.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Metadados da Base de Clientes para popular filtros (produtos, cidades, vendedores)
router.get("/email-marketing/base-metadados", async (_req, res) => {
  try {
    const prodRows = await rawQuery(
      `SELECT p.codigo, p.descricao FROM produtos p
       INNER JOIN cliente_produtos cp ON cp.produtoId = p.id
       GROUP BY p.id ORDER BY p.descricao`
    );
    const cidadeRows = await rawQuery(
      `SELECT DISTINCT cidade FROM clientes WHERE cidade IS NOT NULL AND cidade != '' ORDER BY cidade`
    );
    const vendedorRows = await rawQuery(
      `SELECT DISTINCT vendedor FROM clientes WHERE vendedor IS NOT NULL AND vendedor != '' AND vendedor != '*VENDEDOR NÃO INFORMADO*' ORDER BY vendedor`
    );
    res.json({
      produtos: (prodRows || []).map((r: any) => ({ codigo: r.codigo, descricao: r.descricao })),
      cidades: (cidadeRows || []).map((r: any) => r.cidade).filter(Boolean),
      vendedores: (vendedorRows || []).map((r: any) => r.vendedor).filter(Boolean),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Contar registros que seriam importados com os filtros (pré-visualização)
router.post("/email-marketing/listas/:id/preview-count", async (req, res) => {
  try {
    const {
      status = "ativo", produtoCodigo, cidade, vendedor,
      idadeMin, idadeMax, contribuicaoMin, contribuicaoMax, sexo,
    } = req.body as any;
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    let queryStr: string;
    const params: any[] = [];
    if (produtoCodigo && produtoCodigo.trim()) {
      queryStr = `SELECT COUNT(DISTINCT c.id) as total FROM clientes c
        INNER JOIN cliente_produtos cp ON cp.clienteId = c.id
        INNER JOIN produtos p ON p.id = cp.produtoId AND p.codigo = ?
        WHERE c.email IS NOT NULL AND c.email != ''`;
      params.push(produtoCodigo.trim());
    } else {
      queryStr = `SELECT COUNT(DISTINCT c.id) as total FROM clientes c WHERE c.email IS NOT NULL AND c.email != ''`;
    }
    if (status === "ativo") queryStr += " AND LOWER(c.status) = 'ativo'";
    else if (status === "inativo") queryStr += " AND (c.status IS NULL OR c.status != 'Ativo')";
    if (cidade && cidade.trim()) { queryStr += " AND c.cidade = ?"; params.push(cidade.trim()); }
    if (vendedor && vendedor.trim()) { queryStr += " AND c.vendedor = ?"; params.push(vendedor.trim()); }
    if (idadeMin !== undefined && idadeMin !== null) { queryStr += " AND TIMESTAMPDIFF(YEAR, c.dataNascimento, CURDATE()) >= ?"; params.push(Number(idadeMin)); }
    if (idadeMax !== undefined && idadeMax !== null) { queryStr += " AND TIMESTAMPDIFF(YEAR, c.dataNascimento, CURDATE()) <= ?"; params.push(Number(idadeMax)); }
    if (contribuicaoMin !== undefined && contribuicaoMin !== null) { queryStr += " AND c.contribuicao >= ?"; params.push(Number(contribuicaoMin)); }
    if (contribuicaoMax !== undefined && contribuicaoMax !== null) { queryStr += " AND c.contribuicao <= ?"; params.push(Number(contribuicaoMax)); }
    if (sexo && sexo.trim()) { queryStr += " AND c.sexo = ?"; params.push(sexo.trim()); }
    const countRows = await rawQuery(queryStr, params);
    const total = (countRows as any[])[0]?.total ?? 0;
    res.json({ total: Number(total) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Importar contatos da Base de Clientes com filtros avançados
router.post("/email-marketing/listas/:id/importar-base", async (req, res) => {
  try {
    const listaId = parseInt(req.params.id);
    const {
      status = "ativo",
      produtoCodigo,        // código do produto (ex: "2117")
      cidade,               // cidade exata
      vendedor,             // vendedor exato
      idadeMin,             // faixa etária mínima (anos)
      idadeMax,             // faixa etária máxima (anos)
      contribuicaoMin,      // valor mínimo de contribuição
      contribuicaoMax,      // valor máximo de contribuição
      sexo,
    } = req.body as {
      status?: string;
      produtoCodigo?: string;
      cidade?: string;
      vendedor?: string;
      idadeMin?: number;
      idadeMax?: number;
      contribuicaoMin?: number;
      contribuicaoMax?: number;
      sexo?: string;
    };
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");

    // Base da query — join com cliente_produtos/produtos se filtrar por produto
    let queryStr: string;
    const params: any[] = [];

    // Sempre usar alias 'c' para consistência
    if (produtoCodigo && produtoCodigo.trim()) {
      queryStr = `SELECT DISTINCT c.nome, c.email, c.cpf, c.telefone, c.celular, c.produtos as produtoCliente, c.dataNascimento, c.contribuicao
        FROM clientes c
        INNER JOIN cliente_produtos cp ON cp.clienteId = c.id
        INNER JOIN produtos p ON p.id = cp.produtoId AND p.codigo = ?
        WHERE c.email IS NOT NULL AND c.email != ''`;
      params.push(produtoCodigo.trim());
    } else {
      queryStr = `SELECT DISTINCT c.nome, c.email, c.cpf, c.telefone, c.celular, c.produtos as produtoCliente, c.dataNascimento, c.contribuicao
        FROM clientes c
        WHERE c.email IS NOT NULL AND c.email != ''`;
    }

    if (status === "ativo") { queryStr += " AND LOWER(c.status) = 'ativo'"; }
    else if (status === "inativo") { queryStr += " AND (c.status IS NULL OR c.status != 'Ativo')"; }

    if (cidade && cidade.trim()) {
      queryStr += " AND c.cidade = ?";
      params.push(cidade.trim());
    }
    if (vendedor && vendedor.trim()) {
      queryStr += " AND c.vendedor = ?";
      params.push(vendedor.trim());
    }
    if (idadeMin !== undefined && idadeMin !== null) {
      queryStr += " AND TIMESTAMPDIFF(YEAR, c.dataNascimento, CURDATE()) >= ?";
      params.push(Number(idadeMin));
    }
    if (idadeMax !== undefined && idadeMax !== null) {
      queryStr += " AND TIMESTAMPDIFF(YEAR, c.dataNascimento, CURDATE()) <= ?";
      params.push(Number(idadeMax));
    }
    if (contribuicaoMin !== undefined && contribuicaoMin !== null) {
      queryStr += " AND c.contribuicao >= ?";
      params.push(Number(contribuicaoMin));
    }
    if (contribuicaoMax !== undefined && contribuicaoMax !== null) {
      queryStr += " AND c.contribuicao <= ?";
      params.push(Number(contribuicaoMax));
    }
    if (sexo && sexo.trim()) {
      queryStr += " AND c.sexo = ?";
      params.push(sexo.trim());
    }

    const clientes = await rawQuery(queryStr, params);
    if (clientes.length === 0) return res.json({ ok: true, importados: 0, ignorados: 0 });
    // Evitar duplicatas
    const existentes = await listarContatos(listaId);
    const emailsExistentes = new Set(existentes.map((c: any) => c.email?.toLowerCase()));
    const novos = clientes
      .filter((c: any) => c.email && !emailsExistentes.has(c.email.toLowerCase()))
      .map((c: any) => ({
        nome: c.nome ?? "",
        email: c.email.trim().toLowerCase(),
        cpf: c.cpf ?? undefined,
        telefone: c.telefone ?? c.celular ?? undefined,
        dadosExtras: JSON.stringify({ produto: c.produtoCliente }),
      }));
    if (novos.length > 0) await inserirContatos(listaId, novos);
    res.json({ ok: true, importados: novos.length, ignorados: clientes.length - novos.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── CAMPANHAS ────────────────────────────────────────────────────────────────

router.get("/email-marketing/campanhas", async (_req, res) => {
  try {
    res.json(await listarCampanhas());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** Converte string datetime-local (sem timezone) para Date interpretando como Brasília (UTC-3) */
function parseDatetimeLocalBrasilia(str: string): Date {
  // str = '2026-03-12T17:20' ou '2026-03-12T17:20:00'
  // Adiciona offset de Brasília (-03:00) para garantir interpretação correta
  const normalized = str.length === 16 ? str + ':00' : str;
  return new Date(normalized + '-03:00');
}

router.post("/email-marketing/campanhas", async (req, res) => {
  try {
    const { nome, templateId, listaId, remetente, nomeRemetente, dataAgendadaLocal } = req.body;
    if (!nome || !templateId || !listaId) return res.status(400).json({ error: "Campos obrigatórios: nome, templateId, listaId" });
    const contatos = await listarContatos(parseInt(listaId));
    // Se dataAgendadaLocal foi fornecida, interpreta como Brasília (UTC-3) e cria como AGENDADA
    const statusInicial = dataAgendadaLocal ? "AGENDADA" : "RASCUNHO";
    const dataAgendadaDate = dataAgendadaLocal ? parseDatetimeLocalBrasilia(dataAgendadaLocal) : undefined;
    await criarCampanha({
      nome,
      templateId: parseInt(templateId),
      listaId: parseInt(listaId),
      totalDestinatarios: contatos.length,
      totalEnviados: 0,
      totalErros: 0,
      remetente: remetente || process.env.SENDGRID_FROM_EMAIL || "atendimento@barcellosseguros.com",
      nomeRemetente: nomeRemetente || "Barcellos Seguros",
      status: statusInicial,
      dataAgendada: dataAgendadaDate,
    });
    res.json({ ok: true, status: statusInicial });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/email-marketing/campanhas/:id", async (req, res) => {
  try {
    const { dataAgendadaLocal, ...rest } = req.body;
    const updateData: any = { ...rest };
    // Se dataAgendadaLocal foi enviado, converte para Date interpretando como Brasília (UTC-3)
    if (dataAgendadaLocal) {
      updateData.dataAgendada = parseDatetimeLocalBrasilia(dataAgendadaLocal);
    }
    await atualizarCampanha(parseInt(req.params.id), updateData);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/email-marketing/campanhas/:id", async (req, res) => {
  try {
    await excluirCampanha(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/email-marketing/campanhas/:id/duplicar", async (req, res) => {
  try {
    const novaCampanha = await duplicarCampanha(parseInt(req.params.id));
    res.json({ ok: true, id: (novaCampanha as any).insertId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/email-marketing/campanhas/:id/envios", async (req, res) => {
  try {
    res.json(await listarEnviosCampanha(parseInt(req.params.id)));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Prévia da campanha — retorna amostra de e-mails com variáveis substituídas
router.get("/email-marketing/campanhas/:id/preview", async (req, res) => {
  try {
    const campanha = await buscarCampanha(parseInt(req.params.id));
    if (!campanha) return res.status(404).json({ error: "Campanha não encontrada" });
    const template = await buscarTemplate(campanha.templateId);
    if (!template) return res.status(404).json({ error: "Template não encontrado" });
    const contatos = await listarContatos(campanha.listaId);
    const amostra = contatos.slice(0, 3).map(c => {
      const corpoHtml = resolverCorpoTemplate(
        template.corpo,
        template.saudacao,
        template.assinatura
      );
      return {
        nome: c.nome,
        email: c.email,
        assunto: template.assunto.replace(/\{\{nome\}\}/gi, c.nome),
        corpo: corpoHtml.replace(/\{\{nome\}\}/gi, c.nome),
      };
    });
    res.json({
      campanha,
      template,
      totalDestinatarios: contatos.length,
      amostra,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Disparar campanha (requer SENDGRID_API_KEY)
router.post("/email-marketing/campanhas/:id/disparar", async (req, res) => {
  try {
    const campanhaId = parseInt(req.params.id);
    const campanha = await buscarCampanha(campanhaId);
    if (!campanha) return res.status(404).json({ error: "Campanha não encontrada" });
    if (campanha.status !== "RASCUNHO" && campanha.status !== "AGENDADA") {
      return res.status(400).json({ error: `Campanha já está com status: ${campanha.status}` });
    }

    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) return res.status(400).json({ error: "SENDGRID_API_KEY não configurada. Configure nas variáveis de ambiente do sistema." });

    const template = await buscarTemplate(campanha.templateId);
    if (!template) return res.status(404).json({ error: "Template não encontrado" });
    const contatos = await listarContatos(campanha.listaId);
    if (contatos.length === 0) return res.status(400).json({ error: "Lista sem contatos" });

    // Marcar como enviando
    await atualizarCampanha(campanhaId, { status: "ENVIANDO", dataInicio: new Date() });

    // Inserir registros de envio pendentes
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const envioRows = contatos.map(c => ({
      campanhaId,
      contatoId: c.id,
      email: c.email,
      status: "PENDENTE" as const,
    }));
    for (let i = 0; i < envioRows.length; i += 500) {
      await db.insert(emailEnvios).values(envioRows.slice(i, i + 500));
    }

    // Disparar em background
    res.json({ ok: true, totalDestinatarios: contatos.length, mensagem: "Disparo iniciado em background" });

    // Processar envios assincronamente com tratamento de erro
    (async () => {
      let enviados = 0;
      let erros = 0;
      try {
        const enviosDb = await listarEnviosCampanha(campanhaId);
        // Mapear envios por contatoId para garantir correspondência correta
        const enviosPorContatoId = new Map(enviosDb.map((e: any) => [e.contatoId, e]));

      // Busca o WhatsApp geral configurado no sistema
      let whatsappGeralLink = "https://wa.me/554833726890";
      try {
        const dbWa = await getDb();
        if (dbWa) {
          const { sql } = await import("drizzle-orm");
          const waRows = await dbWa.execute(
            sql`SELECT valor FROM system_config WHERE chave = 'whatsapp_geral' LIMIT 1`
          ) as any[];
          if (waRows.length > 0 && waRows[0].valor) {
            let num = String(waRows[0].valor).replace(/\D/g, "");
            if (num.startsWith("550") && num.length > 12) num = "55" + num.slice(3);
            whatsappGeralLink = `https://wa.me/${num}?text=${encodeURIComponent("Ol\u00e1! Gostaria de saber mais sobre o seguro DIT para m\u00e9dicos.")}`;
          }
        }
      } catch (_e) { /* usa o padr\u00e3o */ }

      for (let i = 0; i < contatos.length; i++) {
        const contato = contatos[i];
        const envio = enviosPorContatoId.get(contato.id);
        if (!envio) continue; // pular se não encontrar registro de envio
        const assunto = template.assunto.replace(/\{\{nome\}\}/gi, contato.nome);
        const corpoHtmlResolvido = resolverCorpoTemplate(
          template.corpo,
          template.saudacao,
          template.assinatura
        );
        const corpoBase = corpoHtmlResolvido
          .replace(/\{\{nome\}\}/gi, contato.nome)
          .replace(/\{\{whatsapp_link\}\}/gi, whatsappGeralLink);
        const appUrl = (process.env.PUBLIC_BASE_URL || process.env.APP_URL || 'https://app.barcellosseguros.com.br').replace(/\/+$/, '');
        const pixelTag = `<img src="${appUrl}/api/email-marketing/track/open/${envio.id}" width="1" height="1" style="display:none" alt="" />`;
        const corpo = corpoBase.includes('</body>')
          ? corpoBase.replace(/<\/body>/i, `${pixelTag}</body>`)
          : corpoBase + pixelTag;
        try {
          // Sanitizar email
          const emailLimpo = (contato.email || "").trim().toLowerCase();
          if (!emailLimpo || !emailLimpo.includes("@")) {
            await marcarEnvioErro(envio.id, "Email inválido");
            erros++;
            continue;
          }
          
          // Montar payload com ou sem anexo
          const sgPayload: any = {
            personalizations: [{ to: [{ email: emailLimpo, name: contato.nome }] }],
            from: { email: campanha.remetente, name: campanha.nomeRemetente },
            subject: assunto || "Barcellos Seguros",
            content: [{ type: "text/html", value: corpo }],
            tracking_settings: {
              open_tracking: { enable: true },
              click_tracking: { enable: true, enable_text: false },
            },
          };
          // Adicionar anexo se existir
          if (campanha.anexoUrl && campanha.anexoNome) {
            try {
              const anexoResp = await fetch(campanha.anexoUrl);
              if (anexoResp.ok) {
                const anexoBuffer = await anexoResp.arrayBuffer();
                const anexoBase64 = Buffer.from(anexoBuffer).toString("base64");
                sgPayload.attachments = [{
                  content: anexoBase64,
                  filename: campanha.anexoNome,
                  type: campanha.anexoTipo || "application/octet-stream",
                  disposition: "attachment",
                }];
              }
            } catch (anexoErr) {
              console.error("[EmailMkt] Erro ao baixar anexo:", anexoErr);
            }
          }
          const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(sgPayload),
          });

          if (resp.ok || resp.status === 202) {
            await marcarEnvioSucesso(envio.id);
            enviados++;
          } else {
            const errText = await resp.text();
            console.error(`[EmailMkt] Erro HTTP ${resp.status} para ${emailLimpo}:`, errText.substring(0, 200));
            await marcarEnvioErro(envio.id, `HTTP ${resp.status}: ${errText.substring(0, 100)}`);
            erros++;
          }
        } catch (e: any) {
          await marcarEnvioErro(envio.id, e.message);
          erros++;
        }

        // Atualizar contadores a cada 10 envios
        if ((i + 1) % 10 === 0 || i === contatos.length - 1) {
          await atualizarCampanha(campanhaId, { totalEnviados: enviados, totalErros: erros });
        }

        // Delay de 100ms para não sobrecarregar a API
        await new Promise(r => setTimeout(r, 100));
      }

        await atualizarCampanha(campanhaId, {
          status: "CONCLUIDA",
          dataConclusao: new Date(),
          totalEnviados: enviados,
          totalErros: erros,
        });

        // ─── Relatório pós-disparo para a equipe Barcellos ───
        try {
        const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
        const linhasContatos = contatos
          .map((c, idx) => `<tr style="background:${idx % 2 === 0 ? '#f8faff' : '#fff'}">
            <td style="padding:8px 12px;border-bottom:1px solid #e5eaf5">${c.nome}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5eaf5;color:#6b7280">${c.email}</td>
          </tr>`)
          .join("");
        const relatorioHtml = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f0f4ff">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
  <div style="background:linear-gradient(135deg,#1a2f5e,#2d4a8a);padding:28px 32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:20px">📊 Relatório de Disparo de Campanha</h1>
    <p style="color:#a8c4e8;margin:6px 0 0;font-size:13px">Barcellos Seguros — Sistema de E-mail Marketing</p>
  </div>
  <div style="padding:28px 32px">
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">📋 Campanha:</td><td style="padding:8px 0;font-weight:700;color:#1a2f5e">${campanha.nome}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">📅 Data/Hora:</td><td style="padding:8px 0;font-weight:600">${dataHora}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">✅ Enviados:</td><td style="padding:8px 0;font-weight:700;color:#16a34a">${enviados}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">❌ Erros:</td><td style="padding:8px 0;font-weight:700;color:${erros > 0 ? '#dc2626' : '#6b7280'}">${erros}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">👥 Total destinatários:</td><td style="padding:8px 0;font-weight:600">${contatos.length}</td></tr>
    </table>
    <h3 style="color:#1a2f5e;font-size:15px;margin:0 0 12px">Lista de destinatários:</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#1a2f5e"><th style="padding:10px 12px;color:#fff;text-align:left">Nome</th><th style="padding:10px 12px;color:#fff;text-align:left">E-mail</th></tr></thead>
      <tbody>${linhasContatos}</tbody>
    </table>
  </div>
  <div style="background:#f8faff;padding:16px 32px;text-align:center;border-top:1px solid #e5eaf5">
    <p style="font-size:11px;color:#aaa;margin:0">Barcellos Seguros — Sistema de Gestão Interno</p>
  </div>
</div></body></html>`;

        const emailsEquipe = [
          { email: "anderson@barcellosseguros.com", name: "Anderson" },
          { email: "nayara@barcellosseguros.com", name: "Nayara" },
        ];
        for (const dest of emailsEquipe) {
          await fetch("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              personalizations: [{ to: [dest] }],
              from: { email: campanha.remetente, name: campanha.nomeRemetente },
              subject: `📊 Relatório: ${campanha.nome} — ${enviados} enviados`,
              content: [{ type: "text/html", value: relatorioHtml }],
            }),
          });
        }
        console.log(`[EmailMkt] Relatório pós-disparo enviado para a equipe.`);
        } catch (relErr) {
          console.error("[EmailMkt] Erro ao enviar relatório:", relErr);
        }
      } catch (fatalErr: any) {
        console.error("[EmailMkt] Erro fatal no disparo de campanha:", fatalErr);
        await atualizarCampanha(campanhaId, {
          status: "CANCELADA",
          dataConclusao: new Date(),
        }).catch(() => {});
      }
      // ─────────────────────────────────────────────────────────
    })().catch(console.error);

  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Retomar envio de campanha interrompida (envia apenas os PENDENTES)
router.post("/email-marketing/campanhas/:id/retomar", async (req, res) => {
  try {
    const campanhaId = parseInt(req.params.id);
    const campanha = await buscarCampanha(campanhaId);
    if (!campanha) return res.status(404).json({ error: "Campanha não encontrada" });
    if (campanha.status !== "ENVIANDO") {
      return res.status(400).json({ error: `Só é possível retomar campanhas com status ENVIANDO. Status atual: ${campanha.status}` });
    }

    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) return res.status(400).json({ error: "SENDGRID_API_KEY não configurada." });

    const template = await buscarTemplate(campanha.templateId);
    if (!template) return res.status(404).json({ error: "Template não encontrado" });

    // Buscar apenas envios PENDENTES
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const { sql: drizzleSql } = await import("drizzle-orm");
    const [pendentesRows]: any = await db.execute(
      drizzleSql`SELECT ee.id as envioId, ee.email, ec.nome
        FROM email_envios ee
        LEFT JOIN email_contatos ec ON ec.id = ee.contatoId
        WHERE ee.campanhaId = ${campanhaId} AND ee.status = 'PENDENTE'`
    );
    const pendentes = pendentesRows || [];

    if (pendentes.length === 0) {
      // Nenhum pendente — marcar como concluída
      const [countRows]: any = await db.execute(
        drizzleSql`SELECT COUNT(*) as total, SUM(CASE WHEN status='ENVIADO' THEN 1 ELSE 0 END) as enviados, SUM(CASE WHEN status='ERRO' THEN 1 ELSE 0 END) as erros FROM email_envios WHERE campanhaId = ${campanhaId}`
      );
      const counts = countRows?.[0] || {};
      await atualizarCampanha(campanhaId, {
        status: "CONCLUIDA",
        dataConclusao: new Date(),
        totalEnviados: Number(counts.enviados) || 0,
        totalErros: Number(counts.erros) || 0,
      });
      return res.json({ ok: true, mensagem: "Nenhum pendente. Campanha marcada como concluída.", retomados: 0 });
    }

    res.json({ ok: true, totalPendentes: pendentes.length, mensagem: `Retomando envio de ${pendentes.length} emails pendentes em background` });

    // Processar em background
    (async () => {
      let enviados = campanha.totalEnviados || 0;
      let erros = campanha.totalErros || 0;
      try {
        let whatsappGeralLink = "https://wa.me/554833726890";
        try {
          const dbWa = await getDb();
          if (dbWa) {
            const { sql: s } = await import("drizzle-orm");
            const waRows = await dbWa.execute(s`SELECT valor FROM system_config WHERE chave = 'whatsapp_geral' LIMIT 1`) as any[];
            if (waRows.length > 0 && waRows[0].valor) {
              let num = String(waRows[0].valor).replace(/\D/g, "");
              if (num.startsWith("550") && num.length > 12) num = "55" + num.slice(3);
              whatsappGeralLink = `https://wa.me/${num}?text=${encodeURIComponent("Olá! Gostaria de saber mais sobre o seguro DIT para médicos.")}`;
            }
          }
        } catch (_e) {}

        const appUrl = (process.env.PUBLIC_BASE_URL || process.env.APP_URL || 'https://app.barcellosseguros.com.br').replace(/\/+$/, '');
        for (let i = 0; i < pendentes.length; i++) {
          const p = pendentes[i];
          const assunto = template.assunto.replace(/\{\{nome\}\}/gi, p.nome || '');
          const corpoHtmlResolvido = resolverCorpoTemplate(template.corpo, template.saudacao, template.assinatura);
          const corpoBase = corpoHtmlResolvido
            .replace(/\{\{nome\}\}/gi, p.nome || '')
            .replace(/\{\{whatsapp_link\}\}/gi, whatsappGeralLink);
          const pixelTag = `<img src="${appUrl}/api/email-marketing/track/open/${p.envioId}" width="1" height="1" style="display:none" alt="" />`;
          const corpo = corpoBase.includes('</body>') ? corpoBase.replace(/<\/body>/i, `${pixelTag}</body>`) : corpoBase + pixelTag;
          try {
            const sgPayload: any = {
              personalizations: [{ to: [{ email: p.email, name: p.nome || '' }] }],
              from: { email: campanha.remetente, name: campanha.nomeRemetente },
              subject: assunto,
              content: [{ type: "text/html", value: corpo }],
              tracking_settings: {
                open_tracking: { enable: true },
                click_tracking: { enable: true, enable_text: false },
              },
            };
            if (campanha.anexoUrl && campanha.anexoNome) {
              try {
                const anexoResp = await fetch(campanha.anexoUrl);
                if (anexoResp.ok) {
                  const anexoBuffer = await anexoResp.arrayBuffer();
                  sgPayload.attachments = [{ content: Buffer.from(anexoBuffer).toString("base64"), filename: campanha.anexoNome, type: campanha.anexoTipo || "application/octet-stream", disposition: "attachment" }];
                }
              } catch (_e) {}
            }
            const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
              method: "POST",
              headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify(sgPayload),
            });
            if (resp.ok || resp.status === 202) {
              await marcarEnvioSucesso(p.envioId);
              enviados++;
            } else {
              const errText = await resp.text();
              await marcarEnvioErro(p.envioId, errText);
              erros++;
            }
          } catch (e: any) {
            await marcarEnvioErro(p.envioId, e.message);
            erros++;
          }
          if ((i + 1) % 10 === 0 || i === pendentes.length - 1) {
            await atualizarCampanha(campanhaId, { totalEnviados: enviados, totalErros: erros });
          }
          await new Promise(r => setTimeout(r, 100));
        }
        await atualizarCampanha(campanhaId, { status: "CONCLUIDA", dataConclusao: new Date(), totalEnviados: enviados, totalErros: erros });
        console.log(`[EmailMkt] Retomada concluída: ${enviados} enviados, ${erros} erros`);
      } catch (fatalErr: any) {
        console.error("[EmailMkt] Erro fatal ao retomar campanha:", fatalErr);
      }
    })().catch(console.error);

  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── SEGMENTO TEMPLATES ─────────────────────────────────────────────────────

router.get("/email-marketing/segmento-templates", async (_req, res) => {
  try {
    const rows = await rawQuery("SELECT * FROM segmento_templates ORDER BY createdAt DESC");
    res.json((rows || []).map((r: any) => ({ ...r, filtros: JSON.parse(r.filtros || '{}') })));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/email-marketing/segmento-templates", async (req, res) => {
  try {
    const { nome, filtros } = req.body;
    if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
    await rawQuery("INSERT INTO segmento_templates (nome, filtros) VALUES (?, ?)", [nome, JSON.stringify(filtros || {})]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/email-marketing/segmento-templates/:id", async (req, res) => {
  try {
    await rawQuery("DELETE FROM segmento_templates WHERE id = ?", [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── UPLOAD DE ANEXO PARA CAMPANHA ─────────────────────────────────────────
const uploadAnexo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post("/email-marketing/campanhas/:id/anexo", uploadAnexo.single("arquivo"), async (req, res) => {
  try {
    const campanhaId = parseInt(req.params.id);
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
    const { originalname, mimetype, buffer } = req.file;
    const ext = originalname.split(".").pop() || "bin";
    const key = `email-anexos/campanha-${campanhaId}-${Date.now()}.${ext}`;
    const { url } = await storagePut(key, buffer, mimetype);
    await atualizarCampanha(campanhaId, { anexoUrl: url, anexoNome: originalname, anexoTipo: mimetype });
    res.json({ ok: true, url, nome: originalname, tipo: mimetype });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/email-marketing/campanhas/:id/anexo", async (req, res) => {
  try {
    const campanhaId = parseInt(req.params.id);
    await atualizarCampanha(campanhaId, { anexoUrl: null as any, anexoNome: null as any, anexoTipo: null as any });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── PIXEL DE RASTREAMENTO DE ABERTURA ─────────────────────────────────────
// Pixel 1x1 transparente — registra abertura quando o cliente de e-mail carrega a imagem
router.get("/email-marketing/track/open/:envioId", async (req, res) => {
  try {
    const envioId = parseInt(req.params.envioId);
    if (!isNaN(envioId)) await registrarAbertura(envioId);
  } catch (_e) { /* silencioso */ }
  // Retornar pixel 1x1 transparente
  const pixel = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64"
  );
  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.send(pixel);
});

// Listar aberturas de uma campanha
router.get("/email-marketing/campanhas/:id/aberturas", async (req, res) => {
  try {
    const campanhaId = parseInt(req.params.id);
    const rows = await listarAberturasCampanha(campanhaId);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── SINCRONIZAR ABERTURAS DO SENDGRID ─────────────────────────────────────
// Busca aberturas em lote via date-range (máx 7 páginas de 1000) em vez de 1 req/email
router.post("/email-marketing/campanhas/:id/sincronizar-sendgrid", async (req, res) => {
  try {
    const campanhaId = parseInt(req.params.id);
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) return res.status(400).json({ error: "SENDGRID_API_KEY não configurada" });

    const campanha = await buscarCampanha(campanhaId);
    if (!campanha) return res.status(404).json({ error: "Campanha não encontrada" });

    const envios = await listarAberturasCampanha(campanhaId);
    if (!envios || envios.length === 0) return res.json({ atualizados: 0, total: 0 });

    // Mapa email → { envioId, aberturas atuais }
    const emailMap = new Map<string, { id: number; aberturas: number }>();
    for (const e of envios as any[]) {
      if (e.email) emailMap.set(e.email.toLowerCase().trim(), { id: e.id, aberturas: e.aberturas || 0 });
    }

    // Intervalo de busca: dataInicio da campanha até hoje + 7 dias de margem
    const inicio: Date = (campanha as any).dataInicio || (campanha as any).createdAt || new Date(Date.now() - 30 * 86400000);
    const fim = new Date();
    fim.setDate(fim.getDate() + 1);
    const inicioISO = inicio.toISOString().slice(0, 19).replace('T', ' ');
    const fimISO = fim.toISOString().slice(0, 19).replace('T', ' ');

    // Pagina pela Activity Feed do SendGrid em blocos de 1000
    const abreMap = new Map<string, number>(); // email → max opens_count
    let offset = 0;
    const limit = 1000;
    let paginasLidas = 0;

    while (paginasLidas < 20) { // teto de segurança: 20.000 mensagens
      const query = encodeURIComponent(
        `last_event_time BETWEEN TIMESTAMP "${inicioISO}" AND TIMESTAMP "${fimISO}"`
      );
      const sgResp = await fetch(
        `https://api.sendgrid.com/v3/messages?limit=${limit}&offset=${offset}&query=${query}`,
        { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } }
      );

      if (!sgResp.ok) {
        const errText = await sgResp.text();
        // Se a API de Activity não estiver habilitada no plano, retorna aviso amigável
        return res.status(200).json({
          atualizados: 0, total: envios.length,
          aviso: `SendGrid Activity Feed não disponível neste plano (HTTP ${sgResp.status}). Ative "Email Activity Feed" nas configurações do SendGrid.`,
        });
      }

      const sgData: any = await sgResp.json();
      const messages: any[] = sgData.messages || [];

      for (const msg of messages) {
        const email = (msg.to_email || '').toLowerCase().trim();
        if (!email || !emailMap.has(email)) continue;
        const opens = msg.opens_count || 0;
        if (opens > 0) abreMap.set(email, Math.max(abreMap.get(email) || 0, opens));
      }

      paginasLidas++;
      if (messages.length < limit) break;
      offset += limit;
    }

    // Atualiza banco apenas onde encontrou aberturas maiores que o atual
    const db = await getDb();
    let atualizados = 0;
    for (const [email, opens] of abreMap) {
      const envio = emailMap.get(email);
      if (!envio || opens <= envio.aberturas) continue;
      if (db) {
        await db.execute(
          sql`UPDATE email_envios SET aberturas = ${opens}, abertoPrimeiramente = COALESCE(abertoPrimeiramente, NOW()) WHERE id = ${envio.id}`
        );
        atualizados++;
      }
    }

    res.json({ atualizados, total: envios.length, encontradosSendGrid: abreMap.size });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── CRIAR LISTA A PARTIR DE ABERTURAS ─────────────────────────────────────

// Cria uma lista com quem abriu (ou não abriu) uma campanha
router.post("/email-marketing/campanhas/:id/criar-lista-aberturas", async (req, res) => {
  try {
    const campanhaId = parseInt(req.params.id);
    const { tipo, nomeLista } = req.body; // tipo: 'abriram' | 'nao_abriram'
    if (!tipo || !nomeLista) return res.status(400).json({ error: "tipo e nomeLista são obrigatórios" });

    // Buscar campanha para nome
    const campanha = await buscarCampanha(campanhaId);
    if (!campanha) return res.status(404).json({ error: "Campanha não encontrada" });

    // Buscar envios filtrados
    const todos = await listarAberturasCampanha(campanhaId);
    const filtrados = tipo === 'abriram'
      ? todos.filter((e: any) => e.aberturas > 0)
      : todos.filter((e: any) => e.status === 'ENVIADO' && e.aberturas === 0);

    if (filtrados.length === 0) {
      return res.status(400).json({ error: "Nenhum contato encontrado para este filtro" });
    }

    // Criar nova lista
    const result: any = await criarLista({
      nome: nomeLista,
      descricao: `Gerada automaticamente da campanha "${campanha.nome}" — ${tipo === 'abriram' ? 'quem abriu' : 'quem não abriu'}`,
      totalContatos: 0,
    } as any);
    const novaListaId = result.insertId;

    // Inserir contatos
    const contatos = filtrados.map((e: any) => ({
      nome: e.contatoNome || e.email,
      email: e.email,
    }));
    await inserirContatos(novaListaId, contatos);

    res.json({ ok: true, listaId: novaListaId, total: contatos.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Exportar relatório de aberturas como Excel
router.get("/email-marketing/campanhas/:id/exportar-aberturas", async (req, res) => {
  try {
    const campanhaId = parseInt(req.params.id);
    const campanha = await buscarCampanha(campanhaId);
    if (!campanha) return res.status(404).json({ error: "Campanha não encontrada" });

    const envios = await listarAberturasCampanha(campanhaId);

    const dados = envios.map((e: any) => ({
      Nome: e.contatoNome || '',
      Email: e.email,
      'Status Envio': e.status === 'ENVIADO' ? 'Enviado' : e.status === 'ERRO' ? 'Erro' : 'Pendente',
      'Visualizações': e.aberturas || 0,
      'Primeira Abertura': e.abertoPrimeiramente
        ? new Date(e.abertoPrimeiramente).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        : '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dados);
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="relatorio-${campanha.nome.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Histórico geral de envios de e-mail ──────────────────────────────────────
router.get("/email-marketing/historico-envios", async (req, res) => {
  try {
    const { status, dataInicio, dataFim, busca, campanhaId, tipo } = req.query;

    let query = `
      SELECT 
        e.id, e.email, e.status, e.erro, e.enviadoEm, e.createdAt, e.aberturas,
        e.tipo,
        c.nome as campanhaNome, c.id as campanhaId,
        COALESCE(e.contatoNome, ct.nome) as contatoNome
      FROM email_envios e
      LEFT JOIN email_campanhas c ON e.campanhaId = c.id
      LEFT JOIN email_contatos ct ON e.contatoId = ct.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (campanhaId && campanhaId !== 'TODOS') {
      query += ` AND e.campanhaId = ?`;
      params.push(parseInt(campanhaId as string));
    }
    if (status && status !== 'TODOS') {
      query += ` AND e.status = ?`;
      params.push(status);
    }
    if (tipo && tipo !== 'TODOS') {
      if (tipo === 'CAMPANHA') {
        query += ` AND (e.tipo IS NULL OR e.tipo NOT IN ('ANIVERSARIO','INADIMPLENCIA'))`;
      } else {
        query += ` AND e.tipo = ?`;
        params.push(tipo);
      }
    }
    if (dataInicio) {
      query += ` AND DATE(e.createdAt) >= ?`;
      params.push(dataInicio);
    }
    if (dataFim) {
      query += ` AND DATE(e.createdAt) <= ?`;
      params.push(dataFim);
    }
    if (busca) {
      query += ` AND (ct.nome LIKE ? OR e.email LIKE ? OR c.nome LIKE ?)`;
      params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
    }

    query += ` ORDER BY e.createdAt DESC LIMIT 500`;

    const rows = await rawQuery(query, params);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── E-mail Individuall ────────────────────────────────────────────────────────
// Envia um e-mail individual para qualquer destinatário (usado em Vendas e Boas-Vindas)
router.post("/email-marketing/enviar-individual", async (req, res) => {
  try {
    let { destinatario, destinatarioNome, assunto, corpo } = req.body;
    if (!destinatario || !assunto || !corpo) {
      return res.status(400).json({ error: "Campos obrigatórios: destinatario, assunto, corpo" });
    }
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: "SENDGRID_API_KEY não configurada. Configure nas variáveis de ambiente do sistema." });
    }
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || "atendimento@barcellosseguros.com";
    const fromName = process.env.SENDGRID_FROM_NAME || "Barcellos Seguros";

    // Se o corpo começa com BLOCKS:, converter para HTML
    const BLOCKS_PREFIX = "BLOCKS:";
    if (corpo.startsWith(BLOCKS_PREFIX)) {
      try {
        const blocoJson = corpo.substring(BLOCKS_PREFIX.length);
        const blocos = JSON.parse(blocoJson);
        // Usar a função resolverCorpoTemplate para converter blocos para HTML
        corpo = resolverCorpoTemplate(
          "Olá, {{nome}}!",
          "Atenciosamente,\nEquipe Barcellos Seguros",
          blocos
        );
      } catch (e) {
        // Se falhar a conversão, usar o corpo como está
        console.error("Erro ao converter BLOCKS para HTML:", e);
      }
    }

    // Adiciona rodapé padrão com cancelamento e endereço físico (exigido pelo SendGrid)
    // Se o corpo já é HTML completo (<!DOCTYPE html>), insere o rodapé antes do </body>
    const rodapeConformidade = `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;font-family:Arial,sans-serif">
  <p style="margin:0">Barcellos Seguros Corretora de Seguros Ltda.</p>
  <p style="margin:4px 0">Av. Marechal Castelo Branco, 65, sala 1002-A — Campinas, São José/SC — CEP 88101-020</p>
  <p style="margin:4px 0">
    <a href="https://app.barcellosseguros.com.br/privacidade" style="color:#6b7280">Política de Privacidade</a>
    &nbsp;|&nbsp;
    <a href="mailto:atendimento@barcellosseguros.com?subject=Cancelar inscrição&body=Solicito o cancelamento do recebimento de e-mails." style="color:#6b7280">Cancelar inscrição</a>
  </p>
</div>`;
    const isFullHtml = corpo.trim().toLowerCase().startsWith('<!doctype html') || corpo.trim().toLowerCase().startsWith('<html');
    const corpoComRodape = isFullHtml
      ? corpo.replace(/<\/body>/i, `${rodapeConformidade}</body>`)
      : `${corpo}${rodapeConformidade}`;

    const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: destinatario, name: destinatarioNome || destinatario }] }],
        from: { email: fromEmail, name: fromName },
        subject: assunto,
        content: [{ type: "text/html", value: corpoComRodape }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return res.status(500).json({ error: `SendGrid: ${err}` });
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

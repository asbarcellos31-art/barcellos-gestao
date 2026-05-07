/**
 * Router tRPC para WhatsApp Marketing (Evolution API)
 * Gerencia campanhas, listas, contatos e disparos
 * whatsapp-1 (48 3372-6890) → inadimplência + campanhas
 * whatsapp-2 (48 99210-8365) → aniversariantes + boas-vindas
 * whatsapp-3 (48 99225-9899) → Anderson — campanhas médicos
 */

import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { getDb } from "./db";
import mysql from "mysql2/promise";
import {
  whatsappListas,
  whatsappContatos,
  whatsappCampanhas,
  whatsappEnvios,
} from "../drizzle/schema";
import { eq, desc, sql, and, lte } from "drizzle-orm";
import {
  enviarMensagemEvolution,
  enviarMensagemComRetry,
  enviarMidiaEvolution,
  enviarVideoEvolution,
  VIDEO_BOAS_VINDAS_URL,
  getZApiConfig,
  formatarTelefone,
  registrarEnvioWhatsapp,
  verificarConexaoEvolution,
  reconectarInstancia,
  INSTANCIAS,
} from "./zapi";

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

function parseDatetimeLocalBrasilia(dtLocal: string): Date {
  // dtLocal: "2026-03-15T09:00" — interpreta como horário de Brasília (UTC-3)
  const [datePart, timePart] = dtLocal.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  // UTC-3 → adiciona 3 horas para converter para UTC
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute));
}

export const whatsappRouter = router({
  // ── Status de conexão Evolution API (ambas as instâncias) ─────────────────
  statusConexao: publicProcedure.query(async () => {
    const [inst1, inst2, inst3] = await Promise.all([
      verificarConexaoEvolution(INSTANCIAS.inadimplencia),
      verificarConexaoEvolution(INSTANCIAS.aniversario),
      verificarConexaoEvolution(INSTANCIAS.medicos),
    ]).catch(() => [{ conectado: false }, { conectado: false }, { conectado: false }]);
    return {
      conectado: inst1?.conectado || inst2?.conectado || inst3?.conectado,
      instancias: {
        "whatsapp-1": { conectado: inst1?.conectado || false, numero: "(48) 3372-6890", uso: "Inadimplência / Campanhas" },
        "whatsapp-2": { conectado: inst2?.conectado || false, numero: "(48) 99210-8365", uso: "Aniversariantes / Boas-vindas" },
        "whatsapp-3": { conectado: inst3?.conectado || false, numero: "(48) 99225-9899", uso: "Médicos - Anderson" },
      },
    };
  }),

  // ── Listas ───────────────────────────────────────────────────────────────
  listarListas: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(whatsappListas).orderBy(desc(whatsappListas.createdAt));
  }),

  criarLista: publicProcedure
    .input(z.object({ nome: z.string().min(1), descricao: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      const [res] = await db.insert(whatsappListas).values({ nome: input.nome, descricao: input.descricao });
      return { id: (res as any).insertId };
    }),

  excluirLista: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      await db.delete(whatsappContatos).where(eq(whatsappContatos.listaId, input.id));
      await db.delete(whatsappListas).where(eq(whatsappListas.id, input.id));
      return { ok: true };
    }),

  // ── Contatos ─────────────────────────────────────────────────────────────
  listarContatos: publicProcedure
    .input(z.object({ listaId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(whatsappContatos)
        .where(eq(whatsappContatos.listaId, input.listaId))
        .orderBy(whatsappContatos.nome);
    }),

  adicionarContato: publicProcedure
    .input(
      z.object({
        listaId: z.number(),
        nome: z.string().min(1),
        telefone: z.string().min(8),
        cpf: z.string().optional(),
        dadosExtras: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      const [res] = await db.insert(whatsappContatos).values({
        listaId: input.listaId,
        nome: input.nome,
        telefone: formatarTelefone(input.telefone),
        cpf: input.cpf ?? null,
        dadosExtras: input.dadosExtras ?? null,
      });
      // Atualizar total de contatos na lista
      await db
        .update(whatsappListas)
        .set({ totalContatos: sql`totalContatos + 1` })
        .where(eq(whatsappListas.id, input.listaId));
      return { id: (res as any).insertId };
    }),

  importarContatosDaBase: publicProcedure
    .input(z.object({ listaId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      const conn = (db as any).session?.client;
      if (!conn) throw new Error("Conexão indisponível");
      // Busca clientes ativos com telefone/celular cadastrado
      // Status case-insensitive (banco tem 'Ativo' e 'ativo' misturados)
      // Parênteses garantem precedência correta: pega quem tem celular válido OU telefone válido
      const [clientes]: any = await conn.execute(
        `SELECT nome, cpf, celular, telefone FROM clientes 
         WHERE LOWER(status) = 'ativo'
           AND (
             (celular IS NOT NULL AND celular != '')
             OR (telefone IS NOT NULL AND telefone != '')
           )`
      );
      let importados = 0;
      for (const c of clientes || []) {
        const tel = c.celular || c.telefone;
        if (!tel) continue;
        try {
          await db.insert(whatsappContatos).values({
            listaId: input.listaId,
            nome: c.nome || "Sem nome",
            telefone: formatarTelefone(tel),
            cpf: c.cpf,
          });
          importados++;
        } catch (_) {} // ignora duplicatas
      }
      // Atualizar total
      await db
        .update(whatsappListas)
        .set({ totalContatos: sql`(SELECT COUNT(*) FROM whatsapp_contatos WHERE listaId = ${input.listaId})` })
        .where(eq(whatsappListas.id, input.listaId));
      return { importados };
    }),

  excluirContato: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      const [c] = await db.select().from(whatsappContatos).where(eq(whatsappContatos.id, input.id));
      if (c) {
        await db.delete(whatsappContatos).where(eq(whatsappContatos.id, input.id));
        await db
          .update(whatsappListas)
          .set({ totalContatos: sql`GREATEST(0, totalContatos - 1)` })
          .where(eq(whatsappListas.id, c.listaId));
      }
      return { ok: true };
    }),

  // ── Campanhas ────────────────────────────────────────────────────────────
  listarCampanhas: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(whatsappCampanhas).orderBy(desc(whatsappCampanhas.createdAt));
  }),

  criarCampanha: publicProcedure
    .input(
      z.object({
        nome: z.string().min(1),
        mensagem: z.string().min(1),
        listaId: z.number().optional(),
        dataAgendadaLocal: z.string().optional(), // "2026-03-15T09:00"
        intervaloMs: z.number().optional(),
        mediaUrl: z.string().optional(), // URL do arquivo de mídia
        mediaType: z.enum(["image", "video", "document"]).optional(),
        instanciaId: z.enum(["whatsapp-1", "whatsapp-2", "whatsapp-3"]).optional(),
        limiteDiario: z.number().optional(), // 0 = sem limite
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      const dataAgendada = input.dataAgendadaLocal
        ? parseDatetimeLocalBrasilia(input.dataAgendadaLocal)
        : null;
      const status = dataAgendada ? "AGENDADA" : "RASCUNHO";
      const [res] = await db.insert(whatsappCampanhas).values({
        nome: input.nome,
        mensagem: input.mensagem,
        listaId: input.listaId ?? null,
        status: status as any,
        dataAgendada: dataAgendada ?? undefined,
        intervaloMs: input.intervaloMs ?? 3000,
        limiteDiario: input.limiteDiario ?? 0,
        mediaUrl: input.mediaUrl ?? null,
        mediaType: input.mediaType ?? null,
        instanciaId: input.instanciaId ?? "whatsapp-1",
      });
      return { id: (res as any).insertId, status };
    }),

  atualizarCampanha: publicProcedure
    .input(
      z.object({
        id: z.number(),
        nome: z.string().optional(),
        mensagem: z.string().optional(),
        listaId: z.number().optional(),
        dataAgendadaLocal: z.string().optional(),
        intervaloMs: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      const updates: Record<string, any> = {};
      if (input.nome) updates.nome = input.nome;
      if (input.mensagem) updates.mensagem = input.mensagem;
      if (input.listaId !== undefined) updates.listaId = input.listaId;
      if (input.intervaloMs !== undefined) updates.intervaloMs = input.intervaloMs;
      if (input.dataAgendadaLocal !== undefined) {
        updates.dataAgendada = input.dataAgendadaLocal
          ? parseDatetimeLocalBrasilia(input.dataAgendadaLocal)
          : null;
        updates.status = input.dataAgendadaLocal ? "AGENDADA" : "RASCUNHO";
      }
      await db.update(whatsappCampanhas).set(updates).where(eq(whatsappCampanhas.id, input.id));
      return { ok: true };
    }),

  excluirCampanha: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      await db.delete(whatsappEnvios).where(eq(whatsappEnvios.campanhaId, input.id));
      await db.delete(whatsappCampanhas).where(eq(whatsappCampanhas.id, input.id));
      return { ok: true };
    }),

  // ── Disparo de campanha ──────────────────────────────────────────────────
  dispararCampanha: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      const [campanha] = await db
        .select()
        .from(whatsappCampanhas)
        .where(eq(whatsappCampanhas.id, input.id));
      if (!campanha) throw new Error("Campanha não encontrada");

       // Buscar contatos da lista
      let contatos: Array<{ nome: string; telefone: string }> = [];
      if (campanha.listaId) {
        contatos = await db
          .select({ nome: whatsappContatos.nome, telefone: whatsappContatos.telefone })
          .from(whatsappContatos)
          .where(eq(whatsappContatos.listaId, campanha.listaId));
      }

      if (contatos.length === 0) throw new Error("Lista sem contatos.");

      // Marcar como ENVIANDO
      await db
        .update(whatsappCampanhas)
        .set({ status: "ENVIANDO", totalDestinatarios: contatos.length, dataInicio: new Date() })
        .where(eq(whatsappCampanhas.id, input.id));

      // Disparo assíncrono (não bloqueia a resposta)
      (async () => {
        let enviados = 0;
        let erros = 0;

        // Helpers para reset diário
        const isMesmoDia = (d: Date | null | undefined) => {
          if (!d) return false;
          const hoje = new Date();
          return d.getFullYear() === hoje.getFullYear() &&
            d.getMonth() === hoje.getMonth() &&
            d.getDate() === hoje.getDate();
        };

        // Recarregar campanha para pegar enviadosHoje atualizado
        let [camp] = await db.select().from(whatsappCampanhas).where(eq(whatsappCampanhas.id, input.id));
        let enviadosHoje = isMesmoDia(camp.dataUltimoEnvio) ? (camp.enviadosHoje || 0) : 0;

        for (const contato of contatos) {
          // Verificar se campanha foi pausada
          [camp] = await db.select().from(whatsappCampanhas).where(eq(whatsappCampanhas.id, input.id));
          if (camp.pausada) {
            console.log(`[WA] Campanha "${camp.nome}" pausada pelo usuário. Parando envio.`);
            await db.update(whatsappCampanhas)
              .set({ status: "AGENDADA", totalEnviados: enviados, totalErros: erros })
              .where(eq(whatsappCampanhas.id, input.id));
            return;
          }
          // Verificar limite diário
          if (camp.limiteDiario && camp.limiteDiario > 0) {
            // Recarregar para ter valor atualizado
            [camp] = await db.select().from(whatsappCampanhas).where(eq(whatsappCampanhas.id, input.id));
            enviadosHoje = isMesmoDia(camp.dataUltimoEnvio) ? (camp.enviadosHoje || 0) : 0;

            if (enviadosHoje >= camp.limiteDiario) {
              // Pausar até amanhã
              const amanha = new Date();
              amanha.setDate(amanha.getDate() + 1);
              amanha.setHours(8, 0, 0, 0); // retomar às 8h
              await db.update(whatsappCampanhas)
                .set({ status: "AGENDADA", dataAgendada: amanha, totalEnviados: enviados, totalErros: erros })
                .where(eq(whatsappCampanhas.id, input.id));
              console.log(`[WA] Campanha "${camp.nome}" pausada por limite diário (${enviadosHoje}/${camp.limiteDiario}). Retoma às 8h.`);
              return;
            }
          }

          const vars: Record<string, string> = { nome: contato.nome || "Cliente" };
          const mensagem = Object.entries(vars).reduce(
            (t, [k, v]) => t.replace(new RegExp(`\\{\\{${k}\\}\\}`, "gi"), v),
            camp.mensagem
          );
          // Enviar texto ou mídia dependendo da campanha
          let resultado: { sucesso: boolean; erro?: string };
          const instancia = (camp.instanciaId as string) || INSTANCIAS.campanhas;
          if (camp.mediaUrl && camp.mediaType) {
            resultado = await enviarMidiaEvolution(
              contato.telefone,
              camp.mediaUrl,
              camp.mediaType as "image" | "video" | "document",
              mensagem,
              instancia
            );
          } else {
            resultado = await enviarMensagemEvolution(contato.telefone, mensagem, instancia);
          }
          await registrarEnvioWhatsapp({
            campanhaId: input.id,
            nome: contato.nome,
            telefone: contato.telefone,
            mensagem,
            tipo: "CAMPANHA",
            status: resultado.sucesso ? "ENVIADO" : "ERRO",
            erro: resultado.erro,
          });
          if (resultado.sucesso) {
            enviados++;
            enviadosHoje++;
            const agora = new Date();
            await db.update(whatsappCampanhas)
              .set({ totalEnviados: enviados, totalErros: erros, enviadosHoje, dataUltimoEnvio: agora })
              .where(eq(whatsappCampanhas.id, input.id));
          } else {
            erros++;
          }
          await new Promise(r => setTimeout(r, camp.intervaloMs || 3000));
        }
        await db
          .update(whatsappCampanhas)
          .set({ status: "CONCLUIDA", totalEnviados: enviados, totalErros: erros, dataConclusao: new Date() })
          .where(eq(whatsappCampanhas.id, input.id));
        console.log(`[WA] Campanha "${camp.nome}" concluída: ${enviados} enviados, ${erros} erros`);
      })().catch(e => console.error("[WA] Erro no disparo:", e));

      return { ok: true, total: contatos.length };
    }),

  // ── Pausar/Retomar Campanha ───────────────────────────────────────────────
  pausarCampanha: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      await db
        .update(whatsappCampanhas)
        .set({ pausada: true })
        .where(eq(whatsappCampanhas.id, input.id));
      return { ok: true, mensagem: "Campanha pausada" };
    }),

  retomarCampanha: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      await db
        .update(whatsappCampanhas)
        .set({ pausada: false })
        .where(eq(whatsappCampanhas.id, input.id));
      return { ok: true, mensagem: "Campanha retomada" };
    }),

  // ── Envio individual ─────────────────────────────────────────────────────
  enviarIndividual: publicProcedure
    .input(
      z.object({
        nome: z.string().optional(),
        telefone: z.string().min(8),
        mensagem: z.string().min(1),
        instancia: z.enum(["whatsapp-1", "whatsapp-2"]).optional(),
        vendaId: z.number().optional(), // ID da venda para marcar boas-vindas como enviado
      })
    )
    .mutation(async ({ input }) => {
      // Usa a instância especificada ou whatsapp-2 para boas-vindas por padrão
      const instancia = input.instancia || INSTANCIAS.aniversario;

      // Envia primeiro o vídeo de boas-vindas como mídia (sem o link no texto)
      const mensagemSemLink = input.mensagem.replace(/https?:\/\/\S+/g, "").trim();
      const captionVideo = `Olá, ${input.nome || "cliente"}! Seja bem-vindo(a) à família Barcellos Seguros! 🎉`;
      const resultadoVideo = await enviarVideoEvolution(input.telefone, VIDEO_BOAS_VINDAS_URL, captionVideo, instancia);

      // Depois envia a mensagem de texto (sem o link do vídeo)
      const resultado = await enviarMensagemEvolution(input.telefone, mensagemSemLink, instancia);

      await registrarEnvioWhatsapp({
        nome: input.nome,
        telefone: formatarTelefone(input.telefone),
        mensagem: input.mensagem,
        tipo: "INDIVIDUAL",
        status: resultado.sucesso ? "ENVIADO" : "ERRO",
        erro: resultado.sucesso ? undefined : resultado.erro,
      });
      if (!resultadoVideo.sucesso && !resultado.sucesso) throw new Error(resultado.erro || "Falha no envio");
      // Marcar a venda como boas-vindas enviado
      if (input.vendaId && resultado.sucesso) {
        await rawQuery(
          `UPDATE vendas SET boasVindasEnviadoEm = NOW() WHERE id = ?`,
          [input.vendaId]
        );
      }
      return { ok: true };
    }),

  // ── Histórico de envios ──────────────────────────────────────────────────
  historicoEnvios: publicProcedure
    .input(z.object({
      tipo: z.string().optional(),
      status: z.string().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      busca: z.string().optional(),
      limit: z.number().default(200),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      let sql = `SELECT * FROM whatsapp_envios WHERE 1=1`;
      const params: any[] = [];
      if (input.tipo && input.tipo !== 'TODOS') {
        sql += ` AND tipo = ?`;
        params.push(input.tipo);
      }
      if (input.status && input.status !== 'TODOS') {
        sql += ` AND status = ?`;
        params.push(input.status);
      }
      if (input.dataInicio) {
        sql += ` AND createdAt >= ?`;
        params.push(input.dataInicio + ' 00:00:00');
      }
      if (input.dataFim) {
        sql += ` AND createdAt <= ?`;
        params.push(input.dataFim + ' 23:59:59');
      }
      if (input.busca) {
        sql += ` AND (nome LIKE ? OR telefone LIKE ?)`;
        params.push(`%${input.busca}%`, `%${input.busca}%`);
      }
      const limitVal = Math.max(1, Math.min(1000, Math.floor(Number(input.limit) || 200)));
      sql += ` ORDER BY createdAt DESC LIMIT ${limitVal}`;
      const rows = await rawQuery(sql, params);
      return rows || [];
    }),

  // ── Automações WhatsApp (mensagens de aniversariantes e inadimplentes) ─────
  getAutomacoes: publicProcedure.query(async () => {
    const defaultAniversario = `🎂 Parabéns, {{nome}}! 🎉\n\nA equipe da Barcellos Seguros deseja a você um feliz aniversário! Que este novo ano de vida seja repleto de saúde, alegria e realizações.\n\nAfinal, quem ama protege. 💙\n\nEquipe Barcellos Seguros\n📞 (48) 3372-6890`;
    const defaultInadimplentes = `Olá, {{nome}}! Identificamos uma pendência financeira em seu nome junto à Barcellos Seguros.\n\nPor favor, entre em contato para regularizar sua situação:\n📞 (48) 3372-6890\n\nEvite a interrupção dos seus serviços. Estamos à disposição para ajudá-lo(a).\n\nEquipe Barcellos Seguros`;
    try {
      const rows = await rawQuery(
        "SELECT chave, valor FROM system_config WHERE chave IN ('wa_automacao_aniversario_ativo','wa_automacao_aniversario_msg','wa_automacao_aniversario_horario','wa_automacao_aniversario_video','wa_automacao_inadimplentes_ativo','wa_automacao_inadimplentes_msg')"
      );
      const cfg: Record<string, string> = {};
      for (const r of (rows || [])) cfg[(r as any).chave] = (r as any).valor;
      return {
        aniversario: {
          ativo: cfg['wa_automacao_aniversario_ativo'] === '1',
          mensagem: cfg['wa_automacao_aniversario_msg'] || defaultAniversario,
          horario: cfg['wa_automacao_aniversario_horario'] || '08:00',
          videoUrl: cfg['wa_automacao_aniversario_video'] || '',
        },
        inadimplentes: { ativo: cfg['wa_automacao_inadimplentes_ativo'] === '1', mensagem: cfg['wa_automacao_inadimplentes_msg'] || defaultInadimplentes },
      };
    } catch {
      return { aniversario: { ativo: false, mensagem: defaultAniversario, horario: '08:00', videoUrl: '' }, inadimplentes: { ativo: false, mensagem: defaultInadimplentes } };
    }
  }),

  salvarAutomacao: publicProcedure
    .input(z.object({
      tipo: z.enum(["aniversario", "inadimplentes"]),
      ativo: z.boolean(),
      mensagem: z.string().min(1),
      horario: z.string().optional(),
      videoUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const chaveAtivo = `wa_automacao_${input.tipo}_ativo`;
      const chaveMsg = `wa_automacao_${input.tipo}_msg`;
      await rawQuery(
        `INSERT INTO system_config (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
        [chaveAtivo, input.ativo ? '1' : '0']
      );
      await rawQuery(
        `INSERT INTO system_config (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
        [chaveMsg, input.mensagem]
      );
      if (input.tipo === 'aniversario') {
        if (input.horario) {
          await rawQuery(
            `INSERT INTO system_config (chave, valor) VALUES ('wa_automacao_aniversario_horario', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
            [input.horario]
          );
        }
        if (input.videoUrl !== undefined) {
          await rawQuery(
            `INSERT INTO system_config (chave, valor) VALUES ('wa_automacao_aniversario_video', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
            [input.videoUrl]
          );
        }
      }
      return { ok: true };
    }),

   // ── Disparo WhatsApp em massa para inadimplentes selecionados ────────────
  dispararInadimplentesWhatsapp: publicProcedure
    .input(z.object({ cpfs: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Banco indisponível");
      // Usa whatsapp-1 (48 3372-6890) para inadimplência;

      // Buscar mensagem configurada
      const [cfgRows]: any = await (db as any).execute(
        `SELECT valor FROM system_config WHERE chave = 'wa_automacao_inadimplentes_msg' LIMIT 1`
      );
      const mensagemTemplate = cfgRows?.[0]?.valor ||
        `Olá, {{nome}}! Identificamos uma pendência financeira em seu nome junto à Barcellos Seguros.\n\nPor favor, entre em contato para regularizar sua situação:\n📞 (48) 3372-6890\n\nEvite a interrupção dos seus serviços. Estamos à disposição para ajudá-lo(a).\n\nEquipe Barcellos Seguros`;

      // Buscar inadimplentes pelos CPFs, cruzando com Base de Clientes para pegar telefone
      const placeholders = input.cpfs.map(() => '?').join(',');
      const lista = await rawQuery(
        `SELECT
          MIN(i.nome) as nome,
          i.cpf,
          COALESCE(
            NULLIF(MIN(i.telefoneContato), ''),
            NULLIF(MIN(i.telefone1), ''),
            NULLIF(MIN(i.telefone2), ''),
            MIN(c.celular),
            MIN(c.telefone)
          ) AS telefone1
        FROM inadimplentes i
        LEFT JOIN clientes c ON LPAD(REGEXP_REPLACE(i.cpf, '[^0-9]', ''), 11, '0') = LPAD(REGEXP_REPLACE(c.cpf, '[^0-9]', ''), 11, '0')
        WHERE i.cpf IN (${placeholders})
        GROUP BY i.cpf`,
        input.cpfs
      );

      const resultados: { nome: string; telefone: string; status: "ENVIADO" | "ERRO"; erro?: string }[] = [];

      for (const item of (lista || [])) {
        const nome = item.nome || "Cliente";
        const telefone = item.telefone1 || "";
        if (!telefone) {
          resultados.push({ nome, telefone: "", status: "ERRO", erro: "Sem telefone cadastrado" });
          continue;
        }
        const mensagem = mensagemTemplate.replace(/\{\{nome\}\}/g, nome.split(" ")[0]);
        const resultado = await enviarMensagemEvolution(telefone, mensagem, INSTANCIAS.inadimplencia);
        await registrarEnvioWhatsapp({
          nome,
          telefone: formatarTelefone(telefone),
          mensagem,
          tipo: "INADIMPLENTE",
          status: resultado.sucesso ? "ENVIADO" : "ERRO",
          erro: resultado.erro,
        });
        resultados.push({ nome, telefone, status: resultado.sucesso ? "ENVIADO" : "ERRO", erro: resultado.erro });
        await new Promise(r => setTimeout(r, 2000)); // 2s entre envios
      }

      const enviados = resultados.filter(r => r.status === "ENVIADO").length;
      const erros = resultados.filter(r => r.status === "ERRO").length;
      return { enviados, erros, resultados };
    }),

  // ── Importar contatos da Base de Clientes com filtros de segmentação ─────
  // ── Metadados da Base para popular filtros ─────────────────────────────────
  baseMetadados: publicProcedure.query(async () => {
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
      return {
        produtos: (prodRows || []).map((r: any) => ({ codigo: r.codigo, descricao: r.descricao })),
        cidades: (cidadeRows || []).map((r: any) => r.cidade).filter(Boolean),
        vendedores: (vendedorRows || []).map((r: any) => r.vendedor).filter(Boolean),
      };
    } catch { return { produtos: [], cidades: [], vendedores: [] }; }
  }),

  importarDaBaseComFiltros: publicProcedure
    .input(z.object({
      listaId: z.number(),
      status: z.enum(["ativo", "inativo", "todos"]).default("ativo"),
      produtoCodigo: z.string().optional(),    // código do produto (tabela produtos)
      cidade: z.string().optional(),           // cidade exata
      vendedor: z.string().optional(),         // vendedor exato
      idadeMin: z.number().optional(),         // faixa etária mínima
      idadeMax: z.number().optional(),         // faixa etária máxima
      contribuicaoMin: z.number().optional(),  // valor mínimo de contribuição
      contribuicaoMax: z.number().optional(),  // valor máximo de contribuição
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");

      let query: string;
      const params: any[] = [];

      const telCondition = `(c.celular IS NOT NULL AND c.celular != '') OR (c.telefone IS NOT NULL AND c.telefone != '')`;

      if (input.produtoCodigo && input.produtoCodigo.trim()) {
        query = `SELECT DISTINCT c.nome, c.cpf, c.celular, c.telefone, c.produtos
          FROM clientes c
          INNER JOIN cliente_produtos cp ON cp.clienteId = c.id
          INNER JOIN produtos p ON p.id = cp.produtoId AND p.codigo = ?
          WHERE (${telCondition})`;
        params.push(input.produtoCodigo.trim());
      } else {
        query = `SELECT DISTINCT c.nome, c.cpf, c.celular, c.telefone, c.produtos
          FROM clientes c
          WHERE (${telCondition})`;
      }

      if (input.status === "ativo") {
        query += " AND LOWER(c.status) = 'ativo'";
      } else if (input.status === "inativo") {
        query += " AND (c.status IS NULL OR c.status != 'Ativo')";
      }
      if (input.cidade && input.cidade.trim()) {
        query += " AND c.cidade = ?";
        params.push(input.cidade.trim());
      }
      if (input.vendedor && input.vendedor.trim()) {
        query += " AND c.vendedor = ?";
        params.push(input.vendedor.trim());
      }
      if (input.idadeMin !== undefined) {
        query += " AND TIMESTAMPDIFF(YEAR, c.dataNascimento, CURDATE()) >= ?";
        params.push(input.idadeMin);
      }
      if (input.idadeMax !== undefined) {
        query += " AND TIMESTAMPDIFF(YEAR, c.dataNascimento, CURDATE()) <= ?";
        params.push(input.idadeMax);
      }
      if (input.contribuicaoMin !== undefined) {
        query += " AND c.contribuicao >= ?";
        params.push(input.contribuicaoMin);
      }
      if (input.contribuicaoMax !== undefined) {
        query += " AND c.contribuicao <= ?";
        params.push(input.contribuicaoMax);
      }

      const clientes = await rawQuery(query, params);
      let importados = 0;
      let ignorados = 0;

      for (const c of (clientes || [])) {
        const tel = c.celular || c.telefone;
        if (!tel) continue;
        try {
          await db.insert(whatsappContatos).values({
            listaId: input.listaId,
            nome: c.nome || "Sem nome",
            telefone: formatarTelefone(tel),
            cpf: c.cpf,
            dadosExtras: c.produtos ? JSON.stringify({ produto: c.produtos }) : undefined,
          });
          importados++;
        } catch (_) { ignorados++; } // ignora duplicatas
      }
      // Atualizar total
      await rawQuery(
        `UPDATE whatsapp_listas SET totalContatos = (SELECT COUNT(*) FROM whatsapp_contatos WHERE listaId = ?) WHERE id = ?`,
        [input.listaId, input.listaId]
      );
      return { importados, ignorados };
    }),

  // ── Verificar campanhas agendadas (chamado pelo job) ─────────────────────

  // ── Preview count: contar registros com os filtros antes de importar ─────────────────────
  previewCount: publicProcedure
    .input(z.object({
      status: z.enum(["ativo", "inativo", "todos"]).default("ativo"),
      produtoCodigo: z.string().optional(),
      cidade: z.string().optional(),
      vendedor: z.string().optional(),
      idadeMin: z.number().optional(),
      idadeMax: z.number().optional(),
      contribuicaoMin: z.number().optional(),
      contribuicaoMax: z.number().optional(),
      sexo: z.enum(["M", "F", "OUTRO"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { total: 0 };
      const telCondition = `(c.celular IS NOT NULL AND c.celular != '') OR (c.telefone IS NOT NULL AND c.telefone != '')`;
      let query: string;
      const params: any[] = [];
      if (input.produtoCodigo && input.produtoCodigo.trim()) {
        query = `SELECT COUNT(DISTINCT c.id) as total FROM clientes c
          INNER JOIN cliente_produtos cp ON cp.clienteId = c.id
          INNER JOIN produtos p ON p.id = cp.produtoId AND p.codigo = ?
          WHERE (${telCondition})`;
        params.push(input.produtoCodigo.trim());
      } else {
        query = `SELECT COUNT(DISTINCT c.id) as total FROM clientes c WHERE (${telCondition})`;
      }
      if (input.status === "ativo") query += " AND LOWER(c.status) = 'ativo'";
      else if (input.status === "inativo") query += " AND (c.status IS NULL OR c.status != 'Ativo')";
      if (input.cidade) { query += " AND c.cidade = ?"; params.push(input.cidade); }
      if (input.vendedor) { query += " AND c.vendedor = ?"; params.push(input.vendedor); }
      if (input.idadeMin !== undefined) { query += " AND TIMESTAMPDIFF(YEAR, c.dataNascimento, CURDATE()) >= ?"; params.push(input.idadeMin); }
      if (input.idadeMax !== undefined) { query += " AND TIMESTAMPDIFF(YEAR, c.dataNascimento, CURDATE()) <= ?"; params.push(input.idadeMax); }
      if (input.contribuicaoMin !== undefined) { query += " AND c.contribuicao >= ?"; params.push(input.contribuicaoMin); }
      if (input.contribuicaoMax !== undefined) { query += " AND c.contribuicao <= ?"; params.push(input.contribuicaoMax); }
      if (input.sexo) { query += " AND c.sexo = ?"; params.push(input.sexo); }
      const rows = await rawQuery(query, params);
      return { total: Number((rows as any[])[0]?.total ?? 0) };
    }),

  // ── Templates de segmentos salvos ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  listarSegmentoTemplates: publicProcedure.query(async () => {
    try {
      const rows = await rawQuery("SELECT * FROM segmento_templates ORDER BY createdAt DESC");
      return (rows || []).map((r: any) => ({ ...r, filtros: JSON.parse(r.filtros || '{}') }));
    } catch { return []; }
  }),

  salvarSegmentoTemplate: publicProcedure
    .input(z.object({ nome: z.string().min(1), filtros: z.record(z.string(), z.any()) }))
    .mutation(async ({ input }) => {
      await rawQuery("INSERT INTO segmento_templates (nome, filtros) VALUES (?, ?)", [input.nome, JSON.stringify(input.filtros)]);
      return { ok: true };
    }),

  excluirSegmentoTemplate: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await rawQuery("DELETE FROM segmento_templates WHERE id = ?", [input.id]);
      return { ok: true };
    }),

  buscarClientesPorNome: publicProcedure
    .input(z.object({ busca: z.string().min(2) }))
    .query(async ({ input }) => {
      const rows = await rawQuery(
        `SELECT id, nome, cpf, celular, telefone, vendedor, cidade
         FROM clientes
         WHERE nome LIKE ? AND (celular IS NOT NULL AND celular != '' OR telefone IS NOT NULL AND telefone != '')
         ORDER BY nome LIMIT 10`,
        [`%${input.busca}%`]
      );
      return (rows || []).map((c: any) => ({
        id: c.id,
        nome: c.nome,
        cpf: c.cpf,
        telefone: c.celular || c.telefone,
        vendedor: c.vendedor,
        cidade: c.cidade,
      }));
    }),

  verificarAgendadas: publicProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) return { disparadas: 0 };
    const campanhas = await db
      .select()
      .from(whatsappCampanhas)
      .where(
        and(
          eq(whatsappCampanhas.status, "AGENDADA"),
          lte(whatsappCampanhas.dataAgendada, new Date())
        )
      );
    // Cada campanha agendada é disparada via dispararCampanha internamente
    // (simplificado: apenas marca como ENVIANDO para o job externo processar)
    for (const c of campanhas) {
      console.log(`[WA] Campanha agendada pronta para disparo: "${c.nome}" (id=${c.id})`);
    }
    return { disparadas: campanhas.length };
  }),

  // ── Gerar QR Code para reconexão de instância ─────────────────────────────────────────────
  gerarQrCode: publicProcedure
    .input(z.object({ instancia: z.enum(["whatsapp-1", "whatsapp-2", "whatsapp-3"]) }))
    .mutation(async ({ input }) => {
      const EVOLUTION_BASE_URL = process.env.EVOLUTION_API_URL || "http://31.97.85.41:8080";
      const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
      if (!EVOLUTION_API_KEY) throw new Error("EVOLUTION_API_KEY não configurada");

      // 1. Desconectar a instância para forçar nova conexão
      try {
        await fetch(`${EVOLUTION_BASE_URL}/instance/logout/${input.instancia}`, {
          method: "DELETE",
          headers: { apikey: EVOLUTION_API_KEY },
        });
      } catch (_) {
        // Ignora erro de logout (instância pode já estar desconectada)
      }

      // 2. Aguardar um momento para a instância processar o logout
      await new Promise((r) => setTimeout(r, 1500));

      // 3. Solicitar QR Code — v2 pode retornar {count:0} no primeiro request
      // se a instância ainda está iniciando. Tentamos até 5 vezes com delay.
      let base64: string | null = null;
      let ultimaResposta: any = null;
      
      for (let tentativa = 1; tentativa <= 5; tentativa++) {
        const resp = await fetch(
          `${EVOLUTION_BASE_URL}/instance/connect/${input.instancia}`,
          { headers: { apikey: EVOLUTION_API_KEY } }
        );

        if (!resp.ok) {
          const body = await resp.text();
          throw new Error(`Erro ao gerar QR Code: ${body.substring(0, 200)}`);
        }

        const data = await resp.json() as any;
        ultimaResposta = data;
        
        // Tenta extrair o QR code: campo "base64" (v1/v2), "qrcode.base64" (v2 alternativo) ou "code"
        const qr = data.base64 || data.qrcode?.base64 || data.qrcode?.code || data.code;
        
        if (qr && typeof qr === 'string' && qr.length > 100) {
          base64 = qr;
          break;
        }
        
        // Se chegou aqui é porque a v2 retornou {count: 0} ou similar - aguarda e tenta novamente
        if (tentativa < 5) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      
      if (!base64) {
        throw new Error(`QR Code vazio após 5 tentativas. Última resposta: ${JSON.stringify(ultimaResposta).substring(0, 200)}`);
      }
      
      // Se ja tem o prefixo, retorna direto. Se nao, adiciona.
      if (!base64.startsWith('data:image')) {
        base64 = `data:image/png;base64,${base64}`;
      }

      return { qr: base64 };
    }),

  // Validar numeros WhatsApp em lote (para a pagina de Vendas)
  validarNumerosLote: publicProcedure
    .input(z.object({
      vendas: z.array(z.object({
        id: z.number(),
        nome: z.string(),
        celular: z.string(),
      }))
    }))
    .mutation(async ({ input }) => {
      const EVOLUTION_BASE_URL = process.env.EVOLUTION_API_URL || "http://31.97.85.41:8080";
      const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
      if (!EVOLUTION_API_KEY) throw new Error("EVOLUTION_API_KEY não configurada");
      const INSTANCIA = "whatsapp-2";

      const resultados: Array<{
        id: number;
        nome: string;
        celular: string;
        celularFormatado: string;
        temWhatsApp: boolean;
        erro?: string;
      }> = [];

      for (const venda of input.vendas) {
        if (!venda.celular || !venda.celular.trim()) {
          resultados.push({ id: venda.id, nome: venda.nome, celular: venda.celular, celularFormatado: "", temWhatsApp: false, erro: "Sem celular cadastrado" });
          continue;
        }

        const celularFormatado = formatarTelefone(venda.celular);
        try {
          const resp = await fetch(
            `${EVOLUTION_BASE_URL}/chat/whatsappNumbers/${INSTANCIA}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
              body: JSON.stringify({ numbers: [celularFormatado] }),
            }
          );
          if (!resp.ok) {
            resultados.push({ id: venda.id, nome: venda.nome, celular: venda.celular, celularFormatado, temWhatsApp: false, erro: `API erro ${resp.status}` });
            continue;
          }
          const data = await resp.json() as any[];
          const existe = Array.isArray(data) && data.length > 0 && data[0]?.exists === true;
          resultados.push({ id: venda.id, nome: venda.nome, celular: venda.celular, celularFormatado, temWhatsApp: existe });
        } catch (e: any) {
          resultados.push({ id: venda.id, nome: venda.nome, celular: venda.celular, celularFormatado, temWhatsApp: false, erro: e.message });
        }

        // Pequena pausa para nao sobrecarregar a API
        await new Promise(r => setTimeout(r, 200));
      }

      return { resultados };
    }),

  // Importar contatos de lista fria (Excel)
  importarContatosExcel: publicProcedure
    .input(z.object({
      listaId: z.number(),
      contatos: z.array(z.object({
        nome: z.string(),
        telefone: z.string(),
      }))
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponivel");
      
      let importados = 0;
      let erros = 0;
      
      for (const contato of input.contatos) {
        try {
          const telefoneFormatado = formatarTelefone(contato.telefone);
          if (!telefoneFormatado || telefoneFormatado.length < 10) {
            erros++;
            continue;
          }
          
          const existente = await db
            .select()
            .from(whatsappContatos)
            .where(
              and(
                eq(whatsappContatos.listaId, input.listaId),
                eq(whatsappContatos.telefone, telefoneFormatado)
              )
            )
            .limit(1);
          
          if (existente.length > 0) {
            erros++;
            continue;
          }
          
          await db.insert(whatsappContatos).values({
            listaId: input.listaId,
            nome: contato.nome,
            telefone: telefoneFormatado,
          });
          importados++;
        } catch (e) {
          erros++;
        }
      }

      // Atualizar contador da lista
      if (importados > 0) {
        await db
          .update(whatsappListas)
          .set({ totalContatos: sql`(SELECT COUNT(*) FROM whatsapp_contatos WHERE listaId = ${input.listaId})` })
          .where(eq(whatsappListas.id, input.listaId));
      }

      return { importados, erros };
    }),
});

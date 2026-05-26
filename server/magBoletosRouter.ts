/**
 * MAG Boletos — servidor Railway
 *
 * REST (chamado pelo script local via ngrok):
 *   POST /api/mag/boleto    → recebe PDF base64, salva no banco
 *   POST /api/mag/progresso → atualiza progresso do job na memória
 *
 * tRPC (chamado pelo frontend):
 *   mag.iniciarBusca({ cpfs, ngrokUrl }) → cria job e chama o script via ngrok
 *   mag.jobStatus({ jobId })             → retorna estado atual do job
 */

import express from "express";
import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import mysql from "mysql2/promise";

// ── Estado dos jobs em memória ────────────────────────────────────────────────

interface MagJob {
  cpfs: string[];
  total: number;
  atual: number;
  mensagem: string;
  status: "rodando" | "concluido" | "erro";
  sucessos: number;
  falhas: { cpf: string; motivo: string }[];
  criadoEm: number;
}

const magJobs = new Map<string, MagJob>();

// Limpa jobs com mais de 2 horas
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of magJobs) {
    if (job.criadoEm < cutoff) magJobs.delete(id);
  }
}, 30 * 60 * 1000);

// ── Pool MySQL para gravar boleto_pdf no banco ────────────────────────────────

let _magPool: mysql.Pool | null = null;
function getMagPool(): mysql.Pool {
  if (!_magPool && process.env.DATABASE_URL) {
    _magPool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      connectionLimit: 3,
      waitForConnections: true,
      enableKeepAlive: true,
    });
  }
  if (!_magPool) throw new Error("DATABASE_URL não configurado");
  return _magPool;
}
async function magQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await getMagPool().execute(sql, params);
  return rows as T[];
}

// ── Auth middleware ───────────────────────────────────────────────────────────

const MAG_API_KEY = process.env.MAG_API_KEY || "";

function authMag(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = (req.headers["x-api-key"] as string) || req.body?.apiKey;
  if (!MAG_API_KEY || key !== MAG_API_KEY) {
    return res.status(401).json({ erro: "Não autorizado" });
  }
  next();
}

// ── Express REST router ───────────────────────────────────────────────────────

export const magBoletosExpressRouter = express.Router();

// Script envia boleto PDF baixado do portal MAG
magBoletosExpressRouter.post("/mag/boleto", authMag, async (req, res) => {
  try {
    const { jobId, cpf, base64, nomeArquivo } = req.body as {
      jobId: string; cpf: string; base64: string; nomeArquivo?: string;
    };
    if (!jobId || !cpf || !base64) {
      return res.status(400).json({ erro: "Dados incompletos (jobId, cpf, base64 obrigatórios)" });
    }

    const cpfLimpo = cpf.replace(/\D/g, "");
    const nome = nomeArquivo || `boleto-${cpfLimpo}.pdf`;

    // Salva no banco — atualiza todas as parcelas do CPF naquele upload
    await getMagPool().execute(
      `UPDATE inadimplentes
         SET boleto_pdf = ?, boleto_nome = ?, updatedAt = NOW()
       WHERE REGEXP_REPLACE(cpf, '[^0-9]', '') = ?`,
      [base64, nome, cpfLimpo]
    );

    // Incrementa contador de sucessos do job
    const job = magJobs.get(jobId);
    if (job) job.sucessos += 1;

    res.json({ ok: true });
  } catch (err: any) {
    console.error("[MAG] Erro ao salvar boleto:", err.message);
    res.status(500).json({ erro: err.message });
  }
});

// Script envia atualizações de progresso
magBoletosExpressRouter.post("/mag/progresso", authMag, (req, res) => {
  const { jobId, atual, total, cpf, mensagem, tipo, motivo } = req.body as {
    jobId: string; atual?: number; total?: number; cpf?: string;
    mensagem?: string; tipo?: string; motivo?: string;
  };
  const job = magJobs.get(jobId);
  if (!job) return res.status(404).json({ erro: "Job não encontrado" });

  if (atual !== undefined) job.atual = atual;
  if (total !== undefined) job.total = total;
  if (mensagem) job.mensagem = mensagem;

  if (tipo === "falha" && cpf) {
    job.falhas.push({ cpf, motivo: motivo || "Erro desconhecido" });
  }
  if (tipo === "concluido") {
    job.status = "concluido";
  }
  if (tipo === "erro_fatal") {
    job.status = "erro";
    job.mensagem = motivo || "Erro fatal no script";
  }

  res.json({ ok: true });
});

// ── tRPC router ───────────────────────────────────────────────────────────────

export const magTrpcRouter = router({
  iniciarBusca: publicProcedure
    .input(z.object({
      cpfs: z.array(z.string()).min(1),
      ngrokUrl: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      if (!MAG_API_KEY) {
        throw new Error("MAG_API_KEY não configurada no servidor Railway");
      }

      const jobId = Date.now().toString();
      magJobs.set(jobId, {
        cpfs: input.cpfs,
        total: input.cpfs.length,
        atual: 0,
        mensagem: "Aguardando início...",
        status: "rodando",
        sucessos: 0,
        falhas: [],
        criadoEm: Date.now(),
      });

      const appUrl = (process.env.APP_URL || "https://app.barcellosseguros.com.br").replace(/\/+$/, "");
      const callbackUrl = `${appUrl}/api/mag`;
      const ngrokUrl = input.ngrokUrl.replace(/\/+$/, "");

      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        const resp = await fetch(`${ngrokUrl}/buscar-boletos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            cpfs: input.cpfs,
            callbackUrl,
            apiKey: MAG_API_KEY,
          }),
          signal: ctrl.signal,
        });
        clearTimeout(t);

        if (!resp.ok) {
          const body = await resp.text();
          magJobs.delete(jobId);
          throw new Error(`Script retornou ${resp.status}: ${body.slice(0, 200)}`);
        }

        const json = await resp.json() as any;
        if (json.erro) {
          magJobs.delete(jobId);
          throw new Error(json.erro);
        }
      } catch (err: any) {
        if (magJobs.has(jobId)) magJobs.delete(jobId);
        if (err.name === "AbortError") {
          throw new Error("Script MAG não respondeu em 12s — verifique se está rodando e se a URL ngrok está correta");
        }
        throw new Error("Não foi possível conectar ao script MAG: " + err.message);
      }

      return { jobId };
    }),

  jobStatus: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => {
      const job = magJobs.get(input.jobId);
      if (!job) return null;
      return {
        total: job.total,
        atual: job.atual,
        mensagem: job.mensagem,
        status: job.status,
        sucessos: job.sucessos,
        falhas: job.falhas,
      };
    }),
});

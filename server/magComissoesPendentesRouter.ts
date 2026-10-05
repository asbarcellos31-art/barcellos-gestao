/**
 * Varredura MAG — Comissões Pendentes (aba "Comissões Pendentes" dentro de Comissões)
 *
 * Mesmo padrão do magBoletosRouter.ts (job em memória + script local via túnel),
 * mas em vez de baixar boletos, confere na Plataforma dos Produtores MAG, para os
 * clientes com parcela em atraso naquele mês (tabela `inadimplentes`):
 *   - Arrecadação (a parcela do mês foi paga pelo cliente?)
 *   - Comissões > Analítico (a comissão daquele cliente já caiu pra Barcellos?)
 *   - Se não achou comissão: Inadimplentes / Cancelamentos da MAG, pra saber onde o cliente está
 *
 * REST (chamado pelo script local via túnel):
 *   POST /api/mag/comissoes-progresso → atualiza progresso do job na memória
 *   POST /api/mag/comissoes-resultado → recebe o resultado de um cliente e persiste no banco
 *
 * tRPC (chamado pelo frontend):
 *   comissoes.varreduraIniciar({ mes, ano, ngrokUrl }) → cria job e chama o script via túnel
 *   comissoes.varreduraStatus({ jobId })               → progresso do job (polling)
 *   comissoes.varreduraResultado({ mes, ano })          → resultado persistido (para reabrir sem rodar de novo)
 */

import express from "express";
import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { authMag } from "./magBoletosRouter";
import { listarClientesParcelaPendenteMes } from "./comissoesDb";
import {
  salvarResultadoVarredura,
  obterResultadoVarredura,
  limparResultadoVarredura,
} from "./varreduraComissoesDb";

// ── Estado dos jobs em memória (mesmo padrão do job de boletos) ──────────────

interface VarreduraJob {
  mes: number;
  ano: number;
  total: number;
  atual: number;
  mensagem: string;
  status: "rodando" | "concluido" | "erro";
  processados: number;
  falhas: { cpf: string; motivo: string }[];
  criadoEm: number;
}

const varreduraJobs = new Map<string, VarreduraJob>();

setInterval(() => {
  const cutoff = Date.now() - 4 * 60 * 60 * 1000; // 4h — varredura pode ser bem mais longa que o job de boletos
  for (const [id, job] of varreduraJobs) {
    if (job.criadoEm < cutoff) varreduraJobs.delete(id);
  }
}, 30 * 60 * 1000);

const MAG_API_KEY = process.env.MAG_API_KEY || "";

// ── Express REST router ───────────────────────────────────────────────────────

export const magComissoesPendentesExpressRouter = express.Router();

magComissoesPendentesExpressRouter.post("/mag/comissoes-progresso", authMag, (req, res) => {
  const { jobId, atual, total, cpf, mensagem, tipo, motivo } = req.body as {
    jobId: string; atual?: number; total?: number; cpf?: string;
    mensagem?: string; tipo?: string; motivo?: string;
  };
  const job = varreduraJobs.get(jobId);
  if (!job) return res.status(404).json({ erro: "Job não encontrado" });

  if (atual !== undefined) job.atual = atual;
  if (total !== undefined) job.total = total;
  if (mensagem) job.mensagem = mensagem;

  if (tipo === "falha" && cpf) {
    job.falhas.push({ cpf, motivo: motivo || "Erro desconhecido" });
  }
  if (tipo === "processado") job.processados += 1;
  if (tipo === "concluido") job.status = "concluido";
  if (tipo === "erro_fatal") {
    job.status = "erro";
    job.mensagem = motivo || "Erro fatal no script";
  }

  res.json({ ok: true });
});

magComissoesPendentesExpressRouter.post("/mag/comissoes-resultado", authMag, async (req, res) => {
  try {
    const { jobId, mes, ano, resultado } = req.body as {
      jobId: string; mes: number; ano: number;
      resultado: {
        cpf: string; nome: string; formaPagamento?: string; valorPrevisto?: number;
        valorPagoArrecadacao?: number; statusArrecadacao?: string; dataPagamentoArrecadacao?: string;
        obsArrecadacao?: string; comissaoValor?: number; comissaoDatas?: string; comissaoObs?: string;
        ondeEstaMag?: string;
      };
    };
    if (!jobId || !mes || !ano || !resultado?.cpf) {
      return res.status(400).json({ erro: "Dados incompletos" });
    }
    await salvarResultadoVarredura({ ...resultado, mes, ano, jobId });

    const job = varreduraJobs.get(jobId);
    if (job) job.processados += 1;

    res.json({ ok: true });
  } catch (err: any) {
    console.error("[VarreduraComissoes] Erro ao salvar resultado:", err.message);
    res.status(500).json({ erro: err.message });
  }
});

// ── tRPC router ───────────────────────────────────────────────────────────────

export const magComissoesPendentesTrpcRouter = router({
  varreduraIniciar: publicProcedure
    .input(z.object({
      mes: z.number().min(1).max(12),
      ano: z.number(),
      ngrokUrl: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      if (!MAG_API_KEY) {
        throw new Error("MAG_API_KEY não configurada no servidor Railway");
      }

      const clientes = await listarClientesParcelaPendenteMes(input.mes, input.ano);
      if (clientes.length === 0) {
        throw new Error("Nenhum cliente com parcela pendente nesse mês/ano");
      }

      // Limpa resultado anterior desse mês/ano antes de rodar de novo
      await limparResultadoVarredura(input.mes, input.ano);

      const jobId = `varredura-${Date.now()}`;
      varreduraJobs.set(jobId, {
        mes: input.mes,
        ano: input.ano,
        total: clientes.length,
        atual: 0,
        mensagem: "Aguardando início...",
        status: "rodando",
        processados: 0,
        falhas: [],
        criadoEm: Date.now(),
      });

      const appUrl = (process.env.APP_URL || "https://app.barcellosseguros.com.br").replace(/\/+$/, "");
      const callbackUrl = `${appUrl}/api/mag`;
      const ngrokUrl = input.ngrokUrl.replace(/\/+$/, "");

      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        const resp = await fetch(`${ngrokUrl}/varrer-comissoes-pendentes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            mes: input.mes,
            ano: input.ano,
            clientes: clientes.map(c => ({
              cpf: c.cpfLimpo,
              nome: c.nome,
              formaPagamento: c.formaPagamento,
              valorTotal: c.valorTotal,
            })),
            callbackUrl,
            apiKey: MAG_API_KEY,
          }),
          signal: ctrl.signal,
        });
        clearTimeout(t);

        if (!resp.ok) {
          const body = await resp.text();
          varreduraJobs.delete(jobId);
          throw new Error(`Script retornou ${resp.status}: ${body.slice(0, 200)}`);
        }
        const json = await resp.json() as any;
        if (json.erro) {
          varreduraJobs.delete(jobId);
          throw new Error(json.erro);
        }
      } catch (err: any) {
        if (varreduraJobs.has(jobId)) varreduraJobs.delete(jobId);
        if (err.name === "AbortError") {
          throw new Error("Script MAG não respondeu em 12s — verifique se está rodando e se a URL do túnel está correta");
        }
        throw new Error("Não foi possível conectar ao script MAG: " + err.message);
      }

      return { jobId, totalClientes: clientes.length };
    }),

  varreduraStatus: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(({ input }) => {
      const job = varreduraJobs.get(input.jobId);
      if (!job) return null;
      return {
        total: job.total,
        atual: job.atual,
        mensagem: job.mensagem,
        status: job.status,
        processados: job.processados,
        falhas: job.falhas,
      };
    }),

  varreduraResultado: publicProcedure
    .input(z.object({ mes: z.number(), ano: z.number() }))
    .query(({ input }) => obterResultadoVarredura(input.mes, input.ano)),
});

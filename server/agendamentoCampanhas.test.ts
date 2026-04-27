/**
 * Testes de agendamento de campanhas de e-mail
 * Verifica a lógica de status AGENDADA e disparo automático
 */
import { describe, it, expect } from "vitest";

// ─── Helpers de lógica de agendamento ────────────────────────────────────────

/** Converte string datetime-local para Date interpretando como Brasília (UTC-3) */
function parseDatetimeLocalBrasilia(str: string): Date {
  const normalized = str.length === 16 ? str + ':00' : str;
  return new Date(normalized + '-03:00');
}

function deveDisparar(dataAgendada: Date | null, status: string): boolean {
  if (status !== "AGENDADA") return false;
  if (!dataAgendada) return false;
  return dataAgendada <= new Date();
}

function statusParaCampanha(dataAgendada: string | null): "RASCUNHO" | "AGENDADA" {
  if (!dataAgendada) return "RASCUNHO";
  const data = new Date(dataAgendada);
  if (isNaN(data.getTime())) return "RASCUNHO";
  return "AGENDADA";
}

function formatarDataAgendada(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("Agendamento de campanhas", () => {
  describe("statusParaCampanha", () => {
    it("retorna RASCUNHO quando dataAgendada é null", () => {
      expect(statusParaCampanha(null)).toBe("RASCUNHO");
    });

    it("retorna RASCUNHO quando dataAgendada é string vazia", () => {
      expect(statusParaCampanha("")).toBe("RASCUNHO");
    });

    it("retorna AGENDADA quando dataAgendada é uma data válida futura", () => {
      const amanha = new Date(Date.now() + 86400000).toISOString();
      expect(statusParaCampanha(amanha)).toBe("AGENDADA");
    });

    it("retorna AGENDADA mesmo para data no passado (o job verifica o disparo)", () => {
      const ontem = new Date(Date.now() - 86400000).toISOString();
      expect(statusParaCampanha(ontem)).toBe("AGENDADA");
    });

    it("retorna RASCUNHO para data inválida", () => {
      expect(statusParaCampanha("data-invalida")).toBe("RASCUNHO");
    });
  });

  describe("deveDisparar", () => {
    it("retorna false quando status não é AGENDADA", () => {
      const passado = new Date(Date.now() - 60000);
      expect(deveDisparar(passado, "RASCUNHO")).toBe(false);
      expect(deveDisparar(passado, "CONCLUIDA")).toBe(false);
      expect(deveDisparar(passado, "CANCELADA")).toBe(false);
    });

    it("retorna false quando dataAgendada é null", () => {
      expect(deveDisparar(null, "AGENDADA")).toBe(false);
    });

    it("retorna true quando status é AGENDADA e dataAgendada já passou", () => {
      const passado = new Date(Date.now() - 60000); // 1 minuto atrás
      expect(deveDisparar(passado, "AGENDADA")).toBe(true);
    });

    it("retorna false quando status é AGENDADA mas dataAgendada é futura", () => {
      const futuro = new Date(Date.now() + 3600000); // 1 hora à frente
      expect(deveDisparar(futuro, "AGENDADA")).toBe(false);
    });

    it("retorna true quando dataAgendada é exatamente agora (tolerância de milissegundos)", () => {
      const agora = new Date(Date.now() - 100); // 100ms atrás
      expect(deveDisparar(agora, "AGENDADA")).toBe(true);
    });
  });

  describe("formatarDataAgendada", () => {
    it("formata data ISO para pt-BR com dia, mês, ano, hora e minuto", () => {
      const iso = "2026-03-15T09:30:00.000Z";
      const resultado = formatarDataAgendada(iso);
      // Deve conter dia, mês e hora
      expect(resultado).toMatch(/\d{2}\/\d{2}\/\d{4}/);
      expect(resultado).toMatch(/\d{2}:\d{2}/);
    });
  });

  describe("parseDatetimeLocalBrasilia (fuso horário)", () => {
    it("interpreta '2026-03-12T17:20' como 17:20 em Brasília (UTC-3) = 20:20 UTC", () => {
      const result = parseDatetimeLocalBrasilia('2026-03-12T17:20');
      expect(result.toISOString()).toBe('2026-03-12T20:20:00.000Z');
    });

    it("interpreta '2026-03-12T09:00' como 09:00 em Brasília = 12:00 UTC", () => {
      const result = parseDatetimeLocalBrasilia('2026-03-12T09:00');
      expect(result.toISOString()).toBe('2026-03-12T12:00:00.000Z');
    });

    it("exibe corretamente como 17:20 no timezone de Brasília", () => {
      const result = parseDatetimeLocalBrasilia('2026-03-12T17:20');
      const exibido = result.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
      expect(exibido).toBe('17:20');
    });

    it("não adiciona 1 hora extra (bug UTC-4 vs UTC-3)", () => {
      // Bug original: usuário digita 17:20, sistema salvava 18:20 (UTC-3)
      // Causa: browser em UTC-4 convertia 17:20 para 21:20 UTC (= 18:20 UTC-3)
      // Correção: backend interpreta explicitamente como UTC-3
      const result = parseDatetimeLocalBrasilia('2026-03-12T17:20');
      const horaEmBrasilia = result.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
      expect(horaEmBrasilia).toBe('17:20'); // deve ser 17:20, não 18:20
    });
  });

  describe("Fluxo completo de agendamento", () => {
    it("campanha sem data fica como RASCUNHO e não dispara", () => {
      const status = statusParaCampanha(null);
      const dataAgendada = null;
      expect(status).toBe("RASCUNHO");
      expect(deveDisparar(dataAgendada, status)).toBe(false);
    });

    it("campanha com data futura fica como AGENDADA mas não dispara ainda", () => {
      const dataFutura = new Date(Date.now() + 3600000).toISOString();
      const status = statusParaCampanha(dataFutura);
      expect(status).toBe("AGENDADA");
      expect(deveDisparar(new Date(dataFutura), status)).toBe(false);
    });

    it("campanha com data passada fica como AGENDADA e deve disparar", () => {
      const dataPassada = new Date(Date.now() - 60000).toISOString();
      const status = statusParaCampanha(dataPassada);
      expect(status).toBe("AGENDADA");
      expect(deveDisparar(new Date(dataPassada), status)).toBe(true);
    });
  });
});

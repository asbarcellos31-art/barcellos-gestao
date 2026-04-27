import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("contas router", () => {
  it("listar retorna array vazio quando não há dados", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.contas.listar({ mes: 1, ano: 2099 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("listarTodas retorna array", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.contas.listarTodas({ ano: 2099 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("metricas retorna objeto com campos corretos", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.contas.metricas({ mes: 1, ano: 2099 });
    expect(result).toHaveProperty("totalAPagar");
    expect(result).toHaveProperty("totalPago");
    expect(result).toHaveProperty("totalRecebido");
    expect(result).toHaveProperty("saldoFinal");
  });

  it("custosPorVinculo retorna array", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.contas.custosPorVinculo({ mes: 1, ano: 2099 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("custosPorCategoria retorna array", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.contas.custosPorCategoria({ mes: 1, ano: 2099 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("alertas retorna array", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.contas.alertas({ dias: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("vencidas retorna array", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.contas.vencidas();
    expect(Array.isArray(result)).toBe(true);
  });

  it("criar valida campos obrigatórios", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(
      caller.contas.criar({
        descricao: "",
        dataVencimento: "2026-01-31",
        valor: "1000",
        status: "PENDENTE",
        categoria: "SALARIO",
        vinculo: "ANDERSON",
        mes: 1,
        ano: 2026,
      })
    ).rejects.toThrow();
  });
});

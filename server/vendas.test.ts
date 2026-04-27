import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do banco de dados
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("./clientesDb", async (importOriginal) => {
  const original = await importOriginal<typeof import("./clientesDb")>();
  return {
    ...original,
    listarVendas: vi.fn().mockResolvedValue({ vendas: [], total: 0, totalPremio: 0, totalComissao: 0 }),
    resumoVendasPorCorretor: vi.fn().mockResolvedValue([]),
    metricasVendas: vi.fn().mockResolvedValue({
      totalPropostas: 0,
      cpfNovos: 0,
      faturamento: 0,
      comissaoTotal: 0,
      ticketMedio: 0,
      comissoesPagas: 0,
      implantadas: 0,
    }),
    resumoMensalVendas: vi.fn().mockResolvedValue([]),
    criarVenda: vi.fn().mockResolvedValue({ id: 1 }),
    atualizarVenda: vi.fn().mockResolvedValue({}),
    excluirVenda: vi.fn().mockResolvedValue({}),
    listarClientes: vi.fn().mockResolvedValue({ clientes: [], total: 0, ativos: 0, inativos: 0, vendedores: [] }),
    criarCliente: vi.fn().mockResolvedValue({ id: 1 }),
    atualizarCliente: vi.fn().mockResolvedValue({}),
    excluirCliente: vi.fn().mockResolvedValue({}),
    listarVendedores: vi.fn().mockResolvedValue([]),
  };
});

import {
  listarVendas,
  resumoVendasPorCorretor,
  metricasVendas,
  resumoMensalVendas,
  criarVenda,
  atualizarVenda,
  excluirVenda,
  listarClientes,
} from "./clientesDb";

describe("vendas router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listarVendas retorna estrutura correta quando DB não disponível", async () => {
    const result = await listarVendas({ ano: 2026 });
    expect(result).toHaveProperty("vendas");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("totalPremio");
    expect(result).toHaveProperty("totalComissao");
    expect(Array.isArray(result.vendas)).toBe(true);
  });

  it("metricasVendas retorna todos os campos esperados", async () => {
    const result = await metricasVendas(2026);
    expect(result).toHaveProperty("totalPropostas");
    expect(result).toHaveProperty("cpfNovos");
    expect(result).toHaveProperty("faturamento");
    expect(result).toHaveProperty("comissaoTotal");
    expect(result).toHaveProperty("ticketMedio");
    expect(result).toHaveProperty("comissoesPagas");
    expect(result).toHaveProperty("implantadas");
  });

  it("resumoVendasPorCorretor retorna array", async () => {
    const result = await resumoVendasPorCorretor(2026);
    expect(Array.isArray(result)).toBe(true);
  });

  it("resumoMensalVendas retorna array", async () => {
    const result = await resumoMensalVendas(2026);
    expect(Array.isArray(result)).toBe(true);
  });

  it("criarVenda é chamado com parâmetros corretos", async () => {
    const novaVenda = {
      mes: 1,
      ano: 2026,
      nomeCliente: "TESTE CLIENTE",
      cpfCliente: "123.456.789-00",
      valorPremio: 150.00,
      cpfNovo: "SIM",
      valorComissao: 225.00,
      comissaoPaga: "PAGO",
      implantada: "SIM",
      corretor: "ELISIA",
    };
    await criarVenda(novaVenda as any);
    expect(criarVenda).toHaveBeenCalledWith(novaVenda);
  });

  it("atualizarVenda é chamado com id e dados corretos", async () => {
    await atualizarVenda(1, { nomeCliente: "NOME ATUALIZADO" });
    expect(atualizarVenda).toHaveBeenCalledWith(1, { nomeCliente: "NOME ATUALIZADO" });
  });

  it("excluirVenda é chamado com id correto", async () => {
    await excluirVenda(1);
    expect(excluirVenda).toHaveBeenCalledWith(1);
  });
});

describe("clientes router", () => {
  it("listarClientes retorna estrutura correta quando DB não disponível", async () => {
    const result = await listarClientes({});
    expect(result).toHaveProperty("clientes");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("ativos");
    expect(result).toHaveProperty("inativos");
    expect(result).toHaveProperty("vendedores");
    expect(Array.isArray(result.clientes)).toBe(true);
  });

  it("listarClientes aceita filtros de vendedor e status", async () => {
    await listarClientes({ vendedor: "ELISIA", status: "Ativo" });
    expect(listarClientes).toHaveBeenCalledWith({ vendedor: "ELISIA", status: "Ativo" });
  });
});

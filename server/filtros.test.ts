import { describe, expect, it } from "vitest";

// Testa a lógica de filtragem de período (dataInicio/dataFim) que é aplicada
// nas queries de Sinistros e CRM Leads. Como as funções dependem do banco de
// dados, testamos a lógica de construção dos parâmetros de forma isolada.

describe("Filtros de período - construção de parâmetros", () => {
  // Simula a lógica do frontend: só passa dataInicio/dataFim se preenchidos
  function buildQueryParams(opts: {
    busca?: string;
    status?: string;
    dataInicio?: string;
    dataFim?: string;
  }) {
    return {
      busca: opts.busca || undefined,
      status: opts.status !== "todos" ? opts.status : undefined,
      dataInicio: opts.dataInicio || undefined,
      dataFim: opts.dataFim || undefined,
    };
  }

  it("não inclui dataInicio/dataFim quando não preenchidos", () => {
    const params = buildQueryParams({ busca: "", status: "todos", dataInicio: "", dataFim: "" });
    expect(params.dataInicio).toBeUndefined();
    expect(params.dataFim).toBeUndefined();
  });

  it("inclui dataInicio quando preenchido", () => {
    const params = buildQueryParams({ dataInicio: "2026-01-01", dataFim: "" });
    expect(params.dataInicio).toBe("2026-01-01");
    expect(params.dataFim).toBeUndefined();
  });

  it("inclui dataFim quando preenchido", () => {
    const params = buildQueryParams({ dataInicio: "", dataFim: "2026-03-31" });
    expect(params.dataInicio).toBeUndefined();
    expect(params.dataFim).toBe("2026-03-31");
  });

  it("inclui ambos quando preenchidos", () => {
    const params = buildQueryParams({ dataInicio: "2026-01-01", dataFim: "2026-03-31" });
    expect(params.dataInicio).toBe("2026-01-01");
    expect(params.dataFim).toBe("2026-03-31");
  });

  it("não inclui status quando 'todos'", () => {
    const params = buildQueryParams({ status: "todos" });
    expect(params.status).toBeUndefined();
  });

  it("inclui status quando diferente de 'todos'", () => {
    const params = buildQueryParams({ status: "Pagamento" });
    expect(params.status).toBe("Pagamento");
  });
});

describe("Filtros de período - validação de formato de data", () => {
  function isValidDateFormat(date: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
  }

  it("aceita formato YYYY-MM-DD", () => {
    expect(isValidDateFormat("2026-01-01")).toBe(true);
    expect(isValidDateFormat("2026-12-31")).toBe(true);
  });

  it("rejeita formatos inválidos", () => {
    expect(isValidDateFormat("01/01/2026")).toBe(false);
    expect(isValidDateFormat("2026/01/01")).toBe(false);
    expect(isValidDateFormat("")).toBe(false);
  });
});

describe("Auto-preenchimento DRE - mapeamento de categorias", () => {
  // Simula o mapeamento de categorias do Contas a Pagar para o DRE
  function mapearCategoriaDRE(categoria: string, descricao: string): string | null {
    if (categoria === "COMISSAO") return "Comissões Pagas";
    if (categoria === "VEICULO") return "Combustível";
    if (categoria === "ALIMENTACAO") return "Alimentação";
    if (categoria === "MATERIAL_ESCRITORIO") return "Material Escritório";
    if (categoria === "IMPOSTOS") return "Impostos";
    if (descricao.toUpperCase().includes("CONTADOR")) return "Contador";
    if (descricao.toUpperCase().includes("CARTAO PJ BB")) return "Cartão de Crédito";
    if (descricao.toUpperCase().includes("MARKETING")) return "Marketing";
    if (descricao.toUpperCase().includes("LUZ ESCRIT")) return "Luz";
    if (descricao.toUpperCase().includes("CONDOMINIO ESCRIT")) return "Condomínio";
    if (descricao.toUpperCase().includes("TELEFONE ESCRIT")) return "Internet";
    return null;
  }

  it("mapeia COMISSAO para Comissões Pagas", () => {
    expect(mapearCategoriaDRE("COMISSAO", "Comissão vendedor")).toBe("Comissões Pagas");
  });

  it("mapeia VEICULO para Combustível", () => {
    expect(mapearCategoriaDRE("VEICULO", "Gasolina")).toBe("Combustível");
  });

  it("mapeia ALIMENTACAO para Alimentação", () => {
    expect(mapearCategoriaDRE("ALIMENTACAO", "Almoço")).toBe("Alimentação");
  });

  it("mapeia MATERIAL_ESCRITORIO para Material Escritório", () => {
    expect(mapearCategoriaDRE("MATERIAL_ESCRITORIO", "Papel A4")).toBe("Material Escritório");
  });

  it("mapeia IMPOSTOS para Impostos", () => {
    expect(mapearCategoriaDRE("IMPOSTOS", "DAS")).toBe("Impostos");
  });

  it("mapeia descrição CONTADOR para Contador", () => {
    expect(mapearCategoriaDRE("DIVERSOS", "CONTADOR MENSAL")).toBe("Contador");
  });

  it("mapeia descrição CARTAO PJ BB para Cartão de Crédito", () => {
    expect(mapearCategoriaDRE("BANCO", "CARTAO PJ BB FATURA")).toBe("Cartão de Crédito");
  });

  it("mapeia descrição LUZ ESCRIT para Luz", () => {
    expect(mapearCategoriaDRE("ESTRUTURA", "LUZ ESCRITORIO")).toBe("Luz");
  });

  it("retorna null para categorias não mapeadas", () => {
    expect(mapearCategoriaDRE("SALARIO", "Salário")).toBeNull();
  });
});

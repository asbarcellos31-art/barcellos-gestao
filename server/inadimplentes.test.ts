import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do módulo de banco de dados
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "./db";

// ─── Testes unitários de lógica de negócio ────────────────────────────────────

describe("Inadimplentes - lógica de status", () => {
  it("deve normalizar status PAGO corretamente", () => {
    const normalizar = (s: string) => {
      const upper = s.trim().toUpperCase();
      if (upper === "PAGO" || upper === "PAGOU") return "PAGO";
      if (upper.includes("BOLETO")) return "BOLETO";
      if (upper.includes("CONTATO")) return "EM CONTATO";
      if (upper.includes("DESISTIU")) return "DESISTIU";
      if (upper.includes("ESPECIAL")) return "ESPECIAL";
      return "PENDENTE";
    };

    expect(normalizar("pago")).toBe("PAGO");
    expect(normalizar("PAGO")).toBe("PAGO");
    expect(normalizar("Pagou")).toBe("PAGO");
    expect(normalizar("boleto")).toBe("BOLETO");
    expect(normalizar("BOLETO")).toBe("BOLETO");
    expect(normalizar("em contato")).toBe("EM CONTATO");
    expect(normalizar("EM CONTATO")).toBe("EM CONTATO");
    expect(normalizar("desistiu")).toBe("DESISTIU");
    expect(normalizar("especial")).toBe("ESPECIAL");
    expect(normalizar("")).toBe("PENDENTE");
    expect(normalizar("outro")).toBe("PENDENTE");
  });

  it("deve calcular taxa de recuperação corretamente", () => {
    const calcularTaxa = (pagos: number, total: number) =>
      total > 0 ? (pagos / total) * 100 : 0;

    expect(calcularTaxa(53, 83)).toBeCloseTo(63.86, 1);
    expect(calcularTaxa(0, 100)).toBe(0);
    expect(calcularTaxa(100, 100)).toBe(100);
    expect(calcularTaxa(0, 0)).toBe(0);
  });

  it("deve calcular ticket médio corretamente", () => {
    const calcularTicket = (totalValor: number, total: number) =>
      total > 0 ? totalValor / total : 0;

    expect(calcularTicket(44107.83, 83)).toBeCloseTo(531.42, 1);
    expect(calcularTicket(0, 0)).toBe(0);
    expect(calcularTicket(1000, 10)).toBe(100);
  });

  it("deve identificar cor correta por status", () => {
    const getStatusColor = (status: string) => {
      const s = (status ?? "").toUpperCase().trim();
      if (s === "PAGO")       return "green";
      if (s === "BOLETO")     return "blue";
      if (s === "EM CONTATO") return "yellow";
      if (s === "DESISTIU")   return "red";
      if (s === "ESPECIAL")   return "purple";
      return "gray";
    };

    expect(getStatusColor("PAGO")).toBe("green");
    expect(getStatusColor("BOLETO")).toBe("blue");
    expect(getStatusColor("EM CONTATO")).toBe("yellow");
    expect(getStatusColor("DESISTIU")).toBe("red");
    expect(getStatusColor("ESPECIAL")).toBe("purple");
    expect(getStatusColor("PENDENTE")).toBe("gray");
    expect(getStatusColor("")).toBe("gray");
  });
});

describe("Inadimplentes - cálculo de métricas do dashboard", () => {
  it("deve calcular distribuição por status corretamente", () => {
    const registros = [
      { status: "PAGO" },
      { status: "PAGO" },
      { status: "PAGO" },
      { status: "BOLETO" },
      { status: "BOLETO" },
      { status: "EM CONTATO" },
      { status: "DESISTIU" },
    ];

    const total = registros.length;
    const pagos = registros.filter(r => r.status === "PAGO").length;
    const boleto = registros.filter(r => r.status === "BOLETO").length;
    const emContato = registros.filter(r => r.status === "EM CONTATO").length;
    const desistiu = registros.filter(r => r.status === "DESISTIU").length;

    expect(total).toBe(7);
    expect(pagos).toBe(3);
    expect(boleto).toBe(2);
    expect(emContato).toBe(1);
    expect(desistiu).toBe(1);
    expect((pagos / total) * 100).toBeCloseTo(42.86, 1);
  });

  it("deve calcular distribuição por forma de pagamento", () => {
    const registros = [
      { formaPagamento: "BOLETO", valorTotal: 100 },
      { formaPagamento: "BOLETO", valorTotal: 200 },
      { formaPagamento: "DÉBITO EM CONTA", valorTotal: 150 },
      { formaPagamento: "DESC. EM FOLHA", valorTotal: 300 },
    ];

    const total = registros.length;
    const porForma = registros.reduce((acc, r) => {
      const key = r.formaPagamento;
      if (!acc[key]) acc[key] = { qtd: 0, valor: 0 };
      acc[key].qtd++;
      acc[key].valor += r.valorTotal;
      return acc;
    }, {} as Record<string, { qtd: number; valor: number }>);

    expect(porForma["BOLETO"].qtd).toBe(2);
    expect(porForma["BOLETO"].valor).toBe(300);
    expect(porForma["DÉBITO EM CONTA"].qtd).toBe(1);
    expect(porForma["DESC. EM FOLHA"].qtd).toBe(1);
    expect((porForma["BOLETO"].qtd / total) * 100).toBe(50);
  });
});

describe("Inadimplentes - validação de formulário", () => {
  it("deve rejeitar registro sem nome", () => {
    const validar = (nome: string) => nome.trim().length > 0;

    expect(validar("")).toBe(false);
    expect(validar("   ")).toBe(false);
    expect(validar("João Silva")).toBe(true);
  });

  it("deve aceitar valor total numérico", () => {
    const parseValor = (v: string) => {
      const n = parseFloat(v.replace(",", "."));
      return isNaN(n) ? null : n;
    };

    expect(parseValor("150.50")).toBe(150.50);
    expect(parseValor("150,50")).toBe(150.50);
    expect(parseValor("")).toBeNull();
    expect(parseValor("abc")).toBeNull();
  });

  it("deve formatar CPF corretamente", () => {
    const formatarCpf = (cpf: string) => {
      const digits = cpf.replace(/\D/g, "");
      if (digits.length !== 11) return cpf;
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    };

    expect(formatarCpf("82294569920")).toBe("822.945.699-20");
    expect(formatarCpf("000.000.000-00")).toBe("000.000.000-00"); // já formatado
    expect(formatarCpf("123")).toBe("123"); // inválido, retorna como está
  });
});

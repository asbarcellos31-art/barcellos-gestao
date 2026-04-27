import { describe, expect, it, vi, beforeEach } from "vitest";
import { buscarDadosMensagemDiaria } from "./mensagemDiariaDb";

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "./db";

// Mock do objeto db com select encadeado
function criarMockDb(resultadoMes: any[], resultadoAno: any[]) {
  let chamada = 0;
  const mockSelect = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockImplementation(() => {
      chamada++;
      return chamada === 1 ? Promise.resolve(resultadoMes) : Promise.resolve(resultadoAno);
    }),
  };
  return mockSelect;
}

describe("buscarDadosMensagemDiaria", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna null quando o banco não está disponível", async () => {
    (getDb as any).mockResolvedValue(null);
    const result = await buscarDadosMensagemDiaria(2, 2026);
    expect(result).toBeNull();
  });

  it("retorna estrutura completa com dados zerados quando não há registros", async () => {
    const mockDb = criarMockDb([], []);
    (getDb as any).mockResolvedValue(mockDb);

    const result = await buscarDadosMensagemDiaria(3, 2026);

    expect(result).not.toBeNull();
    expect(result?.mes).toBe(3);
    expect(result?.ano).toBe(2026);
    expect(result?.nomeMes).toBe("Março");
    expect(result?.receitaMes).toBe(0);
    expect(result?.receitaAno).toBe(0);
    expect(result?.propostasMes).toBe(0);
    expect(result?.cpfsNovosMes).toBe(0);
    expect(result?.porCorretorMes).toEqual([]);
    expect(result?.porCorretorAno).toEqual([]);
  });

  it("filtra corretores inválidos (com asterisco, vírgula)", async () => {
    const rows = [
      { corretor: "ELISIA",                  receita: "5000.00", propostas: 8, cpfsNovos: 3 },
      { corretor: "*VENDEDOR NÃO INFORMADO*", receita: "100.00",  propostas: 1, cpfsNovos: 0 },
      { corretor: "ELISIA, TAINÁ",            receita: "200.00",  propostas: 2, cpfsNovos: 0 },
      { corretor: "FERNANDA",                 receita: "3000.00", propostas: 9, cpfsNovos: 2 },
    ];
    const mockDb = criarMockDb(rows, rows);
    (getDb as any).mockResolvedValue(mockDb);

    const result = await buscarDadosMensagemDiaria(2, 2026);

    expect(result?.porCorretorMes).toHaveLength(2);
    expect(result?.porCorretorMes.map(r => r.corretor)).toEqual(["ELISIA", "FERNANDA"]);
  });

  it("calcula totais do mês corretamente", async () => {
    const rows = [
      { corretor: "ELISIA",   receita: "1520.65", propostas: 8, cpfsNovos: 2 },
      { corretor: "FERNANDA", receita: "2353.69", propostas: 9, cpfsNovos: 2 },
      { corretor: "NAYARA",   receita: "411.45",  propostas: 2, cpfsNovos: 0 },
    ];
    const mockDb = criarMockDb(rows, rows);
    (getDb as any).mockResolvedValue(mockDb);

    const result = await buscarDadosMensagemDiaria(2, 2026);

    expect(result?.receitaMes).toBeCloseTo(4285.79, 1);
    expect(result?.propostasMes).toBe(19);
    expect(result?.cpfsNovosMes).toBe(4);
  });

  it("calcula percentuais anuais corretamente", async () => {
    const rowsMes = [
      { corretor: "ELISIA",   receita: "1520.65", propostas: 8, cpfsNovos: 2 },
      { corretor: "FERNANDA", receita: "2353.69", propostas: 9, cpfsNovos: 2 },
    ];
    const rowsAno = [
      { corretor: "ELISIA",   receita: "10000.00", propostas: 14, cpfsNovos: 5 },
      { corretor: "FERNANDA", receita: "5000.00",  propostas: 17, cpfsNovos: 7 },
    ];
    const mockDb = criarMockDb(rowsMes, rowsAno);
    (getDb as any).mockResolvedValue(mockDb);

    const result = await buscarDadosMensagemDiaria(2, 2026);

    expect(result?.receitaAno).toBe(15000);
    const elisia = result?.porCorretorAno.find(r => r.corretor === "ELISIA");
    const fernanda = result?.porCorretorAno.find(r => r.corretor === "FERNANDA");
    expect(elisia?.percentualAno).toBe(67);
    expect(fernanda?.percentualAno).toBe(33);
  });

  it("retorna nome do mês correto para todos os meses", async () => {
    const mockDb = criarMockDb([], []);
    (getDb as any).mockResolvedValue(mockDb);

    const meses = [
      [1, "Janeiro"], [2, "Fevereiro"], [3, "Março"], [4, "Abril"],
      [5, "Maio"], [6, "Junho"], [7, "Julho"], [8, "Agosto"],
      [9, "Setembro"], [10, "Outubro"], [11, "Novembro"], [12, "Dezembro"],
    ];

    for (const [m, nome] of meses) {
      const result = await buscarDadosMensagemDiaria(m as number, 2026);
      expect(result?.nomeMes).toBe(nome);
    }
  });
});

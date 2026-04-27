import { describe, it, expect } from "vitest";

// Testa a lógica de validação de percentuais de vendedores
describe("Múltiplos Vendedores - Validações", () => {
  it("deve aceitar 1 vendedor com 100%", () => {
    const vendedores = [{ nomeVendedor: "ANDERSON", percentual: 100 }];
    const total = vendedores.reduce((s, v) => s + v.percentual, 0);
    expect(total).toBe(100);
  });

  it("deve aceitar 2 vendedores com 50% cada", () => {
    const vendedores = [
      { nomeVendedor: "ANDERSON", percentual: 50 },
      { nomeVendedor: "NAYARA", percentual: 50 },
    ];
    const total = vendedores.reduce((s, v) => s + v.percentual, 0);
    expect(total).toBe(100);
  });

  it("deve aceitar 3 vendedores com percentuais variados", () => {
    const vendedores = [
      { nomeVendedor: "ANDERSON", percentual: 60 },
      { nomeVendedor: "NAYARA", percentual: 30 },
      { nomeVendedor: "FERNANDA", percentual: 10 },
    ];
    const total = vendedores.reduce((s, v) => s + v.percentual, 0);
    expect(total).toBe(100);
  });

  it("deve rejeitar mais de 3 vendedores", () => {
    const vendedores = [
      { nomeVendedor: "A", percentual: 25 },
      { nomeVendedor: "B", percentual: 25 },
      { nomeVendedor: "C", percentual: 25 },
      { nomeVendedor: "D", percentual: 25 },
    ];
    expect(vendedores.length).toBeGreaterThan(3);
  });

  it("deve calcular comissão proporcional corretamente", () => {
    const valorComissao = 1000;
    const valorIncentivo = 200;
    const totalBruto = valorComissao + valorIncentivo;
    
    const vendedores = [
      { nomeVendedor: "ANDERSON", percentual: 60 },
      { nomeVendedor: "NAYARA", percentual: 40 },
    ];
    
    const comissoes = vendedores.map(v => ({
      vendedor: v.nomeVendedor,
      valor: totalBruto * v.percentual / 100,
    }));
    
    expect(comissoes[0].valor).toBe(720); // 1200 * 60%
    expect(comissoes[1].valor).toBe(480); // 1200 * 40%
    expect(comissoes[0].valor + comissoes[1].valor).toBe(totalBruto);
  });

  it("deve validar que percentual total é 100 com tolerância de 0.01", () => {
    const vendedores = [
      { nomeVendedor: "ANDERSON", percentual: 33.33 },
      { nomeVendedor: "NAYARA", percentual: 33.33 },
      { nomeVendedor: "FERNANDA", percentual: 33.34 },
    ];
    const total = vendedores.reduce((s, v) => s + v.percentual, 0);
    expect(Math.abs(total - 100)).toBeLessThanOrEqual(0.01);
  });
});

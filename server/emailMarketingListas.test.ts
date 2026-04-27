import { describe, it, expect } from "vitest";

describe("Email Marketing - Criar Listas a partir de Aberturas", () => {

  it("deve filtrar corretamente contatos que abriram o email", () => {
    const envios = [
      { email: "contato1@test.com", aberturas: 2, status: "ENVIADO" },
      { email: "contato2@test.com", aberturas: 0, status: "ENVIADO" },
      { email: "contato3@test.com", aberturas: 1, status: "ENVIADO" },
    ];

    const abriram = envios.filter((e) => e.aberturas > 0);
    expect(abriram.length).toBe(2);
    expect(abriram.map((e) => e.email)).toEqual([
      "contato1@test.com",
      "contato3@test.com",
    ]);
  });

  it("deve filtrar corretamente contatos que NÃO abriram o email", () => {
    const envios = [
      { email: "contato1@test.com", aberturas: 2, status: "ENVIADO" },
      { email: "contato2@test.com", aberturas: 0, status: "ENVIADO" },
      { email: "contato3@test.com", aberturas: 1, status: "ENVIADO" },
    ];

    const naoAbriram = envios.filter(
      (e) => e.status === "ENVIADO" && e.aberturas === 0
    );
    expect(naoAbriram.length).toBe(1);
    expect(naoAbriram[0].email).toBe("contato2@test.com");
  });

  it("deve calcular corretamente a taxa de abertura", () => {
    const envios = [
      { email: "contato1@test.com", aberturas: 2, status: "ENVIADO" },
      { email: "contato2@test.com", aberturas: 0, status: "ENVIADO" },
      { email: "contato3@test.com", aberturas: 1, status: "ENVIADO" },
    ];

    const enviados = envios.filter((e) => e.status === "ENVIADO");
    const abriram = enviados.filter((e) => e.aberturas > 0);
    const taxaAbertura = (abriram.length / enviados.length) * 100;

    expect(enviados.length).toBe(3);
    expect(abriram.length).toBe(2);
    expect(taxaAbertura).toBeCloseTo(66.67, 1);
  });

  it("deve validar lógica de contagem para criar listas", () => {
    const envios = [
      { email: "contato1@test.com", aberturas: 2, status: "ENVIADO", abertoPrimeiramente: new Date() },
      { email: "contato2@test.com", aberturas: 0, status: "ENVIADO", abertoPrimeiramente: null },
      { email: "contato3@test.com", aberturas: 1, status: "ENVIADO", abertoPrimeiramente: new Date() },
    ];

    // Simular criação de lista de quem abriu
    const listaAbriram = envios.filter((e) => e.aberturas > 0);
    expect(listaAbriram.length).toBe(2);

    // Simular criação de lista de quem não abriu
    const listaNaoAbriram = envios.filter(
      (e) => e.status === "ENVIADO" && e.aberturas === 0
    );
    expect(listaNaoAbriram.length).toBe(1);

    // Validar que as listas são complementares
    expect(listaAbriram.length + listaNaoAbriram.length).toBe(
      envios.filter((e) => e.status === "ENVIADO").length
    );
  });
});

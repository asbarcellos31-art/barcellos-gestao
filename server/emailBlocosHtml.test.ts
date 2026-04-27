import { describe, it, expect } from "vitest";
import { resolverCorpoTemplate } from "./emailBlocosHtml";

const BLOCKS_PREFIX = "BLOCKS:";

describe("resolverCorpoTemplate", () => {
  it("retorna HTML legado sem modificação", () => {
    const html = "<html><body><p>Olá, {{nome}}!</p></body></html>";
    const result = resolverCorpoTemplate(html, null, null);
    expect(result).toBe(html);
  });

  it("gera HTML a partir de blocos de texto", () => {
    const blocos = [
      { id: "abc123", tipo: "texto", conteudo: "Parágrafo um\nParágrafo dois" },
    ];
    const corpo = BLOCKS_PREFIX + JSON.stringify(blocos);
    const result = resolverCorpoTemplate(corpo, "Olá, {{nome}}!", "Atenciosamente");
    expect(result).toContain("Parágrafo um");
    expect(result).toContain("Parágrafo dois");
    expect(result).toContain("Olá, {{nome}}!");
    expect(result).toContain("Atenciosamente");
    expect(result).toContain("<!DOCTYPE html>");
  });

  it("gera HTML com bloco callout amarelo", () => {
    const blocos = [
      { id: "b1", tipo: "callout", cor: "amarelo", titulo: "Atenção!", conteudo: "Mensagem importante" },
    ];
    const corpo = BLOCKS_PREFIX + JSON.stringify(blocos);
    const result = resolverCorpoTemplate(corpo, null, null);
    expect(result).toContain("Atenção!");
    expect(result).toContain("Mensagem importante");
    expect(result).toContain("#fffbeb"); // cor de fundo amarelo
    expect(result).toContain("#f59e0b"); // borda amarela
  });

  it("gera HTML com bloco botão WhatsApp", () => {
    const blocos = [
      { id: "b2", tipo: "botao", tipoBotao: "whatsapp", texto: "Falar no WhatsApp", url: "https://wa.me/5562999999999" },
    ];
    const corpo = BLOCKS_PREFIX + JSON.stringify(blocos);
    const result = resolverCorpoTemplate(corpo, null, null);
    expect(result).toContain("Falar no WhatsApp");
    expect(result).toContain("https://wa.me/5562999999999");
    expect(result).toContain("#25d366"); // cor WhatsApp
  });

  it("gera HTML com bloco rodapé", () => {
    const blocos = [
      {
        id: "b3",
        tipo: "rodape",
        empresa: "Barcellos Seguros",
        endereco: "Goiânia - GO",
        email: "atendimento@barcellosseguros.com",
        telefone: "(62) 99999-9999",
        site: "www.barcellosseguros.com.br",
      },
    ];
    const corpo = BLOCKS_PREFIX + JSON.stringify(blocos);
    const result = resolverCorpoTemplate(corpo, null, null);
    expect(result).toContain("Barcellos Seguros");
    expect(result).toContain("Goiânia - GO");
    expect(result).toContain("atendimento@barcellosseguros.com");
  });

  it("retorna corpo original se JSON inválido", () => {
    const corpoInvalido = BLOCKS_PREFIX + "{ invalid json }";
    const result = resolverCorpoTemplate(corpoInvalido, null, null);
    expect(result).toBe(corpoInvalido);
  });

  it("inclui saudação e assinatura no HTML gerado", () => {
    const blocos = [{ id: "t1", tipo: "texto", conteudo: "Conteúdo do e-mail." }];
    const corpo = BLOCKS_PREFIX + JSON.stringify(blocos);
    const result = resolverCorpoTemplate(
      corpo,
      "Olá, {{nome}}! Bem-vindo.",
      "Atenciosamente,\nEquipe Barcellos"
    );
    expect(result).toContain("Olá, {{nome}}! Bem-vindo.");
    expect(result).toContain("Atenciosamente,");
  });

  it("preserva tags HTML inline (negrito, itálico, sublinhado) no bloco de texto", () => {
    const blocos = [
      {
        id: "t1",
        tipo: "texto",
        conteudo: "Texto com <strong>negrito</strong>, <em>itálico</em> e <u>sublinhado</u>.",
      },
    ];
    const corpo = BLOCKS_PREFIX + JSON.stringify(blocos);
    const result = resolverCorpoTemplate(corpo, null, null);
    expect(result).toContain("<strong>negrito</strong>");
    expect(result).toContain("<em>itálico</em>");
    expect(result).toContain("<u>sublinhado</u>");
  });

  it("preserva tags HTML inline no bloco callout", () => {
    const blocos = [
      {
        id: "c1",
        tipo: "callout",
        cor: "verde",
        titulo: "Aviso",
        conteudo: "Valor <strong>R$ 500,00</strong> com vencimento em <em>31/03/2026</em>.",
      },
    ];
    const corpo = BLOCKS_PREFIX + JSON.stringify(blocos);
    const result = resolverCorpoTemplate(corpo, null, null);
    expect(result).toContain("<strong>R$ 500,00</strong>");
    expect(result).toContain("<em>31/03/2026</em>");
  });

  it("gera HTML com múltiplos blocos na ordem correta", () => {
    const blocos = [
      { id: "t1", tipo: "texto", conteudo: "Primeiro bloco" },
      { id: "c1", tipo: "callout", cor: "azul", titulo: "Info", conteudo: "Segundo bloco" },
      { id: "b1", tipo: "botao", tipoBotao: "site", texto: "Visitar site", url: "https://barcellosseguros.com.br" },
    ];
    const corpo = BLOCKS_PREFIX + JSON.stringify(blocos);
    const result = resolverCorpoTemplate(corpo, null, null);
    const pos1 = result.indexOf("Primeiro bloco");
    const pos2 = result.indexOf("Segundo bloco");
    const pos3 = result.indexOf("Visitar site");
    expect(pos1).toBeGreaterThan(-1);
    expect(pos2).toBeGreaterThan(-1);
    expect(pos3).toBeGreaterThan(-1);
    expect(pos1).toBeLessThan(pos2);
    expect(pos2).toBeLessThan(pos3);
  });
});

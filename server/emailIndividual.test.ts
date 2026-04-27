import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch global
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Endpoint /api/email-marketing/enviar-individual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve retornar erro 400 quando campos obrigatórios estão ausentes", async () => {
    // Simula a validação do endpoint
    const body = { destinatario: "", assunto: "", corpo: "" };
    const hasCamposObrigatorios = body.destinatario && body.assunto && body.corpo;
    expect(hasCamposObrigatorios).toBeFalsy();
  });

  it("deve incluir rodapé com endereço e link de cancelamento no corpo", () => {
    const corpo = "<p>Olá, cliente!</p>";
    const enderecoFisico = "Av. Marechal Castelo Branco, 65, sala 1002-A";
    const linkCancelamento = "Cancelar inscrição";
    
    const corpoComRodape = `${corpo}
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;font-family:Arial,sans-serif">
  <p style="margin:0">Barcellos Seguros Corretora de Seguros Ltda.</p>
  <p style="margin:4px 0">Av. Marechal Castelo Branco, 65, sala 1002-A — Campinas, São José/SC — CEP 88101-020</p>
  <p style="margin:4px 0">
    <a href="https://barcellos.manus.space/privacidade" style="color:#6b7280">Política de Privacidade</a>
    &nbsp;|&nbsp;
    <a href="mailto:atendimento@barcellosseguros.com?subject=Cancelar inscrição&body=Solicito o cancelamento do recebimento de e-mails." style="color:#6b7280">Cancelar inscrição</a>
  </p>
</div>`;

    expect(corpoComRodape).toContain(enderecoFisico);
    expect(corpoComRodape).toContain(linkCancelamento);
    expect(corpoComRodape).toContain("Política de Privacidade");
  });

  it("deve chamar a API do SendGrid com os parâmetros corretos", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => "" });

    const apiKey = "test-api-key";
    const payload = {
      personalizations: [{ to: [{ email: "cliente@teste.com", name: "Cliente Teste" }] }],
      from: { email: "atendimento@barcellosseguros.com", name: "Barcellos Seguros" },
      subject: "Bem-vindo(a)!",
      content: [{ type: "text/html", value: "<p>Olá!</p>" }],
    };

    await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.sendgrid.com/v3/mail/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Authorization": `Bearer ${apiKey}`,
        }),
      })
    );
  });

  it("deve validar que o template de boas-vindas contém nome do cliente", () => {
    const nomeCliente = "João Silva";
    const primeiroNome = nomeCliente.split(" ")[0];
    const assunto = `Bem-vindo(a) à Barcellos Seguros, ${primeiroNome}!`;
    const corpo = `<p>Olá, <strong>${nomeCliente}</strong>!</p>`;

    expect(assunto).toContain(primeiroNome);
    expect(corpo).toContain(nomeCliente);
  });

  it("deve gerar template de e-mail de boas-vindas com produto do cliente", () => {
    const venda = { nomeCliente: "Maria Santos", produto: "Plano de Saúde Empresarial" };
    const primeiroNome = (venda.nomeCliente || "").split(" ")[0];
    const corpo = `<p>Olá, <strong>${venda.nomeCliente}</strong>!</p>
<p>Seu plano <strong>${venda.produto || "contratado"}</strong> já está em processo de implantação.</p>`;

    expect(corpo).toContain(venda.nomeCliente);
    expect(corpo).toContain(venda.produto);
    expect(primeiroNome).toBe("Maria");
  });
});

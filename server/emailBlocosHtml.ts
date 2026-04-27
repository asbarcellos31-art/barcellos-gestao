/**
 * emailBlocosHtml.ts
 * Utilitário para converter blocos JSON de templates de e-mail em HTML.
 * Usado no backend ao enviar campanhas e ao gerar previews.
 */

const BLOCKS_PREFIX = "BLOCKS:";

type CalloutColor = "amarelo" | "azul" | "verde" | "vermelho";
type BotaoTipo = "whatsapp" | "site" | "link";

interface BlocoTexto { id: string; tipo: "texto"; conteudo: string; }
interface BlocoCallout { id: string; tipo: "callout"; cor: CalloutColor; titulo: string; conteudo: string; }
interface BlocoBotao { id: string; tipo: "botao"; tipoBotao: BotaoTipo; texto: string; url: string; }
interface BlocoRodape { id: string; tipo: "rodape"; empresa: string; endereco: string; email: string; telefone: string; site: string; }
type Bloco = BlocoTexto | BlocoCallout | BlocoBotao | BlocoRodape;

const CALLOUT_CORES: Record<CalloutColor, { bg: string; border: string; titulo: string }> = {
  amarelo:  { bg: "#fffbeb", border: "#f59e0b", titulo: "#92400e" },
  azul:     { bg: "#eff6ff", border: "#3b82f6", titulo: "#1e40af" },
  verde:    { bg: "#f0fdf4", border: "#22c55e", titulo: "#166534" },
  vermelho: { bg: "#fef2f2", border: "#ef4444", titulo: "#991b1b" },
};

function renderBloco(b: Bloco): string {
  switch (b.tipo) {
    case "texto":
      return b.conteudo
        .split("\n")
        .filter(l => l.trim())
        .map(l => `<p style="margin:0 0 12px 0;color:#333;font-size:15px;line-height:1.7;">${l}</p>`)
        .join("\n");

    case "callout": {
      const c = CALLOUT_CORES[b.cor] ?? CALLOUT_CORES.amarelo;
      return `<div style="background:${c.bg};border-left:4px solid ${c.border};border-radius:6px;padding:14px 18px;margin:16px 0;">
${b.titulo ? `  <p style="margin:0 0 6px 0;font-weight:bold;color:${c.titulo};font-size:14px;">${b.titulo}</p>` : ""}
  <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${b.conteudo.replace(/\n/g, "<br>")}</p>
</div>`;
    }

    case "botao": {
      const cores: Record<BotaoTipo, string> = {
        whatsapp: "#25d366",
        site:     "#1e3a5f",
        link:     "#6366f1",
      };
      const icone = b.tipoBotao === "whatsapp" ? "💬 " : b.tipoBotao === "site" ? "🌐 " : "🔗 ";
      return `<div style="text-align:center;margin:20px 0;">
  <a href="${b.url}" style="display:inline-block;background:${cores[b.tipoBotao]};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:600;">${icone}${b.texto}</a>
</div>`;
    }

    case "rodape": {
      const siteUrl = b.site ? (b.site.startsWith("http") ? b.site : "https://" + b.site) : "";
      const waUrl = b.telefone ? `https://wa.me/55${b.telefone.replace(/\D/g, "")}` : "";
      return `<div style="background:#f8faff;padding:28px 24px;text-align:center;border-top:1px solid #e5eaf5;">
  <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663348080686/8JHGDJiU4qZSTzCTFQYFKy/barcellos-logo-transparent_1ecfd1d9.png" alt="${b.empresa}" style="height:52px;display:block;margin:0 auto 14px;max-width:200px">
  <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-bottom:8px;">
    ${siteUrl ? `<a href="${siteUrl}" style="font-size:12px;color:#2d4a8a;text-decoration:none;font-weight:600;">\u{1f310} ${b.site}</a>` : ""}
    ${waUrl ? `<a href="${waUrl}" style="font-size:12px;color:#2d4a8a;text-decoration:none;font-weight:600;">\u{1f4ac} WhatsApp</a>` : ""}
    ${b.email ? `<a href="mailto:${b.email}" style="font-size:12px;color:#2d4a8a;text-decoration:none;font-weight:600;">\u{1f4e7} ${b.email}</a>` : ""}
  </div>
  ${b.endereco ? `<p style="font-size:11px;color:#aaa;margin:4px 0 0;">${b.endereco}</p>` : ""}
  <p style="font-size:11px;color:#aaa;margin:8px 0 0;">Para cancelar o recebimento, responda com &quot;DESCADASTRAR&quot;.</p>
</div>`;
    }

    default:
      return "";
  }
}

/**
 * Converte o corpo de um template (JSON de blocos ou HTML legado) em HTML pronto para envio.
 * Se o corpo for HTML legado, retorna como está.
 */
export function resolverCorpoTemplate(
  corpo: string,
  saudacao?: string | null,
  assinatura?: string | null
): string {
  if (!corpo.startsWith(BLOCKS_PREFIX)) {
    // HTML legado — retorna como está
    return corpo;
  }

  let blocos: Bloco[];
  try {
    blocos = JSON.parse(corpo.slice(BLOCKS_PREFIX.length)) as Bloco[];
  } catch {
    return corpo; // fallback
  }

  const saudacaoHtml = saudacao
    ? `<div style="font-size:17px;font-weight:bold;color:#1e3a5f;margin-bottom:16px;">${saudacao}</div>`
    : "";

  const assinaturaHtml = assinatura
    ? `<div style="margin-top:32px;padding-top:20px;border-top:1px solid #e5e7eb;color:#555;font-size:14px;white-space:pre-line;">${assinatura}</div>`
    : "";

  const blocosHtml = blocos.map(renderBloco).join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
  <div style="background:#1e3a5f;padding:24px 32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:1px;">Barcellos Seguros</h1>
    <p style="color:#a8c4e0;margin:4px 0 0;font-size:13px;">Cuidando de quem você ama</p>
  </div>
  <div style="padding:32px;color:#333;line-height:1.7;font-size:15px;">
    ${saudacaoHtml}
    ${blocosHtml}
    ${assinaturaHtml}
  </div>
</div>
</body></html>`;
}

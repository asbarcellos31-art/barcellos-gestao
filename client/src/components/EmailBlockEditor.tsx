/**
 * EmailBlockEditor — Editor visual de blocos para templates de e-mail
 *
 * Tipos de bloco suportados:
 *  - texto      : parágrafo de texto livre (com variáveis e formatação)
 *  - callout    : caixa de destaque colorida (amarelo, azul, verde, vermelho)
 *  - botao      : botão de ação (WhatsApp, site, link personalizado)
 *  - rodape     : rodapé com logo, endereço e links sociais
 *
 * O conteúdo é armazenado como JSON (prefixo BLOCKS:) no campo `corpo`.
 * Templates antigos (HTML puro) continuam funcionando no preview.
 *
 * Formatação de texto: negrito (<strong>), itálico (<em>), sublinhado (<u>)
 * via toolbar que envolve o texto selecionado com as tags HTML correspondentes.
 */

import React, { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  Link,
  AlignLeft,
  AlertCircle,
  LayoutTemplate,
  MessageSquare,
  Globe,
  Bold,
  Italic,
  Underline,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Palette,
  Link2,
} from "lucide-react";

// ─── Tipos de bloco ───────────────────────────────────────────────────────────

export type CalloutColor = "amarelo" | "azul" | "verde" | "vermelho";
export type BotaoTipo = "whatsapp" | "site" | "link";

export interface BlocoTexto {
  id: string;
  tipo: "texto";
  conteudo: string; // HTML com tags <strong>, <em>, <u>
}

export interface BlocoCallout {
  id: string;
  tipo: "callout";
  cor: CalloutColor;
  titulo: string;
  conteudo: string; // HTML com tags <strong>, <em>, <u>
}

export interface BlocoBotao {
  id: string;
  tipo: "botao";
  tipoBotao: BotaoTipo;
  texto: string;
  url: string;
}

export interface BlocoRodape {
  id: string;
  tipo: "rodape";
  empresa: string;
  endereco: string;
  email: string;
  telefone: string;
  site: string;
}

export type Bloco = BlocoTexto | BlocoCallout | BlocoBotao | BlocoRodape;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gerarId(): string {
  return Math.random().toString(36).slice(2, 9);
}

const CALLOUT_CORES: Record<CalloutColor, { bg: string; border: string; titulo: string; label: string }> = {
  amarelo: { bg: "#fffbeb", border: "#f59e0b", titulo: "#92400e", label: "Amarelo" },
  azul:    { bg: "#eff6ff", border: "#3b82f6", titulo: "#1e40af", label: "Azul" },
  verde:   { bg: "#f0fdf4", border: "#22c55e", titulo: "#166534", label: "Verde" },
  vermelho:{ bg: "#fef2f2", border: "#ef4444", titulo: "#991b1b", label: "Vermelho" },
};

// ─── Serialização ─────────────────────────────────────────────────────────────

export const BLOCKS_PREFIX = "BLOCKS:";

export function serializarBlocos(blocos: Bloco[]): string {
  return BLOCKS_PREFIX + JSON.stringify(blocos);
}

export function deserializarBlocos(corpo: string): Bloco[] | null {
  if (!corpo.startsWith(BLOCKS_PREFIX)) return null;
  try {
    return JSON.parse(corpo.slice(BLOCKS_PREFIX.length)) as Bloco[];
  } catch {
    return null;
  }
}

// ─── Geração de HTML ──────────────────────────────────────────────────────────

export function gerarHtmlDeBlocos(
  saudacao: string,
  assinatura: string,
  blocos: Bloco[]
): string {
  const renderBloco = (b: Bloco): string => {
    switch (b.tipo) {
      case "texto": {
        // Conteúdo é HTML rico (strong, em, u, span style, ul, ol, a)
        // Envolvemos num <div> wrapper com estilo padrão para o e-mail
        return `<div style="margin:0 0 12px 0;color:#333;font-size:15px;line-height:1.7;">${b.conteudo || ""}</div>`;
      }

      case "callout": {
        const c = CALLOUT_CORES[b.cor];
        return `<div style="background:${c.bg};border-left:4px solid ${c.border};border-radius:6px;padding:14px 18px;margin:16px 0;">
  ${b.titulo ? `<p style="margin:0 0 6px 0;font-weight:bold;color:${c.titulo};font-size:14px;">${b.titulo}</p>` : ""}
  <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${b.conteudo.replace(/\n/g, "<br>")}</p>
</div>`;
      }

      case "botao": {
        const cores: Record<BotaoTipo, { bg: string }> = {
          whatsapp: { bg: "#25d366" },
          site:     { bg: "#1e3a5f" },
          link:     { bg: "#6366f1" },
        };
        const cor = cores[b.tipoBotao];
        const icone = b.tipoBotao === "whatsapp"
          ? `<span style="margin-right:8px;">💬</span>`
          : b.tipoBotao === "site"
          ? `<span style="margin-right:8px;">🌐</span>`
          : `<span style="margin-right:8px;">🔗</span>`;
        return `<div style="text-align:center;margin:20px 0;">
  <a href="${b.url}" style="display:inline-block;background:${cor.bg};color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:600;">${icone}${b.texto}</a>
</div>`;
      }

      case "rodape": {
        const siteUrl = b.site ? (b.site.startsWith("http") ? b.site : "https://" + b.site) : "";
        const waUrl = b.telefone ? `https://wa.me/55${b.telefone.replace(/\D/g, "")}` : "";
        return `<div style="background:#f8faff;padding:28px 24px;text-align:center;border-top:1px solid #e5eaf5;">
  <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663348080686/8JHGDJiU4qZSTzCTFQYFKy/barcellos-logo-transparent_1ecfd1d9.png" alt="${b.empresa}" style="height:52px;display:block;margin:0 auto 14px;max-width:200px">
  <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-bottom:8px;">
    ${siteUrl ? `<a href="${siteUrl}" style="font-size:12px;color:#2d4a8a;text-decoration:none;font-weight:600;">🌐 ${b.site}</a>` : ""}
    ${waUrl ? `<a href="${waUrl}" style="font-size:12px;color:#2d4a8a;text-decoration:none;font-weight:600;">💬 WhatsApp</a>` : ""}
    ${b.email ? `<a href="mailto:${b.email}" style="font-size:12px;color:#2d4a8a;text-decoration:none;font-weight:600;">📧 ${b.email}</a>` : ""}
  </div>
  ${b.endereco ? `<p style="font-size:11px;color:#aaa;margin:4px 0 0;">${b.endereco}</p>` : ""}
  <p style="font-size:11px;color:#aaa;margin:8px 0 0;">Para cancelar o recebimento, responda com &quot;DESCADASTRAR&quot;.</p>
</div>`;
      }

      default:
        return "";
    }
  };

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

// ─── Toolbar de formatação de texto ───────────────────────────────────────────

const FONTES_DISPONIVEIS = [
  { label: "Padrão", value: "" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', Helvetica, sans-serif" },
];

const TAMANHOS_DISPONIVEIS = [
  { label: "Padrão", value: "" },
  { label: "10px", value: "10px" },
  { label: "12px", value: "12px" },
  { label: "14px", value: "14px" },
  { label: "16px", value: "16px" },
  { label: "18px", value: "18px" },
  { label: "20px", value: "20px" },
  { label: "24px", value: "24px" },
  { label: "28px", value: "28px" },
  { label: "32px", value: "32px" },
];

const CORES_RAPIDAS = [
  "#000000", "#374151", "#6b7280", "#dc2626", "#ea580c",
  "#d97706", "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777",
];

/**
 * Aplica ou remove uma tag HTML inline ao redor do texto selecionado
 * no elemento contenteditable referenciado.
 */
function aplicarFormato(
  ref: React.RefObject<HTMLDivElement | null>,
  acao: "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList" | "justifyLeft" | "justifyCenter" | "justifyRight",
  onChange: (html: string) => void
) {
  const el = ref.current;
  if (!el) return;
  el.focus();

  document.execCommand(acao, false);

  onChange(el.innerHTML);
}

function aplicarEstiloInline(
  ref: React.RefObject<HTMLDivElement | null>,
  estilo: "fontName" | "fontSize" | "foreColor",
  valor: string,
  onChange: (html: string) => void
) {
  const el = ref.current;
  if (!el) return;
  el.focus();

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.getRangeAt(0).collapsed) return;

  if (estilo === "fontName") {
    document.execCommand("fontName", false, valor);
  } else if (estilo === "fontSize") {
    // Truque para usar tamanho em px: aplica fontSize=7 (placeholder) e depois substitui
    document.execCommand("fontSize", false, "7");
    // Acha as tags <font size="7"> e converte para span com font-size em px
    const fonts = el.querySelectorAll<HTMLElement>('font[size="7"]');
    fonts.forEach(f => {
      const span = document.createElement("span");
      span.style.fontSize = valor;
      span.innerHTML = f.innerHTML;
      f.replaceWith(span);
    });
  } else if (estilo === "foreColor") {
    document.execCommand("foreColor", false, valor);
  }

  onChange(el.innerHTML);
}

function inserirLink(
  ref: React.RefObject<HTMLDivElement | null>,
  onChange: (html: string) => void
) {
  const el = ref.current;
  if (!el) return;
  el.focus();

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.getRangeAt(0).collapsed) {
    alert("Selecione o texto que quer transformar em link.");
    return;
  }

  const url = prompt("URL do link:", "https://");
  if (!url) return;

  document.execCommand("createLink", false, url);
  onChange(el.innerHTML);
}

interface FormatToolbarProps {
  editorRef: React.RefObject<HTMLDivElement | null>;
  onChange: (html: string) => void;
}

function FormatToolbar({ editorRef, onChange }: FormatToolbarProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);

  const btn = (
    icon: React.ReactNode,
    acao: "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList" | "justifyLeft" | "justifyCenter" | "justifyRight",
    title: string
  ) => (
    <button
      type="button"
      onMouseDown={e => {
        e.preventDefault();
        aplicarFormato(editorRef, acao, onChange);
      }}
      title={title}
      className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
    >
      {icon}
    </button>
  );

  return (
    <div className="flex items-center flex-wrap gap-0.5 px-2 py-1 bg-gray-100 border border-b-0 rounded-t-md">
      {/* Fonte */}
      <select
        onMouseDown={e => e.preventDefault()}
        onChange={e => {
          if (e.target.value) {
            aplicarEstiloInline(editorRef, "fontName", e.target.value, onChange);
            e.target.value = "";
          }
        }}
        className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white hover:bg-gray-50 cursor-pointer"
        title="Tipo de fonte (selecione texto antes)"
      >
        {FONTES_DISPONIVEIS.map(f => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      {/* Tamanho */}
      <select
        onMouseDown={e => e.preventDefault()}
        onChange={e => {
          if (e.target.value) {
            aplicarEstiloInline(editorRef, "fontSize", e.target.value, onChange);
            e.target.value = "";
          }
        }}
        className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white hover:bg-gray-50 cursor-pointer ml-1"
        title="Tamanho da fonte (selecione texto antes)"
      >
        {TAMANHOS_DISPONIVEIS.map(t => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Negrito, Itálico, Sublinhado */}
      {btn(<Bold className="h-3.5 w-3.5" />, "bold", "Negrito (Ctrl+B)")}
      {btn(<Italic className="h-3.5 w-3.5" />, "italic", "Itálico (Ctrl+I)")}
      {btn(<Underline className="h-3.5 w-3.5" />, "underline", "Sublinhado (Ctrl+U)")}

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Cor do texto */}
      <div className="relative">
        <button
          type="button"
          onMouseDown={e => {
            e.preventDefault();
            setShowColorPicker(!showColorPicker);
          }}
          title="Cor do texto"
          className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors flex items-center"
        >
          <Palette className="h-3.5 w-3.5" />
        </button>
        {showColorPicker && (
          <div className="absolute top-full left-0 mt-1 p-2 bg-white border border-gray-300 rounded shadow-lg z-50 flex flex-wrap gap-1" style={{ width: 140 }}>
            {CORES_RAPIDAS.map(cor => (
              <button
                key={cor}
                type="button"
                onMouseDown={e => {
                  e.preventDefault();
                  aplicarEstiloInline(editorRef, "foreColor", cor, onChange);
                  setShowColorPicker(false);
                }}
                className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
                style={{ background: cor }}
                title={cor}
              />
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Listas */}
      {btn(<List className="h-3.5 w-3.5" />, "insertUnorderedList", "Lista com marcadores")}
      {btn(<ListOrdered className="h-3.5 w-3.5" />, "insertOrderedList", "Lista numerada")}

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Alinhamento */}
      {btn(<AlignLeft className="h-3.5 w-3.5" />, "justifyLeft", "Alinhar à esquerda")}
      {btn(<AlignCenter className="h-3.5 w-3.5" />, "justifyCenter", "Centralizar")}
      {btn(<AlignRight className="h-3.5 w-3.5" />, "justifyRight", "Alinhar à direita")}

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Link */}
      <button
        type="button"
        onMouseDown={e => {
          e.preventDefault();
          inserirLink(editorRef, onChange);
        }}
        title="Inserir link"
        className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
      >
        <Link2 className="h-3.5 w-3.5" />
      </button>

      <span className="text-[10px] text-gray-400 ml-auto select-none hidden sm:inline">Selecione o texto e clique</span>
    </div>
  );
}

// ─── Editor contenteditable com toolbar ───────────────────────────────────────

interface RichTextEditorProps {
  value: string; // HTML
  onChange: (html: string) => void;
  placeholder?: string;
  minRows?: number;
}

function RichTextEditor({ value, onChange, placeholder, minRows = 3 }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef(value);

  // Sincroniza o HTML externo → DOM apenas quando o valor muda externamente
  // (evita resetar o cursor enquanto o usuário digita)
  const handleRef = useCallback(
    (node: HTMLDivElement | null) => {
      (editorRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (node && node.innerHTML !== value) {
        node.innerHTML = value;
        lastValueRef.current = value;
      }
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Quando o valor externo muda (ex: ao abrir outro template), sincroniza
  React.useEffect(() => {
    const el = editorRef.current;
    if (el && value !== lastValueRef.current && document.activeElement !== el) {
      el.innerHTML = value;
      lastValueRef.current = value;
    }
  }, [value]);

  const handleInput = () => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastValueRef.current = html;
    onChange(html);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "b") { e.preventDefault(); aplicarFormato(editorRef, "bold", onChange); }
      if (e.key === "i") { e.preventDefault(); aplicarFormato(editorRef, "italic", onChange); }
      if (e.key === "u") { e.preventDefault(); aplicarFormato(editorRef, "underline", onChange); }
    }
  };

  const minHeight = `${minRows * 1.75}rem`;

  return (
    <div className="rounded-md overflow-hidden border border-input">
      <FormatToolbar editorRef={editorRef} onChange={onChange} />
      <div
        ref={handleRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        className={`
          px-3 py-2 text-sm outline-none bg-background text-foreground
          focus:ring-0 leading-relaxed
          empty:before:content-[attr(data-placeholder)]
          empty:before:text-muted-foreground empty:before:pointer-events-none
        `}
        style={{ minHeight }}
      />
    </div>
  );
}

// ─── Componente de edição de um bloco ─────────────────────────────────────────

interface BlocoEditorProps {
  bloco: Bloco;
  index: number;
  total: number;
  onChange: (bloco: Bloco) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function BlocoEditor({ bloco, index, total, onChange, onRemove, onMoveUp, onMoveDown }: BlocoEditorProps) {
  const headerClass = "flex items-center gap-2 px-3 py-2 rounded-t-lg text-sm font-semibold border-b";

  const renderHeader = () => {
    const icons: Record<Bloco["tipo"], React.ReactNode> = {
      texto:   <AlignLeft className="h-4 w-4" />,
      callout: <AlertCircle className="h-4 w-4" />,
      botao:   <Link className="h-4 w-4" />,
      rodape:  <LayoutTemplate className="h-4 w-4" />,
    };
    const labels: Record<Bloco["tipo"], string> = {
      texto:   "Parágrafo de texto",
      callout: "Caixa de destaque",
      botao:   "Botão de ação",
      rodape:  "Rodapé",
    };
    const colors: Record<Bloco["tipo"], string> = {
      texto:   "bg-gray-50 border-gray-200 text-gray-700",
      callout: "bg-amber-50 border-amber-200 text-amber-800",
      botao:   "bg-indigo-50 border-indigo-200 text-indigo-800",
      rodape:  "bg-slate-50 border-slate-200 text-slate-700",
    };
    return (
      <div className={`${headerClass} ${colors[bloco.tipo]}`}>
        {icons[bloco.tipo]}
        <span className="flex-1">{labels[bloco.tipo]}</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1 rounded hover:bg-black/10 disabled:opacity-30"
            title="Mover para cima"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-1 rounded hover:bg-black/10 disabled:opacity-30"
            title="Mover para baixo"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onRemove}
            className="p-1 rounded hover:bg-red-100 text-red-500 ml-1"
            title="Remover bloco"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  const renderBody = () => {
    switch (bloco.tipo) {
      case "texto":
        return (
          <div className="p-3">
            <RichTextEditor
              value={bloco.conteudo}
              onChange={html => onChange({ ...bloco, conteudo: html })}
              placeholder="Digite o texto do parágrafo. Use {{nome}}, {{produto}}, etc."
              minRows={3}
            />
          </div>
        );

      case "callout":
        return (
          <div className="p-3 space-y-2">
            <div className="flex gap-2">
              {(Object.keys(CALLOUT_CORES) as CalloutColor[]).map(cor => (
                <button
                  key={cor}
                  onClick={() => onChange({ ...bloco, cor })}
                  className={`flex-1 py-1.5 rounded text-xs font-medium border-2 transition-all ${
                    bloco.cor === cor ? "border-current opacity-100 shadow-sm" : "border-transparent opacity-60"
                  }`}
                  style={{
                    background: CALLOUT_CORES[cor].bg,
                    color: CALLOUT_CORES[cor].titulo,
                    borderColor: bloco.cor === cor ? CALLOUT_CORES[cor].border : "transparent",
                  }}
                >
                  {CALLOUT_CORES[cor].label}
                </button>
              ))}
            </div>
            <Input
              value={bloco.titulo}
              onChange={e => onChange({ ...bloco, titulo: e.target.value })}
              placeholder="Título (opcional)"
              className="text-sm"
            />
            <RichTextEditor
              value={bloco.conteudo}
              onChange={html => onChange({ ...bloco, conteudo: html })}
              placeholder="Texto de destaque. Use {{nome}}, {{produto}}, etc."
              minRows={2}
            />
          </div>
        );

      case "botao":
        return (
          <div className="p-3 space-y-2">
            <div className="flex gap-2">
              {([
                { tipo: "whatsapp" as BotaoTipo, label: "WhatsApp", icon: <MessageSquare className="h-3.5 w-3.5" /> },
                { tipo: "site" as BotaoTipo, label: "Site", icon: <Globe className="h-3.5 w-3.5" /> },
                { tipo: "link" as BotaoTipo, label: "Link", icon: <Link className="h-3.5 w-3.5" /> },
              ]).map(opt => (
                <button
                  key={opt.tipo}
                  onClick={() => onChange({ ...bloco, tipoBotao: opt.tipo })}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium border transition-all ${
                    bloco.tipoBotao === opt.tipo
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
                  }`}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>
            <Input
              value={bloco.texto}
              onChange={e => onChange({ ...bloco, texto: e.target.value })}
              placeholder="Texto do botão (ex: Falar no WhatsApp)"
              className="text-sm"
            />
            <Input
              value={bloco.url}
              onChange={e => onChange({ ...bloco, url: e.target.value })}
              placeholder={
                bloco.tipoBotao === "whatsapp"
                  ? "https://wa.me/5562999999999"
                  : bloco.tipoBotao === "site"
                  ? "https://www.barcellosseguros.com.br"
                  : "https://..."
              }
              className="text-sm font-mono"
            />
          </div>
        );

      case "rodape":
        return (
          <div className="p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Empresa</Label>
                <Input
                  value={bloco.empresa}
                  onChange={e => onChange({ ...bloco, empresa: e.target.value })}
                  placeholder="Barcellos Seguros"
                  className="text-sm mt-0.5"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Telefone</Label>
                <Input
                  value={bloco.telefone}
                  onChange={e => onChange({ ...bloco, telefone: e.target.value })}
                  placeholder="(62) 99999-9999"
                  className="text-sm mt-0.5"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">E-mail</Label>
                <Input
                  value={bloco.email}
                  onChange={e => onChange({ ...bloco, email: e.target.value })}
                  placeholder="atendimento@barcellosseguros.com"
                  className="text-sm mt-0.5"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Site</Label>
                <Input
                  value={bloco.site}
                  onChange={e => onChange({ ...bloco, site: e.target.value })}
                  placeholder="www.barcellosseguros.com.br"
                  className="text-sm mt-0.5"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Endereço</Label>
              <Input
                value={bloco.endereco}
                onChange={e => onChange({ ...bloco, endereco: e.target.value })}
                placeholder="Rua Exemplo, 123 — Goiânia, GO"
                className="text-sm mt-0.5"
              />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
      {renderHeader()}
      {renderBody()}
    </div>
  );
}

// ─── Painel de adição de blocos ───────────────────────────────────────────────

interface AddBlocoProps {
  onAdd: (bloco: Bloco) => void;
}

function AddBlocoPanel({ onAdd }: AddBlocoProps) {
  const opcoes: { tipo: Bloco["tipo"]; label: string; desc: string; icon: React.ReactNode; cor: string }[] = [
    {
      tipo: "texto",
      label: "Texto",
      desc: "Parágrafo livre",
      icon: <AlignLeft className="h-5 w-5" />,
      cor: "bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-300",
    },
    {
      tipo: "callout",
      label: "Destaque",
      desc: "Caixa colorida",
      icon: <AlertCircle className="h-5 w-5" />,
      cor: "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-300",
    },
    {
      tipo: "botao",
      label: "Botão",
      desc: "WhatsApp / Site / Link",
      icon: <Link className="h-5 w-5" />,
      cor: "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-300",
    },
    {
      tipo: "rodape",
      label: "Rodapé",
      desc: "Empresa e contatos",
      icon: <LayoutTemplate className="h-5 w-5" />,
      cor: "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300",
    },
  ];

  function criarBloco(tipo: Bloco["tipo"]): Bloco {
    const id = gerarId();
    switch (tipo) {
      case "texto":
        return { id, tipo: "texto", conteudo: "" };
      case "callout":
        return { id, tipo: "callout", cor: "amarelo", titulo: "", conteudo: "" };
      case "botao":
        return { id, tipo: "botao", tipoBotao: "whatsapp", texto: "Falar no WhatsApp", url: "https://wa.me/5562999999999" };
      case "rodape":
        return {
          id,
          tipo: "rodape",
          empresa: "Barcellos Seguros",
          endereco: "Goiânia - GO",
          email: "atendimento@barcellosseguros.com",
          telefone: "(62) 99999-9999",
          site: "www.barcellosseguros.com.br",
        };
    }
  }

  return (
    <div className="border-2 border-dashed border-gray-200 rounded-lg p-3 bg-gray-50/50">
      <p className="text-xs text-muted-foreground text-center mb-2 font-medium">+ Adicionar bloco</p>
      <div className="grid grid-cols-4 gap-2">
        {opcoes.map(o => (
          <button
            key={o.tipo}
            onClick={() => onAdd(criarBloco(o.tipo))}
            className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-center transition-all ${o.cor}`}
          >
            {o.icon}
            <span className="text-xs font-semibold leading-tight">{o.label}</span>
            <span className="text-[10px] opacity-70 leading-tight">{o.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface EmailBlockEditorProps {
  blocos: Bloco[];
  onChange: (blocos: Bloco[]) => void;
}

export function EmailBlockEditor({ blocos, onChange }: EmailBlockEditorProps) {
  const updateBloco = useCallback(
    (index: number, bloco: Bloco) => {
      const novo = [...blocos];
      novo[index] = bloco;
      onChange(novo);
    },
    [blocos, onChange]
  );

  const removeBloco = useCallback(
    (index: number) => {
      onChange(blocos.filter((_, i) => i !== index));
    },
    [blocos, onChange]
  );

  const moveBloco = useCallback(
    (index: number, direction: "up" | "down") => {
      const novo = [...blocos];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= novo.length) return;
      [novo[index], novo[target]] = [novo[target], novo[index]];
      onChange(novo);
    },
    [blocos, onChange]
  );

  const addBloco = useCallback(
    (bloco: Bloco) => {
      onChange([...blocos, bloco]);
    },
    [blocos, onChange]
  );

  return (
    <div className="space-y-2">
      {blocos.length === 0 && (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <LayoutTemplate className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>Nenhum bloco adicionado ainda.</p>
          <p className="text-xs mt-1">Use os botões abaixo para montar o e-mail.</p>
        </div>
      )}
      {blocos.map((bloco, index) => (
        <BlocoEditor
          key={bloco.id}
          bloco={bloco}
          index={index}
          total={blocos.length}
          onChange={b => updateBloco(index, b)}
          onRemove={() => removeBloco(index)}
          onMoveUp={() => moveBloco(index, "up")}
          onMoveDown={() => moveBloco(index, "down")}
        />
      ))}
      <AddBlocoPanel onAdd={addBloco} />
    </div>
  );
}

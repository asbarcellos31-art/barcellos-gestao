import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  EmailBlockEditor,
  type Bloco,
  serializarBlocos,
  deserializarBlocos,
  gerarHtmlDeBlocos,
  BLOCKS_PREFIX,
} from "@/components/EmailBlockEditor";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Mail,
  Plus,
  Pencil,
  Paperclip,
  X,
  Upload,
  FileText,
  Trash2,
  Send,
  Eye,
  Users,
  Megaphone,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Zap,
  PartyPopper,
  AlertTriangle,
  Play,
  ToggleLeft,
  ToggleRight,
  Calendar,
  CalendarClock,
  Save,
  BookOpen,
  Eye as EyeIcon,
  Search,
  BarChart2,
  Copy,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Erro na requisição");
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Template {
  id: number;
  nome: string;
  assunto: string;
  corpo: string;
  saudacao?: string | null;
  assinatura?: string | null;
  ativo: boolean;
  createdAt: string;
}

interface Lista {
  id: number;
  nome: string;
  descricao: string | null;
  totalContatos: number;
  createdAt: string;
}

interface Contato {
  id: number;
  listaId: number;
  nome: string;
  email: string;
  cpf: string | null;
  telefone: string | null;
}

interface Campanha {
  id: number;
  nome: string;
  templateId: number;
  listaId: number;
  status: "RASCUNHO" | "AGENDADA" | "ENVIANDO" | "CONCLUIDA" | "CANCELADA";
  totalDestinatarios: number;
  totalEnviados: number;
  totalErros: number;
  remetente: string;
  nomeRemetente: string;
  dataAgendada: string | null;
  dataInicio: string | null;
  dataConclusao: string | null;
  createdAt: string;
  anexoUrl: string | null;
  anexoNome: string | null;
  anexoTipo: string | null;
}

interface PreviewData {
  campanha: Campanha;
  template: Template;
  totalDestinatarios: number;
  amostra: { nome: string; email: string; assunto: string; corpo: string }[];
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, dataAgendada }: { status: Campanha["status"]; dataAgendada?: string | null }) {
  const map: Record<Campanha["status"], { label: string; className: string }> = {
    RASCUNHO: { label: "Rascunho", className: "bg-gray-100 text-gray-600 border border-gray-300" },
    AGENDADA: { label: "Agendada", className: "bg-blue-100 text-blue-700 border border-blue-300" },
    ENVIANDO: { label: "Enviando...", className: "bg-yellow-100 text-yellow-700 border border-yellow-300" },
    CONCLUIDA: { label: "Concluída", className: "bg-green-100 text-green-700 border border-green-300" },
    CANCELADA: { label: "Cancelada", className: "bg-red-100 text-red-700 border border-red-300" },
  };
  const { label, className } = map[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {status === "AGENDADA" && <CalendarClock className="h-3 w-3" />}
      {label}
      {status === "AGENDADA" && dataAgendada && (
        <span className="ml-0.5 opacity-80">
          {new Date(dataAgendada).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
        </span>
      )}
    </span>
  );
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab() {
  const qc = useQueryClient();
  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["email-templates"],
    queryFn: () => apiFetch("/email-marketing/templates"),
  });

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState({ nome: "", assunto: "", saudacao: "", corpo: "", assinatura: "" });
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [activeField, setActiveField] = useState<"assunto" | "saudacao" | "corpo" | "assinatura">("corpo");
  const corpoRef = useRef<HTMLTextAreaElement>(null);
  const assuntoRef = useRef<HTMLInputElement>(null);
  const saudacaoRef = useRef<HTMLInputElement>(null);
  const assinaturaRef = useRef<HTMLTextAreaElement>(null);
  const [guiaAberto, setGuiaAberto] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  function renderPreview(html: string, templateObj?: { saudacao?: string | null; assinatura?: string | null } | null): string {
    // Se o corpo for JSON de blocos, converte para HTML primeiro
    let htmlResolvido = html;
    if (html.startsWith(BLOCKS_PREFIX)) {
      const blocosParsed = deserializarBlocos(html);
      if (blocosParsed) {
        htmlResolvido = gerarHtmlDeBlocos(
          templateObj?.saudacao ?? "",
          templateObj?.assinatura ?? "",
          blocosParsed
        );
      }
    }
    return htmlResolvido
      .replace(/\{\{nome\}\}/g, "Maria da Silva")
      .replace(/\{\{produto\}\}/g, "Plano de Saúde Unimed")
      .replace(/\{\{vendedor\}\}/g, "Elisia Barcellos")
      .replace(/\{\{dias_vencimento\}\}/g, "15")
      .replace(/\{\{data_vencimento\}\}/g, "31/03/2026")
      .replace(/\{\{valor\}\}/g, "R$ 320,00")
      .replace(/\{\{competencia\}\}/g, "02/2026")
      .replace(/\{\{email\}\}/g, "maria@email.com");
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Gera HTML a partir dos blocos (novo sistema) ou do texto simples (legado)
      const htmlCorpo = blocos.length > 0
        ? gerarHtmlDeBlocos(form.saudacao, form.assinatura, blocos)
        : gerarHtml(form);
      // Salva os blocos como JSON no corpo para poder reeditar
      const corpoParaSalvar = blocos.length > 0
        ? serializarBlocos(blocos)
        : htmlCorpo;
      const payload = {
        nome: form.nome,
        assunto: form.assunto,
        corpo: corpoParaSalvar,
        saudacao: form.saudacao,
        assinatura: form.assinatura,
      };
      if (editing) {
        await apiFetch(`/email-marketing/templates/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/email-marketing/templates", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      setShowForm(false);
      setEditing(null);
      setForm({ nome: "", assunto: "", saudacao: "", corpo: "", assinatura: "" });
      setBlocos([]);
      toast.success(editing ? "Template atualizado!" : "Template criado!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/email-marketing/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      setDeleteId(null);
      toast.success("Template excluído!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicarMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/email-marketing/templates/${id}/duplicar`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      toast.success("Template duplicado!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Gera HTML final a partir dos campos simples
  function gerarHtml(f: typeof form): string {
    const saudacao = f.saudacao || "Olá, {{nome}}!";
    const assinatura = f.assinatura || "Atenciosamente,\nEquipe Barcellos Seguros";
    const corpo = f.corpo || "";
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>
  body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .header { background: #1e3a5f; padding: 24px 32px; text-align: center; }
  .header h1 { color: #fff; margin: 0; font-size: 22px; letter-spacing: 1px; }
  .header p { color: #a8c4e0; margin: 4px 0 0; font-size: 13px; }
  .body { padding: 32px; color: #333; line-height: 1.7; font-size: 15px; }
  .saudacao { font-size: 17px; font-weight: bold; color: #1e3a5f; margin-bottom: 16px; }
  .assinatura { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #555; font-size: 14px; white-space: pre-line; }
  .footer { background: #f8f9fa; padding: 16px 32px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #e5e7eb; }
</style></head>
<body>
<div class="container">
  <div class="header"><h1>Barcellos Seguros</h1><p>Cuidando de quem você ama</p></div>
  <div class="body">
    <div class="saudacao">${saudacao}</div>
    ${corpo.split("\n").filter(l => l.trim()).map(l => `<p>${l}</p>`).join("\n    ")}
    <div class="assinatura">${assinatura}</div>
  </div>
  <div class="footer">Barcellos Seguros &bull; atendimento@barcellosseguros.com &bull; Goiânia - GO</div>
</div>
</body></html>`;
  }

  function inserirVariavel(variavel: string) {
    const refs: Record<string, React.RefObject<HTMLTextAreaElement | HTMLInputElement>> = {
      corpo: corpoRef as unknown as React.RefObject<HTMLTextAreaElement | HTMLInputElement>,
      assunto: assuntoRef as unknown as React.RefObject<HTMLTextAreaElement | HTMLInputElement>,
      saudacao: saudacaoRef as unknown as React.RefObject<HTMLTextAreaElement | HTMLInputElement>,
      assinatura: assinaturaRef as unknown as React.RefObject<HTMLTextAreaElement | HTMLInputElement>,
    };
    const ref = refs[activeField];
    const el = ref?.current as HTMLTextAreaElement | HTMLInputElement | null;
    if (!el) {
      setForm(f => ({ ...f, [activeField]: (f[activeField] || "") + variavel }));
      return;
    }
    const start = el.selectionStart ?? (form[activeField] as string).length;
    const end = el.selectionEnd ?? start;
    const current = (form[activeField] as string) || "";
    const novo = current.slice(0, start) + variavel + current.slice(end);
    setForm(prev => ({ ...prev, [activeField]: novo }));
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + variavel.length, start + variavel.length);
    }, 0);
  }

  function openNew() {
    setEditing(null);
    setForm({ nome: "", assunto: "", saudacao: "Olá, {{nome}}!", corpo: "", assinatura: "Atenciosamente,\nEquipe Barcellos Seguros\n(62) 99999-9999 | atendimento@barcellosseguros.com" });
    // Inicia com um bloco de texto vazio
    setBlocos([{ id: Math.random().toString(36).slice(2, 9), tipo: "texto", conteudo: "" }]);
    setShowForm(true);
  }

  function openEdit(t: Template) {
    setEditing(t);
    // Verifica se o corpo tem blocos serializados (novo formato)
    const blocosDesserializados = deserializarBlocos(t.corpo);
    if (blocosDesserializados) {
      // Novo formato: carrega blocos e usa saudacao/assinatura do template
      setBlocos(blocosDesserializados);
      setForm({
        nome: t.nome,
        assunto: t.assunto,
        saudacao: t.saudacao || "Olá, {{nome}}!",
        corpo: "",
        assinatura: t.assinatura || "Atenciosamente,\nEquipe Barcellos Seguros\n(62) 99999-9999 | atendimento@barcellosseguros.com",
      });
    } else {
      // Formato legado: HTML puro — tenta extrair campos simples
      setBlocos([]);
      const saudacaoMatch = t.corpo.match(/<div class="saudacao">(.*?)<\/div>/);
      const assinaturaMatch = t.corpo.match(/<div class="assinatura">([\s\S]*?)<\/div>/);
      const pRegex = /<p>(.*?)<\/p>/g;
      const pMatches: string[] = [];
      let pMatch;
      while ((pMatch = pRegex.exec(t.corpo)) !== null) pMatches.push(pMatch[1]);
      setForm({
        nome: t.nome,
        assunto: t.assunto,
        saudacao: saudacaoMatch ? saudacaoMatch[1] : "Olá, {{nome}}!",
        corpo: pMatches.join("\n") || t.corpo,
        assinatura: assinaturaMatch ? assinaturaMatch[1].replace(/<br\s*\/?>/g, "\n") : "Atenciosamente,\nEquipe Barcellos Seguros",
      });
    }
    setShowForm(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Crie templates reutilizáveis com variáveis como <code className="bg-muted px-1 rounded">{"{{nome}}"}</code>
        </p>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-2" /> Novo Template
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Nenhum template criado ainda.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Assunto</TableHead>
              <TableHead className="w-32">Criado em</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.nome}</TableCell>
                <TableCell className="text-muted-foreground truncate max-w-xs">{t.assunto}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(t.createdAt).toLocaleDateString("pt-BR")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" title="Pré-visualizar" onClick={() => setPreviewTemplate(t)}>
                      <Eye className="h-4 w-4 text-blue-600" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Duplicar" onClick={() => duplicarMutation.mutate(t.id)}>
                      <Copy className="h-4 w-4 text-blue-500" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(t.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Editor Visual de Template */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-6xl w-full h-[90vh] flex flex-col p-0 gap-0">
          <DialogTitle className="sr-only">{editing ? "Editar Template" : "Novo Template"}</DialogTitle>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-base">{editing ? "Editar Template" : "Novo Template"}</h2>
              <Input
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Nome do template (ex: Boas-vindas Plano de Saúde)"
                className="w-72 h-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setGuiaAberto(g => !g)}
                className="text-xs gap-1"
              >
                {guiaAberto ? "Ocultar guia" : "📖 Ver guia"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={!form.nome || !form.assunto || (blocos.length === 0 && !form.corpo) || saveMutation.isPending}
              >
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? "Salvar" : "Criar Template"}
              </Button>
            </div>
          </div>

          {/* Guia passo a passo */}
          {guiaAberto && (
            <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 text-sm">
              <p className="font-semibold text-blue-800 mb-2">📋 Como criar um template em 4 passos:</p>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { n: "1", titulo: "Dê um nome", desc: "Ex: Boas-vindas, Renovação, Cobrança" },
                  { n: "2", titulo: "Escreva o assunto", desc: "Use {{nome}} para personalizar. Ex: Olá {{nome}}, temos uma novidade!" },
                  { n: "3", titulo: "Escreva o corpo", desc: "Texto simples, um parágrafo por linha. Clique em uma variável para inserir." },
                  { n: "4", titulo: "Confira o preview", desc: "Veja à direita como o e-mail vai aparecer para o destinatário." },
                ].map(s => (
                  <div key={s.n} className="flex gap-2">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">{s.n}</span>
                    <div>
                      <p className="font-medium text-blue-900">{s.titulo}</p>
                      <p className="text-blue-700 text-xs">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Corpo principal: editor + preview */}
          <div className="flex flex-1 overflow-hidden">
            {/* Coluna esquerda: campos + editor de blocos */}
            <div className="w-1/2 flex flex-col border-r overflow-y-auto">
              {/* Campos fixos: assunto, saudação, assinatura */}
              <div className="p-4 space-y-3 border-b">
                <div>
                  <Label className="text-sm font-semibold">📧 Assunto do e-mail <span className="text-destructive">*</span></Label>
                  <Input
                    ref={assuntoRef}
                    value={form.assunto}
                    onChange={e => setForm(f => ({ ...f, assunto: e.target.value }))}
                    onFocus={() => setActiveField("assunto")}
                    placeholder="Ex: {{nome}}, conheça nossos planos de saúde!"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm font-semibold">👋 Saudação</Label>
                    <Input
                      ref={saudacaoRef}
                      value={form.saudacao}
                      onChange={e => setForm(f => ({ ...f, saudacao: e.target.value }))}
                      onFocus={() => setActiveField("saudacao")}
                      placeholder="Olá, {{nome}}!"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">🖊️ Assinatura</Label>
                    <Input
                      ref={assinaturaRef as unknown as React.RefObject<HTMLInputElement>}
                      value={form.assinatura.split("\n")[0] || ""}
                      onChange={e => setForm(f => ({ ...f, assinatura: e.target.value }))}
                      onFocus={() => setActiveField("assinatura")}
                      placeholder="Atenciosamente, Equipe Barcellos"
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Painel de variáveis */}
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
                <p className="text-xs font-semibold text-amber-800 mb-1.5">🔤 Variáveis — clique para copiar:</p>
                <div className="flex flex-wrap gap-1">
                  {[
                    "{{nome}}", "{{produto}}", "{{vendedor}}", "{{valor}}",
                    "{{competencia}}", "{{data_vencimento}}", "{{dias_vencimento}}", "{{email}}",
                  ].map(v => (
                    <button
                      key={v}
                      onClick={() => { navigator.clipboard.writeText(v); }}
                      className="px-2 py-0.5 rounded bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 text-xs font-mono cursor-pointer transition-colors"
                      title="Clique para copiar"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Editor de blocos */}
              <div className="p-4 flex-1">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-semibold">📦 Blocos do e-mail</Label>
                  {blocos.length === 0 && (
                    <span className="text-xs text-muted-foreground">Adicione blocos abaixo</span>
                  )}
                </div>
                <EmailBlockEditor blocos={blocos} onChange={setBlocos} />
              </div>
            </div>

            {/* Coluna direita: preview em tempo real */}
            <div className="w-1/2 flex flex-col bg-gray-50">
              <div className="px-4 py-2.5 border-b bg-white flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Pré-visualização em tempo real</span>
                <Badge variant="outline" className="text-xs ml-auto">Dados de exemplo</Badge>
              </div>
              <div className="flex-1 overflow-auto p-4">
                <iframe
                  srcDoc={renderPreview(
                    blocos.length > 0
                      ? gerarHtmlDeBlocos(form.saudacao, form.assinatura, blocos)
                      : gerarHtml(form)
                  )}
                  className="w-full rounded-lg border shadow-sm"
                  style={{ minHeight: 500, border: "none", display: "block" }}
                  title="preview-email-live"
                  sandbox="allow-same-origin"
                  onLoad={(e) => {
                    const frame = e.currentTarget;
                    const doc = frame.contentDocument;
                    if (doc) {
                      frame.style.height = doc.documentElement.scrollHeight + "px";
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={previewTemplate !== null} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-600" />
              Pré-visualização: {previewTemplate?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            <div className="bg-muted rounded-lg px-4 py-2.5">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assunto:</span>
              <p className="text-sm font-medium mt-0.5">{previewTemplate ? renderPreview(previewTemplate.assunto) : ""}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">Nome: Maria da Silva</Badge>
              <Badge variant="outline" className="text-xs">Produto: Plano de Saúde Unimed</Badge>
              <Badge variant="outline" className="text-xs">Vendedor: Elisia Barcellos</Badge>
            </div>
            <div className="border rounded-lg overflow-auto" style={{ height: 420 }}>
              {previewTemplate && (
                <iframe
                  srcDoc={renderPreview(previewTemplate.corpo, previewTemplate)}
                  className="w-full"
                  style={{ minHeight: 420, border: 'none', display: 'block' }}
                  title="preview-email"
                  sandbox="allow-same-origin"
                  onLoad={(e) => {
                    const frame = e.currentTarget;
                    const doc = frame.contentDocument;
                    if (doc) {
                      frame.style.height = doc.documentElement.scrollHeight + "px";
                    }
                  }}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>Fechar</Button>
            {previewTemplate && (
              <Button onClick={() => { openEdit(previewTemplate); setPreviewTemplate(null); }}>
                <Pencil className="h-4 w-4 mr-2" /> Editar Template
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Listas Tab ───────────────────────────────────────────────────────────────

function ListasTab() {
  const qc = useQueryClient();
  const { data: listas = [], isLoading } = useQuery<Lista[]>({
    queryKey: ["email-listas"],
    queryFn: () => apiFetch("/email-marketing/listas"),
  });

  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ nome: "", descricao: "" });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [uploadListaId, setUploadListaId] = useState<number | null>(null);
  const [viewListaId, setViewListaId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dialogImportarBase, setDialogImportarBase] = useState<number | null>(null);
  const [filtroImportar, setFiltroImportar] = useState({
    status: "ativo",
    produtoCodigo: "",
    cidade: "",
    vendedor: "",
    idadeMin: "",
    idadeMax: "",
    contribuicaoMin: "",
    contribuicaoMax: "",
    sexo: "",
  });
  const [importandoBase, setImportandoBase] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [nomeTemplate, setNomeTemplate] = useState("");
  const [salvandoTemplate, setSalvandoTemplate] = useState(false);
  const [showSalvarTemplate, setShowSalvarTemplate] = useState(false);

  // Metadados da base para popular os selects
  const { data: baseMetadados } = useQuery<{ produtos: {codigo:string;descricao:string}[]; cidades: string[]; vendedores: string[] }>({
    queryKey: ["email-base-metadados"],
    queryFn: () => apiFetch("/email-marketing/base-metadados"),
    staleTime: 5 * 60 * 1000,
  });

  // Templates de segmentos
  const { data: segmentoTemplates = [], refetch: refetchTemplates } = useQuery<{id:number;nome:string;filtros:any;createdAt:string}[]>({
    queryKey: ["email-segmento-templates"],
    queryFn: () => apiFetch("/email-marketing/segmento-templates"),
  });

  async function handlePreviewCount() {
    if (!dialogImportarBase) return;
    setLoadingPreview(true);
    try {
      const body: any = { status: filtroImportar.status };
      if (filtroImportar.produtoCodigo) body.produtoCodigo = filtroImportar.produtoCodigo;
      if (filtroImportar.cidade) body.cidade = filtroImportar.cidade;
      if (filtroImportar.vendedor) body.vendedor = filtroImportar.vendedor;
      if (filtroImportar.idadeMin) body.idadeMin = Number(filtroImportar.idadeMin);
      if (filtroImportar.idadeMax) body.idadeMax = Number(filtroImportar.idadeMax);
      if (filtroImportar.contribuicaoMin) body.contribuicaoMin = Number(filtroImportar.contribuicaoMin);
      if (filtroImportar.contribuicaoMax) body.contribuicaoMax = Number(filtroImportar.contribuicaoMax);
      if (filtroImportar.sexo) body.sexo = filtroImportar.sexo;
      const json = await apiFetch(`/email-marketing/listas/${dialogImportarBase}/preview-count`, { method: "POST", body: JSON.stringify(body) });
      setPreviewCount(json.total);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleSalvarTemplate() {
    if (!nomeTemplate.trim()) return;
    setSalvandoTemplate(true);
    try {
      const filtros: any = { status: filtroImportar.status };
      if (filtroImportar.produtoCodigo) filtros.produtoCodigo = filtroImportar.produtoCodigo;
      if (filtroImportar.cidade) filtros.cidade = filtroImportar.cidade;
      if (filtroImportar.vendedor) filtros.vendedor = filtroImportar.vendedor;
      if (filtroImportar.idadeMin) filtros.idadeMin = filtroImportar.idadeMin;
      if (filtroImportar.idadeMax) filtros.idadeMax = filtroImportar.idadeMax;
      if (filtroImportar.contribuicaoMin) filtros.contribuicaoMin = filtroImportar.contribuicaoMin;
      if (filtroImportar.contribuicaoMax) filtros.contribuicaoMax = filtroImportar.contribuicaoMax;
      if (filtroImportar.sexo) filtros.sexo = filtroImportar.sexo;
      await apiFetch("/email-marketing/segmento-templates", { method: "POST", body: JSON.stringify({ nome: nomeTemplate.trim(), filtros }) });
      refetchTemplates();
      setNomeTemplate("");
      setShowSalvarTemplate(false);
      toast.success("Template salvo!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSalvandoTemplate(false);
    }
  }

  function handleCarregarTemplate(t: {filtros: any}) {
    const f = t.filtros;
    setFiltroImportar({
      status: f.status || "ativo",
      produtoCodigo: f.produtoCodigo || "",
      cidade: f.cidade || "",
      vendedor: f.vendedor || "",
      idadeMin: f.idadeMin || "",
      idadeMax: f.idadeMax || "",
      contribuicaoMin: f.contribuicaoMin || "",
      contribuicaoMax: f.contribuicaoMax || "",
      sexo: f.sexo || "",
    });
    setPreviewCount(null);
  }

  async function handleExcluirTemplate(id: number) {
    try {
      await apiFetch(`/email-marketing/segmento-templates/${id}`, { method: "DELETE" });
      refetchTemplates();
      toast.success("Template excluído!");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleImportarBase() {
    if (!dialogImportarBase) return;
    setImportandoBase(true);
    try {
      const body: any = { status: filtroImportar.status };
      if (filtroImportar.produtoCodigo) body.produtoCodigo = filtroImportar.produtoCodigo;
      if (filtroImportar.cidade) body.cidade = filtroImportar.cidade;
      if (filtroImportar.vendedor) body.vendedor = filtroImportar.vendedor;
      if (filtroImportar.idadeMin) body.idadeMin = Number(filtroImportar.idadeMin);
      if (filtroImportar.idadeMax) body.idadeMax = Number(filtroImportar.idadeMax);
      if (filtroImportar.contribuicaoMin) body.contribuicaoMin = Number(filtroImportar.contribuicaoMin);
      if (filtroImportar.contribuicaoMax) body.contribuicaoMax = Number(filtroImportar.contribuicaoMax);
      const json = await apiFetch(`/email-marketing/listas/${dialogImportarBase}/importar-base`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      qc.invalidateQueries({ queryKey: ["email-listas"] });
      toast.success(`${json.importados} contatos importados! (${json.ignorados} já existiam)`);
      setDialogImportarBase(null);
      setFiltroImportar({ status: "ativo", produtoCodigo: "", cidade: "", vendedor: "", idadeMin: "", idadeMax: "", contribuicaoMin: "", contribuicaoMax: "", sexo: "" });
      setPreviewCount(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImportandoBase(false);
    }
  }

  const { data: contatos = [] } = useQuery<Contato[]>({
    queryKey: ["email-contatos", viewListaId],
    queryFn: () => apiFetch(`/email-marketing/listas/${viewListaId}/contatos`),
    enabled: viewListaId !== null,
  });

  const createMutation = useMutation({
    mutationFn: () => apiFetch("/email-marketing/listas", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-listas"] });
      setShowNew(false);
      setForm({ nome: "", descricao: "" });
      toast.success("Lista criada!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/email-marketing/listas/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-listas"] });
      setDeleteId(null);
      toast.success("Lista excluída!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleUpload(file: File) {
    if (!uploadListaId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("arquivo", file);
      const res = await fetch(`/api/email-marketing/listas/${uploadListaId}/upload`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      qc.invalidateQueries({ queryKey: ["email-listas"] });
      toast.success(`${json.totalImportados} contatos importados de ${json.totalLinhas} linhas!`);
      setUploadListaId(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  }

  const viewLista = listas.find(l => l.id === viewListaId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Importe planilhas CSV/Excel com colunas <strong>Nome</strong> e <strong>E-mail</strong>.
        </p>
        <Button onClick={() => setShowNew(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" /> Nova Lista
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : listas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Nenhuma lista criada ainda.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-32 text-right">Contatos</TableHead>
              <TableHead className="w-32">Criada em</TableHead>
              <TableHead className="w-32 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listas.map(l => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.nome}</TableCell>
                <TableCell className="text-muted-foreground">{l.descricao ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary">{l.totalContatos.toLocaleString("pt-BR")}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(l.createdAt).toLocaleDateString("pt-BR")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" title="Ver contatos" onClick={() => setViewListaId(l.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Importar planilha (Excel/CSV)" onClick={() => setUploadListaId(l.id)}>
                      <Upload className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Importar da Base de Clientes" className="text-blue-600 hover:text-blue-700" onClick={() => setDialogImportarBase(l.id)}>
                      <Users className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(l.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Dialog importar da base com filtros avançados */}
      <Dialog open={dialogImportarBase !== null} onOpenChange={() => setDialogImportarBase(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Importar da Base de Clientes</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
            <p className="text-sm text-muted-foreground">Configure os filtros de segmentação. Todos os campos são opcionais. Contatos já existentes na lista serão ignorados automaticamente.</p>

            {/* Templates salvos */}
            {segmentoTemplates.length > 0 && (
              <div className="border rounded-lg p-3 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Segmentos salvos</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {segmentoTemplates.map(t => (
                    <div key={t.id} className="flex items-center gap-1 bg-background border rounded-full px-3 py-1">
                      <button
                        className="text-xs text-foreground hover:text-primary"
                        onClick={() => handleCarregarTemplate(t)}
                        title="Carregar filtros deste template"
                      >{t.nome}</button>
                      <button
                        className="text-muted-foreground hover:text-destructive ml-1"
                        onClick={() => handleExcluirTemplate(t.id)}
                        title="Excluir template"
                      >×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Status do cliente</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={filtroImportar.status}
                onChange={e => { setFiltroImportar(f => ({ ...f, status: e.target.value })); setPreviewCount(null); }}
              >
                <option value="ativo">Somente Ativos</option>
                <option value="inativo">Somente Inativos</option>
                <option value="todos">Todos</option>
              </select>
            </div>

            {/* Produto */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Produto</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={filtroImportar.produtoCodigo}
                onChange={e => { setFiltroImportar(f => ({ ...f, produtoCodigo: e.target.value })); setPreviewCount(null); }}
              >
                <option value="">Todos os produtos</option>
                {(baseMetadados?.produtos || []).map(p => (
                  <option key={p.codigo} value={p.codigo}>{p.descricao}</option>
                ))}
              </select>
            </div>

            {/* Vendedor */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Vendedor responsável</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={filtroImportar.vendedor}
                onChange={e => { setFiltroImportar(f => ({ ...f, vendedor: e.target.value })); setPreviewCount(null); }}
              >
                <option value="">Todos os vendedores</option>
                {(baseMetadados?.vendedores || []).map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            {/* Cidade */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Cidade</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={filtroImportar.cidade}
                onChange={e => { setFiltroImportar(f => ({ ...f, cidade: e.target.value })); setPreviewCount(null); }}
              >
                <option value="">Todas as cidades</option>
                {(baseMetadados?.cidades || []).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Sexo */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Sexo / Gênero</Label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={filtroImportar.sexo}
                onChange={e => { setFiltroImportar(f => ({ ...f, sexo: e.target.value })); setPreviewCount(null); }}
              >
                <option value="">Todos</option>
                <option value="M">Masculino</option>
                <option value="F">Feminino</option>
                <option value="OUTRO">Outro</option>
              </select>
            </div>

            {/* Faixa etária */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Faixa etária (anos)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number" min={0} max={120}
                  placeholder="Mínimo (ex: 30)"
                  value={filtroImportar.idadeMin}
                  onChange={e => { setFiltroImportar(f => ({ ...f, idadeMin: e.target.value })); setPreviewCount(null); }}
                />
                <Input
                  type="number" min={0} max={120}
                  placeholder="Máximo (ex: 60)"
                  value={filtroImportar.idadeMax}
                  onChange={e => { setFiltroImportar(f => ({ ...f, idadeMax: e.target.value })); setPreviewCount(null); }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Requer data de nascimento cadastrada. Deixe em branco para não filtrar.</p>
            </div>

            {/* Faixa de contribuição */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Contribuição mensal (R$)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number" min={0}
                  placeholder="Mínimo (ex: 100)"
                  value={filtroImportar.contribuicaoMin}
                  onChange={e => { setFiltroImportar(f => ({ ...f, contribuicaoMin: e.target.value })); setPreviewCount(null); }}
                />
                <Input
                  type="number" min={0}
                  placeholder="Máximo (ex: 1000)"
                  value={filtroImportar.contribuicaoMax}
                  onChange={e => { setFiltroImportar(f => ({ ...f, contribuicaoMax: e.target.value })); setPreviewCount(null); }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Deixe em branco para não filtrar por valor.</p>
            </div>

            {/* Contador de pré-visualização */}
            <div className="flex items-center gap-3 pt-1">
              <Button variant="outline" size="sm" onClick={handlePreviewCount} disabled={loadingPreview}>
                {loadingPreview ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
                Contar registros
              </Button>
              {previewCount !== null && (
                <span className="text-sm font-semibold text-primary">
                  {previewCount === 0 ? "Nenhum contato encontrado" : `${previewCount} contato${previewCount !== 1 ? 's' : ''} encontrado${previewCount !== 1 ? 's' : ''}`}
                </span>
              )}
            </div>

            {/* Salvar como template */}
            {showSalvarTemplate ? (
              <div className="flex gap-2 items-center border rounded-lg p-2 bg-muted/30">
                <Input
                  placeholder="Nome do segmento (ex: Plano Saúde - Florianópolis)"
                  value={nomeTemplate}
                  onChange={e => setNomeTemplate(e.target.value)}
                  className="flex-1"
                />
                <Button size="sm" onClick={handleSalvarTemplate} disabled={salvandoTemplate || !nomeTemplate.trim()}>
                  {salvandoTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowSalvarTemplate(false)}>Cancelar</Button>
              </div>
            ) : (
              <button
                className="text-xs text-primary hover:underline flex items-center gap-1"
                onClick={() => setShowSalvarTemplate(true)}
              >
                <Save className="h-3 w-3" /> Salvar filtros como template
              </button>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setDialogImportarBase(null); setPreviewCount(null); setShowSalvarTemplate(false); }}>Cancelar</Button>
            <Button onClick={handleImportarBase} disabled={importandoBase}>
              {importandoBase && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Importar Contatos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nova lista dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Lista</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da lista</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Lista Fria Plano de Saúde" />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Leads captados em fevereiro/2026" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.nome || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload dialog */}
      <Dialog open={uploadListaId !== null} onOpenChange={() => setUploadListaId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar Contatos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 p-8 text-center">
              <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">
                Selecione um arquivo <strong>Excel (.xlsx)</strong> ou <strong>CSV (.csv)</strong>.<br />
                O arquivo deve ter colunas <strong>Nome</strong> e <strong>E-mail</strong>.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
              />
              <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {uploading ? "Importando..." : "Selecionar Arquivo"}
              </Button>
            </div>
            <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p><strong>Colunas detectadas automaticamente:</strong></p>
              <p>• <strong>Nome</strong> — qualquer coluna com "nome" no título</p>
              <p>• <strong>E-mail</strong> — qualquer coluna com "email" ou "e-mail" no título</p>
              <p>• <strong>CPF</strong> e <strong>Telefone</strong> — opcionais, detectados automaticamente</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadListaId(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View contatos dialog */}
      <Dialog open={viewListaId !== null} onOpenChange={() => setViewListaId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Contatos — {viewLista?.nome}</DialogTitle>
          </DialogHeader>
          {contatos.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">Nenhum contato nesta lista.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Telefone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contatos.slice(0, 100).map(c => (
                  <TableRow key={c.id}>
                    <TableCell>{c.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email}</TableCell>
                    <TableCell className="text-muted-foreground">{c.cpf ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.telefone ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {contatos.length > 100 && (
            <p className="text-xs text-muted-foreground text-center">Mostrando 100 de {contatos.length} contatos.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewListaId(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lista?</AlertDialogTitle>
            <AlertDialogDescription>Todos os contatos desta lista serão removidos permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Campanhas Tab ────────────────────────────────────────────────────────────

function CampanhasTab() {
  const qc = useQueryClient();
  const { data: campanhas = [], isLoading, refetch } = useQuery<Campanha[]>({
    queryKey: ["email-campanhas"],
    queryFn: () => apiFetch("/email-marketing/campanhas"),
    refetchInterval: 10000, // Atualiza a cada 10s enquanto houver envios em andamento
  });
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["email-templates"],
    queryFn: () => apiFetch("/email-marketing/templates"),
  });
  const { data: listas = [] } = useQuery<Lista[]>({
    queryKey: ["email-listas"],
    queryFn: () => apiFetch("/email-marketing/listas"),
  });

  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ nome: "", templateId: "", listaId: "", remetente: "atendimento@barcellosseguros.com", nomeRemetente: "Barcellos Seguros", dataAgendada: "" });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [dispararId, setDispararId] = useState<number | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [disparando, setDisparando] = useState(false);
  const [agendarId, setAgendarId] = useState<number | null>(null);
  const [agendarData, setAgendarData] = useState("");
  const [aberturasId, setAberturasId] = useState<number | null>(null);
  const [duplicandoId, setDuplicandoId] = useState<number | null>(null);
  const { data: aberturas = [], isLoading: loadingAberturas } = useQuery<any[]>({
    queryKey: ["email-aberturas", aberturasId],
    queryFn: () => apiFetch(`/email-marketing/campanhas/${aberturasId}/aberturas`),
    enabled: aberturasId !== null,
  });
  const [criandoLista, setCriandoLista] = useState<'abriram' | 'nao_abriram' | null>(null);
  const [nomeNovaLista, setNomeNovaLista] = useState("");
  const [listaCriada, setListaCriada] = useState<{ total: number; listaId: number } | null>(null);
  const queryClient = useQueryClient();

  async function handleCriarLista(tipo: 'abriram' | 'nao_abriram') {
    if (!aberturasId || !nomeNovaLista.trim()) return;
    setCriandoLista(tipo);
    try {
      const r = await apiFetch(`/email-marketing/campanhas/${aberturasId}/criar-lista-aberturas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, nomeLista: nomeNovaLista.trim() }),
      });
      setListaCriada({ total: r.total, listaId: r.listaId });
      queryClient.invalidateQueries({ queryKey: ['email-listas'] });
      setNomeNovaLista("");
    } catch (e: any) {
      alert(e.message || 'Erro ao criar lista');
    } finally {
      setCriandoLista(null);
    }
  }

  function handleExportarExcel() {
    if (!aberturasId) return;
    window.open(`/api/email-marketing/campanhas/${aberturasId}/exportar-aberturas`, '_blank');
  }

  // Editar campanha
  const [editCampId, setEditCampId] = useState<number | null>(null);
  const [editCampForm, setEditCampForm] = useState({ nome: "", templateId: "", listaId: "", remetente: "", nomeRemetente: "", dataAgendada: "" });
  const [editCampAnexo, setEditCampAnexo] = useState<{ url: string; nome: string; tipo: string } | null>(null);
  const [uploadingAnexo, setUploadingAnexo] = useState(false);
  const [newCampAnexo, setNewCampAnexo] = useState<{ url: string; nome: string; tipo: string } | null>(null);
  const [uploadingNewAnexo, setUploadingNewAnexo] = useState(false);
  const [newCampId, setNewCampId] = useState<number | null>(null);

  function openEditCamp(c: Campanha) {
    setEditCampId(c.id);
    const dataAgendadaLocal = c.dataAgendada
      ? (() => {
          const d = new Date(c.dataAgendada);
          const offset = -3 * 60;
          const local = new Date(d.getTime() + (offset - d.getTimezoneOffset()) * 60000);
          return local.toISOString().slice(0, 16);
        })()
      : "";
    setEditCampForm({
      nome: c.nome,
      templateId: String(c.templateId),
      listaId: String(c.listaId),
      remetente: c.remetente,
      nomeRemetente: c.nomeRemetente,
      dataAgendada: dataAgendadaLocal,
    });
    setEditCampAnexo(c.anexoUrl ? { url: c.anexoUrl, nome: c.anexoNome || "Anexo", tipo: c.anexoTipo || "" } : null);
  }

  const editCampMutation = useMutation({
    mutationFn: () => {
      const payload: any = {
        nome: editCampForm.nome,
        templateId: parseInt(editCampForm.templateId),
        listaId: parseInt(editCampForm.listaId),
        remetente: editCampForm.remetente,
        nomeRemetente: editCampForm.nomeRemetente,
      };
      if (editCampForm.dataAgendada) {
        payload.status = "AGENDADA";
        payload.dataAgendadaLocal = editCampForm.dataAgendada;
      } else {
        payload.status = "RASCUNHO";
        payload.dataAgendada = null;
      }
      return apiFetch(`/email-marketing/campanhas/${editCampId}`, { method: "PUT", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-campanhas"] });
      setEditCampId(null);
      toast.success("Campanha atualizada!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function uploadAnexo(campanhaId: number, file: File, onDone: (r: { url: string; nome: string; tipo: string }) => void) {
    const fd = new FormData();
    fd.append("arquivo", file);
    const res = await fetch(`/api/email-marketing/campanhas/${campanhaId}/anexo`, { method: "POST", body: fd });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    onDone({ url: data.url, nome: data.nome, tipo: data.tipo });
  }

  async function removerAnexo(campanhaId: number, onDone: () => void) {
    await apiFetch(`/email-marketing/campanhas/${campanhaId}/anexo`, { method: "DELETE" });
    onDone();
    qc.invalidateQueries({ queryKey: ["email-campanhas"] });
  }

  const agendarMutation = useMutation({
    mutationFn: ({ id, dataAgendada }: { id: number; dataAgendada: string }) =>
      apiFetch(`/email-marketing/campanhas/${id}`, {
        method: "PUT",
        // Envia a string datetime-local sem conversão; o backend interpreta como Brasília (UTC-3)
        body: JSON.stringify({ status: "AGENDADA", dataAgendadaLocal: dataAgendada }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-campanhas"] });
      setAgendarId(null);
      setAgendarData("");
      toast.success("Campanha agendada com sucesso!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      // Envia dataAgendadaLocal (string sem timezone) para o backend interpretar como Brasília
      const payload = { ...form, dataAgendadaLocal: form.dataAgendada || undefined };
      delete (payload as any).dataAgendada;
      return apiFetch("/email-marketing/campanhas", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["email-campanhas"] });
      setShowNew(false);
      const wasAgendada = form.dataAgendada;
      setForm({ nome: "", templateId: "", listaId: "", remetente: "atendimento@barcellosseguros.com", nomeRemetente: "Barcellos Seguros", dataAgendada: "" });
      if (wasAgendada) {
        toast.success(`Campanha agendada para ${new Date(wasAgendada).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}!`);
      } else {
        toast.success("Campanha criada como rascunho!");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/email-marketing/campanhas/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-campanhas"] });
      setDeleteId(null);
      toast.success("Campanha excluida!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicarMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/email-marketing/campanhas/${id}/duplicar`, { method: "POST" }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["email-campanhas"] });
      setDuplicandoId(null);
      toast.success("Campanha duplicada!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function loadPreview(id: number) {
    setLoadingPreview(true);
    setPreviewId(id);
    try {
      const data = await apiFetch(`/email-marketing/campanhas/${id}/preview`);
      setPreviewData(data);
    } catch (e: any) {
      toast.error(e.message);
      setPreviewId(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function disparar(id: number) {
    setDisparando(true);
    try {
      const res = await apiFetch(`/email-marketing/campanhas/${id}/disparar`, { method: "POST" });
      toast.success(res.mensagem ?? "Disparo iniciado!");
      qc.invalidateQueries({ queryKey: ["email-campanhas"] });
      setDispararId(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDisparando(false);
    }
  }

  async function retomar(id: number) {
    try {
      const res = await apiFetch(`/email-marketing/campanhas/${id}/retomar`, { method: "POST" });
      toast.success(res.mensagem ?? "Retomando envio em background!");
      qc.invalidateQueries({ queryKey: ["email-campanhas"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Crie e dispare campanhas de e-mail para suas listas de contatos.
        </p>
        <Button onClick={() => setShowNew(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" /> Nova Campanha
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : campanhas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Megaphone className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Nenhuma campanha criada ainda.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Destinatários</TableHead>
              <TableHead className="text-right">Enviados</TableHead>
              <TableHead className="text-right">Erros</TableHead>
              <TableHead className="w-32">Criada em</TableHead>
              <TableHead className="w-36 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campanhas.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.nome}</TableCell>
                <TableCell><StatusBadge status={c.status} dataAgendada={c.dataAgendada} /></TableCell>
                <TableCell className="text-right">{c.totalDestinatarios.toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-right">
                  <span className="text-green-600 font-medium">{c.totalEnviados.toLocaleString("pt-BR")}</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className={c.totalErros > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
                    {c.totalErros.toLocaleString("pt-BR")}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(c.createdAt).toLocaleDateString("pt-BR")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" title="Prévia" onClick={() => loadPreview(c.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {c.status === "RASCUNHO" && (
                      <Button variant="ghost" size="icon" title="Agendar envio" onClick={() => { setAgendarId(c.id); setAgendarData(""); }}>
                        <CalendarClock className="h-4 w-4 text-blue-500" />
                      </Button>
                    )}
                    {(c.status === "RASCUNHO" || c.status === "AGENDADA") && (
                      <Button variant="ghost" size="icon" title="Editar campanha" onClick={() => openEditCamp(c)}>
                        <Pencil className="h-4 w-4 text-yellow-600" />
                      </Button>
                    )}
                    {(c.status === "RASCUNHO" || c.status === "AGENDADA") && (
                      <Button variant="ghost" size="icon" title="Disparar agora" onClick={() => setDispararId(c.id)}>
                        <Send className="h-4 w-4 text-primary" />
                      </Button>
                    )}
                    {c.status === "ENVIANDO" && (
                      <Button variant="ghost" size="icon" title="Retomar envio" onClick={() => retomar(c.id)}>
                        <RefreshCw className="h-4 w-4 text-orange-500" />
                      </Button>
                    )}
                    {(c.status === "CONCLUIDA" || c.status === "ENVIANDO") && (
                      <Button variant="ghost" size="icon" title="Ver relatório de envios" onClick={() => setAberturasId(c.id)}>
                        <BarChart2 className="h-4 w-4 text-green-600" />
                      </Button>
                    )}
                    {c.status === "RASCUNHO" && (
                      <Button variant="ghost" size="icon" title="Duplicar" onClick={() => { setDuplicandoId(c.id); duplicarMutation.mutate(c.id); }} disabled={duplicandoId === c.id}>
                        {duplicandoId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4 text-blue-500" />}
                      </Button>
                    )}
                    {c.status !== "ENVIANDO" && (
                      <Button variant="ghost" size="icon" title="Excluir" onClick={() => setDeleteId(c.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Nova campanha dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nova Campanha</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da campanha</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Campanha Plano de Saúde — Março 2026" />
            </div>
            <div>
              <Label>Template de e-mail</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={form.templateId}
                onChange={e => setForm(f => ({ ...f, templateId: e.target.value }))}
              >
                <option value="">Selecione um template...</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div>
              <Label>Lista de destinatários</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={form.listaId}
                onChange={e => setForm(f => ({ ...f, listaId: e.target.value }))}
              >
                <option value="">Selecione uma lista...</option>
                {listas.map(l => <option key={l.id} value={l.id}>{l.nome} ({l.totalContatos.toLocaleString("pt-BR")} contatos)</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>E-mail remetente</Label>
                <Input value={form.remetente} onChange={e => setForm(f => ({ ...f, remetente: e.target.value }))} />
              </div>
              <div>
                <Label>Nome remetente</Label>
                <Input value={form.nomeRemetente} onChange={e => setForm(f => ({ ...f, nomeRemetente: e.target.value }))} />
              </div>
            </div>
            <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-950/20 space-y-2">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-blue-600" />
                <Label className="text-blue-700 dark:text-blue-300 font-medium">Agendar envio (opcional)</Label>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400">Deixe em branco para salvar como rascunho e disparar manualmente depois.</p>
              <Input
                type="datetime-local"
                value={form.dataAgendada}
                onChange={e => setForm(f => ({ ...f, dataAgendada: e.target.value }))}
                min={new Date().toISOString().slice(0, 16)}
                className="bg-white dark:bg-background"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!form.nome || !form.templateId || !form.listaId || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {form.dataAgendada ? (
                <><CalendarClock className="h-4 w-4 mr-2" /> Agendar Campanha</>
              ) : (
                "Criar Campanha"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar campanha dialog */}
      <Dialog open={editCampId !== null} onOpenChange={() => setEditCampId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Campanha</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da campanha</Label>
              <Input value={editCampForm.nome} onChange={e => setEditCampForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <Label>Template de e-mail</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={editCampForm.templateId}
                onChange={e => setEditCampForm(f => ({ ...f, templateId: e.target.value }))}
              >
                <option value="">Selecione um template...</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div>
              <Label>Lista de destinatários</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={editCampForm.listaId}
                onChange={e => setEditCampForm(f => ({ ...f, listaId: e.target.value }))}
              >
                <option value="">Selecione uma lista...</option>
                {listas.map(l => <option key={l.id} value={l.id}>{l.nome} ({l.totalContatos.toLocaleString("pt-BR")} contatos)</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>E-mail remetente</Label>
                <Input value={editCampForm.remetente} onChange={e => setEditCampForm(f => ({ ...f, remetente: e.target.value }))} />
              </div>
              <div>
                <Label>Nome remetente</Label>
                <Input value={editCampForm.nomeRemetente} onChange={e => setEditCampForm(f => ({ ...f, nomeRemetente: e.target.value }))} />
              </div>
            </div>
            <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-950/20 space-y-2">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-blue-600" />
                <Label className="text-blue-700 dark:text-blue-300 font-medium">Agendamento</Label>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-400">Deixe em branco para manter como rascunho.</p>
              <div className="flex gap-2">
                <Input
                  type="datetime-local"
                  value={editCampForm.dataAgendada}
                  onChange={e => setEditCampForm(f => ({ ...f, dataAgendada: e.target.value }))}
                  min={new Date().toISOString().slice(0, 16)}
                  className="bg-white dark:bg-background flex-1"
                />
                {editCampForm.dataAgendada && (
                  <Button variant="outline" size="sm" onClick={() => setEditCampForm(f => ({ ...f, dataAgendada: "" }))} className="text-xs">
                    Remover
                  </Button>
                )}
              </div>
            </div>
            {/* Anexo */}
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <Label className="font-medium">Anexo (opcional)</Label>
              </div>
              {editCampAnexo ? (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded p-2">
                  <FileText className="h-4 w-4 text-green-600 shrink-0" />
                  <span className="text-sm text-green-800 truncate flex-1">{editCampAnexo.nome}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => editCampId && removerAnexo(editCampId, () => setEditCampAnexo(null))}>
                    <X className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ) : (
                <div>
                  <label className="cursor-pointer">
                    <div className="border-2 border-dashed rounded-lg p-3 text-center hover:border-primary transition-colors">
                      {uploadingAnexo ? (
                        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          <Upload className="h-4 w-4 mx-auto mb-1" />
                          Clique para selecionar (PDF, imagem, etc. — máx. 20MB)
                        </div>
                      )}
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif"
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (!file || !editCampId) return;
                        setUploadingAnexo(true);
                        try {
                          await uploadAnexo(editCampId, file, r => setEditCampAnexo(r));
                          toast.success("Anexo enviado!");
                        } catch (err: any) {
                          toast.error(err.message);
                        } finally {
                          setUploadingAnexo(false);
                        }
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCampId(null)}>Cancelar</Button>
            <Button
              onClick={() => editCampMutation.mutate()}
              disabled={!editCampForm.nome || !editCampForm.templateId || !editCampForm.listaId || editCampMutation.isPending}
            >
              {editCampMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agendar campanha existente dialog */}
      <Dialog open={agendarId !== null} onOpenChange={() => { setAgendarId(null); setAgendarData(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Agendar Campanha</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Escolha a data e hora em que esta campanha será disparada automaticamente.
            </p>
            <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-950/20 space-y-2">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-blue-600" />
                <Label className="text-blue-700 dark:text-blue-300 font-medium">Data e hora do disparo</Label>
              </div>
              <Input
                type="datetime-local"
                value={agendarData}
                onChange={e => setAgendarData(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="bg-white dark:bg-background"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAgendarId(null); setAgendarData(""); }}>Cancelar</Button>
            <Button
              onClick={() => agendarId && agendarData && agendarMutation.mutate({ id: agendarId, dataAgendada: agendarData })}
              disabled={!agendarData || agendarMutation.isPending}
            >
              {agendarMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <CalendarClock className="h-4 w-4 mr-2" /> Confirmar Agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={previewId !== null} onOpenChange={() => { setPreviewId(null); setPreviewData(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prévia da Campanha</DialogTitle>
          </DialogHeader>
          {loadingPreview ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : previewData ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 bg-muted rounded-lg p-4 text-sm">
                <div><span className="text-muted-foreground">Campanha:</span> <strong>{previewData.campanha.nome}</strong></div>
                <div><span className="text-muted-foreground">Template:</span> <strong>{previewData.template.nome}</strong></div>
                <div><span className="text-muted-foreground">Destinatários:</span> <strong>{previewData.totalDestinatarios.toLocaleString("pt-BR")}</strong></div>
                <div><span className="text-muted-foreground">Remetente:</span> <strong>{previewData.campanha.remetente}</strong></div>
              </div>
              <div>
                <h4 className="font-medium mb-3">Amostra de e-mails (3 primeiros destinatários):</h4>
                <div className="space-y-4">
                  {previewData.amostra.map((a, i) => (
                    <div key={i} className="border rounded-lg overflow-hidden">
                      <div className="bg-muted px-4 py-2 text-sm">
                        <span className="text-muted-foreground">Para:</span> {a.nome} &lt;{a.email}&gt;
                        <br />
                        <span className="text-muted-foreground">Assunto:</span> <strong>{a.assunto}</strong>
                      </div>
                      <div
                        className="p-4 text-sm max-h-48 overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: a.corpo }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPreviewId(null); setPreviewData(null); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disparar confirm */}
      <AlertDialog open={dispararId !== null} onOpenChange={() => setDispararId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disparar campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Os e-mails serão enviados para todos os contatos da lista. Esta ação não pode ser desfeita.
              <br /><br />
              <strong>Certifique-se de que a chave SendGrid está configurada nas variáveis de ambiente.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => dispararId && disparar(dispararId)}
              disabled={disparando}
            >
              {disparando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Disparar Agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
       </AlertDialog>

      {/* Dialog de Aberturas */}
      <Dialog open={aberturasId !== null} onOpenChange={() => setAberturasId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-green-600" />
              Relatório de Envios da Campanha
            </DialogTitle>
          </DialogHeader>
          {loadingAberturas ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {/* Cards de resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-center">
                  <div className="text-2xl font-bold text-blue-700">{aberturas.length}</div>
                  <div className="text-blue-600 text-xs mt-1">Total enviados</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{aberturas.filter((a: any) => a.aberturas > 0).length}</div>
                  <div className="text-green-600 text-xs mt-1">Visualizaram</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-center">
                  <div className="text-2xl font-bold text-gray-700">{aberturas.filter((a: any) => a.status === 'ENVIADO' && a.aberturas === 0).length}</div>
                  <div className="text-gray-500 text-xs mt-1">Não visualizaram</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3 text-center">
                  <div className="text-2xl font-bold text-purple-700">{aberturas.filter((a: any) => a.status === 'ENVIADO').length > 0 ? Math.round((aberturas.filter((a: any) => a.aberturas > 0).length / aberturas.filter((a: any) => a.status === 'ENVIADO').length) * 100) : 0}%</div>
                  <div className="text-purple-600 text-xs mt-1">Taxa de abertura</div>
                </div>
              </div>
              {/* Tabela de destinatários */}
              <div className="max-h-[400px] overflow-y-auto rounded-lg border border-border bg-white">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-100 border-b-2 border-slate-200 hover:bg-slate-100">
                      <TableHead className="text-slate-900 font-semibold">Nome</TableHead>
                      <TableHead className="text-slate-900 font-semibold">E-mail</TableHead>
                      <TableHead className="text-center text-slate-900 font-semibold">Status envio</TableHead>
                      <TableHead className="text-center text-slate-900 font-semibold">Visualizações</TableHead>
                      <TableHead className="text-slate-900 font-semibold">Primeira abertura</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aberturas.map((a: any, idx: number) => (
                      <TableRow key={a.id} className={idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 hover:bg-slate-100'} style={{borderBottom: '1px solid #e2e8f0'}}>
                        <TableCell className="font-medium text-sm text-slate-900">{a.contatoNome || '—'}</TableCell>
                        <TableCell className="text-slate-700 text-xs">{a.email}</TableCell>
                        <TableCell className="text-center">
                          {a.status === 'ENVIADO' ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="h-3 w-3" /> Enviado
                            </span>
                          ) : a.status === 'ERRO' ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full" title={a.erro || ''}>
                              <XCircle className="h-3 w-3" /> Erro
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                              <Clock className="h-3 w-3" /> Pendente
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {a.aberturas > 0 ? (
                            <span className="inline-flex items-center gap-1 text-green-700 font-semibold text-sm">
                              <Eye className="h-3.5 w-3.5" /> {a.aberturas}x
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {a.abertoPrimeiramente ? new Date(a.abertoPrimeiramente).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {aberturas.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart2 className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Nenhum envio registrado para esta campanha.</p>
                </div>
              )}
            </div>
          )}
          {/* Seção de ações */}
          {!loadingAberturas && aberturas.length > 0 && (
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Ações com este relatório</p>
              {listaCriada ? (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span className="text-sm text-green-700">Lista criada com <strong>{listaCriada.total} contatos</strong>!</span>
                  <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => setListaCriada(null)}>Nova lista</Button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder="Nome da nova lista..."
                    value={nomeNovaLista}
                    onChange={e => setNomeNovaLista(e.target.value)}
                    className="flex-1 text-sm h-9"
                  />
                  <Button
                    size="sm" variant="outline"
                    className="text-green-700 border-green-300 hover:bg-green-50 text-xs"
                    disabled={!nomeNovaLista.trim() || criandoLista !== null}
                    onClick={() => handleCriarLista('abriram')}
                  >
                    {criandoLista === 'abriram' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                    Lista de quem abriu ({aberturas.filter((a: any) => a.aberturas > 0).length})
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="text-orange-700 border-orange-300 hover:bg-orange-50 text-xs"
                    disabled={!nomeNovaLista.trim() || criandoLista !== null}
                    onClick={() => handleCriarLista('nao_abriram')}
                  >
                    {criandoLista === 'nao_abriram' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Eye className="h-3 w-3 mr-1 opacity-40" />}
                    Lista de quem não abriu ({aberturas.filter((a: any) => a.status === 'ENVIADO' && a.aberturas === 0).length})
                  </Button>
                </div>
              )}
              <Button
                size="sm" variant="outline"
                className="w-full text-xs"
                onClick={handleExportarExcel}
              >
                <FileText className="h-3 w-3 mr-1" />
                Exportar relatório completo em Excel
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAberturasId(null); setListaCriada(null); setNomeNovaLista(""); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
// ─── AutomacoesTab ───────────────────────────────────────────────────────────

interface Automacao {
  id: number;
  tipo: "ANIVERSARIO" | "INADIMPLENCIA";
  nome: string;
  templateId: number;
  templateNome: string;
  ativo: boolean;
  horario: string;
  ultimoDisparo: string | null;
  totalEnviadoHoje: number;
}

function AutomacoesTab() {
  const qc = useQueryClient();
  const { data: automacoes = [], isLoading } = useQuery<Automacao[]>({
    queryKey: ["email-automacoes"],
    queryFn: () => apiFetch("/email-automacoes"),
  });
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["email-templates"],
    queryFn: () => apiFetch("/email-marketing/templates"),
  });
  const { data: anivHoje } = useQuery<{ total: number; clientes: any[] }>({
    queryKey: ["aniversariantes-hoje"],
    queryFn: () => apiFetch("/email-automacoes/aniversariantes-hoje"),
  });
  const { data: inadStats } = useQuery<{ total: number }>({
    queryKey: ["inadimplentes-com-email"],
    queryFn: () => apiFetch("/email-automacoes/inadimplentes-com-email"),
  });

  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ templateId: "", horario: "" });

  const toggleMutation = useMutation({
    mutationFn: ({ id, ativo }: { id: number; ativo: boolean }) =>
      apiFetch(`/email-automacoes/${id}`, { method: "PUT", body: JSON.stringify({ ativo }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-automacoes"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiFetch(`/email-automacoes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-automacoes"] });
      setEditId(null);
      toast.success("Automação atualizada!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dispararMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/email-automacoes/${id}/disparar-agora`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Disparo iniciado! Acompanhe os resultados em instantes.");
      setTimeout(() => qc.invalidateQueries({ queryKey: ["email-automacoes"] }), 3000);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Cards de estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-5 flex items-start gap-4">
          <div className="p-2 bg-pink-100 rounded-lg">
            <PartyPopper className="h-6 w-6 text-pink-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Aniversariantes hoje</p>
            <p className="text-3xl font-bold">{anivHoje?.total ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">clientes ativos com e-mail cadastrado</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 flex items-start gap-4">
          <div className="p-2 bg-orange-100 rounded-lg">
            <AlertTriangle className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Inadimplentes com e-mail</p>
            <p className="text-3xl font-bold">{inadStats?.total ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">registros elegíveis para cobrança automática</p>
          </div>
        </div>
      </div>

      {/* Lista de automações */}
      <div className="space-y-4">
        {automacoes.map(auto => (
          <div key={auto.id} className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${auto.tipo === "ANIVERSARIO" ? "bg-pink-100" : "bg-orange-100"}`}>
                  {auto.tipo === "ANIVERSARIO"
                    ? <PartyPopper className="h-5 w-5 text-pink-600" />
                    : <AlertTriangle className="h-5 w-5 text-orange-600" />}
                </div>
                <div>
                  <p className="font-semibold">{auto.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    Template: <span className="font-medium">{auto.templateNome}</span>
                    {" · "}
                    Horário: <span className="font-medium">{auto.horario}</span>
                    {auto.ultimoDisparo && (
                      <> · Último disparo: <span className="font-medium">{new Date(auto.ultimoDisparo).toLocaleString("pt-BR")}</span></>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleMutation.mutate({ id: auto.id, ativo: !auto.ativo })}
                  disabled={toggleMutation.isPending}
                  className={auto.ativo ? "text-green-600" : "text-muted-foreground"}
                >
                  {auto.ativo
                    ? <><ToggleRight className="h-5 w-5 mr-1" /> Ativo</>
                    : <><ToggleLeft className="h-5 w-5 mr-1" /> Inativo</>}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setEditId(auto.id); setEditForm({ templateId: String(auto.templateId), horario: auto.horario }); }}
                >
                  <Pencil className="h-4 w-4 mr-1" /> Configurar
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => dispararMutation.mutate(auto.id)}
                  disabled={dispararMutation.isPending}
                >
                  <Play className="h-4 w-4 mr-1" /> Disparar Agora
                </Button>
              </div>
            </div>

            {auto.ultimoDisparo && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                Último disparo: {new Date(auto.ultimoDisparo).toLocaleString("pt-BR")} · {auto.totalEnviadoHoje} e-mails enviados
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-muted/50 border p-4 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground flex items-center gap-2"><Zap className="h-4 w-4" /> Como funcionam os disparos automáticos</p>
        <p>• <strong>Aniversariantes:</strong> todo dia no horário configurado, o sistema busca clientes ativos com data de nascimento igual ao dia atual e envia o e-mail de aniversário automaticamente.</p>
        <p>• <strong>Inadimplentes:</strong> todo dia no horário configurado, o sistema busca inadimplentes que possuem e-mail cadastrado na Base de Clientes e envia o e-mail de cobrança.</p>
        <p>• Para funcionar, o cliente precisa ter <strong>e-mail cadastrado</strong> na Base de Clientes e, no caso de aniversariantes, a <strong>data de nascimento</strong> preenchida.</p>
      </div>

      {/* Dialog de configuração */}
      <Dialog open={editId !== null} onOpenChange={() => setEditId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Configurar Automação</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template de e-mail</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={editForm.templateId}
                onChange={e => setEditForm(f => ({ ...f, templateId: e.target.value }))}
              >
                <option value="">Selecione um template</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Horário do disparo diário</Label>
              <Input
                type="time"
                value={editForm.horario}
                onChange={e => setEditForm(f => ({ ...f, horario: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">O disparo ocorre uma vez por dia neste horário (horário de Brasília).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditId(null)}>Cancelar</Button>
            <Button
              onClick={() => editId && updateMutation.mutate({ id: editId, data: { templateId: parseInt(editForm.templateId), horario: editForm.horario } })}
              disabled={!editForm.templateId || !editForm.horario || updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Envio Individual Tab ────────────────────────────────────────────────────────

function EnvioIndividualTab() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [templateSelecionado, setTemplateSelecionado] = useState<number | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);

  // Carregar templates ao montar o componente
  useEffect(() => {
    const carregarTemplates = async () => {
      try {
        const resp = await fetch("/api/email-marketing/templates");
        const data = await resp.json();
        setTemplates(data || []);
      } catch (err) {
        console.error("Erro ao carregar templates", err);
      }
    };
    carregarTemplates();
  }, []);

  // Ao selecionar um template, carregar seu conteúdo
  const handleSelecionarTemplate = (templateId: number) => {
    setTemplateSelecionado(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setAssunto(template.assunto);
      // Se o corpo começa com BLOCKS_PREFIX, converter para HTML
      if (template.corpo.startsWith(BLOCKS_PREFIX)) {
        const blocos = deserializarBlocos(template.corpo);
        if (blocos) {
          const saudacao = template.saudacao || "Olá, {{nome}}!";
          const assinatura = template.assinatura || "Atenciosamente,\nEquipe Barcellos Seguros";
          const html = gerarHtmlDeBlocos(saudacao, assinatura, blocos);
          setCorpo(html);
        } else {
          setCorpo(template.corpo);
        }
      } else {
        setCorpo(template.corpo);
      }
    }
  };

  const handleEnviar = async () => {
    if (!nome || !email || !assunto || !corpo) {
      toast.error("Preencha todos os campos");
      return;
    }

    setEnviando(true);
    try {
      const resp = await fetch("/api/email-marketing/enviar-individual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinatario: email,
          destinatarioNome: nome,
          assunto,
          corpo,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erro ao enviar");
      toast.success("Email enviado com sucesso!");
      setNome("");
      setEmail("");
      setAssunto("");
      setCorpo("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-card border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Enviar Email Individual</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="nome">Nome do Destinatário</Label>
            <Input
              id="nome"
              placeholder="Ex: João Silva"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="Ex: joao@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="template">Template (Opcional)</Label>
            <select
              id="template"
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={templateSelecionado || ""}
              onChange={(e) => handleSelecionarTemplate(parseInt(e.target.value))}
            >
              <option value="">Selecione um template...</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="assunto">Assunto</Label>
            <Input
              id="assunto"
              placeholder="Assunto do email"
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="corpo">Mensagem</Label>
            <Textarea
              id="corpo"
              placeholder="Digite a mensagem do email"
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              rows={8}
            />
          </div>
          <Button
            onClick={handleEnviar}
            disabled={enviando || !nome || !email || !assunto || !corpo}
            className="w-full"
          >
            {enviando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {enviando ? "Enviando..." : "Enviar Email"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/// ─── Histórico de Envios Tab ──────────────────────────────────────────────────
function HistoricoEmailTab() {
  const [filtros, setFiltros] = useState({
    status: 'TODOS',
    campanhaId: 'TODOS',
    tipo: 'TODOS',
    abertura: 'TODOS',
    dataInicio: '',
    dataFim: '',
    busca: '',
  });
  const [buscaInput, setBuscaInput] = useState('');

  const { data: campanhas = [] } = useQuery<Campanha[]>({
    queryKey: ['email-campanhas-hist'],
    queryFn: () => apiFetch('/email-marketing/campanhas'),
  });

  const { data: historico = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ['email-historico', filtros],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filtros.status !== 'TODOS') params.set('status', filtros.status);
      if (filtros.campanhaId !== 'TODOS') params.set('campanhaId', filtros.campanhaId);
      if (filtros.tipo !== 'TODOS') params.set('tipo', filtros.tipo);
      if (filtros.dataInicio) params.set('dataInicio', filtros.dataInicio);
      if (filtros.dataFim) params.set('dataFim', filtros.dataFim);
      if (filtros.busca) params.set('busca', filtros.busca);
      return apiFetch(`/email-marketing/historico-envios?${params.toString()}`);
    },
  });

  const historicoFiltrado = (historico as any[]).filter((e: any) => {
    if (filtros.abertura === 'COM') return (e.aberturas || 0) > 0;
    if (filtros.abertura === 'SEM') return (e.aberturas || 0) === 0;
    return true;
  });
  const totalEnviados = historicoFiltrado.filter((e: any) => e.status === 'ENVIADO').length;
  const totalErros = historicoFiltrado.filter((e: any) => e.status === 'ERRO').length;
  const totalAberturas = historicoFiltrado.reduce((acc: number, e: any) => acc + (e.aberturas || 0), 0);
  const taxaAbertura = totalEnviados > 0 ? ((totalAberturas / totalEnviados) * 100).toFixed(1) : '0.0';

  function formatDt(ts: string | null) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Registros</p>
          <p className="text-2xl font-bold">{historicoFiltrado.length}</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Enviados</p>
          <p className="text-2xl font-bold text-green-600">{totalEnviados}</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Erros</p>
          <p className="text-2xl font-bold text-red-600">{totalErros}</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-xs text-muted-foreground">Taxa de Abertura</p>
          <p className="text-2xl font-bold text-blue-600">{taxaAbertura}%</p>
          <p className="text-xs text-muted-foreground">{totalAberturas} abertura(s)</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-card border rounded-lg p-4">
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tipo</label>
            <select
              className="mt-1 h-8 text-sm w-full border rounded px-2 bg-background"
              value={filtros.tipo}
              onChange={e => setFiltros(p => ({ ...p, tipo: e.target.value }))}
            >
              <option value="TODOS">Todos</option>
              <option value="ANIVERSARIO">🎂 Aniversário</option>
              <option value="INADIMPLENCIA">⚠️ Inadimplência</option>
              <option value="CAMPANHA">📧 Campanha</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Campanha</label>
            <select
              className="mt-1 h-8 text-sm w-full border rounded px-2 bg-background"
              value={filtros.campanhaId}
              onChange={e => setFiltros(p => ({ ...p, campanhaId: e.target.value }))}
            >
              <option value="TODOS">Todas</option>
              {(campanhas as Campanha[]).map((c: Campanha) => (
                <option key={c.id} value={String(c.id)}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <select
              className="mt-1 h-8 text-sm w-full border rounded px-2 bg-background"
              value={filtros.status}
              onChange={e => setFiltros(p => ({ ...p, status: e.target.value }))}
            >
              <option value="TODOS">Todos</option>
              <option value="ENVIADO">Enviado</option>
              <option value="ERRO">Erro</option>
              <option value="PENDENTE">Pendente</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Abertura</label>
            <select
              className="mt-1 h-8 text-sm w-full border rounded px-2 bg-background"
              value={filtros.abertura}
              onChange={e => setFiltros(p => ({ ...p, abertura: e.target.value }))}
            >
              <option value="TODOS">Todos</option>
              <option value="COM">Com abertura</option>
              <option value="SEM">Sem abertura</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Data início</label>
            <Input type="date" className="mt-1 h-8 text-sm" value={filtros.dataInicio} onChange={e => setFiltros(p => ({ ...p, dataInicio: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Data fim</label>
            <Input type="date" className="mt-1 h-8 text-sm" value={filtros.dataFim} onChange={e => setFiltros(p => ({ ...p, dataFim: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Buscar nome/e-mail</label>
            <div className="flex gap-1 mt-1">
              <Input
                className="h-8 text-sm"
                placeholder="Nome ou e-mail…"
                value={buscaInput}
                onChange={e => setBuscaInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') setFiltros(p => ({ ...p, busca: buscaInput })); }}
              />
              <Button size="sm" className="h-8 px-2" onClick={() => setFiltros(p => ({ ...p, busca: buscaInput }))}>
                <Search className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-sm text-muted-foreground">{historicoFiltrado.length} registro(s) • mostrando até 500</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              const header = ['Data/Hora','Nome','E-mail','Tipo','Campanha','Status','Aberturas','Obs'];
              const rows = historicoFiltrado.map((e: any) => [
                new Date(e.enviadoEm || e.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
                e.contatoNome || '',
                e.email || '',
                e.tipo === 'ANIVERSARIO' ? 'Aniversário' : e.tipo === 'INADIMPLENCIA' ? 'Inadimplência' : 'Campanha',
                e.campanhaNome || '',
                e.status || '',
                e.aberturas || 0,
                e.erro || '',
              ]);
              const csv = [header, ...rows].map(r => r.map((v: any) => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
              const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = `historico-emails-${new Date().toISOString().slice(0,10)}.csv`; a.click();
              URL.revokeObjectURL(url);
            }}>
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Exportar CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Atualizar
            </Button>
          </div>
        </div>
      </div>

      {/* Tabela */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
      ) : historico.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Mail className="w-10 h-10 mx-auto mb-2 opacity-20" />
          <p>Nenhum envio encontrado com os filtros selecionados.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Data/Hora</th>
                <th className="text-left px-3 py-2 font-medium">Nome</th>
                <th className="text-left px-3 py-2 font-medium">E-mail</th>
                <th className="text-left px-3 py-2 font-medium">Tipo</th>
                <th className="text-left px-3 py-2 font-medium">Campanha</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Aberturas</th>
                <th className="text-left px-3 py-2 font-medium">Obs</th>
              </tr>
            </thead>
            <tbody>
              {historicoFiltrado.map((e: any, i: number) => (
                <tr key={e.id || i} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{formatDt(e.enviadoEm || e.createdAt)}</td>
                  <td className="px-3 py-2 font-medium">{e.contatoNome || '—'}</td>
                  <td className="px-3 py-2 text-xs">{e.email}</td>
                  <td className="px-3 py-2">
                    {e.tipo === 'ANIVERSARIO' ? (
                      <span className="inline-flex items-center gap-1 bg-pink-100 text-pink-700 text-xs px-2 py-0.5 rounded-full font-medium">🎂 Aniversário</span>
                    ) : e.tipo === 'INADIMPLENCIA' ? (
                      <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium">⚠️ Inadimplência</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">📧 Campanha</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[180px] truncate">{e.campanhaNome || '—'}</td>
                  <td className="px-3 py-2">
                    {e.status === 'ENVIADO' ? (
                      <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 className="w-3 h-3" /> Enviado</span>
                    ) : e.status === 'ERRO' ? (
                      <span className="flex items-center gap-1 text-red-600 text-xs"><XCircle className="w-3 h-3" /> Erro</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{e.status}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {e.aberturas > 0 ? (
                      <span className="inline-flex items-center gap-1 text-blue-600 text-xs font-medium">
                        <Eye className="w-3 h-3" /> {e.aberturas}
                      </span>
                    ) : <span className="text-xs text-muted-foreground">0</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate">{e.erro || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- Main Page ---
export default function EmailMarketing() {
  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Email Marketing</h1>
            <p className="text-muted-foreground text-sm">Gerencie templates, listas e campanhas de e-mail</p>
          </div>
        </div>

        {/* SendGrid notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 flex items-start gap-3">
          <Mail className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <strong>Integração SendGrid necessária para disparar e-mails.</strong>
            <br />
            Configure a variável de ambiente <code className="bg-amber-100 px-1 rounded">SENDGRID_API_KEY</code> nas configurações do sistema para habilitar o disparo de campanhas.
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="campanhas">
          <TabsList className="grid w-full grid-cols-6 max-w-4xl">
            <TabsTrigger value="campanhas">
              <Megaphone className="h-4 w-4 mr-2" />
              Campanhas
            </TabsTrigger>
            <TabsTrigger value="listas">
              <Users className="h-4 w-4 mr-2" />
              Listas
            </TabsTrigger>
            <TabsTrigger value="templates">
              <FileText className="h-4 w-4 mr-2" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="automacoes">
              <Zap className="h-4 w-4 mr-2" />
              Automações
            </TabsTrigger>
            <TabsTrigger value="individual">
              <Mail className="h-4 w-4 mr-2" />
              Envio Individual
            </TabsTrigger>
            <TabsTrigger value="historico">
              <BarChart2 className="h-4 w-4 mr-2" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="campanhas" className="mt-6">
            <CampanhasTab />
          </TabsContent>
          <TabsContent value="listas" className="mt-6">
            <ListasTab />
          </TabsContent>
          <TabsContent value="templates" className="mt-6">
            <TemplatesTab />
          </TabsContent>
          <TabsContent value="automacoes" className="mt-6">
            <AutomacoesTab />
          </TabsContent>
          <TabsContent value="individual" className="mt-6">
            <EnvioIndividualTab />
          </TabsContent>
          <TabsContent value="historico" className="mt-6">
            <HistoricoEmailTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

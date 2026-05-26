import AppLayout from "@/components/AppLayout";
import { useState, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAno } from "@/contexts/AnoContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Upload, Trash2, AlertTriangle, CheckCircle2, Clock, DollarSign,
  Users, Phone, Search, Plus, Pencil, X, FileText, TrendingUp,
  CreditCard, Banknote, ChevronDown, ChevronUp, Download, Mail, RefreshCw, MessageSquare, Paperclip,
} from "lucide-react";

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const STATUS_OPTIONS = ["PAGO", "BOLETO", "EM CONTATO", "DESISTIU", "ESPECIAL", "PENDENTE"];

const FORMAS_PAGAMENTO = ["BOLETO", "DÉBITO EM CONTA", "DESC. EM FOLHA", "CARTÃO DE CRÉDITO"];

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ─── Sistema de cores por status (fiel à planilha) ─────────────────────────────
function getStatusStyle(status: string) {
  const s = (status ?? "").toUpperCase().trim();
  if (s === "PAGO")        return { bg: "bg-green-100", text: "text-green-800", border: "border-green-300", dot: "bg-green-500", label: "✓ Pago" };
  if (s === "BOLETO")      return { bg: "bg-blue-100",  text: "text-blue-800",  border: "border-blue-300",  dot: "bg-blue-500",  label: "📄 Boleto" };
  if (s === "EM CONTATO")  return { bg: "bg-yellow-100",text: "text-yellow-800",border: "border-yellow-300",dot: "bg-yellow-500",label: "📞 Em Contato" };
  if (s === "DESISTIU")    return { bg: "bg-red-100",   text: "text-red-800",   border: "border-red-300",   dot: "bg-red-500",   label: "✕ Desistiu" };
  if (s === "ESPECIAL")    return { bg: "bg-purple-100",text: "text-purple-800",border: "border-purple-300",dot: "bg-purple-500",label: "⭐ Especial" };
  return                          { bg: "bg-gray-100",  text: "text-gray-700",  border: "border-gray-300",  dot: "bg-gray-400",  label: "⏳ Pendente" };
}

function StatusBadge({ status, onClick }: { status: string; onClick?: () => void }) {
  const st = getStatusStyle(status);
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${st.bg} ${st.text} ${st.border} ${onClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
      title={onClick ? "Clique para alterar status" : undefined}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
      {st.label}
    </span>
  );
}

type FormData = {
  nome: string;
  cpf: string;
  telefone1: string;
  mesParcela: string;
  parcela: string;
  formaPagamento: string;
  valorParcelas: string;
  valorTotal: string;
  produtos: string;
  status: string;
  historicoCobranca: string;
};

const formVazio: FormData = {
  nome: "", cpf: "", telefone1: "", mesParcela: "", parcela: "",
  formaPagamento: "", valorParcelas: "", valorTotal: "", produtos: "",
  status: "BOLETO", historicoCobranca: "",
};

export default function Inadimplentes() {
  const { ano } = useAno();
  const [mesSel, setMesSel] = useState<number>(new Date().getMonth() + 1);
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [formaPgtoFiltro, setFormaPgtoFiltro] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<"dashboard" | "lista" | "anual">("dashboard");

  // Upload
  const [uploading, setUploading] = useState(false);
  const [mesUpload, setMesUpload] = useState(String(new Date().getMonth() + 1));
  const fileRef = useRef<HTMLInputElement>(null);

  // Edição de status rápida
  const [editandoStatus, setEditandoStatus] = useState<{
    id: number; nome: string; status: string; historico: string;
  } | null>(null);

  // Modal de novo/editar inadimplente
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(formVazio);

  // Expandir histórico
  const [expandido, setExpandido] = useState<number | null>(null);

  // Seleção para disparo de e-mail
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalDisparo, setModalDisparo] = useState(false);
  const [resultadoDisparo, setResultadoDisparo] = useState<any>(null);
  // Disparo WhatsApp
  const [modalDisparoWA, setModalDisparoWA] = useState(false);
  const [resultadoDisparoWA, setResultadoDisparoWA] = useState<any>(null);

  // Boletos por cliente (key = CPF ou ID string)
  const [boletosPorCliente, setBoletosPorCliente] = useState<Map<string, { base64: string; nomeArquivo: string }>>(new Map());
  const [clienteSelecionadoParaBoleto, setClienteSelecionadoParaBoleto] = useState<string | null>(null);
  const boletoFileRef = useRef<HTMLInputElement>(null);

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]); // remove prefixo data:...;base64,
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleBoletoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !clienteSelecionadoParaBoleto) return;
    try {
      const base64 = await fileToBase64(file);
      setBoletosPorCliente(prev => {
        const next = new Map(prev);
        next.set(clienteSelecionadoParaBoleto, { base64, nomeArquivo: file.name });
        return next;
      });
      toast.success(`Boleto "${file.name}" anexado!`);
    } catch {
      toast.error("Erro ao ler o arquivo PDF");
    } finally {
      if (boletoFileRef.current) boletoFileRef.current.value = "";
    }
  }

  const utils = trpc.useUtils();

  const { data: uploads = [] } = trpc.inadimplentes.uploads.useQuery();
  const { data: lista = [] } = trpc.inadimplentes.listar.useQuery({
    mes: mesSel,
    ano,
    status: statusFiltro === "todos" ? null : statusFiltro,
  });
  const { data: metricas } = trpc.inadimplentes.metricas.useQuery({ mes: mesSel, ano });
  const { data: resumoAnual = [] } = trpc.inadimplentes.resumoAnual.useQuery({ ano });

  const atualizarStatus = trpc.inadimplentes.atualizarStatus.useMutation({
    onSuccess: () => {
      utils.inadimplentes.listar.invalidate();
      utils.inadimplentes.metricas.invalidate();
      setEditandoStatus(null);
      toast.success("Status atualizado!");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const criarMutation = trpc.inadimplentes.criar.useMutation({
    onSuccess: () => {
      utils.inadimplentes.listar.invalidate();
      utils.inadimplentes.metricas.invalidate();
      setModalAberto(false);
      setForm(formVazio);
      setEditandoId(null);
      toast.success("Inadimplente salvo!");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const atualizarMutation = trpc.inadimplentes.atualizar.useMutation({
    onSuccess: () => {
      utils.inadimplentes.listar.invalidate();
      utils.inadimplentes.metricas.invalidate();
      setModalAberto(false);
      setForm(formVazio);
      setEditandoId(null);
      toast.success("Registro atualizado!");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const excluirMutation = trpc.inadimplentes.excluir.useMutation({
    onSuccess: () => {
      utils.inadimplentes.listar.invalidate();
      utils.inadimplentes.metricas.invalidate();
      toast.success("Registro excluído!");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const dispararEmail = trpc.inadimplentesDisparo.disparar.useMutation({
    onSuccess: (data) => {
      setResultadoDisparo(data);
      setSelecionados(new Set());
    },
    onError: (e) => toast.error("Erro no disparo: " + e.message),
  });

  const dispararWhatsapp = trpc.whatsapp.dispararInadimplentesWhatsapp.useMutation({
    onSuccess: (data) => {
      setResultadoDisparoWA(data);
      setSelecionados(new Set());
    },
    onError: (e) => toast.error("Erro no disparo WhatsApp: " + e.message),
  });

  const deletarUpload = trpc.inadimplentes.deletarUpload.useMutation({
    onSuccess: () => {
      utils.inadimplentes.uploads.invalidate();
      utils.inadimplentes.listar.invalidate();
      utils.inadimplentes.metricas.invalidate();
      toast.success("Upload removido!");
    },
  });

  // Filtro local por busca e forma de pagamento
  const listaFiltrada = useMemo(() => {
    let items = lista;
    if (busca.trim()) {
      const b = busca.toLowerCase();
      items = items.filter(i =>
        i.nome.toLowerCase().includes(b) ||
        (i.cpf ?? "").includes(b)
      );
    }
    if (formaPgtoFiltro !== "todos") {
      items = items.filter(i => i.formaPagamento === formaPgtoFiltro);
    }
    return items;
  }, [lista, busca, formaPgtoFiltro]);

  // Inadimplentes com e-mail (para seleção)
  const comEmail = useMemo(() => listaFiltrada.filter(i => (i as any).emailContato), [listaFiltrada]);
  const todosSelecionados = comEmail.length > 0 && comEmail.every(i => selecionados.has(i.cpf ?? String(i.id)));

  function toggleSelecionado(key: string) {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleTodos() {
    if (todosSelecionados) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(comEmail.map(i => i.cpf ?? String(i.id))));
    }
  }

  // Preview de upload
  type PreviewItem = { nome: string; cpf: string; competencias: string; valorTotal: number; acao: "ATUALIZAR" | "INSERIR" };
  type PreviewData = { totalRegistros: number; totalAtualizar: number; totalInserir: number; somaValor: number; itens: PreviewItem[] };
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [arquivoPendente, setArquivoPendente] = useState<File | null>(null);

  // Passo 1: ao selecionar arquivo, chamar preview
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("arquivo", file);
      formData.append("mes", mesUpload);
      formData.append("ano", String(ano));
      const res = await fetch("/api/upload/inadimplentes/preview", { method: "POST", body: formData });
      const json = await res.json();
      if (json.success) {
        setPreview(json as PreviewData);
        setArquivoPendente(file);
      } else {
        toast.error(json.error ?? "Erro ao processar arquivo");
      }
    } catch (err) {
      toast.error("Falha ao processar arquivo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Passo 2: confirmar importação
  async function confirmarImport() {
    if (!arquivoPendente) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("arquivo", arquivoPendente);
      formData.append("mes", mesUpload);
      formData.append("ano", String(ano));
      const res = await fetch("/api/upload/inadimplentes", { method: "POST", body: formData });
      const json = await res.json();
      if (json.success) {
        const msg = json.enriquecidos > 0
          ? `${json.totalRegistros} registros importados — ${json.enriquecidos} contatos enriquecidos com e-mail/telefone da base!`
          : `${json.totalRegistros} registros importados com sucesso!`;
        toast.success(msg);
        utils.inadimplentes.uploads.invalidate();
        utils.inadimplentes.listar.invalidate();
        utils.inadimplentes.metricas.invalidate();
        setPreview(null);
        setArquivoPendente(null);
      } else {
        toast.error(json.error ?? "Erro no upload");
      }
    } catch (err) {
      toast.error("Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  function abrirNovo() {
    setForm({ ...formVazio, status: "BOLETO" });
    setEditandoId(null);
    setModalAberto(true);
  }

  function abrirEditar(item: typeof lista[0]) {
    setForm({
      nome: item.nome ?? "",
      cpf: item.cpf ?? "",
      telefone1: item.telefone1 ?? "",
      mesParcela: item.mesParcela ?? "",
      parcela: item.parcela ?? "",
      formaPagamento: item.formaPagamento ?? "",
      valorParcelas: item.valorParcelas ?? "",
      valorTotal: item.valorTotal ? String(item.valorTotal) : "",
      produtos: item.produtos ?? "",
      status: item.status ?? "BOLETO",
      historicoCobranca: item.historicoCobranca ?? "",
    });
    setEditandoId(item.id);
    setModalAberto(true);
  }

  function salvarForm() {
    const payload = {
      mes: mesSel,
      ano,
      nome: form.nome,
      cpf: form.cpf || undefined,
      telefone1: form.telefone1 || undefined,
      mesParcela: form.mesParcela || undefined,
      parcela: form.parcela || undefined,
      formaPagamento: form.formaPagamento || undefined,
      valorParcelas: form.valorParcelas || undefined,
      valorTotal: form.valorTotal ? parseFloat(form.valorTotal.replace(",", ".")) : undefined,
      produtos: form.produtos || undefined,
      status: form.status,
      historicoCobranca: form.historicoCobranca || undefined,
    };
    if (editandoId) {
      atualizarMutation.mutate({ id: editandoId, data: payload as any });
    } else {
      criarMutation.mutate(payload as any);
    }
  }

  const totalValor = metricas?.totalValor ?? 0;
  const total = metricas?.total ?? 0;
  const pagos = metricas?.pagos ?? 0;
  const valorRecuperado = metricas?.valorRecuperado ?? 0;
  const ticketMedio = metricas?.ticketMedio ?? 0;
  const taxaRecuperacao = total > 0 ? (pagos / total) * 100 : 0;
  const maisDeUmaCompetencia = (metricas as any)?.maisDeUmaCompetencia ?? 0;
  const primeirasParcelas = (metricas as any)?.primeirasParcelas ?? 0;

  const exportarCSV = () => {
    const header = ["Nome", "CPF", "Telefone", "Mês/Parcela", "Parcela", "Forma Pagamento", "Valor Total", "Produtos", "Status", "Histórico"];
    const csv = [header.join(";"), ...listaFiltrada.map(i => [
      i.nome, i.cpf || "", i.telefone1 || "",
      i.mesParcela || "", i.parcela || "", i.formaPagamento || "",
      i.valorTotal ? Number(i.valorTotal).toFixed(2).replace(".", ",") : "",
      (i.produtos || "").replace(/;/g, ","),
      i.status || "",
      (i.historicoCobranca || "").replace(/;/g, ","),
    ].join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `inadimplentes_${MESES[mesSel - 1]}_${ano}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Relatório exportado!");
  };

  return (
    <AppLayout>
      <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inadimplentes</h1>
          <p className="text-sm text-muted-foreground">
            Controle de cobranças e recuperação — {ano}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const res = await fetch("/api/inadimplentes/enriquecer-contatos", { method: "POST" });
                const json = await res.json();
                if (json.ok) {
                  toast.success(`${json.atualizados} registros enriquecidos com e-mail/telefone da Base de Clientes!`);
                  utils.inadimplentes.listar.invalidate();
                } else {
                  toast.error(json.error ?? "Erro ao enriquecer");
                }
              } catch { toast.error("Falha ao enriquecer contatos"); }
            }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Enriquecer Contatos
          </Button>
          <Button variant="outline" onClick={exportarCSV} className="gap-2">
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
          <Button onClick={abrirNovo} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Registro Manual
          </Button>
        </div>
      </div>

      {/* Filtro de mês */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground">Mês:</span>
        <div className="flex gap-1 flex-wrap">
          {MESES.map((m, i) => (
            <Button
              key={i}
              variant={mesSel === i + 1 ? "default" : "outline"}
              size="sm"
              className="text-xs px-2 py-1 h-7"
              onClick={() => setMesSel(i + 1)}
            >
              {m.slice(0, 3)}
            </Button>
          ))}
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setAba("dashboard")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            aba === "dashboard"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setAba("lista")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            aba === "lista"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Registros ({lista.length})
        </button>
        <button
          onClick={() => setAba("anual")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            aba === "anual"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Anual {ano}
        </button>
      </div>

      {/* ─── DASHBOARD ─────────────────────────────────────────────────────────── */}
      {aba === "dashboard" && (
        <div className="space-y-6">
          {/* Métricas principais */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <Card className="col-span-2 lg:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Clientes</p>
                    <p className="text-2xl font-bold text-foreground">{total}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-2 lg:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <DollarSign className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Valor Total</p>
                    <p className="text-lg font-bold text-red-600">{fmt(totalValor)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-2 lg:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Valor Recuperado</p>
                    <p className="text-lg font-bold text-green-600">{fmt(valorRecuperado)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ticket Médio</p>
                    <p className="text-lg font-bold text-foreground">{fmt(ticketMedio)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pagos</p>
                    <p className="text-2xl font-bold text-green-600">{pagos}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Taxa Recuperação</p>
                    <p className="text-2xl font-bold text-orange-600">{taxaRecuperacao.toFixed(1)}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cards de alerta especiais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-200 dark:bg-amber-800 rounded-lg">
                    <AlertTriangle className="w-6 h-6 text-amber-700 dark:text-amber-300" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">2+ Competências em Aberto</p>
                    <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">{maisDeUmaCompetencia}</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Clientes com múltiplas parcelas em atraso</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-2 border-blue-400 bg-blue-50 dark:bg-blue-950/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-200 dark:bg-blue-800 rounded-lg">
                    <Users className="w-6 h-6 text-blue-700 dark:text-blue-300" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">12 Primeiras Parcelas</p>
                    <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{primeirasParcelas}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Clientes inadimplentes na 1ª competência (sem atraso anterior)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Status dos clientes + Forma de pagamento */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">📌 Status dos Clientes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { key: "pagos",     label: "Pago",       color: "bg-green-500",  count: metricas?.pagos ?? 0 },
                    { key: "boleto",    label: "Boleto",     color: "bg-blue-500",   count: metricas?.boleto ?? 0 },
                    { key: "emContato", label: "Em Contato", color: "bg-yellow-500", count: metricas?.emContato ?? 0 },
                    { key: "desistiu",  label: "Desistiu",   color: "bg-red-500",    count: metricas?.desistiu ?? 0 },
                    { key: "especial",  label: "Especial",   color: "bg-purple-500", count: metricas?.especial ?? 0 },
                    { key: "pendente",  label: "Pendente",   color: "bg-gray-400",   count: metricas?.pendente ?? 0 },
                  ].map(item => (
                    <div key={item.key} className="flex items-center gap-3">
                      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${item.color}`} />
                      <span className="text-sm flex-1 text-foreground">{item.label}</span>
                      <span className="text-sm font-semibold text-foreground">{item.count}</span>
                      <div className="w-24 bg-muted rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${item.color}`}
                          style={{ width: total > 0 ? `${(item.count / total) * 100}%` : "0%" }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {total > 0 ? ((item.count / total) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Forma de Pagamento */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">💳 Forma de Pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(metricas?.porFormaPagamento ?? []).map((item, idx) => {
                    const colors = ["bg-blue-500", "bg-green-500", "bg-orange-500", "bg-purple-500", "bg-gray-400"];
                    const color = colors[idx % colors.length];
                    return (
                      <div key={item.forma} className="flex items-center gap-3">
                        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${color}`} />
                        <span className="text-sm flex-1 text-foreground truncate">{item.forma}</span>
                        <span className="text-sm font-semibold text-foreground">{item.qtd}</span>
                        <div className="w-24 bg-muted rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${color}`}
                            style={{ width: `${(item.pct * 100).toFixed(0)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-10 text-right">
                          {(item.pct * 100).toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                  {(metricas?.porFormaPagamento ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum dado disponível</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Upload de planilha */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="w-4 h-4" /> Importar Planilha de Inadimplentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 flex-wrap">
                <Select value={mesUpload} onValueChange={setMesUpload}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? "Importando..." : "Selecionar Arquivo Excel"}
                </Button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm" className="hidden" onChange={handleUpload} />
                <span className="text-xs text-muted-foreground">Formato: .xlsx, .xls, .xlsm</span>
              </div>

              {uploads.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Uploads realizados:</p>
                  {uploads.map((u) => (
                    <div key={u.id} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-2">
                      <span>{MESES[(u.mes ?? 1) - 1]}/{u.ano} — {u.totalRegistros} registros</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 h-6 w-6 p-0"
                        onClick={() => deletarUpload.mutate({ id: u.id })}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── LISTA ─────────────────────────────────────────────────────────────── */}
      {aba === "lista" && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou CPF..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={formaPgtoFiltro} onValueChange={setFormaPgtoFiltro}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Forma de Pagamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as Formas</SelectItem>
                {FORMAS_PAGAMENTO.map(f => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="text-sm text-muted-foreground">{listaFiltrada.length} registros</span>
          </div>

          {/* Legenda de cores */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground font-medium">Legenda:</span>
            {STATUS_OPTIONS.map(s => {
              const st = getStatusStyle(s);
              return (
                <span key={s} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${st.bg} ${st.text} ${st.border}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                  {st.label}
                </span>
              );
            })}
          </div>

          {/* Barra de ação flutuante quando há selecionados */}
          {selecionados.size > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-primary text-primary-foreground px-5 py-3 rounded-full shadow-2xl border border-primary/20">
              <span className="text-sm font-semibold">{selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""}</span>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs gap-1"
                onClick={() => setModalDisparo(true)}
              >
                <Mail className="w-3 h-3" /> E-mail
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs gap-1 bg-green-600 text-white hover:bg-green-700"
                onClick={() => setModalDisparoWA(true)}
                disabled={dispararWhatsapp.isPending}
              >
                <MessageSquare className="w-3 h-3" /> WhatsApp
              </Button>
              <button
                className="ml-1 opacity-70 hover:opacity-100"
                onClick={() => setSelecionados(new Set())}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Tabela */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={todosSelecionados}
                          onChange={toggleTodos}
                          title="Selecionar todos com e-mail"
                          className="w-4 h-4 cursor-pointer"
                        />
                      </TableHead>
                      <TableHead className="font-semibold">Nome</TableHead>
                      <TableHead className="font-semibold">Contato</TableHead>
                      <TableHead className="font-semibold">CPF</TableHead>
                      <TableHead className="font-semibold">Mês/Parcela</TableHead>
                      <TableHead className="font-semibold">Forma Pgto</TableHead>
                      <TableHead className="font-semibold text-right">Valor</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">Histórico</TableHead>
                      <TableHead className="font-semibold text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listaFiltrada.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          Nenhum registro encontrado para {MESES[mesSel - 1]}/{ano}
                        </TableCell>
                      </TableRow>
                    )}
                    {listaFiltrada.map((item) => {
                      const st = getStatusStyle(item.status ?? "");
                      const isExpanded = expandido === item.id;
                      const mp = item.mesParcela ?? "";
                      const temMultiComp = mp.includes(",") || /[0-9]\/[0-9]{2}\s+[0-9]/.test(mp);
                      const itemKey = item.cpf ?? String(item.id);
                      const isSelecionado = selecionados.has(itemKey);
                      const temEmail = !!(item as any).emailContato;
                      return (
                        <TableRow
                          key={item.id}
                          className={`border-l-4 hover:bg-muted/20 transition-colors ${temMultiComp ? "bg-amber-50 dark:bg-amber-950/20" : ""} ${isSelecionado ? "ring-1 ring-inset ring-primary/40 bg-primary/5" : ""}`}
                          style={{ borderLeftColor: item.status === "PAGO" ? "#22c55e" : item.status === "BOLETO" ? "#3b82f6" : item.status === "EM CONTATO" ? "#eab308" : item.status === "DESISTIU" ? "#ef4444" : item.status === "ESPECIAL" ? "#a855f7" : "#9ca3af" }}
                        >
                          <TableCell className="w-10">
                            {temEmail ? (
                              <input
                                type="checkbox"
                                checked={isSelecionado}
                                onChange={() => toggleSelecionado(itemKey)}
                                className="w-4 h-4 cursor-pointer"
                              />
                            ) : (
                              <span title="Sem e-mail cadastrado" className="text-muted-foreground/30 text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="font-medium max-w-[200px]">
                            <div className="truncate">{item.nome}</div>
                            {item.telefone1 && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="w-3 h-3" />{item.telefone1}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm min-w-[160px]">
                            {(item as any).emailContato ? (
                              <div className="flex items-center gap-1 text-xs text-blue-700">
                                <Mail className="w-3 h-3 shrink-0" />
                                <span className="truncate max-w-[140px]">{(item as any).emailContato}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">Sem e-mail</span>
                            )}
                            {(item as any).telefoneContato && (
                              <div className="flex items-center gap-1 text-xs text-green-700 mt-0.5">
                                <Phone className="w-3 h-3 shrink-0" />
                                <span>{(item as any).telefoneContato}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground font-mono">{item.cpf ?? "—"}</TableCell>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{item.mesParcela ?? "—"}</span>
                              {temMultiComp && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200">
                                  <AlertTriangle className="w-3 h-3" /> Multi
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs bg-muted px-2 py-0.5 rounded">
                              {item.formaPagamento ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-foreground">
                            {item.valorTotal ? fmt(Number(item.valorTotal)) : "—"}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              status={item.status ?? "PENDENTE"}
                              onClick={() => setEditandoStatus({
                                id: item.id,
                                nome: item.nome,
                                status: item.status ?? "PENDENTE",
                                historico: item.historicoCobranca ?? "",
                              })}
                            />
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            {item.historicoCobranca ? (
                              <div>
                                <p className={`text-xs text-muted-foreground ${isExpanded ? "" : "line-clamp-2"}`}>
                                  {item.historicoCobranca}
                                </p>
                                {item.historicoCobranca.length > 80 && (
                                  <button
                                    className="text-xs text-primary hover:underline flex items-center gap-0.5 mt-0.5"
                                    onClick={() => setExpandido(isExpanded ? null : item.id)}
                                  >
                                    {isExpanded ? <><ChevronUp className="w-3 h-3" />Menos</> : <><ChevronDown className="w-3 h-3" />Mais</>}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-7 w-7 p-0 ${boletosPorCliente.has(itemKey) ? "text-green-600 hover:text-green-700" : "text-muted-foreground hover:text-blue-600"}`}
                                title={boletosPorCliente.has(itemKey) ? `Boleto: ${boletosPorCliente.get(itemKey)!.nomeArquivo} (clique para trocar)` : "Anexar boleto PDF"}
                                onClick={() => {
                                  setClienteSelecionadoParaBoleto(itemKey);
                                  boletoFileRef.current?.click();
                                }}
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                title="Editar"
                                onClick={() => abrirEditar(item)}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                                title="Excluir"
                                onClick={() => {
                                  if (confirm(`Excluir "${item.nome}"?`)) {
                                    excluirMutation.mutate({ id: item.id });
                                  }
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

          {/* ─── ANUAL ────────────────────────────────────────────────────────────────────────────────── */}
      {aba === "anual" && (() => {
        const totalReg = resumoAnual.reduce((s, r) => s + r.total, 0);
        const totalVal = resumoAnual.reduce((s, r) => s + r.totalValor, 0);
        const totalRec = resumoAnual.reduce((s, r) => s + r.valorRecuperado, 0);
        const totalPag = resumoAnual.reduce((s, r) => s + r.pagos, 0);
        const taxaAnual = totalReg > 0 ? (totalPag / totalReg) * 100 : 0;
        return (
          <div className="space-y-6">
            {/* Cards de totais anuais */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Total Registros</p>
                  <p className="text-2xl font-bold text-foreground">{totalReg}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-red-500 mb-1">Valor em Aberto</p>
                  <p className="text-lg font-bold text-red-600">{fmt(totalVal)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-green-500 mb-1">Valor Recuperado</p>
                  <p className="text-lg font-bold text-green-600">{fmt(totalRec)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-blue-500 mb-1">Taxa Recuperação</p>
                  <p className="text-2xl font-bold text-blue-600">{taxaAnual.toFixed(1)}%</p>
                </CardContent>
              </Card>
            </div>

            {/* Tabela mensal detalhada */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Detalhamento Mensal — {ano}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {resumoAnual.length === 0 ? (
                  <div className="text-center p-8 text-muted-foreground text-sm">Nenhum dado para {ano}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3 font-medium">Mês</th>
                          <th className="text-right p-3 font-medium">Total</th>
                          <th className="text-right p-3 font-medium">Valor</th>
                          <th className="text-right p-3 font-medium">Pagos</th>
                          <th className="text-right p-3 font-medium">Recuperado</th>
                          <th className="text-right p-3 font-medium">Em Contato</th>
                          <th className="text-right p-3 font-medium">Boleto</th>
                          <th className="text-right p-3 font-medium">Desistiu</th>
                          <th className="text-right p-3 font-medium">Taxa Recup.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resumoAnual.map(r => (
                          <tr
                            key={r.mes}
                            className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => { setMesSel(r.mes); setAba("dashboard"); }}
                            title="Clique para ver o dashboard deste mês"
                          >
                            <td className="p-3 font-medium">{MESES[r.mes - 1]}</td>
                            <td className="p-3 text-right">{r.total}</td>
                            <td className="p-3 text-right text-red-600 font-medium">{fmt(r.totalValor)}</td>
                            <td className="p-3 text-right text-green-600 font-medium">{r.pagos}</td>
                            <td className="p-3 text-right text-green-700 font-medium">{fmt(r.valorRecuperado)}</td>
                            <td className="p-3 text-right text-yellow-600">{r.emContato}</td>
                            <td className="p-3 text-right text-blue-600">{r.boleto}</td>
                            <td className="p-3 text-right text-red-500">{r.desistiu}</td>
                            <td className="p-3 text-right">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                r.taxaRecuperacao >= 50 ? "bg-green-100 text-green-700" :
                                r.taxaRecuperacao >= 25 ? "bg-yellow-100 text-yellow-700" :
                                "bg-red-100 text-red-700"
                              }`}>
                                {r.taxaRecuperacao.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                        {/* Linha de totais */}
                        <tr className="border-t-2 bg-muted/50 font-semibold">
                          <td className="p-3">Total {ano}</td>
                          <td className="p-3 text-right">{totalReg}</td>
                          <td className="p-3 text-right text-red-600">{fmt(totalVal)}</td>
                          <td className="p-3 text-right text-green-600">{totalPag}</td>
                          <td className="p-3 text-right text-green-700">{fmt(totalRec)}</td>
                          <td className="p-3 text-right text-yellow-600">{resumoAnual.reduce((s,r)=>s+r.emContato,0)}</td>
                          <td className="p-3 text-right text-blue-600">{resumoAnual.reduce((s,r)=>s+r.boleto,0)}</td>
                          <td className="p-3 text-right text-red-500">{resumoAnual.reduce((s,r)=>s+r.desistiu,0)}</td>
                          <td className="p-3 text-right">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              taxaAnual >= 50 ? "bg-green-100 text-green-700" :
                              taxaAnual >= 25 ? "bg-yellow-100 text-yellow-700" :
                              "bg-red-100 text-red-700"
                            }`}>
                              {taxaAnual.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center">Clique em qualquer mês para ver o dashboard detalhado daquele mês</p>
          </div>
        );
      })()}

      {/* Input oculto para anexar boleto PDF — fora das abas para estar sempre no DOM */}
      <input ref={boletoFileRef} type="file" accept=".pdf" className="hidden" onChange={handleBoletoUpload} />

      {/* ─── MODAL: Editar Status ──────────────────────────────────────────── */}
      <Dialog open={!!editandoStatus} onOpenChange={() => setEditandoStatus(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Atualizar Status</DialogTitle>
          </DialogHeader>
          {editandoStatus && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-foreground">{editandoStatus.nome}</p>

              <div className="space-y-2">
                <Label>Status</Label>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_OPTIONS.map(s => {
                    const st = getStatusStyle(s);
                    const selected = editandoStatus.status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setEditandoStatus({ ...editandoStatus, status: s })}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                          selected
                            ? `${st.bg} ${st.text} ${st.border} ring-2 ring-offset-1 ring-current`
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                        {st.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Histórico de Cobrança</Label>
                <Textarea
                  rows={3}
                  value={editandoStatus.historico}
                  onChange={(e) => setEditandoStatus({ ...editandoStatus, historico: e.target.value })}
                  placeholder="Registre o contato, negociação ou observação..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditandoStatus(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (editandoStatus) {
                  atualizarStatus.mutate({
                    id: editandoStatus.id,
                    status: editandoStatus.status,
                    historico: editandoStatus.historico,
                  });
                }
              }}
              disabled={atualizarStatus.isPending}
            >
              {atualizarStatus.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: Novo / Editar Inadimplente ────────────────────────────────── */}
      <Dialog open={modalAberto} onOpenChange={(open) => { if (!open) { setModalAberto(false); setEditandoId(null); setForm(formVazio); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoId ? "Editar Registro" : "Novo Inadimplente"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label>Nome do Cliente *</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo" />
            </div>
            <div className="space-y-1">
              <Label>CPF</Label>
              <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" />
            </div>
            <div className="space-y-1">
              <Label>Telefone</Label>
              <Input value={form.telefone1} onChange={(e) => setForm({ ...form, telefone1: e.target.value })} placeholder="(48) 99999-9999" />
            </div>
            <div className="space-y-1">
              <Label>Mês/Parcela</Label>
              <Input value={form.mesParcela} onChange={(e) => setForm({ ...form, mesParcela: e.target.value })} placeholder="01/2026" />
            </div>
            <div className="space-y-1">
              <Label>Nº Parcela</Label>
              <Input value={form.parcela} onChange={(e) => setForm({ ...form, parcela: e.target.value })} placeholder="Ex: 12" />
            </div>
            <div className="space-y-1">
              <Label>Forma de Pagamento</Label>
              <Select value={form.formaPagamento} onValueChange={(v) => setForm({ ...form, formaPagamento: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Valor Total (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.valorTotal}
                onChange={(e) => setForm({ ...form, valorTotal: e.target.value })}
                placeholder="0,00"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Detalhamento de Valores</Label>
              <Input value={form.valorParcelas} onChange={(e) => setForm({ ...form, valorParcelas: e.target.value })} placeholder="Ex: 150,00 | 75,00 | 25,00" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Produtos</Label>
              <Textarea rows={2} value={form.produtos} onChange={(e) => setForm({ ...form, produtos: e.target.value })} placeholder="Produtos do segurado..." />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Status</Label>
              <div className="grid grid-cols-3 gap-2">
                {STATUS_OPTIONS.map(s => {
                  const st = getStatusStyle(s);
                  const selected = form.status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm({ ...form, status: s })}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                        selected
                          ? `${st.bg} ${st.text} ${st.border} ring-2 ring-offset-1 ring-current`
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                      {st.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Histórico de Cobrança</Label>
              <Textarea rows={3} value={form.historicoCobranca} onChange={(e) => setForm({ ...form, historicoCobranca: e.target.value })} placeholder="Registre contatos, negociações, observações..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setModalAberto(false); setEditandoId(null); setForm(formVazio); }}>
              Cancelar
            </Button>
            <Button
              onClick={salvarForm}
              disabled={!form.nome || criarMutation.isPending || atualizarMutation.isPending}
            >
              {criarMutation.isPending || atualizarMutation.isPending ? "Salvando..." : editandoId ? "Atualizar" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de prévia de importação */}
      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) { setPreview(null); setArquivoPendente(null); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" /> Prévia da Importação — {MESES[parseInt(mesUpload) - 1]}/{ano}
            </DialogTitle>
          </DialogHeader>

          {preview && (
            <>
              {/* Cards de resumo */}
              <div className="grid grid-cols-3 gap-3 my-2">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">{preview.totalRegistros}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total de clientes</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{preview.totalAtualizar}</p>
                  <p className="text-xs text-blue-600 mt-1">Serão atualizados</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{preview.totalInserir}</p>
                  <p className="text-xs text-green-600 mt-1">Serão inseridos</p>
                </div>
              </div>

              {preview.totalAtualizar > 0 && (
                <p className="text-xs text-muted-foreground bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
                  ⚠️ Os registros marcados como <strong>ATUALIZAR</strong> terão seus dados atualizados, mas o <strong>status manual</strong> (PAGO, BOLETO, etc.) será preservado.
                </p>
              )}

              {/* Tabela de itens */}
              <div className="overflow-auto flex-1 border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">Nome</th>
                      <th className="text-left p-2 font-medium">CPF</th>
                      <th className="text-left p-2 font-medium">Competências</th>
                      <th className="text-right p-2 font-medium">Valor Total</th>
                      <th className="text-center p-2 font-medium">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.itens.map((item, idx) => (
                      <tr key={idx} className="border-t hover:bg-muted/30">
                        <td className="p-2 font-medium">{item.nome}</td>
                        <td className="p-2 text-muted-foreground">{item.cpf || "—"}</td>
                        <td className="p-2 text-muted-foreground text-xs">{item.competencias || "—"}</td>
                        <td className="p-2 text-right">{fmt(item.valorTotal)}</td>
                        <td className="p-2 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                            item.acao === "ATUALIZAR"
                              ? "bg-blue-100 text-blue-700 border border-blue-200"
                              : "bg-green-100 text-green-700 border border-green-200"
                          }`}>
                            {item.acao === "ATUALIZAR" ? "↻ Atualizar" : "+ Inserir"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => { setPreview(null); setArquivoPendente(null); }}>
              Cancelar
            </Button>
            <Button onClick={confirmarImport} disabled={uploading}>
              {uploading ? "Importando..." : `Confirmar Importação (${preview?.totalRegistros ?? 0} registros)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ─── MODAL: Confirmar Disparo de E-mail ───────────────────────────────── */}
      <Dialog open={modalDisparo} onOpenChange={(open) => { if (!open) setModalDisparo(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              Enviar E-mail de Cobrança
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium">{selecionados.size} inadimplente{selecionados.size > 1 ? "s" : ""} selecionado{selecionados.size > 1 ? "s" : ""}</p>
              <p className="text-xs text-muted-foreground">
                Cada cliente receberá um e-mail personalizado com as competências em aberto e um botão de WhatsApp para facilitar o contato.
              </p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-xs text-blue-800 dark:text-blue-200 font-medium mb-1">O e-mail incluirá:</p>
              <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                <li>• Nome do cliente personalizado</li>
                <li>• Lista das competências em aberto com valores</li>
                <li>• Botão de WhatsApp para contato direto (+55 48 3372-6890)</li>
                <li>• Assinatura da Barcellos Seguros</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalDisparo(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                setModalDisparo(false);
                dispararEmail.mutate({ cpfs: Array.from(selecionados) });
                toast.info(`Disparando e-mails para ${selecionados.size} inadimplente${selecionados.size > 1 ? "s" : ""}...`);
              }}
              disabled={dispararEmail.isPending}
              className="gap-2"
            >
              <Mail className="w-4 h-4" />
              {dispararEmail.isPending ? "Enviando..." : "Confirmar Disparo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: Resultado do Disparo ────────────────────────────────────────── */}
      <Dialog open={!!resultadoDisparo} onOpenChange={(open) => { if (!open) setResultadoDisparo(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Resultado do Disparo
            </DialogTitle>
          </DialogHeader>
          {resultadoDisparo && (
            <div className="space-y-4 overflow-y-auto">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{resultadoDisparo.enviados}</p>
                  <p className="text-xs text-green-600 mt-1">Enviados</p>
                </div>
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-700">{resultadoDisparo.semEmail}</p>
                  <p className="text-xs text-yellow-600 mt-1">Sem e-mail</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{resultadoDisparo.erros}</p>
                  <p className="text-xs text-red-600 mt-1">Erros</p>
                </div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {resultadoDisparo.resultados?.map((r: any, i: number) => (
                  <div key={i} className={`flex items-center justify-between text-xs px-3 py-2 rounded border ${
                    r.status === "enviado" ? "bg-green-50 border-green-200" :
                    r.status === "sem_email" ? "bg-yellow-50 border-yellow-200" :
                    "bg-red-50 border-red-200"
                  }`}>
                    <span className="font-medium truncate max-w-[200px]">{r.nome}</span>
                    <span className={`font-semibold ${
                      r.status === "enviado" ? "text-green-700" :
                      r.status === "sem_email" ? "text-yellow-700" :
                      "text-red-700"
                    }`}>
                      {r.status === "enviado" ? "✓ Enviado" : r.status === "sem_email" ? "Sem e-mail" : `Erro: ${r.erro}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setResultadoDisparo(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: Confirmar Disparo WhatsApp ──────────────────────────────────────────────── */}
      <Dialog open={modalDisparoWA} onOpenChange={setModalDisparoWA}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-green-600" />
              Disparar WhatsApp de Cobrança
            </DialogTitle>
          </DialogHeader>
          {(() => {
            const comBoleto = Array.from(selecionados).filter(k => boletosPorCliente.has(k)).length;
            return (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Serão enviadas mensagens de cobrança via WhatsApp para <strong>{selecionados.size}</strong> inadimplente{selecionados.size > 1 ? "s" : ""} selecionado{selecionados.size > 1 ? "s" : ""}.
                </p>
                {comBoleto > 0 && (
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800 flex items-center gap-2">
                    <Paperclip className="w-4 h-4 shrink-0" />
                    <span><strong>{comBoleto}</strong> cliente{comBoleto > 1 ? "s" : ""} receberá{comBoleto > 1 ? "ão" : ""} o boleto PDF anexado junto à mensagem.</span>
                  </div>
                )}
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                  <p className="font-semibold mb-1">📱 Mensagem que será enviada:</p>
                  <p className="text-xs whitespace-pre-line">Olá, [Nome]! Identificamos uma pendência financeira em seu nome junto à Barcellos Seguros. Por favor, entre em contato para regularizar sua situação: 📞 (48) 3372-6890</p>
                  <p className="text-xs text-green-600 mt-1">Personalize a mensagem em WhatsApp Marketing → Automações</p>
                </div>
                <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800">
                  ⚠️ Apenas inadimplentes com telefone cadastrado receberão a mensagem. Certifique-se de que a Z-API está configurada em Configurações → Integrações.
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalDisparoWA(false)}>Cancelar</Button>
            <Button
              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => {
                setModalDisparoWA(false);
                const boletosParaEnviar = Array.from(selecionados)
                  .filter(k => boletosPorCliente.has(k))
                  .map(k => ({
                    cpf: k,
                    base64: boletosPorCliente.get(k)!.base64,
                    nomeArquivo: boletosPorCliente.get(k)!.nomeArquivo,
                  }));
                dispararWhatsapp.mutate({ cpfs: Array.from(selecionados), boletos: boletosParaEnviar });
                toast.info(`Disparando WhatsApp para ${selecionados.size} inadimplente${selecionados.size > 1 ? "s" : ""}...`);
              }}
              disabled={dispararWhatsapp.isPending}
            >
              <MessageSquare className="w-4 h-4" />
              {dispararWhatsapp.isPending ? "Enviando..." : "Confirmar Disparo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: Resultado Disparo WhatsApp ────────────────────────────────────────────── */}
      <Dialog open={!!resultadoDisparoWA} onOpenChange={(open) => { if (!open) setResultadoDisparoWA(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Resultado do Disparo WhatsApp
            </DialogTitle>
          </DialogHeader>
          {resultadoDisparoWA && (
            <div className="space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{resultadoDisparoWA.enviados}</p>
                  <p className="text-xs text-green-600 mt-1">Enviados</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{resultadoDisparoWA.erros}</p>
                  <p className="text-xs text-red-600 mt-1">Erros</p>
                </div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {resultadoDisparoWA.resultados?.map((r: any, i: number) => (
                  <div key={i} className={`flex items-center justify-between text-xs px-3 py-2 rounded border ${
                    r.status === "ENVIADO" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                  }`}>
                    <span className="font-medium truncate max-w-[200px]">{r.nome}</span>
                    <span className={`font-semibold ${
                      r.status === "ENVIADO" ? "text-green-700" : "text-red-700"
                    }`}>
                      {r.status === "ENVIADO" ? "✓ Enviado" : `Erro: ${r.erro}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setResultadoDisparoWA(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
    </AppLayout>
  );
}

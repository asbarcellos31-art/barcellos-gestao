import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  MessageSquare, Plus, Send, Trash2, Clock, Users, CheckCircle2,
  XCircle, Loader2, Wifi, WifiOff, Upload, Eye, Calendar, Cake, AlertCircle, ToggleLeft, ToggleRight, Save,
  BookOpen, Search
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// ── Helpers ──────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    RASCUNHO: { label: "Rascunho", className: "bg-gray-100 text-gray-700" },
    AGENDADA: { label: "Agendada", className: "bg-blue-100 text-blue-700" },
    ENVIANDO: { label: "Enviando…", className: "bg-yellow-100 text-yellow-700" },
    CONCLUIDA: { label: "Concluída", className: "bg-green-100 text-green-700" },
    CANCELADA: { label: "Cancelada", className: "bg-red-100 text-red-700" },
  };
  const s = map[status] || { label: status, className: "bg-gray-100 text-gray-600" };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.className}`}>{s.label}</span>;
}

function formatDataBrasilia(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function WhatsappMarketing() {
  const utils = trpc.useUtils();

  // Automações
  const { data: automacoes, refetch: refetchAutomacoes } = trpc.whatsapp.getAutomacoes.useQuery();
  const salvarAutomacaoMut = trpc.whatsapp.salvarAutomacao.useMutation({
    onSuccess: () => { toast.success("Automação salva!"); refetchAutomacoes(); },
    onError: (e) => toast.error(e.message),
  });
  // QR Code
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<"whatsapp-1" | "whatsapp-2" | "whatsapp-3">("whatsapp-1");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const gerarQRMut = trpc.whatsapp.gerarQrCode.useMutation({
    onSuccess: (data: any) => { setQrCode(data.qr); toast.success("QR Code gerado! Escaneie com o WhatsApp"); },
    onError: (e: any) => toast.error(e.message),
  });

  const [anivForm, setAnivForm] = useState({ ativo: false, mensagem: "", horario: "08:00", videoUrl: "" });
  const [inadForm, setInadForm] = useState({ ativo: false, mensagem: "" });
  const [reenvioAnivPending, setReenvioAnivPending] = useState(false);
  const [reenvioInstancia, setReenvioInstancia] = useState<string>("whatsapp-2");
  const [reenvioRowPending, setReenvioRowPending] = useState<string | null>(null); // telefone em progresso
  const [reenvioRowInstancia, setReenvioRowInstancia] = useState<string>("whatsapp-2");
  const [uploadingVideo, setUploadingVideo] = useState(false);
  // Sincronizar com dados do servidor
  const [automacoesSincronizadas, setAutomacoesSincronizadas] = useState(false);
  if (automacoes && !automacoesSincronizadas) {
    setAnivForm({ ativo: automacoes.aniversario.ativo, mensagem: automacoes.aniversario.mensagem, horario: (automacoes.aniversario as any).horario || "08:00", videoUrl: (automacoes.aniversario as any).videoUrl || "" });
    setInadForm({ ativo: automacoes.inadimplentes.ativo, mensagem: automacoes.inadimplentes.mensagem });
    setAutomacoesSincronizadas(true);
  }

  // Status conexão
  const { data: statusConn, refetch: refetchStatus } = trpc.whatsapp.statusConexao.useQuery(undefined, { refetchInterval: 30000 });

  // Listas
  const { data: listas = [] } = trpc.whatsapp.listarListas.useQuery();
  const criarListaMut = trpc.whatsapp.criarLista.useMutation({ onSuccess: () => utils.whatsapp.listarListas.invalidate() });
  const excluirListaMut = trpc.whatsapp.excluirLista.useMutation({ onSuccess: () => utils.whatsapp.listarListas.invalidate() });
  const importarDaBaseMut = trpc.whatsapp.importarContatosDaBase.useMutation({
    onSuccess: (d) => { toast.success(`${d.importados} contatos importados da Base de Clientes`); utils.whatsapp.listarListas.invalidate(); utils.whatsapp.listarContatos.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const importarComFiltrosMut = trpc.whatsapp.importarDaBaseComFiltros.useMutation({
    onSuccess: (d) => { toast.success(`${d.importados} contatos importados (${d.ignorados} ignorados/duplicados)`); utils.whatsapp.listarListas.invalidate(); utils.whatsapp.listarContatos.invalidate(); setDialogImportar(false); },
    onError: (e) => toast.error(e.message),
  });

  // Campanhas
  const { data: campanhas = [], refetch: refetchCampanhas } = trpc.whatsapp.listarCampanhas.useQuery();
  const criarCampanhaMut = trpc.whatsapp.criarCampanha.useMutation({
    onSuccess: () => { utils.whatsapp.listarCampanhas.invalidate(); toast.success("Campanha criada!"); },
    onError: (e) => toast.error(e.message),
  });
  const excluirCampanhaMut = trpc.whatsapp.excluirCampanha.useMutation({
    onSuccess: () => { utils.whatsapp.listarCampanhas.invalidate(); toast.success("Campanha excluída"); },
  });
  const dispararMut = trpc.whatsapp.dispararCampanha.useMutation({
    onSuccess: (d) => { utils.whatsapp.listarCampanhas.invalidate(); toast.success(`Disparo iniciado para ${d.total} contatos`); },
    onError: (e) => toast.error(e.message),
  });
  const pausarMut = trpc.whatsapp.pausarCampanha.useMutation({
    onSuccess: () => { utils.whatsapp.listarCampanhas.invalidate(); toast.success("Campanha pausada"); },
    onError: (e) => toast.error(e.message),
  });
  const retomarMut = trpc.whatsapp.retomarCampanha.useMutation({
    onSuccess: () => { utils.whatsapp.listarCampanhas.invalidate(); toast.success("Campanha retomada"); },
    onError: (e) => toast.error(e.message),
  });
  const agendarMut = trpc.whatsapp.atualizarCampanha.useMutation({
    onSuccess: () => { utils.whatsapp.listarCampanhas.invalidate(); toast.success("Agendamento salvo!"); setAgendarId(null); },
    onError: (e) => toast.error(e.message),
  });

  // Envio individual
  const enviarIndividualMut = trpc.whatsapp.enviarIndividual.useMutation({
    onSuccess: () => { toast.success("Mensagem enviada!"); setIndividual({ nome: "", telefone: "", mensagem: "" }); setDialogIndividual(false); },
    onError: (e) => toast.error(e.message),
  });

  // Histórico de envios
  const [histFiltros, setHistFiltros] = useState({ tipo: "TODOS", status: "TODOS", dataInicio: "", dataFim: "", busca: "" });
  const [histTab, setHistTab] = useState(false);
  const { data: historico = [], isLoading: loadingHistorico, refetch: refetchHistorico } = trpc.whatsapp.historicoEnvios.useQuery(
    { tipo: histFiltros.tipo !== "TODOS" ? histFiltros.tipo : undefined, status: histFiltros.status !== "TODOS" ? histFiltros.status : undefined, dataInicio: histFiltros.dataInicio || undefined, dataFim: histFiltros.dataFim || undefined, busca: histFiltros.busca || undefined, limit: 300 },
    { enabled: true, staleTime: 30000 }
  );

  // Estados
  const [tab, setTab] = useState("campanhas");
  const [dialogNovaCampanha, setDialogNovaCampanha] = useState(false);
  const [dialogNovaLista, setDialogNovaLista] = useState(false);
  const [dialogIndividual, setDialogIndividual] = useState(false);
  const [agendarId, setAgendarId] = useState<number | null>(null);
  const [agendarData, setAgendarData] = useState("");
  const [listaAtivaId, setListaAtivaId] = useState<number | null>(null);

  const [novaCampanha, setNovaCampanha] = useState({
    nome: "", mensagem: "", listaId: "", dataAgendadaLocal: "", intervaloMs: "3000", limiteDiario: "0",
    mediaUrl: "", mediaType: "" as "" | "image" | "video" | "document",
    instanciaId: "whatsapp-1" as "whatsapp-1" | "whatsapp-2" | "whatsapp-3",
  });
  const [uploadingMidiaCampanha, setUploadingMidiaCampanha] = useState(false);
  const [novaLista, setNovaLista] = useState({ nome: "", descricao: "" });
  const [individual, setIndividual] = useState({ nome: "", telefone: "", mensagem: "" });
  const [dialogImportar, setDialogImportar] = useState(false);
  const [dialogAdicionarContato, setDialogAdicionarContato] = useState(false);
  const [novoContato, setNovoContato] = useState({ nome: "", telefone: "", cpf: "" });
  const [buscaCliente, setBuscaCliente] = useState("");
  const { data: resultadosBusca = [] } = trpc.whatsapp.buscarClientesPorNome.useQuery(
    { busca: buscaCliente },
    { enabled: buscaCliente.length >= 2 }
  );
  const adicionarContatoMut = trpc.whatsapp.adicionarContato.useMutation({
    onSuccess: () => { toast.success("Contato adicionado!"); utils.whatsapp.listarContatos.invalidate(); utils.whatsapp.listarListas.invalidate(); setDialogAdicionarContato(false); setNovoContato({ nome: "", telefone: "", cpf: "" }); setBuscaCliente(""); },
    onError: (e) => toast.error(e.message),
  });
  const [filtroImportar, setFiltroImportar] = useState({
    status: "ativo" as "ativo" | "inativo" | "todos",
    produtoCodigo: "",
    cidade: "",
    vendedor: "",
    idadeMin: "",
    idadeMax: "",
    contribuicaoMin: "",
    contribuicaoMax: "",
    sexo: "" as "" | "M" | "F" | "OUTRO",
  });
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [nomeTemplate, setNomeTemplate] = useState("");
  const [salvandoTemplate, setSalvandoTemplate] = useState(false);
  const [showSalvarTemplate, setShowSalvarTemplate] = useState(false);
  const [dialogImportarExcel, setDialogImportarExcel] = useState(false);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const importarExcelMut = trpc.whatsapp.importarContatosExcel.useMutation({
    onSuccess: (d) => { toast.success(`${d.importados} contatos importados (${d.erros} erros)`); utils.whatsapp.listarListas.invalidate(); utils.whatsapp.listarContatos.invalidate(); setDialogImportarExcel(false); },
    onError: (e) => toast.error(e.message),
  });

  // Metadados da base para popular os selects
  const { data: baseMetadados } = trpc.whatsapp.baseMetadados.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  // Templates de segmentos
  const { data: segmentoTemplates = [], refetch: refetchTemplates } = trpc.whatsapp.listarSegmentoTemplates.useQuery();
  const salvarTemplateMut = trpc.whatsapp.salvarSegmentoTemplate.useMutation({
    onSuccess: () => { refetchTemplates(); setNomeTemplate(""); setShowSalvarTemplate(false); toast.success("Template salvo!"); },
    onError: (e) => toast.error(e.message),
  });
  const excluirTemplateMut = trpc.whatsapp.excluirSegmentoTemplate.useMutation({
    onSuccess: () => { refetchTemplates(); toast.success("Template excluído!"); },
    onError: (e) => toast.error(e.message),
  });

  // Preview count query (manual trigger via enabled flag)
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const previewInput = {
    status: filtroImportar.status,
    ...(filtroImportar.produtoCodigo ? { produtoCodigo: filtroImportar.produtoCodigo } : {}),
    ...(filtroImportar.cidade ? { cidade: filtroImportar.cidade } : {}),
    ...(filtroImportar.vendedor ? { vendedor: filtroImportar.vendedor } : {}),
    ...(filtroImportar.idadeMin ? { idadeMin: Number(filtroImportar.idadeMin) } : {}),
    ...(filtroImportar.idadeMax ? { idadeMax: Number(filtroImportar.idadeMax) } : {}),
    ...(filtroImportar.contribuicaoMin ? { contribuicaoMin: Number(filtroImportar.contribuicaoMin) } : {}),
    ...(filtroImportar.contribuicaoMax ? { contribuicaoMax: Number(filtroImportar.contribuicaoMax) } : {}),
    ...(filtroImportar.sexo ? { sexo: filtroImportar.sexo as "M" | "F" | "OUTRO" } : {}),
  };
  const { data: previewData, refetch: refetchPreview, isFetching: fetchingPreview } = trpc.whatsapp.previewCount.useQuery(
    previewInput,
    { enabled: false }
  );

  async function handlePreviewCount() {
    setLoadingPreview(true);
    try {
      const result = await refetchPreview();
      setPreviewCount(result.data?.total ?? null);
    } finally {
      setLoadingPreview(false);
    }
  }

  function handleCarregarTemplate(t: {filtros: any}) {
    const f = t.filtros;
    setFiltroImportar({
      status: (f.status || "ativo") as "ativo" | "inativo" | "todos",
      produtoCodigo: f.produtoCodigo || "",
      cidade: f.cidade || "",
      vendedor: f.vendedor || "",
      idadeMin: f.idadeMin || "",
      idadeMax: f.idadeMax || "",
      contribuicaoMin: f.contribuicaoMin || "",
      contribuicaoMax: f.contribuicaoMax || "",
      sexo: (f.sexo || "") as "" | "M" | "F" | "OUTRO",
    });
    setPreviewCount(null);
  }

  const listaAtiva = listas.find(l => l.id === listaAtivaId);
  const { data: contatos = [] } = trpc.whatsapp.listarContatos.useQuery(
    { listaId: listaAtivaId! },
    { enabled: !!listaAtivaId }
  );
  const excluirContatoMut = trpc.whatsapp.excluirContato.useMutation({
    onSuccess: () => utils.whatsapp.listarContatos.invalidate(),
  });

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">WhatsApp Marketing</h1>
            <p className="text-sm text-muted-foreground">Campanhas, automações e disparos via Evolution API</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Status Evolution API - duas instâncias */}
          {statusConn?.instancias ? (
            Object.entries(statusConn.instancias as Record<string, any>).map(([key, inst]) => (
              <div key={key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${inst.conectado ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                {inst.conectado ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                <span>{inst.numero} {inst.conectado ? "✓" : "✗"}</span>
              </div>
            ))
          ) : (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${statusConn?.conectado ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
              {statusConn?.conectado ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {statusConn?.conectado ? "Conectado" : "Desconectado"}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => setDialogIndividual(true)}>
            <Send className="w-4 h-4 mr-1" /> Envio Individual
          </Button>
          <Button size="sm" onClick={() => setDialogNovaCampanha(true)} className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-1" /> Nova Campanha
          </Button>
        </div>
      </div>

      {/* Aviso se nenhuma instância conectada */}
      {statusConn && !statusConn.conectado && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <div className="flex items-center justify-between gap-4">
            <div>
              <strong>WhatsApp desconectado.</strong> Nenhuma instância está conectada. Acesse o sistema para gerar um novo QR Code e reconectar.
            </div>
            <Button className="ml-4 bg-amber-600 hover:bg-amber-700 text-white whitespace-nowrap" onClick={() => setShowQRDialog(true)}>
              Gerar QR Code
            </Button>
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => { setTab(v); if (v === 'historico') setHistTab(true); }}>
        <TabsList>
          <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
          <TabsTrigger value="listas">Listas de Contatos</TabsTrigger>
          <TabsTrigger value="automacoes">Automações</TabsTrigger>
          <TabsTrigger value="historico">Histórico de Envios</TabsTrigger>
        </TabsList>

        {/* ── Aba Campanhas ── */}
        <TabsContent value="campanhas" className="space-y-4 mt-4">
          {campanhas.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Nenhuma campanha criada ainda.</p>
              <Button className="mt-4 bg-green-600 hover:bg-green-700" onClick={() => setDialogNovaCampanha(true)}>
                <Plus className="w-4 h-4 mr-1" /> Criar primeira campanha
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {campanhas.map((c) => (
                <Card key={c.id} className="border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{c.nome}</span>
                          <StatusBadge status={c.status} />
                          {c.dataAgendada && (
                            <span className="text-xs text-blue-600 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {formatDataBrasilia(c.dataAgendada)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{c.mensagem}</p>
                        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {c.totalDestinatarios} destinatários</span>
                          <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3 h-3" /> {c.totalEnviados} enviados</span>
                          {c.totalErros > 0 && <span className="flex items-center gap-1 text-red-500"><XCircle className="w-3 h-3" /> {c.totalErros} erros</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {(c.status === "RASCUNHO" || c.status === "AGENDADA") && (
                          <>
                            <Button
                              size="sm" variant="outline"
                              className="text-blue-600 border-blue-200 hover:bg-blue-50"
                              onClick={() => { setAgendarId(c.id); setAgendarData(""); }}
                              title="Agendar"
                            >
                              <Calendar className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => dispararMut.mutate({ id: c.id })}
                              disabled={dispararMut.isPending}
                              title="Disparar agora"
                            >
                              {dispararMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </Button>
                          </>
                        )}
                        {!c.pausada && (
                          <Button
                            size="sm"
                            className="bg-orange-600 hover:bg-orange-700 text-white"
                            onClick={() => pausarMut.mutate({ id: c.id })}
                            disabled={pausarMut.isPending}
                            title="Pausar campanha"
                          >
                            {pausarMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Pausar"}
                          </Button>
                        )}
                        {c.pausada && (
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => retomarMut.mutate({ id: c.id })}
                            disabled={retomarMut.isPending}
                            title="Retomar campanha"
                          >
                            {retomarMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Retomar"}
                          </Button>
                        )}
                        <Button
                          size="sm" variant="ghost"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => { if (confirm("Excluir campanha?")) excluirCampanhaMut.mutate({ id: c.id }); }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Aba Listas ── */}
        <TabsContent value="listas" className="mt-4 space-y-4">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Listas de Contatos</h3>
            <Button size="sm" onClick={() => setDialogNovaLista(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Nova Lista
            </Button>
          </div>

          {listas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm border rounded-xl">
              Nenhuma lista criada. Clique em &quot;Nova Lista&quot; para começar.
            </div>
          ) : (
            <div className="space-y-3">
              {listas.map(l => (
                <div key={l.id} className="border rounded-xl overflow-hidden">
                  {/* Cabeçalho da lista */}
                  <div
                    className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${listaAtivaId === l.id ? "bg-green-50 border-b border-green-200" : "hover:bg-muted/40"}`}
                    onClick={() => setListaAtivaId(listaAtivaId === l.id ? null : l.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                        <Users className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{l.nome}</p>
                        <p className="text-xs text-muted-foreground">{l.totalContatos} contato{l.totalContatos !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{listaAtivaId === l.id ? '▲ Fechar' : '▼ Abrir'}</span>
                      <Button
                        size="sm" variant="ghost"
                        className="text-red-400 hover:text-red-600 h-7 w-7 p-0"
                        onClick={(e) => { e.stopPropagation(); if (confirm("Excluir lista e todos os contatos?")) excluirListaMut.mutate({ id: l.id }); }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Painel expandido */}
                  {listaAtivaId === l.id && (
                    <div className="p-4 space-y-4 bg-white">
                      {/* Botões de ação */}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 gap-2"
                          onClick={() => setDialogImportar(true)}
                        >
                          <Upload className="w-4 h-4" />
                          Importar da Base de Clientes
                        </Button>
                        <Button
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 gap-2"
                          onClick={() => setDialogImportarExcel(true)}
                        >
                          <Upload className="w-4 h-4" />
                          Importar Lista Fria (Excel)
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() => setDialogAdicionarContato(true)}
                        >
                          <Plus className="w-4 h-4" />
                          Adicionar Contato Individual
                        </Button>
                      </div>

                      {/* Lista de contatos */}
                      {contatos.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg border-dashed">
                          <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                          <p>Nenhum contato nesta lista ainda.</p>
                          <p className="text-xs mt-1">Use os botões acima para adicionar contatos.</p>
                        </div>
                      ) : (
                        <div className="space-y-1 max-h-80 overflow-y-auto">
                          <p className="text-xs text-muted-foreground mb-2">{contatos.length} contato{contatos.length !== 1 ? 's' : ''} nesta lista</p>
                          {contatos.map(c => (
                            <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 text-sm">
                              <div>
                                <span className="font-medium">{c.nome}</span>
                                <span className="text-muted-foreground text-xs ml-2">{c.telefone}</span>
                              </div>
                              <Button size="sm" variant="ghost" className="text-red-400 h-6 w-6 p-0" onClick={() => excluirContatoMut.mutate({ id: c.id })}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
                {/* ── Aba Automações ── */}
        <TabsContent value="automacoes" className="mt-4 space-y-6">
          <p className="text-sm text-muted-foreground">Configure as mensagens automáticas de WhatsApp. Use <code className="bg-muted px-1 rounded">{'{{nome}}'}</code> para personalizar com o nome do cliente.</p>

          {/* Card Aniversário */}
          <div className="border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cake className="w-5 h-5 text-pink-500" />
                <div>
                  <h3 className="font-semibold">Mensagem de Aniversário (WhatsApp)</h3>
                  <p className="text-xs text-muted-foreground">Disparada automaticamente no horário configurado para aniversariantes do dia</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{anivForm.ativo ? "Ativo" : "Inativo"}</span>
                <Switch
                  checked={anivForm.ativo}
                  onCheckedChange={v => setAnivForm(f => ({ ...f, ativo: v }))}
                />
              </div>
            </div>

            {/* Horário de disparo */}
            <div className="space-y-1">
              <Label className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Horário de disparo</Label>
              <Input
                type="time"
                value={anivForm.horario}
                onChange={e => setAnivForm(f => ({ ...f, horario: e.target.value }))}
                className="w-36 text-sm"
              />
            </div>

            {/* Mensagem */}
            <div className="space-y-1">
              <Label>Mensagem de texto</Label>
              <p className="text-xs text-muted-foreground">Use <code className="bg-muted px-1 rounded">@nome</code> ou <code className="bg-muted px-1 rounded">{'{{'+'nome'+'}}'}</code> para personalizar</p>
              <Textarea
                value={anivForm.mensagem}
                onChange={e => setAnivForm(f => ({ ...f, mensagem: e.target.value }))}
                rows={8}
                className="text-sm font-mono"
              />
            </div>

            {/* Upload de vídeo/imagem */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Upload className="w-3.5 h-3.5" /> Vídeo ou imagem anexada (opcional)</Label>
              <p className="text-xs text-muted-foreground">O arquivo será enviado junto com a mensagem de texto. Formatos: MP4, JPG, PNG. Máx. 50MB.</p>
              {anivForm.videoUrl && (
                <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span className="text-xs text-green-700 truncate flex-1">{anivForm.videoUrl.split('/').pop()}</span>
                  <Button size="sm" variant="ghost" className="text-red-500 h-6 px-2 text-xs" onClick={() => setAnivForm(f => ({ ...f, videoUrl: '' }))}>
                    Remover
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="video/mp4,video/*,image/jpeg,image/png,image/gif"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingVideo(true);
                      try {
                        const fd = new FormData();
                        fd.append('file', file);
                        const res = await fetch('/api/upload/upload-midia-aniversario', { method: 'POST', body: fd });
                        const data = await res.json();
                        if (data.url) {
                          setAnivForm(f => ({ ...f, videoUrl: data.url }));
                          toast.success('Arquivo enviado com sucesso!');
                        } else {
                          toast.error(data.error || 'Erro ao enviar arquivo');
                        }
                      } catch {
                        toast.error('Erro ao enviar arquivo');
                      } finally {
                        setUploadingVideo(false);
                        e.target.value = '';
                      }
                    }}
                  />
                  <Button size="sm" variant="outline" className="gap-2 pointer-events-none" disabled={uploadingVideo}>
                    {uploadingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploadingVideo ? 'Enviando...' : 'Selecionar arquivo'}
                  </Button>
                </label>
              </div>
            </div>

            <div className="flex justify-between items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={reenvioInstancia}
                  onChange={e => setReenvioInstancia(e.target.value)}
                  disabled={reenvioAnivPending}
                  className="text-xs border rounded px-2 py-1.5 bg-background"
                >
                  <option value="whatsapp-1">(48) 3372-6890</option>
                  <option value="whatsapp-2">(48) 99210-8365 — padrão</option>
                  <option value="whatsapp-3">(48) 99225-9899</option>
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 text-orange-600 border-orange-300 hover:bg-orange-50"
                  disabled={reenvioAnivPending}
                  onClick={async () => {
                    setReenvioAnivPending(true);
                    try {
                      const r = await fetch('/api/email-automacoes/reenviar-falhas-aniversario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dias: 7, instancia: reenvioInstancia }) });
                      const d = await r.json();
                      if (r.ok) toast.success(d.mensagem || 'Reenvio iniciado!');
                      else toast.error(d.error || 'Erro ao reenviar');
                    } catch { toast.error('Erro ao reenviar falhas'); }
                    finally { setReenvioAnivPending(false); }
                  }}
                >
                  {reenvioAnivPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Reenviar falhas (7 dias)
                </Button>
              </div>
              <Button
                size="sm"
                className="bg-pink-600 hover:bg-pink-700 gap-2"
                disabled={salvarAutomacaoMut.isPending}
                onClick={() => salvarAutomacaoMut.mutate({ tipo: "aniversario", ativo: anivForm.ativo, mensagem: anivForm.mensagem, horario: anivForm.horario, videoUrl: anivForm.videoUrl })}
              >
                {salvarAutomacaoMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar configuração
              </Button>
            </div>
          </div>

          {/* Card Inadimplentes */}
          <div className="border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-500" />
                <div>
                  <h3 className="font-semibold">Mensagem de Cobrança (Inadimplentes)</h3>
                  <p className="text-xs text-muted-foreground">Disparada automaticamente todo dia às 9h para clientes com parcelas em atraso</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{inadForm.ativo ? "Ativo" : "Inativo"}</span>
                <Switch
                  checked={inadForm.ativo}
                  onCheckedChange={v => setInadForm(f => ({ ...f, ativo: v }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Mensagem</Label>
              <Textarea
                value={inadForm.mensagem}
                onChange={e => setInadForm(f => ({ ...f, mensagem: e.target.value }))}
                rows={6}
                className="text-sm"
              />
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                className="bg-orange-600 hover:bg-orange-700 gap-2"
                disabled={salvarAutomacaoMut.isPending}
                onClick={() => salvarAutomacaoMut.mutate({ tipo: "inadimplentes", ativo: inadForm.ativo, mensagem: inadForm.mensagem })}
              >
                {salvarAutomacaoMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ── Aba Histórico de Envios ── */}
        <TabsContent value="historico" className="mt-4 space-y-4">
          {/* Filtros */}
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Tipo</label>
                  <Select value={histFiltros.tipo} onValueChange={v => setHistFiltros(p => ({ ...p, tipo: v }))}>
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TODOS">Todos</SelectItem>
                      <SelectItem value="BOAS_VINDAS">Boas-Vindas</SelectItem>
                      <SelectItem value="ANIVERSARIO">Aniversário</SelectItem>
                      <SelectItem value="INADIMPLENTE">Inadimplente</SelectItem>
                      <SelectItem value="CAMPANHA">Campanha</SelectItem>
                      <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <Select value={histFiltros.status} onValueChange={v => setHistFiltros(p => ({ ...p, status: v }))}>
                    <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TODOS">Todos</SelectItem>
                      <SelectItem value="ENVIADO">Enviado</SelectItem>
                      <SelectItem value="ERRO">Erro</SelectItem>
                      <SelectItem value="PENDENTE">Pendente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Data início</label>
                  <Input type="date" className="mt-1 h-8 text-sm" value={histFiltros.dataInicio} onChange={e => setHistFiltros(p => ({ ...p, dataInicio: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Data fim</label>
                  <Input type="date" className="mt-1 h-8 text-sm" value={histFiltros.dataFim} onChange={e => setHistFiltros(p => ({ ...p, dataFim: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Buscar nome/telefone</label>
                  <div className="flex gap-1 mt-1">
                    <Input className="h-8 text-sm" placeholder="Nome ou telefone…" value={histFiltros.busca} onChange={e => setHistFiltros(p => ({ ...p, busca: e.target.value }))} />
                    <Button size="sm" className="h-8 px-2" onClick={() => refetchHistorico()}><Search className="w-3 h-3" /></Button>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">{historico.length} registro(s)</span>
                <div className="flex items-center gap-2">
                  <select
                    value={reenvioRowInstancia}
                    onChange={e => setReenvioRowInstancia(e.target.value)}
                    className="text-xs border rounded px-2 py-1.5 bg-background"
                  >
                    <option value="whatsapp-1">(48) 3372-6890</option>
                    <option value="whatsapp-2">(48) 99210-8365 — padrão</option>
                    <option value="whatsapp-3">(48) 99225-9899</option>
                  </select>
                  <Button size="sm" variant="outline" onClick={() => refetchHistorico()} disabled={loadingHistorico}>
                    {loadingHistorico ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    Atualizar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabela */}
          {loadingHistorico ? (
            <div className="text-center py-12 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : historico.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p>Nenhum envio encontrado com os filtros selecionados.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Data/Hora</th>
                    <th className="text-left px-3 py-2 font-medium">Nome</th>
                    <th className="text-left px-3 py-2 font-medium">Telefone</th>
                    <th className="text-left px-3 py-2 font-medium">Tipo</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-left px-3 py-2 font-medium">Obs</th>
                    <th className="text-left px-3 py-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(historico as any[]).map((e, i) => (
                    <tr key={e.id || i} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{formatDataBrasilia(e.createdAt)}</td>
                      <td className="px-3 py-2 font-medium">{e.nome || "—"}</td>
                      <td className="px-3 py-2 text-xs">{e.telefone}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          e.tipo === 'BOAS_VINDAS' ? 'bg-blue-100 text-blue-700' :
                          e.tipo === 'ANIVERSARIO' ? 'bg-pink-100 text-pink-700' :
                          e.tipo === 'INADIMPLENTE' ? 'bg-orange-100 text-orange-700' :
                          e.tipo === 'CAMPANHA' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>{e.tipo}</span>
                      </td>
                      <td className="px-3 py-2">
                        {e.status === 'ENVIADO' ? (
                          <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 className="w-3 h-3" /> Enviado</span>
                        ) : e.status === 'ERRO' ? (
                          <span className="flex items-center gap-1 text-red-600 text-xs"><XCircle className="w-3 h-3" /> Erro</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{e.status}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate">{e.erro || ""}</td>
                      <td className="px-3 py-2">
                        {e.tipo === 'ANIVERSARIO' && e.status === 'ERRO' && e.telefone && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs gap-1 text-pink-600 border-pink-300 hover:bg-pink-50"
                            disabled={reenvioRowPending === e.telefone}
                            onClick={async () => {
                              setReenvioRowPending(e.telefone);
                              try {
                                const r = await fetch('/api/email-automacoes/reenviar-aniversario-telefone', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ telefone: e.telefone, instancia: reenvioRowInstancia }),
                                });
                                const d = await r.json();
                                if (r.ok) toast.success(`Reenvio iniciado para ${e.nome || e.telefone}`);
                                else toast.error(d.error || 'Erro ao reenviar');
                              } catch { toast.error('Erro ao reenviar'); }
                              finally { setReenvioRowPending(null); }
                            }}
                          >
                            {reenvioRowPending === e.telefone ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            Reenviar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
      {/* ── Dialog Nova Campanha ── */}
      <Dialog open={dialogNovaCampanha} onOpenChange={setDialogNovaCampanha}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle>Nova Campanha WhatsApp</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            <div>
              <label className="text-sm font-medium">Nome da campanha</label>
              <Input className="mt-1" placeholder="Ex: Campanha Médicos — Março" value={novaCampanha.nome} onChange={e => setNovaCampanha(p => ({ ...p, nome: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Lista de contatos</label>
              <Select value={novaCampanha.listaId} onValueChange={v => setNovaCampanha(p => ({ ...p, listaId: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar lista…" /></SelectTrigger>
                <SelectContent>
                  {listas.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.nome} ({l.totalContatos} contatos)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Mensagem</label>
              <p className="text-xs text-muted-foreground mb-1">Use {`{{nome}}`} para personalizar com o nome do contato</p>
              <Textarea
                className="mt-1 min-h-[120px]"
                placeholder={`Olá, {{nome}}! 👋\n\nA Barcellos Seguros tem uma oferta especial para você...`}
                value={novaCampanha.mensagem}
                onChange={e => setNovaCampanha(p => ({ ...p, mensagem: e.target.value }))}
              />
            </div>
            {/* Anexo de mídia */}
            <div>
              <label className="text-sm font-medium flex items-center gap-1"><Upload className="w-3.5 h-3.5" /> Arquivo anexo (opcional)</label>
              <p className="text-xs text-muted-foreground mb-2">Imagem (JPG/PNG), Vídeo (MP4) ou PDF. Máx. 50MB. Será enviado junto com a mensagem.</p>
              {novaCampanha.mediaUrl ? (
                <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg mb-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span className="text-xs text-green-700 truncate flex-1">{novaCampanha.mediaUrl.split('/').pop()}</span>
                  <Button size="sm" variant="ghost" className="text-red-500 h-6 px-2 text-xs" onClick={() => setNovaCampanha(p => ({ ...p, mediaUrl: "", mediaType: "" }))}>
                    Remover
                  </Button>
                </div>
              ) : null}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,video/mp4,video/*,application/pdf"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingMidiaCampanha(true);
                    try {
                      const fd = new FormData();
                      fd.append('file', file);
                      const res = await fetch('/api/upload/upload-midia-campanha', { method: 'POST', body: fd });
                      const data = await res.json();
                      if (data.url) {
                        setNovaCampanha(p => ({ ...p, mediaUrl: data.url, mediaType: data.mediaType || 'document' }));
                        toast.success('Arquivo enviado!');
                      } else {
                        toast.error(data.error || 'Erro ao enviar arquivo');
                      }
                    } catch {
                      toast.error('Erro ao enviar arquivo');
                    } finally {
                      setUploadingMidiaCampanha(false);
                      e.target.value = '';
                    }
                  }}
                />
                <Button size="sm" variant="outline" className="gap-2 pointer-events-none" disabled={uploadingMidiaCampanha} asChild>
                  <span>
                    {uploadingMidiaCampanha ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploadingMidiaCampanha ? 'Enviando...' : 'Selecionar arquivo'}
                  </span>
                </Button>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Agendar para (opcional)</label>
                <Input type="datetime-local" className="mt-1" value={novaCampanha.dataAgendadaLocal} onChange={e => setNovaCampanha(p => ({ ...p, dataAgendadaLocal: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">Intervalo entre msgs (ms)</label>
                <Input type="number" className="mt-1" min={1000} step={500} value={novaCampanha.intervaloMs} onChange={e => setNovaCampanha(p => ({ ...p, intervaloMs: e.target.value }))} />
                <p className="text-xs text-muted-foreground mt-1">Mín. 3000ms recomendado (anti-ban)</p>
              </div>
              <div>
                <label className="text-sm font-medium">Limite diário de envios</label>
                <Input type="number" className="mt-1" min={0} step={50} placeholder="0 = sem limite" value={novaCampanha.limiteDiario} onChange={e => setNovaCampanha(p => ({ ...p, limiteDiario: e.target.value }))} />
                <p className="text-xs text-muted-foreground mt-1">0 = sem limite. Ex: 500 envia até 500/dia e pausa até o dia seguinte às 8h.</p>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Número de disparo</label>
              <select
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={novaCampanha.instanciaId}
                onChange={e => setNovaCampanha(p => ({ ...p, instanciaId: e.target.value as any }))}
              >
                <option value="whatsapp-1">(48) 3372-6890 — Campanhas gerais</option>
                <option value="whatsapp-2">(48) 99210-8365 — Aniversariantes</option>
                <option value="whatsapp-3">(48) 99225-9899 — Médicos (Anderson)</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogNovaCampanha(false)}>Cancelar</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={!novaCampanha.nome || !novaCampanha.mensagem || criarCampanhaMut.isPending}
              onClick={() => {
                criarCampanhaMut.mutate({
                  nome: novaCampanha.nome,
                  mensagem: novaCampanha.mensagem,
                  listaId: novaCampanha.listaId ? Number(novaCampanha.listaId) : undefined,
                  dataAgendadaLocal: novaCampanha.dataAgendadaLocal || undefined,
                  intervaloMs: Number(novaCampanha.intervaloMs) || 3000,
                  limiteDiario: Number(novaCampanha.limiteDiario) || 0,
                  mediaUrl: novaCampanha.mediaUrl || undefined,
                  mediaType: novaCampanha.mediaType || undefined,
                  instanciaId: novaCampanha.instanciaId,
                });
                setDialogNovaCampanha(false);
                setNovaCampanha({ nome: "", mensagem: "", listaId: "", dataAgendadaLocal: "", intervaloMs: "3000", limiteDiario: "0", mediaUrl: "", mediaType: "", instanciaId: "whatsapp-1" });
              }}
            >
              {criarCampanhaMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {novaCampanha.dataAgendadaLocal ? "Agendar" : "Criar Rascunho"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Nova Lista ── */}
      <Dialog open={dialogNovaLista} onOpenChange={setDialogNovaLista}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nova Lista de Contatos</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Input placeholder="Nome da lista" value={novaLista.nome} onChange={e => setNovaLista(p => ({ ...p, nome: e.target.value }))} />
            <Input placeholder="Descrição (opcional)" value={novaLista.descricao} onChange={e => setNovaLista(p => ({ ...p, descricao: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogNovaLista(false)}>Cancelar</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={!novaLista.nome || criarListaMut.isPending}
              onClick={() => {
                criarListaMut.mutate({ nome: novaLista.nome, descricao: novaLista.descricao });
                setDialogNovaLista(false);
                setNovaLista({ nome: "", descricao: "" });
              }}
            >
              Criar Lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Adicionar Contato à Lista ── */}
      <Dialog open={dialogAdicionarContato} onOpenChange={(v) => { setDialogAdicionarContato(v); if (!v) { setBuscaCliente(""); setNovoContato({ nome: "", telefone: "", cpf: "" }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Adicionar Contato à Lista</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* Busca na base */}
            <div className="space-y-1">
              <Label className="text-sm font-semibold">Buscar na Base de Clientes</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Digite o nome do cliente..."
                  value={buscaCliente}
                  onChange={e => setBuscaCliente(e.target.value)}
                  className="pl-8"
                />
              </div>
              {buscaCliente.length >= 2 && resultadosBusca.length > 0 && (
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto bg-white shadow-sm">
                  {resultadosBusca.map((c: any) => (
                    <button
                      key={c.id}
                      className="w-full text-left px-3 py-2 hover:bg-green-50 transition-colors"
                      onClick={() => {
                        setNovoContato({ nome: c.nome, telefone: c.telefone, cpf: c.cpf || "" });
                        setBuscaCliente("");
                      }}
                    >
                      <div className="font-medium text-sm">{c.nome}</div>
                      <div className="text-xs text-gray-500">{c.telefone}{c.vendedor ? ` • ${c.vendedor}` : ""}{c.cidade ? ` • ${c.cidade}` : ""}</div>
                    </button>
                  ))}
                </div>
              )}
              {buscaCliente.length >= 2 && resultadosBusca.length === 0 && (
                <p className="text-xs text-gray-400 px-1">Nenhum cliente encontrado com telefone cadastrado.</p>
              )}
            </div>
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs text-gray-500 font-medium">Ou preencha manualmente:</p>
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input placeholder="Nome completo" value={novoContato.nome} onChange={e => setNovoContato(p => ({ ...p, nome: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Telefone / WhatsApp</Label>
                <Input placeholder="Ex: 48 99999-9999" value={novoContato.telefone} onChange={e => setNovoContato(p => ({ ...p, telefone: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogAdicionarContato(false); setBuscaCliente(""); setNovoContato({ nome: "", telefone: "", cpf: "" }); }}>Cancelar</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={!novoContato.nome || !novoContato.telefone || adicionarContatoMut.isPending || !listaAtivaId}
              onClick={() => {
                if (!listaAtivaId) return;
                adicionarContatoMut.mutate({ listaId: listaAtivaId, nome: novoContato.nome, telefone: novoContato.telefone, cpf: novoContato.cpf || undefined });
              }}
            >
              {adicionarContatoMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Dialog Agendar Campanha ── */}
      <Dialog open={agendarId !== null} onOpenChange={() => setAgendarId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Agendar Campanha</DialogTitle></DialogHeader>
          <div className="py-2">
            <label className="text-sm font-medium">Data e hora do disparo</label>
            <Input type="datetime-local" className="mt-2" value={agendarData} onChange={e => setAgendarData(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgendarId(null)}>Cancelar</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              disabled={!agendarData || agendarMut.isPending}
              onClick={() => agendarId && agendarMut.mutate({ id: agendarId, dataAgendadaLocal: agendarData })}
            >
              {agendarMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Clock className="w-4 h-4 mr-1" />}
              Confirmar Agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Envio Individual ── */}
      <Dialog open={dialogIndividual} onOpenChange={setDialogIndividual}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Envio Individual WhatsApp</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Input placeholder="Nome do destinatário" value={individual.nome} onChange={e => setIndividual(p => ({ ...p, nome: e.target.value }))} />
            <Input placeholder="Telefone (ex: 48 99999-9999)" value={individual.telefone} onChange={e => setIndividual(p => ({ ...p, telefone: e.target.value }))} />
            <Textarea className="min-h-[100px]" placeholder="Mensagem…" value={individual.mensagem} onChange={e => setIndividual(p => ({ ...p, mensagem: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogIndividual(false)}>Cancelar</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={!individual.telefone || !individual.mensagem || enviarIndividualMut.isPending}
              onClick={() => enviarIndividualMut.mutate(individual)}
            >
              {enviarIndividualMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Importar da Base com Filtros Avançados ── */}
      <Dialog open={dialogImportar} onOpenChange={(open) => { setDialogImportar(open); if (!open) { setPreviewCount(null); setShowSalvarTemplate(false); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-green-600" />
              Importar da Base de Clientes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[75vh] overflow-y-auto pr-1">
            <p className="text-sm text-muted-foreground">
              Configure os filtros de segmentação para a lista <strong>{listaAtiva?.nome}</strong>. Todos os campos são opcionais.
            </p>

            {/* Templates salvos */}
            {(segmentoTemplates as any[]).length > 0 && (
              <div className="border rounded-lg p-3 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Segmentos salvos</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(segmentoTemplates as any[]).map((t: any) => (
                    <div key={t.id} className="flex items-center gap-1 bg-background border rounded-full px-3 py-1">
                      <button
                        className="text-xs text-foreground hover:text-primary"
                        onClick={() => handleCarregarTemplate(t)}
                        title="Carregar filtros deste template"
                      >{t.nome}</button>
                      <button
                        className="text-muted-foreground hover:text-destructive ml-1"
                        onClick={() => excluirTemplateMut.mutate({ id: t.id })}
                        title="Excluir template"
                      >×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Status do cliente</Label>
              <Select
                value={filtroImportar.status}
                onValueChange={(v) => { setFiltroImportar(f => ({ ...f, status: v as any })); setPreviewCount(null); }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Somente Ativos</SelectItem>
                  <SelectItem value="inativo">Somente Inativos</SelectItem>
                  <SelectItem value="todos">Todos (Ativos + Inativos)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Produto */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Produto</Label>
              <Select
                value={filtroImportar.produtoCodigo || "__todos"}
                onValueChange={(v) => { setFiltroImportar(f => ({ ...f, produtoCodigo: v === "__todos" ? "" : v })); setPreviewCount(null); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos os produtos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todos">Todos os produtos</SelectItem>
                  {(baseMetadados?.produtos || []).map((p: {codigo:string;descricao:string}) => (
                    <SelectItem key={p.codigo} value={p.codigo}>{p.descricao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Vendedor */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Vendedor responsável</Label>
              <Select
                value={filtroImportar.vendedor || "__todos"}
                onValueChange={(v) => { setFiltroImportar(f => ({ ...f, vendedor: v === "__todos" ? "" : v })); setPreviewCount(null); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos os vendedores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todos">Todos os vendedores</SelectItem>
                  {(baseMetadados?.vendedores || []).map((v: string) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cidade */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Cidade</Label>
              <Select
                value={filtroImportar.cidade || "__todas"}
                onValueChange={(v) => { setFiltroImportar(f => ({ ...f, cidade: v === "__todas" ? "" : v })); setPreviewCount(null); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas as cidades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todas">Todas as cidades</SelectItem>
                  {(baseMetadados?.cidades || []).map((c: string) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sexo */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Sexo / Gênero</Label>
              <Select
                value={filtroImportar.sexo || "__todos"}
                onValueChange={(v) => { setFiltroImportar(f => ({ ...f, sexo: (v === "__todos" ? "" : v) as any })); setPreviewCount(null); }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todos">Todos</SelectItem>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="F">Feminino</SelectItem>
                  <SelectItem value="OUTRO">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Faixa etária */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Faixa etária (anos)</Label>
              <div className="flex gap-2">
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
              <p className="text-xs text-muted-foreground">Requer data de nascimento cadastrada. Deixe em branco para não filtrar.</p>
            </div>

            {/* Contribuição */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Contribuição mensal (R$)</Label>
              <div className="flex gap-2">
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
              <p className="text-xs text-muted-foreground">Deixe em branco para não filtrar por valor.</p>
            </div>

            {/* Contador de pré-visualização */}
            <div className="flex items-center gap-3 pt-1">
              <Button variant="outline" size="sm" onClick={handlePreviewCount} disabled={loadingPreview || fetchingPreview}>
                {(loadingPreview || fetchingPreview) ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
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
                <Button size="sm" onClick={() => salvarTemplateMut.mutate({ nome: nomeTemplate.trim(), filtros: { status: filtroImportar.status, ...(filtroImportar.produtoCodigo ? {produtoCodigo: filtroImportar.produtoCodigo} : {}), ...(filtroImportar.cidade ? {cidade: filtroImportar.cidade} : {}), ...(filtroImportar.vendedor ? {vendedor: filtroImportar.vendedor} : {}), ...(filtroImportar.idadeMin ? {idadeMin: filtroImportar.idadeMin} : {}), ...(filtroImportar.idadeMax ? {idadeMax: filtroImportar.idadeMax} : {}), ...(filtroImportar.contribuicaoMin ? {contribuicaoMin: filtroImportar.contribuicaoMin} : {}), ...(filtroImportar.contribuicaoMax ? {contribuicaoMax: filtroImportar.contribuicaoMax} : {}), ...(filtroImportar.sexo ? {sexo: filtroImportar.sexo} : {}) } })} disabled={salvarTemplateMut.isPending || !nomeTemplate.trim()}>
                  {salvarTemplateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
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

            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
              ℹ️ Apenas clientes com telefone ou celular cadastrado serão importados. Contatos já existentes na lista serão ignorados.
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => { setDialogImportar(false); setPreviewCount(null); setShowSalvarTemplate(false); }}>Cancelar</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 gap-2"
              disabled={!listaAtivaId || importarComFiltrosMut.isPending}
              onClick={() => {
                if (!listaAtivaId) return;
                const input: any = { listaId: listaAtivaId, status: filtroImportar.status };
                if (filtroImportar.produtoCodigo) input.produtoCodigo = filtroImportar.produtoCodigo;
                if (filtroImportar.cidade) input.cidade = filtroImportar.cidade;
                if (filtroImportar.vendedor) input.vendedor = filtroImportar.vendedor;
                if (filtroImportar.idadeMin) input.idadeMin = Number(filtroImportar.idadeMin);
                if (filtroImportar.idadeMax) input.idadeMax = Number(filtroImportar.idadeMax);
                if (filtroImportar.contribuicaoMin) input.contribuicaoMin = Number(filtroImportar.contribuicaoMin);
                if (filtroImportar.contribuicaoMax) input.contribuicaoMax = Number(filtroImportar.contribuicaoMax);
                if (filtroImportar.sexo) input.sexo = filtroImportar.sexo;
                importarComFiltrosMut.mutate(input);
              }}
            >
              {importarComFiltrosMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importarComFiltrosMut.isPending ? "Importando..." : "Importar Contatos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Importar Lista Fria (Excel) ── */}
      <Dialog open={dialogImportarExcel} onOpenChange={setDialogImportarExcel}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              Importar Lista Fria (Excel)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Importe contatos de uma planilha Excel. O arquivo deve ter colunas <strong>nome</strong> e <strong>telefone</strong> (ou <strong>celular</strong>).
            </p>
            <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center">
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-3">Selecione um arquivo .xlsx ou .csv</p>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  disabled={uploadingExcel || importarExcelMut.isPending}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !listaAtivaId) return;
                    setUploadingExcel(true);
                    try {
                      const XLSX = await import('xlsx');
                      const buffer = await file.arrayBuffer();
                      const wb = XLSX.read(buffer, { type: 'array' });
                      const ws = wb.Sheets[wb.SheetNames[0]];
                      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
                      const contatos = rows
                        .map((row: any) => ({
                          nome: String(row['nome'] || row['Nome'] || row['NOME'] || row['name'] || '').trim(),
                          telefone: String(row['telefone'] || row['Telefone'] || row['TELEFONE'] || row['celular'] || row['Celular'] || row['CELULAR'] || row['phone'] || '').trim(),
                        }))
                        .filter(c => c.nome && c.telefone);
                      if (contatos.length === 0) {
                        toast.error('Nenhum contato válido encontrado. Verifique se o arquivo tem colunas "nome" e "telefone".');
                        return;
                      }
                      await importarExcelMut.mutateAsync({ listaId: listaAtivaId, contatos });
                    } catch (err: any) {
                      toast.error('Erro ao processar arquivo: ' + (err?.message || 'Erro desconhecido'));
                    } finally {
                      setUploadingExcel(false);
                      e.target.value = '';
                    }
                  }}
                />
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-2 pointer-events-none" disabled={uploadingExcel || importarExcelMut.isPending}>
                  {(uploadingExcel || importarExcelMut.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {(uploadingExcel || importarExcelMut.isPending) ? 'Processando...' : 'Selecionar arquivo Excel'}
                </Button>
              </label>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Formato esperado do arquivo:</p>
              <p>• Coluna <code className="bg-muted px-1 rounded">nome</code> — nome do contato</p>
              <p>• Coluna <code className="bg-muted px-1 rounded">telefone</code> ou <code className="bg-muted px-1 rounded">celular</code> — número com DDD (ex: 48999001234)</p>
              <p>• Duplicatas serão ignoradas automaticamente</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogImportarExcel(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para gerar QR Code */}
      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar QR Code para Reconectar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Selecione a instância:</Label>
              <Select value={selectedInstance} onValueChange={(v: any) => setSelectedInstance(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp-1">(48) 3372-6890 - Inadimplência</SelectItem>
                  <SelectItem value="whatsapp-2">(48) 99210-8365 - Aniversariantes</SelectItem>
                  <SelectItem value="whatsapp-3">(48) 99225-9899 - Médicos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {qrCode && (
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">Escaneie este QR Code com o WhatsApp:</p>
                <img src={qrCode} alt="QR Code" className="w-64 h-64 mx-auto" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowQRDialog(false); setQrCode(null); }}>Fechar</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => gerarQRMut.mutate({ instancia: selectedInstance })} disabled={gerarQRMut.isPending || !!qrCode}>
              {gerarQRMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {qrCode ? "QR Code Gerado" : "Gerar QR Code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

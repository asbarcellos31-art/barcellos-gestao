import AppLayout from "@/components/AppLayout";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle, Clock, DollarSign, FileText,
  Plus, Search, Edit2, Trash2, Users, Phone, MessageSquare, X, Download
} from "lucide-react";

// ─── Cores por status (sinistro) ────────────────────────────────────────────
const STATUS_SINISTRO: Record<string, { label: string; cls: string }> = {
  "Pagamento":  { label: "Pagamento",  cls: "bg-green-100 text-green-700 border-green-200" },
  "Em Análise": { label: "Em Análise", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  "Pendente":   { label: "Pendente",   cls: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  "Recusado":   { label: "Recusado",   cls: "bg-red-100 text-red-700 border-red-200" },
};

// ─── Cores por status CRM ────────────────────────────────────────────────────
const STATUS_CRM: Record<string, { label: string; cls: string; dot: string }> = {
  "AGUARDANDO":         { label: "Aguardando",         cls: "bg-gray-100 text-gray-700 border-gray-200",   dot: "bg-gray-400" },
  "ENTRAR EM CONTATO":  { label: "Entrar em Contato",  cls: "bg-yellow-100 text-yellow-700 border-yellow-200", dot: "bg-yellow-500" },
  "FECHADO":            { label: "Fechado",             cls: "bg-green-100 text-green-700 border-green-200",  dot: "bg-green-500" },
  "RECUSADO":           { label: "Recusado",            cls: "bg-red-100 text-red-700 border-red-200",      dot: "bg-red-500" },
};

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const formatDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
};

// ─── Formulário de Sinistro ──────────────────────────────────────────────────
type SinistroForm = {
  nomeSegurado: string;
  cpfSegurado: string;
  protocolo: string;
  dataProtocolo: string;
  produto: string;
  valorCapital: string;
  valorRecebido: string;
  status: "Pagamento" | "Em Análise" | "Pendente" | "Recusado";
  dataRecebimento: string;
  dataNascimento: string;
  beneficiario1: string; telefone1: string;
  beneficiario2: string; telefone2: string;
  beneficiario3: string; telefone3: string;
  beneficiario4: string; telefone4: string;
  beneficiario5: string; telefone5: string;
  observacao: string;
};

const FORM_VAZIO: SinistroForm = {
  nomeSegurado: "", cpfSegurado: "", protocolo: "", dataProtocolo: "",
  produto: "", valorCapital: "", valorRecebido: "",
  status: "Em Análise", dataRecebimento: "", dataNascimento: "",
  beneficiario1: "", telefone1: "",
  beneficiario2: "", telefone2: "",
  beneficiario3: "", telefone3: "",
  beneficiario4: "", telefone4: "",
  beneficiario5: "", telefone5: "",
  observacao: "",
};

// ─── Formulário de Beneficiário CRM ─────────────────────────────────────────
type BenefForm = {
  nome: string;
  telefone: string;
  statusCRM: "AGUARDANDO" | "ENTRAR EM CONTATO" | "FECHADO" | "RECUSADO";
  historico: string;
  observacao: string;
  dataFechamento: string;
};

const BENEF_VAZIO: BenefForm = {
  nome: "", telefone: "", statusCRM: "AGUARDANDO",
  historico: "", observacao: "", dataFechamento: "",
};

export default function Sinistros() {
  const utils = trpc.useUtils();

  // ─── Estado principal ────────────────────────────────────────────────────
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [abaAtiva, setAbaAtiva] = useState("lista");

  // ─── Modal Sinistro ──────────────────────────────────────────────────────
  const [modalSinistro, setModalSinistro] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<SinistroForm>(FORM_VAZIO);

  // ─── Modal CRM ───────────────────────────────────────────────────────────
  const [modalCRM, setModalCRM] = useState(false);
  const [sinistroSelecionado, setSinistroSelecionado] = useState<{ id: number; nomeSegurado: string; status: string } | null>(null);
  const [modalBenef, setModalBenef] = useState(false);
  const [editandoBenefId, setEditandoBenefId] = useState<number | null>(null);
  const [formBenef, setFormBenef] = useState<BenefForm>(BENEF_VAZIO);

  // ─── Queries ─────────────────────────────────────────────────────────────
  const { data, isLoading } = trpc.sinistros.listar.useQuery({
    busca: busca || undefined,
    status: statusFiltro !== "todos" ? statusFiltro : undefined,
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
  });
  const { data: metricas } = trpc.sinistros.metricas.useQuery();
  const { data: metricasCRM } = trpc.sinistros.metricasCRM.useQuery();
  const { data: beneficiariosRaw, isLoading: loadingBenef } = trpc.sinistros.listarBeneficiarios.useQuery(
    { sinistroId: sinistroSelecionado?.id ?? 0 },
    { enabled: !!sinistroSelecionado }
  );
  const beneficiarios = beneficiariosRaw ?? [];

  // ─── Mutations Sinistro ───────────────────────────────────────────────────
  const criarMut = trpc.sinistros.criar.useMutation({
    onSuccess: () => { utils.sinistros.listar.invalidate(); utils.sinistros.metricas.invalidate(); toast.success("Sinistro criado!"); setModalSinistro(false); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarMut = trpc.sinistros.atualizar.useMutation({
    onSuccess: () => { utils.sinistros.listar.invalidate(); utils.sinistros.metricas.invalidate(); toast.success("Sinistro atualizado!"); setModalSinistro(false); },
    onError: (e) => toast.error(e.message),
  });
  const excluirMut = trpc.sinistros.excluir.useMutation({
    onSuccess: () => { utils.sinistros.listar.invalidate(); utils.sinistros.metricas.invalidate(); toast.success("Sinistro excluído!"); },
    onError: (e) => toast.error(e.message),
  });

  // ─── Mutations CRM ───────────────────────────────────────────────────────
  const criarBenefMut = trpc.sinistros.criarBeneficiario.useMutation({
    onSuccess: () => { utils.sinistros.listarBeneficiarios.invalidate(); utils.sinistros.metricasCRM.invalidate(); toast.success("Beneficiário adicionado!"); setModalBenef(false); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarBenefMut = trpc.sinistros.atualizarBeneficiario.useMutation({
    onSuccess: () => { utils.sinistros.listarBeneficiarios.invalidate(); utils.sinistros.metricasCRM.invalidate(); toast.success("Beneficiário atualizado!"); setModalBenef(false); },
    onError: (e) => toast.error(e.message),
  });
  const excluirBenefMut = trpc.sinistros.excluirBeneficiario.useMutation({
    onSuccess: () => { utils.sinistros.listarBeneficiarios.invalidate(); utils.sinistros.metricasCRM.invalidate(); toast.success("Beneficiário removido!"); },
    onError: (e) => toast.error(e.message),
  });

  // ─── Handlers Sinistro ────────────────────────────────────────────────────
  const abrirNovo = () => { setForm(FORM_VAZIO); setEditandoId(null); setModalSinistro(true); };
  const abrirEditar = (s: typeof sinistrosList[0]) => {
    setForm({
      nomeSegurado: s.nomeSegurado,
      cpfSegurado: s.cpfSegurado || "",
      protocolo: s.protocolo || "",
      dataProtocolo: s.dataProtocolo ? new Date(s.dataProtocolo).toISOString().split("T")[0] : "",
      produto: s.produto || "",
      valorCapital: s.valorCapital ? String(s.valorCapital) : "",
      valorRecebido: s.valorRecebido ? String(s.valorRecebido) : "",
      status: (s.status as SinistroForm["status"]) || "Em Análise",
      dataRecebimento: s.dataRecebimento ? new Date(s.dataRecebimento).toISOString().split("T")[0] : "",
      dataNascimento: s.dataNascimento ? new Date(s.dataNascimento).toISOString().split("T")[0] : "",
      beneficiario1: s.beneficiario1 || "", telefone1: s.telefone1 || "",
      beneficiario2: s.beneficiario2 || "", telefone2: s.telefone2 || "",
      beneficiario3: s.beneficiario3 || "", telefone3: s.telefone3 || "",
      beneficiario4: s.beneficiario4 || "", telefone4: s.telefone4 || "",
      beneficiario5: s.beneficiario5 || "", telefone5: s.telefone5 || "",
      observacao: s.observacao || "",
    });
    setEditandoId(s.id);
    setModalSinistro(true);
  };

  const salvarSinistro = () => {
    const payload = {
      nomeSegurado: form.nomeSegurado,
      cpfSegurado: form.cpfSegurado || null,
      protocolo: form.protocolo || null,
      dataProtocolo: form.dataProtocolo || null,
      produto: form.produto || null,
      valorCapital: form.valorCapital ? Number(form.valorCapital.replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".").trim()) || null : null,
      valorRecebido: form.valorRecebido ? Number(form.valorRecebido.replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".").trim()) || null : null,
      status: form.status,
      dataRecebimento: form.dataRecebimento || null,
      dataNascimento: form.dataNascimento || null,
      beneficiario1: form.beneficiario1 || null, telefone1: form.telefone1 || null,
      beneficiario2: form.beneficiario2 || null, telefone2: form.telefone2 || null,
      beneficiario3: form.beneficiario3 || null, telefone3: form.telefone3 || null,
      beneficiario4: form.beneficiario4 || null, telefone4: form.telefone4 || null,
      beneficiario5: form.beneficiario5 || null, telefone5: form.telefone5 || null,
      observacao: form.observacao || null,
    };
    if (editandoId) {
      atualizarMut.mutate({ id: editandoId, data: payload });
    } else {
      criarMut.mutate(payload);
    }
  };

  // ─── Handlers CRM ────────────────────────────────────────────────────────
  const abrirCRM = (s: typeof sinistrosList[0]) => {
    setSinistroSelecionado({ id: s.id, nomeSegurado: s.nomeSegurado, status: s.status });
    setModalCRM(true);
  };

  const abrirNovoBenef = () => {
    setFormBenef({ ...BENEF_VAZIO, nome: "" });
    setEditandoBenefId(null);
    setModalBenef(true);
  };

  const abrirEditarBenef = (b: typeof beneficiarios[0]) => {
    setFormBenef({
      nome: b.nome,
      telefone: b.telefone || "",
      statusCRM: b.statusCRM as BenefForm["statusCRM"],
      historico: b.historico || "",
      observacao: b.observacao || "",
      dataFechamento: b.dataFechamento ? new Date(b.dataFechamento).toISOString().split("T")[0] : "",
    });
    setEditandoBenefId(b.id);
    setModalBenef(true);
  };

  const salvarBenef = () => {
    if (!sinistroSelecionado) return;
    const payload = {
      sinistroId: sinistroSelecionado.id,
      nome: formBenef.nome,
      telefone: formBenef.telefone || null,
      nomeSegurado: sinistroSelecionado.nomeSegurado,
      statusSinistro: sinistroSelecionado.status,
      statusCRM: formBenef.statusCRM,
      historico: formBenef.historico || null,
      observacao: formBenef.observacao || null,
      dataFechamento: formBenef.dataFechamento || null,
    };
    if (editandoBenefId) {
      atualizarBenefMut.mutate({ id: editandoBenefId, data: payload });
    } else {
      criarBenefMut.mutate(payload);
    }
  };

  const sinistrosList = data?.sinistros || [];
  const totalCapital = data?.totalCapital || 0;
  const totalRecebido = data?.totalRecebido || 0;

  const exportarCSV = () => {
    const header = ["Segurado", "CPF", "Protocolo", "Data Protocolo", "Produto", "Valor Capital", "Valor Recebido", "Status", "Data Recebimento", "Observação"];
    const csv = [header.join(";"), ...sinistrosList.map(s => [
      s.nomeSegurado || "", s.cpfSegurado || "", s.protocolo || "",
      formatDate(s.dataProtocolo), s.produto || "",
      s.valorCapital ? Number(s.valorCapital).toFixed(2).replace(".", ",") : "",
      s.valorRecebido ? Number(s.valorRecebido).toFixed(2).replace(".", ",") : "",
      s.status || "", formatDate(s.dataRecebimento),
      (s.observacao || "").replace(/;/g, ","),
    ].join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `sinistros.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Relatório exportado!");
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Controle de Sinistros</h1>
          <p className="text-muted-foreground">Acompanhamento de sinistros e CRM de beneficiários</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportarCSV} className="gap-2">
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
          <Button onClick={abrirNovo} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Sinistro
          </Button>
        </div>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg"><FileText className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Protocolos</p>
                <p className="text-2xl font-bold">{metricas?.total || 0}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2 flex-wrap">
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ {metricas?.pagamentos || 0} Pagos</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">⏳ {metricas?.emAnalise || 0} Análise</span>
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">⚠ {metricas?.pendentes || 0} Pend.</span>
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">✗ {metricas?.recusados || 0} Recus.</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg"><DollarSign className="h-5 w-5 text-purple-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Valor Capital Total</p>
                <p className="text-xl font-bold text-purple-700">{formatCurrency(Number(metricas?.totalCapital || 0))}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg"><CheckCircle className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Valor Total Pago</p>
                <p className="text-xl font-bold text-green-700">{formatCurrency(Number(metricas?.totalRecebido || 0))}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg"><Users className="h-5 w-5 text-orange-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">CRM Beneficiários</p>
                <p className="text-2xl font-bold">{metricasCRM?.total || 0}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2 flex-wrap">
              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">⏸ {metricasCRM?.aguardando || 0}</span>
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">📞 {metricasCRM?.entrarEmContato || 0}</span>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ {metricasCRM?.fechado || 0}</span>
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">✗ {metricasCRM?.recusado || 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Abas */}
      <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
        <TabsList>
          <TabsTrigger value="lista">Sinistros</TabsTrigger>
          <TabsTrigger value="mensal">Acompanhamento Mensal</TabsTrigger>
        </TabsList>

        {/* ─── Aba Lista ─────────────────────────────────────────────────── */}
        <TabsContent value="lista" className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por segurado, CPF ou protocolo..." className="pl-9" value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="Pagamento">Pagamento</SelectItem>
                <SelectItem value="Em Análise">Em Análise</SelectItem>
                <SelectItem value="Pendente">Pendente</SelectItem>
                <SelectItem value="Recusado">Recusado</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">De:</Label>
              <Input type="date" className="w-36" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Até:</Label>
              <Input type="date" className="w-36" value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
            {(dataInicio || dataFim) && (
              <Button variant="ghost" size="sm" onClick={() => { setDataInicio(""); setDataFim(""); }} className="text-muted-foreground">
                <X className="h-4 w-4 mr-1" /> Limpar datas
              </Button>
            )}
          </div>

          {/* Totalizadores filtrados */}
          <div className="flex gap-4 text-sm text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
            <span><strong className="text-foreground">{sinistrosList.length}</strong> registros</span>
            <span>Capital: <strong className="text-purple-700">{formatCurrency(totalCapital)}</strong></span>
            <span>Recebido: <strong className="text-green-700">{formatCurrency(totalRecebido)}</strong></span>
          </div>

          {/* Tabela */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="p-3 text-left font-medium text-muted-foreground">Protocolo</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Segurado</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">CPF</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Produto</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Data Protocolo</th>
                      <th className="p-3 text-right font-medium text-muted-foreground">Valor Capital</th>
                      <th className="p-3 text-right font-medium text-muted-foreground">Valor Recebido</th>
                      <th className="p-3 text-center font-medium text-muted-foreground">Status</th>
                      <th className="p-3 text-center font-medium text-muted-foreground">Beneficiários</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Dt. Nascimento</th>
                      <th className="p-3 text-center font-medium text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">Carregando...</td></tr>
                    ) : sinistrosList.length === 0 ? (
                      <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">Nenhum sinistro encontrado.</td></tr>
                    ) : sinistrosList.map(s => {
                      const benefs = [s.beneficiario1, s.beneficiario2, s.beneficiario3, s.beneficiario4, s.beneficiario5].filter(Boolean);
                      return (
                        <tr key={s.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 font-mono text-xs">{s.protocolo || "—"}</td>
                          <td className="p-3 font-medium">{s.nomeSegurado}</td>
                          <td className="p-3 text-muted-foreground font-mono text-xs">{s.cpfSegurado || "—"}</td>
                          <td className="p-3 text-xs">{s.produto || "—"}</td>
                          <td className="p-3 text-xs">{formatDate(s.dataProtocolo)}</td>
                          <td className="p-3 text-right text-purple-700">{s.valorCapital ? formatCurrency(Number(s.valorCapital)) : "—"}</td>
                          <td className="p-3 text-right text-green-700">{s.valorRecebido ? formatCurrency(Number(s.valorRecebido)) : "—"}</td>
                          <td className="p-3 text-center">
                            <Badge className={`text-xs border ${STATUS_SINISTRO[s.status]?.cls || "bg-gray-100 text-gray-600"}`}>
                              {STATUS_SINISTRO[s.status]?.label || s.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">
                            {benefs.length > 0 ? (
                              <span className="text-xs text-muted-foreground">{benefs.length} benef.</span>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="p-3 text-xs">{(s as any).dataNascimento ? formatDate((s as any).dataNascimento) : "—"}</td>
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="CRM Beneficiários" onClick={() => abrirCRM(s)}>
                                <Users className="h-3.5 w-3.5 text-orange-600" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => abrirEditar(s)}>
                                <Edit2 className="h-3.5 w-3.5 text-blue-600" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                                if (confirm("Excluir este sinistro?")) excluirMut.mutate({ id: s.id });
                              }}>
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Aba Mensal ────────────────────────────────────────────────── */}
        <TabsContent value="mensal">
          <Card>
            <CardHeader><CardTitle>Acompanhamento Mensal 2026</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="p-3 text-left font-medium text-muted-foreground">Mês</th>
                    <th className="p-3 text-center font-medium text-muted-foreground">Protocolos</th>
                    <th className="p-3 text-center font-medium text-muted-foreground">Pagos</th>
                    <th className="p-3 text-center font-medium text-muted-foreground">Pendentes</th>
                    <th className="p-3 text-center font-medium text-muted-foreground">Recusados</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">% Pagos</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">Valor Capital</th>
                    <th className="p-3 text-right font-medium text-muted-foreground">Valor Recebido</th>
                  </tr>
                </thead>
                <tbody>
                  {(metricas?.mensal || []).length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhum dado mensal disponível.</td></tr>
                  ) : (metricas?.mensal || []).map((m, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{MESES[(m.mes || 1) - 1]} {m.ano}</td>
                      <td className="p-3 text-center font-bold">{m.total}</td>
                      <td className="p-3 text-center text-green-700">{m.pagamentos}</td>
                      <td className="p-3 text-center text-yellow-700">{m.pendentes}</td>
                      <td className="p-3 text-center text-red-700">{m.recusados}</td>
                      <td className="p-3 text-right">
                        {m.total > 0 ? `${Math.round((m.pagamentos / m.total) * 100)}%` : "—"}
                      </td>
                      <td className="p-3 text-right text-purple-700">{formatCurrency(m.totalCapital)}</td>
                      <td className="p-3 text-right text-green-700">{formatCurrency(m.totalRecebido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Modal Sinistro ─────────────────────────────────────────────────── */}
      <Dialog open={modalSinistro} onOpenChange={setModalSinistro}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoId ? "Editar Sinistro" : "Novo Sinistro"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Segurado *</Label>
                <Input value={form.nomeSegurado} onChange={e => setForm(f => ({ ...f, nomeSegurado: e.target.value }))} placeholder="Nome completo do segurado" />
              </div>
              <div>
                <Label>CPF</Label>
                <Input value={form.cpfSegurado} onChange={e => setForm(f => ({ ...f, cpfSegurado: e.target.value }))} placeholder="000.000.000-00" />
              </div>
              <div>
                <Label>Protocolo de Sinistro</Label>
                <Input value={form.protocolo} onChange={e => setForm(f => ({ ...f, protocolo: e.target.value }))} placeholder="Nº do protocolo" />
              </div>
              <div>
                <Label>Data do Protocolo</Label>
                <Input type="date" min="1900-01-01" max="2100-12-31" value={form.dataProtocolo} onChange={e => setForm(f => ({ ...f, dataProtocolo: e.target.value }))} />
              </div>
              <div>
                <Label>Produto</Label>
                <Input value={form.produto} onChange={e => setForm(f => ({ ...f, produto: e.target.value }))} placeholder="Ex: vida inteira e saf, DIT..." />
              </div>
              <div>
                <Label>Valor Capital</Label>
                <Input value={form.valorCapital} onChange={e => setForm(f => ({ ...f, valorCapital: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <Label>Valor Recebido</Label>
                <Input value={form.valorRecebido} onChange={e => setForm(f => ({ ...f, valorRecebido: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as SinistroForm["status"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pagamento">Pagamento</SelectItem>
                    <SelectItem value="Em Análise">Em Análise</SelectItem>
                    <SelectItem value="Pendente">Pendente</SelectItem>
                    <SelectItem value="Recusado">Recusado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data Recebimento</Label>
                <Input type="date" min="1900-01-01" max="2100-12-31" value={form.dataRecebimento} onChange={e => setForm(f => ({ ...f, dataRecebimento: e.target.value }))} />
              </div>
              <div>
                <Label>Data de Nascimento</Label>
                <Input type="date" min="1900-01-01" max="2100-12-31" value={form.dataNascimento} onChange={e => setForm(f => ({ ...f, dataNascimento: e.target.value }))} />
              </div>
            </div>

            {/* Beneficiários */}
            <div>
              <Label className="text-sm font-semibold">Beneficiários (até 5)</Label>
              <div className="space-y-2 mt-2">
                {[1,2,3,4,5].map(n => (
                  <div key={n} className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder={`Beneficiário ${n}`}
                      value={(form as any)[`beneficiario${n}`]}
                      onChange={e => setForm(f => ({ ...f, [`beneficiario${n}`]: e.target.value }))}
                    />
                    <Input
                      placeholder={`Telefone ${n}`}
                      value={(form as any)[`telefone${n}`]}
                      onChange={e => setForm(f => ({ ...f, [`telefone${n}`]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Observação</Label>
              <Textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalSinistro(false)}>Cancelar</Button>
            <Button onClick={salvarSinistro} disabled={!form.nomeSegurado || criarMut.isPending || atualizarMut.isPending}>
              {criarMut.isPending || atualizarMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal CRM de Beneficiários ─────────────────────────────────────── */}
      <Dialog open={modalCRM} onOpenChange={v => { setModalCRM(v); if (!v) setSinistroSelecionado(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-orange-600" />
              CRM Beneficiários — {sinistroSelecionado?.nomeSegurado}
            </DialogTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={`text-xs border ${STATUS_SINISTRO[sinistroSelecionado?.status || ""]?.cls || ""}`}>
                {sinistroSelecionado?.status}
              </Badge>
            </div>
          </DialogHeader>

          {/* Esteira de status CRM */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-muted/30 rounded-lg">
            {Object.entries(STATUS_CRM).map(([key, val]) => {
              const count = (beneficiarios || []).filter(b => b.statusCRM === key).length;
              return (
                <div key={key} className={`text-center p-2 rounded-lg border ${val.cls}`}>
                  <div className={`w-2 h-2 rounded-full ${val.dot} mx-auto mb-1`} />
                  <p className="text-xs font-medium">{val.label}</p>
                  <p className="text-lg font-bold">{count}</p>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{(beneficiarios || []).length} beneficiário(s) cadastrado(s)</p>
            <Button size="sm" onClick={abrirNovoBenef} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Adicionar Beneficiário
            </Button>
          </div>

          {/* Lista de beneficiários */}
          {loadingBenef ? (
            <p className="text-center text-muted-foreground py-4">Carregando...</p>
          ) : (beneficiarios || []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>Nenhum beneficiário no CRM.</p>
              <p className="text-xs">Clique em "Adicionar Beneficiário" para começar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(beneficiarios || []).map(b => {
                const crmInfo = STATUS_CRM[b.statusCRM] || STATUS_CRM["AGUARDANDO"];
                return (
                  <div key={b.id} className={`border rounded-lg p-4 ${crmInfo.cls}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${crmInfo.dot}`} />
                          <p className="font-semibold">{b.nome}</p>
                          <Badge className={`text-xs border ${crmInfo.cls}`}>{crmInfo.label}</Badge>
                        </div>
                        {b.telefone && (
                          <div className="flex items-center gap-1 mt-1 text-sm">
                            <Phone className="h-3 w-3" /> {b.telefone}
                          </div>
                        )}
                        {b.historico && (
                          <div className="flex items-start gap-1 mt-2 text-xs">
                            <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                            <p className="text-muted-foreground">{b.historico}</p>
                          </div>
                        )}
                        {b.dataFechamento && (
                          <p className="text-xs mt-1 text-muted-foreground">Fechamento: {formatDate(b.dataFechamento)}</p>
                        )}
                      </div>
                      <div className="flex gap-1 ml-2">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => abrirEditarBenef(b)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                          if (confirm("Remover este beneficiário do CRM?")) excluirBenefMut.mutate({ id: b.id });
                        }}>
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Modal Beneficiário ──────────────────────────────────────────────── */}
      <Dialog open={modalBenef} onOpenChange={setModalBenef}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editandoBenefId ? "Editar Beneficiário" : "Novo Beneficiário"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input value={formBenef.nome} onChange={e => setFormBenef(f => ({ ...f, nome: e.target.value }))} placeholder="Nome do beneficiário" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={formBenef.telefone} onChange={e => setFormBenef(f => ({ ...f, telefone: e.target.value }))} placeholder="(00) 00000-0000" />
            </div>
            <div>
              <Label>Status CRM</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {Object.entries(STATUS_CRM).map(([key, val]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFormBenef(f => ({ ...f, statusCRM: key as BenefForm["statusCRM"] }))}
                    className={`p-2 rounded-lg border text-xs font-medium transition-all ${formBenef.statusCRM === key ? `${val.cls} ring-2 ring-offset-1 ring-current` : "bg-background border-border text-muted-foreground"}`}
                  >
                    <div className={`w-2 h-2 rounded-full ${val.dot} mx-auto mb-1`} />
                    {val.label}
                  </button>
                ))}
              </div>
            </div>
            {(formBenef.statusCRM === "FECHADO" || formBenef.statusCRM === "RECUSADO") && (
              <div>
                <Label>Data Fechamento</Label>
                <Input type="date" value={formBenef.dataFechamento} onChange={e => setFormBenef(f => ({ ...f, dataFechamento: e.target.value }))} />
              </div>
            )}
            <div>
              <Label>Histórico / Anotações</Label>
              <Textarea value={formBenef.historico} onChange={e => setFormBenef(f => ({ ...f, historico: e.target.value }))} rows={3} placeholder="Registre contatos, tentativas, observações..." />
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea value={formBenef.observacao} onChange={e => setFormBenef(f => ({ ...f, observacao: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalBenef(false)}>Cancelar</Button>
            <Button onClick={salvarBenef} disabled={!formBenef.nome || criarBenefMut.isPending || atualizarBenefMut.isPending}>
              {criarBenefMut.isPending || atualizarBenefMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AppLayout>
  );
}

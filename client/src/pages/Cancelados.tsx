import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, Plus, Trash2, Pencil, BarChart2, List, CalendarDays, TrendingDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const ANOS = Array.from({ length: 2050 - 2020 + 1 }, (_, i) => 2020 + i);
const ANO_ATUAL = new Date().getFullYear();
const MES_ATUAL = new Date().getMonth() + 1;

const STATUS_LABELS: Record<string, string> = {
  DESISTIU: "Desistiu",
  INADIMPLENTE: "Inadimplente",
  OBITO: "Óbito",
  REGULACAO: "Regulação",
  ALTERACAO_BENEFICIO: "Alt. Benefício",
  RECUPERADO: "Recuperado",
};
const STATUS_COLORS: Record<string, string> = {
  DESISTIU: "#f59e0b",
  INADIMPLENTE: "#ef4444",
  OBITO: "#6b7280",
  REGULACAO: "#3b82f6",
  ALTERACAO_BENEFICIO: "#8b5cf6",
  RECUPERADO: "#22c55e",
};
const STATUS_BADGE: Record<string, string> = {
  DESISTIU: "bg-amber-100 text-amber-800 border-amber-200",
  INADIMPLENTE: "bg-red-100 text-red-800 border-red-200",
  OBITO: "bg-gray-100 text-gray-700 border-gray-200",
  REGULACAO: "bg-blue-100 text-blue-800 border-blue-200",
  ALTERACAO_BENEFICIO: "bg-purple-100 text-purple-800 border-purple-200",
  RECUPERADO: "bg-green-100 text-green-800 border-green-200",
};

const PIE_COLORS = ["#ef4444","#f59e0b","#6b7280","#3b82f6","#8b5cf6","#22c55e"];

type Aba = "dashboard" | "registros" | "anual";

const formVazio = { nome: "", cpf: "", produto: "", status: "INADIMPLENTE", observacao: "" };

export default function Cancelados() {
  const [aba, setAba] = useState<Aba>("dashboard");
  const [mes, setMes] = useState(MES_ATUAL);
  const [ano, setAno] = useState(ANO_ATUAL);
  const [anoAnual, setAnoAnual] = useState(ANO_ATUAL);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [pagina, setPagina] = useState(0);
  const PAGE_SIZE = 50;

  // Modal
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState(formVazio);

  // Upload
  const [uploadMes, setUploadMes] = useState(MES_ATUAL);
  const [uploadAno, setUploadAno] = useState(ANO_ATUAL);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  // Queries
  const { data: metricas, isLoading: loadingMetricas } = trpc.cancelados.metricasMensal.useQuery({ mes, ano });
  const { data: metricasAnual, isLoading: loadingAnual } = trpc.cancelados.metricasAnual.useQuery({ ano: anoAnual });
  const { data: listaData, isLoading: loadingLista } = trpc.cancelados.listar.useQuery({
    mes, ano,
    status: statusFiltro === "todos" ? undefined : statusFiltro,
    busca: busca || undefined,
    limit: PAGE_SIZE,
    offset: pagina * PAGE_SIZE,
  });
  const { data: uploads } = trpc.cancelados.listarUploads.useQuery();

  // Mutations
  const criarMutation = trpc.cancelados.criar.useMutation({
    onSuccess: () => { utils.cancelados.listar.invalidate(); utils.cancelados.metricasMensal.invalidate(); setModalAberto(false); setForm(formVazio); toast.success("Registro criado!"); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarMutation = trpc.cancelados.atualizar.useMutation({
    onSuccess: () => { utils.cancelados.listar.invalidate(); utils.cancelados.metricasMensal.invalidate(); setModalAberto(false); setEditandoId(null); setForm(formVazio); toast.success("Registro atualizado!"); },
    onError: (e) => toast.error(e.message),
  });
  const excluirMutation = trpc.cancelados.excluir.useMutation({
    onSuccess: () => { utils.cancelados.listar.invalidate(); utils.cancelados.metricasMensal.invalidate(); toast.success("Registro excluído!"); },
    onError: (e) => toast.error(e.message),
  });
  const deletarUploadMutation = trpc.cancelados.deletarUpload.useMutation({
    onSuccess: () => { utils.cancelados.listar.invalidate(); utils.cancelados.metricasMensal.invalidate(); utils.cancelados.listarUploads.invalidate(); toast.success("Importação removida!"); },
    onError: (e) => toast.error(e.message),
  });

  const abrirNovo = () => {
    setEditandoId(null);
    setForm({ ...formVazio, nome: "" });
    setModalAberto(true);
  };
  const abrirEdicao = (r: any) => {
    setEditandoId(r.id);
    setForm({ nome: r.nome || "", cpf: r.cpf || "", produto: r.produto || "", status: r.status || "INADIMPLENTE", observacao: r.observacao || "" });
    setModalAberto(true);
  };
  const salvar = () => {
    if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    if (editandoId) {
      atualizarMutation.mutate({ id: editandoId, data: form });
    } else {
      criarMutation.mutate({ mes, ano, ...form });
    }
  };

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("arquivo", file);
      fd.append("mes", String(uploadMes));
      fd.append("ano", String(uploadAno));
      const res = await fetch("/api/upload/cancelados", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro no upload");
      toast.success(`${data.totalRegistros} cancelamentos importados!`);
      utils.cancelados.listar.invalidate();
      utils.cancelados.metricasMensal.invalidate();
      utils.cancelados.metricasAnual.invalidate();
      utils.cancelados.listarUploads.invalidate();
      setMes(uploadMes);
      setAno(uploadAno);
    } catch (err: any) {
      toast.error(err.message || "Erro ao importar");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [uploadMes, uploadAno, utils]);

  const registros = listaData?.registros ?? [];
  const totalRegistros = listaData?.total ?? 0;
  const totalPaginas = Math.ceil(totalRegistros / PAGE_SIZE);

  // Dados para gráfico anual
  const dadosBarAnual = (metricasAnual?.porMes ?? []).map(m => ({
    mes: MESES[m.mes - 1],
    Desistiu: m.desistiu,
    Inadimplente: m.inadimplente,
    Óbito: m.obito,
    Regulação: m.regulacao,
    "Alt. Benefício": m.alteracao_beneficio,
    Recuperado: (m as any).recuperado ?? 0,
    Total: m.total,
  }));

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <TrendingDown className="w-6 h-6 text-red-500" />
              Cancelamentos
            </h1>
            <p className="text-sm text-muted-foreground">Controle mensal de cancelamentos por motivo</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={abrirNovo}>
              <Plus className="w-4 h-4 mr-1" /> Novo Registro
            </Button>
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-1 border-b">
          {([
            { id: "dashboard", label: "Dashboard Mensal", icon: BarChart2 },
            { id: "registros", label: "Registros", icon: List },
            { id: "anual", label: "Visão Anual", icon: CalendarDays },
          ] as { id: Aba; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${aba === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* ─── ABA DASHBOARD MENSAL ─── */}
        {aba === "dashboard" && (
          <div className="space-y-4">
            {/* Seletor mês/ano */}
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={String(mes)} onValueChange={v => { setMes(Number(v)); setPagina(0); }}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{MESES_FULL.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={String(ano)} onValueChange={v => { setAno(Number(v)); setPagina(0); }}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Card className="col-span-2 md:col-span-1">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Total Cancelados</p>
                  <p className="text-3xl font-bold text-red-600">{metricas?.total ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">{MESES_FULL[mes-1]} {ano}</p>
                </CardContent>
              </Card>
              {Object.entries(STATUS_LABELS).map(([key, label]) => {
                const qtd = metricas?.porStatus?.find(s => s.status === key)?.qtd ?? 0;
                return (
                  <Card key={key}>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-2xl font-bold" style={{ color: STATUS_COLORS[key] }}>{qtd}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {metricas?.total ? `${((qtd / metricas.total) * 100).toFixed(0)}%` : "0%"}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pizza por status */}
              <Card>
                <CardHeader><CardTitle className="text-sm">Distribuição por Motivo</CardTitle></CardHeader>
                <CardContent>
                  {(metricas?.porStatus?.length ?? 0) > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={metricas!.porStatus.map(s => ({ name: STATUS_LABELS[s.status] || s.status, value: s.qtd }))} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                          {metricas!.porStatus.map((s, i) => <Cell key={i} fill={STATUS_COLORS[s.status] || PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <p className="text-center text-muted-foreground py-10">Sem dados para {MESES_FULL[mes-1]} {ano}</p>}
                </CardContent>
              </Card>

              {/* Top produtos */}
              <Card>
                <CardHeader><CardTitle className="text-sm">Top Produtos Cancelados</CardTitle></CardHeader>
                <CardContent>
                  {(metricas?.porProduto?.length ?? 0) > 0 ? (
                    <div className="space-y-2">
                      {metricas!.porProduto.slice(0, 8).map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{p.produto}</p>
                            <div className="h-1.5 bg-muted rounded-full mt-1">
                              <div className="h-1.5 bg-red-400 rounded-full" style={{ width: `${metricas!.total ? (p.qtd / metricas!.total) * 100 : 0}%` }} />
                            </div>
                          </div>
                          <span className="text-xs font-bold text-red-600 w-6 text-right">{p.qtd}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-center text-muted-foreground py-10">Sem dados</p>}
                </CardContent>
              </Card>
            </div>

            {/* Upload */}
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Upload className="w-4 h-4" /> Importar Planilha</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 flex-wrap">
                  <Select value={String(uploadMes)} onValueChange={v => setUploadMes(Number(v))}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>{MESES_FULL.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={String(uploadAno)} onValueChange={v => setUploadAno(Number(v))}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>{ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <Upload className="w-4 h-4 mr-1" /> {uploading ? "Importando..." : "Selecionar Arquivo"}
                  </Button>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} />
                  <p className="text-xs text-muted-foreground">Colunas esperadas: Nome, CPF, Produto, Status/Motivo, Observação</p>
                </div>

                {/* Histórico de uploads */}
                {(uploads?.length ?? 0) > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Importações anteriores:</p>
                    {uploads!.slice(0, 5).map(u => (
                      <div key={u.id} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                        <span>{MESES_FULL[u.mes - 1]} {u.ano} — {u.totalRegistros} registros — {u.nomeArquivo}</span>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { if (confirm("Remover esta importação?")) deletarUploadMutation.mutate({ uploadId: u.id }); }}>
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── ABA REGISTROS ─── */}
        {aba === "registros" && (
          <div className="space-y-3">
            {/* Filtros */}
            <div className="flex gap-2 flex-wrap items-center">
              <Select value={String(mes)} onValueChange={v => { setMes(Number(v)); setPagina(0); }}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{MESES_FULL.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={String(ano)} onValueChange={v => { setAno(Number(v)); setPagina(0); }}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={statusFiltro} onValueChange={v => { setStatusFiltro(v); setPagina(0); }}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Todos os status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Buscar nome, CPF, produto..." value={busca} onChange={e => { setBusca(e.target.value); setPagina(0); }} className="w-56" />
              <span className="text-sm text-muted-foreground ml-auto">{totalRegistros} registros</span>
            </div>

            {/* Tabela */}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Nome</th>
                    <th className="text-left px-3 py-2 font-medium">CPF</th>
                    <th className="text-left px-3 py-2 font-medium">Produto</th>
                    <th className="text-left px-3 py-2 font-medium">Motivo</th>
                    <th className="text-left px-3 py-2 font-medium">Observação</th>
                    <th className="text-right px-3 py-2 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLista ? (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>
                  ) : registros.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum cancelamento em {MESES_FULL[mes-1]} {ano}</td></tr>
                  ) : registros.map((r: any) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 font-medium">{r.nome}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.cpf || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate">{r.produto || "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[r.status] || "bg-gray-100 text-gray-700"}`}>
                          {STATUS_LABELS[r.status] || r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{r.observacao || "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEdicao(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("Excluir este registro?")) excluirMutation.mutate({ id: r.id }); }}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
                <span className="text-sm text-muted-foreground">Página {pagina + 1} de {totalPaginas}</span>
                <Button variant="outline" size="sm" disabled={pagina >= totalPaginas - 1} onClick={() => setPagina(p => p + 1)}>Próxima</Button>
              </div>
            )}
          </div>
        )}

        {/* ─── ABA ANUAL ─── */}
        {aba === "anual" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Select value={String(anoAnual)} onValueChange={v => setAnoAnual(Number(v))}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">Visão consolidada de {anoAnual}</span>
            </div>

            {/* KPIs anuais */}
            {metricasAnual && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <Card className="col-span-2 md:col-span-1">
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Total {anoAnual}</p>
                    <p className="text-3xl font-bold text-red-600">{metricasAnual.totais.total}</p>
                  </CardContent>
                </Card>
                {Object.entries(STATUS_LABELS).map(([key, label]) => {
                  const qtd = (metricasAnual.totais as any)[key.toLowerCase()] ?? (metricasAnual.totais as any)[key === "ALTERACAO_BENEFICIO" ? "alteracao_beneficio" : key.toLowerCase()] ?? 0;
                  return (
                    <Card key={key}>
                      <CardContent className="pt-4">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-2xl font-bold" style={{ color: STATUS_COLORS[key] }}>{qtd}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Gráfico de barras empilhadas por mês */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Cancelamentos por Mês — {anoAnual}</CardTitle></CardHeader>
              <CardContent>
                {dadosBarAnual.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={dadosBarAnual} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Inadimplente" stackId="a" fill="#ef4444" />
                      <Bar dataKey="Desistiu" stackId="a" fill="#f59e0b" />
                      <Bar dataKey="Óbito" stackId="a" fill="#6b7280" />
                      <Bar dataKey="Regulação" stackId="a" fill="#3b82f6" />
                      <Bar dataKey="Alt. Benefício" stackId="a" fill="#8b5cf6" />
                      <Bar dataKey="Recuperado" stackId="a" fill="#22c55e" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-center text-muted-foreground py-10">Sem dados para {anoAnual}</p>}
              </CardContent>
            </Card>

            {/* Tabela mensal */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Detalhamento Mensal</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium">Mês</th>
                        <th className="text-right py-2 font-medium text-red-600">Inadimplente</th>
                        <th className="text-right py-2 font-medium text-amber-600">Desistiu</th>
                        <th className="text-right py-2 font-medium text-gray-500">Óbito</th>
                        <th className="text-right py-2 font-medium text-blue-600">Regulação</th>
                        <th className="text-right py-2 font-medium text-purple-600">Alt. Benefício</th>
                        <th className="text-right py-2 font-medium text-green-600">Recuperado</th>
                        <th className="text-right py-2 font-bold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingAnual ? (
                        <tr><td colSpan={8} className="text-center py-6 text-muted-foreground">Carregando...</td></tr>
                      ) : (metricasAnual?.porMes ?? []).length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-6 text-muted-foreground">Sem dados para {anoAnual}</td></tr>
                      ) : (metricasAnual?.porMes ?? []).map(m => (
                        <tr key={m.mes} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => { setMes(m.mes); setAno(anoAnual); setAba("registros"); }}>
                          <td className="py-2 font-medium">{MESES_FULL[m.mes - 1]}</td>
                          <td className="py-2 text-right text-red-600">{m.inadimplente || "—"}</td>
                          <td className="py-2 text-right text-amber-600">{m.desistiu || "—"}</td>
                          <td className="py-2 text-right text-gray-500">{m.obito || "—"}</td>
                          <td className="py-2 text-right text-blue-600">{m.regulacao || "—"}</td>
                          <td className="py-2 text-right text-purple-600">{m.alteracao_beneficio || "—"}</td>
                          <td className="py-2 text-right text-green-600">{(m as any).recuperado || "—"}</td>
                          <td className="py-2 text-right font-bold">{m.total}</td>
                        </tr>
                      ))}
                      {(metricasAnual?.porMes ?? []).length > 0 && (
                        <tr className="border-t bg-muted/30 font-bold">
                          <td className="py-2">Total</td>
                          <td className="py-2 text-right text-red-600">{metricasAnual!.totais.inadimplente}</td>
                          <td className="py-2 text-right text-amber-600">{metricasAnual!.totais.desistiu}</td>
                          <td className="py-2 text-right text-gray-500">{metricasAnual!.totais.obito}</td>
                          <td className="py-2 text-right text-blue-600">{metricasAnual!.totais.regulacao}</td>
                          <td className="py-2 text-right text-purple-600">{metricasAnual!.totais.alteracao_beneficio}</td>
                          <td className="py-2 text-right text-green-600">{(metricasAnual!.totais as any).recuperado ?? 0}</td>
                          <td className="py-2 text-right">{metricasAnual!.totais.total}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Modal Criar/Editar */}
      <Dialog open={modalAberto} onOpenChange={open => { setModalAberto(open); if (!open) { setEditandoId(null); setForm(formVazio); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editandoId ? "Editar Cancelamento" : "Novo Cancelamento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>CPF</Label>
                <Input value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" />
              </div>
              <div className="space-y-1">
                <Label>Motivo *</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Produto</Label>
              <Input value={form.produto} onChange={e => setForm({ ...form, produto: e.target.value })} placeholder="Nome do produto" />
            </div>
            <div className="space-y-1">
              <Label>Observação</Label>
              <Textarea value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} placeholder="Observações adicionais..." rows={3} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
              <Button onClick={salvar} disabled={criarMutation.isPending || atualizarMutation.isPending}>
                {criarMutation.isPending || atualizarMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

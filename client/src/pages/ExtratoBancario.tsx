import { useState, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Upload, CheckCircle, AlertCircle, TrendingUp, TrendingDown,
  BarChart3, FileSpreadsheet, Trash2, ChevronDown, ChevronUp,
  Filter, RefreshCw, ArrowRight, Pencil
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const ANOS = Array.from({ length: 31 }, (_, i) => 2020 + i);

const CATEGORIA_LABELS: Record<string, string> = {
  SALARIO: "Salário", COMISSAO: "Comissão", DISTRIBUICAO: "Distribuição",
  VEICULO: "Veículo", ESTRUTURA: "Estrutura", BANCO: "Banco",
  IMPOSTOS: "Impostos", ALIMENTACAO: "Alimentação",
  MATERIAL_ESCRITORIO: "Material Escritório", DIVERSOS: "Diversos",
};

const VINCULO_LABELS: Record<string, string> = {
  ANDERSON: "Anderson", NAYARA: "Nayara", ELISIA: "Elisia", BARCELLOS: "Barcellos",
};

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ExtratoBancario() {
  const fileRef = useRef<HTMLInputElement>(null);

  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [uploadId, setUploadId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "Entrada" | "Saída">("todos");
  const [filtroSemCategoria, setFiltroSemCategoria] = useState(false);
  const [expandirResumo, setExpandirResumo] = useState(true);
  const [abaSelecionada, setAbaSelecionada] = useState<"lancamentos" | "resumo" | "historico">("lancamentos");
  const [editandoMes, setEditandoMes] = useState<{ uploadId: number; mes: number; ano: number } | null>(null);

  const utils = trpc.useUtils();

  const { data: uploads } = trpc.extratoBancario.listarUploads.useQuery();
  const { data: lancamentos, isLoading: loadingLanc } = trpc.extratoBancario.listarLancamentos.useQuery(
    { uploadId: uploadId! },
    { enabled: !!uploadId }
  );
  const { data: resumo } = trpc.extratoBancario.resumo.useQuery(
    { uploadId: uploadId! },
    { enabled: !!uploadId }
  );
  const { data: categorias } = trpc.extratoBancario.listarCategorias.useQuery();
  const { data: vinculos } = trpc.extratoBancario.listarVinculos.useQuery();

  const atualizarMut = trpc.extratoBancario.atualizarLancamento.useMutation({
    onSuccess: () => utils.extratoBancario.listarLancamentos.invalidate(),
  });
  const atualizarLoteMut = trpc.extratoBancario.atualizarLote.useMutation({
    onSuccess: () => {
      utils.extratoBancario.listarLancamentos.invalidate();
      utils.extratoBancario.resumo.invalidate();
                  toast.success("Lote atualizado! Todos os lançamentos do mesmo tipo foram atualizados.");
    },
  });
  const confirmarMut = trpc.extratoBancario.confirmar.useMutation({
    onSuccess: (data) => {
      utils.extratoBancario.listarUploads.invalidate();
      toast.success(`Importação confirmada! ${data.criados} lançamento(s) criado(s) no Contas a Pagar.${data.erros.length > 0 ? ` ${data.erros.length} erro(s).` : ""}`);
      setAbaSelecionada("historico");
    },
  });
  const excluirLancamentoMut = trpc.extratoBancario.excluirLancamento.useMutation({
    onSuccess: () => {
      utils.extratoBancario.listarLancamentos.invalidate();
      utils.extratoBancario.resumo.invalidate();
      toast.success("Lançamento excluído.");
    },
  });
  const excluirSemCategoriaMut = trpc.extratoBancario.excluirSemCategoria.useMutation({
    onSuccess: (data) => {
      utils.extratoBancario.listarLancamentos.invalidate();
      utils.extratoBancario.resumo.invalidate();
      toast.success(`${data.excluidos} lançamento(s) sem categoria excluído(s).`);
    },
  });
  const deletarMut = trpc.extratoBancario.deletarUpload.useMutation({
    onSuccess: () => {
      utils.extratoBancario.listarUploads.invalidate();
      if (uploadId) {
        setUploadId(null);
        utils.extratoBancario.listarLancamentos.invalidate();
        utils.extratoBancario.resumo.invalidate();
      }
      toast.success("Upload removido.");
    },
  });
  const corrigirMesMut = trpc.extratoBancario.corrigirMes.useMutation({
    onSuccess: (data) => {
      utils.extratoBancario.listarUploads.invalidate();
      setEditandoMes(null);
      toast.success(`Mês corrigido!${data.contasAtualizadas > 0 ? ` ${data.contasAtualizadas} lançamento(s) no Contas a Pagar também foram atualizados.` : ""}`);
    },
  });

  // Upload do arquivo (Excel ou PDF do Banco do Brasil)
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mes", String(mes));
      formData.append("ano", String(ano));

      // Detectar se é PDF ou Excel
      const isPDF = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
      const endpoint = isPDF ? "/api/upload/extrato-bancario-pdf" : "/api/extrato-bancario";

      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro no upload");
      setUploadId(data.uploadId);
      setAbaSelecionada("lancamentos");
      utils.extratoBancario.listarUploads.invalidate();
      toast.success(`Extrato importado! ${data.total} lançamentos carregados. Agora categorize e confirme.`);
    } catch (err: any) {
      toast.error(`Erro no upload: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Filtrar lançamentos
  const lancamentosFiltrados = useMemo(() => {
    if (!lancamentos) return [];
    return lancamentos.filter(l => {
      if (filtroTipo !== "todos" && l.tipo !== filtroTipo) return false;
      if (filtroSemCategoria && l.categoria) return false;
      if (busca) {
        const b = busca.toLowerCase();
        if (!l.lancamento.toLowerCase().includes(b) && !l.detalhes.toLowerCase().includes(b)) return false;
      }
      return true;
    });
  }, [lancamentos, filtroTipo, filtroSemCategoria, busca]);

  // Totais
  const totalEntradas = lancamentos?.filter(l => l.tipo === "Entrada").reduce((s, l) => s + l.valor, 0) ?? 0;
  const totalSaidas = lancamentos?.filter(l => l.tipo === "Saída").reduce((s, l) => s + l.valor, 0) ?? 0;
  const semCategoria = lancamentos?.filter(l => !l.categoria).length ?? 0;
  const comCategoria = lancamentos?.filter(l => l.categoria).length ?? 0;

  // Upload atual selecionado
  const uploadAtual = uploads?.find(u => u.id === uploadId);

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Extrato Bancário</h1>
          <p className="text-muted-foreground text-sm">Importe o extrato, categorize e crie lançamentos no Contas a Pagar</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Seletor de mês/ano */}
          <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.pdf" className="hidden" onChange={handleUpload} />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
            {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Importando..." : "Importar Extrato (Excel ou PDF)"}
          </Button>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b">
        {[
          { id: "lancamentos", label: "Lançamentos", icon: FileSpreadsheet },
          { id: "resumo", label: "Resumo por Categoria", icon: BarChart3 },
          { id: "historico", label: "Histórico de Uploads", icon: CheckCircle },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setAbaSelecionada(id as any)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              abaSelecionada === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ABA: LANÇAMENTOS */}
      {abaSelecionada === "lancamentos" && (
        <div className="space-y-4">
          {!uploadId ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                <FileSpreadsheet className="h-12 w-12 text-muted-foreground" />
                <div className="text-center">
                  <p className="font-medium text-foreground">Nenhum extrato carregado</p>
                  <p className="text-sm text-muted-foreground">Selecione o mês/ano e importe o arquivo Excel do extrato bancário</p>
                </div>
                {uploads && uploads.length > 0 && (
                  <div className="text-sm text-muted-foreground">
                    Ou selecione um upload anterior no{" "}
                    <button className="text-primary underline" onClick={() => setAbaSelecionada("historico")}>
                      Histórico de Uploads
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-green-600">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-xs font-medium">Total Entradas</span>
                    </div>
                    <p className="text-xl font-bold text-green-600 mt-1">{fmt(totalEntradas)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-red-600">
                      <TrendingDown className="h-4 w-4" />
                      <span className="text-xs font-medium">Total Saídas</span>
                    </div>
                    <p className="text-xl font-bold text-red-600 mt-1">{fmt(totalSaidas)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-xs font-medium">Categorizados</span>
                    </div>
                    <p className="text-xl font-bold mt-1">{comCategoria}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      <span className="text-xs font-medium">Sem Categoria</span>
                    </div>
                    <p className="text-xl font-bold mt-1">{semCategoria}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Filtros */}
              <div className="flex flex-wrap gap-2 items-center">
                <Input
                  placeholder="Buscar lançamento..."
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  className="w-56"
                />
                <Select value={filtroTipo} onValueChange={v => setFiltroTipo(v as any)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="Entrada">Entradas</SelectItem>
                    <SelectItem value="Saída">Saídas</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant={filtroSemCategoria ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFiltroSemCategoria(!filtroSemCategoria)}
                  className="gap-1"
                >
                  <Filter className="h-3 w-3" />
                  Sem categoria ({semCategoria})
                </Button>
                <div className="ml-auto flex gap-2">
                  {!uploadAtual?.confirmado && semCategoria > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => {
                        if (confirm(`Excluir ${semCategoria} lançamento(s) sem categoria? Esta ação não pode ser desfeita.`)) {
                          excluirSemCategoriaMut.mutate({ uploadId: uploadId! });
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                      Excluir sem categoria ({semCategoria})
                    </Button>
                  )}
                  {!uploadAtual?.confirmado && (
                    <Button
                      onClick={() => {
                        if (semCategoria > 0) {
                          toast.warning(`${semCategoria} lançamento(s) sem categoria. Você pode confirmar assim mesmo ou categorizar todos primeiro.`);
                        }
                        setAbaSelecionada("resumo");
                      }}
                      variant="outline"
                      className="gap-2"
                    >
                      <BarChart3 className="h-4 w-4" />
                      Ver Resumo
                    </Button>
                  )}
                </div>
              </div>

              {/* Tabela de lançamentos */}
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left p-3 font-medium">Data</th>
                          <th className="text-left p-3 font-medium">Lançamento</th>
                          <th className="text-left p-3 font-medium">Detalhes</th>
                          <th className="text-right p-3 font-medium">Valor</th>
                          <th className="text-center p-3 font-medium">Tipo</th>
                          <th className="text-left p-3 font-medium">Categoria</th>
                          <th className="text-left p-3 font-medium">Vínculo</th>
                          <th className="text-center p-3 font-medium">Lote</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadingLanc ? (
                          <tr><td colSpan={8} className="text-center p-8 text-muted-foreground">Carregando...</td></tr>
                        ) : lancamentosFiltrados.length === 0 ? (
                          <tr><td colSpan={8} className="text-center p-8 text-muted-foreground">Nenhum lançamento encontrado</td></tr>
                        ) : lancamentosFiltrados.map(l => (
                          <tr key={l.id} className={`border-b hover:bg-muted/20 transition-colors ${l.confirmado ? "opacity-60" : ""}`}>
                            <td className="p-3 text-muted-foreground whitespace-nowrap">{l.data}</td>
                            <td className="p-3 font-medium min-w-[280px]">{l.lancamento}</td>
                            <td className="p-3 text-muted-foreground min-w-[120px]">{l.detalhes || "—"}</td>
                            <td className={`p-3 text-right font-mono font-medium ${l.tipo === "Entrada" ? "text-green-600" : "text-red-600"}`}>
                              {l.tipo === "Saída" ? "-" : "+"}{fmt(l.valor)}
                            </td>
                            <td className="p-3 text-center">
                              <Badge variant={l.tipo === "Entrada" ? "default" : "destructive"} className="text-xs">
                                {l.tipo}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Select
                                value={l.categoria || "__none__"}
                                onValueChange={v => atualizarMut.mutate({ id: l.id, categoria: v === '__none__' ? null : v || null })}
                                disabled={l.confirmado}
                              >
                                <SelectTrigger className="h-7 text-xs w-40">
                                  <SelectValue placeholder="Selecionar..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— Sem categoria —</SelectItem>
                                  {(categorias || []).map(c => (
                                    <SelectItem key={c} value={c}>{CATEGORIA_LABELS[c] || c}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-3">
                              <Select
                                value={l.vinculo || "__none__"}
                                onValueChange={v => atualizarMut.mutate({ id: l.id, vinculo: v === '__none__' ? null : v || null })}
                                disabled={l.confirmado}
                              >
                                <SelectTrigger className="h-7 text-xs w-32">
                                  <SelectValue placeholder="Selecionar..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— Sem vínculo —</SelectItem>
                                  {(vinculos || []).map(v => (
                                    <SelectItem key={v} value={v}>{VINCULO_LABELS[v] || v}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-3 text-center">
                              {!l.confirmado && (
                                <div className="flex gap-1 justify-center">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs px-2"
                                    title="Aplicar categoria/vínculo a todos os lançamentos do mesmo tipo"
                                    onClick={() => {
                                      if (!l.categoria && !l.vinculo) {
                                        toast.error("Defina categoria ou vínculo primeiro");
                                        return;
                                      }
                                      atualizarLoteMut.mutate({
                                        uploadId: uploadId!,
                                        lancamentoTipo: l.lancamento,
                                        categoria: l.categoria,
                                        vinculo: l.vinculo,
                                      });
                                    }}
                                  >
                                    <ArrowRight className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                                    title="Excluir este lançamento"
                                    onClick={() => excluirLancamentoMut.mutate({ id: l.id })}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ABA: RESUMO */}
      {abaSelecionada === "resumo" && (
        <div className="space-y-4">
          {!uploadId || !resumo ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                <BarChart3 className="h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">Importe um extrato para ver o resumo por categoria</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Resumo de entradas */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-green-600">
                    <TrendingUp className="h-4 w-4" />
                    Entradas por Categoria
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">Categoria</th>
                        <th className="text-left p-2 font-medium">Vínculo</th>
                        <th className="text-right p-2 font-medium">Qtd</th>
                        <th className="text-right p-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumo.filter(r => r.tipo === "Entrada").map((r, i) => (
                        <tr key={i} className="border-b hover:bg-muted/20">
                          <td className="p-2">
                            {r.categoria ? (
                              <Badge variant="outline" className="text-xs">{CATEGORIA_LABELS[r.categoria] || r.categoria}</Badge>
                            ) : (
                              <span className="text-amber-600 text-xs italic">Sem categoria</span>
                            )}
                          </td>
                          <td className="p-2 text-muted-foreground text-xs">{r.vinculo ? VINCULO_LABELS[r.vinculo] || r.vinculo : "—"}</td>
                          <td className="p-2 text-right text-muted-foreground">{r.quantidade}</td>
                          <td className="p-2 text-right font-medium text-green-600">{fmt(r.total)}</td>
                        </tr>
                      ))}
                      {resumo.filter(r => r.tipo === "Entrada").length === 0 && (
                        <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Nenhuma entrada</td></tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-green-50 dark:bg-green-950/20">
                        <td colSpan={3} className="p-2 font-bold text-green-700">Total Entradas</td>
                        <td className="p-2 text-right font-bold text-green-700">
                          {fmt(resumo.filter(r => r.tipo === "Entrada").reduce((s, r) => s + r.total, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>

              {/* Resumo de saídas */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-red-600">
                    <TrendingDown className="h-4 w-4" />
                    Saídas por Categoria
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2 font-medium">Categoria</th>
                        <th className="text-left p-2 font-medium">Vínculo</th>
                        <th className="text-right p-2 font-medium">Qtd</th>
                        <th className="text-right p-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumo.filter(r => r.tipo === "Saída").map((r, i) => (
                        <tr key={i} className="border-b hover:bg-muted/20">
                          <td className="p-2">
                            {r.categoria ? (
                              <Badge variant="outline" className="text-xs">{CATEGORIA_LABELS[r.categoria] || r.categoria}</Badge>
                            ) : (
                              <span className="text-amber-600 text-xs italic">Sem categoria</span>
                            )}
                          </td>
                          <td className="p-2 text-muted-foreground text-xs">{r.vinculo ? VINCULO_LABELS[r.vinculo] || r.vinculo : "—"}</td>
                          <td className="p-2 text-right text-muted-foreground">{r.quantidade}</td>
                          <td className="p-2 text-right font-medium text-red-600">{fmt(r.total)}</td>
                        </tr>
                      ))}
                      {resumo.filter(r => r.tipo === "Saída").length === 0 && (
                        <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Nenhuma saída</td></tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-red-50 dark:bg-red-950/20">
                        <td colSpan={3} className="p-2 font-bold text-red-700">Total Saídas</td>
                        <td className="p-2 text-right font-bold text-red-700">
                          {fmt(resumo.filter(r => r.tipo === "Saída").reduce((s, r) => s + r.total, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>

              {/* Botão de confirmar */}
              {!uploadAtual?.confirmado && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">Pronto para confirmar?</p>
                      <p className="text-sm text-muted-foreground">
                        Serão criados lançamentos no Contas a Pagar para cada combinação de categoria + vínculo.
                        {semCategoria > 0 && (
                          <span className="text-amber-600"> ({semCategoria} lançamento(s) sem categoria serão ignorados)</span>
                        )}
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        setConfirmando(true);
                        confirmarMut.mutate(
                          { uploadId: uploadId!, mes, ano },
                          { onSettled: () => setConfirmando(false) }
                        );
                      }}
                      disabled={confirmando || confirmarMut.isPending}
                      className="gap-2 min-w-[160px]"
                    >
                      {confirmando || confirmarMut.isPending ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )}
                      Confirmar Importação
                    </Button>
                  </CardContent>
                </Card>
              )}
              {uploadAtual?.confirmado && (
                <Card className="border-green-300 bg-green-50 dark:bg-green-950/20">
                  <CardContent className="flex items-center gap-3 py-4">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <p className="text-green-700 font-medium">Este extrato já foi confirmado e os lançamentos foram criados no Contas a Pagar.</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ABA: HISTÓRICO */}
      {abaSelecionada === "historico" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico de Uploads</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium">Arquivo</th>
                  <th className="text-center p-3 font-medium">Mês/Ano</th>
                  <th className="text-right p-3 font-medium">Lançamentos</th>
                  <th className="text-right p-3 font-medium">Entradas</th>
                  <th className="text-right p-3 font-medium">Saídas</th>
                  <th className="text-center p-3 font-medium">Status</th>
                  <th className="text-center p-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {!uploads || uploads.length === 0 ? (
                  <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">Nenhum upload realizado</td></tr>
                ) : uploads.map(u => (
                  <tr key={u.id} className={`border-b hover:bg-muted/20 ${uploadId === u.id ? "bg-primary/5" : ""}`}>
                    <td className="p-3 font-medium">{u.nomeArquivo}</td>
                    <td className="p-3 text-center">{MESES[u.mes - 1]}/{u.ano}</td>
                    <td className="p-3 text-right">{u.totalLancamentos}</td>
                    <td className="p-3 text-right text-green-600">{fmt(u.totalEntradas)}</td>
                    <td className="p-3 text-right text-red-600">{fmt(u.totalSaidas)}</td>
                    <td className="p-3 text-center">
                      {u.confirmado ? (
                        <Badge className="bg-green-100 text-green-700 text-xs">Confirmado</Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">Pendente</Badge>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setUploadId(u.id);
                            setMes(u.mes);
                            setAno(u.ano);
                            setAbaSelecionada("lancamentos");
                          }}
                        >
                          Abrir
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-amber-600 hover:text-amber-700"
                          title="Corrigir mês/ano"
                          onClick={() => setEditandoMes({ uploadId: u.id, mes: u.mes, ano: u.ano })}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {!u.confirmado && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-red-600 hover:text-red-700"
                            onClick={() => deletarMut.mutate({ uploadId: u.id })}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Dialog: Corrigir Mês */}
      <Dialog open={!!editandoMes} onOpenChange={open => { if (!open) setEditandoMes(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Corrigir Mês/Ano do Extrato</DialogTitle>
          </DialogHeader>
          {editandoMes && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Selecione o mês e ano corretos. Se o extrato já foi confirmado, os lançamentos no Contas a Pagar também serão atualizados.
              </p>
              <div className="flex gap-2">
                <Select
                  value={String(editandoMes.mes)}
                  onValueChange={v => setEditandoMes(prev => prev ? { ...prev, mes: Number(v) } : null)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={String(editandoMes.ano)}
                  onValueChange={v => setEditandoMes(prev => prev ? { ...prev, ano: Number(v) } : null)}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditandoMes(null)}>Cancelar</Button>
            <Button
              disabled={corrigirMesMut.isPending}
              onClick={() => {
                if (!editandoMes) return;
                corrigirMesMut.mutate({ uploadId: editandoMes.uploadId, mes: editandoMes.mes, ano: editandoMes.ano });
              }}
            >
              {corrigirMesMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import AppLayout from "@/components/AppLayout";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  DollarSign, CheckCircle, Clock, Download, ChevronDown, ChevronRight,
  TrendingUp, Users, AlertCircle
} from "lucide-react";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function ComissoesPendentes() {
  const utils = trpc.useUtils();
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [corretorAberto, setCorretorAberto] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  const { data: resumo, isLoading } = trpc.vendas.comissoesPendentes.useQuery({ ano });
  const { data: detalhes } = trpc.vendas.listarPendentes.useQuery(
    { corretor: corretorAberto || undefined, ano },
    { enabled: !!corretorAberto }
  );

  const marcarMut = trpc.vendas.marcarPagas.useMutation({
    onSuccess: (r) => {
      utils.vendas.comissoesPendentes.invalidate();
      utils.vendas.listarPendentes.invalidate();
      utils.vendas.metricas.invalidate();
      setSelecionados(new Set());
      toast.success(`${r.count} comissão(ões) marcada(s) como PAGO!`);
    },
    onError: (e) => toast.error(e.message),
  });

  const totalGeral = (resumo || []).reduce((s, r) => s + Number(r.totalComissao), 0);
  const totalVendedores = (resumo || []).length;
  const totalPendentes = (resumo || []).reduce((s, r) => s + Number(r.totalPendentes), 0);

  const toggleSelecionado = (id: number) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTodos = () => {
    if (!detalhes) return;
    if (selecionados.size === detalhes.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(detalhes.map(v => v.id)));
    }
  };

  const marcarSelecionados = () => {
    if (selecionados.size === 0) return;
    marcarMut.mutate({ ids: Array.from(selecionados) });
  };

  const exportarCSV = () => {
    const rows = detalhes || [];
    const header = ["Corretor", "Cliente", "CPF", "Mês", "Ano", "Data Venda", "Valor Prêmio", "Comissão", "CPF Novo", "Implantada"];
    const csv = [header.join(";"), ...rows.map(r => [
      r.corretor || "", r.nomeCliente || "", r.cpfCliente || "",
      MESES[(r.mes || 1) - 1], r.ano, r.dataVenda || "",
      (r.valorPremio || 0).toString().replace(".", ","),
      (r.valorComissao || 0).toString().replace(".", ","),
      r.cpfNovo || "", r.implantada || "",
    ].join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `comissoes_pendentes_${ano}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Relatório exportado!");
  };

  return (
    <AppLayout>
      <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Comissões Pendentes</h1>
          <p className="text-muted-foreground text-sm">
            Vendas com comissão ainda não marcada como PAGO — agrupadas por vendedor
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 36 }, (_, i) => 2015 + i).map(a => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {corretorAberto && (
            <Button variant="outline" onClick={exportarCSV} className="gap-2">
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          )}
        </div>
      </div>

      {/* Cards de totais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-orange-600" />
              <span className="text-xs font-medium text-muted-foreground">Total a Pagar</span>
            </div>
            <p className="text-2xl font-bold text-orange-700">{fmt(totalGeral)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">comissões pendentes em {ano}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium text-muted-foreground">Vendas Pendentes</span>
            </div>
            <p className="text-2xl font-bold text-blue-700">{totalPendentes}</p>
            <p className="text-xs text-muted-foreground mt-0.5">registros sem pagamento</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-purple-600" />
              <span className="text-xs font-medium text-muted-foreground">Vendedores</span>
            </div>
            <p className="text-2xl font-bold text-purple-700">{totalVendedores}</p>
            <p className="text-xs text-muted-foreground mt-0.5">com comissões a receber</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista por vendedor */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : (resumo || []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="font-semibold text-lg">Tudo em dia!</p>
            <p className="text-muted-foreground text-sm">Não há comissões pendentes para {ano}.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(resumo || []).map((r) => {
            const aberto = corretorAberto === r.corretor;
            const vendasCorretor = aberto ? (detalhes || []) : [];
            const todosSelecionados = vendasCorretor.length > 0 && vendasCorretor.every(v => selecionados.has(v.id));
            const algunsSelecionados = vendasCorretor.some(v => selecionados.has(v.id));

            return (
              <Card key={r.corretor} className={`border transition-all ${aberto ? "border-orange-300 shadow-md" : "hover:border-orange-200"}`}>
                {/* Cabeçalho do vendedor */}
                <button
                  className="w-full text-left"
                  onClick={() => {
                    setCorretorAberto(aberto ? null : (r.corretor || null));
                    setSelecionados(new Set());
                  }}
                >
                  <CardHeader className="pb-3 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {aberto ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        <div>
                          <CardTitle className="text-base font-semibold">{r.corretor || "Sem vendedor"}</CardTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {Number(r.totalPendentes)} venda(s) pendente(s)
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Prêmio Total</p>
                          <p className="font-semibold text-sm">{fmt(Number(r.totalPremio))}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Comissão a Pagar</p>
                          <p className="font-bold text-orange-600 text-lg">{fmt(Number(r.totalComissao))}</p>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </button>

                {/* Detalhe das vendas */}
                {aberto && (
                  <CardContent className="pt-0 pb-4">
                    <div className="border-t pt-3">
                      {/* Barra de ações em lote */}
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={todosSelecionados}
                            onCheckedChange={toggleTodos}
                            className="border-orange-400"
                          />
                          <span className="text-sm text-muted-foreground">
                            {selecionados.size > 0 ? `${selecionados.size} selecionado(s)` : "Selecionar todos"}
                          </span>
                        </div>
                        {selecionados.size > 0 && (
                          <Button
                            size="sm"
                            onClick={marcarSelecionados}
                            disabled={marcarMut.isPending}
                            className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle className="h-4 w-4" />
                            Marcar {selecionados.size} como PAGO
                          </Button>
                        )}
                      </div>

                      {/* Tabela de vendas */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-xs text-muted-foreground">
                              <th className="pb-2 pr-3 w-8"></th>
                              <th className="pb-2 pr-3">Cliente</th>
                              <th className="pb-2 pr-3">Mês</th>
                              <th className="pb-2 pr-3">Produto</th>
                              <th className="pb-2 pr-3 text-right">Prêmio</th>
                              <th className="pb-2 pr-3 text-right">Comissão</th>
                              <th className="pb-2 pr-3">CPF Novo</th>
                              <th className="pb-2">Implantada</th>
                            </tr>
                          </thead>
                          <tbody>
                            {vendasCorretor.map(v => (
                              <tr key={v.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${selecionados.has(v.id) ? "bg-orange-50" : ""}`}>
                                <td className="py-2 pr-3">
                                  <Checkbox
                                    checked={selecionados.has(v.id)}
                                    onCheckedChange={() => toggleSelecionado(v.id)}
                                    className="border-orange-400"
                                  />
                                </td>
                                <td className="py-2 pr-3">
                                  <p className="font-medium">{v.nomeCliente}</p>
                                  {v.cpfCliente && <p className="text-xs text-muted-foreground">{v.cpfCliente}</p>}
                                </td>
                                <td className="py-2 pr-3">
                                  <Badge variant="outline" className="text-xs">
                                    {MESES[(v.mes || 1) - 1]}/{v.ano}
                                  </Badge>
                                </td>
                                <td className="py-2 pr-3 text-xs text-muted-foreground">{v.produto || "—"}</td>
                                <td className="py-2 pr-3 text-right font-medium">{fmt(Number(v.valorPremio || 0))}</td>
                                <td className="py-2 pr-3 text-right font-bold text-orange-600">{fmt(Number(v.valorComissao || 0))}</td>
                                <td className="py-2 pr-3">
                                  {v.cpfNovo === "SIM" ? (
                                    <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">SIM</Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">NÃO</span>
                                  )}
                                </td>
                                <td className="py-2">
                                  {v.implantada === "SIM" ? (
                                    <Badge className="bg-blue-100 text-blue-700 border-blue-300 text-xs">SIM</Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">NÃO</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t bg-muted/20">
                              <td colSpan={4} className="py-2 pr-3 text-xs font-semibold text-muted-foreground">TOTAL</td>
                              <td className="py-2 pr-3 text-right font-bold text-sm">
                                {fmt(vendasCorretor.reduce((s, v) => s + Number(v.valorPremio || 0), 0))}
                              </td>
                              <td className="py-2 pr-3 text-right font-bold text-orange-600 text-sm">
                                {fmt(vendasCorretor.reduce((s, v) => s + Number(v.valorComissao || 0), 0))}
                              </td>
                              <td colSpan={2}></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
    </AppLayout>
  );
}

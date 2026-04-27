import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import ContaForm from "@/components/ContaForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  DollarSign, TrendingDown, TrendingUp,
  Clock, CheckCircle, Plus, Calendar, Activity,
} from "lucide-react";
import { useAno } from "../contexts/AnoContext";
import { CATEGORIAS } from "../../../shared/constants";

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

function fmt(v: number | string | null | undefined) {
  const n = parseFloat(String(v ?? 0));
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}
function fmtFull(v: number | string | null | undefined) {
  const n = parseFloat(String(v ?? 0));
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}
function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const s = String(d).substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const [yyyy, mm, dd] = s.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function KpiCard({
  label, value, sub, icon: Icon, color, trend,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{label}</p>
            <p className="text-2xl font-bold text-foreground truncate">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${color} flex-shrink-0 ml-3`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
        {trend && (
          <div className="mt-3 flex items-center gap-1">
            {trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-green-500" />}
            {trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardFinanceiro() {
  const utils = trpc.useUtils();
  const { ano } = useAno();
  const [formOpen, setFormOpen] = useState(false);
  const mesAtual = new Date().getMonth() + 1;
  const [mesSelecionado, setMesSelecionado] = useState(mesAtual);
  const [modoVisualizacao, setModoVisualizacao] = useState<"mes" | "anual">("mes");

  // ── CONTAS A PAGAR ──────────────────────────────────────────────────────────
  const { data: metricasAnual } = trpc.contas.metricas.useQuery({ ano });
  const { data: metricasMes } = trpc.contas.metricas.useQuery({ mes: mesSelecionado, ano });
  const { data: aVencer = [] } = trpc.contas.alertas.useQuery({ dias: 10 });
  const { data: vencidas = [] } = trpc.contas.vencidas.useQuery();
  const { data: resumoMensal = [] } = trpc.contas.resumoMensal.useQuery({ ano });
  const { data: porVinculo = [] } = trpc.contas.custosPorVinculo.useQuery({ ano });
  const { data: porVinculoMes = [] } = trpc.contas.custosPorVinculo.useQuery({ ano, mes: mesSelecionado });
  const { data: porCategoria = [] } = trpc.contas.custosPorCategoria.useQuery({ ano });
  const { data: porCategoriaMes = [] } = trpc.contas.custosPorCategoria.useQuery({ ano, mes: mesSelecionado });

  // ── DERIVADOS ───────────────────────────────────────────────────────────────
  const receitasAnual = (metricasAnual as any)?.totalReceitas ?? 0;
  const saldoLiquidoAnual = (metricasAnual as any)?.saldoLiquido ?? 0;
  const saldoElisiaAnual = (metricasAnual as any)?.saldoLiquidoElisia ?? 0;

  const aPagarMes = metricasMes?.totalAPagar ?? 0;
  const pagoMes = metricasMes?.totalPago ?? 0;
  const receitasMes = (metricasMes as any)?.totalReceitas ?? 0;
  const receitasPagoMes = (metricasMes as any)?.totalRecebido ?? 0;
  const saldoLiquidoMes = (metricasMes as any)?.saldoLiquido ?? 0;
  const saldoElisiaMes = (metricasMes as any)?.saldoLiquidoElisia ?? 0;

  // Dados conforme modo de visualização
  const isAnual = modoVisualizacao === "anual";
  const receitasAtivo = isAnual ? receitasAnual : receitasMes;
  const receitasPagoAtivo = isAnual ? ((metricasAnual as any)?.totalRecebido ?? 0) : receitasPagoMes;
  const aPagarAtivo = isAnual ? (metricasAnual?.totalAPagar ?? 0) : aPagarMes;
  const pagoAtivo = isAnual ? (metricasAnual?.totalPago ?? 0) : pagoMes;
  const saldoLiquidoAtivo = isAnual ? saldoLiquidoAnual : saldoLiquidoMes;
  const saldoElisiaAtivo = isAnual ? saldoElisiaAnual : saldoElisiaMes;
  const vinculoAtivo = isAnual ? porVinculo : porVinculoMes;
  const categoriaAtivo = isAnual ? porCategoria : porCategoriaMes;

  const dadosGrafico = useMemo(() => {
    return (resumoMensal as any[]).map((r) => ({
      mes: MESES_ABREV[r.mes - 1],
      "Despesas": r.aPagar,
      "Receitas": r.receitas ?? 0,
      "Saldo": r.saldo,
    }));
  }, [resumoMensal]);

  const topCategorias = useMemo(() => {
    return [...(categoriaAtivo as any[])].sort((a, b) => b.valor - a.valor).slice(0, 5);
  }, [categoriaAtivo]);

  const nomeMes = isAnual ? `Acumulado ${ano}` : MESES_FULL[mesSelecionado - 1];

  // Cores por vínculo
  const VINCULO_COLORS: Record<string, string> = {
    BARCELLOS: "#3b82f6",
    ANDERSON: "#22c55e",
    NAYARA: "#f59e0b",
    ELISIA: "#ec4899",
  };

  return (
    <AppLayout>
      <div className="p-3 md:p-6 space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard Financeiro</h1>
            <p className="text-muted-foreground text-sm">Contas a Pagar — {ano}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Toggle Mês / Anual */}
            <div className="flex rounded-lg border overflow-hidden h-9">
              <button
                onClick={() => setModoVisualizacao("mes")}
                className={`px-3 text-xs font-medium transition-colors ${
                  modoVisualizacao === "mes"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                Mês
              </button>
              <button
                onClick={() => setModoVisualizacao("anual")}
                className={`px-3 text-xs font-medium transition-colors ${
                  modoVisualizacao === "anual"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                Anual
              </button>
            </div>
            {modoVisualizacao === "mes" && (
              <Select value={String(mesSelecionado)} onValueChange={(v) => setMesSelecionado(Number(v))}>
                <SelectTrigger className="w-36 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES_FULL.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button onClick={() => setFormOpen(true)} className="gap-2 h-9">
              <Plus className="h-4 w-4" /> Nova Conta
            </Button>
          </div>
        </div>

        {/* ── KPIs DO MÊS ─────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="h-4 w-4 text-orange-500" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {nomeMes} {ano}
            </h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label={isAnual ? "Receitas no Ano" : "Receitas no Mês"}
              value={fmt(receitasAtivo)}
              sub={receitasPagoAtivo > 0 ? `${fmt(receitasPagoAtivo)} recebido` : "Nenhuma receita"}
              icon={TrendingUp}
              color="bg-emerald-500"
              trend="up"
            />
            <KpiCard
              label={isAnual ? "Despesas no Ano" : "Despesas no Mês"}
              value={fmt(aPagarAtivo)}
              sub={`${((pagoAtivo / (aPagarAtivo || 1)) * 100).toFixed(0)}% pago`}
              icon={DollarSign}
              color="bg-orange-500"
            />
            <KpiCard
              label="Saldo Líquido Elisia"
              value={fmt(saldoElisiaAtivo)}
              sub={isAnual ? "Acumulado anual (pagas)" : "Despesas vinculadas à Elisia (pagas)"}
              icon={TrendingUp}
              color="bg-pink-500"
            />
            <KpiCard
              label="Saldo Líquido Barcellos"
              value={fmt(saldoLiquidoAtivo)}
              sub={isAnual ? `Receitas − Despesas Barcellos ${ano}` : `Anual: ${fmt(saldoLiquidoAnual)}`}
              icon={saldoLiquidoAtivo >= 0 ? TrendingUp : TrendingDown}
              color={saldoLiquidoAtivo >= 0 ? "bg-blue-500" : "bg-red-500"}
              trend={saldoLiquidoAtivo >= 0 ? "up" : "down"}
            />
          </div>
        </section>

        {/* ── ALERTAS ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-orange-200">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-orange-700">
                <Clock className="h-4 w-4" />
                A Vencer — Próximos 10 dias
                <Badge variant="outline" className="ml-auto border-orange-300 text-orange-700 bg-orange-50">{aVencer.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {aVencer.length === 0 ? (
                <div className="text-center py-4">
                  <CheckCircle className="h-7 w-7 text-green-500 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Nenhuma conta a vencer nos próximos 10 dias</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(aVencer as any[]).map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-orange-50 border border-orange-100">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{c.descricao}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Calendar className="h-2.5 w-2.5" /> {fmtDate(c.dataVencimento)} · {c.vinculo}
                        </p>
                      </div>
                      <p className="text-xs font-bold text-orange-700 ml-2 flex-shrink-0">{fmtFull(c.valor)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-red-200">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700">
                <Clock className="h-4 w-4" />
                Vencidas
                <Badge variant="outline" className="ml-auto border-red-300 text-red-700 bg-red-50">{vencidas.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {vencidas.length === 0 ? (
                <div className="text-center py-4">
                  <CheckCircle className="h-7 w-7 text-green-500 mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Nenhuma conta vencida</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(vencidas as any[]).map((c) => {
                    const _dvs = String(c.dataVencimento).substring(0, 10);
                    const _dvd = new Date(_dvs + "T12:00:00");
                    const diasAtraso = Math.max(0, Math.floor((Date.now() - _dvd.getTime()) / (1000 * 60 * 60 * 24)));
                    return (
                      <div key={c.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-red-50 border border-red-100">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{c.descricao}</p>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Calendar className="h-2.5 w-2.5" /> {fmtDate(c.dataVencimento)} · <span className="text-red-600 font-medium">{diasAtraso}d atraso</span>
                          </p>
                        </div>
                        <p className="text-xs font-bold text-red-700 ml-2 flex-shrink-0">{fmtFull(c.valor)}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── GRÁFICO EVOLUÇÃO MENSAL ──────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-semibold">Evolução Mensal — {ano}</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="barras">
              <TabsList className="mb-3 h-8">
                <TabsTrigger value="barras" className="text-xs">Barras</TabsTrigger>
                <TabsTrigger value="linha" className="text-xs">Linha</TabsTrigger>
              </TabsList>
              <TabsContent value="barras">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dadosGrafico} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => fmtFull(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Despesas" fill="#f97316" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Receitas" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>
              <TabsContent value="linha">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dadosGrafico} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => fmtFull(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="Despesas" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Receitas" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="Saldo" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* ── DISTRIBUIÇÃO POR VÍNCULO E TOP CATEGORIAS (somente PAGO) ────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Distribuição por Vínculo — {nomeMes}
                <span className="text-[10px] font-normal text-muted-foreground ml-1">(somente pagos)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(vinculoAtivo as any[]).filter(v => v.valor > 0).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhuma despesa paga registrada</p>
              ) : (
                <div className="space-y-3">
                  {(vinculoAtivo as any[]).map((v) => (
                    <div key={v.vinculo}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium">{v.vinculo}</span>
                        <span className="text-muted-foreground">{fmt(v.valor)} ({v.percentual.toFixed(1)}%)</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${v.percentual}%`,
                            background: VINCULO_COLORS[v.vinculo] ?? "#6b7280",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Top Categorias — {nomeMes}
                <span className="text-[10px] font-normal text-muted-foreground ml-1">(somente pagos)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topCategorias.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhuma despesa paga registrada</p>
              ) : (
                <div className="space-y-3">
                  {topCategorias.map((c: any, i: number) => {
                    const CORES = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6"];
                    return (
                      <div key={c.categoria}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium truncate">{CATEGORIAS[c.categoria] ?? c.categoria}</span>
                          <span className="text-muted-foreground ml-2 flex-shrink-0">{fmt(c.valor)} ({c.percentual.toFixed(1)}%)</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${c.percentual}%`, background: CORES[i % CORES.length] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Formulário */}
        <ContaForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSuccess={() => {
            utils.contas.metricas.invalidate();
            utils.contas.alertas.invalidate();
            utils.contas.vencidas.invalidate();
            utils.contas.resumoMensal.invalidate();
            utils.contas.custosPorVinculo.invalidate();
            utils.contas.custosPorCategoria.invalidate();
          }}
        />
      </div>
    </AppLayout>
  );
}

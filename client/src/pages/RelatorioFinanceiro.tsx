import { useState, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie
} from "recharts";
import { Printer, TrendingUp, TrendingDown, DollarSign, Target, AlertTriangle, BarChart2, ExternalLink } from "lucide-react";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MESES_ABR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const ANOS = Array.from({ length: 10 }, (_, i) => 2020 + i);

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

const CATEGORIAS_RECEITA = [
  { cat: "Comissões Total", sub: null },
  { cat: "Comissões Total", sub: "Carteira" },
  { cat: "Comissões Total", sub: "Angariação" },
  { cat: "(-) Estornos", sub: null },
];
const CATEGORIAS_DESPESA = [
  { cat: "Salários e Remunerações", sub: null },
  { cat: "Comissões Pagas", sub: null },
  { cat: "Contador", sub: null },
  { cat: "Combustível", sub: null },
  { cat: "Alimentação", sub: null },
  { cat: "Material Escritório", sub: null },
  { cat: "Outras Despesas", sub: null },
  { cat: "Cartão de Crédito", sub: null },
  { cat: "Marketing", sub: null },
  { cat: "Luz", sub: null },
  { cat: "Condomínio", sub: null },
  { cat: "Internet", sub: null },
  { cat: "Impostos", sub: null },
];

function getVal(lancamentos: any[], tipo: string, cat: string, sub?: string | null): number {
  const row = lancamentos.find(
    (l: any) => l.tipo === tipo && l.categoria === cat &&
      (sub === undefined ? true : (sub === null ? l.subcategoria === null : l.subcategoria === sub))
  );
  return row ? parseFloat(row.valor) : 0;
}

function KpiCard({ label, value, sub, color, icon: Icon, onClick }: { label: string; value: string; sub?: string; color: string; icon?: any; onClick?: () => void }) {
  return (
    <div
      className={`bg-white rounded-xl shadow-sm overflow-hidden print:shadow-none print:border ${onClick ? "cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all" : ""}`}
      style={{ borderLeft: `4px solid ${color}` }}
      onClick={onClick}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{label}</span>
          {onClick ? <ExternalLink className="h-3.5 w-3.5 text-gray-300" /> : Icon && <Icon className="h-4 w-4" style={{ color }} />}
        </div>
        <div className="text-xl font-bold text-gray-800">{value}</div>
        {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

type ModalTipo = "receita" | "despesa-barcellos" | "lucro" | "despesas-pagas" | "pendentes" | "lucro-acumulado" | "receita-acumulada" | null;

export default function RelatorioFinanceiro() {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const printRef = useRef<HTMLDivElement>(null);
  const [modal, setModal] = useState<ModalTipo>(null);
  const [, navigate] = useLocation();

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: dreMes } = trpc.financeiro.drePorMes.useQuery({ mes, ano });
  const { data: dreAno } = trpc.financeiro.drePorAno.useQuery({ ano });
  const { data: metas } = trpc.financeiro.metasPorAno.useQuery({ ano });
  const { data: carteiraMensal } = trpc.financeiro.carteiraMensal.useQuery({ ano });
  const { data: resumoDre } = trpc.financeiro.resumoDre.useQuery({ ano });
  const { data: metricasContas } = trpc.contas.metricas.useQuery({ mes, ano });
  const { data: resumoMensalContas } = trpc.contas.resumoMensal.useQuery({ ano });
  const { data: contasMes } = trpc.contas.listar.useQuery({ mes, ano });
  const { data: metricasInadimpl } = trpc.inadimplentes.metricas.useQuery({ mes, ano });
  const { data: metricasComissoes } = trpc.comissoes.metricas.useQuery({ mes, ano });
  const { data: resumoCorretores } = trpc.comissoes.resumoPorCorretor.useQuery({ mes, ano });
  const { data: uploadsExtrato } = trpc.extratoBancario.listarUploads.useQuery();
  const { data: resumoVendas = [] } = trpc.vendas.resumoMensal.useQuery({ ano });

  // ── Cálculos do mês ────────────────────────────────────────────────────────
  const lancMes = dreMes ?? [];
  const receitaMes = getVal(lancMes, "RECEITA", "Comissões Total", null);
  const estornosMes = getVal(lancMes, "RECEITA", "(-) Estornos", null);
  const receitaLiquidaMes = receitaMes - estornosMes;
  const despesaMes = CATEGORIAS_DESPESA.reduce((s, c) => s + getVal(lancMes, "DESPESA", c.cat, c.sub), 0);
  // lucroMes e margemMes calculados após despesaBarcellos (definida mais abaixo com contasMes)

  const metaMes = metas?.find((m: any) => m.mes === mes);
  const metaReceita = metaMes ? parseFloat(metaMes.metaReceita) : 0;
  const vendasMes = Number((resumoVendas as any[]).find((v: any) => Number(v.mes) === mes)?.faturamento || 0);
  const pctMeta = metaReceita > 0 ? (vendasMes / metaReceita) * 100 : 0;

  // ── Cálculos anuais ────────────────────────────────────────────────────────
  const lancAno = dreAno ?? [];
  const receitaAno = lancAno
    .filter((l: any) => l.tipo === "RECEITA" && l.categoria === "Comissões Total" && l.subcategoria === null)
    .reduce((s: number, l: any) => s + parseFloat(l.valor), 0);
  const despesaAno = lancAno
    .filter((l: any) => l.tipo === "DESPESA")
    .reduce((s: number, l: any) => s + parseFloat(l.valor), 0);
  const lucroAno = receitaAno - despesaAno;

  // ── Extrato do mês ─────────────────────────────────────────────────────────
  const extratoMes = uploadsExtrato?.find((u: any) => u.mes === mes && u.ano === ano);
  const { data: lancamentosExtrato = [] } = trpc.extratoBancario.listarLancamentos.useQuery(
    { uploadId: extratoMes?.id ?? 0 },
    { enabled: !!extratoMes?.id }
  );

  // ── Gráfico: receita x despesa mensal (ano) ───────────────────────────────
  const graficoDre = useMemo(() => {
    return MESES_ABR.map((m, i) => {
      const idx = i + 1;
      const rec = lancAno
        .filter((l: any) => l.mes === idx && l.tipo === "RECEITA" && l.categoria === "Comissões Total" && l.subcategoria === null)
        .reduce((s: number, l: any) => s + parseFloat(l.valor), 0);
      const desp = lancAno
        .filter((l: any) => l.mes === idx && l.tipo === "DESPESA")
        .reduce((s: number, l: any) => s + parseFloat(l.valor), 0);
      const meta = metas?.find((mm: any) => mm.mes === idx);
      return {
        mes: m,
        Receita: rec,
        Despesa: desp,
        Lucro: rec - desp,
        Meta: meta ? parseFloat(meta.metaReceita) : 0,
      };
    });
  }, [lancAno, metas]);

  // ── Gráfico: carteira x angariação mensal ─────────────────────────────────
  const graficoCarteira = useMemo(() => {
    return MESES_ABR.map((m, i) => {
      const idx = i + 1;
      const cart = carteiraMensal?.carteira?.[idx - 1] ?? 0;
      const ang = carteiraMensal?.angariacao?.[idx - 1] ?? 0;
      return { mes: m, Carteira: cart, Angariação: ang };
    });
  }, [carteiraMensal]);

  // ── Gastos por categoria (mês) ─────────────────────────────────────────────
  const gastosCat = useMemo(() => {
    return CATEGORIAS_DESPESA
      .map(c => ({ nome: c.cat, valor: getVal(lancMes, "DESPESA", c.cat, c.sub) }))
      .filter(c => c.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }, [lancMes]);

  // Entradas auto-geradas pela confirmação do extrato têm este padrão no descricao
  const isAutoExtrato = (descricao: string | null) => !!(descricao?.includes("lançamentos do extrato"));
  const isDistribuicao = (cat: string) => cat === "DISTRIBUICAO" || cat === "Distribuição";

  // ── Contas por categoria (mês) — exclui RECEITA e entradas auto-geradas do extrato ──
  const contasPorCat = useMemo(() => {
    if (!contasMes) return [];
    const map: Record<string, { pago: number; pendente: number }> = {};
    for (const c of contasMes) {
      if ((c as any).tipo === "RECEITA") continue;
      if (isAutoExtrato(c.descricao)) continue;
      const key = isDistribuicao(c.categoria)
        ? ((c as any).vinculo ?? c.descricao ?? "DISTRIBUICAO")
        : c.categoria;
      if (!map[key]) map[key] = { pago: 0, pendente: 0 };
      const v = parseFloat(c.valorPago ?? c.valor ?? "0");
      if (c.status === "PAGO") map[key].pago += v;
      else map[key].pendente += v;
    }
    return Object.entries(map).map(([cat, vals]) => ({ cat, ...vals })).sort((a, b) => (b.pago + b.pendente) - (a.pago + a.pendente));
  }, [contasMes]);

  const totalPago = contasMes?.filter((c: any) => c.status === "PAGO" && (c as any).tipo !== "RECEITA" && !isAutoExtrato(c.descricao)).reduce((s: number, c: any) => s + parseFloat(c.valorPago ?? c.valor ?? "0"), 0) ?? 0;
  const totalPendente = contasMes?.filter((c: any) => c.status !== "PAGO" && (c as any).tipo !== "RECEITA" && !isAutoExtrato(c.descricao)).reduce((s: number, c: any) => s + parseFloat(c.valor ?? "0"), 0) ?? 0;
  const totalDistribuicao = contasMes?.filter((c: any) => isDistribuicao(c.categoria) && !isAutoExtrato(c.descricao)).reduce((s: number, c: any) => s + parseFloat(c.valorPago ?? c.valor ?? "0"), 0) ?? 0;
  const despesaBarcellos = totalPago - totalDistribuicao;
  const lucroMes = receitaMes - despesaBarcellos;
  const margemMes = receitaMes > 0 ? (lucroMes / receitaMes) * 100 : 0;

  // ── Distribuição por pessoa — vem do extrato bancário ─────────────────────
  const distribuicaoPorPessoa = useMemo(() => {
    const map: Record<string, number> = {};
    for (const l of lancamentosExtrato as any[]) {
      if (!isDistribuicao(l.categoria)) continue;
      if (l.tipo !== "Saída") continue;
      const pessoa = l.vinculo ?? "SEM VÍNCULO";
      map[pessoa] = (map[pessoa] || 0) + parseFloat(l.valor ?? "0");
    }
    return Object.entries(map).map(([pessoa, total]) => ({ pessoa, total })).sort((a, b) => b.total - a.total);
  }, [lancamentosExtrato]);

  // ── Cores do gráfico de pizza ──────────────────────────────────────────────
  const CORES = ["#3b82f6","#8b5cf6","#22c55e","#f59e0b","#ef4444","#06b6d4","#ec4899","#f97316","#84cc16","#a855f7","#14b8a6","#fb923c","#e11d48"];

  function handlePrint() {
    window.print();
  }

  return (
    <AppLayout>
      <div ref={printRef} className="p-6 space-y-6 print:p-4 print:space-y-4">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between print:mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 print:text-xl">Relatório Financeiro</h1>
            <p className="text-sm text-gray-500">{MESES[mes - 1]} {ano} — visão completa</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" className="gap-2" onClick={handlePrint}>
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          </div>
        </div>

        {/* ── KPIs do mês ── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Resumo do Mês — {MESES[mes-1]}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <KpiCard label="Receita Bruta" value={fmt(receitaMes)} color="#22c55e" icon={TrendingUp} onClick={() => setModal("receita")} />
            <KpiCard label="Despesa Barcellos" value={fmt(despesaBarcellos)} color="#ef4444" icon={TrendingDown} onClick={() => setModal("despesa-barcellos")} />
            <KpiCard label="Lucro Líquido" value={fmt(lucroMes)} sub={fmtPct(margemMes) + " de margem"} color={lucroMes >= 0 ? "#3b82f6" : "#ef4444"} icon={DollarSign} onClick={() => setModal("lucro")} />
            <KpiCard label="Meta Vendas" value={metaReceita > 0 ? fmt(metaReceita) : "—"} sub={metaReceita > 0 ? `${fmt(vendasMes)} realizado — ${fmtPct(pctMeta)}` : "Sem meta"} color={pctMeta >= 100 ? "#22c55e" : pctMeta >= 80 ? "#f59e0b" : "#ef4444"} icon={Target} onClick={() => navigate("/metas")} />
            <KpiCard label="Despesas Pagas" value={fmt(totalPago)} sub="Contas a Pagar" color="#06b6d4" icon={DollarSign} onClick={() => setModal("despesas-pagas")} />
            <KpiCard label="Pendentes" value={fmt(totalPendente)} sub="A pagar" color="#f59e0b" icon={AlertTriangle} onClick={() => setModal("pendentes")} />
          </div>
        </section>

        {/* ── KPIs anuais ── */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Acumulado {ano}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Receita Acumulada" value={fmt(receitaAno)} color="#22c55e" icon={TrendingUp} onClick={() => setModal("receita-acumulada")} />
            <KpiCard label="Despesas Acumuladas" value={fmt(despesaAno)} color="#ef4444" icon={TrendingDown} onClick={() => navigate("/financeiro")} />
            <KpiCard label="Lucro Acumulado" value={fmt(lucroAno)} sub={receitaAno > 0 ? fmtPct((lucroAno / receitaAno) * 100) + " de margem" : ""} color={lucroAno >= 0 ? "#3b82f6" : "#ef4444"} icon={DollarSign} onClick={() => setModal("lucro-acumulado")} />

            <KpiCard label="Inadimplência" value={metricasInadimpl ? String(metricasInadimpl.total ?? 0) + " clientes" : "—"} sub={metricasInadimpl ? fmt(parseFloat(metricasInadimpl.valorTotal ?? "0")) : ""} color="#f59e0b" icon={AlertTriangle} onClick={() => navigate("/inadimplentes")} />
          </div>
        </section>

        {/* ── Comparativo Mensal ── */}
        <section className="print:break-inside-avoid">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Comparativo Mensal — {ano}</h2>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="p-3 text-left font-medium">Mês</th>
                    <th className="p-3 text-right font-medium text-green-700">Receita</th>
                    <th className="p-3 text-right font-medium text-red-700">Despesa</th>
                    <th className="p-3 text-right font-medium text-blue-700">Lucro</th>
                    <th className="p-3 text-right font-medium text-gray-600">Margem</th>
                    <th className="p-3 text-right font-medium text-yellow-700">Meta</th>
                    <th className="p-3 text-right font-medium">vs Meta</th>
                  </tr>
                </thead>
                <tbody>
                  {graficoDre.map((row, i) => {
                    if (row.Receita === 0 && row.Despesa === 0) return null;
                    const margem = row.Receita > 0 ? (row.Lucro / row.Receita) * 100 : 0;
                    const pct = row.Meta > 0 ? (row.Receita / row.Meta) * 100 : null;
                    const isMesSel = i + 1 === mes;
                    return (
                      <tr key={i} className={`border-b ${isMesSel ? "bg-blue-50/60 font-semibold" : "hover:bg-gray-50"}`}>
                        <td className="p-3">{MESES[i]}</td>
                        <td className="p-3 text-right font-mono text-green-700">{fmt(row.Receita)}</td>
                        <td className="p-3 text-right font-mono text-red-700">{fmt(row.Despesa)}</td>
                        <td className={`p-3 text-right font-mono font-bold ${row.Lucro >= 0 ? "text-blue-700" : "text-red-700"}`}>{fmt(row.Lucro)}</td>
                        <td className={`p-3 text-right ${margem >= 30 ? "text-green-600" : margem >= 15 ? "text-yellow-600" : "text-red-600"}`}>{fmtPct(margem)}</td>
                        <td className="p-3 text-right font-mono text-yellow-700">{row.Meta > 0 ? fmt(row.Meta) : "—"}</td>
                        <td className="p-3 text-right">
                          {pct !== null ? (
                            <span className={`font-bold ${pct >= 100 ? "text-green-700" : pct >= 80 ? "text-yellow-700" : "text-red-700"}`}>{fmtPct(pct)}</span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-100 font-bold border-t-2">
                    <td className="p-3">Total</td>
                    <td className="p-3 text-right font-mono text-green-700">{fmt(receitaAno)}</td>
                    <td className="p-3 text-right font-mono text-red-700">{fmt(despesaAno)}</td>
                    <td className={`p-3 text-right font-mono ${lucroAno >= 0 ? "text-blue-700" : "text-red-700"}`}>{fmt(lucroAno)}</td>
                    <td className={`p-3 text-right ${receitaAno > 0 && (lucroAno / receitaAno) * 100 >= 15 ? "text-green-600" : "text-red-600"}`}>{receitaAno > 0 ? fmtPct((lucroAno / receitaAno) * 100) : "—"}</td>
                    <td className="p-3 text-right font-mono text-yellow-700">{fmt(metas?.reduce((s: number, m: any) => s + parseFloat(m.metaReceita || "0"), 0) ?? 0)}</td>
                    <td className="p-3 text-right">—</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>

        {/* ── Gráfico: Receita x Despesa x Meta ── */}
        <section className="print:break-inside-avoid">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Receita x Despesa x Meta — {ano}</h2>
          <Card>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={graficoDre} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => fmt(Number(v))} />
                  <Legend />
                  <Bar dataKey="Receita" fill="#22c55e" radius={[3,3,0,0]} />
                  <Bar dataKey="Despesa" fill="#ef4444" radius={[3,3,0,0]} />
                  <Line type="monotone" dataKey="Meta" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </section>

        {/* ── Gráfico: Lucro mensal ── */}
        <section className="print:break-inside-avoid">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Lucro Mensal — {ano}</h2>
          <Card>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={graficoDre} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => fmt(Number(v))} />
                  <Line type="monotone" dataKey="Lucro" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </section>

        {/* ── DRE do mês ── */}
        <section className="print:break-inside-avoid">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">DRE — {MESES[mes-1]} {ano}</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Receitas */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-green-700">Receitas</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <tbody>
                    {CATEGORIAS_RECEITA.map((c, i) => {
                      const v = getVal(lancMes, "RECEITA", c.cat, c.sub);
                      return (
                        <tr key={i} className={`border-b ${c.sub ? "bg-gray-50/50 text-xs" : ""}`}>
                          <td className={`p-2 ${c.sub ? "pl-6 text-gray-500" : "font-medium"}`}>{c.sub ? `└ ${c.sub}` : c.cat}</td>
                          <td className="p-2 text-right font-mono text-green-700">{v > 0 ? fmt(v) : "—"}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-green-50 font-bold">
                      <td className="p-2 text-green-800">Receita Líquida</td>
                      <td className="p-2 text-right font-mono text-green-800">{fmt(receitaLiquidaMes)}</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
            {/* Despesas */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-red-700">Despesas</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <tbody>
                    {CATEGORIAS_DESPESA.map((c, i) => {
                      const v = getVal(lancMes, "DESPESA", c.cat, c.sub);
                      return (
                        <tr key={i} className="border-b">
                          <td className="p-2">{c.cat}</td>
                          <td className="p-2 text-right font-mono text-red-700">{v > 0 ? fmt(v) : "—"}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-red-50 font-bold">
                      <td className="p-2 text-red-800">Total Despesas</td>
                      <td className="p-2 text-right font-mono text-red-800">{fmt(despesaMes)}</td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
          {/* Resultado */}
          <Card className="mt-2" style={{ borderLeft: `4px solid ${lucroMes >= 0 ? "#3b82f6" : "#ef4444"}` }}>
            <CardContent className="py-3 flex items-center justify-between">
              <span className="font-bold text-gray-700">Resultado do Mês</span>
              <span className={`text-xl font-black ${lucroMes >= 0 ? "text-blue-700" : "text-red-700"}`}>{fmt(lucroMes)}</span>
            </CardContent>
          </Card>
        </section>

        {/* ── DRE Comparativo Anual ── */}
        <section className="print:break-inside-avoid">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">DRE Comparativo Mensal — {ano}</h2>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="p-2 text-left font-semibold">Categoria</th>
                    {MESES_ABR.map(m => <th key={m} className="p-2 text-right font-semibold">{m}</th>)}
                    <th className="p-2 text-right font-semibold text-blue-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b bg-green-50/50">
                    <td colSpan={14} className="p-1.5 font-bold text-green-800 text-xs">RECEITAS</td>
                  </tr>
                  {CATEGORIAS_RECEITA.map((c, i) => {
                    const vals = MESES_ABR.map((_, mi) => {
                      const lancs = lancAno.filter((l: any) => l.mes === mi + 1);
                      return getVal(lancs, "RECEITA", c.cat, c.sub);
                    });
                    const total = vals.reduce((s, v) => s + v, 0);
                    return (
                      <tr key={i} className={`border-b ${c.sub ? "bg-gray-50/30 text-gray-500" : ""}`}>
                        <td className={`p-1.5 ${c.sub ? "pl-5" : "font-medium"}`}>{c.sub ? `└ ${c.sub}` : c.cat}</td>
                        {vals.map((v, mi) => (
                          <td key={mi} className="p-1.5 text-right text-green-700">{v > 0 ? `${(v/1000).toFixed(0)}k` : "—"}</td>
                        ))}
                        <td className="p-1.5 text-right font-bold text-green-700">{total > 0 ? fmt(total) : "—"}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-b bg-red-50/50">
                    <td colSpan={14} className="p-1.5 font-bold text-red-800 text-xs">DESPESAS</td>
                  </tr>
                  {CATEGORIAS_DESPESA.map((c, i) => {
                    const vals = MESES_ABR.map((_, mi) => {
                      const lancs = lancAno.filter((l: any) => l.mes === mi + 1);
                      return getVal(lancs, "DESPESA", c.cat, c.sub);
                    });
                    const total = vals.reduce((s, v) => s + v, 0);
                    return (
                      <tr key={i} className="border-b">
                        <td className="p-1.5">{c.cat}</td>
                        {vals.map((v, mi) => (
                          <td key={mi} className="p-1.5 text-right text-red-700">{v > 0 ? `${(v/1000).toFixed(0)}k` : "—"}</td>
                        ))}
                        <td className="p-1.5 text-right font-bold text-red-700">{total > 0 ? fmt(total) : "—"}</td>
                      </tr>
                    );
                  })}
                  {/* Linha de lucro */}
                  <tr className="bg-blue-50 font-bold">
                    <td className="p-1.5 text-blue-800">Lucro</td>
                    {MESES_ABR.map((_, mi) => {
                      const lancs = lancAno.filter((l: any) => l.mes === mi + 1);
                      const rec = getVal(lancs, "RECEITA", "Comissões Total", null) - getVal(lancs, "RECEITA", "(-) Estornos", null);
                      const desp = CATEGORIAS_DESPESA.reduce((s, c) => s + getVal(lancs, "DESPESA", c.cat, c.sub), 0);
                      const luc = rec - desp;
                      return <td key={mi} className={`p-1.5 text-right ${luc >= 0 ? "text-blue-700" : "text-red-700"}`}>{luc !== 0 ? `${(luc/1000).toFixed(0)}k` : "—"}</td>;
                    })}
                    <td className="p-1.5 text-right text-blue-800">{fmt(lucroAno)}</td>
                  </tr>
                  {/* Linha de meta */}
                  <tr className="bg-yellow-50">
                    <td className="p-1.5 text-yellow-800 font-medium">Meta Receita</td>
                    {MESES_ABR.map((_, mi) => {
                      const meta = metas?.find((m: any) => m.mes === mi + 1);
                      const v = meta ? parseFloat(meta.metaReceita) : 0;
                      return <td key={mi} className="p-1.5 text-right text-yellow-700">{v > 0 ? `${(v/1000).toFixed(0)}k` : "—"}</td>;
                    })}
                    <td className="p-1.5 text-right text-yellow-800 font-bold">
                      {fmt(metas?.filter((m: any) => m.mes > 0).reduce((s: number, m: any) => s + parseFloat(m.metaReceita || "0"), 0) ?? 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>

        {/* ── Gastos por categoria + gráfico pizza ── */}
        <section className="print:break-inside-avoid">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Gastos por Categoria — {MESES[mes-1]}</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="p-3 text-left font-medium">Categoria</th>
                      <th className="p-3 text-right font-medium">Valor</th>
                      <th className="p-3 text-right font-medium">% Despesa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gastosCat.map((c, i) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="p-3 flex items-center gap-2">
                          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: CORES[i % CORES.length] }} />
                          {c.nome}
                        </td>
                        <td className="p-3 text-right font-mono text-red-700">{fmt(c.valor)}</td>
                        <td className="p-3 text-right text-gray-500">{despesaMes > 0 ? fmtPct((c.valor/despesaMes)*100) : "—"}</td>
                      </tr>
                    ))}
                    {gastosCat.length === 0 && (
                      <tr><td colSpan={3} className="p-6 text-center text-gray-400">Sem despesas no DRE deste mês</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 flex items-center justify-center">
                {gastosCat.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={gastosCat} dataKey="valor" nameKey="nome" cx="50%" cy="50%" outerRadius={90} label={({ nome, percent }) => `${nome.split(" ")[0]} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                        {gastosCat.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-gray-400 text-sm py-8">Sem dados</div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ── Carteira x Angariação ── */}
        <section className="print:break-inside-avoid">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Carteira x Angariação — {ano}</h2>
          <Card>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={graficoCarteira} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => fmt(Number(v))} />
                  <Legend />
                  <Bar dataKey="Carteira" fill="#8b5cf6" radius={[3,3,0,0]} />
                  <Bar dataKey="Angariação" fill="#f59e0b" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </section>

        {/* ── Contas a Pagar por categoria ── */}
        <section className="print:break-inside-avoid">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Contas a Pagar — {MESES[mes-1]}</h2>
          <div className="grid md:grid-cols-3 gap-3 mb-3">
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <div className="text-xs text-green-600 font-semibold mb-1">Total Pago</div>
              <div className="text-xl font-bold text-green-700">{fmt(totalPago)}</div>
            </div>
            <div className="bg-yellow-50 rounded-xl p-4 text-center">
              <div className="text-xs text-yellow-600 font-semibold mb-1">Pendente</div>
              <div className="text-xl font-bold text-yellow-700">{fmt(totalPendente)}</div>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <div className="text-xs text-blue-600 font-semibold mb-1">Total Lançamentos</div>
              <div className="text-xl font-bold text-blue-700">{contasMes?.length ?? 0}</div>
            </div>
          </div>
          {contasPorCat.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="p-3 text-left font-medium">Categoria</th>
                      <th className="p-3 text-right font-medium text-green-700">Pago</th>
                      <th className="p-3 text-right font-medium text-yellow-700">Pendente</th>
                      <th className="p-3 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contasPorCat.map((c, i) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="p-3">{c.cat}</td>
                        <td className="p-3 text-right font-mono text-green-700">{c.pago > 0 ? fmt(c.pago) : "—"}</td>
                        <td className="p-3 text-right font-mono text-yellow-700">{c.pendente > 0 ? fmt(c.pendente) : "—"}</td>
                        <td className="p-3 text-right font-mono font-medium">{fmt(c.pago + c.pendente)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </section>

        {/* ── Movimentação Real (Contas + Extrato) ── */}
        <section className="print:break-inside-avoid">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Movimentação Real — {MESES[mes-1]}</h2>
          {(() => {
            const extratoSaidasReal = (lancamentosExtrato as any[])
              .filter((l: any) => l.tipo === "Saída")
              .reduce((s: number, l: any) => s + parseFloat(l.valor ?? "0"), 0);
            const totalSaidas = totalPago;
            const totalEntradas = receitaMes;
            const saldo = totalEntradas - totalSaidas;
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <div className="text-xs text-green-600 font-semibold mb-1">Total Entradas</div>
                    <div className="text-lg font-bold text-green-700">{fmt(totalEntradas)}</div>
                    <div className="text-xs text-gray-400 mt-1">DRE — Comissões do mês</div>
                  </div>
                  <div className="bg-red-50 rounded-xl p-4 text-center">
                    <div className="text-xs text-red-600 font-semibold mb-1">Total Saídas</div>
                    <div className="text-lg font-bold text-red-700">{fmt(totalSaidas)}</div>
                    <div className="text-xs text-gray-400 mt-1">Contas a Pagar</div>
                  </div>
                  <div className={`rounded-xl p-4 text-center ${saldo >= 0 ? "bg-blue-50" : "bg-orange-50"}`}>
                    <div className={`text-xs font-semibold mb-1 ${saldo >= 0 ? "text-blue-600" : "text-orange-600"}`}>Saldo</div>
                    <div className={`text-lg font-bold ${saldo >= 0 ? "text-blue-700" : "text-red-700"}`}>{fmt(saldo)}</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <div className="text-xs text-gray-600 font-semibold mb-1">Extrato Bancário</div>
                    {extratoMes ? (
                      <>
                        <div className="text-sm font-bold text-gray-700">{extratoMes.totalLancamentos} lançamentos</div>
                        <Badge className={`text-xs mt-1 ${extratoMes.confirmado ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {extratoMes.confirmado ? "Confirmado" : "Pendente"}
                        </Badge>
                      </>
                    ) : <div className="text-xs text-gray-400 mt-2">Não importado</div>}
                  </div>
                </div>
              </div>
            );
          })()}
        </section>

        {/* ── Comissões por Corretor ── */}
        {resumoCorretores && resumoCorretores.length > 0 && (
          <section className="print:break-inside-avoid">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Comissões por Corretor — {MESES[mes-1]}</h2>
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="p-3 text-left font-medium">Corretor</th>
                      <th className="p-3 text-right font-medium">Recebido</th>
                      <th className="p-3 text-right font-medium">Pendente</th>
                      <th className="p-3 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumoCorretores.map((c: any, i: number) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-medium">{c.vendedor || c.nomeVendedor || "—"}</td>
                        <td className="p-3 text-right font-mono text-green-700">{fmt(parseFloat(c.recebido ?? c.totalRecebido ?? "0"))}</td>
                        <td className="p-3 text-right font-mono text-yellow-700">{fmt(parseFloat(c.pendente ?? c.totalPendente ?? "0"))}</td>
                        <td className="p-3 text-right font-mono font-bold">{fmt(parseFloat(c.total ?? "0"))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </section>
        )}

        {/* ── Inadimplência ── */}
        {metricasInadimpl && (
          <section className="print:break-inside-avoid">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Inadimplência — {MESES[mes-1]}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-orange-50 rounded-xl p-4 text-center">
                <div className="text-xs text-orange-600 font-semibold mb-1">Total Clientes</div>
                <div className="text-xl font-bold text-orange-700">{metricasInadimpl.total ?? 0}</div>
              </div>
              <div className="bg-red-50 rounded-xl p-4 text-center">
                <div className="text-xs text-red-600 font-semibold mb-1">Valor Total</div>
                <div className="text-xl font-bold text-red-700">{fmt(parseFloat(metricasInadimpl.valorTotal ?? "0"))}</div>
              </div>
              <div className="bg-yellow-50 rounded-xl p-4 text-center">
                <div className="text-xs text-yellow-600 font-semibold mb-1">Em Negociação</div>
                <div className="text-xl font-bold text-yellow-700">{metricasInadimpl.emNegociacao ?? 0}</div>
              </div>
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <div className="text-xs text-green-600 font-semibold mb-1">Resolvidos</div>
                <div className="text-xl font-bold text-green-700">{metricasInadimpl.resolvidos ?? 0}</div>
              </div>
            </div>
          </section>
        )}

        {/* ── Projeções ── */}
        <section className="print:break-inside-avoid">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Metas — {ano}</h2>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="p-3 text-left font-medium">Mês</th>
                    <th className="p-3 text-right font-medium">Meta Vendas</th>
                    <th className="p-3 text-right font-medium">Vendas Real</th>
                    <th className="p-3 text-right font-medium">% Vendas</th>
                    <th className="p-3 text-right font-medium">Meta Carteira</th>
                    <th className="p-3 text-right font-medium">Comissão Total (DRE)</th>
                    <th className="p-3 text-right font-medium">% Carteira</th>
                  </tr>
                </thead>
                <tbody>
                  {MESES.map((m, i) => {
                    const idx = i + 1;
                    const meta = metas?.find((mm: any) => mm.mes === idx);
                    if (!meta) return null;
                    const metaVendas = parseFloat(meta.metaReceita || "0");
                    const vendasReal = Number((resumoVendas as any[]).find((v: any) => Number(v.mes) === idx)?.faturamento || 0);
                    const pctVendas = metaVendas > 0 ? (vendasReal / metaVendas) * 100 : 0;
                    const lancs = lancAno.filter((l: any) => l.mes === idx);
                    const carteiraReal = getVal(lancs, "RECEITA", "Comissões Total", null);
                    const metaCarteira = parseFloat(meta.metaCarteira || "0");
                    const pctCarteira = metaCarteira > 0 ? (carteiraReal / metaCarteira) * 100 : 0;
                    return (
                      <tr key={i} className={`border-b ${idx === mes ? "bg-blue-50/50" : "hover:bg-gray-50"}`}>
                        <td className="p-3 font-medium">{m}</td>
                        <td className="p-3 text-right text-yellow-700">{metaVendas > 0 ? fmt(metaVendas) : "—"}</td>
                        <td className="p-3 text-right font-mono">{vendasReal > 0 ? fmt(vendasReal) : "—"}</td>
                        <td className="p-3 text-right">
                          {metaVendas > 0 && vendasReal > 0 ? (
                            <span className={`font-bold ${pctVendas >= 100 ? "text-green-700" : pctVendas >= 80 ? "text-yellow-700" : "text-red-700"}`}>{fmtPct(pctVendas)}</span>
                          ) : "—"}
                        </td>
                        <td className="p-3 text-right text-purple-700">{metaCarteira > 0 ? fmt(metaCarteira) : "—"}</td>
                        <td className="p-3 text-right font-mono">{carteiraReal > 0 ? fmt(carteiraReal) : "—"}</td>
                        <td className="p-3 text-right">
                          {metaCarteira > 0 && carteiraReal > 0 ? (
                            <span className={`font-bold ${pctCarteira >= 100 ? "text-green-700" : pctCarteira >= 80 ? "text-yellow-700" : "text-red-700"}`}>{fmtPct(pctCarteira)}</span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>

      </div>

      <style>{`
        @media print {
          nav, aside, button, .print\\:hidden { display: none !important; }
          body { background: white; }
          .print\\:break-inside-avoid { break-inside: avoid; }
        }
      `}</style>

      {/* ── Modais de detalhe ── */}
      <Dialog open={modal === "despesa-barcellos"} onOpenChange={() => setModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Despesa Barcellos — {MESES[mes-1]}</DialogTitle></DialogHeader>
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gray-50"><th className="p-2 text-left">Categoria</th><th className="p-2 text-right text-green-700">Pago</th><th className="p-2 text-right text-yellow-700">Pendente</th><th className="p-2 text-right">Total</th></tr></thead>
            <tbody>
              {contasPorCat.filter(c => !["ELISIA","ANDERSON","NAYARA","BARCELLOS"].includes(c.cat)).map((c, i) => (
                <tr key={i} className="border-b"><td className="p-2">{c.cat}</td><td className="p-2 text-right font-mono text-green-700">{c.pago > 0 ? fmt(c.pago) : "—"}</td><td className="p-2 text-right font-mono text-yellow-700">{c.pendente > 0 ? fmt(c.pendente) : "—"}</td><td className="p-2 text-right font-mono font-bold">{fmt(c.pago + c.pendente)}</td></tr>
              ))}
              <tr className="bg-red-50 font-bold"><td className="p-2 text-red-800">Total</td><td className="p-2 text-right font-mono text-green-700">{fmt(despesaBarcellos)}</td><td className="p-2 text-right font-mono text-yellow-700">{fmt(totalPendente)}</td><td className="p-2 text-right font-mono text-red-800">{fmt(despesaBarcellos + totalPendente)}</td></tr>
            </tbody>
          </table>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "lucro"} onOpenChange={() => setModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Lucro Líquido — {MESES[mes-1]}</DialogTitle></DialogHeader>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b"><td className="p-2 text-gray-600">Receita Bruta</td><td className="p-2 text-right font-mono font-bold text-green-700">{fmt(receitaMes)}</td></tr>
              <tr className="border-b"><td className="p-2 text-gray-600">Despesa Barcellos</td><td className="p-2 text-right font-mono font-bold text-red-700">− {fmt(despesaBarcellos)}</td></tr>
              <tr className="border-b"><td className="p-2 text-gray-600">Distribuição Sócios</td><td className="p-2 text-right font-mono text-purple-700">− {fmt(totalDistribuicao)}</td></tr>
              <tr className="bg-blue-50 font-bold"><td className="p-2 text-blue-800">Lucro Líquido</td><td className={`p-2 text-right font-mono text-xl ${lucroMes >= 0 ? "text-blue-700" : "text-red-700"}`}>{fmt(lucroMes)}</td></tr>
              <tr><td className="p-2 text-xs text-gray-400" colSpan={2}>Margem: {fmtPct(margemMes)}</td></tr>
            </tbody>
          </table>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "despesas-pagas"} onOpenChange={() => setModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Contas a Pagar — {MESES[mes-1]}</DialogTitle></DialogHeader>
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gray-50"><th className="p-2 text-left">Categoria</th><th className="p-2 text-right text-green-700">Pago</th><th className="p-2 text-right text-yellow-700">Pendente</th><th className="p-2 text-right">Total</th></tr></thead>
            <tbody>
              {contasPorCat.map((c, i) => (
                <tr key={i} className="border-b"><td className="p-2">{c.cat}</td><td className="p-2 text-right font-mono text-green-700">{c.pago > 0 ? fmt(c.pago) : "—"}</td><td className="p-2 text-right font-mono text-yellow-700">{c.pendente > 0 ? fmt(c.pendente) : "—"}</td><td className="p-2 text-right font-mono font-bold">{fmt(c.pago + c.pendente)}</td></tr>
              ))}
              <tr className="bg-cyan-50 font-bold"><td className="p-2 text-cyan-800">Total</td><td className="p-2 text-right font-mono text-green-700">{fmt(totalPago)}</td><td className="p-2 text-right font-mono text-yellow-700">{fmt(totalPendente)}</td><td className="p-2 text-right font-mono text-cyan-800">{fmt(totalPago + totalPendente)}</td></tr>
            </tbody>
          </table>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "pendentes"} onOpenChange={() => setModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Pendentes a Pagar — {MESES[mes-1]}</DialogTitle></DialogHeader>
          {totalPendente === 0 ? (
            <p className="text-center text-gray-400 py-6">Nenhuma conta pendente</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-gray-50"><th className="p-2 text-left">Categoria</th><th className="p-2 text-right text-yellow-700">Pendente</th></tr></thead>
              <tbody>
                {contasPorCat.filter(c => c.pendente > 0).map((c, i) => (
                  <tr key={i} className="border-b"><td className="p-2">{c.cat}</td><td className="p-2 text-right font-mono text-yellow-700">{fmt(c.pendente)}</td></tr>
                ))}
                <tr className="bg-yellow-50 font-bold"><td className="p-2 text-yellow-800">Total Pendente</td><td className="p-2 text-right font-mono text-yellow-800">{fmt(totalPendente)}</td></tr>
              </tbody>
            </table>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "receita"} onOpenChange={() => setModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Receita Bruta — {MESES[mes-1]}</DialogTitle></DialogHeader>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b"><td className="p-2 text-gray-600">Comissões Carteira</td><td className="p-2 text-right font-mono text-green-700">{fmt(getVal(lancMes, "RECEITA", "Comissões Total", "Carteira"))}</td></tr>
              <tr className="border-b"><td className="p-2 text-gray-600">Comissões Angariação</td><td className="p-2 text-right font-mono text-green-700">{fmt(getVal(lancMes, "RECEITA", "Comissões Total", "Angariação"))}</td></tr>
              <tr className="border-b"><td className="p-2 text-gray-600">(-) Estornos</td><td className="p-2 text-right font-mono text-red-600">− {fmt(estornosMes)}</td></tr>
              <tr className="bg-green-50 font-bold"><td className="p-2 text-green-800">Receita Bruta</td><td className="p-2 text-right font-mono text-green-800 text-lg">{fmt(receitaMes)}</td></tr>
            </tbody>
          </table>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "receita-acumulada"} onOpenChange={() => setModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Receita Acumulada — {ano}</DialogTitle></DialogHeader>
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gray-50"><th className="p-2 text-left">Mês</th><th className="p-2 text-right text-green-700">Receita</th><th className="p-2 text-right text-red-700">Despesa</th><th className="p-2 text-right text-blue-700">Lucro</th></tr></thead>
            <tbody>
              {MESES_ABR.map((m, i) => {
                const lancs = lancAno.filter((l: any) => l.mes === i + 1);
                const rec = getVal(lancs, "RECEITA", "Comissões Total", null);
                const desp = CATEGORIAS_DESPESA.reduce((s, c) => s + getVal(lancs, "DESPESA", c.cat, c.sub), 0);
                const luc = rec - desp;
                if (rec === 0 && desp === 0) return null;
                return (
                  <tr key={i} className="border-b">
                    <td className="p-2">{m}</td>
                    <td className="p-2 text-right font-mono text-green-700">{rec > 0 ? fmt(rec) : "—"}</td>
                    <td className="p-2 text-right font-mono text-red-700">{desp > 0 ? fmt(desp) : "—"}</td>
                    <td className={`p-2 text-right font-mono font-bold ${luc >= 0 ? "text-blue-700" : "text-red-700"}`}>{rec > 0 || desp > 0 ? fmt(luc) : "—"}</td>
                  </tr>
                );
              })}
              <tr className="bg-green-50 font-bold"><td className="p-2 text-green-800">Total</td><td className="p-2 text-right font-mono text-green-800">{fmt(receitaAno)}</td><td className="p-2 text-right font-mono text-red-700">{fmt(despesaAno)}</td><td className={`p-2 text-right font-mono ${lucroAno >= 0 ? "text-blue-800" : "text-red-800"}`}>{fmt(lucroAno)}</td></tr>
            </tbody>
          </table>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === "lucro-acumulado"} onOpenChange={() => setModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Lucro Acumulado — {ano}</DialogTitle></DialogHeader>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b"><td className="p-2 text-gray-600">Receita Acumulada</td><td className="p-2 text-right font-mono font-bold text-green-700">{fmt(receitaAno)}</td></tr>
              <tr className="border-b"><td className="p-2 text-gray-600">Despesas Acumuladas</td><td className="p-2 text-right font-mono font-bold text-red-700">− {fmt(despesaAno)}</td></tr>
              <tr className="bg-blue-50 font-bold"><td className="p-2 text-blue-800">Lucro Acumulado</td><td className={`p-2 text-right font-mono text-xl ${lucroAno >= 0 ? "text-blue-700" : "text-red-700"}`}>{fmt(lucroAno)}</td></tr>
              {receitaAno > 0 && <tr><td className="p-2 text-xs text-gray-400" colSpan={2}>Margem: {fmtPct((lucroAno / receitaAno) * 100)}</td></tr>}
            </tbody>
          </table>
        </DialogContent>
      </Dialog>

    </AppLayout>
  );
}

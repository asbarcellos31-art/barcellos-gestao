import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Target, BarChart2, Activity, Edit2, Check, X, Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// ─── Cores ────────────────────────────────────────────────────────────────────
const COR_RECEITA = "#22c55e";
const COR_DESPESA = "#ef4444";
const COR_LUCRO = "#3b82f6";
const COR_CARTEIRA = "#8b5cf6";
const COR_ANGARIACAO = "#f59e0b";
const CORES_GRAFICO = ["#3b82f6","#8b5cf6","#22c55e","#f59e0b","#ef4444","#06b6d4","#ec4899"];

// ─── Projeções (dados estáticos da planilha) ──────────────────────────────────
const PROJECOES = {
  premissas: {
    receitaBase2025: 2080000,
    cagrHistorico: 0.09361495605939729,
    taxaPessimista: 0.05,
    taxaRealista: 0.09361495605939729,
    taxaOtimista: 0.15,
    participacaoCarteira: 0.97,
    participacaoAngariacao: 0.03,
  },
  pessimista: [
    { ano: 2026, receita: 2184000, carteira: 2118480, angariacao: 65520, margem: 0.64, lucro: 1397760 },
    { ano: 2027, receita: 2293200, carteira: 2224404, angariacao: 68796, margem: 0.64, lucro: 1467648 },
    { ano: 2028, receita: 2407860, carteira: 2335624, angariacao: 72236, margem: 0.66, lucro: 1589188 },
    { ano: 2029, receita: 2528253, carteira: 2452405, angariacao: 75848, margem: 0.67, lucro: 1693930 },
    { ano: 2030, receita: 2654666, carteira: 2575026, angariacao: 79640, margem: 0.68, lucro: 1805173 },
  ],
  realista: [
    { ano: 2026, receita: 2274719, carteira: 2206478, angariacao: 68242, margem: 0.64, lucro: 1455820 },
    { ano: 2027, receita: 2487667, carteira: 2413037, angariacao: 74630, margem: 0.70, lucro: 1741367 },
    { ano: 2028, receita: 2720550, carteira: 2638933, angariacao: 81617, margem: 0.70, lucro: 1904385 },
    { ano: 2029, receita: 2975234, carteira: 2885977, angariacao: 89257, margem: 0.73, lucro: 2171921 },
    { ano: 2030, receita: 3253760, carteira: 3156147, angariacao: 97613, margem: 0.74, lucro: 2407783 },
  ],
  otimista: [
    { ano: 2026, receita: 2392000, carteira: 2320240, angariacao: 71760, margem: 0.64, lucro: 1530880 },
    { ano: 2027, receita: 2750800, carteira: 2668276, angariacao: 82524, margem: 0.72, lucro: 1980576 },
    { ano: 2028, receita: 3163420, carteira: 3068517, angariacao: 94903, margem: 0.74, lucro: 2340931 },
    { ano: 2029, receita: 3637933, carteira: 3528795, angariacao: 109138, margem: 0.74, lucro: 2692070 },
    { ano: 2030, receita: 4183623, carteira: 4058114, angariacao: 125509, margem: 0.76, lucro: 3179553 },
  ],
};

// ─── Indicadores (dados da planilha) ─────────────────────────────────────────
const INDICADORES_FINANCEIROS = [
  { nome: "Margem de Lucro Líquido", formula: "Lucro Líq. / Receita", valor: 0.6268, benchmark: "30%+", status: "🟢" },
  { nome: "Participação Carteira", formula: "Carteira / Receita Total", valor: 0.9749, benchmark: ">90%", status: "🟢" },
  { nome: "Participação Angariação", formula: "Angariação / Receita Total", valor: 0.0251, benchmark: "<10%", status: "🟢" },
  { nome: "Crescimento YoY (2025)", formula: "(Receita Atual - Anterior) / Anterior", valor: 0.2235, benchmark: ">15%", status: "🟢" },
  { nome: "CAGR 10 anos", formula: "(Receita Final / Inicial)^(1/n) - 1", valor: 0.0936, benchmark: ">8%", status: "🟢" },
];
const INDICADORES_OPERACIONAIS = [
  { nome: "Eficiência Operacional", formula: "Despesas / Receita", valor: 0.2625, benchmark: "<30%", status: "🟢" },
  { nome: "Custo por Real Faturado", formula: "Despesas Totais / Receita", valor: 0.2625, benchmark: "<R$ 0,30", status: "🟢" },
  { nome: "ROI (Retorno s/ Invest.)", formula: "Lucro Líquido / Investimentos", valor: 2.3877, benchmark: ">200%", status: "🟢" },
];

// ─── Categorias DRE ───────────────────────────────────────────────────────────
const CATEGORIAS_RECEITA = [
  { cat: "Comissões Total", sub: null },
  { cat: "Comissões Total", sub: "Angariação" },
  { cat: "Comissões Total", sub: "Carteira" },
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getValor(lancamentos: any[], tipo: string, categoria: string, sub?: string | null) {
  const row = lancamentos.find(
    (l) => l.tipo === tipo && l.categoria === categoria &&
      (sub === undefined ? true : (sub === null ? l.subcategoria === null : l.subcategoria === sub))
  );
  return row ? parseFloat(row.valor) : 0;
}

function StatusBadge({ pct }: { pct: number }) {
  if (pct >= 0.9) return <Badge className="bg-green-100 text-green-800">🟢 Ótimo</Badge>;
  if (pct >= 0.7) return <Badge className="bg-yellow-100 text-yellow-800">🟡 Bom</Badge>;
  if (pct >= 0.5) return <Badge className="bg-orange-100 text-orange-800">🟠 Regular</Badge>;
  return <Badge className="bg-red-100 text-red-800">🔴 Crítico</Badge>;
}

// ─── Aba Dashboard ────────────────────────────────────────────────────────────
function TabDashboard({ ano }: { ano: number }) {
  const { data: historico } = trpc.financeiro.historicoAnual.useQuery();
  const { data: metas } = trpc.financeiro.metasPorAno.useQuery({ ano });
  const { data: dreAno } = trpc.financeiro.drePorAno.useQuery({ ano });

  // Calcula totais do ano a partir do DRE
  const receitaRealizada = useMemo(() => {
    if (!dreAno) return 0;
    return dreAno
      .filter((l) => l.tipo === "RECEITA" && l.categoria === "Comissões Total" && l.subcategoria === null)
      .reduce((s, l) => s + parseFloat(l.valor), 0);
  }, [dreAno]);

  const despesaTotal = useMemo(() => {
    if (!dreAno) return 0;
    return dreAno
      .filter((l) => l.tipo === "DESPESA")
      .reduce((s, l) => s + parseFloat(l.valor), 0);
  }, [dreAno]);

  const carteiraRealizada = useMemo(() => {
    if (!dreAno) return 0;
    return dreAno
      .filter((l) => l.tipo === "RECEITA" && l.subcategoria === "Carteira")
      .reduce((s, l) => s + parseFloat(l.valor), 0);
  }, [dreAno]);

  const angariacaoRealizada = useMemo(() => {
    if (!dreAno) return 0;
    return dreAno
      .filter((l) => l.tipo === "RECEITA" && l.subcategoria === "Angariação")
      .reduce((s, l) => s + parseFloat(l.valor), 0);
  }, [dreAno]);

  // Impostos reais já estão incluídos em despesaTotal (categoria "Impostos" do DRE)
  const lucroOperacional = receitaRealizada - despesaTotal;
  const lucroLiquido = lucroOperacional; // impostos já estão nas despesas

  const metaAnual = metas?.find((m) => m.mes === 0);
  const metaReceitaAnualBruta = metaAnual ? parseFloat(metaAnual.metaReceita) : 2500000;
  const metaLucroAnual = metaAnual ? parseFloat(metaAnual.metaLucro ?? "500000") : 500000;
  const metaAngariacaoAnual = metaAnual ? parseFloat(metaAnual.metaAngariacao) : 100000;

  // Usa o último mês com dados reais no DRE (não o mês do calendário)
  const anoAtualDash = new Date().getFullYear();
  const ultimoMesComDados = useMemo(() => {
    if (!dreAno || ano !== anoAtualDash) return 12;
    const mesesComReceita = dreAno
      .filter((l) => l.tipo === "RECEITA" && l.categoria === "Comissões Total" && l.subcategoria === null && parseFloat(l.valor) > 0)
      .map((l) => l.mes);
    return mesesComReceita.length > 0 ? Math.max(...mesesComReceita) : 1;
  }, [dreAno, ano, anoAtualDash]);
  const mesesDecorridosDash = ultimoMesComDados;
  const fatorProp = mesesDecorridosDash / 12;
  const metaReceita = metaReceitaAnualBruta * fatorProp;
  const metaLucro = metaLucroAnual * fatorProp;
  const metaAngariacao = metaAngariacaoAnual * fatorProp;
  const metaCarteira = metaReceita * 0.96;

  // Histórico para gráfico
  const historicoGrafico = useMemo(() => {
    if (!historico) return [];
    return historico.map((h) => ({
      ano: h.ano,
      receita: parseFloat(h.receitaTotal),
      carteira: parseFloat(h.carteira),
      angariacao: parseFloat(h.angariacao),
    }));
  }, [historico]);

  const kpis = [
    { label: "Receita Total", meta: metaReceita, metaAnual: metaReceitaAnualBruta, realizado: receitaRealizada },
    { label: "Carteira", meta: metaCarteira, metaAnual: metaReceitaAnualBruta * 0.96, realizado: carteiraRealizada },
    { label: "Angariação", meta: metaAngariacao, metaAnual: metaAngariacaoAnual, realizado: angariacaoRealizada },
    { label: "Lucro Líquido", meta: metaLucro, metaAnual: metaLucroAnual, realizado: lucroLiquido },
  ];

  const composicao = [
    { name: "Carteira", value: carteiraRealizada, pct: receitaRealizada > 0 ? carteiraRealizada / receitaRealizada : 0 },
    { name: "Angariação", value: angariacaoRealizada, pct: receitaRealizada > 0 ? angariacaoRealizada / receitaRealizada : 0 },
  ];

  const despesasPorTipo = [
    { name: "Salários", value: getValor(dreAno ?? [], "DESPESA", "Salários e Remunerações") },
    { name: "Com. Pagas", value: getValor(dreAno ?? [], "DESPESA", "Comissões Pagas") },
    { name: "Contador", value: getValor(dreAno ?? [], "DESPESA", "Contador") },
    { name: "Combustível", value: getValor(dreAno ?? [], "DESPESA", "Combustível") },
    { name: "Alimentação", value: getValor(dreAno ?? [], "DESPESA", "Alimentação") },
    { name: "Mat. Escritório", value: getValor(dreAno ?? [], "DESPESA", "Material Escritório") },
    { name: "Outras", value: getValor(dreAno ?? [], "DESPESA", "Outras Despesas") },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">📌 KPIs Principais {ano}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((k) => {
            const pct = k.meta > 0 ? k.realizado / k.meta : 0;
            return (
              <Card key={k.label}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
                  <p className="text-lg font-bold">{fmt(k.realizado)}</p>
                  <div className="flex items-center justify-between mt-1">
                    <div>
                      <p className="text-xs text-muted-foreground">Meta {ano === anoAtualDash ? `prop. (${mesesDecorridosDash}m fechados)` : 'anual'}: {fmt(k.meta)}</p>
                      {ano === anoAtualDash && <p className="text-[10px] text-muted-foreground">Meta anual: {fmt(k.metaAnual)}</p>}
                    </div>
                    <StatusBadge pct={pct} />
                  </div>
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(pct * 100, 100)}%` }} />
                  </div>
                  <p className="text-xs text-right mt-1 text-muted-foreground">{fmtPct(pct)} atingido</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Evolução Histórica */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">📈 Evolução Histórica 2015–{ano}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={historicoGrafico}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="ano" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              <Line type="monotone" dataKey="receita" name="Receita Total" stroke={COR_RECEITA} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="carteira" name="Carteira" stroke={COR_CARTEIRA} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="angariacao" name="Angariação" stroke={COR_ANGARIACAO} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Composição da Receita */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">🥧 Composição da Receita {ano}</CardTitle>
          </CardHeader>
          <CardContent>
            {receitaRealizada > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={composicao} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name, pct }) => `${name} ${fmtPct(pct)}`}>
                      {composicao.map((_, i) => <Cell key={i} fill={CORES_GRAFICO[i]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 text-xs">
                  {composicao.map((c) => (
                    <div key={c.name} className="flex justify-between">
                      <span className="text-muted-foreground">{c.name}</span>
                      <span className="font-medium">{fmt(c.value)} ({fmtPct(c.pct)})</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados de receita para {ano}</p>
            )}
          </CardContent>
        </Card>

        {/* Indicadores Chave */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">📈 Indicadores Chave</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {INDICADORES_FINANCEIROS.slice(0, 5).map((ind) => (
                <div key={ind.nome} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground truncate max-w-[140px]" title={ind.nome}>{ind.nome}</span>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{ind.nome.includes("CAGR") || ind.nome.includes("Crescimento") || ind.nome.includes("Margem") || ind.nome.includes("Participação") || ind.nome.includes("Eficiência") ? fmtPct(ind.valor) : ind.valor.toFixed(2)}</span>
                    <span>{ind.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Despesas e Lucro */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">💰 Despesas e Lucro {ano}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between border-b pb-1">
                <span className="text-muted-foreground">Total Despesas</span>
                <span className="font-medium text-red-600">{fmt(despesaTotal)}</span>
              </div>
              <div className="flex justify-between border-b pb-1">
                <span className="text-muted-foreground">Lucro Operacional</span>
                <span className="font-medium text-blue-600">{fmt(lucroOperacional)}</span>
              </div>
              <div className="flex justify-between border-b pb-1">
                <span className="text-muted-foreground">Impostos (real)</span>
                <span className="font-medium text-orange-600">{fmt(dreAno?.filter(l => l.tipo === 'DESPESA' && l.categoria === 'Impostos').reduce((s, l) => s + parseFloat(l.valor), 0) ?? 0)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm">
                <span>Lucro Líquido</span>
                <span className="text-green-600">{fmt(lucroLiquido)}</span>
              </div>
              {receitaRealizada > 0 && (
                <div className="flex justify-between text-muted-foreground pt-1">
                  <span>Margem Líquida</span>
                  <span>{fmtPct(lucroLiquido / receitaRealizada)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projeções resumidas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">📈 Projeções 2026–2030 (Resumo)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-4">Cenário</th>
                  <th className="text-right py-1 pr-4">Taxa</th>
                  <th className="text-right py-1 pr-4">Receita 2026</th>
                  <th className="text-right py-1 pr-4">Receita 2030</th>
                  <th className="text-right py-1">Variação</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "📉 Pessimista", taxa: 0.05, d: PROJECOES.pessimista },
                  { label: "📊 Realista", taxa: PROJECOES.premissas.cagrHistorico, d: PROJECOES.realista },
                  { label: "📈 Otimista", taxa: 0.15, d: PROJECOES.otimista },
                ].map((c) => (
                  <tr key={c.label} className="border-b last:border-0">
                    <td className="py-1 pr-4">{c.label}</td>
                    <td className="text-right py-1 pr-4">{fmtPct(c.taxa)}</td>
                    <td className="text-right py-1 pr-4">{fmt(c.d[0].receita)}</td>
                    <td className="text-right py-1 pr-4">{fmt(c.d[4].receita)}</td>
                    <td className="text-right py-1">{fmtPct((c.d[4].receita - c.d[0].receita) / c.d[0].receita)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Aba DRE ──────────────────────────────────────────────────────────────────
function TabDRE({ ano }: { ano: number }) {
  const utils = trpc.useUtils();
  const [editando, setEditando] = useState<string | null>(null);
  const [valoresEdit, setValoresEdit] = useState<Record<string, string>>({});
  const [autoMes, setAutoMes] = useState<number>(new Date().getMonth() || 12);
  const [autoLoading, setAutoLoading] = useState(false);
  const autoPreench = trpc.financeiro.autoPreenchimento.useQuery(
    { mes: autoMes, ano },
    { enabled: false }
  );

  const salvarDre = trpc.financeiro.salvarDre.useMutation({
    onSuccess: () => {
      utils.financeiro.drePorAno.invalidate({ ano });
      toast.success("Valor salvo!");
      setEditando(null);
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  // Busca dados para todos os meses
  const queries = Array.from({ length: 12 }, (_, i) => i + 1).map((m) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    trpc.financeiro.drePorMes.useQuery({ mes: m, ano })
  );

  const dadosPorMes = useMemo(() => {
    return queries.map((q) => q.data ?? []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map((q) => q.dataUpdatedAt).join(",")]);

  function getVal(mesIdx: number, tipo: string, cat: string, sub?: string | null) {
    return getValor(dadosPorMes[mesIdx] ?? [], tipo, cat, sub);
  }

  function totalAno(tipo: string, cat: string, sub?: string | null) {
    return dadosPorMes.reduce((s, d) => s + getValor(d, tipo, cat, sub), 0);
  }

  function handleEdit(key: string, val: number) {
    setEditando(key);
    // Inicializa com valor sem formatação para facilitar edição
    // Usa vírgula como decimal para o usuário (formato BR)
    const valStr = val > 0 ? val.toFixed(2).replace(".", ",") : "";
    setValoresEdit((prev) => ({ ...prev, [key]: valStr }));
  }

  async function handleAutoPreenchimento() {
    setAutoLoading(true);
    try {
      const result = await autoPreench.refetch();
      const d = result.data;
      if (!d) { toast.error("Sem dados para este mês"); return; }
      const saves = [
        { mes: autoMes, tipo: "RECEITA" as const, cat: "Comissões Total", sub: null, val: d.comissoesTotal },
        { mes: autoMes, tipo: "DESPESA" as const, cat: "Salários e Remunerações", sub: null, val: d.salariosRemuneracoes },
        { mes: autoMes, tipo: "DESPESA" as const, cat: "Comissões Pagas", sub: null, val: d.comissoesPagas },
        { mes: autoMes, tipo: "DESPESA" as const, cat: "Contador", sub: null, val: d.contador },
        { mes: autoMes, tipo: "DESPESA" as const, cat: "Combustível", sub: null, val: d.combustivel },
        { mes: autoMes, tipo: "DESPESA" as const, cat: "Alimentação", sub: null, val: d.alimentacao },
        { mes: autoMes, tipo: "DESPESA" as const, cat: "Material Escritório", sub: null, val: d.materialEscritorio },
        { mes: autoMes, tipo: "DESPESA" as const, cat: "Cartão de Crédito", sub: null, val: d.cartaoCredito },
        { mes: autoMes, tipo: "DESPESA" as const, cat: "Marketing", sub: null, val: d.marketing },
        { mes: autoMes, tipo: "DESPESA" as const, cat: "Luz", sub: null, val: d.luz },
        { mes: autoMes, tipo: "DESPESA" as const, cat: "Condomínio", sub: null, val: d.condominio },
        { mes: autoMes, tipo: "DESPESA" as const, cat: "Internet", sub: null, val: d.internet },
        { mes: autoMes, tipo: "DESPESA" as const, cat: "Impostos", sub: null, val: d.impostos },
      ];
      for (const s of saves) {
        await new Promise<void>((res, rej) => salvarDre.mutate(
          { mes: s.mes, ano, tipo: s.tipo, categoria: s.cat, subcategoria: s.sub, valor: s.val.toString() },
          { onSuccess: () => res(), onError: () => rej() }
        ));
      }
      utils.financeiro.drePorAno.invalidate({ ano });
      toast.success(`DRE de ${MESES[autoMes - 1]} preenchido automaticamente!`);
    } catch {
      toast.error("Erro ao preencher automaticamente");
    } finally {
      setAutoLoading(false);
    }
  }

  function handleSave(mes: number, tipo: "RECEITA" | "DESPESA", cat: string, sub: string | null) {
    const key = `${mes}-${tipo}-${cat}-${sub}`;
    let raw = (valoresEdit[key] ?? "0").replace(/\s/g, "");
    let num: number;
    if (raw.includes(",")) {
      // Formato BR com vírgula decimal: "175.000,00" ou "175000,00"
      num = parseFloat(raw.replace(/\./g, "").replace(",", "."));
    } else {
      // Sem vírgula: verifica se ponto é milhar (ex: 175.000) ou decimal (ex: 175.50)
      const partes = raw.split(".");
      if (partes.length === 2 && partes[1].length === 3) {
        // Ponto de milhar: "175.000" -> 175000
        num = parseFloat(partes.join(""));
      } else {
        // Ponto decimal normal ou número inteiro
        num = parseFloat(raw.replace(/[^0-9.]/g, ""));
      }
    }
    if (isNaN(num) || num < 0) { toast.error("Valor inválido — use apenas números"); return; }
    const valor = num.toFixed(2);
    setEditando(null);
    salvarDre.mutate(
      { mes, ano, tipo, categoria: cat, subcategoria: sub, valor },
      { onSuccess: () => utils.financeiro.drePorAno.invalidate({ ano }) }
    );
  }

  // EditableCell como função que retorna JSX diretamente (não como componente aninhado)
  // Isso evita re-mount do input ao mudar o estado editando
  function renderCell(mes: number, tipo: "RECEITA" | "DESPESA", cat: string, sub: string | null) {
    const key = `${mes}-${tipo}-${cat}-${sub}`;
    const val = getVal(mes - 1, tipo, cat, sub);
    if (editando === key) {
      return (
        <td key={key} className="text-right py-0.5 px-1">
          <div className="flex items-center gap-0.5 justify-end">
            <Input
              className="h-5 w-20 text-xs text-right px-1"
              value={valoresEdit[key] ?? ""}
              onChange={(e) => setValoresEdit((p) => ({ ...p, [key]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSave(mes, tipo, cat, sub); } if (e.key === "Escape") setEditando(null); }}
              autoFocus
            />
            <button onMouseDown={(e) => { e.preventDefault(); handleSave(mes, tipo, cat, sub); }} className="text-green-600 hover:text-green-700"><Check size={12} /></button>
            <button onClick={() => setEditando(null)} className="text-red-500 hover:text-red-600"><X size={12} /></button>
          </div>
        </td>
      );
    }
    return (
      <td
        key={key}
        className="text-right py-0.5 px-1 cursor-pointer hover:bg-muted/50 group"
        onClick={() => handleEdit(key, val)}
      >
        <span className="text-xs">{val > 0 ? fmt(val) : "—"}</span>
        <Edit2 size={9} className="inline ml-1 opacity-0 group-hover:opacity-50" />
      </td>
    );
  }

  const totalReceitasMes = (mesIdx: number) =>
    getVal(mesIdx, "RECEITA", "Comissões Total", null) - getVal(mesIdx, "RECEITA", "(-) Estornos", null);
  // Impostos já estão incluídos em CATEGORIAS_DESPESA como "Impostos"
  // totalDespesasMes já inclui impostos reais do Contas a Pagar
  const totalDespesasMes = (mesIdx: number) =>
    CATEGORIAS_DESPESA.reduce((s, c) => s + getVal(mesIdx, "DESPESA", c.cat, c.sub), 0);
  const lucroOpMes = (mesIdx: number) => totalReceitasMes(mesIdx) - totalDespesasMes(mesIdx);
  // Lucro líquido = lucro operacional (impostos já estão nas despesas)
  const lucroLiqMes = (mesIdx: number) => lucroOpMes(mesIdx);

  const totalReceitasAno = Array.from({ length: 12 }, (_, i) => totalReceitasMes(i)).reduce((a, b) => a + b, 0);
  const totalDespesasAno = Array.from({ length: 12 }, (_, i) => totalDespesasMes(i)).reduce((a, b) => a + b, 0);
  const lucroOpAno = totalReceitasAno - totalDespesasAno;
  const lucroLiqAno = lucroOpAno;

  const MESES_NOMES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Edit2 size={12} />
          <span>Clique em qualquer célula para editar o valor</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Auto-preencher mês:</span>
          <select
            className="text-xs border rounded px-2 py-1 bg-background"
            value={autoMes}
            onChange={(e) => setAutoMes(Number(e.target.value))}
          >
            {MESES_NOMES.map((m, i) => (
              <option key={i} value={i + 1}>{m}/{ano}</option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs h-7 border-purple-300 text-purple-700 hover:bg-purple-50"
            onClick={handleAutoPreenchimento}
            disabled={autoLoading}
          >
            {autoLoading ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            Preencher do Contas a Pagar
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left py-2 px-3 font-semibold sticky left-0 bg-muted/50 min-w-[200px]">DESCRIÇÃO</th>
              {MESES.map((m) => <th key={m} className="text-right py-2 px-2 font-semibold min-w-[80px]">{m}</th>)}
              <th className="text-right py-2 px-2 font-semibold min-w-[90px] bg-muted">TOTAL ANO</th>
            </tr>
          </thead>
          <tbody>
            {/* RECEITAS */}
            <tr className="bg-green-50 dark:bg-green-950/20">
              <td colSpan={14} className="py-1.5 px-3 font-bold text-green-700 dark:text-green-400">(+) RECEITAS</td>
            </tr>
            {CATEGORIAS_RECEITA.map(({ cat, sub }) => (
              <tr key={`${cat}-${sub}`} className="border-b hover:bg-muted/20">
                <td className={`py-0.5 px-3 sticky left-0 bg-background ${sub ? "pl-6 text-muted-foreground" : "font-medium"}`}>
                  {sub ? `↳ ${sub}` : cat}
                </td>
                {Array.from({ length: 12 }, (_, i) => renderCell(i + 1, "RECEITA", cat, sub))}
                <td className="text-right py-0.5 px-2 font-medium bg-muted/30">{totalAno("RECEITA", cat, sub) > 0 ? fmt(totalAno("RECEITA", cat, sub)) : "—"}</td>
              </tr>
            ))}
            <tr className="bg-green-100 dark:bg-green-900/30 font-bold">
              <td className="py-1.5 px-3 sticky left-0 bg-green-100 dark:bg-green-900/30">(=) RECEITA LÍQUIDA</td>
              {Array.from({ length: 12 }, (_, i) => (
                <td key={i} className="text-right py-1.5 px-2 text-green-700 dark:text-green-400">{totalReceitasMes(i) > 0 ? fmt(totalReceitasMes(i)) : "—"}</td>
              ))}
              <td className="text-right py-1.5 px-2 text-green-700 dark:text-green-400 bg-muted/30">{fmt(totalReceitasAno)}</td>
            </tr>

            {/* DESPESAS */}
            <tr className="bg-red-50 dark:bg-red-950/20">
              <td colSpan={14} className="py-1.5 px-3 font-bold text-red-700 dark:text-red-400">(-) DESPESAS OPERACIONAIS</td>
            </tr>
            {CATEGORIAS_DESPESA.map(({ cat, sub }) => (
              <tr key={`${cat}-${sub}`} className="border-b hover:bg-muted/20">
                <td className="py-0.5 px-3 sticky left-0 bg-background">{cat}</td>
                {Array.from({ length: 12 }, (_, i) => renderCell(i + 1, "DESPESA", cat, sub))}
                <td className="text-right py-0.5 px-2 font-medium bg-muted/30">{totalAno("DESPESA", cat, sub) > 0 ? fmt(totalAno("DESPESA", cat, sub)) : "—"}</td>
              </tr>
            ))}
            <tr className="bg-red-100 dark:bg-red-900/30 font-bold">
              <td className="py-1.5 px-3 sticky left-0 bg-red-100 dark:bg-red-900/30">(=) TOTAL DESPESAS</td>
              {Array.from({ length: 12 }, (_, i) => (
                <td key={i} className="text-right py-1.5 px-2 text-red-700 dark:text-red-400">{totalDespesasMes(i) > 0 ? fmt(totalDespesasMes(i)) : "—"}</td>
              ))}
              <td className="text-right py-1.5 px-2 text-red-700 dark:text-red-400 bg-muted/30">{fmt(totalDespesasAno)}</td>
            </tr>

            {/* RESULTADOS */}
            <tr className="bg-blue-100 dark:bg-blue-900/30 font-bold">
              <td className="py-1.5 px-3 sticky left-0 bg-blue-100 dark:bg-blue-900/30">(=) LUCRO OPERACIONAL</td>
              {Array.from({ length: 12 }, (_, i) => (
                <td key={i} className={`text-right py-1.5 px-2 ${lucroOpMes(i) >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-600"}`}>{lucroOpMes(i) !== 0 ? fmt(lucroOpMes(i)) : "—"}</td>
              ))}
              <td className="text-right py-1.5 px-2 text-blue-700 dark:text-blue-400 bg-muted/30">{fmt(lucroOpAno)}</td>
            </tr>

            <tr className="bg-emerald-100 dark:bg-emerald-900/30 font-bold text-sm">
              <td className="py-2 px-3 sticky left-0 bg-emerald-100 dark:bg-emerald-900/30">(=) LUCRO LÍQUIDO</td>
              {Array.from({ length: 12 }, (_, i) => (
                <td key={i} className={`text-right py-2 px-2 ${lucroLiqMes(i) >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}>{lucroLiqMes(i) !== 0 ? fmt(lucroLiqMes(i)) : "—"}</td>
              ))}
              <td className="text-right py-2 px-2 text-emerald-700 dark:text-emerald-400 bg-muted/30">{fmt(lucroLiqAno)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Aba Histórico Anual ──────────────────────────────────────────────────────
function TabHistorico() {
  const { data: historico } = trpc.financeiro.historicoAnual.useQuery();
  const utils = trpc.useUtils();
  const [editando, setEditando] = useState<number | null>(null);
  const [form, setForm] = useState({ receitaTotal: "", carteira: "", angariacao: "" });

  const salvar = trpc.financeiro.salvarHistorico.useMutation({
    onSuccess: () => { utils.financeiro.historicoAnual.invalidate(); toast.success("Salvo!"); setEditando(null); },
    onError: () => toast.error("Erro ao salvar"),
  });

  const rows = useMemo(() => {
    if (!historico) return [];
    return historico.map((h, i, arr) => {
      const prev = arr[i - 1];
      const varReceita = prev ? (parseFloat(h.receitaTotal) - parseFloat(prev.receitaTotal)) / parseFloat(prev.receitaTotal) : null;
      const varCarteira = prev ? (parseFloat(h.carteira) - parseFloat(prev.carteira)) / parseFloat(prev.carteira) : null;
      const varAngariacao = prev ? (parseFloat(h.angariacao) - parseFloat(prev.angariacao)) / parseFloat(prev.angariacao) : null;
      const pCarteira = parseFloat(h.receitaTotal) > 0 ? parseFloat(h.carteira) / parseFloat(h.receitaTotal) : 0;
      const pAngariacao = parseFloat(h.receitaTotal) > 0 ? parseFloat(h.angariacao) / parseFloat(h.receitaTotal) : 0;
      return { ...h, varReceita, varCarteira, varAngariacao, pCarteira, pAngariacao };
    });
  }, [historico]);

  // CAGR 2015-2025
  const cagr = useMemo(() => {
    if (!historico || historico.length < 2) return null;
    const first = parseFloat(historico[0].receitaTotal);
    const last = parseFloat(historico[historico.length - 1].receitaTotal);
    const n = historico.length - 1;
    return Math.pow(last / first, 1 / n) - 1;
  }, [historico]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Receita 2025</p>
            <p className="text-xl font-bold">{historico ? fmt(parseFloat(historico[historico.length - 1]?.receitaTotal ?? "0")) : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">CAGR 10 anos (2015-2025)</p>
            <p className="text-xl font-bold text-green-600">{cagr !== null ? fmtPct(cagr) : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Crescimento 2024→2025</p>
            <p className="text-xl font-bold text-blue-600">
              {rows.length >= 2 ? fmtPct(rows[rows.length - 1]?.varReceita ?? 0) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Evolução da Receita 2015–2025</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rows.map((r) => ({ ano: r.ano, receita: parseFloat(r.receitaTotal), carteira: parseFloat(r.carteira), angariacao: parseFloat(r.angariacao) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="ano" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              <Bar dataKey="carteira" name="Carteira" fill={COR_CARTEIRA} stackId="a" />
              <Bar dataKey="angariacao" name="Angariação" fill={COR_ANGARIACAO} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left py-2 px-3">ANO</th>
              <th className="text-right py-2 px-2">RECEITA TOTAL</th>
              <th className="text-right py-2 px-2">CARTEIRA</th>
              <th className="text-right py-2 px-2">ANGARIAÇÃO</th>
              <th className="text-right py-2 px-2">VAR. RECEITA</th>
              <th className="text-right py-2 px-2">MARG. CART.</th>
              <th className="text-right py-2 px-2">MARG. ANG.</th>
              <th className="text-center py-2 px-2">AÇÕES</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ano} className="border-b hover:bg-muted/20">
                <td className="py-1.5 px-3 font-semibold">{r.ano}</td>
                {editando === r.ano ? (
                  <>
                    <td className="py-1 px-2"><Input className="h-6 w-24 text-xs text-right" value={form.receitaTotal} onChange={(e) => setForm((p) => ({ ...p, receitaTotal: e.target.value }))} /></td>
                    <td className="py-1 px-2"><Input className="h-6 w-24 text-xs text-right" value={form.carteira} onChange={(e) => setForm((p) => ({ ...p, carteira: e.target.value }))} /></td>
                    <td className="py-1 px-2"><Input className="h-6 w-20 text-xs text-right" value={form.angariacao} onChange={(e) => setForm((p) => ({ ...p, angariacao: e.target.value }))} /></td>
                    <td colSpan={3} />
                    <td className="py-1 px-2">
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => salvar.mutate({ ano: r.ano, ...form })} className="text-green-600"><Check size={14} /></button>
                        <button onClick={() => setEditando(null)} className="text-red-500"><X size={14} /></button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="text-right py-1.5 px-2">{fmt(parseFloat(r.receitaTotal))}</td>
                    <td className="text-right py-1.5 px-2">{fmt(parseFloat(r.carteira))}</td>
                    <td className="text-right py-1.5 px-2">{fmt(parseFloat(r.angariacao))}</td>
                    <td className={`text-right py-1.5 px-2 ${r.varReceita !== null && r.varReceita >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {r.varReceita !== null ? fmtPct(r.varReceita) : "—"}
                    </td>
                    <td className="text-right py-1.5 px-2">{fmtPct(r.pCarteira)}</td>
                    <td className="text-right py-1.5 px-2">{fmtPct(r.pAngariacao)}</td>
                    <td className="text-center py-1.5 px-2">
                      <button onClick={() => { setEditando(r.ano); setForm({ receitaTotal: r.receitaTotal, carteira: r.carteira, angariacao: r.angariacao }); }} className="text-muted-foreground hover:text-primary"><Edit2 size={12} /></button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          {cagr !== null && (
            <tfoot>
              <tr className="bg-muted/30 font-semibold">
                <td className="py-1.5 px-3">CAGR 2015-2025</td>
                <td className="text-right py-1.5 px-2 text-green-600">{fmtPct(cagr)}</td>
                <td colSpan={6} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── Aba Comparativo Mensal ───────────────────────────────────────────────────
function TabComparativo() {
  const { data: comp } = trpc.financeiro.comparativoMensal.useQuery();
  const { data: historico } = trpc.financeiro.historicoAnual.useQuery();

  // Monta tabela com dados históricos + dados do banco para 2026
  const anosDisponiveis = comp?.anos ?? [];
  const meses = comp?.meses ?? MESES;

  // Dados do banco para 2026 (mês a mês)
  const dados2026 = useMemo(() => {
    if (!historico) return Array(12).fill(0);
    // Usa o histórico anual para 2026 se disponível, senão usa o comparativo
    return Array(12).fill(0);
  }, [historico]);

  const dadosTabela = useMemo(() => {
    if (!comp) return [];
    return meses.map((mes, mesIdx) => {
      const row: Record<string, any> = { mes };
      anosDisponiveis.forEach((ano, anoIdx) => {
        row[ano] = comp.dados[ano]?.[mesIdx] ?? 0;
        // Variação MoM (mês anterior do mesmo ano)
        if (mesIdx > 0) {
          const prev = comp.dados[ano]?.[mesIdx - 1] ?? 0;
          row[`var_${ano}`] = prev > 0 ? (row[ano] - prev) / prev : null;
        } else {
          row[`var_${ano}`] = null;
        }
        // Variação YoY (mesmo mês do ano anterior)
        if (anoIdx > 0) {
          const anoAnterior = anosDisponiveis[anoIdx - 1];
          const prevYoY = comp.dados[anoAnterior]?.[mesIdx] ?? 0;
          row[`yoy_${ano}`] = prevYoY > 0 ? (row[ano] - prevYoY) / prevYoY : null;
        } else {
          row[`yoy_${ano}`] = null;
        }
      });
      return row;
    });
  }, [comp, meses, anosDisponiveis]);

  // Totais anuais
  const totaisAnuais = useMemo(() => {
    if (!comp) return {};
    const tot: Record<number, number> = {};
    anosDisponiveis.forEach((ano) => {
      tot[ano] = (comp.dados[ano] ?? []).reduce((s, v) => s + v, 0);
    });
    return tot;
  }, [comp, anosDisponiveis]);

  // Gráfico: comparativo mensal dos últimos 3 anos
  const anosGrafico = anosDisponiveis.slice(-3);
  const graficoData = meses.map((mes, i) => {
    const row: Record<string, any> = { mes };
    anosGrafico.forEach((ano) => { row[ano] = comp?.dados[ano]?.[i] ?? 0; });
    return row;
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Comparativo Mensal — Últimos 3 Anos</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={graficoData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              {anosGrafico.map((ano, i) => (
                <Line key={ano} type="monotone" dataKey={ano} name={String(ano)} stroke={CORES_GRAFICO[i]} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left py-2 px-3 sticky left-0 bg-muted/50">MÊS</th>
              {anosDisponiveis.map((ano) => (
                <th key={ano} className="text-right py-2 px-2 min-w-[80px]">{ano}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dadosTabela.map((row) => (
              <tr key={row.mes} className="border-b hover:bg-muted/20">
                <td className="py-1.5 px-3 font-medium sticky left-0 bg-background">{row.mes}</td>
                {anosDisponiveis.map((ano) => (
                  <td key={ano} className="text-right py-1.5 px-2">
                    <div>{row[ano] > 0 ? fmt(row[ano]) : "—"}</div>
                    {/* Variação MoM (mês anterior do mesmo ano) */}
                    {row[`var_${ano}`] !== null && row[`var_${ano}`] !== undefined && row[ano] > 0 && (
                      <div className={`text-[10px] ${row[`var_${ano}`] >= 0 ? "text-green-600" : "text-red-500"}`} title="Variação vs mês anterior">
                        {row[`var_${ano}`] >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(row[`var_${ano}`]))}
                      </div>
                    )}
                    {/* Variação YoY (mesmo mês ano anterior) */}
                    {row[`yoy_${ano}`] !== null && row[`yoy_${ano}`] !== undefined && row[ano] > 0 && (
                      <div className={`text-[10px] font-medium ${row[`yoy_${ano}`] >= 0 ? "text-blue-600" : "text-orange-500"}`} title="Variação vs mesmo mês ano anterior">
                        YoY {row[`yoy_${ano}`] >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(row[`yoy_${ano}`]))}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30 font-bold">
              <td className="py-1.5 px-3 sticky left-0 bg-muted/30">TOTAL ANUAL</td>
              {anosDisponiveis.map((ano) => (
                <td key={ano} className="text-right py-1.5 px-2">{totaisAnuais[ano] > 0 ? fmt(totaisAnuais[ano]) : "—"}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Aba Metas ──────────────────────────────────────────────────────────────────────────────────
function TabMetas({ ano }: { ano: number }) {
  const { data: metas } = trpc.financeiro.metasPorAno.useQuery({ ano });
  const { data: dreAno } = trpc.financeiro.drePorAno.useQuery({ ano });
  const { data: resumoVendas } = trpc.vendas.resumoMensal.useQuery({ ano });
  const utils = trpc.useUtils();
  const [editando, setEditando] = useState<number | null>(null);
  const [form, setForm] = useState({ metaReceita: "", metaCarteira: "", metaAngariacao: "", metaLucro: "", metaVendas: "" });
  const [editandoAnual, setEditandoAnual] = useState(false);
  const [formAnual, setFormAnual] = useState({ metaReceita: "", metaAngariacao: "", metaLucro: "", metaVendas: "" });

  const salvar = trpc.financeiro.salvarMeta.useMutation({
    onSuccess: () => { utils.financeiro.metasPorAno.invalidate({ ano }); toast.success("Meta salva!"); setEditando(null); setEditandoAnual(false); },
    onError: (e) => toast.error("Erro ao salvar: " + e.message),
  });

  // Realizado por mês a partir do DRE
  const realizadoPorMes = useMemo(() => {
    if (!dreAno) return {};
    const por: Record<number, number> = {};
    dreAno.filter((l) => l.tipo === "RECEITA" && l.categoria === "Comissões Total" && l.subcategoria === null)
      .forEach((l) => { por[l.mes] = (por[l.mes] ?? 0) + parseFloat(l.valor); });
    return por;
  }, [dreAno]);

  // Vendas reais por mês (comissão gerada)
  const vendasPorMes = useMemo(() => {
    if (!resumoVendas) return {};
    const por: Record<number, number> = {};
    resumoVendas.forEach((v) => { por[v.mes] = Number(v.comissaoTotal) || 0; });
    return por;
  }, [resumoVendas]);

  // Carteira e angariação realizadas por mês
  const carteiraPorMes = useMemo(() => {
    if (!dreAno) return {};
    const por: Record<number, number> = {};
    dreAno.filter((l) => l.tipo === "RECEITA" && l.subcategoria === "Carteira")
      .forEach((l) => { por[l.mes] = (por[l.mes] ?? 0) + parseFloat(l.valor); });
    return por;
  }, [dreAno]);

  const angariacaoPorMes = useMemo(() => {
    if (!dreAno) return {};
    const por: Record<number, number> = {};
    dreAno.filter((l) => l.tipo === "RECEITA" && l.subcategoria === "Angariação")
      .forEach((l) => { por[l.mes] = (por[l.mes] ?? 0) + parseFloat(l.valor); });
    return por;
  }, [dreAno]);

  const metaAnual = metas?.find((m) => m.mes === 0);
  const metasMensais = metas?.filter((m) => m.mes > 0).sort((a, b) => a.mes - b.mes) ?? [];

  const totalRealizado = Object.values(realizadoPorMes).reduce((a, b) => a + b, 0);
  const totalCarteiraRealizado = Object.values(carteiraPorMes).reduce((a, b) => a + b, 0);
  const totalAngariacaoRealizado = Object.values(angariacaoPorMes).reduce((a, b) => a + b, 0);
  const totalVendasRealizado = Object.values(vendasPorMes).reduce((a, b) => a + b, 0);

  // Lucro líquido realizado
  const lucroRealizado = useMemo(() => {
    if (!dreAno) return 0;
    const receita = dreAno.filter((l) => l.tipo === "RECEITA" && l.categoria === "Comissões Total" && l.subcategoria === null).reduce((s, l) => s + parseFloat(l.valor), 0);
    const despesa = dreAno.filter((l) => l.tipo === "DESPESA").reduce((s, l) => s + parseFloat(l.valor), 0);
    return receita - despesa;
  }, [dreAno]);

  // Usa o último mês com dados reais no DRE (não o mês do calendário)
  const anoAtual = new Date().getFullYear();
  const ultimoMesComDadosMetas = useMemo(() => {
    if (!dreAno || ano !== anoAtual) return 12;
    const mesesComReceita = dreAno
      .filter((l) => l.tipo === "RECEITA" && l.categoria === "Comissões Total" && l.subcategoria === null && parseFloat(l.valor) > 0)
      .map((l) => l.mes);
    return mesesComReceita.length > 0 ? Math.max(...mesesComReceita) : 1;
  }, [dreAno, ano, anoAtual]);
  const mesesDecorridos = ultimoMesComDadosMetas;
  const metaReceitaAnual = metaAnual ? parseFloat(metaAnual.metaReceita) : 0;
  const metaReceitaProporcional = metaReceitaAnual * (mesesDecorridos / 12);

  return (
    <div className="space-y-4">
      {/* Metas Globais */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">📌 Metas Globais {ano}</h3>
          <button
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 border rounded px-2 py-1"
            onClick={() => {
              setFormAnual({ metaReceita: metaAnual?.metaReceita ?? "", metaAngariacao: metaAnual?.metaAngariacao ?? "0", metaLucro: metaAnual?.metaLucro ?? "", metaVendas: metaAnual?.metaVendas ?? "" });
              setEditandoAnual(true);
            }}
          ><Edit2 size={12} /> Editar metas anuais</button>
        </div>
        {editandoAnual && (
          <div className="mb-4 p-3 border rounded-lg bg-muted/30 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Metas Anuais {ano} (valores totais do ano)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { key: "metaReceita", label: "Receita Total" },
                { key: "metaAngariacao", label: "Angariação" },
                { key: "metaLucro", label: "Lucro Líquido" },
                { key: "metaVendas", label: "Vendas (Prêmio mensal)" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs text-muted-foreground">{label}</label>
                  <Input
                    className="h-8 text-sm mt-1"
                    type="number"
                    placeholder="0"
                    value={(formAnual as any)[key]}
                    onChange={(e) => setFormAnual((p) => ({ ...p, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                className="text-xs text-green-600 border border-green-300 rounded px-3 py-1 hover:bg-green-50 flex items-center gap-1"
                onClick={() => salvar.mutate({ ano, mes: 0, metaReceita: formAnual.metaReceita || "0", metaCarteira: formAnual.metaReceita || "0", metaAngariacao: formAnual.metaAngariacao || "0", metaLucro: formAnual.metaLucro || null, metaVendas: formAnual.metaVendas || null })}
                disabled={salvar.isPending}
              ><Check size={12} /> Salvar</button>
              <button className="text-xs text-muted-foreground border rounded px-3 py-1" onClick={() => setEditandoAnual(false)}><X size={12} /> Cancelar</button>
            </div>
          </div>
        )}
        {metaAnual && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Receita Total", meta: metaReceitaProporcional, metaAnual: metaReceitaAnual, realizado: totalRealizado, nota: ano === anoAtual ? `Base: ${mesesDecorridos} meses fechados` : null },
              { label: "Vendas (Prêmio)", meta: metaAnual.metaVendas ? parseFloat(metaAnual.metaVendas) * mesesDecorridos : 0, metaAnual: metaAnual.metaVendas ? parseFloat(metaAnual.metaVendas) * 12 : 0, realizado: totalVendasRealizado, nota: "Prêmio total vendido" },
              { label: "Angariação", meta: parseFloat(metaAnual.metaAngariacao) * (mesesDecorridos / 12), metaAnual: parseFloat(metaAnual.metaAngariacao), realizado: totalAngariacaoRealizado, nota: null },
              { label: "Lucro Líquido", meta: parseFloat(metaAnual.metaLucro ?? "0") * (mesesDecorridos / 12), metaAnual: parseFloat(metaAnual.metaLucro ?? "0"), realizado: lucroRealizado, nota: null },
            ].map((k) => {
              const pct = k.meta > 0 ? k.realizado / k.meta : 0;
              return (
                <Card key={k.label}>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className="text-base font-bold">{fmt(k.realizado)}</p>
                    <p className="text-xs text-muted-foreground">Meta {ano === anoAtual ? 'prop.' : 'anual'}: {fmt(k.meta)}</p>
                    {k.metaAnual > 0 && ano === anoAtual && <p className="text-[10px] text-muted-foreground">Meta anual: {fmt(k.metaAnual)}</p>}
                    <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 1 ? 'bg-green-500' : pct >= 0.7 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${Math.min(pct * 100, 100)}%` }} />
                    </div>
                    <p className={`text-xs text-right mt-1 ${pct >= 1 ? 'text-green-600' : pct >= 0.7 ? 'text-yellow-600' : 'text-red-500'}`}>{fmtPct(pct)} {pct >= 1 ? '✓' : ''}</p>
                    {k.nota && <p className="text-[10px] text-muted-foreground mt-0.5">{k.nota}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Acompanhamento Mensal */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">📅 Acompanhamento Mensal</h3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left py-2 px-3">MÊS</th>
                <th className="text-right py-2 px-2">META VENDAS</th>
                <th className="text-right py-2 px-2">REALIZADO</th>
                <th className="text-right py-2 px-2">% ATING.</th>
                <th className="text-center py-2 px-2">STATUS</th>
                <th className="text-center py-2 px-2">AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {metasMensais.map((m) => {
                const realizado = vendasPorMes[m.mes] ?? 0;
                const pct = parseFloat(m.metaReceita) > 0 ? realizado / parseFloat(m.metaReceita) : 0;
                return (
                  <tr key={m.mes} className="border-b hover:bg-muted/20">
                    <td className="py-1.5 px-3 font-medium">{MESES_FULL[m.mes - 1]}</td>
                    {editando === m.mes ? (
                      <>
                        <td className="py-1 px-2"><Input className="h-6 w-24 text-xs text-right" value={form.metaReceita} placeholder="Ex: 3500" onChange={(e) => setForm((p) => ({ ...p, metaReceita: e.target.value }))} /></td>
                        <td className="text-right py-1.5 px-2">{realizado > 0 ? fmt(realizado) : "—"}</td>
                        <td className="text-right py-1.5 px-2">{fmtPct(pct)}</td>
                        <td />
                        <td className="py-1 px-2">
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => salvar.mutate({ ano, mes: m.mes, metaReceita: form.metaReceita, metaCarteira: form.metaCarteira || form.metaReceita, metaAngariacao: form.metaAngariacao || "0", metaLucro: form.metaLucro || null, metaVendas: form.metaVendas || null })} className="text-green-600"><Check size={14} /></button>
                            <button onClick={() => setEditando(null)} className="text-red-500"><X size={14} /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="text-right py-1.5 px-2">{fmt(parseFloat(m.metaReceita))}</td>
                        <td className="text-right py-1.5 px-2">{realizado > 0 ? fmt(realizado) : "—"}</td>
                        <td className={`text-right py-1.5 px-2 font-medium ${pct >= 0.8 ? "text-green-600" : pct >= 0.5 ? "text-yellow-600" : "text-red-500"}`}>{realizado > 0 ? fmtPct(pct) : <span className="text-gray-300">—</span>}</td>
                        <td className="text-center py-1.5 px-2">{realizado > 0 ? (pct >= 0.8 ? "🟢" : pct >= 0.5 ? "🟡" : "🔴") : <span className="text-gray-300">—</span>}</td>
                        <td className="text-center py-1.5 px-2">
                          <button onClick={() => { setEditando(m.mes); setForm({ metaReceita: m.metaReceita, metaCarteira: m.metaCarteira, metaAngariacao: m.metaAngariacao, metaLucro: m.metaLucro ?? "", metaVendas: m.metaVendas ?? "" }); }} className="text-muted-foreground hover:text-primary"><Edit2 size={12} /></button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gráfico Meta vs Realizado */}
      {metasMensais.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Meta vs Realizado — Receita Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={metasMensais.map((m) => ({ mes: MESES[m.mes - 1], meta: parseFloat(m.metaReceita), realizado: realizadoPorMes[m.mes] ?? 0 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="meta" name="Meta" fill="#94a3b8" />
                <Bar dataKey="realizado" name="Realizado" fill={COR_RECEITA} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Aba Indicadores ──────────────────────────────────────────────────────────
function TabImap({ ano }: { ano: number }) {
  const utils = trpc.useUtils();
  const [editando, setEditando] = useState<number | null>(null);
  const [valor, setValor] = useState("");
  const salvar = trpc.relatorio.salvar.useMutation({
    onSuccess: () => { utils.relatorio.listar.invalidate({ ano }); toast.success("IMAP salvo!"); setEditando(null); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const { data: relatorios } = trpc.relatorio.listar.useQuery({ ano });
  const imapPorMes: Record<number, string> = {};
  (relatorios || []).forEach((r: any) => { if (r.imap) imapPorMes[r.mes] = String(r.imap); });

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">📊 IMAP Mensal — {ano}</h3>
      <p className="text-xs text-muted-foreground mb-3">Índice de Mercado de Apólices e Performance. Preencha a pontuação mensal — o Relatório Executivo exibe automaticamente.</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left py-2 px-3">MÊS</th>
              <th className="text-right py-2 px-3">PONTUAÇÃO IMAP</th>
              <th className="text-center py-2 px-3">AÇÕES</th>
            </tr>
          </thead>
          <tbody>
            {MESES_FULL.map((nome, i) => {
              const mes = i + 1;
              const imap = imapPorMes[mes];
              return (
                <tr key={mes} className="border-b hover:bg-muted/20">
                  <td className="py-1.5 px-3 font-medium">{nome}</td>
                  {editando === mes ? (
                    <>
                      <td className="py-1 px-3 text-right">
                        <Input className="h-6 w-24 text-xs text-right ml-auto" type="number" step="0.1" placeholder="Ex: 8.5" value={valor} onChange={(e) => setValor(e.target.value)} />
                      </td>
                      <td className="py-1 px-3 text-center">
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => salvar.mutate({ ano, mes, imap: valor || null })} className="text-green-600"><Check size={14} /></button>
                          <button onClick={() => setEditando(null)} className="text-red-500"><X size={14} /></button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="text-right py-1.5 px-3">
                        {imap ? <span className="font-bold text-indigo-600">{parseFloat(imap).toFixed(1)}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="text-center py-1.5 px-3">
                        <button onClick={() => { setEditando(mes); setValor(imap ?? ""); }} className="text-muted-foreground hover:text-primary"><Edit2 size={12} /></button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabIndicadores({ ano }: { ano: number }) {
  return (
    <div className="space-y-6">
      <TabImap ano={ano} />
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">📌 Indicadores Financeiros</h3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left py-2 px-4">Indicador</th>
                <th className="text-left py-2 px-4">Fórmula</th>
                <th className="text-right py-2 px-4">Valor</th>
                <th className="text-right py-2 px-4">Benchmark</th>
                <th className="text-center py-2 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {INDICADORES_FINANCEIROS.map((ind) => (
                <tr key={ind.nome} className="border-b hover:bg-muted/20">
                  <td className="py-2 px-4 font-medium">{ind.nome}</td>
                  <td className="py-2 px-4 text-muted-foreground text-xs">{ind.formula}</td>
                  <td className="text-right py-2 px-4 font-bold">
                    {ind.nome.includes("ROI") ? `${ind.valor.toFixed(2)}x` : fmtPct(ind.valor)}
                  </td>
                  <td className="text-right py-2 px-4 text-muted-foreground">{ind.benchmark}</td>
                  <td className="text-center py-2 px-4 text-lg">{ind.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">⚙️ Indicadores Operacionais</h3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left py-2 px-4">Indicador</th>
                <th className="text-left py-2 px-4">Fórmula</th>
                <th className="text-right py-2 px-4">Valor</th>
                <th className="text-right py-2 px-4">Meta</th>
                <th className="text-center py-2 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {INDICADORES_OPERACIONAIS.map((ind) => (
                <tr key={ind.nome} className="border-b hover:bg-muted/20">
                  <td className="py-2 px-4 font-medium">{ind.nome}</td>
                  <td className="py-2 px-4 text-muted-foreground text-xs">{ind.formula}</td>
                  <td className="text-right py-2 px-4 font-bold">
                    {ind.nome.includes("ROI") ? `${ind.valor.toFixed(2)}x` : fmtPct(ind.valor)}
                  </td>
                  <td className="text-right py-2 px-4 text-muted-foreground">{ind.benchmark}</td>
                  <td className="text-center py-2 px-4 text-lg">{ind.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gráfico radar visual */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Resumo Visual dos Indicadores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Margem Líquida", valor: 0.6268, meta: 0.30, cor: "green" },
              { label: "Eficiência Op.", valor: 1 - 0.2625, meta: 0.70, cor: "blue" },
              { label: "CAGR 10 anos", valor: 0.0936 / 0.08, meta: 1.0, cor: "purple" },
              { label: "Crescimento YoY", valor: 0.2235 / 0.15, meta: 1.0, cor: "orange" },
            ].map((item) => {
              const pct = Math.min(item.valor, 1);
              return (
                <div key={item.label} className="text-center">
                  <div className="relative inline-flex items-center justify-center w-20 h-20 mx-auto">
                    <svg className="w-20 h-20 -rotate-90">
                      <circle cx="40" cy="40" r="32" fill="none" stroke="#e5e7eb" strokeWidth="8" />
                      <circle cx="40" cy="40" r="32" fill="none" stroke={item.cor === "green" ? "#22c55e" : item.cor === "blue" ? "#3b82f6" : item.cor === "purple" ? "#8b5cf6" : "#f59e0b"} strokeWidth="8" strokeDasharray={`${pct * 201} 201`} strokeLinecap="round" />
                    </svg>
                    <span className="absolute text-xs font-bold">{fmtPct(item.valor)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
                  <p className="text-xs text-green-600">🟢 Acima da meta</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Aba Projeções ────────────────────────────────────────────────────────────
function TabProjecoes() {
  const [cenario, setCenario] = useState<"pessimista" | "realista" | "otimista">("realista");
  const dados = PROJECOES[cenario];

  return (
    <div className="space-y-4">
      {/* Premissas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">⚙️ Premissas e Variáveis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {[
              { label: "Receita Base 2025", valor: fmt(PROJECOES.premissas.receitaBase2025), unit: "" },
              { label: "CAGR Histórico (10 anos)", valor: fmtPct(PROJECOES.premissas.cagrHistorico), unit: "" },
              { label: "Taxa Pessimista", valor: fmtPct(PROJECOES.premissas.taxaPessimista), unit: "" },
              { label: "Taxa Realista", valor: fmtPct(PROJECOES.premissas.taxaRealista), unit: "" },
              { label: "Taxa Otimista", valor: fmtPct(PROJECOES.premissas.taxaOtimista), unit: "" },
              { label: "Participação Carteira", valor: fmtPct(PROJECOES.premissas.participacaoCarteira), unit: "" },
              { label: "Participação Angariação", valor: fmtPct(PROJECOES.premissas.participacaoAngariacao), unit: "" },
            ].map((p) => (
              <div key={p.label} className="bg-muted/30 rounded p-2">
                <p className="text-muted-foreground">{p.label}</p>
                <p className="font-bold">{p.valor}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Seletor de Cenário */}
      <div className="flex gap-2">
        {(["pessimista", "realista", "otimista"] as const).map((c) => (
          <Button
            key={c}
            variant={cenario === c ? "default" : "outline"}
            size="sm"
            onClick={() => setCenario(c)}
          >
            {c === "pessimista" ? "📉 Pessimista (5%)" : c === "realista" ? "📊 Realista (9,4%)" : "📈 Otimista (15%)"}
          </Button>
        ))}
      </div>

      {/* Gráfico */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Projeção de Receita 2026–2030 — {cenario.charAt(0).toUpperCase() + cenario.slice(1)}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dados.map((d) => ({ ano: d.ano, carteira: d.carteira, angariacao: d.angariacao, lucro: d.lucro }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="ano" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              <Bar dataKey="carteira" name="Carteira" fill={COR_CARTEIRA} stackId="a" />
              <Bar dataKey="angariacao" name="Angariação" fill={COR_ANGARIACAO} stackId="a" />
              <Bar dataKey="lucro" name="Lucro Est." fill={COR_LUCRO} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tabela dos 3 cenários */}
      <div className="space-y-4">
        {(["pessimista", "realista", "otimista"] as const).map((c) => (
          <Card key={c} className={cenario === c ? "ring-2 ring-primary" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {c === "pessimista" ? "📉 Cenário Pessimista (5% a.a.)" : c === "realista" ? "📊 Cenário Realista (9,4% a.a.) — Recomendado" : "📈 Cenário Otimista (15% a.a.)"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left py-1.5 px-3">Ano</th>
                      <th className="text-right py-1.5 px-2">Receita Total</th>
                      <th className="text-right py-1.5 px-2">Carteira (97%)</th>
                      <th className="text-right py-1.5 px-2">Angariação (3%)</th>
                      <th className="text-right py-1.5 px-2">Margem Lucro</th>
                      <th className="text-right py-1.5 px-2">Lucro Estimado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PROJECOES[c].map((d) => (
                      <tr key={d.ano} className="border-b hover:bg-muted/20">
                        <td className="py-1.5 px-3 font-semibold">{d.ano}</td>
                        <td className="text-right py-1.5 px-2">{fmt(d.receita)}</td>
                        <td className="text-right py-1.5 px-2">{fmt(d.carteira)}</td>
                        <td className="text-right py-1.5 px-2">{fmt(d.angariacao)}</td>
                        <td className="text-right py-1.5 px-2">{fmtPct(d.margem)}</td>
                        <td className="text-right py-1.5 px-2 text-green-600 font-medium">{fmt(d.lucro)}</td>
                      </tr>
                    ))}
                    <tr className="bg-muted/30 font-bold">
                      <td className="py-1.5 px-3">ACUMULADO</td>
                      <td className="text-right py-1.5 px-2">{fmt(PROJECOES[c].reduce((s, d) => s + d.receita, 0))}</td>
                      <td className="text-right py-1.5 px-2">{fmt(PROJECOES[c].reduce((s, d) => s + d.carteira, 0))}</td>
                      <td className="text-right py-1.5 px-2">{fmt(PROJECOES[c].reduce((s, d) => s + d.angariacao, 0))}</td>
                      <td />
                      <td className="text-right py-1.5 px-2 text-green-600">{fmt(PROJECOES[c].reduce((s, d) => s + d.lucro, 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function Financeiro() {
  const [ano, setAno] = useState(2026);

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Financeiro Barcellos</h1>
            <p className="text-muted-foreground text-sm">Dashboard Executivo e Análise Financeira</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Ano:</span>
            <select
              className="border rounded px-2 py-1 text-sm bg-background"
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
            >
              {Array.from({ length: 36 }, (_, i) => 2015 + i).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Abas */}
        <Tabs defaultValue="dashboard">
          <TabsList className="flex flex-wrap gap-1 h-auto">
            <TabsTrigger value="dashboard" className="text-xs">📊 Dashboard</TabsTrigger>
            <TabsTrigger value="dre" className="text-xs">📋 DRE {ano}</TabsTrigger>
            <TabsTrigger value="historico" className="text-xs">📈 Histórico Anual</TabsTrigger>
            <TabsTrigger value="comparativo" className="text-xs">🔄 Comparativo Mensal</TabsTrigger>
            <TabsTrigger value="metas" className="text-xs">🎯 Metas {ano}</TabsTrigger>
            <TabsTrigger value="indicadores" className="text-xs">⚙️ Indicadores</TabsTrigger>
            <TabsTrigger value="projecoes" className="text-xs">🔮 Projeções 2026–2030</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-4">
            <TabDashboard ano={ano} />
          </TabsContent>
          <TabsContent value="dre" className="mt-4">
            <TabDRE ano={ano} />
          </TabsContent>
          <TabsContent value="historico" className="mt-4">
            <TabHistorico />
          </TabsContent>
          <TabsContent value="comparativo" className="mt-4">
            <TabComparativo />
          </TabsContent>
          <TabsContent value="metas" className="mt-4">
            <TabMetas ano={ano} />
          </TabsContent>
          <TabsContent value="indicadores" className="mt-4">
            <TabIndicadores ano={ano} />
          </TabsContent>
          <TabsContent value="projecoes" className="mt-4">
            <TabProjecoes />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

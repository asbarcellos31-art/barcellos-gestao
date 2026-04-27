import { useState } from "react";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  DollarSign, Users, ShoppingCart, TrendingUp, AlertTriangle,
  FileWarning, PhoneCall, Clock, ArrowRight, CheckCircle,
  XCircle, AlertCircle, BarChart2, Target, UserCheck, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useAno } from "../contexts/AnoContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

function ModuleCard({
  title, icon: Icon, iconColor, href, children, badge,
}: {
  title: string; icon: React.ElementType; iconColor: string; href: string;
  children: React.ReactNode; badge?: { label: string; variant: "default" | "destructive" | "secondary" | "outline" };
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${iconColor}`}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {badge && <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>}
            <Link href={href}>
              <ArrowRight className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-pointer" />
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { ano: anoGlobal } = useAno();
  const hoje = new Date();

  // Seletor de mês e ano local
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());

  function mesAnterior() {
    if (mes === 1) { setMes(12); setAno(a => a - 1); }
    else setMes(m => m - 1);
  }
  function mesSeguinte() {
    if (mes === 12) { setMes(1); setAno(a => a + 1); }
    else setMes(m => m + 1);
  }

  // Queries de todos os módulos usando mês e ano selecionados
  const { data: metricasContas } = trpc.contas.metricas.useQuery({ ano });
  const { data: alertasContas = [] } = trpc.contas.alertas.useQuery({ dias: 10 });
  const { data: vencidasContas = [] } = trpc.contas.vencidas.useQuery();
  const { data: metricasVendas } = trpc.vendas.metricas.useQuery({ ano });
  const { data: vendasMensalData = [] } = trpc.vendas.resumoMensal.useQuery({ ano });
  const { data: metricasClientes } = trpc.clientes.listar.useQuery({});
  const { data: metricasInadimplentes } = trpc.inadimplentes.metricas.useQuery({ mes, ano });
  const { data: metricasSinistros } = trpc.sinistros.metricas.useQuery();
  const { data: metricasLeads } = trpc.crmLeads.metricas.useQuery({ ano });
  const { data: comissoesPendentes } = trpc.vendas.comissoesPendentes.useQuery({});
  const { data: metricasBenef } = trpc.crmBeneficiarios.metricas.useQuery();
  // Receita do mês selecionado
  const { data: metricasRelatorio } = trpc.relatorio.obterMetricas.useQuery({ mes, ano });
  // Metas do ano para comparação
  const { data: metasAno = [] } = trpc.financeiro.metasPorAno.useQuery({ ano });
  const { data: entradaSaidaData } = trpc.cancelados.entradaSaidaAcumulada.useQuery({ ano });

  const totalAlertas = alertasContas.length + vencidasContas.length;

  // Dados para gráfico de vendas mensais do ano selecionado
  const dadosGrafico = MESES_ABREV.map((m, idx) => {
    const r = (vendasMensalData as any[]).find((d: any) => d.mes === idx + 1);
    return { mes: m, propostas: Number(r?.totalVendas || 0), faturamento: Number(r?.faturamento || 0) };
  });

  // Dados para gráfico de inadimplentes por status (mês selecionado)
  const inadimStatus = [
    { name: "Pago", value: metricasInadimplentes?.pagos || 0, color: "#22c55e" },
    { name: "Em Contato", value: metricasInadimplentes?.emContato || 0, color: "#eab308" },
    { name: "Boleto", value: metricasInadimplentes?.boleto || 0, color: "#3b82f6" },
    { name: "Desistiu", value: metricasInadimplentes?.desistiu || 0, color: "#ef4444" },
    { name: "Especial", value: metricasInadimplentes?.especial || 0, color: "#a855f7" },
  ].filter(d => d.value > 0);

  const totalComissoesPendentes = (comissoesPendentes as any)?.vendedores?.reduce(
    (acc: number, v: any) => acc + Number(v.totalPendente || 0), 0
  ) || 0;

  const clientesAtivos = (metricasClientes as any)?.ativos || 0;
  const clientesTotal = (metricasClientes as any)?.total || 0;
  const benefAguardando = (metricasBenef as any)?.aguardando || 0;
  const benefEntrarContato = (metricasBenef as any)?.entrarContato || 0;

  const isMesAtual = mes === hoje.getMonth() + 1 && ano === hoje.getFullYear();

  // Dados de entrada vs saída para o mês selecionado e para o ano
  const esMensal = (entradaSaidaData as any)?.mensal || [];
  const esMes = esMensal.find((m: any) => m.mes === mes) || { totalNovos: 0, totalSaidas: 0, desistiu: 0, inadimplente: 0, obito: 0, saldo: 0 };
  const esTotais = (entradaSaidaData as any)?.totais || { totalNovos: 0, totalSaidas: 0, saldo: 0 };

  return (
    <AppLayout>
      <div className="p-3 md:p-6 space-y-4 md:space-y-6">

        {/* Cabeçalho com seletor de mês/ano */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard Geral</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Visão consolidada de todos os módulos</p>
          </div>

          {/* Seletor de mês/ano */}
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={mesAnterior}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center min-w-[130px]">
              <div className="text-sm font-bold text-gray-900">{MESES_FULL[mes - 1]} {ano}</div>
              {isMesAtual && <div className="text-xs text-blue-600 font-medium">Mês atual</div>}
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={mesSeguinte}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isMesAtual && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 ml-1"
                onClick={() => { setMes(hoje.getMonth() + 1); setAno(hoje.getFullYear()); }}
              >
                Hoje
              </Button>
            )}
          </div>
        </div>

        {/* Cards de resumo rápido — dados do mês selecionado */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Receita — {MESES_ABREV[mes - 1]}/{ano}</span>
              </div>
              <p className="text-2xl font-bold">{fmt(Number((metricasRelatorio as any)?.receitaReal || 0))}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Acum: {fmt(Number((metricasRelatorio as any)?.receitaAcumulada || 0))}
              </p>
              {totalAlertas > 0 && (
                <Badge variant="destructive" className="text-xs mt-1">{totalAlertas} alertas contas</Badge>
              )}
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCart className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground">Vendas — {MESES_ABREV[mes - 1]}/{ano}</span>
              </div>
              {/* Pega as vendas do mês selecionado do array vendasMensalData */}
              {(() => {
                const vendaMes = (vendasMensalData as any[]).find((d: any) => d.mes === mes);
                const faturamentoMes = Number(vendaMes?.faturamento || 0);
                const totalPropostasMes = Number(vendaMes?.totalVendas || 0);
                return (
                  <>
                    <p className="text-2xl font-bold">{fmt(faturamentoMes)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{totalPropostasMes} propostas em {MESES_ABREV[mes - 1]}</p>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-purple-500" />
                <span className="text-xs text-muted-foreground">Base de Clientes</span>
              </div>
              <p className="text-2xl font-bold">{clientesAtivos}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{clientesTotal} total cadastrados</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <span className="text-xs text-muted-foreground">Inadimplentes — {MESES_ABREV[mes - 1]}/{ano}</span>
              </div>
              <p className="text-2xl font-bold">{metricasInadimplentes?.total || 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{fmt(Number(metricasInadimplentes?.totalValor || 0))} em aberto</p>
            </CardContent>
          </Card>
        </div>

        {/* Linha 2 — Gráfico de Vendas + Inadimplentes por Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Gráfico de Vendas Mensais do ano selecionado */}
          <ModuleCard title={`Vendas Mensais — ${ano}`} icon={ShoppingCart} iconColor="bg-green-500" href="/vendas">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosGrafico} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => [v, "Propostas"]} />
                  <Bar dataKey="propostas" fill="#22c55e" radius={[3, 3, 0, 0]}>
                    {dadosGrafico.map((_, idx) => (
                      <Cell key={idx} fill={idx + 1 === mes ? "#16a34a" : "#22c55e"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ModuleCard>

          {/* Inadimplentes por Status do mês selecionado */}
          <ModuleCard
            title={`Inadimplentes — ${MESES_ABREV[mes - 1]}/${ano}`}
            icon={AlertTriangle}
            iconColor="bg-orange-500"
            href="/inadimplentes"
            badge={metricasInadimplentes?.total ? { label: `${metricasInadimplentes.total} registros`, variant: "secondary" } : undefined}
          >
            {inadimStatus.length > 0 ? (
              <div className="flex items-center gap-4">
                <div className="h-36 w-36 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={inadimStatus} cx="50%" cy="50%" innerRadius={30} outerRadius={55} dataKey="value">
                        {inadimStatus.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any, name: any) => [v, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 flex-1">
                  {inadimStatus.map(s => (
                    <div key={s.name} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <span className="flex-1 text-muted-foreground">{s.name}</span>
                      <span className="font-bold">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm">Nenhum registro em {MESES_ABREV[mes - 1]}/{ano}</div>
            )}
          </ModuleCard>
        </div>

        {/* Linha 3 — Cards de módulos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Sinistros */}
          <ModuleCard title="Sinistros" icon={FileWarning} iconColor="bg-red-500" href="/sinistros">
            <div className="space-y-2 mt-1">
              {[
                { label: "Total Protocolos", value: metricasSinistros?.total || 0, icon: <BarChart2 className="h-3.5 w-3.5 text-gray-400" /> },
                { label: "Pagos", value: metricasSinistros?.pagamentos || 0, icon: <CheckCircle className="h-3.5 w-3.5 text-green-500" /> },
                { label: "Em Análise", value: metricasSinistros?.emAnalise || 0, icon: <Clock className="h-3.5 w-3.5 text-yellow-500" /> },
                { label: "Recusados", value: metricasSinistros?.recusados || 0, icon: <XCircle className="h-3.5 w-3.5 text-red-500" /> },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  {item.icon}
                  <span className="text-xs text-muted-foreground flex-1">{item.label}</span>
                  <span className="text-sm font-bold">{item.value}</span>
                </div>
              ))}
              <div className="pt-1 border-t">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Valor Pago</span>
                  <span className="font-bold text-green-600">{fmt(Number((metricasSinistros as any)?.totalRecebido || 0))}</span>
                </div>
              </div>
            </div>
          </ModuleCard>

          {/* CRM Leads */}
          <ModuleCard title={`CRM Leads — ${ano}`} icon={PhoneCall} iconColor="bg-indigo-500" href="/crm-leads">
            <div className="space-y-2 mt-1">
              {[
                { label: "Total de Leads", value: metricasLeads?.total || 0, icon: <Target className="h-3.5 w-3.5 text-gray-400" /> },
                { label: "Em Contato", value: metricasLeads?.emContato || 0, icon: <PhoneCall className="h-3.5 w-3.5 text-blue-500" /> },
                { label: "Fechamentos", value: metricasLeads?.fechamento || 0, icon: <CheckCircle className="h-3.5 w-3.5 text-green-500" /> },
                { label: "Recusados", value: metricasLeads?.recusado || 0, icon: <XCircle className="h-3.5 w-3.5 text-red-500" /> },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  {item.icon}
                  <span className="text-xs text-muted-foreground flex-1">{item.label}</span>
                  <span className="text-sm font-bold">{item.value}</span>
                </div>
              ))}
              <div className="pt-1 border-t">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Taxa de Conversão</span>
                  <span className="font-bold text-green-600">{metricasLeads?.taxaConversao || 0}%</span>
                </div>
              </div>
            </div>
          </ModuleCard>

          {/* CRM Beneficiários + Comissões Pendentes */}
          <div className="space-y-4">
            <ModuleCard title="CRM Beneficiários" icon={UserCheck} iconColor="bg-teal-500" href="/crm-beneficiarios">
              <div className="space-y-1.5 mt-1">
                {[
                  { label: "Aguardando", value: benefAguardando, color: "text-gray-600" },
                  { label: "Entrar em Contato", value: benefEntrarContato, color: "text-yellow-600" },
                  { label: "Fechados", value: (metricasBenef as any)?.fechado || 0, color: "text-green-600" },
                  { label: "Recusados", value: (metricasBenef as any)?.recusado || 0, color: "text-red-600" },
                ].map(item => (
                  <div key={item.label} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className={`font-bold ${item.color}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </ModuleCard>

            <ModuleCard
              title="Comissões Pendentes"
              icon={TrendingUp}
              iconColor="bg-amber-500"
              href="/comissoes-pendentes"
              badge={totalComissoesPendentes > 0 ? { label: fmt(totalComissoesPendentes), variant: "secondary" } : undefined}
            >
              <div className="space-y-1.5 mt-1">
                {((comissoesPendentes as any)?.vendedores || []).slice(0, 3).map((v: any) => (
                  <div key={v.vendedor} className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate flex-1">{v.vendedor}</span>
                    <span className="font-bold text-amber-600 ml-2">{fmt(Number(v.totalPendente))}</span>
                  </div>
                ))}
                {((comissoesPendentes as any)?.vendedores || []).length === 0 && (
                  <div className="flex items-center gap-2 text-xs text-green-600">
                    <CheckCircle className="h-3.5 w-3.5" />
                    <span>Todas as comissões pagas!</span>
                  </div>
                )}
              </div>
            </ModuleCard>
          </div>
        </div>

        {/* Linha 4 — Alertas de Contas a Pagar */}
        {(alertasContas.length > 0 || vencidasContas.length > 0) && (
          <ModuleCard
            title="Alertas — Contas a Pagar"
            icon={AlertCircle}
            iconColor="bg-red-500"
            href="/todos"
            badge={{ label: `${totalAlertas} pendentes`, variant: "destructive" }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
              {[...vencidasContas.slice(0, 3), ...alertasContas.slice(0, 3)].map((conta: any, i) => (
                <div key={i} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-red-50 border border-red-100">
                  <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{conta.descricao}</p>
                    <p className="text-muted-foreground">{fmt(Number(conta.valor))}</p>
                  </div>
                </div>
              ))}
            </div>
          </ModuleCard>
        )}

        {/* Linha 4.5 — Entrada vs Saída de Clientes */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-600">
                <Users className="h-4 w-4 text-white" />
              </div>
              <h3 className="text-sm font-semibold">Entrada vs Saída de Clientes — {ano}</h3>
            </div>
            <span className="text-xs text-muted-foreground">Novos CPFs · Cancelamentos (Desistência + Inadimplência + Óbito)</span>
          </div>
          {/* KPIs do mês selecionado */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-b border-gray-100">
            <div className="px-4 py-3 border-r border-gray-100">
              <p className="text-xs text-muted-foreground">Novos — {MESES_ABREV[mes - 1]}/{ano}</p>
              <p className="text-2xl font-bold text-green-600">{esMes.totalNovos}</p>
              <p className="text-xs text-muted-foreground mt-0.5">CPFs novos no mês</p>
            </div>
            <div className="px-4 py-3 border-r border-gray-100">
              <p className="text-xs text-muted-foreground">Saídas — {MESES_ABREV[mes - 1]}/{ano}</p>
              <p className="text-2xl font-bold text-red-600">{esMes.totalSaidas}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {esMes.desistiu}d · {esMes.inadimplente}i · {esMes.obito}ó
              </p>
            </div>
            <div className="px-4 py-3 border-r border-gray-100">
              <p className="text-xs text-muted-foreground">Saldo — {MESES_ABREV[mes - 1]}/{ano}</p>
              <p className={`text-2xl font-bold ${esMes.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {esMes.saldo >= 0 ? '+' : ''}{esMes.saldo}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Novos − Saídas</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground">Saldo Acumulado {ano}</p>
              <p className={`text-2xl font-bold ${esTotais.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {esTotais.saldo >= 0 ? '+' : ''}{esTotais.saldo}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{esTotais.totalNovos} novos · {esTotais.totalSaidas} saídas</p>
            </div>
          </div>
          {/* Tabela mês a mês */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2 font-semibold text-gray-600">Mês</th>
                  <th className="text-right px-3 py-2 font-semibold text-green-600">Novos</th>
                  <th className="text-right px-3 py-2 font-semibold text-red-500">Desistência</th>
                  <th className="text-right px-3 py-2 font-semibold text-orange-500">Inadimplência</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-500">Óbito</th>
                  <th className="text-right px-3 py-2 font-semibold text-red-600">Total Saídas</th>
                  <th className="text-right px-3 py-2 font-semibold text-purple-600">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {MESES_ABREV.map((m, idx) => {
                  const mesNum = idx + 1;
                  const d = esMensal.find((r: any) => r.mes === mesNum) || { totalNovos: 0, totalSaidas: 0, desistiu: 0, inadimplente: 0, obito: 0, saldo: 0 };
                  const isSel = mesNum === mes;
                  const temDados = d.totalNovos > 0 || d.totalSaidas > 0;
                  return (
                    <tr
                      key={idx}
                      className={`border-b border-gray-50 cursor-pointer transition-colors ${isSel ? 'bg-purple-50/60' : 'hover:bg-gray-50/50'} ${!temDados ? 'opacity-40' : ''}`}
                      onClick={() => setMes(mesNum)}
                    >
                      <td className={`px-4 py-2 font-medium ${isSel ? 'text-purple-700' : 'text-gray-600'}`}>
                        {m} {isSel && <span className="text-xs bg-purple-100 text-purple-700 px-1 rounded ml-1">selecionado</span>}
                      </td>
                      <td className="text-right px-3 py-2 text-green-700 font-medium">{d.totalNovos > 0 ? d.totalNovos : <span className="text-gray-300">—</span>}</td>
                      <td className="text-right px-3 py-2 text-red-500">{d.desistiu > 0 ? d.desistiu : <span className="text-gray-300">—</span>}</td>
                      <td className="text-right px-3 py-2 text-orange-500">{d.inadimplente > 0 ? d.inadimplente : <span className="text-gray-300">—</span>}</td>
                      <td className="text-right px-3 py-2 text-gray-500">{d.obito > 0 ? d.obito : <span className="text-gray-300">—</span>}</td>
                      <td className="text-right px-3 py-2 text-red-600 font-medium">{d.totalSaidas > 0 ? d.totalSaidas : <span className="text-gray-300">—</span>}</td>
                      <td className={`text-right px-3 py-2 font-bold ${!temDados ? 'text-gray-300' : d.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {temDados ? (d.saldo >= 0 ? `+${d.saldo}` : d.saldo) : '—'}
                      </td>
                    </tr>
                  );
                })}
                {/* Totais */}
                <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                  <td className="px-4 py-2 text-gray-700">Total {ano}</td>
                  <td className="text-right px-3 py-2 text-green-700">{esTotais.totalNovos}</td>
                  <td className="text-right px-3 py-2 text-red-500">{esTotais.desistiu || 0}</td>
                  <td className="text-right px-3 py-2 text-orange-500">{esTotais.inadimplente || 0}</td>
                  <td className="text-right px-3 py-2 text-gray-500">{esTotais.obito || 0}</td>
                  <td className="text-right px-3 py-2 text-red-600">{esTotais.totalSaidas}</td>
                  <td className={`text-right px-3 py-2 ${esTotais.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {esTotais.saldo >= 0 ? `+${esTotais.saldo}` : esTotais.saldo}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Linha 5 — Overview Mensal do ano selecionado */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-600">
                <BarChart2 className="h-4 w-4 text-white" />
              </div>
              <h3 className="text-sm font-semibold">Overview Mensal — {ano}</h3>
            </div>
            <span className="text-xs text-muted-foreground">Propostas · Prêmio · Meta de Vendas</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2 font-semibold text-gray-600">Mês</th>
                  <th className="text-right px-3 py-2 font-semibold text-green-600">Propostas</th>
                  <th className="text-right px-3 py-2 font-semibold text-emerald-600">Prêmio</th>
                  <th className="text-right px-3 py-2 font-semibold text-blue-600">Meta Vendas</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-500">Ating.</th>
                </tr>
              </thead>
              <tbody>
                {MESES_ABREV.map((m, idx) => {
                  const mesNum = idx + 1;
                  const v = (vendasMensalData as any[]).find((r: any) => r.mes === mesNum);
                  const propostas = Number(v?.totalVendas || 0);
                  const premio = Number(v?.faturamento || 0);
                  const meta = (metasAno as any[]).find((mt: any) => mt.mes === mesNum);
                  const metaVendas = meta ? parseFloat(meta.metaVendas || meta.metaReceita || "0") : 0;
                  const ating = metaVendas > 0 ? (premio / metaVendas) * 100 : null;
                  const corAting = ating === null ? "text-gray-300" : ating >= 100 ? "text-green-600" : ating >= 80 ? "text-amber-500" : "text-red-500";
                  const isSelecionado = mesNum === mes;
                  return (
                    <tr
                      key={idx}
                      className={`border-b border-gray-50 cursor-pointer transition-colors ${isSelecionado ? "bg-blue-50/60" : "hover:bg-gray-50/50"}`}
                      onClick={() => setMes(mesNum)}
                    >
                      <td className={`px-4 py-2 font-medium ${isSelecionado ? "text-blue-700" : "text-gray-600"}`}>
                        {m} {isSelecionado && <span className="text-xs bg-blue-100 text-blue-700 px-1 rounded ml-1">selecionado</span>}
                      </td>
                      <td className="text-right px-3 py-2 text-green-700 font-medium">{propostas > 0 ? propostas : <span className="text-gray-300">—</span>}</td>
                      <td className="text-right px-3 py-2 text-emerald-700 font-medium">{premio > 0 ? fmt(premio) : <span className="text-gray-300">—</span>}</td>
                      <td className="text-right px-3 py-2 text-blue-600">{metaVendas > 0 ? fmt(metaVendas) : <span className="text-gray-300">—</span>}</td>
                      <td className={`text-right px-3 py-2 font-bold ${corAting}`}>{ating !== null ? `${ating.toFixed(0)}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Linha 6 — Performance de Vendas por Vendedor */}
        {(metricasVendas as any)?.porVendedor && ((metricasVendas as any).porVendedor as any[]).length > 0 && (
          <ModuleCard title={`Performance de Vendas por Vendedor — ${ano}`} icon={TrendingUp} iconColor="bg-green-500" href="/vendas">
            <div className="overflow-x-auto mt-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1.5 font-medium text-muted-foreground">Vendedor</th>
                    <th className="text-right py-1.5 font-medium text-muted-foreground">Propostas</th>
                    <th className="text-right py-1.5 font-medium text-muted-foreground">Faturamento</th>
                    <th className="text-right py-1.5 font-medium text-muted-foreground">Comissão</th>
                    <th className="text-right py-1.5 font-medium text-muted-foreground">Ticket Médio</th>
                  </tr>
                </thead>
                <tbody>
                  {((metricasVendas as any).porVendedor as any[]).map((v: any) => (
                    <tr key={v.vendedor} className="border-b hover:bg-muted/20">
                      <td className="py-1.5 font-medium">{v.vendedor}</td>
                      <td className="py-1.5 text-right">{v.propostas}</td>
                      <td className="py-1.5 text-right text-green-600 font-medium">{fmt(Number(v.faturamento))}</td>
                      <td className="py-1.5 text-right">{fmt(Number(v.comissao))}</td>
                      <td className="py-1.5 text-right">{fmt(Number(v.ticketMedio))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ModuleCard>
        )}
      </div>
    </AppLayout>
  );
}

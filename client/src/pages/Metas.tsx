import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Target, ChevronLeft, ChevronRight, TrendingUp, Wallet, Percent, Save, Edit2, Check, X, Users, FileText, DollarSign } from "lucide-react";

const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MESES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const ANO_ATUAL = new Date().getFullYear();

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}
function pctAtingimento(real: number, meta: number): number | null {
  if (meta <= 0) return null;
  return (real / meta) * 100;
}
function corAtingimento(pct: number | null) {
  if (pct === null) return "text-gray-300";
  if (pct >= 100) return "text-green-600";
  if (pct >= 80) return "text-amber-500";
  return "text-red-500";
}
function bgAtingimento(pct: number | null) {
  if (pct === null) return "";
  if (pct >= 100) return "bg-green-50";
  if (pct >= 80) return "bg-amber-50";
  return "bg-red-50";
}

type MesEdit = {
  pctCarteira: string;
  pctAngariacao: string;
  valorCarteira: string;
  valorAngariacao: string;
  metaCpfs: string;
  metaPropostas: string;
  metaReceita: string;
  modo: "pct" | "valor";
};

export default function Metas() {
  const [anoBase, setAnoBase] = useState(ANO_ATUAL - 1);
  const [anoMeta, setAnoMeta] = useState(ANO_ATUAL);
  const [aplicandoGlobal, setAplicandoGlobal] = useState(false);
  const [pctGlobalCarteira, setPctGlobalCarteira] = useState("");
  const [pctGlobalAngariacao, setPctGlobalAngariacao] = useState("");
  const [mesEditando, setMesEditando] = useState<number | null>(null);
  const [mesEdit, setMesEdit] = useState<MesEdit>({
    pctCarteira: "", pctAngariacao: "", valorCarteira: "", valorAngariacao: "",
    metaCpfs: "", metaPropostas: "", metaReceita: "", modo: "pct"
  });
  const [salvando, setSalvando] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<"carteira" | "vendas">("carteira");

  const utils = trpc.useUtils();

  // Dados do ano base (realizado de carteira/angariação)
  const { data: carteiraBase } = trpc.financeiro.carteiraMensal.useQuery({ ano: anoBase });
  // Metas salvas do ano destino
  const { data: metasAno = [] } = trpc.financeiro.metasPorAno.useQuery({ ano: anoMeta });
  // Realizado de vendas do ano meta (propostas, CPFs, prêmio)
  const { data: vendasMeta = [] } = trpc.vendas.resumoMensal.useQuery({ ano: anoMeta });

  const salvarMeta = trpc.financeiro.salvarMeta.useMutation({
    onSuccess: () => {
      utils.financeiro.metasPorAno.invalidate({ ano: anoMeta });
      toast.success("Meta salva!");
      setSalvando(false);
      setMesEditando(null);
    },
    onError: (e) => { toast.error("Erro: " + e.message); setSalvando(false); },
  });

  // Organizar dados por mês
  const dadosMes = useMemo(() => {
    return MESES_ABREV.map((_, i) => {
      const mesNum = i + 1;
      const realCarteira = carteiraBase?.carteira[i] ?? 0;
      const realAngariacao = carteiraBase?.angariacao[i] ?? 0;
      const meta = metasAno.find((m: any) => m.mes === mesNum);
      const metaCarteira = meta ? parseFloat(meta.metaCarteira || "0") : 0;
      const metaAngariacao = meta ? parseFloat(meta.metaAngariacao || "0") : 0;
      const metaReceita = meta ? parseFloat(meta.metaReceita || "0") : 0;
      const metaCpfs = meta ? (meta.metaCpfs ?? 0) : 0;
      const metaPropostas = meta ? (meta.metaPropostas ?? 0) : 0;

      // Realizado de vendas do ano meta
      const vMes = vendasMeta.find((v: any) => Number(v.mes) === mesNum);
      const realPropostas = vMes ? Number(vMes.totalVendas || 0) : 0;
      const realCpfs = vMes ? Number(vMes.cpfNovos || 0) : 0;
      const realPremio = vMes ? Number(vMes.faturamento || 0) : 0;

      const pctCarteira = realCarteira > 0 && metaCarteira > 0 ? ((metaCarteira - realCarteira) / realCarteira) * 100 : null;
      const pctAngariacao = realAngariacao > 0 && metaAngariacao > 0 ? ((metaAngariacao - realAngariacao) / realAngariacao) * 100 : null;

      return {
        mesNum, realCarteira, realAngariacao, metaCarteira, metaAngariacao, metaReceita,
        metaCpfs, metaPropostas, realPropostas, realCpfs, realPremio,
        pctCarteira, pctAngariacao, meta,
        atingCarteira: pctAtingimento(realCarteira, metaCarteira),
        atingAngariacao: pctAtingimento(realAngariacao, metaAngariacao),
        atingPropostas: pctAtingimento(realPropostas, metaPropostas),
        atingCpfs: pctAtingimento(realCpfs, metaCpfs),
        atingReceita: pctAtingimento(realPremio, metaReceita),
      };
    });
  }, [carteiraBase, metasAno, vendasMeta]);

  // Totais
  const totais = useMemo(() => ({
    totalRealCarteira: dadosMes.reduce((s, d) => s + d.realCarteira, 0),
    totalRealAngariacao: dadosMes.reduce((s, d) => s + d.realAngariacao, 0),
    totalMetaCarteira: dadosMes.reduce((s, d) => s + d.metaCarteira, 0),
    totalMetaAngariacao: dadosMes.reduce((s, d) => s + d.metaAngariacao, 0),
    totalMetaPropostas: dadosMes.reduce((s, d) => s + d.metaPropostas, 0),
    totalMetaCpfs: dadosMes.reduce((s, d) => s + d.metaCpfs, 0),
    totalRealPropostas: dadosMes.reduce((s, d) => s + d.realPropostas, 0),
    totalRealCpfs: dadosMes.reduce((s, d) => s + d.realCpfs, 0),
    totalRealPremio: dadosMes.reduce((s, d) => s + d.realPremio, 0),
    totalMetaReceita: dadosMes.reduce((s, d) => s + d.metaReceita, 0),
  }), [dadosMes]);

  function abrirEdicao(mesIdx: number) {
    const d = dadosMes[mesIdx];
    const pctC = d.realCarteira > 0 && d.metaCarteira > 0
      ? (((d.metaCarteira - d.realCarteira) / d.realCarteira) * 100).toFixed(1) : "";
    const pctA = d.realAngariacao > 0 && d.metaAngariacao > 0
      ? (((d.metaAngariacao - d.realAngariacao) / d.realAngariacao) * 100).toFixed(1) : "";
    setMesEdit({
      pctCarteira: pctC, pctAngariacao: pctA,
      valorCarteira: d.metaCarteira > 0 ? d.metaCarteira.toFixed(2) : "",
      valorAngariacao: d.metaAngariacao > 0 ? d.metaAngariacao.toFixed(2) : "",
      metaCpfs: d.metaCpfs > 0 ? String(d.metaCpfs) : "",
      metaPropostas: d.metaPropostas > 0 ? String(d.metaPropostas) : "",
      metaReceita: d.metaReceita > 0 ? d.metaReceita.toFixed(2) : "",
      modo: "pct",
    });
    setMesEditando(mesIdx);
  }

  function calcMetaFromEdit(mesIdx: number) {
    const d = dadosMes[mesIdx];
    let carteira: number, angariacao: number;
    if (mesEdit.modo === "pct") {
      const pC = parseFloat(mesEdit.pctCarteira) || 0;
      const pA = parseFloat(mesEdit.pctAngariacao) || 0;
      carteira = d.realCarteira > 0 ? d.realCarteira * (1 + pC / 100) : parseFloat(mesEdit.valorCarteira) || 0;
      angariacao = d.realAngariacao > 0 ? d.realAngariacao * (1 + pA / 100) : parseFloat(mesEdit.valorAngariacao) || 0;
    } else {
      carteira = parseFloat(mesEdit.valorCarteira) || 0;
      angariacao = parseFloat(mesEdit.valorAngariacao) || 0;
    }
    return { carteira, angariacao };
  }

  function salvarMes() {
    if (mesEditando === null) return;
    setSalvando(true);
    const { carteira, angariacao } = calcMetaFromEdit(mesEditando);
    const metaReceita = parseFloat(mesEdit.metaReceita) || (carteira + angariacao);
    salvarMeta.mutate({
      ano: anoMeta,
      mes: mesEditando + 1,
      metaReceita: metaReceita.toFixed(2),
      metaCarteira: carteira.toFixed(2),
      metaAngariacao: angariacao.toFixed(2),
      metaCpfs: parseInt(mesEdit.metaCpfs) || null,
      metaPropostas: parseInt(mesEdit.metaPropostas) || null,
    });
  }

  async function aplicarGlobal() {
    const pC = parseFloat(pctGlobalCarteira) || 0;
    const pA = parseFloat(pctGlobalAngariacao) || 0;
    if (pC === 0 && pA === 0) { toast.error("Informe pelo menos um percentual"); return; }
    setSalvando(true);
    let salvos = 0;
    for (const d of dadosMes) {
      if (d.realCarteira === 0 && d.realAngariacao === 0) continue;
      const novaCarteira = pC !== 0 ? d.realCarteira * (1 + pC / 100) : d.metaCarteira || d.realCarteira;
      const novaAngariacao = pA !== 0 ? d.realAngariacao * (1 + pA / 100) : d.metaAngariacao || d.realAngariacao;
      await salvarMeta.mutateAsync({
        ano: anoMeta, mes: d.mesNum,
        metaReceita: (novaCarteira + novaAngariacao).toFixed(2),
        metaCarteira: novaCarteira.toFixed(2),
        metaAngariacao: novaAngariacao.toFixed(2),
        metaCpfs: d.meta?.metaCpfs ?? null,
        metaPropostas: d.meta?.metaPropostas ?? null,
      });
      salvos++;
    }
    setSalvando(false);
    setAplicandoGlobal(false);
    setPctGlobalCarteira(""); setPctGlobalAngariacao("");
    toast.success(`Metas aplicadas para ${salvos} meses!`);
    utils.financeiro.metasPorAno.invalidate({ ano: anoMeta });
  }

  const pctGlobalPreviewC = parseFloat(pctGlobalCarteira) || 0;
  const pctGlobalPreviewA = parseFloat(pctGlobalAngariacao) || 0;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #1a2f5e, #2d4a8a)" }}>
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Metas</h1>
              <p className="text-sm text-gray-500">Comparativo realizado × meta — Carteira, Angariação e Vendas</p>
            </div>
          </div>
          <Button variant="outline" className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={() => setAplicandoGlobal(v => !v)}>
            <Percent className="w-4 h-4" /> Aplicar % Global
          </Button>
        </div>

        {/* Seletores de ano */}
        <div className="flex flex-wrap gap-4">
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
            <div className="text-xs text-gray-500 mb-1 font-medium">Ano Base (Realizado)</div>
            <div className="flex items-center gap-2">
              <button onClick={() => setAnoBase(a => a - 1)} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-4 h-4 text-gray-600" /></button>
              <span className="text-lg font-bold text-gray-800 w-14 text-center">{anoBase}</span>
              <button onClick={() => setAnoBase(a => a + 1)} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronRight className="w-4 h-4 text-gray-600" /></button>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-blue-200 px-4 py-3 shadow-sm">
            <div className="text-xs text-blue-600 mb-1 font-medium">Ano Meta (Destino)</div>
            <div className="flex items-center gap-2">
              <button onClick={() => setAnoMeta(a => a - 1)} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-4 h-4 text-gray-600" /></button>
              <span className="text-lg font-bold text-blue-700 w-14 text-center">{anoMeta}</span>
              <button onClick={() => setAnoMeta(a => a + 1)} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronRight className="w-4 h-4 text-gray-600" /></button>
            </div>
          </div>
        </div>

        {/* Painel de Aplicação Global */}
        {aplicandoGlobal && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-blue-600" />
              <h3 className="font-semibold text-blue-800">Aplicar percentual global — {anoBase} → {anoMeta}</h3>
            </div>
            <p className="text-sm text-blue-700">
              Informe o percentual de crescimento. Será aplicado sobre os valores realizados de <strong>{anoBase}</strong> para gerar as metas de <strong>{anoMeta}</strong>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">
                  <Wallet className="w-3 h-3 inline mr-1 text-purple-500" /> Crescimento Carteira (%)
                </label>
                <div className="flex items-center gap-2">
                  <Input type="number" step="0.1" placeholder="ex: 10" value={pctGlobalCarteira}
                    onChange={e => setPctGlobalCarteira(e.target.value)} className="w-32" />
                  {pctGlobalPreviewC !== 0 && totais.totalRealCarteira > 0 && (
                    <span className="text-xs text-purple-700 font-medium">
                      → {fmt(totais.totalRealCarteira * (1 + pctGlobalPreviewC / 100))} anual
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">
                  <TrendingUp className="w-3 h-3 inline mr-1 text-amber-500" /> Crescimento Angariação (%)
                </label>
                <div className="flex items-center gap-2">
                  <Input type="number" step="0.1" placeholder="ex: 5" value={pctGlobalAngariacao}
                    onChange={e => setPctGlobalAngariacao(e.target.value)} className="w-32" />
                  {pctGlobalPreviewA !== 0 && totais.totalRealAngariacao > 0 && (
                    <span className="text-xs text-amber-700 font-medium">
                      → {fmt(totais.totalRealAngariacao * (1 + pctGlobalPreviewA / 100))} anual
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={aplicarGlobal} disabled={salvando} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                <Save className="w-4 h-4" />
                {salvando ? "Aplicando..." : `Aplicar para todos os meses de ${anoMeta}`}
              </Button>
              <Button variant="outline" onClick={() => setAplicandoGlobal(false)}>Cancelar</Button>
            </div>
          </div>
        )}

        {/* Abas */}
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setAbaAtiva("carteira")}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${abaAtiva === "carteira" ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            <Wallet className="w-4 h-4 inline mr-1" /> Carteira & Angariação
          </button>
          <button
            onClick={() => setAbaAtiva("vendas")}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${abaAtiva === "vendas" ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            <FileText className="w-4 h-4 inline mr-1" /> Vendas (Propostas & CPFs)
          </button>
        </div>

        {/* ABA CARTEIRA */}
        {abaAtiva === "carteira" && (
          <>
            {/* Cards de Totais */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="text-xs text-gray-500 font-medium mb-1">Carteira {anoBase} (Real)</div>
                <div className="text-lg font-black text-purple-700">{fmt(totais.totalRealCarteira)}</div>
              </div>
              <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-4">
                <div className="text-xs text-blue-600 font-medium mb-1">Meta Carteira {anoMeta}</div>
                <div className="text-lg font-black text-blue-700">{totais.totalMetaCarteira > 0 ? fmt(totais.totalMetaCarteira) : "—"}</div>
                {totais.totalMetaCarteira > 0 && totais.totalRealCarteira > 0 && (
                  <div className={`text-xs font-medium mt-0.5 ${totais.totalMetaCarteira >= totais.totalRealCarteira ? "text-green-600" : "text-red-500"}`}>
                    {fmtPct(((totais.totalMetaCarteira - totais.totalRealCarteira) / totais.totalRealCarteira) * 100)}
                  </div>
                )}
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="text-xs text-gray-500 font-medium mb-1">Angariação {anoBase} (Real)</div>
                <div className="text-lg font-black text-amber-600">{fmt(totais.totalRealAngariacao)}</div>
              </div>
              <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-4">
                <div className="text-xs text-blue-600 font-medium mb-1">Meta Angariação {anoMeta}</div>
                <div className="text-lg font-black text-blue-700">{totais.totalMetaAngariacao > 0 ? fmt(totais.totalMetaAngariacao) : "—"}</div>
                {totais.totalMetaAngariacao > 0 && totais.totalRealAngariacao > 0 && (
                  <div className={`text-xs font-medium mt-0.5 ${totais.totalMetaAngariacao >= totais.totalRealAngariacao ? "text-green-600" : "text-red-500"}`}>
                    {fmtPct(((totais.totalMetaAngariacao - totais.totalRealAngariacao) / totais.totalRealAngariacao) * 100)}
                  </div>
                )}
              </div>
            </div>

            {/* Tabela Carteira */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h2 className="text-base font-bold text-gray-800">Comparativo Mensal — {anoBase} vs Metas {anoMeta}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Clique em <Edit2 className="w-3 h-3 inline" /> para editar a meta de um mês</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 w-24">Mês</th>
                      <th className="text-right px-3 py-3 font-semibold text-purple-600">Carteira {anoBase}</th>
                      <th className="text-right px-3 py-3 font-semibold text-blue-600">Meta Carteira {anoMeta}</th>
                      <th className="text-right px-3 py-3 font-semibold text-gray-500">Δ%</th>
                      <th className="text-right px-3 py-3 font-semibold text-amber-600">Angariação {anoBase}</th>
                      <th className="text-right px-3 py-3 font-semibold text-blue-600">Meta Angariação {anoMeta}</th>
                      <th className="text-right px-3 py-3 font-semibold text-gray-500">Δ%</th>
                      <th className="text-center px-3 py-3 font-semibold text-gray-500">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dadosMes.map((d, i) => (
                      <tr key={i} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${mesEditando === i ? "bg-blue-50/30" : ""}`}>
                        <td className="px-4 py-3 font-semibold text-gray-700">{MESES_FULL[i]}</td>
                        <td className="text-right px-3 py-3 text-purple-700 font-medium">
                          {d.realCarteira > 0 ? fmt(d.realCarteira) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="text-right px-3 py-3">
                          {mesEditando === i ? (
                            <div className="flex items-center justify-end gap-1">
                              {mesEdit.modo === "pct" ? (
                                <div className="flex items-center gap-1">
                                  <Input type="number" step="0.1" placeholder="%" value={mesEdit.pctCarteira}
                                    onChange={e => setMesEdit(f => ({ ...f, pctCarteira: e.target.value }))}
                                    className="w-20 h-7 text-xs text-right" />
                                  <span className="text-xs text-gray-400">%</span>
                                  {mesEdit.pctCarteira && d.realCarteira > 0 && (
                                    <span className="text-xs text-blue-600 font-medium ml-1">
                                      ={fmt(d.realCarteira * (1 + (parseFloat(mesEdit.pctCarteira) || 0) / 100))}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <Input type="number" step="0.01" placeholder="Valor" value={mesEdit.valorCarteira}
                                  onChange={e => setMesEdit(f => ({ ...f, valorCarteira: e.target.value }))}
                                  className="w-32 h-7 text-xs text-right" />
                              )}
                            </div>
                          ) : (
                            <span className={d.metaCarteira > 0 ? "text-blue-700 font-semibold" : "text-gray-300"}>
                              {d.metaCarteira > 0 ? fmt(d.metaCarteira) : "—"}
                            </span>
                          )}
                        </td>
                        <td className="text-right px-3 py-3">
                          {mesEditando === i && mesEdit.modo === "pct" && mesEdit.pctCarteira ? (
                            <span className={`text-xs font-bold ${parseFloat(mesEdit.pctCarteira) >= 0 ? "text-green-600" : "text-red-500"}`}>
                              {parseFloat(mesEdit.pctCarteira) >= 0 ? "+" : ""}{parseFloat(mesEdit.pctCarteira).toFixed(1)}%
                            </span>
                          ) : d.pctCarteira !== null ? (
                            <span className={`text-xs font-bold ${d.pctCarteira >= 0 ? "text-green-600" : "text-red-500"}`}>
                              {fmtPct(d.pctCarteira)}
                            </span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="text-right px-3 py-3 text-amber-600 font-medium">
                          {d.realAngariacao > 0 ? fmt(d.realAngariacao) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="text-right px-3 py-3">
                          {mesEditando === i ? (
                            <div className="flex items-center justify-end gap-1">
                              {mesEdit.modo === "pct" ? (
                                <div className="flex items-center gap-1">
                                  <Input type="number" step="0.1" placeholder="%" value={mesEdit.pctAngariacao}
                                    onChange={e => setMesEdit(f => ({ ...f, pctAngariacao: e.target.value }))}
                                    className="w-20 h-7 text-xs text-right" />
                                  <span className="text-xs text-gray-400">%</span>
                                  {mesEdit.pctAngariacao && d.realAngariacao > 0 && (
                                    <span className="text-xs text-blue-600 font-medium ml-1">
                                      ={fmt(d.realAngariacao * (1 + (parseFloat(mesEdit.pctAngariacao) || 0) / 100))}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <Input type="number" step="0.01" placeholder="Valor" value={mesEdit.valorAngariacao}
                                  onChange={e => setMesEdit(f => ({ ...f, valorAngariacao: e.target.value }))}
                                  className="w-32 h-7 text-xs text-right" />
                              )}
                            </div>
                          ) : (
                            <span className={d.metaAngariacao > 0 ? "text-blue-700 font-semibold" : "text-gray-300"}>
                              {d.metaAngariacao > 0 ? fmt(d.metaAngariacao) : "—"}
                            </span>
                          )}
                        </td>
                        <td className="text-right px-3 py-3">
                          {mesEditando === i && mesEdit.modo === "pct" && mesEdit.pctAngariacao ? (
                            <span className={`text-xs font-bold ${parseFloat(mesEdit.pctAngariacao) >= 0 ? "text-green-600" : "text-red-500"}`}>
                              {parseFloat(mesEdit.pctAngariacao) >= 0 ? "+" : ""}{parseFloat(mesEdit.pctAngariacao).toFixed(1)}%
                            </span>
                          ) : d.pctAngariacao !== null ? (
                            <span className={`text-xs font-bold ${d.pctAngariacao >= 0 ? "text-green-600" : "text-red-500"}`}>
                              {fmtPct(d.pctAngariacao)}
                            </span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="text-center px-3 py-3">
                          {mesEditando === i ? (
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => setMesEdit(f => ({ ...f, modo: f.modo === "pct" ? "valor" : "pct" }))}
                                className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium"
                                title={mesEdit.modo === "pct" ? "Mudar para valor fixo" : "Mudar para percentual"}>
                                {mesEdit.modo === "pct" ? "%" : "R$"}
                              </button>
                              <button onClick={salvarMes} disabled={salvando}
                                className="p-1.5 rounded-lg bg-green-100 hover:bg-green-200 text-green-700" title="Salvar">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setMesEditando(null)}
                                className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500" title="Cancelar">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => abrirEdicao(i)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 hover:text-blue-700 transition-colors" title="Editar meta">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                      <td className="px-4 py-3 text-gray-700">TOTAL</td>
                      <td className="text-right px-3 py-3 text-purple-700">{fmt(totais.totalRealCarteira)}</td>
                      <td className="text-right px-3 py-3 text-blue-700">{totais.totalMetaCarteira > 0 ? fmt(totais.totalMetaCarteira) : "—"}</td>
                      <td className="text-right px-3 py-3">
                        {totais.totalMetaCarteira > 0 && totais.totalRealCarteira > 0 && (
                          <span className={`text-xs font-bold ${totais.totalMetaCarteira >= totais.totalRealCarteira ? "text-green-600" : "text-red-500"}`}>
                            {fmtPct(((totais.totalMetaCarteira - totais.totalRealCarteira) / totais.totalRealCarteira) * 100)}
                          </span>
                        )}
                      </td>
                      <td className="text-right px-3 py-3 text-amber-600">{fmt(totais.totalRealAngariacao)}</td>
                      <td className="text-right px-3 py-3 text-blue-700">{totais.totalMetaAngariacao > 0 ? fmt(totais.totalMetaAngariacao) : "—"}</td>
                      <td className="text-right px-3 py-3">
                        {totais.totalMetaAngariacao > 0 && totais.totalRealAngariacao > 0 && (
                          <span className={`text-xs font-bold ${totais.totalMetaAngariacao >= totais.totalRealAngariacao ? "text-green-600" : "text-red-500"}`}>
                            {fmtPct(((totais.totalMetaAngariacao - totais.totalRealAngariacao) / totais.totalRealAngariacao) * 100)}
                          </span>
                        )}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ABA VENDAS */}
        {abaAtiva === "vendas" && (
          <>
            {/* Cards de totais de vendas */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="text-xs text-gray-500 font-medium mb-1 flex items-center gap-1"><FileText className="w-3 h-3" /> Propostas {anoMeta} (Real)</div>
                <div className="text-2xl font-black text-green-700">{totais.totalRealPropostas}</div>
                {totais.totalMetaPropostas > 0 && (
                  <div className={`text-xs font-medium mt-0.5 ${corAtingimento(pctAtingimento(totais.totalRealPropostas, totais.totalMetaPropostas))}`}>
                    {pctAtingimento(totais.totalRealPropostas, totais.totalMetaPropostas)?.toFixed(0)}% da meta ({totais.totalMetaPropostas} propostas)
                  </div>
                )}
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="text-xs text-gray-500 font-medium mb-1 flex items-center gap-1"><Users className="w-3 h-3" /> CPFs Novos {anoMeta} (Real)</div>
                <div className="text-2xl font-black text-blue-700">{totais.totalRealCpfs}</div>
                {totais.totalMetaCpfs > 0 && (
                  <div className={`text-xs font-medium mt-0.5 ${corAtingimento(pctAtingimento(totais.totalRealCpfs, totais.totalMetaCpfs))}`}>
                    {pctAtingimento(totais.totalRealCpfs, totais.totalMetaCpfs)?.toFixed(0)}% da meta ({totais.totalMetaCpfs} CPFs)
                  </div>
                )}
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="text-xs text-gray-500 font-medium mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Prêmio {anoMeta} (Real)</div>
                <div className="text-lg font-black text-emerald-700">{fmt(totais.totalRealPremio)}</div>
                {totais.totalMetaReceita > 0 && (
                  <div className={`text-xs font-medium mt-0.5 ${corAtingimento(pctAtingimento(totais.totalRealPremio, totais.totalMetaReceita))}`}>
                    {pctAtingimento(totais.totalRealPremio, totais.totalMetaReceita)?.toFixed(0)}% da meta
                  </div>
                )}
              </div>
              <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-4">
                <div className="text-xs text-blue-600 font-medium mb-1">Meta Anual Receita {anoMeta}</div>
                <div className="text-lg font-black text-blue-700">{totais.totalMetaReceita > 0 ? fmt(totais.totalMetaReceita) : "—"}</div>
                <div className="text-xs text-gray-400 mt-0.5">{totais.totalMetaPropostas} propostas · {totais.totalMetaCpfs} CPFs</div>
              </div>
            </div>

            {/* Tabela Vendas */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h2 className="text-base font-bold text-gray-800">Metas de Vendas — {anoMeta}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Realizado vs meta de propostas, CPFs novos e receita. Clique em <Edit2 className="w-3 h-3 inline" /> para editar.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 w-24">Mês</th>
                      <th className="text-right px-3 py-3 font-semibold text-green-600">Propostas Real</th>
                      <th className="text-right px-3 py-3 font-semibold text-blue-600">Meta Propostas</th>
                      <th className="text-right px-3 py-3 font-semibold text-gray-500">Ating.</th>
                      <th className="text-right px-3 py-3 font-semibold text-blue-600">CPFs Novos Real</th>
                      <th className="text-right px-3 py-3 font-semibold text-blue-600">Meta CPFs</th>
                      <th className="text-right px-3 py-3 font-semibold text-gray-500">Ating.</th>
                      <th className="text-right px-3 py-3 font-semibold text-emerald-600">Prêmio Real</th>
                      <th className="text-right px-3 py-3 font-semibold text-blue-600">Meta Receita</th>
                      <th className="text-center px-3 py-3 font-semibold text-gray-500">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dadosMes.map((d, i) => (
                      <tr key={i} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${mesEditando === i ? "bg-blue-50/30" : ""}`}>
                        <td className="px-4 py-3 font-semibold text-gray-700">{MESES_FULL[i]}</td>

                        {/* Propostas Real */}
                        <td className="text-right px-3 py-3 text-green-700 font-medium">
                          {d.realPropostas > 0 ? d.realPropostas : <span className="text-gray-300">—</span>}
                        </td>

                        {/* Meta Propostas */}
                        <td className="text-right px-3 py-3">
                          {mesEditando === i ? (
                            <Input type="number" step="1" placeholder="Meta" value={mesEdit.metaPropostas}
                              onChange={e => setMesEdit(f => ({ ...f, metaPropostas: e.target.value }))}
                              className="w-20 h-7 text-xs text-right" />
                          ) : (
                            <span className={d.metaPropostas > 0 ? "text-blue-700 font-semibold" : "text-gray-300"}>
                              {d.metaPropostas > 0 ? d.metaPropostas : "—"}
                            </span>
                          )}
                        </td>

                        {/* Atingimento Propostas */}
                        <td className={`text-right px-3 py-3 ${bgAtingimento(d.atingPropostas)}`}>
                          {d.atingPropostas !== null ? (
                            <span className={`text-xs font-bold ${corAtingimento(d.atingPropostas)}`}>
                              {d.atingPropostas.toFixed(0)}%
                            </span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>

                        {/* CPFs Novos Real */}
                        <td className="text-right px-3 py-3 text-blue-700 font-medium">
                          {d.realCpfs > 0 ? d.realCpfs : <span className="text-gray-300">—</span>}
                        </td>

                        {/* Meta CPFs */}
                        <td className="text-right px-3 py-3">
                          {mesEditando === i ? (
                            <Input type="number" step="1" placeholder="Meta" value={mesEdit.metaCpfs}
                              onChange={e => setMesEdit(f => ({ ...f, metaCpfs: e.target.value }))}
                              className="w-20 h-7 text-xs text-right" />
                          ) : (
                            <span className={d.metaCpfs > 0 ? "text-blue-700 font-semibold" : "text-gray-300"}>
                              {d.metaCpfs > 0 ? d.metaCpfs : "—"}
                            </span>
                          )}
                        </td>

                        {/* Atingimento CPFs */}
                        <td className={`text-right px-3 py-3 ${bgAtingimento(d.atingCpfs)}`}>
                          {d.atingCpfs !== null ? (
                            <span className={`text-xs font-bold ${corAtingimento(d.atingCpfs)}`}>
                              {d.atingCpfs.toFixed(0)}%
                            </span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>

                        {/* Prêmio Real */}
                        <td className="text-right px-3 py-3 text-emerald-700 font-medium">
                          {d.realPremio > 0 ? fmt(d.realPremio) : <span className="text-gray-300">—</span>}
                        </td>

                        {/* Meta Receita */}
                        <td className="text-right px-3 py-3">
                          {mesEditando === i ? (
                            <Input type="number" step="0.01" placeholder="Meta R$" value={mesEdit.metaReceita}
                              onChange={e => setMesEdit(f => ({ ...f, metaReceita: e.target.value }))}
                              className="w-32 h-7 text-xs text-right" />
                          ) : (
                            <span className={d.metaReceita > 0 ? "text-blue-700 font-semibold" : "text-gray-300"}>
                              {d.metaReceita > 0 ? fmt(d.metaReceita) : "—"}
                            </span>
                          )}
                        </td>

                        {/* Ação */}
                        <td className="text-center px-3 py-3">
                          {mesEditando === i ? (
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={salvarMes} disabled={salvando}
                                className="p-1.5 rounded-lg bg-green-100 hover:bg-green-200 text-green-700" title="Salvar">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setMesEditando(null)}
                                className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500" title="Cancelar">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => abrirEdicao(i)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 hover:text-blue-700 transition-colors" title="Editar meta">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                      <td className="px-4 py-3 text-gray-700">TOTAL</td>
                      <td className="text-right px-3 py-3 text-green-700">{totais.totalRealPropostas}</td>
                      <td className="text-right px-3 py-3 text-blue-700">{totais.totalMetaPropostas > 0 ? totais.totalMetaPropostas : "—"}</td>
                      <td className="text-right px-3 py-3">
                        {totais.totalMetaPropostas > 0 && (
                          <span className={`text-xs font-bold ${corAtingimento(pctAtingimento(totais.totalRealPropostas, totais.totalMetaPropostas))}`}>
                            {pctAtingimento(totais.totalRealPropostas, totais.totalMetaPropostas)?.toFixed(0)}%
                          </span>
                        )}
                      </td>
                      <td className="text-right px-3 py-3 text-blue-700">{totais.totalRealCpfs}</td>
                      <td className="text-right px-3 py-3 text-blue-700">{totais.totalMetaCpfs > 0 ? totais.totalMetaCpfs : "—"}</td>
                      <td className="text-right px-3 py-3">
                        {totais.totalMetaCpfs > 0 && (
                          <span className={`text-xs font-bold ${corAtingimento(pctAtingimento(totais.totalRealCpfs, totais.totalMetaCpfs))}`}>
                            {pctAtingimento(totais.totalRealCpfs, totais.totalMetaCpfs)?.toFixed(0)}%
                          </span>
                        )}
                      </td>
                      <td className="text-right px-3 py-3 text-emerald-700">{fmt(totais.totalRealPremio)}</td>
                      <td className="text-right px-3 py-3 text-blue-700">{totais.totalMetaReceita > 0 ? fmt(totais.totalMetaReceita) : "—"}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Legenda */}
        <div className="text-xs text-gray-400 flex flex-wrap gap-4">
          <span><span className="text-green-600 font-medium">Verde</span> = ≥ 100% da meta</span>
          <span><span className="text-amber-500 font-medium">Amarelo</span> = 80–99% da meta</span>
          <span><span className="text-red-500 font-medium">Vermelho</span> = &lt; 80% da meta</span>
          <span>Modo <strong>%</strong> = percentual sobre o realizado | Modo <strong>R$</strong> = valor fixo</span>
        </div>
      </div>
    </AppLayout>
  );
}

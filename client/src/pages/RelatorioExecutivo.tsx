import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Printer, Save, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle, Target, Users, Zap, BarChart2, Download
} from "lucide-react";
import { toast } from "sonner";
import { useRef, useCallback } from "react";
import { BARCELLOS_LOGO_BASE64 } from "@/lib/barcellosLogo";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend
} from "recharts";

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MESES_ABREV = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const fmt = (v: number) => v >= 1_000_000
  ? `R$ ${(v / 1_000_000).toFixed(2).replace(".", ",")}M`
  : v >= 1_000
    ? `R$ ${(v / 1_000).toFixed(1).replace(".", ",")}k`
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtFull = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtN = (v: number) => v.toLocaleString("pt-BR");

const AVATAR_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#ec4899"];

function statusColor(pct: number) {
  if (pct >= 100) return { bg: "#dcfce7", text: "#15803d", border: "#10b981", label: "VERDE", icon: "✅" };
  if (pct >= 80) return { bg: "#fef9c3", text: "#92400e", border: "#f59e0b", label: "AMARELO", icon: "⚠️" };
  return { bg: "#fee2e2", text: "#b91c1c", border: "#ef4444", label: "VERMELHO", icon: "⚠️" };
}

function StatusPill({ pct, label }: { pct: number; label?: string }) {
  const s = statusColor(pct);
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.text }}>
      {s.icon} {label || `${pct.toFixed(0)}% da meta`}
    </span>
  );
}

function MetaProximoMes({ mes, ano }: { mes: number; ano: number }) {
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const proximoAno = mes === 12 ? ano + 1 : ano;
  const { data: metas } = trpc.financeiro.metasPorAno.useQuery({ ano: proximoAno });
  const metaProx = metas?.find((m: any) => m.mes === proximoMes);
  if (!metaProx) return <div className="text-xs text-gray-400 py-2">Nenhuma meta definida para {MESES[proximoMes]} {proximoAno}. Configure na aba Metas.</div>;
  return (
    <div className="grid grid-cols-3 gap-3 my-3">
      <div className="bg-blue-50 rounded-lg p-3 text-center">
        <div className="text-xs text-blue-500 font-semibold mb-1">Meta Receita</div>
        <div className="text-lg font-black text-blue-700">{fmt(parseFloat(metaProx.metaReceita || "0"))}</div>
      </div>
      <div className="bg-green-50 rounded-lg p-3 text-center">
        <div className="text-xs text-green-500 font-semibold mb-1">Meta Carteira</div>
        <div className="text-lg font-black text-green-700">{fmt(parseFloat(metaProx.metaCarteira || "0"))}</div>
      </div>
      <div className="bg-purple-50 rounded-lg p-3 text-center">
        <div className="text-xs text-purple-500 font-semibold mb-1">Meta Angariação</div>
        <div className="text-lg font-black text-purple-700">{fmt(parseFloat(metaProx.metaAngariacao || "0"))}</div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, sub2, pct, color }: {
  label: string; value: string; sub?: string; sub2?: string; pct?: number; color?: string;
}) {
  const border = pct !== undefined ? statusColor(pct).border : (color || "#3b82f6");
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden" style={{ borderLeft: `4px solid ${border}` }}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{label}</div>
          {pct !== undefined && (
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: statusColor(pct).bg, color: statusColor(pct).text }}>
              {statusColor(pct).icon} {statusColor(pct).label}
            </span>
          )}
        </div>
        <div className="text-3xl font-black text-gray-900 mb-1">{value}</div>
        {sub && <div className="text-xs text-gray-500">{sub}</div>}
        {pct !== undefined && (
          <div className="mt-2">
            <StatusPill pct={pct} />
          </div>
        )}
        {sub2 && (
          <div className="mt-1 text-xs font-semibold" style={{ color: statusColor(pct ?? 100).text }}>
            {sub2}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-2xl font-black text-gray-900">{children}</h2>
      {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function EditableCard({ title, icon, value, onChange, placeholder }: {
  title: string; icon: React.ReactNode; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-yellow-500">{icon}</span>
        <span className="text-sm font-bold text-gray-700">{title}</span>
      </div>
      <Textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || "Clique para editar..."}
        className="text-sm text-gray-700 italic border-0 bg-transparent resize-none focus:ring-0 p-0 min-h-[80px]"
      />
    </div>
  );
}

export default function RelatorioExecutivo() {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [exportando, setExportando] = useState(false);
  const relatorioRef = useRef<HTMLDivElement>(null);

  const exportarPDF = useCallback(async () => {
    if (!relatorioRef.current) return;
    setExportando(true);
    toast.info("Gerando PDF com capa e seções separadas...");
    const container = relatorioRef.current;
    const noPrintEls: HTMLElement[] = [];
    const hiddenEls: HTMLElement[] = [];
    try {
      const { toJpeg } = await import("html-to-image");
      const { jsPDF } = await import("jspdf");

      // Ocultar botões e controles
      container.querySelectorAll<HTMLElement>(".no-print").forEach(el => {
        el.style.display = "none";
        noPrintEls.push(el);
      });
      // Ocultar textareas vazias
      container.querySelectorAll<HTMLTextAreaElement>("textarea").forEach(ta => {
        if (!ta.value.trim()) {
          ta.style.display = "none";
          hiddenEls.push(ta);
          const wrap = ta.parentElement?.parentElement;
          if (wrap && wrap.children.length <= 2) {
            wrap.style.display = "none";
            hiddenEls.push(wrap);
          }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 400));

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      // ── PÁGINA 1: CAPA PROFISSIONAL DEDICADA ──────────────────────────────
      const capaEl = container.querySelector<HTMLElement>('[data-pdf-section="capa"]');
      if (capaEl) {
        // Temporariamente expandir a capa para preencher a página inteira
        const origStyle = capaEl.getAttribute("style") || "";
        capaEl.style.minHeight = "1122px"; // altura A4 em px a 96dpi
        capaEl.style.display = "flex";
        capaEl.style.flexDirection = "column";
        capaEl.style.justifyContent = "center";
        await new Promise(resolve => setTimeout(resolve, 200));
        const capaUrl = await toJpeg(capaEl, { quality: 0.95, backgroundColor: "#0d1117", pixelRatio: 2 });
        capaEl.setAttribute("style", origStyle);
        const capaImg = new Image();
        await new Promise<void>((res, rej) => { capaImg.onload = () => res(); capaImg.onerror = rej; capaImg.src = capaUrl; });
        const capaH = (capaImg.height / capaImg.width) * pageW;
        pdf.addImage(capaUrl, "JPEG", 0, 0, pageW, Math.min(capaH, pageH));
      }

      // ── PÁGINAS SEGUINTES: CADA SEÇÃO ────────────────────────────────────
      const sectionNames = ["dashboard", "financeiro", "performance", "objetivos", "inadimplentes", "crm", "beneficiarios", "meta"];
      for (const name of sectionNames) {
        const el = container.querySelector<HTMLElement>(`[data-pdf-section="${name}"]`);
        if (!el || el.offsetParent === null) continue; // pula seções ocultas
        // Adicionar padding temporário para melhor visual
        const origPadding = el.style.padding;
        el.style.padding = "32px";
        el.style.background = "#f1f5f9";
        await new Promise(resolve => setTimeout(resolve, 150));
        const sectionUrl = await toJpeg(el, { quality: 0.93, backgroundColor: "#f1f5f9", pixelRatio: 2 });
        el.style.padding = origPadding;
        el.style.background = "";
        const sImg = new Image();
        await new Promise<void>((res, rej) => { sImg.onload = () => res(); sImg.onerror = rej; sImg.src = sectionUrl; });
        if (sImg.width === 0 || sImg.height === 0) continue;
        pdf.addPage();
        // Adicionar cabeçalho de seção
        pdf.setFillColor(13, 17, 23);
        pdf.rect(0, 0, pageW, 8, "F");
        pdf.setFontSize(7);
        pdf.setTextColor(100, 149, 237);
        pdf.text(`BARCELLOS SEGUROS  ·  RELATÓRIO EXECUTIVO ${MESES[mes].toUpperCase()} ${ano}`, 6, 5.5);
        pdf.setTextColor(150, 150, 150);
        pdf.text(`${new Date().toLocaleDateString("pt-BR")}`, pageW - 6, 5.5, { align: "right" });
        // Imagem da seção
        const imgH = (sImg.height / sImg.width) * pageW;
        const yStart = 9;
        const availH = pageH - yStart - 6;
        if (imgH <= availH) {
          pdf.addImage(sectionUrl, "JPEG", 0, yStart, pageW, imgH);
        } else {
          // Seção muito alta: quebrar em sub-páginas
          let offsetY = 0;
          let subPage = 0;
          while (offsetY < imgH) {
            if (subPage > 0) {
              pdf.addPage();
              pdf.setFillColor(13, 17, 23);
              pdf.rect(0, 0, pageW, 8, "F");
              pdf.setFontSize(7);
              pdf.setTextColor(100, 149, 237);
              pdf.text(`BARCELLOS SEGUROS  ·  RELATÓRIO EXECUTIVO ${MESES[mes].toUpperCase()} ${ano}`, 6, 5.5);
            }
            pdf.addImage(sectionUrl, "JPEG", 0, yStart - offsetY, pageW, imgH);
            offsetY += availH;
            subPage++;
            if (subPage > 10) break;
          }
        }
        // Rodapé
        pdf.setFontSize(7);
        pdf.setTextColor(180, 180, 180);
        pdf.text(`Confidencial — Uso Interno`, pageW / 2, pageH - 3, { align: "center" });
      }

      // Restaurar elementos
      noPrintEls.forEach(el => { el.style.display = ""; });
      hiddenEls.forEach(el => { el.style.display = ""; });

      const mesNomeArq = MESES[mes].toLowerCase()
        .replace(/ç/g, "c").replace(/ã/g, "a").replace(/á/g, "a")
        .replace(/é/g, "e").replace(/ê/g, "e").replace(/í/g, "i")
        .replace(/ó/g, "o").replace(/ô/g, "o").replace(/ú/g, "u");
      pdf.save(`relatorio-executivo-${mesNomeArq}-${ano}.pdf`);
      toast.success("PDF exportado com sucesso!");
    } catch (err: any) {
      console.error("Erro ao exportar PDF:", err);
      toast.error(`Erro ao gerar PDF: ${err?.message || "Tente novamente."}`);
      noPrintEls.forEach(el => { el.style.display = ""; });
      hiddenEls.forEach(el => { el.style.display = ""; });
    } finally {
      setExportando(false);
    }
  }, [mes, ano]);

  const { data: metricas, isLoading } = trpc.relatorio.obterMetricas.useQuery({ mes, ano });
  const { data: relatorio } = trpc.relatorio.obter.useQuery({ mes, ano });
  const { data: entradaSaidaData } = trpc.cancelados.entradaSaidaAcumulada.useQuery({ ano });

  const [insights, setInsights] = useState({
    insightReceita: "",
    insightColaboradores: "",
    acoesCorretivas: "",
    metaProximoMes: "",
    observacoesGerais: "",
    imap: "",
  });

  useEffect(() => {
    if (relatorio) {
      setInsights({
        insightReceita: relatorio.insightReceita || "",
        insightColaboradores: relatorio.insightColaboradores || "",
        acoesCorretivas: relatorio.acoesCorretivas || "",
        metaProximoMes: relatorio.metaProximoMes || "",
        observacoesGerais: relatorio.observacoesGerais || "",
        imap: relatorio.imap ? String(relatorio.imap) : "",
      });
    }
  }, [relatorio]);

  const salvarMutation = trpc.relatorio.salvar.useMutation({
    onSuccess: () => toast.success("Relatório salvo com sucesso!"),
    onError: () => toast.error("Erro ao salvar relatório"),
  });

  const m = metricas;
  const mesNome = MESES[mes];
  const mesAbrev = MESES_ABREV[mes];

  const pctReceita = m ? (m.metaReceita > 0 ? (m.receitaReal / m.metaReceita) * 100 : 0) : 0;
  const metaVendasEfetiva = m ? (m.metaVendas > 0 ? m.metaVendas : (m.metaPremioVendas || 0)) : 0;
  // Realizado de vendas = totalPremio (SUM valorPremio), igual ao que Metas→Vendas usa como "Prêmio Real"
  const pctVendas = m && metaVendasEfetiva > 0 ? (m.totalPremio / metaVendasEfetiva) * 100 : 0;
  const pctPropostas = m ? (m.metaPropostas > 0 ? (m.propostas / m.metaPropostas) * 100 : 0) : 0;
  const pctCpfs = m ? (m.metaCpfs > 0 ? (m.cpfsNovos / m.metaCpfs) * 100 : 0) : 0;
  const pctMargem = m ? (m.receitaReal > 0 ? (m.lucroLiquido / m.receitaReal) * 100 : 0) : 0;

  const statusGeral = pctReceita >= 100 && pctVendas >= 100 ? "BOM" : pctReceita >= 80 ? "ATENÇÃO" : "CRÍTICO";
  const statusGeralColor = statusGeral === "BOM" ? "#10b981" : statusGeral === "ATENÇÃO" ? "#f59e0b" : "#ef4444";

  // Dados para gráfico comparativo de receita
  const dadosReceita = m ? [
    { name: `Meta ${ano}`, value: m.metaReceita, fill: "#6b7280" },
    { name: `${mesAbrev}/${String(ano).slice(2)}`, value: m.receitaReal, fill: pctReceita >= 100 ? "#10b981" : pctReceita >= 80 ? "#f59e0b" : "#ef4444" },
    { name: `${mesAbrev}/${String(ano - 1).slice(2)}`, value: m.receitaAnoAnterior, fill: "#3b82f6" },
  ] : [];

  // Dados para gráfico de propostas por corretor (usando premio = valor da venda)
  const dadosCorretores = m?.corretores?.map((c: any, i: number) => ({
    name: c.nome?.split(" ")[0] || c.nome,
    propostas: c.propostas,
    premio: c.premio || c.receita,
    receita: c.receita,
    fill: AVATAR_COLORS[i % AVATAR_COLORS.length],
  })) || [];

  // Dados para projeção anual
  const dadosProjecao = m ? [
    { name: "Projeção Atual", value: m.projecaoAnual, fill: "#ef4444" },
    { name: `Meta ${ano}`, value: m.metaAnual, fill: "#3b82f6" },
  ] : [];

  return (
    <AppLayout>
      {/* ── PRINT STYLES ── */}
      <style>{`
        @media print {
          /* Ocultar elementos de navegação */
          .no-print { display: none !important; }
          nav, aside, header, [data-sidebar], .sidebar { display: none !important; }
          /* Forçar cores de fundo */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
          /* Layout de página */
          body { margin: 0; padding: 0; background: #f1f5f9 !important; }
          html { background: #f1f5f9 !important; }
          /* Quebra de página */
          .print-break { page-break-before: always; break-before: page; }
          .print-avoid-break { page-break-inside: avoid; break-inside: avoid; }
          /* Garantir que gradientes apareçam */
          [style*="background"] { -webkit-print-color-adjust: exact !important; }
          /* Tamanho da página */
          @page { size: A4; margin: 0; }
        }
      `}</style>

      <div ref={relatorioRef} className="min-h-screen bg-[#f1f5f9]">

        {/* ══ CAPA ══════════════════════════════════════════════════════════ */}
        <div data-pdf-section="capa" className="relative overflow-hidden print-section" style={{ background: "linear-gradient(135deg, #0d1117 60%, #1e3a8a 100%)", minHeight: 220 }}>
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1200&q=40')",
            backgroundSize: "cover", backgroundPosition: "center right"
          }} />
          <div className="relative z-10 px-8 py-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="mb-4">
                <img
                  src={BARCELLOS_LOGO_BASE64}
                  alt="Barcellos Seguros"
                  className="h-12 w-auto object-contain object-left"
                  style={{ filter: "brightness(0) invert(1)" }}
                />
              </div>
              <div className="text-gray-400 text-sm tracking-widest uppercase mb-1">Performance Report</div>
              <h1 className="text-4xl md:text-5xl font-black text-[#3b82f6] leading-tight">{mesNome} {ano}</h1>
              <div className="inline-block bg-[#2563eb] text-white font-black text-lg px-4 py-1 rounded mt-2">
                {mesAbrev.toUpperCase()}/{ano}
              </div>
              <div className="flex items-start gap-2 mt-3">
                <div className="w-1 bg-[#3b82f6] rounded-full mt-1" style={{ minHeight: 32 }} />
                <div>
                  <div className="text-white font-semibold text-sm">Análise vs Planejamento {ano}</div>
                  <div className="text-gray-400 text-xs">Comparação de resultados reais com metas estabelecidas</div>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 no-print">
              <div className="flex items-center gap-2">
                <select value={mes} onChange={e => setMes(Number(e.target.value))}
                  className="bg-white/10 text-white border border-white/20 rounded-lg px-3 py-1.5 text-sm font-semibold">
                  {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1} className="text-black">{m}</option>)}
                </select>
                <select value={ano} onChange={e => setAno(Number(e.target.value))}
                  className="bg-white/10 text-white border border-white/20 rounded-lg px-3 py-1.5 text-sm font-semibold">
                  {Array.from({ length: 10 }, (_, i) => 2020 + i).map(a => <option key={a} value={a} className="text-black">{a}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportarPDF}
                  disabled={exportando}
                  className="bg-white/10 text-white border-white/20 hover:bg-white/20">
                  <Download size={14} className="mr-1" /> {exportando ? "Gerando..." : "Exportar PDF"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()}
                  className="bg-white/10 text-white border-white/20 hover:bg-white/20">
                  <Printer size={14} className="mr-1" /> Imprimir
                </Button>
                <Button size="sm" onClick={() => salvarMutation.mutate({ mes, ano, ...insights })}
                  disabled={salvarMutation.isPending}
                  className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white">
                  <Save size={14} className="mr-1" /> Salvar
                </Button>
              </div>
            </div>
          </div>
          <div className="absolute bottom-3 right-6 text-right text-gray-400 text-xs flex flex-col items-end gap-1">
            <img
              src={BARCELLOS_LOGO_BASE64}
              alt="Barcellos Seguros"
              className="h-5 w-auto object-contain"
              style={{ filter: "brightness(0) invert(1) opacity(0.6)" }}
            />
            <div>Elaborado por</div>
            <div className="font-bold text-white">Equipe de Gestão</div>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#2563eb] border-t-transparent" />
          </div>
        )}

        {m && (
          <div className="px-6 py-8 space-y-10 max-w-7xl mx-auto">

            {/* ══ SLIDE 2: DASHBOARD EXECUTIVO ══════════════════════════════ */}
            <div data-pdf-section="dashboard">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-xs font-bold text-[#2563eb] uppercase tracking-widest mb-1">Dashboard Executivo</div>
                  <SectionTitle sub={`Análise de performance ${mesNome} ${ano} vs Planejamento e ${mesNome} ${ano - 1}`}>
                    Dashboard Executivo
                  </SectionTitle>
                </div>
                <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-2 shadow-sm border">
                  <div className="w-3 h-3 rounded-full" style={{ background: statusGeralColor }} />
                  <span className="text-sm font-bold" style={{ color: statusGeralColor }}>Status Geral: {statusGeral}</span>
                </div>
              </div>

              {/* 4 KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <KpiCard
                  label="Receita do Mês"
                  value={fmt(m.receitaReal)}
                  sub={`Meta Comissão: ${fmt(m.metaReceita)}`}
                  sub2={m.receitaAnoAnterior > 0 ? `vs ${mesAbrev}/${ano - 1}: ${fmt(m.receitaAnoAnterior)} (${m.variacaoReceita >= 0 ? "+" : ""}${m.variacaoReceita.toFixed(1)}%)` : undefined}
                  pct={pctReceita}
                />
                <KpiCard
                  label="Vendas (Comissão)"
                  value={fmt(m.receitaVendas)}
                  sub={metaVendasEfetiva > 0 ? `Meta: ${fmt(metaVendasEfetiva)} — ${pctVendas.toFixed(0)}% da meta` : `${m.propostas} vendas realizadas`}
                  pct={pctVendasEfetivo}
                />
                <KpiCard
                  label="Propostas Aceitas"
                  value={fmtN(m.propostas)}
                  sub={m.metaPropostas > 0 ? `Meta: ${m.metaPropostas} — ${pctPropostas.toFixed(0)}% atingido` : `${m.propostas} propostas`}
                  sub2={m.propostasAnoAnterior > 0 ? `vs ${mesAbrev}/${ano - 1}: ${m.propostasAnoAnterior} (${m.variacaoPropostas >= 0 ? "+" : ""}${m.variacaoPropostas.toFixed(1)}%)` : undefined}
                  pct={pctPropostas}
                />
                <KpiCard
                  label="CPFs Novos"
                  value={fmtN(m.cpfsNovos)}
                  sub={`Meta: ${m.metaCpfs}`}
                  sub2={m.cpfsNovosAnoAnterior > 0 ? `vs ${mesAbrev}/${ano - 1}: ${m.cpfsNovosAnoAnterior} (${m.variacaoCpfs >= 0 ? "+" : ""}${m.variacaoCpfs.toFixed(1)}%)` : undefined}
                  pct={pctCpfs}
                />
              </div>

              {/* Gráfico + Status */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-gray-800">Vendas {ano}: Mensal vs Meta vs {ano - 1}</h3>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> {ano}</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-300 inline-block" /> {ano - 1}</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> Meta</span>
                    </div>
                  </div>
                  {m.comparativoVendasMensal && m.comparativoVendasMensal.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={m.comparativoVendasMensal.map((x: any) => ({
                          mes: MESES_ABREV[x.mes],
                          [`${ano}`]: x.premio,
                          [`${ano - 1}`]: x.premioAnoAnterior,
                          Meta: x.metaPremio,
                        }))}
                        margin={{ top: 20, right: 10, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="mes" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={v => fmt(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={70} />
                        <Tooltip formatter={(v: number) => fmtFull(v)} />
                        <Bar dataKey={`${ano}`} fill="#3b82f6" radius={[3, 3, 0, 0]} />
                        <Bar dataKey={`${ano - 1}`} fill="#93c5fd" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Meta" fill="#f97316" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
                      Carregando dados de vendas mensais...
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  {/* Status Card */}
                  <div className="bg-[#1e3a8a] rounded-xl p-4 text-white flex-1">
                    <h3 className="font-bold text-white mb-3">Status {mesNome}</h3>
                    <div className="space-y-2 text-sm">
                      {pctReceita < 100 && (
                        <div className="flex items-start gap-2">
                          <AlertTriangle size={14} className="text-red-300 mt-0.5 shrink-0" />
                          <span>Gap de <strong>{fmt(m.metaReceita - m.receitaReal)}</strong> na receita vs meta mensal.</span>
                        </div>
                      )}
                      {m.variacaoReceita !== 0 && (
                        <div className="flex items-start gap-2">
                          {m.variacaoReceita >= 0 ? <TrendingUp size={14} className="text-green-300 mt-0.5 shrink-0" /> : <TrendingDown size={14} className="text-red-300 mt-0.5 shrink-0" />}
                          <span>Receita <strong>{m.variacaoReceita >= 0 ? "+" : ""}{m.variacaoReceita.toFixed(1)}%</strong> {m.variacaoReceita >= 0 ? "superior" : "inferior"} a {mesAbrev}/{ano - 1}.</span>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <CheckCircle size={14} className="text-green-300 mt-0.5 shrink-0" />
                        <span>Margem líquida <strong>{pctMargem >= 60 ? "excelente" : pctMargem >= 40 ? "adequada" : "baixa"}</strong> ({pctMargem.toFixed(1)}%).</span>
                      </div>
                    </div>
                  </div>
                  {/* Ação Necessária */}
                  <div className="bg-white rounded-xl shadow-sm border p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap size={14} className="text-yellow-500" />
                      <span className="text-xs font-bold text-gray-600">Ação Necessária</span>
                    </div>
                    <Textarea
                      value={insights.insightReceita}
                      onChange={e => setInsights(p => ({ ...p, insightReceita: e.target.value }))}
                      placeholder={`"Acelerar receita em ${MESES[mes === 12 ? 1 : mes + 1]} para compensar ${mesAbrev} e superar desempenho de ${ano - 1}."`}
                      className="text-xs text-gray-600 italic border-0 bg-transparent resize-none focus:ring-0 p-0 min-h-[60px]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ══ SLIDE 3: RECEITA E LUCRO ══════════════════════════════════ */}
            <div data-pdf-section="financeiro" className="print-break">
              <div className="text-xs font-bold text-[#2563eb] uppercase tracking-widest mb-1">Análise Financeira</div>
              <SectionTitle sub={`Comparação com Meta e ${mesNome} ${ano - 1}`}>
                Receita e Lucro — {mesNome} {ano}
              </SectionTitle>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-3">
                  {/* Receita vs Meta */}
                  <div className="bg-white rounded-xl shadow-sm overflow-hidden" style={{ borderLeft: `4px solid ${statusColor(pctReceita).border}` }}>
                    <div className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-xs text-gray-500 font-semibold uppercase mb-1">Receita {mesNome} {ano}</div>
                          <div className="text-3xl font-black text-gray-900">{fmtFull(m.receitaReal)}</div>
                        </div>
                        <AlertTriangle size={28} className="text-red-300 mt-1" style={{ color: statusColor(pctReceita).border }} />
                      </div>
                      <StatusPill
                        pct={pctReceita}
                        label={`${pctReceita >= 100 ? "↑" : "↓"} ${pctReceita.toFixed(1)}% da meta`}
                      />
                      {m.receitaAnoAnterior > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 space-y-0.5">
                          <div>vs {mesNome} {ano - 1}: <strong>{fmtFull(m.receitaAnoAnterior)}</strong></div>
                          <div className={m.variacaoReceita >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                            {m.variacaoReceita >= 0 ? "+" : ""}{fmtFull(m.receitaReal - m.receitaAnoAnterior)} ({m.variacaoReceita >= 0 ? "+" : ""}{m.variacaoReceita.toFixed(1)}%)
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Meta Mensal */}
                  <div className="bg-white rounded-xl shadow-sm overflow-hidden border-l-4 border-gray-300">
                    <div className="p-4 flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-xs text-gray-500 font-semibold uppercase mb-1">Metas do Mês</div>
                        <div className="space-y-1.5 mt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Meta Comissão (Receita)</span>
                            <span className="font-black text-gray-900">{fmtFull(m.metaReceita)}</span>
                          </div>
                          {m.metaVendas > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-blue-600">Meta Vendas (Prêmio)</span>
                              <span className="font-black text-blue-700">{fmtFull(m.metaVendas)}</span>
                            </div>
                          )}
                          {m.metaAnual > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-400">Meta Anual Receita</span>
                              <span className="text-sm font-bold text-gray-500">{fmtFull(m.metaAnual)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <Target size={28} className="text-gray-300 ml-3 mt-1" />
                    </div>
                  </div>

                  {/* IMAP */}
                  <div className="bg-white rounded-xl shadow-sm overflow-hidden border-l-4 border-indigo-500">
                    <div className="p-4">
                      <div className="text-xs text-gray-500 font-semibold uppercase mb-2">IMAP — {mesNome}</div>
                      <div className="text-3xl font-black text-indigo-600 mb-1">
                        {m.imap !== null ? m.imap.toFixed(1) : <span className="text-gray-300">—</span>}
                      </div>
                      <p className="text-[10px] text-gray-400 mb-3">Preencha em Financeiro → Indicadores</p>
                      <div className="grid grid-cols-3 gap-2 border-t pt-3">
                        <div className="text-center">
                          <p className="text-[10px] text-gray-400 uppercase">Média 12m</p>
                          <p className="text-sm font-bold text-indigo-500">{m.imapMedia !== null ? m.imapMedia.toFixed(1) : "—"}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-gray-400 uppercase">Maior 12m</p>
                          <p className="text-sm font-bold text-green-600">{m.imapMax !== null ? m.imapMax.toFixed(1) : "—"}</p>
                          {m.imapMaxMes && <p className="text-[9px] text-gray-400">{MESES_ABREV[m.imapMaxMes]}</p>}
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-gray-400 uppercase">Menor 12m</p>
                          <p className="text-sm font-bold text-red-500">{m.imapMin !== null ? m.imapMin.toFixed(1) : "—"}</p>
                          {m.imapMinMes && <p className="text-[9px] text-gray-400">{MESES_ABREV[m.imapMinMes]}</p>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Lucro Líquido */}
                  <div className="bg-white rounded-xl shadow-sm overflow-hidden border-l-4 border-emerald-500">
                    <div className="p-4 flex items-center justify-between">
                      <div>
                        <div className="text-xs text-gray-500 font-semibold uppercase mb-1">Lucro Líquido</div>
                        <div className="text-3xl font-black text-emerald-600">{fmtFull(m.lucroLiquido)}</div>
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full mt-1">
                          Margem: {pctMargem.toFixed(1)}%
                        </span>
                      </div>
                      <BarChart2 size={32} className="text-emerald-200" />
                    </div>
                  </div>
                </div>

                {/* Gráfico comparativo */}
                <div className="bg-white rounded-xl shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-gray-800 text-sm">Comparativo: Meta {ano}, {mesAbrev}/{String(ano).slice(2)} e {mesAbrev}/{String(ano - 1).slice(2)}</h3>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mb-4">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-400 inline-block" /> Meta</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> {mesAbrev}/{String(ano).slice(2)}</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> {mesAbrev}/{String(ano - 1).slice(2)}</span>
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={dadosReceita} margin={{ top: 25, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={v => fmt(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={65} />
                      <Tooltip formatter={(v: number) => fmtFull(v)} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} label={{ position: "top", formatter: (v: number) => fmt(v), fontSize: 11, fontWeight: "bold" }}>
                        {dadosReceita.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* ══ SLIDE 4: PERFORMANCE POR COLABORADOR ══════════════════════ */}
            {m.corretores && m.corretores.length > 0 && (
              <div data-pdf-section="performance" className="print-break">
                <div className="text-xs font-bold text-[#2563eb] uppercase tracking-widest mb-1">Performance Individual</div>
                <div className="flex items-start justify-between mb-5">
                  <SectionTitle sub={`${mesNome} ${ano} vs ${mesNome} ${ano - 1} — Análise Comparativa`}>
                    Performance por Colaborador
                  </SectionTitle>
                  {m.corretores.length >= 2 && (
                    <div className="bg-white rounded-xl px-4 py-2 shadow-sm border text-sm">
                      <span className="text-gray-500">⚖️ Equilíbrio </span>
                      <span className="font-bold text-[#2563eb]">
                        {m.corretores.slice(0, 2).map((c: any) => c.nome?.split(" ")[0]).join(" & ")} ({m.corretores.slice(0, 2).map((c: any) => {
                          const total = m.corretores.reduce((s: number, x: any) => s + x.propostas, 0);
                          return total > 0 ? Math.round((c.propostas / total) * 100) : 0;
                        }).join("% / ")}%)
                      </span>
                    </div>
                  )}
                </div>

                {/* Cards de colaboradores */}
                <div className={`grid gap-4 mb-6 ${m.corretores.length === 1 ? "grid-cols-1 max-w-sm" : m.corretores.length === 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3"}`}>
                  {m.corretores.map((c: any, i: number) => {
                    const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
                    const totalPropostas = m.corretores.reduce((s: number, x: any) => s + x.propostas, 0);
                    const pctParticipacao = totalPropostas > 0 ? Math.round((c.propostas / totalPropostas) * 100) : 0;
                    const inicial = (c.nome || "?")[0].toUpperCase();
                    return (
                      <div key={i} className="bg-white rounded-xl shadow-sm overflow-hidden">
                        <div className="h-1.5 w-full" style={{ background: color }} />
                        <div className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-lg"
                                style={{ background: color }}>
                                {inicial}
                              </div>
                              <div>
                                <div className="font-black text-gray-900">{c.nome?.split(" ")[0] || c.nome}</div>
                                <div className="text-xs text-gray-500">{c.nome}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-black" style={{ color }}>{pctParticipacao}%</div>
                              <div className="text-xs text-gray-400">participação</div>
                            </div>
                          </div>
                          <div className="text-xs text-gray-400 mb-0.5">Valor de Venda</div>
                          <div className="text-2xl font-black mb-3" style={{ color }}>{fmt(c.premio || c.receita)}</div>
                          <div className="space-y-1.5 text-sm text-gray-600">
                            <div className="flex justify-between">
                              <span>Propostas {mesAbrev}/{String(ano).slice(2)}</span>
                              <span className="font-bold">{c.propostas}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Comissão</span>
                              <span className="font-bold">{fmt(c.receita)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>CPFs Novos</span>
                              <span className="font-bold">{c.cpfsNovos}</span>
                            </div>
                          </div>
                          <div className="mt-3">
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${pctParticipacao}%`, background: color }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Gráfico comparativo de propostas */}
                {dadosCorretores.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-gray-800">Comparativo de Propostas — {mesNome} {ano}</h3>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={dadosCorretores} margin={{ top: 15, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={v => fmt(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={65} />
                        <Tooltip formatter={(v: number, name: string) => [fmtFull(v), name === "premio" ? "Valor Venda" : name === "propostas" ? "Propostas" : "Comissão"]} />
                        <Bar dataKey="premio" radius={[4, 4, 0, 0]} label={{ position: "top", formatter: (v: number) => fmt(v), fontSize: 11, fontWeight: "bold" }}>
                          {dadosCorretores.map((entry: { fill: string }, i: number) => <Cell key={i} fill={entry.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    {/* Insight editável */}
                    <div className="mt-4 bg-blue-50 rounded-lg p-3 border border-blue-100">
                      <div className="flex items-start gap-2">
                        <span className="text-blue-500 text-sm mt-0.5">ℹ️</span>
                        <Textarea
                          value={insights.insightColaboradores}
                          onChange={e => setInsights(p => ({ ...p, insightColaboradores: e.target.value }))}
                          placeholder="Insight: Distribuição entre colaboradores. Clique para editar..."
                          className="text-xs text-blue-800 border-0 bg-transparent resize-none focus:ring-0 p-0 min-h-[48px]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══ SLIDE 5: OBJETIVOS E AÇÕES CORRETIVAS ═════════════════════ */}
            <div data-pdf-section="objetivos" className="print-break">
              <div className="text-xs font-bold text-[#2563eb] uppercase tracking-widest mb-1">Reforço de Metas</div>
              <div className="flex items-start justify-between mb-5">
                <SectionTitle sub={`Análise de ${mesNome} ${ano} e estratégias para recuperar o ritmo planejado`}>
                  Objetivos {ano} — Ações Corretivas
                </SectionTitle>
                <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-2 shadow-sm border">
                  <span className="text-xs text-gray-500">Status Geral</span>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-sm"
                    style={{ background: statusGeralColor }}>!</div>
                  <span className="font-bold" style={{ color: statusGeralColor }}>{statusGeral}</span>
                </div>
              </div>

              {/* 3 Cards de Objetivo */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Financeiro */}
                <div className="bg-white rounded-xl shadow-sm p-5 border-t-4 border-blue-500">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Financeiro</span>
                    <span className="text-2xl">💰</span>
                  </div>
                  <div className="text-xs text-gray-500 mb-1">Receita Total {ano}</div>
                  <div className="text-3xl font-black text-gray-900 mb-1">+15%</div>
                  <div className="text-xs text-gray-500 mb-3">Meta: {m.metaAnual > 0 ? fmtFull(m.metaAnual) : "R$ 2,50 Milhões"}</div>
                  <StatusPill pct={pctReceita} label={`↓ ${pctReceita.toFixed(1)}% no ritmo`} />
                  <div className="mt-3 text-xs text-gray-500">
                    Receita: {fmt(m.receitaReal)} vs Meta Comissão {fmt(m.metaReceita)}.
                    {m.metaReceita > m.receitaReal && ` Gap de ${fmt(m.metaReceita - m.receitaReal)}.`}
                    {m.metaPropostas > 0 && ` Vendas: ${m.propostas} propostas vs Meta ${m.metaPropostas} (${pctPropostas.toFixed(0)}%).`}
                    {m.metaVendas > 0 && ` Vendas (comissão): ${fmt(m.receitaVendas)} vs Meta ${fmt(m.metaVendas)} (${pctVendas.toFixed(0)}%).`}
                  </div>
                </div>

                {/* Qualidade */}
                <div className="bg-white rounded-xl shadow-sm p-5 border-t-4 border-emerald-500">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Qualidade</span>
                    <span className="text-2xl">⭐</span>
                  </div>
                  <div className="text-xs text-gray-500 mb-1">Índice de Qualidade</div>
                  <div className="text-3xl font-black text-gray-900 mb-1">95%</div>
                  <div className="text-xs text-gray-500 mb-3">Manter Excelência</div>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    ✓ Meta alcançável
                  </span>
                  <div className="mt-3 text-xs text-gray-500">
                    Manter disciplina e qualidade no atendimento. Renovações em dia.
                  </div>
                </div>

                {/* Expansão */}
                <div className="bg-white rounded-xl shadow-sm p-5 border-t-4 border-purple-500">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">Expansão</span>
                    <span className="text-2xl">👥</span>
                  </div>
                  <div className="text-xs text-gray-500 mb-1">Novos CPFs</div>
                  <div className="text-3xl font-black text-gray-900 mb-1">{m.metaCpfs * 12}</div>
                  <div className="text-xs text-gray-500 mb-3">{m.metaCpfs} CPFs/mês em média</div>
                  <StatusPill pct={pctCpfs} label={`${pctCpfs.toFixed(0)}% da meta`} />
                  <div className="mt-3 text-xs text-gray-500">
                    {mesNome}: {m.cpfsNovos} CPFs vs Meta {m.metaCpfs}. Projeção anual: {m.cpfsNovos * 12}.
                  </div>
                </div>
              </div>

              {/* Projeção + Ações Corretivas */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl shadow-sm p-5">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <TrendingUp size={16} className="text-blue-500" />
                    Projeção Anual vs Meta {ano}
                  </h3>
                  {m.metaAnual > 0 || m.projecaoAnual > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={dadosProjecao} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={v => fmt(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={70} />
                        <Tooltip formatter={(v: number) => fmtFull(v)} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} label={{ position: "top", formatter: (v: number) => fmt(v), fontSize: 11, fontWeight: "bold" }}>
                          {dadosProjecao.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      Configure metas anuais para ver a projeção
                    </div>
                  )}
                </div>

                {/* Ações Corretivas */}
                <div className="bg-[#1e3a8a] rounded-xl p-5 text-white">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap size={18} className="text-yellow-400" />
                    <h3 className="font-bold text-white">Ações Corretivas Q1</h3>
                  </div>
                  <Textarea
                    value={insights.acoesCorretivas}
                    onChange={e => setInsights(p => ({ ...p, acoesCorretivas: e.target.value }))}
                    placeholder={`1. Acelerar Conversão — Intensificar follow-up com leads quentes.\n2. Ampliar Prospecção — Aumentar captação via Apiprev e indicações.\n3. Revisão de Metas — Ajustar metas mensais conforme ritmo atual.`}
                    className="text-sm text-blue-100 border-0 bg-white/10 resize-none focus:ring-0 rounded-lg p-3 min-h-[140px] placeholder:text-blue-300"
                  />
                </div>
              </div>
            </div>

            {/* ══ SEÇÕES ADICIONAIS ══════════════════════════════════════════ */}
            {/* Inadimplentes */}
            <div data-pdf-section="inadimplentes" className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-500" /> Inadimplentes — {mesNome}
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-black text-red-600">{m.inadimplentes.total}</div>
                    <div className="text-xs text-red-500">Total no Mês</div>
                    <div className="text-xs text-gray-500">{fmtFull(m.inadimplentes.totalValor)}</div>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-black text-emerald-600">{m.inadimplentes.pago}</div>
                    <div className="text-xs text-emerald-500">Pagos</div>
                    <div className="text-xs text-gray-500">{fmtFull(m.inadimplentes.totalPago)}</div>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-black text-amber-600">{m.inadimplentes.emContato + m.inadimplentes.boleto}</div>
                    <div className="text-xs text-amber-500">Em Aberto</div>
                    <div className="text-xs text-gray-500">{fmtFull(m.inadimplentes.totalEmAberto)}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-black text-gray-600">{m.inadimplentes.desistiu}</div>
                    <div className="text-xs text-gray-500">Desistiram</div>
                  </div>
                </div>
                {m.inadimplentes.total > 0 && (
                  <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 text-center">
                    Taxa de recuperação: <strong className="text-emerald-600">{((m.inadimplentes.pago / m.inadimplentes.total) * 100).toFixed(0)}%</strong>
                  </div>
                )}
              </div>

              {/* Cancelados */}
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Minus size={16} className="text-red-500" /> Cancelados — {mesNome}
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <div className="text-3xl font-black text-red-600">{m.cancelados.total}</div>
                    <div className="text-xs text-red-500">Total no Mês</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3 text-center">
                    <div className="text-3xl font-black text-orange-600">{m.canceladosAcumulados?.total || 0}</div>
                    <div className="text-xs text-orange-500">Acumulado no Ano</div>
                  </div>
                </div>
                {/* Breakdown de status */}
                {m.cancelados.breakdown && Object.keys(m.cancelados.breakdown).length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {Object.entries(m.cancelados.breakdown as Record<string, number>).map(([status, qtd]) => {
                      const colors: Record<string, string> = {
                        INADIMPLENTE: "text-red-600 bg-red-50",
                        CANCELADO: "text-gray-600 bg-gray-50",
                        RECUPERADO: "text-green-600 bg-green-50",
                        PENDENTE: "text-yellow-600 bg-yellow-50",
                      };
                      const cls = colors[status] || "text-gray-600 bg-gray-50";
                      return (
                        <div key={status} className="flex items-center justify-between text-sm">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{status}</span>
                          <span className="font-bold">{qtd}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {m.canceladosAcumulados?.breakdown && Object.keys(m.canceladosAcumulados.breakdown).length > 0 && (
                  <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-2 mb-3">
                    <span className="font-semibold text-gray-600">Acumulado por status: </span>
                    {Object.entries(m.canceladosAcumulados.breakdown as Record<string, number>).map(([s, q]) => `${s}: ${q}`).join(" · ")}
                  </div>
                )}
                <EditableCard
                  title="Observações sobre cancelamentos"
                  icon={<Zap size={14} />}
                  value={insights.observacoesGerais}
                  onChange={v => setInsights(p => ({ ...p, observacoesGerais: v }))}
                  placeholder="Registre os principais motivos de cancelamento e ações preventivas..."
                />
              </div>
            </div>

            {/* CRM Leads + Sinistros */}
            <div data-pdf-section="crm" className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <Target size={16} className="text-indigo-500" /> CRM Leads
                </h3>
                {/* Total do mês e acumulado */}
                <div className="flex items-baseline gap-3 mb-4">
                  <div>
                    <div className="text-3xl font-black text-indigo-600">{fmtN(m.leadsTotal > 0 ? m.leadsTotal : m.leadsAcumTotal)}</div>
                    <div className="text-xs text-gray-400">{m.leadsTotal > 0 ? `leads em ${mesNome}` : `leads acumulados em ${ano}`}</div>
                  </div>
                  {m.leadsTotal > 0 && m.leadsAcumTotal > m.leadsTotal && (
                    <div className="bg-indigo-50 rounded-lg px-2 py-1 text-center">
                      <div className="text-lg font-black text-indigo-500">{fmtN(m.leadsAcumTotal)}</div>
                      <div className="text-xs text-indigo-400">total {ano}</div>
                    </div>
                  )}
                </div>
                {/* Status dos leads com barra de progresso */}
                {(() => {
                  const statusData = m.leadsTotal > 0 ? m.leadsStatus : m.leadsAcumStatus;
                  const totalLeads = m.leadsTotal > 0 ? m.leadsTotal : m.leadsAcumTotal;
                  const leadsBarColors: Record<string, { badge: string; bar: string }> = {
                    "AGUARDANDO": { badge: "text-gray-600 bg-gray-100", bar: "#9ca3af" },
                    "Aguardando": { badge: "text-gray-600 bg-gray-100", bar: "#9ca3af" },
                    "EM CONTATO": { badge: "text-blue-600 bg-blue-50", bar: "#3b82f6" },
                    "Em Contato": { badge: "text-blue-600 bg-blue-50", bar: "#3b82f6" },
                    "AGENDAMENTO": { badge: "text-yellow-600 bg-yellow-50", bar: "#f59e0b" },
                    "Agendamento": { badge: "text-yellow-600 bg-yellow-50", bar: "#f59e0b" },
                    "PROPOSTA": { badge: "text-purple-600 bg-purple-50", bar: "#8b5cf6" },
                    "Proposta": { badge: "text-purple-600 bg-purple-50", bar: "#8b5cf6" },
                    "IMPLANTADO": { badge: "text-green-600 bg-green-50", bar: "#10b981" },
                    "Implantado": { badge: "text-green-600 bg-green-50", bar: "#10b981" },
                    "NÃO CONVERTIDO": { badge: "text-red-600 bg-red-50", bar: "#ef4444" },
                    "Não Convertido": { badge: "text-red-600 bg-red-50", bar: "#ef4444" },
                  };
                  return statusData && Object.keys(statusData).length > 0 ? (
                    <div className="space-y-2 mb-3">
                      <div className="text-xs font-semibold text-gray-500 mb-1">Distribuição por Status</div>
                      {Object.entries(statusData as Record<string, number>).map(([status, qtd]) => {
                        const colors = leadsBarColors[status] || { badge: "text-gray-600 bg-gray-50", bar: "#9ca3af" };
                        const pct = totalLeads > 0 ? Math.round((qtd / totalLeads) * 100) : 0;
                        return (
                          <div key={status}>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${colors.badge}`}>{status}</span>
                              <span className="text-sm font-black">{qtd} <span className="text-xs text-gray-400 font-normal">({pct}%)</span></span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colors.bar }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400 text-center py-2">Nenhum lead em {mesNome}</div>
                  );
                })()}
                {m.leadsPorVendedor && m.leadsPorVendedor.length > 0 && (
                  <div className="border-t pt-3 space-y-3">
                    <div className="text-xs font-semibold text-gray-500 mb-1">Por Vendedor</div>
                    {m.leadsPorVendedor.map((v: any, i: number) => {
                      const totalLeads = m.leadsTotal > 0 ? m.leadsTotal : m.leadsAcumTotal;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                            style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                            {(v.vendedor || "?")[0]}
                          </div>
                          <span className="text-sm text-gray-700 flex-1">{v.vendedor}</span>
                          <span className="font-bold text-sm">{v.total}</span>
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${totalLeads > 0 ? (v.total / totalLeads) * 100 : 0}%`, background: AVATAR_COLORS[i % AVATAR_COLORS.length] }} />
                          </div>
                        </div>
                      );
                    })}
                    {/* Detalhamento mensal por vendedor */}
                    {m.leadsDetalhadoPorVendedor && Object.keys(m.leadsDetalhadoPorVendedor).length > 0 && (() => {
                      const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
                      const STATUS_CORES: Record<string, string> = {
                        "AGUARDANDO": "#9ca3af", "SEM CONTATO": "#6b7280",
                        "EM CONTATO": "#3b82f6", "AGENDAMENTO": "#f59e0b",
                        "FECHAMENTO": "#8b5cf6", "RECUSADO": "#ef4444", "ENVIADO": "#10b981",
                      };
                      const vendedores = Object.keys(m.leadsDetalhadoPorVendedor);
                      const mesesComDados = Array.from(new Set(
                        vendedores.flatMap(v => Object.keys(m.leadsDetalhadoPorVendedor[v]).map(Number))
                      )).sort((a, b) => a - b);
                      return (
                        <div className="mt-3 border-t pt-3">
                          <div className="text-xs font-semibold text-gray-500 mb-2">Detalhamento Mensal por Vendedor</div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-1 pr-2 text-gray-500 font-semibold">Vendedor</th>
                                  {mesesComDados.map(m2 => (
                                    <th key={m2} className="text-center py-1 px-1 text-gray-500 font-semibold">{MESES_ABREV[m2 - 1]}</th>
                                  ))}
                                  <th className="text-center py-1 px-1 text-gray-500 font-semibold">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {vendedores.map((vend, vi) => {
                                  const dadosVend = m.leadsDetalhadoPorVendedor[vend];
                                  const totalVend = Object.values(dadosVend).reduce((s: number, d: any) => s + d.total, 0);
                                  return (
                                    <tr key={vend} className="border-b border-gray-50 hover:bg-gray-50">
                                      <td className="py-1.5 pr-2">
                                        <div className="flex items-center gap-1.5">
                                          <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                                            style={{ background: AVATAR_COLORS[vi % AVATAR_COLORS.length] }}>
                                            {vend[0]}
                                          </div>
                                          <span className="font-medium text-gray-700">{vend}</span>
                                        </div>
                                      </td>
                                      {mesesComDados.map(m2 => {
                                        const mesData = dadosVend[m2];
                                        if (!mesData) return <td key={m2} className="text-center py-1.5 px-1 text-gray-300">—</td>;
                                        const statusEntries = Object.entries(mesData.status).sort((a, b) => (b[1] as number) - (a[1] as number));
                                        return (
                                          <td key={m2} className="text-center py-1.5 px-1">
                                            <div className="font-bold text-gray-800">{mesData.total}</div>
                                            <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
                                              {statusEntries.map(([st, qtd]) => (
                                                <span key={st} className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0 rounded-full"
                                                  style={{ background: (STATUS_CORES[st] || "#9ca3af") + "22", color: STATUS_CORES[st] || "#6b7280" }}>
                                                  <span className="w-1 h-1 rounded-full inline-block" style={{ background: STATUS_CORES[st] || "#9ca3af" }} />
                                                  {st.split(" ")[0]} {qtd}
                                                </span>
                                              ))}
                                            </div>
                                          </td>
                                        );
                                      })}
                                      <td className="text-center py-1.5 px-1">
                                        <span className="font-black text-indigo-600">{totalVend}</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm p-5">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-500" /> Sinistros — {ano}
                </h3>
                <div className="flex items-baseline gap-2 mb-3">
                  <div className="text-3xl font-black text-red-600">{fmtN(m.sinistrosTotal)}</div>
                  <span className="text-sm text-gray-400">protocolos</span>
                  {m.sinistrosTotalCapital > 0 && (
                    <span className="text-sm font-semibold text-gray-500 ml-2">Capital: {fmt(m.sinistrosTotalCapital)}</span>
                  )}
                </div>
                {m.sinistros && m.sinistros.length > 0 && (
                  <div className="space-y-1.5">
                    {m.sinistros.map((s: any, i: number) => {
                      const sinColors: Record<string, string> = {
                        "EM ANÁLISE": "text-yellow-600 bg-yellow-50",
                        "PAGO": "text-green-600 bg-green-50",
                        "NEGADO": "text-red-600 bg-red-50",
                        "PENDENTE": "text-orange-600 bg-orange-50",
                        "CANCELADO": "text-gray-600 bg-gray-50",
                      };
                      const cls = sinColors[s.status?.toUpperCase()] || "text-gray-600 bg-gray-50";
                      return (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{s.status}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{s.total}</span>
                            {s.totalCapital > 0 && <span className="text-xs text-gray-400">{fmt(s.totalCapital)}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {m.sinistros && m.sinistros.length === 0 && (
                  <div className="text-sm text-gray-400 text-center py-4">Nenhum sinistro registrado em {ano}</div>
                )}
              </div>
            </div>

            {/* CRM Beneficiários */}
            {m.benefTotal > 0 && (
              <div data-pdf-section="beneficiarios" className="bg-white rounded-xl shadow-sm p-5">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Users size={16} className="text-blue-500" /> CRM Beneficiários
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {m.beneficiarios.map((b: any, i: number) => (
                    <div key={i} className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className="text-2xl font-black text-gray-800">{b.total}</div>
                      <div className="text-xs text-gray-500">{b.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ══ ENTRADA VS SAÍDA DE CLIENTES ═══════════════════════════════════════ */}
            {(() => {
              const esMensal: any[] = (entradaSaidaData as any)?.mensal || [];
              const esTotais: any = (entradaSaidaData as any)?.totais || { totalNovos: 0, totalSaidas: 0, desistiu: 0, inadimplente: 0, obito: 0, saldo: 0 };
              const esMes = esMensal.find((r: any) => r.mes === mes) || { totalNovos: 0, totalSaidas: 0, desistiu: 0, inadimplente: 0, obito: 0, saldo: 0 };
              const taxaRetencao = esTotais.totalNovos > 0 ? (((esTotais.totalNovos - esTotais.totalSaidas) / esTotais.totalNovos) * 100) : null;
              const mesesComDadosES = esMensal.filter((r: any) => r.totalNovos > 0 || r.totalSaidas > 0);
              if (mesesComDadosES.length === 0) return null;
              return (
                <div data-pdf-section="entrada-saida" className="print-break">
                  <div className="text-xs font-bold text-purple-600 uppercase tracking-widest mb-1">Fluxo de Clientes</div>
                  <SectionTitle sub={`Clientes novos (CPF novo) vs saídas (desistência + inadimplência + óbito) — ${ano}`}>
                    Entrada vs Saída de Clientes
                  </SectionTitle>

                  {/* KPIs do mês */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden" style={{ borderLeft: '4px solid #10b981' }}>
                      <div className="p-4">
                        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Novos — {MESES_ABREV[mes]}</div>
                        <div className="text-3xl font-black text-green-600">{esMes.totalNovos}</div>
                        <div className="text-xs text-gray-400 mt-1">CPFs novos no mês</div>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden" style={{ borderLeft: '4px solid #ef4444' }}>
                      <div className="p-4">
                        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Saídas — {MESES_ABREV[mes]}</div>
                        <div className="text-3xl font-black text-red-600">{esMes.totalSaidas}</div>
                        <div className="text-xs text-gray-400 mt-1">{esMes.desistiu}d · {esMes.inadimplente}i · {esMes.obito}ó</div>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden" style={{ borderLeft: `4px solid ${esMes.saldo >= 0 ? '#10b981' : '#ef4444'}` }}>
                      <div className="p-4">
                        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Saldo — {MESES_ABREV[mes]}</div>
                        <div className={`text-3xl font-black ${esMes.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {esMes.saldo >= 0 ? '+' : ''}{esMes.saldo}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">Novos − Saídas</div>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden" style={{ borderLeft: `4px solid ${esTotais.saldo >= 0 ? '#10b981' : '#ef4444'}` }}>
                      <div className="p-4">
                        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Saldo Acumulado {ano}</div>
                        <div className={`text-3xl font-black ${esTotais.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {esTotais.saldo >= 0 ? '+' : ''}{esTotais.saldo}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {esTotais.totalNovos} novos · {esTotais.totalSaidas} saídas
                          {taxaRetencao !== null && ` · Retenção: ${taxaRetencao.toFixed(0)}%`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tabela mensal */}
                  <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100">
                      <h3 className="font-bold text-gray-800">Detalhamento Mensal — {ano}</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="text-left px-5 py-2.5 font-semibold text-gray-600">Mês</th>
                            <th className="text-right px-4 py-2.5 font-semibold text-green-600">Novos</th>
                            <th className="text-right px-4 py-2.5 font-semibold text-red-500">Desistência</th>
                            <th className="text-right px-4 py-2.5 font-semibold text-orange-500">Inadimplência</th>
                            <th className="text-right px-4 py-2.5 font-semibold text-gray-500">Óbito</th>
                            <th className="text-right px-4 py-2.5 font-semibold text-red-600">Total Saídas</th>
                            <th className="text-right px-4 py-2.5 font-semibold text-purple-600">Saldo</th>
                            <th className="text-right px-4 py-2.5 font-semibold text-blue-500">Retenção</th>
                          </tr>
                        </thead>
                        <tbody>
                          {MESES.slice(1).map((mesNm, idx) => {
                            const mesNum = idx + 1;
                            const d = esMensal.find((r: any) => r.mes === mesNum) || { totalNovos: 0, totalSaidas: 0, desistiu: 0, inadimplente: 0, obito: 0, saldo: 0 };
                            const temDados = d.totalNovos > 0 || d.totalSaidas > 0;
                            const retencao = d.totalNovos > 0 ? (((d.totalNovos - d.totalSaidas) / d.totalNovos) * 100) : null;
                            const isMesSel = mesNum === mes;
                            return (
                              <tr key={idx} className={`border-b border-gray-50 ${isMesSel ? 'bg-purple-50/60' : ''} ${!temDados ? 'opacity-40' : ''}`}>
                                <td className={`px-5 py-2.5 font-medium ${isMesSel ? 'text-purple-700 font-bold' : 'text-gray-600'}`}>
                                  {mesNm} {isMesSel && <span className="text-xs bg-purple-100 text-purple-700 px-1 rounded ml-1">selecionado</span>}
                                </td>
                                <td className="text-right px-4 py-2.5 text-green-700 font-medium">{d.totalNovos > 0 ? d.totalNovos : <span className="text-gray-300">—</span>}</td>
                                <td className="text-right px-4 py-2.5 text-red-500">{d.desistiu > 0 ? d.desistiu : <span className="text-gray-300">—</span>}</td>
                                <td className="text-right px-4 py-2.5 text-orange-500">{d.inadimplente > 0 ? d.inadimplente : <span className="text-gray-300">—</span>}</td>
                                <td className="text-right px-4 py-2.5 text-gray-500">{d.obito > 0 ? d.obito : <span className="text-gray-300">—</span>}</td>
                                <td className="text-right px-4 py-2.5 text-red-600 font-medium">{d.totalSaidas > 0 ? d.totalSaidas : <span className="text-gray-300">—</span>}</td>
                                <td className={`text-right px-4 py-2.5 font-bold ${!temDados ? 'text-gray-300' : d.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {temDados ? (d.saldo >= 0 ? `+${d.saldo}` : d.saldo) : '—'}
                                </td>
                                <td className={`text-right px-4 py-2.5 text-xs font-semibold ${!temDados ? 'text-gray-300' : retencao !== null && retencao >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                                  {retencao !== null ? `${retencao.toFixed(0)}%` : '—'}
                                </td>
                              </tr>
                            );
                          })}
                          {/* Linha de totais */}
                          <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                            <td className="px-5 py-2.5 text-gray-700">Total {ano}</td>
                            <td className="text-right px-4 py-2.5 text-green-700">{esTotais.totalNovos}</td>
                            <td className="text-right px-4 py-2.5 text-red-500">{esTotais.desistiu || 0}</td>
                            <td className="text-right px-4 py-2.5 text-orange-500">{esTotais.inadimplente || 0}</td>
                            <td className="text-right px-4 py-2.5 text-gray-500">{esTotais.obito || 0}</td>
                            <td className="text-right px-4 py-2.5 text-red-600">{esTotais.totalSaidas}</td>
                            <td className={`text-right px-4 py-2.5 ${esTotais.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {esTotais.saldo >= 0 ? `+${esTotais.saldo}` : esTotais.saldo}
                            </td>
                            <td className={`text-right px-4 py-2.5 text-xs ${taxaRetencao !== null && taxaRetencao >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                              {taxaRetencao !== null ? `${taxaRetencao.toFixed(0)}%` : '—'}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Meta Próximo Mês */}
            <div data-pdf-section="meta" className="bg-white rounded-xl shadow-sm p-5">
              <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                <Target size={16} className="text-blue-500" /> Meta para {MESES[mes === 12 ? 1 : mes + 1]} {mes === 12 ? ano + 1 : ano}
              </h3>
              {/* Metas numéricas do próximo mês */}
              <MetaProximoMes mes={mes} ano={ano} />
              <div className="mt-3">
                <Textarea
                  value={insights.metaProximoMes}
                  onChange={e => setInsights(p => ({ ...p, metaProximoMes: e.target.value }))}
                  placeholder={`Defina as metas e estratégias para ${MESES[mes === 12 ? 1 : mes + 1]}...`}
                  className="text-sm text-gray-700 border-gray-200 resize-none min-h-[80px]"
                />
              </div>
            </div>

            {/* Botões de ação fixos */}
            <div className="flex justify-end gap-3 no-print pb-4">
              <Button variant="outline" onClick={exportarPDF} disabled={exportando}
                className="border-gray-300 text-gray-700 hover:bg-gray-50">
                <Download size={14} className="mr-1" /> {exportando ? "Gerando PDF..." : "Exportar PDF"}
              </Button>
              <Button variant="outline" onClick={() => window.print()}
                className="border-gray-300 text-gray-700 hover:bg-gray-50">
                <Printer size={14} className="mr-1" /> Imprimir
              </Button>
              <Button onClick={() => salvarMutation.mutate({ mes, ano, ...insights })}
                disabled={salvarMutation.isPending}
                className="bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white px-6">
                <Save size={14} className="mr-1" />
                {salvarMutation.isPending ? "Salvando..." : "Salvar Relatório"}
              </Button>
            </div>

          </div>
        )}

        {!isLoading && !m && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <BarChart2 size={48} className="mb-3 opacity-30" />
            <p className="text-sm">Nenhum dado encontrado para {mesNome} {ano}</p>
            <p className="text-xs mt-1">Importe dados de vendas, extrato ou inadimplentes para este período</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

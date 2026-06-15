import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAno } from "@/contexts/AnoContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Upload, Trash2, TrendingUp, Users, FileText, DollarSign, Filter, Search, AlertCircle, ChevronDown, ChevronRight, Target, Download } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import AppLayout from "@/components/AppLayout";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MESES_CURTOS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const CORES = ["#1e40af","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16","#ec4899","#6366f1"];

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type ResumoCorretor = {
  corretor: string;
  totalClientes: number;
  totalRegistros: number;
  totalBase: number;
  totalValorComissao: number;
  totalValorIncentivo: number;
  totalComissao: number;
  totalPrevisao15: number;
  totalRealizado50: number;
  isElisia: boolean;
};

export default function Comissoes() {
  const { ano } = useAno();
  const [mesSel, setMesSel] = useState<number | undefined>(undefined);
  const [vendedorSel, setVendedorSel] = useState<string>("todos");
  const [uploading, setUploading] = useState(false);
  const [mesUpload, setMesUpload] = useState(String(new Date().getMonth() + 1));
  const [corretorDetalhe, setCorretorDetalhe] = useState<string | null>(null);
  const [buscaPendentes, setBuscaPendentes] = useState("");
  const [vendedorPendentes, setVendedorPendentes] = useState<string>("todos");
  const [mesPendentes, setMesPendentes] = useState(new Date().getMonth() + 1);
  const fileRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const { data: uploads = [] } = trpc.comissoes.uploads.useQuery();

  const vendedorParam = vendedorSel === "todos" ? undefined : vendedorSel;

  const { data: resumo = [] } = trpc.comissoes.resumoPorCorretor.useQuery({
    mes: mesSel ?? null, ano, vendedor: vendedorParam,
  });

  const { data: metricas } = trpc.comissoes.metricas.useQuery({
    mes: mesSel ?? null, ano, vendedor: vendedorParam,
  });

  const { data: detalhe = [] } = trpc.comissoes.detalheCorretor.useQuery(
    { vendedor: corretorDetalhe ?? "", mes: mesSel ?? null, ano },
    { enabled: !!corretorDetalhe }
  );

  const { data: pendentes = [] } = trpc.comissoes.pendentesDetalhado.useQuery({
    mes: mesPendentes, ano,
    vendedor: vendedorPendentes === "todos" ? undefined : vendedorPendentes,
  });

  const { data: metricasPendentes = [] } = trpc.comissoes.metricasPendentes.useQuery({
    mes: mesPendentes, ano,
  });

  const deletarUpload = trpc.comissoes.deletarUpload.useMutation({
    onSuccess: () => {
      utils.comissoes.uploads.invalidate();
      utils.comissoes.resumoPorCorretor.invalidate();
      utils.comissoes.metricas.invalidate();
      toast.success("Upload removido");
    },
  });

  const resumoTyped = resumo as ResumoCorretor[];
  const totalGeral = resumoTyped.reduce((s, r) => s + r.totalComissao, 0);
  const totalBaseGeral = resumoTyped.reduce((s, r) => s + r.totalBase, 0);
  const totalPrevisaoGeral = resumoTyped.reduce((s, r) => s + r.totalPrevisao15, 0);
  const totalRealizadoGeral = resumoTyped.reduce((s, r) => s + r.totalRealizado50, 0);

  // Lista de vendedores para filtros
  const { data: todosCorretores = [] } = trpc.comissoes.resumoPorCorretor.useQuery({ mes: null, ano });
  const listaVendedores = (todosCorretores as ResumoCorretor[]).map(r => r.corretor).filter(Boolean).sort();

  const pieData = resumoTyped
    .filter(r => r.totalComissao > 0)
    .map((r, i) => ({ name: r.corretor, value: r.totalComissao, color: CORES[i % CORES.length] }));

  // Gráfico: apenas não-ELISIA com previsão vs realizado
  const barData = resumoTyped
    .filter(r => !r.isElisia && r.corretor !== "Sem Corretor" && r.totalBase > 0)
    .map(r => ({
      name: r.corretor,
      previsao: r.totalPrevisao15,
      realizado: r.totalRealizado50,
    }));

  const pendentesFiltrados = (pendentes as Record<string, unknown>[]).filter(p => {
    if (!buscaPendentes) return true;
    const b = buscaPendentes.toLowerCase();
    return String(p.nome ?? "").toLowerCase().includes(b) || String(p.cpf ?? "").includes(b);
  });

  const totalPendentes = (pendentes as unknown[]).length;
  const totalPrevisaoPendentes = pendentesFiltrados.reduce((s, p) => s + parseFloat(String(p.previsao15 ?? "0")), 0);

  function exportarExcel() {
    const periodoLabel = mesSel ? `${MESES[mesSel - 1]}_${ano}` : `Todos_${ano}`;
    const wb = XLSX.utils.book_new();

    // Aba 1: Resumo por Corretor
    const resumoRows = resumoTyped.map(r => ({
      "Corretor": r.corretor,
      "Clientes": r.totalClientes,
      "Contribuição (R$)": r.totalBase,
      "Valor Comissão (R$)": r.totalValorComissao,
      "Valor Incentivo (R$)": r.totalValorIncentivo,
      "Total Comissão (R$)": r.totalComissao,
      "Previsão 15% (R$)": r.totalPrevisao15,
      "Realizado (R$)": r.totalRealizado50,
    }));
    // Linha de totais
    resumoRows.push({
      "Corretor": "TOTAL",
      "Clientes": resumoTyped.reduce((s, r) => s + r.totalClientes, 0),
      "Contribuição (R$)": totalBaseGeral,
      "Valor Comissão (R$)": resumoTyped.reduce((s, r) => s + r.totalValorComissao, 0),
      "Valor Incentivo (R$)": resumoTyped.reduce((s, r) => s + r.totalValorIncentivo, 0),
      "Total Comissão (R$)": totalGeral,
      "Previsão 15% (R$)": totalPrevisaoGeral,
      "Realizado (R$)": totalRealizadoGeral,
    });
    const wsResumo = XLSX.utils.json_to_sheet(resumoRows);
    wsResumo["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo por Corretor");

    // Aba 2: Detalhe do corretor selecionado (se houver)
    if (corretorDetalhe && (detalhe as Record<string, unknown>[]).length > 0) {
      const detalheRows = (detalhe as Record<string, unknown>[]).map(d => ({
        "Cliente": String(d.nomeCliente ?? ""),
        "CPF": String(d.cpfCliente ?? ""),
        "Produto": String(d.descricaoProduto ?? ""),
        "Contribuição (R$)": parseFloat(String(d.valorBase ?? "0")),
        "Comissão (R$)": parseFloat(String(d.valorComissao ?? "0")),
        "Incentivo (R$)": parseFloat(String(d.valorIncentivo ?? "0")),
        "Total Bruto (R$)": parseFloat(String(d.valorComissaoTotal ?? "0")),
        "% Parte": parseFloat(String(d.percentualVendedor ?? "100")),
        "Previsão 15% (R$)": parseFloat(String(d.previsao15 ?? "0")),
        "Realizado (R$)": parseFloat(String(d.realizado50 ?? "0")),
        "Competência": String(d.competenciaComissionada ?? ""),
        "Mês": Number(d.mes),
        "Ano": Number(d.ano),
      }));
      const wsDetalhe = XLSX.utils.json_to_sheet(detalheRows);
      wsDetalhe["!cols"] = [{ wch: 35 }, { wch: 16 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 8 }, { wch: 8 }];
      XLSX.utils.book_append_sheet(wb, wsDetalhe, `Detalhe ${corretorDetalhe}`.slice(0, 31));
    }

    XLSX.writeFile(wb, `Comissoes_${periodoLabel}.xlsx`);
    toast.success("Relatório exportado com sucesso!");
  }

  function kpiBox(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string, r: number, g: number, b: number) {
    doc.setFillColor(r, g, b);
    doc.roundedRect(x, y, w, h, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(label.toUpperCase(), x + w / 2, y + 7, { align: "center" });
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(value, x + w / 2, y + 15, { align: "center" });
  }

  function addPdfFooter(doc: jsPDF) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(`Barcellos Seguros — ${new Date().toLocaleString("pt-BR")} — pág. ${i}/${n}`, 14, 205);
    }
  }

  function exportarPDFPendentes() {
    const mesLabel = MESES[mesPendentes - 1];
    const soCorretor = vendedorPendentes !== "todos";
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    // ── Cabeçalho ────────────────────────────────────────────────────────────
    doc.setFillColor(220, 38, 38);
    doc.rect(0, 0, 297, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(
      soCorretor
        ? `${vendedorPendentes} — Comissões Pendentes`
        : "BARCELLOS SEGUROS — Comissões Pendentes",
      14, 13
    );
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`${mesLabel}/${ano}`, 297 - 14, 13, { align: "right" });

    const totalContrib = pendentesFiltrados.reduce((s, p) => s + parseFloat(String(p.contribuicao ?? "0")), 0);
    let nextY = 26;

    if (soCorretor) {
      // ── Dashboard 3 KPIs ────────────────────────────────────────────────
      const bw = 80, bh = 20, gap = 10;
      const startX = (297 - (bw * 3 + gap * 2)) / 2;
      kpiBox(doc, startX,           nextY, bw, bh, "Clientes Pendentes",    String(pendentesFiltrados.length),                                        180, 0,  0);
      kpiBox(doc, startX + bw + gap, nextY, bw, bh, "Contribuição Total",   totalContrib.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), 120, 53, 15);
      kpiBox(doc, startX + (bw + gap) * 2, nextY, bw, bh, "Previsão Perdida (15%)", totalPrevisaoPendentes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), 161, 98, 7);
      nextY += bh + 8;
    }

    // ── Tabela ───────────────────────────────────────────────────────────────
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Clientes sem comissão — ${mesLabel}/${ano}`, 14, nextY + 4);
    nextY += 8;

    const head = soCorretor
      ? [["Nome", "CPF", "Produto", "Contribuição", "Previsão 15%"]]
      : [["Nome", "CPF", "Vendedor", "Produto", "Contribuição", "Previsão 15%"]];

    const body = pendentesFiltrados.map(p => {
      const row = [
        String(p.nome ?? ""),
        String(p.cpf ?? ""),
        ...(soCorretor ? [] : [String(p.vendedor ?? "—")]),
        String(p.produtos ?? "—"),
        parseFloat(String(p.contribuicao ?? "0")).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        p.previsao15 != null ? parseFloat(String(p.previsao15)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—",
      ];
      return row;
    });

    const totalRow = soCorretor
      ? ["TOTAL", `${pendentesFiltrados.length} clientes`, "", totalContrib.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), totalPrevisaoPendentes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })]
      : ["TOTAL", "", "", `${pendentesFiltrados.length} clientes`, totalContrib.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), totalPrevisaoPendentes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })];
    body.push(totalRow);

    autoTable(doc, {
      startY: nextY + 2,
      head,
      body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: "bold" },
      didParseCell: (data) => {
        if (data.row.index === body.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [255, 235, 235];
        }
      },
      columnStyles: soCorretor
        ? { 0: { cellWidth: 65 }, 1: { cellWidth: 35 }, 2: { cellWidth: 55 } }
        : { 0: { cellWidth: 55 }, 1: { cellWidth: 32 }, 3: { cellWidth: 45 } },
      margin: { left: 14, right: 14 },
    });

    addPdfFooter(doc);
    doc.save(`Pendentes_${soCorretor ? vendedorPendentes + "_" : ""}${mesLabel}_${ano}.pdf`);
    toast.success("PDF exportado!");
  }

  function exportarPDF() {
    const periodoLabel = mesSel ? `${MESES[mesSel - 1]} ${ano}` : `Todos os meses — ${ano}`;
    const soCorretor = vendedorSel !== "todos";
    const corr = soCorretor ? resumoTyped[0] : null;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    // ── Cabeçalho ─────────────────────────────────────────────────────────────
    doc.setFillColor(30, 64, 175);
    doc.rect(0, 0, 297, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(soCorretor ? `${vendedorSel} — Relatório de Comissões` : "BARCELLOS SEGUROS — Relatório de Comissões", 14, 13);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(periodoLabel, 297 - 14, 13, { align: "right" });

    let nextY = 26;

    if (soCorretor && corr) {
      // ── Dashboard 5 KPIs ───────────────────────────────────────────────────
      const bw = 50, bh = 20, gap = 4;
      const totalW = bw * 5 + gap * 4;
      const sx = (297 - totalW) / 2;
      const kpis = [
        { label: "Clientes",       value: String(corr.totalClientes),                                                                    r: 30,  g: 64,  b: 175 },
        { label: "Contribuição",   value: corr.totalBase.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),                 r: 79,  g: 70,  b: 229 },
        { label: "Comissão Total", value: corr.totalComissao.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),             r: 5,   g: 150, b: 105 },
        { label: "Previsão 15%",   value: corr.totalPrevisao15.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),           r: 217, g: 119, b: 6   },
        { label: "Realizado",      value: corr.totalRealizado50.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),          r: 22,  g: 163, b: 74  },
      ];
      kpis.forEach((k, i) => kpiBox(doc, sx + i * (bw + gap), nextY, bw, bh, k.label, k.value, k.r, k.g, k.b));
      nextY += bh + 8;

      // ── Detalhe dos clientes ───────────────────────────────────────────────
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Detalhamento por Cliente", 14, nextY + 4);
      nextY += 8;

      const det = detalhe as Record<string, unknown>[];
      if (det.length === 0) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150);
        doc.text("(Abra o detalhamento do corretor na tela antes de exportar para incluir os clientes)", 14, nextY + 6);
      } else {
        const detBody = det.map(d => [
          String(d.nomeCliente ?? "").slice(0, 35),
          String(d.cpfCliente ?? ""),
          String(d.descricaoProduto ?? "").slice(0, 28),
          parseFloat(String(d.valorBase ?? "0")).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          parseFloat(String(d.valorComissaoTotal ?? "0")).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          `${parseFloat(String(d.percentualVendedor ?? "100")).toFixed(0)}%`,
          parseFloat(String(d.previsao15 ?? "0")).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          parseFloat(String(d.realizado50 ?? "0")).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        ]);
        detBody.push([
          "TOTAL", "", "",
          det.reduce((s, d) => s + parseFloat(String(d.valorBase ?? "0")), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          det.reduce((s, d) => s + parseFloat(String(d.valorComissaoTotal ?? "0")), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          "",
          det.reduce((s, d) => s + parseFloat(String(d.previsao15 ?? "0")), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          det.reduce((s, d) => s + parseFloat(String(d.realizado50 ?? "0")), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        ]);
        autoTable(doc, {
          startY: nextY + 2,
          head: [["Cliente", "CPF", "Produto", "Contribuição", "Total Comissão", "% Parte", "Previsão 15%", "Realizado"]],
          body: detBody,
          styles: { fontSize: 7.5, cellPadding: 2 },
          headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
          didParseCell: (data) => {
            if (data.row.index === detBody.length - 1) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [220, 230, 255];
            }
          },
          columnStyles: { 0: { cellWidth: 45 }, 2: { cellWidth: 38 } },
          margin: { left: 14, right: 14 },
        });
      }
    } else {
      // ── Modo geral: resumo de todos os corretores ──────────────────────────
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Resumo por Corretor", 14, nextY + 4);

      const resumoBody = resumoTyped.map(r => [
        r.corretor,
        r.totalClientes,
        r.totalBase.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        r.totalValorComissao.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        r.totalValorIncentivo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        r.totalComissao.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        r.totalPrevisao15.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        r.totalRealizado50.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      ]);
      resumoBody.push([
        "TOTAL",
        String(resumoTyped.reduce((s, r) => s + r.totalClientes, 0)),
        totalBaseGeral.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        resumoTyped.reduce((s, r) => s + r.totalValorComissao, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        resumoTyped.reduce((s, r) => s + r.totalValorIncentivo, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        totalGeral.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        totalPrevisaoGeral.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        totalRealizadoGeral.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      ]);

      autoTable(doc, {
        startY: nextY + 8,
        head: [["Corretor", "Clientes", "Contribuição", "Comissão", "Incentivo", "Total Comissão", "Previsão 15%", "Realizado"]],
        body: resumoBody,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
        didParseCell: (data) => {
          if (data.row.index === resumoBody.length - 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [220, 230, 255];
          }
        },
        columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 16, halign: "center" as const } },
        margin: { left: 14, right: 14 },
      });

      // Detalhe de um corretor específico em página separada (se expandido)
      if (corretorDetalhe && (detalhe as Record<string, unknown>[]).length > 0) {
        doc.addPage();
        doc.setFillColor(30, 64, 175);
        doc.rect(0, 0, 297, 20, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text(`Detalhe — ${corretorDetalhe}`, 14, 13);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(periodoLabel, 297 - 14, 13, { align: "right" });

        const detalheBody = (detalhe as Record<string, unknown>[]).map(d => [
          String(d.nomeCliente ?? "").slice(0, 30),
          String(d.cpfCliente ?? ""),
          String(d.descricaoProduto ?? "").slice(0, 25),
          parseFloat(String(d.valorBase ?? "0")).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          parseFloat(String(d.valorComissaoTotal ?? "0")).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          `${parseFloat(String(d.percentualVendedor ?? "100")).toFixed(0)}%`,
          parseFloat(String(d.previsao15 ?? "0")).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          parseFloat(String(d.realizado50 ?? "0")).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        ]);
        autoTable(doc, {
          startY: 26,
          head: [["Cliente", "CPF", "Produto", "Contribuição", "Total Comissão", "% Parte", "Previsão 15%", "Realizado"]],
          body: detalheBody,
          styles: { fontSize: 7, cellPadding: 1.5 },
          headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
          columnStyles: { 0: { cellWidth: 40 }, 2: { cellWidth: 35 } },
          margin: { left: 14, right: 14 },
        });
      }
    }

    addPdfFooter(doc);
    const fileName = soCorretor
      ? `Comissoes_${vendedorSel}_${periodoLabel.replace(/ /g, "_")}.pdf`
      : `Comissoes_${periodoLabel.replace(/ /g, "_").replace(/—/g, "-")}.pdf`;
    doc.save(fileName);
    toast.success("PDF exportado com sucesso!");
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("arquivo", file);
      fd.append("mes", mesUpload);
      fd.append("ano", String(ano));
      const res = await fetch("/api/upload/extrato-comissao", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro no upload");
      toast.success(
        `Extrato importado! ${data.totalRegistros} CPFs únicos. ` +
        `${data.clientesAtualizados} contribuições atualizadas. ` +
        `${data.produtosCadastrados} produtos. ` +
        `${data.vinculosInseridos} vínculos criados.`
      );
      utils.comissoes.uploads.invalidate();
      utils.comissoes.resumoPorCorretor.invalidate();
      utils.comissoes.metricas.invalidate();
      utils.comissoes.pendentesDetalhado.invalidate();
      utils.comissoes.metricasPendentes.invalidate();
      utils.clientes.listar.invalidate();
      utils.produtos.listar.invalidate();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <AppLayout>
      <div className="p-3 md:p-6 space-y-4 md:space-y-6">

        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Comissões por Corretor</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Cruzamento automático com a Base de Clientes — {ano}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={vendedorSel} onValueChange={v => { setVendedorSel(v); setCorretorDetalhe(v === "todos" ? null : v); }}>
              <SelectTrigger className="w-44">
                <Filter className="w-3 h-3 mr-1" />
                <SelectValue placeholder="Todos os corretores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os corretores</SelectItem>
                {listaVendedores.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={mesSel ? String(mesSel) : "todos"} onValueChange={v => setMesSel(v === "todos" ? undefined : parseInt(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os meses</SelectItem>
                {MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportarExcel} className="gap-2 border-green-600 text-green-700 hover:bg-green-50">
              <Download className="w-4 h-4" />
              Baixar Excel
            </Button>
            <Button variant="outline" onClick={exportarPDF} className="gap-2 border-red-600 text-red-700 hover:bg-red-50">
              <FileText className="w-4 h-4" />
              Baixar PDF
            </Button>
          </div>
        </div>

        {/* Upload Card */}
        <Card className="border-2 border-dashed border-blue-200 bg-blue-50/30">
          <CardContent className="p-3 md:p-5">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <div className="flex-1">
                <h3 className="font-semibold flex items-center gap-2">
                  <Upload className="w-4 h-4 text-blue-600" />
                  Importar Extrato de Comissão
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  CPFs são unificados automaticamente. Contribuição, produtos e vínculos são atualizados na Base de Clientes.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Select value={mesUpload} onValueChange={setMesUpload}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} />
                <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="bg-blue-700 hover:bg-blue-800">
                  {uploading ? "Processando..." : "Selecionar Arquivo"}
                </Button>
              </div>
            </div>
            {/* Uploads existentes */}
            {(uploads as Record<string, unknown>[]).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {(uploads as Record<string, unknown>[]).map((u) => (
                  <div key={String(u.id)} className="flex items-center gap-1 bg-white border rounded px-2 py-1 text-xs">
                    <FileText className="w-3 h-3 text-blue-500" />
                    <span>{MESES_CURTOS[Number(u.mes) - 1]}/{String(u.ano)} — {String(u.totalRegistros)} reg.</span>
                    <button
                      onClick={() => deletarUpload.mutate({ id: Number(u.id) })}
                      className="ml-1 text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Comissão", value: fmt(metricas?.totalComissao ?? 0), icon: DollarSign, color: "text-green-600" },
            { label: "Corretores", value: String(metricas?.totalCorretores ?? 0), icon: Users, color: "text-blue-600" },
            { label: "Clientes", value: String(metricas?.totalClientes ?? 0), icon: FileText, color: "text-purple-600" },
            { label: "Registros", value: String(metricas?.totalRegistros ?? 0), icon: TrendingUp, color: "text-orange-600" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-muted ${color}`}><Icon className="w-5 h-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-bold">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="resumo">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="resumo">Resumo por Corretor</TabsTrigger>
            <TabsTrigger value="extrato">Extrato Detalhado</TabsTrigger>
            <TabsTrigger value="previsao">Previsão vs Realizado</TabsTrigger>
            <TabsTrigger value="pendentes">
              Comissões Pendentes
              {totalPendentes > 0 && <Badge variant="destructive" className="ml-1 text-xs">{totalPendentes}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* ABA: RESUMO */}
          <TabsContent value="resumo" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Distribuição por Corretor</CardTitle></CardHeader>
                <CardContent>
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmt(v)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">Nenhum dado disponível.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm">Totais por Corretor</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Corretor</TableHead>
                          <TableHead className="text-right">Clientes</TableHead>
                          <TableHead className="text-right text-indigo-600">Contribuição</TableHead>
                          <TableHead className="text-right text-green-600">Comissão</TableHead>
                          <TableHead className="text-right text-amber-600">Previsão 15%</TableHead>
                          <TableHead className="text-right text-emerald-600">Realizado</TableHead>
                          <TableHead className="text-right">% Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {resumoTyped.map((r) => (
                          <TableRow key={r.corretor} className={r.isElisia ? "bg-blue-50 dark:bg-blue-950/20 font-semibold" : ""}>
                            <TableCell>
                              <button
                                className="flex items-center gap-1 hover:text-primary text-left"
                                onClick={() => setCorretorDetalhe(corretorDetalhe === r.corretor ? null : r.corretor)}
                              >
                                {corretorDetalhe === r.corretor ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                {r.corretor}
                                {r.isElisia && <Badge className="text-xs bg-blue-500 ml-1">Titular</Badge>}
                              </button>
                            </TableCell>
                            <TableCell className="text-right">{r.totalClientes}</TableCell>
                            <TableCell className="text-right text-indigo-600">{fmt(r.totalBase)}</TableCell>
                            <TableCell className="text-right text-green-600 font-semibold">{fmt(r.totalComissao)}</TableCell>
                            <TableCell className="text-right text-amber-600">
                              {r.isElisia ? <span className="text-muted-foreground">—</span> : fmt(r.totalPrevisao15)}
                            </TableCell>
                            <TableCell className="text-right text-emerald-600 font-semibold">
                              {fmt(r.totalRealizado50)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {totalGeral > 0 ? ((r.totalComissao / totalGeral) * 100).toFixed(1) + "%" : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Linha de totais */}
                        {resumoTyped.length > 0 && (
                          <TableRow className="border-t-2 font-bold bg-muted/30">
                            <TableCell>TOTAL</TableCell>
                            <TableCell className="text-right">{resumoTyped.reduce((s, r) => s + r.totalClientes, 0)}</TableCell>
                            <TableCell className="text-right text-indigo-600">{fmt(totalBaseGeral)}</TableCell>
                            <TableCell className="text-right text-green-600">{fmt(totalGeral)}</TableCell>
                            <TableCell className="text-right text-amber-600">{fmt(totalPrevisaoGeral)}</TableCell>
                            <TableCell className="text-right text-emerald-600">{fmt(totalRealizadoGeral)}</TableCell>
                            <TableCell className="text-right">100%</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Detalhe do corretor */}
            {corretorDetalhe && (detalhe as unknown[]).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    Clientes de {corretorDetalhe}
                    {resumoTyped.find(r => r.corretor === corretorDetalhe)?.isElisia && (
                      <Badge className="ml-2 text-xs bg-blue-500">Titular — recebe 100% da comissão</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente</TableHead>
                          <TableHead>CPF</TableHead>
                          <TableHead>Produto</TableHead>
                          <TableHead className="text-right text-indigo-600">Contribuição</TableHead>
                          <TableHead className="text-right">Comissão</TableHead>
                          <TableHead className="text-right">Incentivo</TableHead>
                          <TableHead className="text-right font-semibold">Total Bruto</TableHead>
                          <TableHead className="text-right text-purple-600">% Parte</TableHead>
                          <TableHead className="text-right text-amber-600">Previsão 15%</TableHead>
                          <TableHead className="text-right text-green-600">
                            {resumoTyped.find(r => r.corretor === corretorDetalhe)?.isElisia ? "Realizado (100%)" : "Realizado (50%)"}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(detalhe as Record<string, unknown>[]).map((d, i) => {
                          const isElisiaVendedor = resumoTyped.find(r => r.corretor === corretorDetalhe)?.isElisia;
                          return (
                            <TableRow key={i}>
                              <TableCell className="text-xs font-medium">{String(d.nomeCliente ?? "")}</TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">{String(d.cpfCliente ?? "")}</TableCell>
                              <TableCell className="text-xs">{String(d.descricaoProduto ?? "")}</TableCell>
                              <TableCell className="text-right text-xs text-indigo-600">{fmt(parseFloat(String(d.valorBase ?? "0")))}</TableCell>
                              <TableCell className="text-right text-xs">{fmt(parseFloat(String(d.valorComissao ?? "0")))}</TableCell>
                              <TableCell className="text-right text-xs">{fmt(parseFloat(String(d.valorIncentivo ?? "0")))}</TableCell>
                              <TableCell className="text-right text-xs font-semibold text-green-600">{fmt(parseFloat(String(d.valorComissaoTotal ?? "0")))}</TableCell>
                              <TableCell className="text-right text-xs text-purple-600 font-semibold">
                                {d.percentualVendedor != null ? `${parseFloat(String(d.percentualVendedor)).toFixed(0)}%` : "100%"}
                              </TableCell>
                              <TableCell className="text-right text-xs text-amber-600">
                                {isElisiaVendedor ? <span className="text-muted-foreground">—</span> : (d.previsao15 != null ? fmt(parseFloat(String(d.previsao15))) : "—")}
                              </TableCell>
                              <TableCell className="text-right text-xs text-green-600">
                                {d.realizado50 != null ? fmt(parseFloat(String(d.realizado50))) : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ABA: EXTRATO DETALHADO */}
          <TabsContent value="extrato" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Extrato Completo — {mesSel ? MESES[mesSel - 1] : "Todos os meses"}/{ano}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Corretor</TableHead>
                        <TableHead className="text-right">Clientes</TableHead>
                        <TableHead className="text-right text-indigo-600">Contribuição</TableHead>
                        <TableHead className="text-right">Valor Comissão</TableHead>
                        <TableHead className="text-right">Valor Incentivo</TableHead>
                        <TableHead className="text-right font-semibold">Total Comissão</TableHead>
                        <TableHead className="text-right text-amber-600">Previsão 15%</TableHead>
                        <TableHead className="text-right text-green-600">Realizado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resumoTyped.map(r => (
                        <TableRow key={r.corretor} className={r.isElisia ? "bg-blue-50 dark:bg-blue-950/20 font-semibold" : ""}>
                          <TableCell>
                            {r.corretor}
                            {r.isElisia && <Badge className="ml-1 text-xs bg-blue-500">100%</Badge>}
                          </TableCell>
                          <TableCell className="text-right">{r.totalClientes}</TableCell>
                          <TableCell className="text-right text-indigo-600">{fmt(r.totalBase)}</TableCell>
                          <TableCell className="text-right">{fmt(r.totalValorComissao)}</TableCell>
                          <TableCell className="text-right">{fmt(r.totalValorIncentivo)}</TableCell>
                          <TableCell className="text-right font-bold text-green-600">{fmt(r.totalComissao)}</TableCell>
                          <TableCell className="text-right text-amber-600">
                            {r.isElisia ? <span className="text-muted-foreground">—</span> : fmt(r.totalPrevisao15)}
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            {fmt(r.totalRealizado50)}
                            {!r.isElisia && <span className="text-xs text-muted-foreground ml-1">(50%)</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                      {resumoTyped.length > 0 && (
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell>TOTAL</TableCell>
                          <TableCell className="text-right">{resumoTyped.reduce((s, r) => s + r.totalClientes, 0)}</TableCell>
                          <TableCell className="text-right text-indigo-600">{fmt(totalBaseGeral)}</TableCell>
                          <TableCell className="text-right">{fmt(resumoTyped.reduce((s, r) => s + r.totalValorComissao, 0))}</TableCell>
                          <TableCell className="text-right">{fmt(resumoTyped.reduce((s, r) => s + r.totalValorIncentivo, 0))}</TableCell>
                          <TableCell className="text-right text-green-600">{fmt(totalGeral)}</TableCell>
                          <TableCell className="text-right text-amber-600">{fmt(totalPrevisaoGeral)}</TableCell>
                          <TableCell className="text-right text-green-600">{fmt(totalRealizadoGeral)}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA: PREVISÃO VS REALIZADO */}
          <TabsContent value="previsao" className="space-y-4">
            {/* Explicação */}
            <Card className="border-amber-200 bg-amber-50/30">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Target className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm space-y-1">
                    <p className="font-semibold text-amber-800">Lógica de Comissão</p>
                    <p className="text-amber-700">
                      <strong>Vendedores (não-ELISIA):</strong> Expectativa = 15% da contribuição (valor base). Realizado = 50% da comissão total recebida.
                    </p>
                    <p className="text-amber-700">
                      <strong>ELISIA:</strong> Recebe 100% da comissão quando está em seu nome. Os outros 15% são da ELISIA como titular.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Previsão (15% da Contribuição) vs Realizado (50% da Comissão) — Vendedores</CardTitle></CardHeader>
              <CardContent>
                {barData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={barData} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Legend />
                      <Bar dataKey="previsao" name="Previsão 15%" fill="#f59e0b" />
                      <Bar dataKey="realizado" name="Realizado 50%" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-8">Nenhum dado disponível para o período selecionado.</p>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Cards dos vendedores não-ELISIA */}
              {resumoTyped.filter(r => !r.isElisia && r.corretor !== "Sem Corretor" && r.totalBase > 0).map(r => (
                <Card key={r.corretor}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{r.corretor}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Contribuição total:</span>
                        <span className="font-medium text-indigo-600">{fmt(r.totalBase)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-600">Previsão (15% da contribuição):</span>
                        <span className="font-bold text-amber-600">{fmt(r.totalPrevisao15)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-600">Realizado (50% da comissão):</span>
                        <span className="font-bold text-green-600">{fmt(r.totalRealizado50)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="text-muted-foreground">Diferença:</span>
                        <span className={`font-bold ${r.totalRealizado50 >= r.totalPrevisao15 ? "text-green-600" : "text-red-500"}`}>
                          {fmt(r.totalRealizado50 - r.totalPrevisao15)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Card da ELISIA */}
              {resumoTyped.filter(r => r.isElisia).map(r => (
                <Card key={r.corretor} className="border-blue-200 bg-blue-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {r.corretor}
                      <Badge className="text-xs bg-blue-500">Titular — 100%</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Contribuição total:</span>
                        <span className="font-medium text-indigo-600">{fmt(r.totalBase)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Comissão total recebida:</span>
                        <span className="font-bold text-green-600">{fmt(r.totalComissao)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-600">Realizado (100% da comissão):</span>
                        <span className="font-bold text-blue-600">{fmt(r.totalRealizado50)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground border-t pt-2">
                        ELISIA recebe 100% quando o cliente está em seu nome. Os 15% de previsão dos vendedores são parte da comissão da ELISIA como titular.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ABA: COMISSÕES PENDENTES */}
          <TabsContent value="pendentes" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={String(mesPendentes)} onValueChange={v => setMesPendentes(Number(v))}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={vendedorPendentes} onValueChange={setVendedorPendentes}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Todos os vendedores" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os vendedores</SelectItem>
                  {(metricasPendentes as Record<string, unknown>[]).map(m => (
                    <SelectItem key={String(m.vendedor)} value={String(m.vendedor)}>{String(m.vendedor)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por nome ou CPF..."
                  value={buscaPendentes}
                  onChange={e => setBuscaPendentes(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                onClick={exportarPDFPendentes}
                disabled={pendentesFiltrados.length === 0}
                className="gap-2 border-red-600 text-red-700 hover:bg-red-50 shrink-0"
              >
                <FileText className="w-4 h-4" />
                Exportar PDF
              </Button>
            </div>

            {/* KPIs pendentes */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <span className="text-xs text-muted-foreground">Sem Comissão</span>
                  </div>
                  <p className="text-lg font-bold text-red-600">{totalPendentes}</p>
                  <p className="text-xs text-muted-foreground">{MESES_CURTOS[mesPendentes - 1]}/{ano}</p>
                </CardContent>
              </Card>
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="h-4 w-4 text-amber-500" />
                    <span className="text-xs text-muted-foreground">Previsão Perdida</span>
                  </div>
                  <p className="text-lg font-bold text-amber-600">{fmt(totalPrevisaoPendentes)}</p>
                  <p className="text-xs text-muted-foreground">15% da contribuição</p>
                </CardContent>
              </Card>
              {(metricasPendentes as Record<string, unknown>[]).slice(0, 2).map(m => (
                <Card key={String(m.vendedor)}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="h-4 w-4 text-blue-500" />
                      <span className="text-xs text-muted-foreground truncate">{String(m.vendedor)}</span>
                    </div>
                    <p className="text-lg font-bold">{Number(m.totalPendentes)}</p>
                    <p className="text-xs text-muted-foreground">pendentes</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Resumo por vendedor */}
            {vendedorPendentes === "todos" && (
              <Card>
                <CardHeader><CardTitle className="text-sm">Resumo por Vendedor — {MESES[mesPendentes - 1]}/{ano}</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vendedor</TableHead>
                          <TableHead className="text-right">Clientes Pendentes</TableHead>
                          <TableHead className="text-right text-amber-600">Previsão Perdida (15%)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(metricasPendentes as Record<string, unknown>[]).map(m => (
                          <TableRow key={String(m.vendedor)}>
                            <TableCell className="font-medium">{String(m.vendedor)}</TableCell>
                            <TableCell className="text-right text-red-600 font-semibold">{Number(m.totalPendentes)}</TableCell>
                            <TableCell className="text-right text-amber-600">{fmt(parseFloat(String(m.totalPrevisao ?? "0")))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Lista de clientes pendentes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Clientes sem comissão em {MESES[mesPendentes - 1]}/{ano}
                  {vendedorPendentes !== "todos" && ` — ${vendedorPendentes}`}
                  <Badge variant="outline" className="ml-2">{pendentesFiltrados.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>CPF</TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right text-indigo-600">Contribuição</TableHead>
                        <TableHead className="text-right text-amber-600">Previsão 15%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendentesFiltrados.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            {totalPendentes === 0
                              ? "✓ Todos os clientes receberam comissão neste mês!"
                              : "Nenhum resultado encontrado para a busca."}
                          </TableCell>
                        </TableRow>
                      ) : pendentesFiltrados.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-xs">{String(p.nome ?? "")}</TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">{String(p.cpf ?? "")}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline">{String(p.vendedor ?? "—")}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{String(p.produtos ?? "—")}</TableCell>
                          <TableCell className="text-right text-xs text-indigo-600">{fmt(parseFloat(String(p.contribuicao ?? "0")))}</TableCell>
                          <TableCell className="text-right text-xs text-amber-600">
                            {p.previsao15 != null ? fmt(parseFloat(String(p.previsao15))) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

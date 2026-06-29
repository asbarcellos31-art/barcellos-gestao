import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import ContaForm from "@/components/ContaForm";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, AlertCircle, TrendingUp, TrendingDown, Filter } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ExportButton from "@/components/ExportButton";
import { addBarcellosHeader, addBarcellosFooter } from "@/lib/pdfHelpers";
import { toast } from "sonner";
import { MESES, CATEGORIAS, STATUS_COLORS, VINCULOS } from "../../../shared/constants";
import { cn } from "@/lib/utils";
import { useAno } from "../contexts/AnoContext";

function formatCurrency(value: string | number | null | undefined) {
  const num = parseFloat(String(value ?? 0));
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  // Se for objeto Date, usa os métodos UTC para evitar conversão de fuso
  if (value instanceof Date) {
    const dd = String(value.getUTCDate()).padStart(2, "0");
    const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = value.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  // Se for string ISO, extrai YYYY-MM-DD
  const s = String(value).substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "-";
  const [yyyy, mm, dd] = s.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

export default function LancamentosMes() {
  const params = useParams<{ mes: string }>();
  const mes = parseInt(params.mes ?? "1");
  const { ano } = useAno();
  const utils = trpc.useUtils();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();

  const { data: contas = [], isLoading } = trpc.contas.listar.useQuery({ mes, ano });

  const excluir = trpc.contas.excluir.useMutation({
    onSuccess: () => {
      toast.success("Conta excluída!");
      utils.contas.listar.invalidate();
      utils.contas.listarTodas.invalidate();
      utils.contas.metricas.invalidate();
      utils.contas.custosPorVinculo.invalidate();
      utils.contas.custosPorCategoria.invalidate();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const handleEdit = (id: number) => {
    setEditId(id);
    setFormOpen(true);
  };

  const handleNew = () => {
    setEditId(undefined);
    setFormOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Deseja excluir esta conta?")) {
      excluir.mutate({ id });
    }
  };

  const [filtroTipo, setFiltroTipo] = useState<"TODOS" | "RECEITA" | "DESPESA">("TODOS");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("TODAS");
  const [filtroVinculo, setFiltroVinculo] = useState<string>("TODOS");
  const [filtroStatus, setFiltroStatus] = useState<string>("TODOS");

  const receitas = contas.filter(c => (c as any).tipo === "RECEITA");
  const despesas = contas.filter(c => (c as any).tipo !== "RECEITA");

  // Categorias disponíveis nas contas do mês
  const categoriasDisponiveis = Array.from(new Set(contas.map(c => c.categoria))).sort();

  const contasFiltradas = contas.filter(c => {
    const tipo = (c as any).tipo ?? "DESPESA";
    if (filtroTipo !== "TODOS" && tipo !== filtroTipo) return false;
    if (filtroCategoria !== "TODAS" && c.categoria !== filtroCategoria) return false;
    if (filtroVinculo !== "TODOS" && c.vinculo !== filtroVinculo) return false;
    if (filtroStatus !== "TODOS" && c.status !== filtroStatus) return false;
    return true;
  });

  // Somas dinâmicas baseadas nos itens filtrados
  const totalReceitasFiltrado = contasFiltradas
    .filter(c => (c as any).tipo === "RECEITA")
    .reduce((acc, c) => acc + parseFloat(String(c.valor)), 0);
  const totalDespesasFiltrado = contasFiltradas
    .filter(c => (c as any).tipo !== "RECEITA")
    .reduce((acc, c) => acc + parseFloat(String(c.valor)), 0);
  // Pago = apenas DESPESAS pagas
  const totalPagoFiltrado = contasFiltradas
    .filter(c => (c as any).tipo !== "RECEITA" && c.status === "PAGO")
    .reduce((acc, c) => acc + parseFloat(String(c.valorPago ?? c.valor)), 0);

  // Totais gerais (sem filtro) para os cards de pendentes/atrasadas
  const totalReceitas = receitas.reduce((acc, c) => acc + parseFloat(String(c.valor)), 0);
  const totalDespesas = despesas.reduce((acc, c) => acc + parseFloat(String(c.valor)), 0);
  // Pago = apenas DESPESAS pagas
  const totalPago = contas
    .filter(c => (c as any).tipo !== "RECEITA" && c.status === "PAGO")
    .reduce((acc, c) => acc + parseFloat(String(c.valorPago ?? c.valor)), 0);
  const pendentes = contas.filter(c => c.status === "PENDENTE").length;
  const atrasadas = contas.filter(c => c.status === "ATRASADO").length;

  const filtroAtivo = filtroTipo !== "TODOS" || filtroCategoria !== "TODAS" || filtroVinculo !== "TODOS";

  const exportarPDF = async () => {
    if (contasFiltradas.length === 0) { toast.error("Nenhum lançamento para exportar"); return; }
    toast.loading("Gerando PDF...", { id: "pdf-contas" });
    try {
      const [{ default: jsPDF }, _auto] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new (jsPDF as any)({ orientation: "landscape", unit: "mm", format: "a4" });

      const filtrosAtivos: string[] = [];
      if (filtroTipo !== "TODOS") filtrosAtivos.push(filtroTipo === "RECEITA" ? "Receitas" : "Despesas");
      if (filtroStatus !== "TODOS") filtrosAtivos.push({ PAGO: "Pagos", PENDENTE: "Pendentes", ATRASADO: "Atrasados" }[filtroStatus] ?? filtroStatus);
      if (filtroVinculo !== "TODOS") filtrosAtivos.push(filtroVinculo);
      if (filtroCategoria !== "TODAS") filtrosAtivos.push(CATEGORIAS[filtroCategoria] ?? filtroCategoria);
      const subtituloFiltros = filtrosAtivos.length ? ` · ${filtrosAtivos.join(", ")}` : "";
      const subtitle = `${MESES[mes - 1]} ${ano}${subtituloFiltros} · ${contasFiltradas.length} lançamento(s)`;

      let nextY = addBarcellosHeader(doc as any, "Contas a Pagar", subtitle);

      // Cards de resumo
      const totalValor = contasFiltradas.reduce((a, c) => a + parseFloat(String(c.valor)), 0);
      const totalPg = contasFiltradas.filter(c => c.status === "PAGO").reduce((a, c) => a + parseFloat(String(c.valorPago ?? c.valor)), 0);
      const totalPend = contasFiltradas.filter(c => c.status !== "PAGO").reduce((a, c) => a + parseFloat(String(c.valor)), 0);
      const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const pageW = doc.internal.pageSize.getWidth();
      const cardW = (pageW - 28) / 3;
      const cards = [
        { label: "Total", valor: fmtBRL(totalValor), cor: [30, 64, 175] as [number,number,number] },
        { label: "Total Pago", valor: fmtBRL(totalPg), cor: [6, 95, 70] as [number,number,number] },
        { label: "A Pagar / Pendente", valor: fmtBRL(totalPend), cor: [146, 64, 14] as [number,number,number] },
      ];
      cards.forEach((card, i) => {
        const x = 14 + i * (cardW + 4);
        doc.setFillColor(245, 247, 252);
        doc.roundedRect(x, nextY, cardW, 12, 2, 2, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 120);
        doc.text(card.label.toUpperCase(), x + 4, nextY + 5);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...card.cor);
        doc.text(card.valor, x + 4, nextY + 10);
      });
      nextY += 17;

      (doc as any).autoTable({
        startY: nextY,
        head: [["Mês", "Descrição", "Vencimento", "Valor", "Status", "Categoria", "Vínculo", "Valor Pago"]],
        body: contasFiltradas.map(c => [
          MESES[c.mes - 1],
          c.descricao,
          formatDate(c.dataVencimento),
          parseFloat(String(c.valor)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
          c.status,
          CATEGORIAS[c.categoria] ?? c.categoria,
          c.vinculo,
          c.valorPago ? parseFloat(String(c.valorPago)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "-",
        ]),
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 247, 255] },
        columnStyles: { 3: { halign: "right" }, 7: { halign: "right" } },
      });

      addBarcellosFooter(doc as any);
      doc.save(`contas_pagar_${MESES[mes - 1]}_${ano}${filtrosAtivos.length ? "_filtrado" : ""}.pdf`);
      toast.success("PDF gerado!", { id: "pdf-contas" });
    } catch (e) {
      toast.error("Erro ao gerar PDF", { id: "pdf-contas" });
    }
  };

  return (
    <AppLayout>
      <div className="p-3 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{MESES[mes - 1]} {ano}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{contas.length} lançamento(s)</p>
          </div>
          <div className="flex items-center gap-2">
            <ExportButton mes={mes} ano={ano} filtroTipo={filtroTipo} filtroStatus={filtroStatus} filtroVinculo={filtroVinculo} filtroCategoria={filtroCategoria} onPDF={exportarPDF} />
            <Button onClick={handleNew} className="gap-2">
              <Plus className="w-4 h-4" /> Nova Conta
            </Button>
          </div>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-green-500" />
              <p className="text-xs text-gray-500 uppercase tracking-wide">Receitas{filtroAtivo ? " (filtrado)" : ""}</p>
            </div>
            <p className="text-xl font-bold text-green-600">{formatCurrency(filtroAtivo ? totalReceitasFiltrado : totalReceitas)}</p>
            {filtroAtivo && totalReceitas !== totalReceitasFiltrado && (
              <p className="text-xs text-gray-400 mt-0.5">Total: {formatCurrency(totalReceitas)}</p>
            )}
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="w-3.5 h-3.5 text-red-500" />
              <p className="text-xs text-gray-500 uppercase tracking-wide">Despesas{filtroAtivo ? " (filtrado)" : ""}</p>
            </div>
            <p className="text-xl font-bold text-red-600">{formatCurrency(filtroAtivo ? totalDespesasFiltrado : totalDespesas)}</p>
            {filtroAtivo && totalDespesas !== totalDespesasFiltrado && (
              <p className="text-xs text-gray-400 mt-0.5">Total: {formatCurrency(totalDespesas)}</p>
            )}
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Pago{filtroAtivo ? " (filtrado)" : ""}</p>
            <p className="text-xl font-bold text-blue-600 mt-1">{formatCurrency(filtroAtivo ? totalPagoFiltrado : totalPago)}</p>
            {filtroAtivo && totalPago !== totalPagoFiltrado && (
              <p className="text-xs text-gray-400 mt-0.5">Total: {formatCurrency(totalPago)}</p>
            )}
          </div>
          <div className="bg-white rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Pendentes / Atrasadas</p>
            <p className="text-xl font-bold text-yellow-600 mt-1">{pendentes} <span className="text-red-500">/ {atrasadas}</span></p>
          </div>
        </div>

        {/* Filtros */}
        <div className="space-y-3 mb-4">
          {/* Linha 1: Tipo */}
          <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500 font-medium flex items-center gap-1"><Filter className="w-3.5 h-3.5" /> Filtrar:</span>
          {(["TODOS", "DESPESA", "RECEITA"] as const).map(t => (
            <button
              key={t}
              onClick={() => setFiltroTipo(t)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                filtroTipo === t
                  ? t === "RECEITA" ? "bg-green-500 text-white border-green-500" : t === "DESPESA" ? "bg-red-500 text-white border-red-500" : "bg-gray-800 text-white border-gray-800"
                  : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
              )}
            >
              {t === "TODOS" ? `Todos (${contas.length})` : t === "RECEITA" ? `↑ Receitas (${receitas.length})` : `↓ Despesas (${despesas.length})`}
            </button>
          ))}
          </div>
          
          {/* Linha 2: Status */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-500 font-medium">Status:</span>
            {(["TODOS", "PAGO", "PENDENTE", "ATRASADO"] as const).map(s => {
              const statusLabels = { TODOS: "Todos", PAGO: "✅ Pagos", PENDENTE: "⏳ Pendentes", ATRASADO: "⚠️ Atrasados" };
              const statusColors = { TODOS: "bg-gray-800", PAGO: "bg-green-500", PENDENTE: "bg-yellow-500", ATRASADO: "bg-red-500" };
              return (
                <button
                  key={s}
                  onClick={() => setFiltroStatus(s)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                    filtroStatus === s
                      ? `${statusColors[s]} text-white border-current`
                      : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                  )}
                >
                  {statusLabels[s]}
                </button>
              );
            })}
          </div>
          
          {/* Linha 3: Dropdowns e botão limpar */}
          <div className="flex items-center gap-2">
            <Select value={filtroVinculo} onValueChange={setFiltroVinculo}>
              <SelectTrigger className="h-8 text-xs w-40">
                <SelectValue placeholder="Todos os vínculos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos os vínculos</SelectItem>
                {VINCULOS.map(v => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
              <SelectTrigger className="h-8 text-xs w-48">
                <SelectValue placeholder="Todas as categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas as categorias</SelectItem>
                {categoriasDisponiveis.map(cat => (
                  <SelectItem key={cat} value={cat}>{CATEGORIAS[cat] ?? cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(filtroAtivo || filtroStatus !== "TODOS") && (
              <button
                onClick={() => { setFiltroTipo("TODOS"); setFiltroCategoria("TODAS"); setFiltroVinculo("TODOS"); setFiltroStatus("TODOS"); }}
                className="px-2 py-1 rounded text-xs text-gray-500 border border-gray-300 hover:bg-gray-100 transition-colors"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-gray-400">Carregando...</div>
          ) : contas.length === 0 ? (
            <div className="p-12 text-center">
              <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Nenhuma conta cadastrada para {MESES[mes - 1]}</p>
              <Button onClick={handleNew} variant="outline" className="mt-4 gap-2">
                <Plus className="w-4 h-4" /> Adicionar primeira conta
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Tipo</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Descrição</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Vencimento</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Valor</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Categoria</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Vínculo</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Valor Pago</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Pagamento</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {contasFiltradas.map((conta, i) => {
                    const isReceita = (conta as any).tipo === "RECEITA";
                    return (
                      <tr key={conta.id} className={cn(
                        "border-b last:border-0 hover:bg-gray-50 transition-colors",
                        isReceita ? "bg-green-50/40" : (i % 2 === 0 ? "" : "bg-gray-50/50")
                      )}>
                        <td className="px-4 py-3">
                          {isReceita ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                              <TrendingUp className="w-3 h-3" /> RECEITA
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                              <TrendingDown className="w-3 h-3" /> DESPESA
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{conta.descricao}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(conta.dataVencimento)}</td>
                        <td className={cn("px-4 py-3 text-right font-medium", isReceita ? "text-green-700" : "text-gray-900")}>
                          {formatCurrency(conta.valor)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[conta.status])}>
                            {conta.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{CATEGORIAS[conta.categoria] ?? conta.categoria}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {conta.vinculo}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-green-600">{conta.valorPago ? formatCurrency(conta.valorPago) : "-"}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(conta.dataPagamento)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => handleEdit(conta.id)} className="h-7 w-7 p-0">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(conta.id)} className="h-7 w-7 p-0 text-red-500 hover:text-red-700">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ContaForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditId(undefined); }}
        onSuccess={() => {}}
        contaId={editId}
        defaultMes={mes}
        defaultAno={ano}
      />
    </AppLayout>
  );
}

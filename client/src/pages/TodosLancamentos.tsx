import { useState } from "react";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import ContaForm from "@/components/ContaForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, Filter } from "lucide-react";
import ExportButton from "@/components/ExportButton";
import { toast } from "sonner";
import { MESES, CATEGORIAS, VINCULOS, STATUS_COLORS } from "../../../shared/constants";
import { cn } from "@/lib/utils";
import { useAno } from "../contexts/AnoContext";

function formatCurrency(value: string | number | null | undefined) {
  const num = parseFloat(String(value ?? 0));
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  if (value instanceof Date) {
    const dd = String(value.getUTCDate()).padStart(2, "0");
    const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = value.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  const s = String(value).substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "-";
  const [yyyy, mm, dd] = s.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

export default function TodosLancamentos() {
  const { ano } = useAno();
  const utils = trpc.useUtils();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | undefined>();
  const [filtroMes, setFiltroMes] = useState<string>("todos");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroVinculo, setFiltroVinculo] = useState<string>("todos");
  const [busca, setBusca] = useState("");

  const statusOpcoes = [
    { value: "todos", label: "Todos", icon: "📊" },
    { value: "PENDENTE", label: "Em Aberto", icon: "⏳" },
    { value: "ATRASADO", label: "Atrasada", icon: "⚠️" },
    { value: "PAGO", label: "Pago", icon: "✅" },
  ];

  const { data: contas = [], isLoading } = trpc.contas.listarTodas.useQuery({ ano });

  const excluir = trpc.contas.excluir.useMutation({
    onSuccess: () => {
      toast.success("Conta excluída!");
      utils.contas.listar.invalidate();
      utils.contas.listarTodas.invalidate();
      utils.contas.metricas.invalidate();
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const contasFiltradas = contas.filter(c => {
    if (filtroMes !== "todos" && c.mes !== parseInt(filtroMes)) return false;
    if (filtroStatus !== "todos" && c.status !== filtroStatus) return false;
    if (filtroVinculo !== "todos" && c.vinculo !== filtroVinculo) return false;
    if (busca && !c.descricao.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  const totalFiltrado = contasFiltradas.reduce((acc, c) => acc + parseFloat(String(c.valor)), 0);

  return (
    <AppLayout>
      <div className="p-3 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Todos os Lançamentos</h1>
            <p className="text-sm text-gray-500 mt-0.5">{contasFiltradas.length} de {contas.length} lançamentos · {formatCurrency(totalFiltrado)}</p>
          </div>
          <div className="flex items-center gap-2">
            <ExportButton ano={new Date().getFullYear()} />
            <Button onClick={() => { setEditId(undefined); setFormOpen(true); }} className="gap-2">
              <Plus className="w-4 h-4" /> Nova Conta
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border shadow-sm p-4 mb-6 space-y-4">
          {/* Barra de busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar descrição..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filtro de Status com botões visuais */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1"><Filter size={14} /> Status</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {statusOpcoes.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFiltroStatus(opt.value)}
                  className={cn(
                    "px-2 py-2 rounded-lg text-xs md:text-sm font-medium transition-all border whitespace-nowrap",
                    filtroStatus === opt.value
                      ? "bg-blue-100 text-blue-700 border-blue-300"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                  )}
                >
                  <span className="mr-1">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filtros adicionais em grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Select value={filtroMes} onValueChange={setFiltroMes}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Filtrar por Mês" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os meses</SelectItem>
                {MESES.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroVinculo} onValueChange={setFiltroVinculo}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Filtrar por Vínculo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os vínculos</SelectItem>
                {VINCULOS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabela */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-gray-400">Carregando...</div>
          ) : contasFiltradas.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <p className="text-lg font-medium">Nenhum lançamento encontrado</p>
              <p className="text-sm mt-1">Tente ajustar os filtros ou criar um novo lançamento</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="text-xs text-gray-500 px-4 py-2 bg-gray-50 border-b">
                Mostrando {contasFiltradas.length} de {contas.length} lançamentos • Total: {formatCurrency(totalFiltrado)}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Mês</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Descrição</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Vencimento</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Valor</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Categoria</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Vínculo</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Valor Pago</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {contasFiltradas.map((conta, i) => (
                    <tr key={conta.id} className={cn("border-b last:border-0 hover:bg-gray-50 transition-colors", i % 2 === 0 ? "" : "bg-gray-50/30")}>
                      <td className="px-4 py-3 text-gray-500 text-xs">{MESES[conta.mes - 1]}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{conta.descricao}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(conta.dataVencimento)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(conta.valor)}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[conta.status])}>
                          {conta.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{CATEGORIAS[conta.categoria] ?? conta.categoria}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {conta.vinculo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-green-600">{conta.valorPago ? formatCurrency(conta.valorPago) : "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => { setEditId(conta.id); setFormOpen(true); }} className="h-7 w-7 p-0">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir?")) excluir.mutate({ id: conta.id }); }} className="h-7 w-7 p-0 text-red-500 hover:text-red-700">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 bg-gray-50 border-t font-medium text-gray-700">
                Total exibido: {formatCurrency(totalFiltrado)}
              </div>
            </div>
          )}
        </div>
      </div>

      <ContaForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditId(undefined); }}
        onSuccess={() => {}}
        contaId={editId}
      />
    </AppLayout>
  );
}

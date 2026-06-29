import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { CATEGORIAS, VINCULOS, MESES } from "../../../shared/constants";
import { RefreshCw, CreditCard } from "lucide-react";

interface ContaFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  contaId?: number;
  defaultMes?: number;
  defaultAno?: number;
}

const CATEGORIAS_LIST = Object.entries(CATEGORIAS).map(([value, label]) => ({ value, label }));

export default function ContaForm({ open, onClose, onSuccess, contaId, defaultMes, defaultAno }: ContaFormProps) {
  const isEdit = !!contaId;
  const utils = trpc.useUtils();

  const { data: contaExistente } = trpc.contas.buscarPorId.useQuery(
    { id: contaId! },
    { enabled: !!contaId }
  );

  const [form, setForm] = useState({
    descricao: "",
    dataVencimento: "",
    valor: "",
    dataPagamento: "",
    status: "PENDENTE" as "PAGO" | "PENDENTE" | "ATRASADO",
    categoria: "DIVERSOS" as string,
    vinculo: "ANDERSON" as "ANDERSON" | "NAYARA" | "ELISIA" | "BARCELLOS",
    valorPago: "",
    mes: defaultMes ?? new Date().getMonth() + 1,
    ano: defaultAno ?? new Date().getFullYear(),
    tipo: "DESPESA" as "RECEITA" | "DESPESA",
  });

  const [recorrente, setRecorrente] = useState(false);
  const [mesesRecorrencia, setMesesRecorrencia] = useState(12);
  const [parcelado, setParcelado] = useState(false);
  const [numParcelas, setNumParcelas] = useState(2);
  const formCarregado = useRef(false);

  const toDateStr = (val: unknown): string => {
    if (!val) return "";
    if (val instanceof Date) {
      // Usa UTC para evitar deslocamento de fuso
      return `${val.getUTCFullYear()}-${String(val.getUTCMonth() + 1).padStart(2, "0")}-${String(val.getUTCDate()).padStart(2, "0")}`;
    }
    return String(val).substring(0, 10);
  };

  useEffect(() => {
    if (!open) {
      setForm({
        descricao: "",
        dataVencimento: "",
        valor: "",
        dataPagamento: "",
        status: "PENDENTE",
        categoria: "DIVERSOS",
        vinculo: "ANDERSON",
        valorPago: "",
        mes: defaultMes ?? new Date().getMonth() + 1,
        ano: defaultAno ?? new Date().getFullYear(),
        tipo: "DESPESA",
      });
      setRecorrente(false);
      setParcelado(false);
      formCarregado.current = false;
    } else if (open && contaExistente && !formCarregado.current) {
      // Popula apenas uma vez por abertura — evita sobrescrita por refetch em background
      formCarregado.current = true;
      setForm({
        descricao: contaExistente.descricao,
        dataVencimento: toDateStr(contaExistente.dataVencimento),
        valor: String(contaExistente.valor),
        dataPagamento: toDateStr(contaExistente.dataPagamento),
        status: contaExistente.status,
        categoria: contaExistente.categoria,
        vinculo: contaExistente.vinculo,
        valorPago: contaExistente.valorPago ? String(contaExistente.valorPago) : "",
        mes: contaExistente.mes,
        ano: contaExistente.ano,
        tipo: ((contaExistente as any).tipo ?? "DESPESA") as "RECEITA" | "DESPESA",
      });
    } else if (open && !contaId) {
      setForm(f => ({
        ...f,
        mes: defaultMes ?? new Date().getMonth() + 1,
        ano: defaultAno ?? new Date().getFullYear(),
      }));
    }
  }, [open, contaExistente, contaId, defaultMes, defaultAno]);

  const invalidateAll = () => {
    utils.contas.listar.invalidate();
    utils.contas.listarTodas.invalidate();
    utils.contas.metricas.invalidate();
    utils.contas.custosPorVinculo.invalidate();
    utils.contas.custosPorCategoria.invalidate();
    utils.contas.alertas.invalidate();
    utils.contas.vencidas.invalidate();
    utils.contas.buscarPorId.invalidate();
  };

  const criar = trpc.contas.criar.useMutation({
    onSuccess: () => {
      toast.success("Conta criada com sucesso!");
      invalidateAll();
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error("Erro ao criar conta: " + e.message),
  });

  const criarParcelado = trpc.contas.criarParcelado.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.criadas} parcela(s) criada(s) com sucesso!`);
      invalidateAll();
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error("Erro ao criar parcelas: " + e.message),
  });

  const criarRecorrente = trpc.contas.criarRecorrente.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.criadas} conta(s) recorrente(s) criada(s) com sucesso!`);
      invalidateAll();
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error("Erro ao criar contas recorrentes: " + e.message),
  });

  const atualizar = trpc.contas.atualizar.useMutation({
    onSuccess: () => {
      toast.success("Conta atualizada com sucesso!");
      invalidateAll();
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error("Erro ao atualizar conta: " + e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      descricao: form.descricao,
      dataVencimento: form.dataVencimento,
      valor: form.valor,
      dataPagamento: form.dataPagamento || null,
      status: form.status,
      categoria: form.categoria as any,
      vinculo: form.vinculo,
      valorPago: form.valorPago || null,
      mes: form.mes,
      ano: form.ano,
      tipo: form.tipo,
    };
    if (isEdit) {
      atualizar.mutate({ id: contaId!, data: payload });
    } else if (parcelado) {
      criarParcelado.mutate({ ...payload, numParcelas });
    } else if (recorrente) {
      criarRecorrente.mutate({ ...payload, mesesRecorrencia });
    } else {
      criar.mutate(payload);
    }
  };

  const set = (key: string, value: any) => setForm(f => ({ ...f, [key]: value }));
  const isPending = criar.isPending || atualizar.isPending || criarRecorrente.isPending || criarParcelado.isPending;

  // Calcular preview dos meses que serão criados
  const previewMeses = () => {
    const meses = [];
    for (let i = 0; i < Math.min(mesesRecorrencia, 6); i++) {
      let m = form.mes + i;
      let a = form.ano;
      while (m > 12) { m -= 12; a++; }
      meses.push(`${MESES[m - 1]}/${a}`);
    }
    if (mesesRecorrencia > 6) meses.push(`... +${mesesRecorrencia - 6} meses`);
    return meses.join(", ");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Conta" : "Nova Conta"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Descrição *</Label>
            <Input value={form.descricao} onChange={e => set("descricao", e.target.value)} required placeholder="Ex: Aluguel, Salário, Luz..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Mês *</Label>
              <Select value={String(form.mes)} onValueChange={v => set("mes", Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ano *</Label>
              <Input type="number" value={form.ano} onChange={e => set("ano", Number(e.target.value))} min={2015} max={2050} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data Vencimento *</Label>
              <Input type="date" value={form.dataVencimento} onChange={e => set("dataVencimento", e.target.value)} required />
            </div>
            <div>
              <Label>Valor *</Label>
              <Input type="number" step="0.01" value={form.valor} onChange={e => set("valor", e.target.value)} required placeholder="0,00" />
            </div>
          </div>

          {/* Tipo: RECEITA ou DESPESA */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => set("tipo", "DESPESA")}
              className={`flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-semibold transition-all ${
                form.tipo === "DESPESA"
                  ? "border-red-500 bg-red-50 text-red-700"
                  : "border-muted bg-background text-muted-foreground hover:border-red-300"
              }`}
            >
              ↓ Despesa
            </button>
            <button
              type="button"
              onClick={() => set("tipo", "RECEITA")}
              className={`flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-semibold transition-all ${
                form.tipo === "RECEITA"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-muted bg-background text-muted-foreground hover:border-emerald-300"
              }`}
            >
              ↑ Receita
            </button>
          </div>

          <div>
            <Label>Status *</Label>
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDENTE">Pendente</SelectItem>
                <SelectItem value="PAGO">Pago</SelectItem>
                <SelectItem value="ATRASADO">Atrasado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Categoria *</Label>
            <Select value={form.categoria} onValueChange={v => set("categoria", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS_LIST.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Vínculo (Centro de Custo) *</Label>
            <Select value={form.vinculo} onValueChange={v => set("vinculo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VINCULOS.map(v => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(form.status === "PAGO") && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data Pagamento</Label>
                <Input type="date" value={form.dataPagamento} onChange={e => set("dataPagamento", e.target.value)} />
              </div>
              <div>
                <Label>Valor Pago</Label>
                <Input type="number" step="0.01" value={form.valorPago} onChange={e => set("valorPago", e.target.value)} placeholder="0,00" />
              </div>
            </div>
          )}

          {/* Seção de Parcelado + Recorrente — apenas no cadastro */}
          {!isEdit && (
            <div className="space-y-2">
              {/* Parcelado */}
              <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-medium cursor-pointer" htmlFor="parcelado-switch">
                      Parcelado
                    </Label>
                  </div>
                  <Switch
                    id="parcelado-switch"
                    checked={parcelado}
                    onCheckedChange={v => { setParcelado(v); if (v) setRecorrente(false); }}
                  />
                </div>
                {parcelado && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Label className="text-sm whitespace-nowrap">Número de parcelas</Label>
                      <Input
                        type="number"
                        min={2}
                        max={60}
                        value={numParcelas}
                        onChange={e => setNumParcelas(Number(e.target.value))}
                        className="w-20"
                      />
                      <span className="text-sm text-muted-foreground">x</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Serão criadas: <span className="font-medium text-foreground">{previewMeses().split(",").slice(0, numParcelas).join(", ")}</span>
                    </p>
                    <p className="text-xs text-blue-600">
                      Cada parcela será nomeada <strong>"{form.descricao || "Descrição"} 1/{numParcelas}"</strong>, <strong>"2/{numParcelas}"</strong>...
                    </p>
                  </div>
                )}
              </div>

              {/* Recorrente */}
              <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-medium cursor-pointer" htmlFor="recorrente-switch">
                      Conta Recorrente
                    </Label>
                  </div>
                  <Switch
                    id="recorrente-switch"
                    checked={recorrente}
                    onCheckedChange={v => { setRecorrente(v); if (v) setParcelado(false); }}
                  />
                </div>
                {recorrente && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <Label className="text-sm whitespace-nowrap">Repetir por</Label>
                      <Input
                        type="number"
                        min={2}
                        max={60}
                        value={mesesRecorrencia}
                        onChange={e => setMesesRecorrencia(Number(e.target.value))}
                        className="w-20"
                      />
                      <span className="text-sm text-muted-foreground">meses</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Será criada em: <span className="font-medium text-foreground">{previewMeses()}</span>
                    </p>
                    <p className="text-xs text-amber-600">
                      Os meses seguintes serão criados como <strong>Pendente</strong>. Ajuste os valores individualmente depois.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Salvando..."
                : isEdit
                  ? "Atualizar"
                  : parcelado
                    ? `Criar ${numParcelas}x`
                    : recorrente
                      ? `Criar ${mesesRecorrencia} meses`
                      : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

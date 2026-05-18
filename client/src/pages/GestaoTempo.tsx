import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAppAuth } from "@/contexts/AppAuthContext";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  ChevronLeft, ChevronRight, Plus, Check, Trash2, Play, Square,
  Pencil, Calendar, GripVertical, X, Clock, BarChart3, Pause,
  RotateCcw, CheckCircle2, Bell, ChevronDown, ChevronUp, Copy, Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable, DragEndEvent, DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const TRIADE_CONFIG = {
  IMPORTANTE: { label: "Importante", color: "bg-green-500", text: "text-green-700", border: "border-green-400", badge: "bg-green-100 text-green-800", dot: "#22c55e" },
  URGENTE: { label: "Urgente", color: "bg-red-500", text: "text-red-700", border: "border-red-400", badge: "bg-red-100 text-red-800", dot: "#ef4444" },
  CIRCUNSTANCIAL: { label: "Circunstancial", color: "bg-yellow-400", text: "text-yellow-700", border: "border-yellow-400", badge: "bg-yellow-100 text-yellow-800", dot: "#facc15" },
};

const CATEGORIAS_CONFIG: Record<string, string> = {
  COMERCIAL: "💼 Comercial", SAUDE: "🏃 Saúde", CASA_FAMILIA: "🏠 Casa/Família",
  PESSOAL: "👤 Pessoal", FINANCEIRO: "💰 Financeiro", EDUCACAO: "📚 Educação", OUTROS: "📌 Outros",
};

const DIAS_SEMANA_ABREV = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_SEMANA_FULL = ["Domingo", "Segunda-Feira", "Terça-Feira", "Quarta-Feira", "Quinta-Feira", "Sexta-Feira", "Sábado"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
// Normaliza Date ou string para "YYYY-MM-DD" sem shift de fuso.
// Strings ISO ("2026-03-16T00:00:00.000Z") já têm a data correta nos primeiros 10 chars.
// Objetos Date locais usam getFullYear/Month/Date.
function toYMD(raw: Date | string | null | undefined): string {
  if (!raw) return "";
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, "0");
    const d = String(raw.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // String: pega sempre os primeiros 10 chars ("YYYY-MM-DD") sem criar Date
  return String(raw).substring(0, 10);
}
function formatDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function formatDateBR(s: string) { const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; }
function formatTempo(seg: number) {
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function formatDuracao(min: number) {
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}` : `${String(m).padStart(2, "0")}min`;
}
function getSemana(date: Date) {
  const d = new Date(date), dia = d.getDay();
  const inicio = new Date(d); inicio.setDate(d.getDate() - dia);
  const fim = new Date(inicio); fim.setDate(inicio.getDate() + 6);
  const dias = Array.from({ length: 7 }, (_, i) => { const dd = new Date(inicio); dd.setDate(inicio.getDate() + i); return dd; });
  return { inicio, fim, dias };
}

// ─── TIPOS ────────────────────────────────────────────────────────────────────
interface TarefaForm {
  titulo: string; descricao: string;
  triade: "IMPORTANTE" | "URGENTE" | "CIRCUNSTANCIAL";
  categoria: "COMERCIAL" | "SAUDE" | "CASA_FAMILIA" | "PESSOAL" | "FINANCEIRO" | "EDUCACAO" | "OUTROS";
  duracaoMin: number; dataAgendada: string; horaAgendada: string;
  recorrente: boolean;
  recorrencia: "DIARIA" | "SEMANAL" | "MENSAL" | "";
  diasSemana: number[]; // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
}
const FORM_VAZIO: TarefaForm = { titulo: "", descricao: "", triade: "IMPORTANTE", categoria: "COMERCIAL", duracaoMin: 30, dataAgendada: "", horaAgendada: "", recorrente: false, recorrencia: "", diasSemana: [] };

// ─── COMPONENTE: ITEM ARRASTÁVEL ──────────────────────────────────────────────
function DraggableItem({ tarefa, onEdit, onDelete, onDuplicate, onConcluir, onReabrir, onEditarTempo, timerAtivo, onTimer }: {
  tarefa: { id: number; titulo: string; triade: "IMPORTANTE" | "URGENTE" | "CIRCUNSTANCIAL"; categoria: string; descricao?: string | null; status: string; duracaoMin?: number | null; tempoExecucaoSeg?: number | null; dataAgendada?: string | Date | null };
  onEdit: () => void; onDelete: () => void; onDuplicate: () => void; onConcluir: () => void; onReabrir: () => void; onEditarTempo: () => void;
  timerAtivo: { id: number; segundos: number; pausado: boolean } | null;
  onTimer: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${tarefa.id}`,
    data: { tarefaId: tarefa.id },
  });
  const style: React.CSSProperties = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.3 : 1 };
  const cfg = TRIADE_CONFIG[tarefa.triade];
  const isConcluida = tarefa.status === "CONCLUIDA";
  const isAtrasada = tarefa.status === "ATRASADA";
  const emExecucao = timerAtivo?.id === tarefa.id && !timerAtivo.pausado;
  const pausado = timerAtivo?.id === tarefa.id && timerAtivo.pausado;

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 hover:bg-gray-50 transition-colors group select-none ${isConcluida ? "opacity-60" : ""} ${isAtrasada ? "bg-red-50/60 border-l-2 border-l-red-400" : ""}`}>
      {/* Handle drag */}
      <div {...listeners} {...attributes} className="cursor-grab text-gray-300 hover:text-gray-500 flex-shrink-0">
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      {/* Botão concluir / reabrir */}
      <button
        onClick={isConcluida ? onReabrir : onConcluir}
        className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
          isConcluida ? "bg-green-500 border-green-500 hover:bg-red-400 hover:border-red-400" : "border-gray-300 hover:border-green-400"
        }`}
        title={isConcluida ? "Clique para reabrir tarefa" : "Concluir tarefa"}
      >
        {isConcluida && <Check className="w-3 h-3 text-white" />}
      </button>

      {/* Ponto de tríade */}
      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${cfg.color}`} />

      {/* Título */}
      <span className={`flex-1 text-sm min-w-0 truncate ${isConcluida ? "line-through text-gray-400" : isAtrasada ? "text-red-700 font-medium" : "text-gray-800"}`}>
        {tarefa.titulo}
        {isAtrasada && (
          <span className="ml-1.5 text-xs font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">
            Atrasada{tarefa.dataAgendada && tarefa.dataAgendada !== (tarefa as any)._dataDia ? ` · ${new Date(tarefa.dataAgendada + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : ''}
          </span>
        )}
      </span>

      {/* Duração planejada */}
      {tarefa.duracaoMin && (
        <span className="text-xs text-gray-400 flex-shrink-0 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDuracao(tarefa.duracaoMin)}
        </span>
      )}

     {/* Timer: cronômetro ativo, ou tempo percorrido se concluída, ou 00:00:00 */}
      <span className={`text-xs font-mono flex-shrink-0 w-16 text-right ${
        emExecucao ? "text-blue-600" : pausado ? "text-orange-500"
        : isConcluida && tarefa.tempoExecucaoSeg && tarefa.tempoExecucaoSeg > 0 ? "text-green-600"
        : "text-gray-300"
      }`}>
        {timerAtivo?.id === tarefa.id
          ? formatTempo(timerAtivo.segundos)
          : isConcluida && tarefa.tempoExecucaoSeg && tarefa.tempoExecucaoSeg > 0
            ? formatTempo(tarefa.tempoExecucaoSeg)
            : "00:00:00"}
      </span>
      {/* Botão editar tempo — só aparece em tarefa concluída */}
      {isConcluida && (
        <button onClick={onEditarTempo} className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600 flex-shrink-0" title="Editar tempo registrado">
          <Clock className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Ações (visíveis no hover no desktop, sempre visíveis no mobile) */}
      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        {!isConcluida && (
          <button onClick={onTimer} className={`p-1 rounded hover:bg-gray-200 ${emExecucao ? "text-blue-600" : pausado ? "text-orange-500" : "text-gray-400"}`} title={emExecucao ? "Pausar" : pausado ? "Retomar" : "Iniciar"}>
            {emExecucao ? <Pause className="w-3.5 h-3.5" /> : pausado ? <Play className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
        )}
        <button onClick={onEdit} className="p-1 rounded hover:bg-gray-200 text-gray-400" title="Editar">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDuplicate} className="p-1 rounded hover:bg-purple-100 text-gray-400 hover:text-purple-600" title="Duplicar">
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500" title="Excluir">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── COMPONENTE: TAREFA DENTRO DA COLUNA DE DIA (arrastável) ─────────────────
function DayColumnTask({ tarefa }: {
  tarefa: { id: number; titulo: string; triade: "IMPORTANTE" | "URGENTE" | "CIRCUNSTANCIAL"; status: string };
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${tarefa.id}`, data: { tarefaId: tarefa.id },
  });
  const cfg = TRIADE_CONFIG[tarefa.triade];
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.3 : 1 }}
      className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-white border border-gray-100 shadow-sm text-xs cursor-grab hover:border-blue-300 hover:shadow-md transition-all"
      title="Arraste para outro dia"
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.color}`} />
      <span className="truncate text-gray-700">{tarefa.titulo}</span>
    </div>
  );
}
// ─── COMPONENTE: COLUNA DE DIA (droppable) ────────────────────────────────────
function DroppableDayColumn({ diaStr, tarefasDoDia, onAddTask }: {
  diaStr: string;
  tarefasDoDia: Array<{ id: number; titulo: string; triade: "IMPORTANTE" | "URGENTE" | "CIRCUNSTANCIAL"; status: string; duracaoMin?: number | null }>;
  onAddTask: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${diaStr}` });
  const hoje = formatDate(new Date());
  const isHoje = diaStr === hoje;
  const dayOfWeek = new Date(diaStr + "T12:00:00").getDay();
  const dia = new Date(diaStr + "T12:00:00");
  const totalMin = tarefasDoDia.reduce((acc, t) => acc + (t.duracaoMin ?? 0), 0);
  const pendentes = tarefasDoDia.filter(t => t.status !== "CONCLUIDA");
  const concluidas = tarefasDoDia.filter(t => t.status === "CONCLUIDA");

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-h-[200px] rounded-lg border transition-all ${
        isOver ? "border-blue-400 bg-blue-50 ring-2 ring-blue-300" :
        isHoje ? "border-blue-300 bg-blue-50/30" : "border-gray-200 bg-white"
      }`}
    >
      {/* Header da coluna */}
      <div className={`px-2 py-2 border-b ${isHoje ? "border-blue-200 bg-blue-100/50" : "border-gray-100 bg-gray-50"} rounded-t-lg`}>
        <div className="text-center">
          <p className={`text-xs font-semibold uppercase tracking-wide ${isHoje ? "text-blue-700" : "text-gray-500"}`}>
            {DIAS_SEMANA_ABREV[dayOfWeek]}
          </p>
          <p className={`text-lg font-bold leading-tight ${isHoje ? "text-blue-700" : "text-gray-800"}`}>
            {dia.getDate().toString().padStart(2, "0")}/{(dia.getMonth() + 1).toString().padStart(2, "0")}
          </p>
          {totalMin > 0 && (
            <p className="text-xs text-gray-400 flex items-center justify-center gap-0.5 mt-0.5">
              <Clock className="w-2.5 h-2.5" />{formatDuracao(totalMin)}
            </p>
          )}
        </div>
      </div>

      {/* Tarefas */}
      <div className="flex-1 p-1.5 space-y-1 overflow-y-auto max-h-[300px]">
        {isOver && (
          <div className="border-2 border-dashed border-blue-400 rounded-md p-2 text-center text-xs text-blue-500 font-medium bg-blue-50">
            Soltar aqui
          </div>
        )}
        {pendentes.map((t) => (
          <DayColumnTask key={t.id} tarefa={t} />
        ))}
        {concluidas.length > 0 && (
          <div className="text-xs text-gray-400 text-center pt-1">
            ✅ {concluidas.length} concluída{concluidas.length > 1 ? "s" : ""}
          </div>
        )}
        {tarefasDoDia.length === 0 && !isOver && (
          <div className="text-center py-4 text-xs text-gray-300">Vazio</div>
        )}
      </div>

      {/* Botão adicionar */}
      <button
        onClick={onAddTask}
        className="w-full text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 py-1.5 rounded-b-lg border-t border-gray-100 transition-colors"
      >
        + add
      </button>
    </div>
  );
}

// ─── COMPONENTE: ITEM DO BACKLOG (arrastável) ───────────────────────────────
function BacklogItem({ tarefa, onEdit, onDelete, onDuplicate }: {
  tarefa: { id: number; titulo: string; triade: string; duracaoMin?: number | null; dataAgendada?: string | Date | null };
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${tarefa.id}`, data: { tarefaId: tarefa.id },
  });
  const cfg = TRIADE_CONFIG[tarefa.triade as "IMPORTANTE" | "URGENTE" | "CIRCUNSTANCIAL"];
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.3 : 1 }}
      className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 group cursor-grab"
    >
      <div {...listeners} {...attributes} className="text-gray-300 flex-shrink-0">
        <GripVertical className="w-3.5 h-3.5" />
      </div>
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">{tarefa.titulo}</p>
        {tarefa.duracaoMin && (
          <p className="text-[10px] text-gray-400 flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />{formatDuracao(tarefa.duracaoMin)}
          </p>
        )}
      </div>
      <div className="flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
        <button onClick={onEdit} className="p-0.5 hover:text-blue-600 text-gray-400" title="Editar"><Pencil className="w-3 h-3" /></button>
        <button onClick={onDuplicate} className="p-0.5 hover:text-purple-600 text-gray-400" title="Duplicar"><Copy className="w-3 h-3" /></button>
        <button onClick={onDelete} className="p-0.5 hover:text-red-500 text-gray-400" title="Excluir"><X className="w-3 h-3" /></button>
      </div>
    </div>
  );
}

// ─── COMPONENTE: ITEM AGENDADO PENDENTE (arrastável) ─────────────────────────
function PendenteItem({ tarefa, onEdit, onDelete, onDuplicate }: {
  tarefa: { id: number; titulo: string; triade: "IMPORTANTE" | "URGENTE" | "CIRCUNSTANCIAL"; duracaoMin?: number | null; dataAgendada?: string | Date | null };
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `task-${tarefa.id}`, data: { tarefaId: tarefa.id },
  });
  const cfg = TRIADE_CONFIG[tarefa.triade];
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.3 : 1 }}
      className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 group cursor-grab"
    >
      <div {...listeners} {...attributes} className="text-gray-300 flex-shrink-0">
        <GripVertical className="w-3.5 h-3.5" />
      </div>
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">{tarefa.titulo}</p>
        <p className="text-[10px] text-gray-400">
          {tarefa.dataAgendada ? formatDateBR(toYMD(tarefa.dataAgendada)) : ""}
          {tarefa.duracaoMin ? ` · ${formatDuracao(tarefa.duracaoMin)}` : ""}
        </p>
      </div>
      <div className="flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
        <button onClick={onEdit} className="p-0.5 hover:text-blue-600 text-gray-400" title="Editar"><Pencil className="w-3 h-3" /></button>
        <button onClick={onDuplicate} className="p-0.5 hover:text-purple-600 text-gray-400" title="Duplicar"><Copy className="w-3 h-3" /></button>
        <button onClick={onDelete} className="p-0.5 hover:text-red-500 text-gray-400" title="Excluir"><X className="w-3 h-3" /></button>
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function GestaoTempo() {
  const { appUser } = useAppAuth();
  const utils = trpc.useUtils();
  const appUserId = appUser?.id ?? 1;

  const [dataSelecionada, setDataSelecionada] = useState(() => formatDate(new Date()));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<"dia" | "planejamento" | "relatorio">("dia");
  const [modalAberto, setModalAberto] = useState(false);
  const [tarefaEditando, setTarefaEditando] = useState<number | null>(null);
  const [form, setForm] = useState<TarefaForm>(FORM_VAZIO);
  const [criacaoRapida, setCriacaoRapida] = useState("");
  // ─── LEMBRETES ───────────────────────────────────────────────────────────────
  const [novoLembrete, setNovoLembrete] = useState("");
  const [lembretHora, setLembretHora] = useState("");
  const [lembretIcone, setLembretIcone] = useState("📌");
  const [lembreteExpandido, setLembreteExpandido] = useState(true);
  const [lembretData, setLembretData] = useState(""); // data do lembrete a criar (vazio = usa dataSelecionada)
  // Modal de edição de lembrete
  const [editLembreteId, setEditLembreteId] = useState<number | null>(null);
  const [editLembretTexto, setEditLembretTexto] = useState("");
  const [editLembretData, setEditLembretData] = useState("");
  const [editLembretHora, setEditLembretHora] = useState("");
  const [editLembretIcone, setEditLembretIcone] = useState("📌");
  // ─── PAINÉIS POR CATEGORIA ───────────────────────────────────────────────────
  const [categoriasColapsadas, setCategoriasColapsadas] = useState<Set<string>>(new Set());
  // ─── TIMER ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // timerDataRef: fonte da verdade. Nunca perde valor ao trocar de aba ou por closure stale.
  // startedAt = timestamp ms quando rodando, null quando pausado.
  // segundosAcumulados = total de segundos ANTES do último início/retomada.
  const timerDataRef = useRef<{
    id: number; startedAt: number | null;
    segundosAcumulados: number; pausado: boolean;
    duracaoMin?: number | null;
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notificacaoMetaRef = useRef<Set<number>>(new Set());

  // Calcula segundos reais AGORA a partir da ref (nunca do estado React)
  function calcularSegundosReais(): number {
    const d = timerDataRef.current;
    if (!d) return 0;
    if (!d.pausado && d.startedAt) {
      return d.segundosAcumulados + Math.floor((Date.now() - d.startedAt) / 1000);
    }
    return d.segundosAcumulados;
  }

  // Inicia o setInterval que só atualiza o display (estado React)
  function iniciarInterval(duracaoMin?: number | null) {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const novosSeg = calcularSegundosReais();
      setTimerAtivo(prev => {
        if (!prev || prev.pausado) return prev;
        const duracaoSeg = duracaoMin ? duracaoMin * 60 : null;
        if (duracaoSeg && novosSeg >= duracaoSeg && !notificacaoMetaRef.current.has(prev.id)) {
          notificacaoMetaRef.current.add(prev.id);
          toast.success(`⏰ Meta atingida! Você completou o tempo planejado para esta tarefa.`, { duration: 6000 });
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('⏰ Meta de tempo atingida!', { body: 'Você completou o tempo planejado para a tarefa.', icon: '/favicon.ico' });
          }
        }
        return { ...prev, segundos: novosSeg };
      });
    }, 1000);
  }

  // Estado visual do timer (só para re-renderizar)
  const [timerAtivo, setTimerAtivo] = useState<{ id: number; segundos: number; pausado: boolean; duracaoMin?: number | null } | null>(() => {
    try {
      const saved = localStorage.getItem('timer-ativo');
      if (!saved) return null;
      const data = JSON.parse(saved);
      if (!data || typeof data.id !== 'number') return null;
      const segundosAcumulados = typeof data.segundosAcumulados === 'number' ? data.segundosAcumulados : 0;
      if (!data.pausado && data.startedAt && typeof data.startedAt === 'number') {
        const decorrido = Math.floor((Date.now() - data.startedAt) / 1000);
        timerDataRef.current = { id: data.id, startedAt: data.startedAt, segundosAcumulados, pausado: false, duracaoMin: data.duracaoMin ?? null };
        return { id: data.id, segundos: segundosAcumulados + decorrido, pausado: false, duracaoMin: data.duracaoMin ?? null };
      }
      timerDataRef.current = { id: data.id, startedAt: null, segundosAcumulados, pausado: true, duracaoMin: data.duracaoMin ?? null };
      return { id: data.id, segundos: segundosAcumulados, pausado: true, duracaoMin: data.duracaoMin ?? null };
    } catch { return null; }
  });

 // Retomar interval ao montar se havia timer rodando (restaurado do localStorage)
  useEffect(() => {
    if (timerDataRef.current && !timerDataRef.current.pausado) {
      iniciarInterval(timerDataRef.current.duracaoMin);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
 const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [tarefaDetalhe, setTarefaDetalhe] = useState<number | null>(null);
  // ─── BUSCA GLOBAL ─────────────────────────────────────────────────────────
  const [buscaTermo, setBuscaTermo] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(buscaTermo.trim()), 400);
    return () => clearTimeout(t);
  }, [buscaTermo]);
  const { data: resultadosBusca = [], isFetching: buscaCarregando } = trpc.gestaoTempo.buscar.useQuery(
    { appUserId, termo: buscaDebounced },
    { enabled: appUserId > 0 && buscaDebounced.length >= 2 }
  );
  // Modal de edição de tempo de tarefa concluída
  const [editTempoTarefa, setEditTempoTarefa] = useState<{ id: number; titulo: string; dataOcorrencia?: string | null } | null>(null);
  const [editTempoHoras, setEditTempoHoras] = useState("0");
  const [editTempoMinutos, setEditTempoMinutos] = useState("0");

  const semana = getSemana(new Date(dataSelecionada + "T12:00:00"));
  const hoje = new Date();
  const trintaDiasAtras = new Date(hoje); trintaDiasAtras.setDate(hoje.getDate() - 30);

  // Queries
  const { data: tarefasDia = [] } = trpc.gestaoTempo.listarDia.useQuery(
    { appUserId, data: dataSelecionada }, { enabled: appUserId > 0 }
  );
  const { data: tarefasSemana = [] } = trpc.gestaoTempo.listarSemana.useQuery(
    { appUserId, dataInicio: formatDate(semana.inicio), dataFim: formatDate(semana.fim) }, { enabled: appUserId > 0 }
  );
  const { data: backlog = [] } = trpc.gestaoTempo.listarBacklog.useQuery(
    { appUserId }, { enabled: appUserId > 0 }
  );
  const { data: score } = trpc.gestaoTempo.score.useQuery(
    { appUserId, dataInicio: formatDate(trintaDiasAtras), dataFim: formatDate(hoje) }, { enabled: appUserId > 0 }
  );
  // ─── ANTI-TIMER-FANTASMA ────────────────────────────────────────────────
  // Confere no banco se a tarefa do timer ativo ainda está pendente.
  // Se foi concluída em outro computador, limpa o cronômetro automaticamente.
  useEffect(() => {
    if (!timerAtivo) return;
    const tarefaNoBanco = [...tarefasDia, ...tarefasSemana, ...backlog].find(t => t.id === timerAtivo.id);
    if (tarefaNoBanco && (tarefaNoBanco.status === "CONCLUIDA" || tarefaNoBanco.status === "CANCELADA")) {
      // A tarefa já foi finalizada em outro lugar — matar o timer fantasma
      localStorage.removeItem('timer-ativo');
      timerDataRef.current = null;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setTimerAtivo(null);
      toast.info("O cronômetro foi parado: esta tarefa já foi concluída em outro dispositivo.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefasDia, tarefasSemana, backlog]);
  // ─── Relatório por período ───────────────────────────────────────────────────
  // Tipo de período pré-definido. "personalizado" usa as datas customizadas.
  type PeriodoTipo = "hoje" | "ontem" | "semana" | "mes" | "mes-passado" | "30dias" | "personalizado";
  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>("hoje");
  const [periodoCustomInicio, setPeriodoCustomInicio] = useState<string>(formatDate(hoje));
  const [periodoCustomFim, setPeriodoCustomFim] = useState<string>(formatDate(hoje));

  // Calcula datas baseado no tipo selecionado
  const periodoCalc = (() => {
    const h = new Date();
    const ano = h.getFullYear();
    const mes = h.getMonth();
    switch (periodoTipo) {
      case "hoje":
        return { inicio: formatDate(h), fim: formatDate(h) };
      case "ontem": {
        const o = new Date(h); o.setDate(h.getDate() - 1);
        return { inicio: formatDate(o), fim: formatDate(o) };
      }
      case "semana": {
        // Segunda atual (ou domingo dependendo da preferência) até hoje
        const dia = h.getDay(); // 0=dom, 1=seg
        const diff = dia === 0 ? 6 : dia - 1; // dias desde segunda
        const inicio = new Date(h); inicio.setDate(h.getDate() - diff);
        return { inicio: formatDate(inicio), fim: formatDate(h) };
      }
      case "mes": {
        const inicio = new Date(ano, mes, 1);
        return { inicio: formatDate(inicio), fim: formatDate(h) };
      }
      case "mes-passado": {
        const inicio = new Date(ano, mes - 1, 1);
        const fim = new Date(ano, mes, 0); // último dia do mês passado
        return { inicio: formatDate(inicio), fim: formatDate(fim) };
      }
      case "30dias": {
        const inicio = new Date(h); inicio.setDate(h.getDate() - 29);
        return { inicio: formatDate(inicio), fim: formatDate(h) };
      }
      case "personalizado":
        return { inicio: periodoCustomInicio, fim: periodoCustomFim };
    }
  })();

  const { data: relatorioPeriodo } = trpc.gestaoTempo.relatorioPorPeriodo.useQuery(
    { appUserId, dataInicio: periodoCalc.inicio, dataFim: periodoCalc.fim },
    { enabled: appUserId > 0 && abaAtiva === "relatorio" }
  );

  // Mutations
  const criarMut = trpc.gestaoTempo.criar.useMutation({
    onSuccess: () => { utils.gestaoTempo.listarDia.invalidate(); utils.gestaoTempo.listarSemana.invalidate(); utils.gestaoTempo.listarBacklog.invalidate(); toast.success("Tarefa criada!"); },
  });
  const atualizarMut = trpc.gestaoTempo.atualizar.useMutation({
    onSuccess: () => { utils.gestaoTempo.listarDia.invalidate(); utils.gestaoTempo.listarSemana.invalidate(); utils.gestaoTempo.listarBacklog.invalidate(); },
  });
  const concluirMut = trpc.gestaoTempo.concluir.useMutation({
    onSuccess: () => { utils.gestaoTempo.listarDia.invalidate(); utils.gestaoTempo.listarSemana.invalidate(); utils.gestaoTempo.score.invalidate(); toast.success("✅ Tarefa concluída!"); },
  });
  const excluirMut = trpc.gestaoTempo.excluir.useMutation({
    onSuccess: () => { utils.gestaoTempo.listarDia.invalidate(); utils.gestaoTempo.listarSemana.invalidate(); utils.gestaoTempo.listarBacklog.invalidate(); toast.success("Tarefa excluída."); },
  });
  // ── DUPLICAR TAREFA ──────────────────────────────────────────────────────────
  // Abrimos o MESMO modal de edição com os dados pré-preenchidos. O usuário pode
  // ajustar título, descrição, data, hora, duração, tríade, categoria, etc.
  // Ao clicar em "Salvar Cópia", chamamos a mutation de criar (não atualizar).
  const [modoDuplicacao, setModoDuplicacao] = useState(false);
  const duplicarMut = trpc.gestaoTempo.duplicar.useMutation({
    onSuccess: () => {
      utils.gestaoTempo.listarDia.invalidate();
      utils.gestaoTempo.listarSemana.invalidate();
      utils.gestaoTempo.listarBacklog.invalidate();
      toast.success("Tarefa duplicada!");
    },
    onError: (e) => toast.error(e.message || "Erro ao duplicar"),
  });

  // ─── QUERIES E MUTATIONS DE LEMBRETES ───────────────────────────────────────────────────────────────
  const { data: lembretesDia = [] } = trpc.lembretes.listar.useQuery(
    { appUserId, data: dataSelecionada }, { enabled: appUserId > 0 }
  );
  const criarLembreteMut = trpc.lembretes.criar.useMutation({
    onSuccess: () => { utils.lembretes.listar.invalidate(); setNovoLembrete(""); setLembretHora(""); toast.success("📌 Lembrete adicionado!"); },
  });
  const toggleLembreteMut = trpc.lembretes.toggle.useMutation({
    onSuccess: () => utils.lembretes.listar.invalidate(),
  });
  const excluirLembreteMut = trpc.lembretes.excluir.useMutation({
    onSuccess: () => { utils.lembretes.listar.invalidate(); toast.success("Lembrete removido."); },
  });

  const atualizarLembreteMut = trpc.lembretes.atualizar.useMutation({
    onSuccess: () => { utils.lembretes.listar.invalidate(); setEditLembreteId(null); toast.success("📌 Lembrete atualizado!"); },
  });

  function adicionarLembrete(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || !novoLembrete.trim()) return;
    const dataParaUsar = lembretData || dataSelecionada;
    criarLembreteMut.mutate({ appUserId, texto: novoLembrete.trim(), data: dataParaUsar, hora: lembretHora || null, icone: lembretIcone });
  }

  function abrirEditarLembrete(lem: typeof lembretesDia[0]) {
    setEditLembreteId(lem.id);
    setEditLembretTexto(lem.texto);
    setEditLembretData(lem.data ? String(lem.data).substring(0, 10) : dataSelecionada);
    setEditLembretHora(lem.hora ?? "");
    setEditLembretIcone(lem.icone ?? "📌");
  }

  function salvarEdicaoLembrete() {
    if (!editLembreteId || !editLembretTexto.trim()) return;
    atualizarLembreteMut.mutate({ id: editLembreteId, appUserId, texto: editLembretTexto.trim(), data: editLembretData || dataSelecionada, hora: editLembretHora || null, icone: editLembretIcone });
  }

  // Cleanup do interval ao desmontar o componente
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // DnD
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragStart(e: DragStartEvent) { setActiveDragId(String(e.active.id)); }
  function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    if (!overId.startsWith("day-")) return;
    const targetDate = overId.replace("day-", "");
    const activeId = String(active.id);
    if (activeId.startsWith("task-")) {
      const tarefaId = parseInt(activeId.replace("task-", ""), 10);
      if (!isNaN(tarefaId)) {
        atualizarMut.mutate({ id: tarefaId, appUserId, dataAgendada: targetDate }, {
          onSuccess: () => { utils.gestaoTempo.listarBacklog.invalidate(); utils.gestaoTempo.listarSemana.invalidate(); utils.gestaoTempo.listarDia.invalidate(); toast.success(`Agendada para ${formatDateBR(targetDate)}!`); },
        });
      }
    }
  }

  function abrirModal(data?: string) {
    setTarefaEditando(null);
    setForm({ ...FORM_VAZIO, dataAgendada: data ?? "" });
    setModalAberto(true);
  }

  function abrirEdicao(tarefa: typeof tarefasDia[0]) {
    setTarefaEditando(tarefa.id);
    setModoDuplicacao(false);
    const diasSemanaRaw = (tarefa as any).diasSemana;
    const diasSemana = diasSemanaRaw ? String(diasSemanaRaw).split(",").map(Number).filter(n => !isNaN(n)) : [];
    setForm({
      titulo: tarefa.titulo, descricao: tarefa.descricao ?? "", triade: tarefa.triade, categoria: tarefa.categoria,
      duracaoMin: tarefa.duracaoMin ?? 30,
      dataAgendada: tarefa.dataAgendada ? String(tarefa.dataAgendada).substring(0, 10) : "",
      horaAgendada: tarefa.horaAgendada ?? "",
      recorrente: (tarefa as any).recorrente ?? false,
      recorrencia: (tarefa as any).recorrencia ?? "",
      diasSemana,
    });
    setModalAberto(true);
  }

  // Abre o MESMO modal pré-preenchido com os dados da tarefa, em modo duplicação.
  // Ao salvar, o backend cria uma nova tarefa (não altera a original).
  function abrirDuplicacao(tarefa: typeof tarefasDia[0]) {
    setTarefaEditando(null);     // não está editando uma existente
    setModoDuplicacao(true);     // mas também não é "Nova Tarefa" pura
    const diasSemanaRaw = (tarefa as any).diasSemana;
    const diasSemana = diasSemanaRaw ? String(diasSemanaRaw).split(",").map(Number).filter(n => !isNaN(n)) : [];
    setForm({
      titulo: tarefa.titulo,
      descricao: tarefa.descricao ?? "",
      triade: tarefa.triade,
      categoria: tarefa.categoria,
      duracaoMin: tarefa.duracaoMin ?? 30,
      dataAgendada: tarefa.dataAgendada ? String(tarefa.dataAgendada).substring(0, 10) : "",
      horaAgendada: tarefa.horaAgendada ?? "",
      recorrente: (tarefa as any).recorrente ?? false,
      recorrencia: (tarefa as any).recorrencia ?? "",
      diasSemana,
    });
    setModalAberto(true);
  }

  function salvarTarefa() {
    if (!form.titulo.trim()) { toast.error("Título obrigatório"); return; }
    const diasSemanaStr = (form.recorrente && form.recorrencia === "SEMANAL" && form.diasSemana.length > 0)
      ? form.diasSemana.sort((a, b) => a - b).join(",")
      : undefined;
    const { diasSemana: _diasSemana, ...formSemDias } = form;
// CORREÇÃO: se a data foi apagada, envia "" (vazio) em vez de undefined,
    // pra o backend saber que tem que ZERAR a data (mover pro backlog).
    // undefined = "não mexer na data". "" = "limpar a data".
    const payload = { ...formSemDias, duracaoMin: Number(form.duracaoMin), dataAgendada: form.dataAgendada ?? "", horaAgendada: form.horaAgendada || undefined, recorrencia: (form.recorrente && form.recorrencia) ? (form.recorrencia as "DIARIA" | "SEMANAL" | "MENSAL") : undefined, diasSemana: diasSemanaStr };    if (modoDuplicacao) {
      // Cria uma nova tarefa com os dados ajustados (não altera a original)
      criarMut.mutate({ appUserId, ...payload }, { onSuccess: () => toast.success("Cópia criada!") });
    } else if (tarefaEditando) {
      atualizarMut.mutate({ id: tarefaEditando, appUserId, ...payload }, { onSuccess: () => toast.success("Tarefa atualizada!") });
    } else {
      criarMut.mutate({ appUserId, ...payload });
    }
    setModalAberto(false); setForm(FORM_VAZIO); setModoDuplicacao(false);
  }

  function criarRapido(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || !criacaoRapida.trim()) return;
    criarMut.mutate({ appUserId, titulo: criacaoRapida.trim(), triade: "IMPORTANTE", categoria: "COMERCIAL", duracaoMin: 30, dataAgendada: dataSelecionada });
    setCriacaoRapida("");
  }

  function handleTimer(id: number) {
    if (timerAtivo?.id === id) {
      if (timerAtivo.pausado) {
        // ─ RETOMAR: registrar novo startedAt com segundos acumulados até agora
        const segundosAcumulados = timerDataRef.current?.segundosAcumulados ?? timerAtivo.segundos;
        const startedAt = Date.now();
        timerDataRef.current = { id, startedAt, segundosAcumulados, pausado: false, duracaoMin: timerAtivo.duracaoMin };
        localStorage.setItem('timer-ativo', JSON.stringify(timerDataRef.current));
        iniciarInterval(timerAtivo.duracaoMin);
        setTimerAtivo({ ...timerAtivo, pausado: false });
        atualizarMut.mutate({ id, appUserId, status: 'EM_EXECUCAO' });
      } else {
        // ─ PAUSAR: salvar segundos acumulados reais e parar o interval
        const segundosAcumulados = calcularSegundosReais();
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        timerDataRef.current = { id, startedAt: null, segundosAcumulados, pausado: true, duracaoMin: timerAtivo.duracaoMin };
        localStorage.setItem('timer-ativo', JSON.stringify(timerDataRef.current));
        setTimerAtivo({ ...timerAtivo, segundos: segundosAcumulados, pausado: true });
        atualizarMut.mutate({ id, appUserId, status: 'PENDENTE' });
      }
    } else {
      // ─ NOVO TIMER: salvar o anterior e iniciar novo
      if (timerAtivo) {
        atualizarMut.mutate({ id: timerAtivo.id, appUserId, status: 'PENDENTE', tempoExecucaoSeg: calcularSegundosReais() });
      }
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      const tarefaAtual = tarefasDia.find(t => t.id === id);
      const duracaoMin = tarefaAtual?.duracaoMin ?? null;
      notificacaoMetaRef.current.delete(id);
      const startedAt = Date.now();
      timerDataRef.current = { id, startedAt, segundosAcumulados: 0, pausado: false, duracaoMin };
      localStorage.setItem('timer-ativo', JSON.stringify(timerDataRef.current));
      iniciarInterval(duracaoMin);
      setTimerAtivo({ id, segundos: 0, pausado: false, duracaoMin });
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      atualizarMut.mutate({ id, appUserId, status: 'EM_EXECUCAO' });
    }
  }

  function concluirComTimer(id: number, dataOcorrencia?: string | null) {
    let seg: number | undefined = undefined;

    // FONTE DA VERDADE: timerDataRef (ref síncrona) — nunca o estado React (assíncrono)
    if (timerDataRef.current?.id === id) {
      const d = timerDataRef.current;
      if (!d.pausado && d.startedAt) {
        // Timer rodando: calcular tempo real agora
        seg = d.segundosAcumulados + Math.floor((Date.now() - d.startedAt) / 1000);
      } else {
        // Timer pausado: usar segundos acumulados salvos na pausa
        seg = d.segundosAcumulados;
      }
      // Limpar tudo
      localStorage.removeItem('timer-ativo');
      timerDataRef.current = null;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setTimerAtivo(null);
    } else if (timerAtivo?.id === id) {
      // timerDataRef perdido mas timerAtivo existe — usar valor do display
      seg = timerAtivo.segundos;
      localStorage.removeItem('timer-ativo');
      timerDataRef.current = null;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setTimerAtivo(null);
    } else {
      // Timer não está ativo — verificar localStorage (timer pausado de sessão anterior)
      try {
        const saved = localStorage.getItem('timer-ativo');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.id === id) {
            if (!parsed.pausado && parsed.startedAt) {
              seg = (parsed.segundosAcumulados ?? 0) + Math.floor((Date.now() - parsed.startedAt) / 1000);
            } else {
              seg = parsed.segundosAcumulados;
            }
            localStorage.removeItem('timer-ativo');
            timerDataRef.current = null;
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
            setTimerAtivo(null);
          }
        }
      } catch (_) {}
    }
    // CORREÇÃO: sempre enviar o tempo percorrido, mesmo se for 0
    // Se seg não foi definido (timer nunca foi iniciado), enviar 0 em vez de undefined
    const tempoFinal = seg !== undefined ? seg : 0;
    console.log(`[CONCLUIR] id=${id}, tempoPercorrido=${tempoFinal}s, dataOcorrencia=${dataOcorrencia}`);
    concluirMut.mutate({ id, appUserId, tempoExecucaoSeg: tempoFinal > 0 ? tempoFinal : undefined, dataOcorrencia: dataOcorrencia ?? undefined });
  }

      // Abre o modal de edição de tempo, pré-preenchido com o tempo atual da tarefa
  function abrirEdicaoTempo(tarefa: { id: number; titulo: string; tempoExecucaoSeg?: number | null; _dataOcorrencia?: string | null }) {
    const seg = tarefa.tempoExecucaoSeg ?? 0;
    setEditTempoHoras(String(Math.floor(seg / 3600)));
    setEditTempoMinutos(String(Math.floor((seg % 3600) / 60)));
    setEditTempoTarefa({ id: tarefa.id, titulo: tarefa.titulo, dataOcorrencia: tarefa._dataOcorrencia ?? null });
  }
  // Salva o novo tempo (converte horas+minutos para segundos e grava via concluir)
  function salvarEdicaoTempo() {
    if (!editTempoTarefa) return;
    const horas = parseInt(editTempoHoras) || 0;
    const minutos = parseInt(editTempoMinutos) || 0;
    const totalSeg = horas * 3600 + minutos * 60;
    concluirMut.mutate(
      { id: editTempoTarefa.id, appUserId, tempoExecucaoSeg: totalSeg > 0 ? totalSeg : undefined, dataOcorrencia: editTempoTarefa.dataOcorrencia ?? undefined },
      { onSuccess: () => { toast.success("Tempo atualizado!"); setEditTempoTarefa(null); } }
    );
  }
  function reabrirTarefa(id: number) {
    console.log('[REABRIR] id:', id, 'appUserId:', appUserId);
    atualizarMut.mutate({ id, appUserId, status: "PENDENTE" }, {
      onSuccess: () => { console.log('[REABRIR] sucesso'); toast.success("Tarefa reaberta."); },
      onError: (err) => { console.error('[REABRIR] erro:', err); toast.error('Erro ao reabrir: ' + err.message); }
    });
  }

  // Métricas do dia
  const pendentes = tarefasDia.filter(t => t.status !== "CONCLUIDA" && t.status !== "CANCELADA");
  const concluidas = tarefasDia.filter(t => t.status === "CONCLUIDA");
  const totalMin = tarefasDia.reduce((a, t) => a + (t.duracaoMin ?? 0), 0);
  // CORREÇÃO: usar tempoExecucaoSeg (horas exercidas) ao invés de duracaoMin (horas cadastradas)
  const execMin = concluidas.reduce((a, t) => a + Math.round((t.tempoExecucaoSeg ?? 0) / 60), 0);
  const restMin = pendentes.reduce((a, t) => a + (t.duracaoMin ?? 0), 0);
  const progresso = totalMin > 0 ? Math.round((execMin / totalMin) * 100) : 0;

  // Tarefa em detalhe
  const tarefaDetalheObj = tarefaDetalhe ? [...tarefasDia, ...backlog].find(t => t.id === tarefaDetalhe) : null;

  // Tarefa arrastada
  const activeTarefa = activeDragId?.startsWith("task-")
    ? [...tarefasDia, ...backlog].find(t => t.id === parseInt(activeDragId.replace("task-", ""), 10))
    : null;

  const diaSemanaHoje = new Date(dataSelecionada + "T12:00:00").getDay();

  return (
    <AppLayout>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-col h-full">

          {/* ─── CABEÇALHO ─────────────────────────────────────────────────── */}
          <div className="px-6 pt-5 pb-0 bg-white border-b border-gray-200">
            {/* Navegação de data */}
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => { const d = new Date(dataSelecionada + "T12:00:00"); d.setDate(d.getDate() - 1); setDataSelecionada(formatDate(d)); }}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <button className="text-left hover:bg-gray-100 rounded-lg px-2 py-1 transition-colors group">
                    <h1 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 flex items-center gap-1.5">
                      {new Date(dataSelecionada + "T12:00:00").getDate().toString().padStart(2, "0")} {MESES[new Date(dataSelecionada + "T12:00:00").getMonth()]}, {new Date(dataSelecionada + "T12:00:00").getFullYear()}
                      <Calendar className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                    </h1>
                    <p className="text-sm text-gray-500">{DIAS_SEMANA_FULL[diaSemanaHoje]}</p>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={new Date(dataSelecionada + "T12:00:00")}
                    onSelect={(date) => {
                      if (date) {
                        setDataSelecionada(formatDate(date));
                        setCalendarOpen(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <button onClick={() => { const d = new Date(dataSelecionada + "T12:00:00"); d.setDate(d.getDate() + 1); setDataSelecionada(formatDate(d)); }}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
                <ChevronRight className="w-4 h-4" />
              </button>
              {dataSelecionada !== formatDate(new Date()) && (
                <button onClick={() => setDataSelecionada(formatDate(new Date()))}
                  className="text-xs text-blue-600 hover:underline ml-1">Hoje</button>
              )}
            </div>

            {/* Abas */}
            <div className="flex items-center gap-6">
              {(["dia", "planejamento", "relatorio"] as const).map((aba) => (
                <button key={aba} onClick={() => setAbaAtiva(aba)}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${abaAtiva === aba ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                  {aba === "dia" ? "Meu Dia" : aba === "planejamento" ? "Planejamento" : "Relatório"}
                </button>
              ))}
              {/* Campo de busca global */}
              <div className="ml-auto mb-2 relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={buscaTermo}
                  onChange={e => setBuscaTermo(e.target.value)}
                  placeholder="Buscar tarefas..."
                  className="pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-md w-56 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 bg-white"
                />
                {buscaTermo && (
                  <button
                    onClick={() => setBuscaTermo("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                    title="Limpar busca"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
          {/* ─── PAINEL DE RESULTADOS DA BUSCA ──────────────────────────────── */}
          {buscaDebounced.length >= 2 && (
            <div className="bg-white border-b border-gray-200 px-6 py-4 max-h-96 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-blue-500" />
                  Resultados para "{buscaDebounced}"
                  {buscaCarregando ? (
                    <span className="text-xs text-gray-400">buscando...</span>
                  ) : (
                    <span className="text-xs text-gray-500">— {resultadosBusca.length} encontradas</span>
                  )}
                </h3>
                <button onClick={() => setBuscaTermo("")} className="text-xs text-blue-600 hover:underline">Fechar</button>
              </div>
              {resultadosBusca.length === 0 && !buscaCarregando ? (
                <p className="text-sm text-gray-400 text-center py-6">Nenhuma tarefa encontrada.</p>
              ) : (
                <div className="space-y-1">
                  {resultadosBusca.map((t: any) => {
                    const cfg = TRIADE_CONFIG[t.triade as "IMPORTANTE" | "URGENTE" | "CIRCUNSTANCIAL"];
                    const cat = CATEGORIAS_CONFIG[t.categoria] ?? t.categoria;
                    const dataStr = t.dataAgendada ? formatDateBR(t.dataAgendada) : "Sem data";
                    const tempo = t.tempoExecucaoSeg && t.tempoExecucaoSeg > 0 ? formatTempo(t.tempoExecucaoSeg) : null;
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          // Se tem data, navega pro dia e abre edição
                          if (t.dataAgendada) {
                            setDataSelecionada(t.dataAgendada);
                            setAbaAtiva("dia");
                          } else {
                            setAbaAtiva("planejamento");
                          }
                          // Abre o modal de edição direto
                          setTimeout(() => abrirEdicao(t as any), 100);
                          setBuscaTermo("");
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-all text-left"
                      >
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg?.color ?? "bg-gray-400"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{t.titulo}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {cat} · {dataStr}
                            {t.status === "CONCLUIDA" && <span className="text-green-600 ml-1">✓ Concluída</span>}
                            {t.status === "CANCELADA" && <span className="text-gray-400 ml-1">Cancelada</span>}
                            {tempo && <span className="ml-1 text-blue-600 font-mono">· {tempo}</span>}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0">›</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── ABA MEU DIA ───────────────────────────────────────────────── */}
          {abaAtiva === "dia" && (
            <div className="flex-1 overflow-y-auto">
              {/* Barra de progresso */}
              <div className="px-6 py-3 bg-white border-b border-gray-100">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5 text-sm text-gray-600">
                    <span className="font-semibold text-gray-800">{tarefasDia.length} atividades</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatDuracao(totalMin)} plan.</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="w-3.5 h-3.5 text-green-500" />
                    <span>{formatDuracao(execMin)} exec.</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="w-3.5 h-3.5 text-orange-400" />
                    <span>{formatDuracao(restMin)} rest.</span>
                  </div>
                  {/* Tríade dots */}
                  <div className="flex items-center gap-1.5 ml-auto">
                    {(["IMPORTANTE", "URGENTE", "CIRCUNSTANCIAL"] as const).map(t => {
                      const qtd = tarefasDia.filter(x => x.triade === t).length;
                      const cfg = TRIADE_CONFIG[t];
                      return qtd > 0 ? (
                        <span key={t} className={`w-5 h-5 rounded-full ${cfg.color} flex items-center justify-center text-white text-[10px] font-bold`} title={cfg.label}>{qtd}</span>
                      ) : null;
                    })}
                  </div>
                  {/* Progresso */}
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progresso}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-600">{progresso}%</span>
                  </div>
                </div>
              </div>

              {/* Score 30 dias */}
              {score && score.total > 0 && (
                <div className="mx-6 mt-3 p-3 rounded-lg bg-slate-800 text-white flex items-center gap-4">
                  <BarChart3 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span className="text-xs font-medium">Score 30 dias ({score.total} concluídas)</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden bg-slate-700 flex">
                    <div className="bg-green-500 h-full" style={{ width: `${score.pctImportante}%` }} />
                    <div className="bg-red-500 h-full" style={{ width: `${score.pctUrgente}%` }} />
                    <div className="bg-yellow-400 h-full" style={{ width: `${score.pctCircunstancial}%` }} />
                  </div>
                  <span className="text-xs text-green-400">{score.pctImportante}% Imp.</span>
                  <span className="text-xs text-red-400">{score.pctUrgente}% Urg.</span>
                  <span className="text-xs text-yellow-400">{score.pctCircunstancial}% Circ.</span>
                </div>
              )}

              {/* ─── PAINÉIS POR CATEGORIA ─────────────────────────────────────────────────────────────── */}
              <div className="mx-6 mt-3 space-y-3">
                {/* Criação rápida global */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-2 flex items-center gap-2">
                  <span className="text-blue-500 text-sm">⚡</span>
                  <input
                    type="text"
                    value={criacaoRapida}
                    onChange={e => setCriacaoRapida(e.target.value)}
                    onKeyDown={criarRapido}
                    placeholder={`Criar nova tarefa rápida (Enter para salvar)`}
                    className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
                  />
                  <Button size="sm" onClick={() => abrirModal(dataSelecionada)} className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Nova
                  </Button>
                </div>

                {/* Painel vazio */}
                {tarefasDia.length === 0 && (
                  <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">
                    <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhuma tarefa para hoje.</p>
                    <button onClick={() => abrirModal(dataSelecionada)} className="text-sm text-blue-600 hover:underline mt-1">+ Adicionar tarefa</button>
                  </div>
                )}

                {/* Um painel por categoria que tenha tarefas */}
                {(() => {
                  const CAT_CORES: Record<string, { header: string; border: string; badge: string }> = {
                    COMERCIAL:    { header: "bg-blue-50",   border: "border-blue-200",   badge: "bg-blue-100 text-blue-700" },
                    SAUDE:        { header: "bg-green-50",  border: "border-green-200",  badge: "bg-green-100 text-green-700" },
                    CASA_FAMILIA: { header: "bg-orange-50", border: "border-orange-200", badge: "bg-orange-100 text-orange-700" },
                    PESSOAL:      { header: "bg-purple-50", border: "border-purple-200", badge: "bg-purple-100 text-purple-700" },
                    FINANCEIRO:   { header: "bg-yellow-50", border: "border-yellow-200", badge: "bg-yellow-100 text-yellow-700" },
                    EDUCACAO:     { header: "bg-indigo-50", border: "border-indigo-200", badge: "bg-indigo-100 text-indigo-700" },
                    OUTROS:       { header: "bg-gray-50",   border: "border-gray-200",   badge: "bg-gray-100 text-gray-600" },
                  };
                  return Object.entries(CATEGORIAS_CONFIG)
                    .filter(([catKey]) => tarefasDia.some(t => t.categoria === catKey))
                    .map(([catKey, catLabel]) => {
                      const tarefasCat = tarefasDia.filter(t => t.categoria === catKey);
                      const pendentesCat = tarefasCat.filter(t => t.status !== "CONCLUIDA" && t.status !== "CANCELADA");
                      const concluidasCat = tarefasCat.filter(t => t.status === "CONCLUIDA");
                      const totalMinCat = tarefasCat.reduce((a, t) => a + (t.duracaoMin ?? 0), 0);
                      const execMinCat = concluidasCat.reduce((a, t) => a + Math.round((t.tempoExecucaoSeg ?? 0) / 60), 0);
                      const colapsado = categoriasColapsadas.has(catKey);
                      const cores = CAT_CORES[catKey] ?? CAT_CORES.OUTROS;
                      const [emoji, ...nomePartes] = catLabel.split(" ");
                      const nomeCat = nomePartes.join(" ");
                      return (
                        <div key={catKey} className={`bg-white rounded-xl border ${cores.border} shadow-sm overflow-hidden`}>
                          {/* Header do painel */}
                          <div className={`flex items-center justify-between px-4 py-2.5 ${cores.header} border-b ${cores.border}`}>
                            <button
                              className="flex items-center gap-2 flex-1 text-left"
                              onClick={() => setCategoriasColapsadas(prev => {
                                const next = new Set(prev);
                                if (next.has(catKey)) next.delete(catKey); else next.add(catKey);
                                return next;
                              })}
                            >
                              <span className="text-base">{emoji}</span>
                              <span className="font-semibold text-sm text-gray-800">{nomeCat}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cores.badge}`}>{tarefasCat.length}</span>
                              {totalMinCat > 0 && (
                                <span className="text-xs text-gray-500">{formatDuracao(execMinCat)}/{formatDuracao(totalMinCat)}</span>
                              )}
                              {colapsado
                                ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-auto" />
                                : <ChevronUp className="w-3.5 h-3.5 text-gray-400 ml-auto" />}
                            </button>
                            <button
                              onClick={() => { setForm(f => ({ ...f, categoria: catKey as TarefaForm["categoria"], dataAgendada: dataSelecionada })); setTarefaEditando(null); setModalAberto(true); }}
                              className="ml-2 p-1 rounded hover:bg-white/60 text-gray-500 hover:text-blue-600 transition-colors"
                              title={`Nova tarefa em ${nomeCat}`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Corpo do painel */}
                          {!colapsado && (
                            <>
                              <div className="grid grid-cols-[24px_20px_16px_1fr_80px_80px_80px] gap-2 px-4 py-1.5 bg-gray-50/50 border-b border-gray-100 text-xs font-medium text-gray-400 uppercase tracking-wide">
                                <span></span><span></span><span></span>
                                <span>Nome</span>
                                <span className="text-right">Duração</span>
                                <span className="text-right">Timer</span>
                                <span></span>
                              </div>
                              {pendentesCat.map((tarefa) => (
                                <DraggableItem
                                  key={tarefa.id}
                                  tarefa={tarefa}
                                  onEdit={() => abrirEdicao(tarefa as typeof tarefasDia[0])}
                                  onDelete={() => excluirMut.mutate({ id: tarefa.id, appUserId })}
                                  onDuplicate={() => abrirDuplicacao(tarefa as any)}
                                  onConcluir={() => {
                                    const dataOc = (tarefa as any)._dataOcorrencia ??
                                      ((tarefa as any).dataAgendada && String((tarefa as any).dataAgendada).substring(0,10) !== dataSelecionada ? dataSelecionada : undefined);
                                    concluirComTimer(tarefa.id, dataOc);
                                  }}
                                 onReabrir={() => reabrirTarefa(tarefa.id)}
                                  onEditarTempo={() => abrirEdicaoTempo(tarefa as any)}
                                  timerAtivo={timerAtivo}
                                  onTimer={() => handleTimer(tarefa.id)}
                                />
                              ))}
                              {concluidasCat.length > 0 && (
                                <>
                                  <div className="px-4 py-1.5 bg-green-50 border-t border-b border-green-100">
                                    <span className="text-xs font-semibold text-green-700 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" /> Concluídas ({concluidasCat.length})
                                    </span>
                                  </div>
                                  {concluidasCat.map((tarefa) => (
                                    <DraggableItem
                                      key={tarefa.id}
                                      tarefa={tarefa}
                                      onEdit={() => abrirEdicao(tarefa as typeof tarefasDia[0])}
                                      onDelete={() => excluirMut.mutate({ id: tarefa.id, appUserId })}
                                  onDuplicate={() => abrirDuplicacao(tarefa as any)}
                                      onConcluir={() => {
                                        const dataOc = (tarefa as any)._dataOcorrencia ??
                                          ((tarefa as any).dataAgendada && String((tarefa as any).dataAgendada).substring(0,10) !== dataSelecionada ? dataSelecionada : undefined);
                                        concluirComTimer(tarefa.id, dataOc);
                                      }}
                                      onReabrir={() => reabrirTarefa(tarefa.id)}
                                      onEditarTempo={() => abrirEdicaoTempo(tarefa as any)}
                                      timerAtivo={timerAtivo}
                                      onTimer={() => handleTimer(tarefa.id)}
                                    />
                                  ))}
                                </>
                              )}
                            </>
                          )}
                        </div>
                      );
                    });
                })()}

                {/* ─── PAINEL DE LEMBRETES ─────────────────────────────────────────────────────────────── */}
                <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
                  <div className={`flex items-center justify-between px-4 py-2.5 bg-amber-50 border-b border-amber-200`}>
                    <button
                      className="flex items-center gap-2 flex-1 text-left"
                      onClick={() => setLembreteExpandido(v => !v)}
                    >
                      <Bell className="w-4 h-4 text-amber-500" />
                      <span className="font-semibold text-sm text-gray-800">Lembretes</span>
                      {lembretesDia.length > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{lembretesDia.length}</span>
                      )}
                      {lembreteExpandido
                        ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 ml-auto" />
                        : <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-auto" />}
                    </button>
                  </div>

                  {lembreteExpandido && (
                    <div>
                      {/* Campo de adição rápida */}
                      <div className="px-4 py-2 border-b border-amber-100 bg-amber-50/40">
                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            value={lembretIcone}
                            onChange={e => setLembretIcone(e.target.value)}
                            className="text-base bg-transparent border-none outline-none cursor-pointer"
                          >
                            {["📌", "🎂", "🍴", "📞", "💼", "🏥", "✈️", "🎉", "📚", "💪", "❤️", "⏰"].map(ic => (
                              <option key={ic} value={ic}>{ic}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={novoLembrete}
                            onChange={e => setNovoLembrete(e.target.value)}
                            onKeyDown={adicionarLembrete}
                            placeholder="Aniversário, almoço, consulta... (Enter para salvar)"
                            className="flex-1 min-w-[160px] text-sm bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
                          />
                          {/* Data do lembrete */}
                          <input
                            type="date"
                            value={lembretData || dataSelecionada}
                            onChange={e => setLembretData(e.target.value)}
                            className="text-xs text-gray-500 bg-transparent border border-gray-200 rounded px-1.5 py-0.5 outline-none"
                          />
                          <input
                            type="time"
                            value={lembretHora}
                            onChange={e => setLembretHora(e.target.value)}
                            className="text-xs text-gray-500 bg-transparent border border-gray-200 rounded px-1.5 py-0.5 outline-none w-20"
                          />
                          <button
                            onClick={() => {
                              if (!novoLembrete.trim()) return;
                              const dataParaUsar = lembretData || dataSelecionada;
                              criarLembreteMut.mutate({ appUserId, texto: novoLembrete.trim(), data: dataParaUsar, hora: lembretHora || null, icone: lembretIcone });
                            }}
                            className="p-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                            title="Adicionar lembrete"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Lista de lembretes */}
                      {lembretesDia.length === 0 ? (
                        <div className="text-center py-6 text-gray-400">
                          <Bell className="w-8 h-8 mx-auto mb-1 opacity-20" />
                          <p className="text-xs">Nenhum lembrete para hoje. Adicione aniversários, almoços, compromissos...</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-amber-50">
                          {lembretesDia.map(lem => (
                            <div key={lem.id} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-amber-50/30 transition-colors ${lem.concluido ? "opacity-50" : ""}`}>
                              <span className="text-lg flex-shrink-0">{lem.icone ?? "📌"}</span>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm text-gray-800 ${lem.concluido ? "line-through text-gray-400" : ""}`}>{lem.texto}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {/* Data do lembrete */}
                                  {lem.data && (
                                    <p className="text-[10px] text-gray-400">
                                      📅 {new Date(lem.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" })}
                                    </p>
                                  )}
                                  {lem.hora && <p className="text-[10px] text-amber-600 font-medium">⏰ {lem.hora}</p>}
                                </div>
                              </div>
                              {/* Botão editar */}
                              <button
                                onClick={() => abrirEditarLembrete(lem)}
                                className="p-1 rounded hover:text-amber-600 text-gray-500 transition-colors flex-shrink-0"
                                title="Editar lembrete"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => toggleLembreteMut.mutate({ id: lem.id, appUserId })}
                                className={`p-1 rounded-full border-2 transition-colors flex-shrink-0 ${
                                  lem.concluido
                                    ? "border-green-400 bg-green-400 text-white"
                                    : "border-gray-300 hover:border-green-400 text-transparent hover:text-green-400"
                                }`}
                                title={lem.concluido ? "Marcar como pendente" : "Marcar como visto"}
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => excluirLembreteMut.mutate({ id: lem.id, appUserId })}
                                className="p-1 rounded hover:text-red-500 text-gray-500 transition-colors flex-shrink-0"
                                title="Excluir lembrete"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="h-6" />
            </div>
          )}          {/* ─── MODAL EDIÇÃO DE LEMBRETE ─────────────────────────────────────────────────────── */}
          <Dialog open={editLembreteId !== null} onOpenChange={open => { if (!open) setEditLembreteId(null); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-500" /> Editar Lembrete
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* Ícone */}
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700 w-16">Ícone</label>
                  <select
                    value={editLembretIcone}
                    onChange={e => setEditLembretIcone(e.target.value)}
                    className="text-xl border border-gray-200 rounded-lg px-2 py-1 outline-none bg-white cursor-pointer"
                  >
                    {["📌", "🎂", "🍴", "📞", "💼", "🏥", "✈️", "🎉", "📚", "💪", "❤️", "⏰"].map(ic => (
                      <option key={ic} value={ic}>{ic}</option>
                    ))}
                  </select>
                </div>
                {/* Texto */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">Descrição</label>
                  <input
                    type="text"
                    value={editLembretTexto}
                    onChange={e => setEditLembretTexto(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") salvarEdicaoLembrete(); }}
                    placeholder="Ex: Aniversário da Maria, Almoço com cliente..."
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400 transition-colors"
                    autoFocus
                  />
                </div>
                {/* Data */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">Data</label>
                  <input
                    type="date"
                    value={editLembretData}
                    onChange={e => setEditLembretData(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400 transition-colors"
                  />
                </div>
                {/* Hora */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">Horário <span className="text-gray-400 font-normal">(opcional)</span></label>
                  <input
                    type="time"
                    value={editLembretHora}
                    onChange={e => setEditLembretHora(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-400 transition-colors w-40"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditLembreteId(null)}>Cancelar</Button>
                <Button
                  onClick={salvarEdicaoLembrete}
                  disabled={!editLembretTexto.trim() || atualizarLembreteMut.isPending}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  {atualizarLembreteMut.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {/* ─── MODAL EDIÇÃO DE TEMPO DE TAREFA CONCLUÍDA ──────────────────── */}
          <Dialog open={editTempoTarefa !== null} onOpenChange={open => { if (!open) setEditTempoTarefa(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" /> Editar Tempo Registrado
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-sm text-gray-600">
                  Ajuste o tempo gasto na tarefa <strong>{editTempoTarefa?.titulo}</strong>.
                </p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label>Horas</Label>
                    <Input
                      type="number"
                      min={0}
                      max={24}
                      value={editTempoHoras}
                      onChange={e => setEditTempoHoras(e.target.value)}
                    />
                  </div>
                  <div className="flex-1">
                    <Label>Minutos</Label>
                    <Input
                      type="number"
                      min={0}
                      max={59}
                      value={editTempoMinutos}
                      onChange={e => setEditTempoMinutos(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditTempoTarefa(null)}>Cancelar</Button>
                <Button
                  onClick={salvarEdicaoTempo}
                  disabled={concluirMut.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {concluirMut.isPending ? "Salvando..." : "Salvar Tempo"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ─── ABA RELATÓRIO DIÁRIO ─────────────────────────────────────────────────────── */}
          {abaAtiva === "relatorio" && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6 max-w-3xl mx-auto">
                {/* Seletor de período */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                    <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-600" /> Período do relatório
                    </h3>
                    <div className="text-xs text-gray-500 font-mono">
                      {periodoCalc.inicio === periodoCalc.fim
                        ? new Date(periodoCalc.inicio + "T12:00:00").toLocaleDateString('pt-BR')
                        : `${new Date(periodoCalc.inicio + "T12:00:00").toLocaleDateString('pt-BR')} → ${new Date(periodoCalc.fim + "T12:00:00").toLocaleDateString('pt-BR')}`}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { v: "hoje" as const, label: "Hoje" },
                      { v: "ontem" as const, label: "Ontem" },
                      { v: "semana" as const, label: "Esta semana" },
                      { v: "mes" as const, label: "Este mês" },
                      { v: "mes-passado" as const, label: "Mês passado" },
                      { v: "30dias" as const, label: "Últimos 30 dias" },
                      { v: "personalizado" as const, label: "Personalizado" },
                    ]).map(opt => (
                      <button
                        key={opt.v}
                        onClick={() => setPeriodoTipo(opt.v)}
                        className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                          periodoTipo === opt.v
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {periodoTipo === "personalizado" && (
                    <div className="flex gap-3 mt-3 items-end flex-wrap">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Data início</label>
                        <input
                          type="date"
                          value={periodoCustomInicio}
                          onChange={e => setPeriodoCustomInicio(e.target.value)}
                          className="border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Data fim</label>
                        <input
                          type="date"
                          value={periodoCustomFim}
                          onChange={e => setPeriodoCustomFim(e.target.value)}
                          className="border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {!relatorioPeriodo ? (
                  <div className="flex items-center justify-center h-32 text-gray-400">Carregando...</div>
                ) : (
                <>
                  {/* Cards de resumo */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                      <div className="text-2xl font-bold text-gray-800">{relatorioPeriodo.totalTarefas}</div>
                      <div className="text-xs text-gray-500 mt-1">Total de tarefas</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                      <div className="text-2xl font-bold text-green-600">{relatorioPeriodo.tarefasConcluidas}</div>
                      <div className="text-xs text-gray-500 mt-1">Concluídas</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {Math.floor(relatorioPeriodo.totalSegundos / 3600)}h{String(Math.floor((relatorioPeriodo.totalSegundos % 3600) / 60)).padStart(2, '0')}m
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Tempo total</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {relatorioPeriodo.totalTarefas > 0 ? Math.round((relatorioPeriodo.tarefasConcluidas / relatorioPeriodo.totalTarefas) * 100) : 0}%
                      </div>
                      <div className="text-xs text-gray-500 mt-1">Taxa de conclusão</div>
                    </div>
                  </div>

                  {/* Tempo por categoria */}
                  {relatorioPeriodo.porCategoria.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <h3 className="text-sm font-semibold text-gray-800 mb-4">Tempo por Categoria</h3>
                      <div className="space-y-3">
                        {relatorioPeriodo.porCategoria
                          .sort((a, b) => b.totalSeg - a.totalSeg)
                          .map(cat => {
                            const maxSeg = Math.max(...relatorioPeriodo.porCategoria.map(c => c.totalSeg));
                            const pct = maxSeg > 0 ? (cat.totalSeg / maxSeg) * 100 : 0;
                            const h = Math.floor(cat.totalSeg / 3600);
                            const m = Math.floor((cat.totalSeg % 3600) / 60);
                            const s = cat.totalSeg % 60;
                            const tempoStr = h > 0 ? `${h}h${String(m).padStart(2,'0')}m` : m > 0 ? `${m}m${String(s).padStart(2,'0')}s` : `${s}s`;
                            const CATEGORIA_LABELS: Record<string, string> = {
                              COMERCIAL: 'Comercial', SAUDE: 'Saúde', CASA_FAMILIA: 'Casa/Família',
                              PESSOAL: 'Pessoal', FINANCEIRO: 'Financeiro', EDUCACAO: 'Educação', OUTROS: 'Outros'
                            };
                            return (
                              <div key={cat.categoria}>
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="font-medium text-gray-700">{CATEGORIA_LABELS[cat.categoria] ?? cat.categoria}</span>
                                  <span className="text-gray-500">{tempoStr} • {cat.tarefas} tarefa{cat.tarefas !== 1 ? 's' : ''}</span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Tempo por dia (gráfico) - só aparece com mais de 1 dia */}
                  {relatorioPeriodo.porDia.length > 1 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <h3 className="text-sm font-semibold text-gray-800 mb-4">Tempo por Dia</h3>
                      <div className="space-y-2">
                        {(() => {
                          const maxDia = Math.max(...relatorioPeriodo.porDia.map(d => d.totalSeg));
                          return relatorioPeriodo.porDia.map(d => {
                            const pct = maxDia > 0 ? (d.totalSeg / maxDia) * 100 : 0;
                            const h = Math.floor(d.totalSeg / 3600);
                            const m = Math.floor((d.totalSeg % 3600) / 60);
                            const tempoStr = h > 0 ? `${h}h${String(m).padStart(2,'0')}m` : `${m}m`;
                            const dataObj = new Date(d.data + "T12:00:00");
                            const diaStr = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', weekday: 'short' });
                            return (
                              <div key={d.data} className="flex items-center gap-2">
                                <div className="text-xs text-gray-600 w-32 flex-shrink-0">{diaStr}</div>
                                <div className="flex-1 h-5 bg-gray-100 rounded relative overflow-hidden">
                                  <div className="h-full bg-blue-400 rounded transition-all" style={{ width: `${pct}%` }} />
                                </div>
                                <div className="text-xs text-gray-600 w-24 text-right flex-shrink-0 font-mono">{tempoStr} • {d.concluidas}/{d.tarefas}</div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Tabela de tarefas com tempo */}
                  {relatorioPeriodo.tarefas.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <h3 className="text-sm font-semibold text-gray-800 mb-4">Detalhamento por Tarefa</h3>
                      <div className="space-y-2">
                        {relatorioPeriodo.tarefas
                          .sort((a, b) => b.tempoExecucaoSeg - a.tempoExecucaoSeg)
                          .map((t, idx) => {
                            const h = Math.floor(t.tempoExecucaoSeg / 3600);
                            const m = Math.floor((t.tempoExecucaoSeg % 3600) / 60);
                            const s = t.tempoExecucaoSeg % 60;
                            const tempoStr = t.tempoExecucaoSeg > 0
                              ? (h > 0 ? `${h}h${String(m).padStart(2,'0')}m` : m > 0 ? `${m}m${String(s).padStart(2,'0')}s` : `${s}s`)
                              : '—';
                            const cfg = TRIADE_CONFIG[t.triade as "IMPORTANTE" | "URGENTE" | "CIRCUNSTANCIAL"];
                            const dataObj = t.data ? new Date(t.data + "T12:00:00") : null;
                            const dataStr = dataObj ? dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';
                            return (
                              <div key={`${t.id}-${t.data}-${idx}`} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg?.color ?? 'bg-gray-400'}`} />
                                <span className="text-xs text-gray-400 font-mono w-12 flex-shrink-0">{dataStr}</span>
                                <span className="flex-1 text-sm text-gray-700 truncate">{t.titulo}</span>
                                {t.status === 'CONCLUIDA' && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
                                <span className="text-xs font-mono text-gray-500 flex-shrink-0">{tempoStr}</span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {relatorioPeriodo.totalTarefas === 0 && (
                    <div className="text-center py-12 text-gray-400">
                      <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Nenhuma tarefa registrada neste período.</p>
                    </div>
                  )}
                </>
                )}
              </div>
            </div>
          )}

          {/* ─── ABA PLANEJAMENTO ───────────────────────────────────────────────── */}
          {abaAtiva === "planejamento" && (            <div className="flex-1 flex overflow-hidden">

              {/* Coluna esquerda: backlog + pendentes */}
              <div className="w-64 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
                <div className="px-3 py-3 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800">Tarefas pendentes</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {backlog.length} para agendar
                      </p>
                    </div>
                    <button
                      onClick={() => { setForm({ ...FORM_VAZIO, dataAgendada: "" }); setTarefaEditando(null); setModalAberto(true); }}
                      className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                      title="Nova tarefa no backlog"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Instrução */}
                {(backlog.length > 0 || pendentes.length > 0) && (
                  <div className="mx-2 mt-2 mb-1 p-2 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-700 flex items-center gap-1.5">
                    <GripVertical className="w-3 h-3 flex-shrink-0" />
                    Arraste para agendar num dia
                  </div>
                )}

                <div className="flex-1 overflow-y-auto">
                  {/* Tarefas SEM DATA — para agendar */}
                  {backlog.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 text-xs font-semibold text-blue-600 uppercase tracking-wide bg-blue-50 border-b border-blue-100 flex items-center gap-1">
                        <GripVertical className="w-3 h-3" /> Para agendar ({backlog.length})
                      </div>
                      {backlog.map((tarefa) => (
                        <BacklogItem
                          key={tarefa.id}
                          tarefa={tarefa}
                          onEdit={() => abrirEdicao(tarefa as unknown as typeof tarefasDia[0])}
                          onDelete={() => excluirMut.mutate({ id: tarefa.id, appUserId })}
                                  onDuplicate={() => abrirDuplicacao(tarefa as any)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Tarefas COM DATA pendentes na semana */}
                  {(() => {
                    const pendentesSemana = tarefasSemana.filter(t =>
                      t.status !== "CONCLUIDA" && t.status !== "CANCELADA" && t.dataAgendada && !t.recorrente
                    );
                    if (pendentesSemana.length === 0) return null;
                    return (
                      <div>
                        <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
                          Pendentes na semana ({pendentesSemana.length})
                        </div>
                        {pendentesSemana.map((tarefa) => (
                          <PendenteItem
                            key={`${tarefa.id}-${String(tarefa.dataAgendada).substring(0,10)}`}
                            tarefa={tarefa as typeof tarefasDia[0]}
                            onEdit={() => abrirEdicao(tarefa as unknown as typeof tarefasDia[0])}
                            onDelete={() => excluirMut.mutate({ id: tarefa.id, appUserId })}
                                  onDuplicate={() => abrirDuplicacao(tarefa as any)}
                          />
                        ))}
                      </div>
                    );
                  })()}

                  {backlog.length === 0 && tarefasSemana.filter(t => t.status !== "CONCLUIDA" && t.status !== "CANCELADA").length === 0 && (
                    <div className="text-center py-10 text-gray-400">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-xs">Tudo planejado!</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Coluna direita: calendário semanal */}
              <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
                {/* Navegação de semana */}
                <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
                  <button onClick={() => { const d = new Date(dataSelecionada + "T12:00:00"); d.setDate(d.getDate() - 7); setDataSelecionada(formatDate(d)); }}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="text-center">
                    <h2 className="text-sm font-bold text-gray-800">
                      {formatDateBR(formatDate(semana.inicio))} — {formatDateBR(formatDate(semana.fim))}
                    </h2>
                    <p className="text-xs text-gray-500">Planejamento diário</p>
                  </div>
                  <button onClick={() => { const d = new Date(dataSelecionada + "T12:00:00"); d.setDate(d.getDate() + 7); setDataSelecionada(formatDate(d)); }}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Grid de dias */}
                <div className="flex-1 overflow-y-auto p-3">
                  <div className="grid grid-cols-7 gap-2 h-full">
                    {semana.dias.map((dia) => {
                      const dStr = formatDate(dia);
                      const tarefasDoDia = tarefasSemana.filter(t =>
                        t.dataAgendada && toYMD(t.dataAgendada) === dStr
                      );
                      return (
                        <DroppableDayColumn
                          key={dStr}
                          diaStr={dStr}
                          tarefasDoDia={tarefasDoDia as Array<{ id: number; titulo: string; triade: "IMPORTANTE" | "URGENTE" | "CIRCUNSTANCIAL"; status: string; duracaoMin?: number | null }>}
                          onAddTask={() => abrirModal(dStr)}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Legenda */}
                <div className="flex gap-4 px-4 py-2 bg-white border-t border-gray-200 justify-center">
                  {(["IMPORTANTE", "URGENTE", "CIRCUNSTANCIAL"] as const).map(t => (
                    <div key={t} className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span className={`w-2.5 h-2.5 rounded-full ${TRIADE_CONFIG[t].color}`} />
                      {TRIADE_CONFIG[t].label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ─── DRAG OVERLAY ─────────────────────────────────────────────────── */}
        <DragOverlay>
          {activeTarefa && (
            <div className={`rounded-lg border-l-4 ${TRIADE_CONFIG[activeTarefa.triade as "IMPORTANTE" | "URGENTE" | "CIRCUNSTANCIAL"].border} bg-white shadow-xl p-2.5 w-52 opacity-95 rotate-1`}>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${TRIADE_CONFIG[activeTarefa.triade as "IMPORTANTE" | "URGENTE" | "CIRCUNSTANCIAL"].color}`} />
                <span className="text-xs font-medium truncate text-gray-800">{activeTarefa.titulo}</span>
              </div>
            </div>
          )}
        </DragOverlay>

        {/* ─── MODAL DE TAREFA ─────────────────────────────────────────────── */}
        <Dialog open={modalAberto} onOpenChange={(open) => { setModalAberto(open); if (!open) { setModoDuplicacao(false); setTarefaEditando(null); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{modoDuplicacao ? "Duplicar Tarefa" : tarefaEditando ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Título *</Label>
                <Input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="O que precisa ser feito?" autoFocus />
              </div>

              <div>
                <Label>Classificação (Tríade)</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {(["IMPORTANTE", "URGENTE", "CIRCUNSTANCIAL"] as const).map(t => {
                    const cfg = TRIADE_CONFIG[t];
                    return (
                      <button key={t} onClick={() => setForm(f => ({ ...f, triade: t }))}
                        className={`p-2 rounded-lg border-2 text-xs font-medium transition-all flex flex-col items-center gap-1 ${form.triade === t ? `${cfg.border} ${cfg.badge}` : "border-border hover:border-muted-foreground"}`}>
                        <span className={`w-4 h-4 rounded-full ${cfg.color}`} />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Categoria</Label>
                  <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v as TarefaForm["categoria"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORIAS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Duração (min)</Label>
                  <Input type="number" min={5} max={480} value={form.duracaoMin} onChange={e => setForm(f => ({ ...f, duracaoMin: Number(e.target.value) }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Data <span className="text-gray-400 text-xs">(vazio = backlog)</span></Label>
                  <Input type="date" value={form.dataAgendada} onChange={e => setForm(f => ({ ...f, dataAgendada: e.target.value }))} />
                </div>
                <div>
                  <Label>Hora</Label>
                  <Input type="time" value={form.horaAgendada} onChange={e => setForm(f => ({ ...f, horaAgendada: e.target.value }))} />
                </div>
              </div>

              <div className="flex flex-col gap-2 p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="recorrente-check"
                    checked={form.recorrente}
                    onChange={e => setForm(f => ({ ...f, recorrente: e.target.checked, recorrencia: e.target.checked ? (f.recorrencia || "DIARIA") : "", diasSemana: [] }))}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                  <Label htmlFor="recorrente-check" className="cursor-pointer font-medium flex-1">Tarefa recorrente</Label>
                  {form.recorrente && (
                    <select
                      className="border rounded-md px-3 py-1.5 text-sm bg-background"
                      value={form.recorrencia}
                      onChange={e => setForm(f => ({ ...f, recorrencia: e.target.value as TarefaForm["recorrencia"], diasSemana: [] }))}
                    >
                      <option value="DIARIA">Todos os dias</option>
                      <option value="SEMANAL">Toda semana</option>
                      <option value="MENSAL">Todo mês</option>
                    </select>
                  )}
                </div>
                {form.recorrente && form.recorrencia === "SEMANAL" && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted-foreground font-medium">Repetir nos dias:</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {[{d: 1, l: "Seg"}, {d: 2, l: "Ter"}, {d: 3, l: "Qua"}, {d: 4, l: "Qui"}, {d: 5, l: "Sex"}, {d: 6, l: "Sáb"}, {d: 0, l: "Dom"}].map(({ d, l }) => {
                        const ativo = form.diasSemana.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setForm(f => ({
                              ...f,
                              diasSemana: ativo
                                ? f.diasSemana.filter(x => x !== d)
                                : [...f.diasSemana, d]
                            }))}
                            className={`w-10 h-8 rounded-md text-xs font-semibold border transition-all ${
                              ativo
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-background text-muted-foreground border-border hover:border-blue-400 hover:text-blue-600"
                            }`}
                          >
                            {l}
                          </button>
                        );
                      })}
                    </div>
                    {form.diasSemana.length === 0 && (
                      <span className="text-xs text-amber-600">Selecione ao menos um dia da semana</span>
                    )}
                  </div>
                )}
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Detalhes opcionais..." rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
              <Button onClick={salvarTarefa} className="bg-blue-600 hover:bg-blue-700 text-white">
                {modoDuplicacao ? "Salvar Cópia" : tarefaEditando ? "Salvar" : "Criar Tarefa"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </DndContext>
    </AppLayout>
  );
}

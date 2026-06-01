import { useState, useEffect, useRef } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAppAuth } from "@/hooks/useAppAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Users, Shield, Plus, Edit2, Trash2, Key, Check, X,
  Eye, PenLine, FilePlus, Eraser, Settings, Lock, MessageCircle, Save,
  Wifi, WifiOff, RefreshCw, Loader2, QrCode, History, AlertCircle, CheckCircle2,
  Phone, Search, Filter, Send
} from "lucide-react";

const PERMISSAO_LABELS: Record<string, string> = {
  podeVer: "Ver",
  podeCriar: "Criar",
  podeEditar: "Editar",
  podeDeletar: "Deletar",
};

type PermissaoKey = "podeVer" | "podeCriar" | "podeEditar" | "podeDeletar";
const PERMISSAO_KEYS: PermissaoKey[] = ["podeVer", "podeCriar", "podeEditar", "podeDeletar"];
const PERMISSAO_ICONS: Record<PermissaoKey, React.ElementType> = {
  podeVer: Eye,
  podeCriar: FilePlus,
  podeEditar: PenLine,
  podeDeletar: Eraser,
};

interface FormUsuario {
  nome: string;
  email: string;
  senha: string;
  role: "admin" | "user";
}

const formVazio: FormUsuario = { nome: "", email: "", senha: "", role: "user" };

type InstanciaKey = "whatsapp-1" | "whatsapp-2" | "whatsapp-3";

const INSTANCIAS_INFO: Record<InstanciaKey, { numero: string; uso: string }> = {
  "whatsapp-1": { numero: "(48) 3372-6890", uso: "Inadimplência + Campanhas + Contato oficial" },
  "whatsapp-2": { numero: "(48) 99210-8365", uso: "Aniversariantes + Boas-vindas" },
  "whatsapp-3": { numero: "(48) 99225-9899", uso: "Médicos — Anderson" },
};

function DisparadorAniversariantesCard() {
  const [disparando, setDisparando] = useState(false);
  const [resultado, setResultado] = useState<{ enviados: number; erros: number } | null>(null);
  const [instanciaSelecionada, setInstanciaSelecionada] = useState<string>("whatsapp-2");

  const disparar = async () => {
    setDisparando(true);
    setResultado(null);
    try {
      const res = await fetch("/api/email-automacoes/1/disparar-agora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instancia: instanciaSelecionada }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Disparo iniciado! Aguarde alguns segundos para o resultado.");
        // Aguarda 10s e verifica o resultado
        setTimeout(async () => {
          try {
            const r2 = await fetch("/api/email-automacoes");
            const autos = await r2.json();
            const aniv = autos.find((a: any) => a.tipo === "ANIVERSARIO");
            if (aniv) setResultado({ enviados: aniv.totalEnviadoHoje || 0, erros: 0 });
          } catch {}
          setDisparando(false);
        }, 10000);
      } else {
        toast.error(data.error || "Erro ao disparar");
        setDisparando(false);
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao disparar");
      setDisparando(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Disparar Aniversariantes Agora</p>
          <p className="text-xs text-amber-700 dark:text-amber-300">Envia WhatsApp para todos os aniversariantes do dia imediatamente</p>
        </div>
        <Button
          size="sm"
          className="gap-1 bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0"
          onClick={disparar}
          disabled={disparando}
        >
          {disparando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          {disparando ? "Disparando..." : "Disparar Agora"}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <p className="text-xs text-amber-700 dark:text-amber-300 flex-shrink-0">Enviar pelo celular:</p>
        <select
          value={instanciaSelecionada}
          onChange={e => setInstanciaSelecionada(e.target.value)}
          className="text-xs border border-amber-300 rounded px-2 py-1 bg-white dark:bg-amber-950 text-amber-900 dark:text-amber-100 flex-1"
          disabled={disparando}
        >
          <option value="whatsapp-1">(48) 3372-6890 — Inadimplência / Campanhas</option>
          <option value="whatsapp-2">(48) 99210-8365 — Aniversariantes (padrão)</option>
          <option value="whatsapp-3">(48) 99225-9899 — Médicos / Anderson</option>
        </select>
      </div>
      {resultado && (
        <p className="text-xs mt-1 text-amber-800 dark:text-amber-200">
          ✅ Resultado: <strong>{resultado.enviados}</strong> mensagens enviadas
        </p>
      )}
    </div>
  );
}

function CardEvolutionApi() {
  const utils = trpc.useUtils();
  const statusQuery = trpc.whatsapp.statusConexao.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const gerarQrMut = trpc.whatsapp.gerarQrCode.useMutation();

  // qrAberto: qual instância está com o painel de QR aberto
  const [qrAberto, setQrAberto] = useState<InstanciaKey | null>(null);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [qrExpira, setQrExpira] = useState(30);
  const qrInstanciaRef = useRef<InstanciaKey | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const limparTimers = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  };

  const fecharQr = () => {
    limparTimers();
    setQrAberto(null);
    setQrBase64(null);
    setQrExpira(30);
    qrInstanciaRef.current = null;
  };

  const gerarQr = async (instancia: InstanciaKey) => {
    qrInstanciaRef.current = instancia;
    setQrAberto(instancia);
    setQrBase64(null);
    setQrExpira(30);
    limparTimers();

    try {
      const res = await gerarQrMut.mutateAsync({ instancia });
      setQrBase64(res.qr);
      setQrExpira(30);

      // Countdown de 30s
      countdownRef.current = setInterval(() => {
        setQrExpira(prev => {
          if (prev <= 1) { clearInterval(countdownRef.current!); return 0; }
          return prev - 1;
        });
      }, 1000);

      // Auto-refresh a cada 30s ou quando conectar
      timerRef.current = setInterval(async () => {
        const inst = qrInstanciaRef.current;
        if (!inst) return;
        // Verifica se já conectou
        await utils.whatsapp.statusConexao.invalidate();
        const status = statusQuery.data?.instancias?.[inst];
        if (status?.conectado) {
          fecharQr();
          toast.success(`WhatsApp ${INSTANCIAS_INFO[inst].numero} conectado com sucesso!`);
          return;
        }
        // Gera novo QR
        try {
          const r = await gerarQrMut.mutateAsync({ instancia: inst });
          setQrBase64(r.qr);
          setQrExpira(30);
          // Reinicia countdown
          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = setInterval(() => {
            setQrExpira(prev => {
              if (prev <= 1) { clearInterval(countdownRef.current!); return 0; }
              return prev - 1;
            });
          }, 1000);
        } catch (_) {}
      }, 30_000);
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar QR Code");
      fecharQr();
    }
  };

  // Limpa timers ao desmontar
  useEffect(() => () => limparTimers(), []);

  const instancias = statusQuery.data?.instancias;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-green-600" />
          WhatsApp — Evolution API
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Os disparos automáticos de WhatsApp estão configurados via <strong>Evolution API</strong>.
          Se uma instância estiver desconectada, clique em <strong>Reconectar</strong> e escaneie o QR Code com o celular.
        </p>

        <div className="rounded-lg border divide-y">
          {(["whatsapp-1", "whatsapp-2", "whatsapp-3"] as InstanciaKey[]).map((inst) => {
            const info = INSTANCIAS_INFO[inst];
            const status = instancias?.[inst];
            const conectado = status?.conectado ?? false;
            const isOpen = qrAberto === inst;

            return (
              <div key={inst}>
                <div className="flex items-center justify-between p-3 gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${conectado ? "bg-green-500" : "bg-red-400"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{info.numero}</p>
                      <p className="text-xs text-muted-foreground">{info.uso}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {statusQuery.isLoading ? (
                      <span className="text-xs text-muted-foreground">Verificando...</span>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        conectado ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}>
                        {conectado ? "Conectado" : "Desconectado"}
                      </span>
                    )}
                    {isOpen ? (
                      <Button size="sm" variant="outline" onClick={fecharQr} className="h-7 text-xs gap-1">
                        <X className="w-3 h-3" /> Fechar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant={conectado ? "outline" : "default"}
                        className={`h-7 text-xs gap-1 ${!conectado ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
                        onClick={() => gerarQr(inst)}
                        disabled={gerarQrMut.isPending && qrInstanciaRef.current === inst}
                      >
                        {gerarQrMut.isPending && qrInstanciaRef.current === inst ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <QrCode className="w-3 h-3" />
                        )}
                        {conectado ? "Reconectar" : "Conectar"}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Painel QR Code */}
                {isOpen && (
                  <div className="border-t bg-gray-50 p-4 space-y-3">
                    <p className="text-xs font-medium text-center text-gray-700">
                      Escaneie com o WhatsApp do número {info.numero}
                    </p>
                    <p className="text-xs text-center text-muted-foreground">
                      Abra o WhatsApp → Menu → Dispositivos conectados → Conectar dispositivo
                    </p>
                    {gerarQrMut.isPending && !qrBase64 ? (
                      <div className="flex flex-col items-center gap-2 py-4">
                        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                        <p className="text-xs text-muted-foreground">Gerando QR Code...</p>
                      </div>
                    ) : qrBase64 ? (
                      <div className="flex flex-col items-center gap-2">
                        <img
                          src={qrBase64}
                          alt="QR Code WhatsApp"
                          className="w-48 h-48 rounded-lg border"
                        />
                        <p className="text-xs text-muted-foreground">
                          QR Code expira em <strong>{qrExpira}s</strong>. Será renovado automaticamente.
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1"
                          onClick={() => gerarQr(inst)}
                          disabled={gerarQrMut.isPending}
                        >
                          <RefreshCw className="w-3 h-3" /> Gerar novo QR
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Status atualizado automaticamente a cada 30s</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs gap-1 px-2"
            onClick={() => utils.whatsapp.statusConexao.invalidate()}
          >
            <RefreshCw className="w-3 h-3" /> Atualizar agora
          </Button>
        </div>

        {/* Botão de disparo manual de aniversários */}
        <DisparadorAniversariantesCard />
      </CardContent>
    </Card>
  );
}

function CardHistoricoEnvios() {
  const [filtroStatus, setFiltroStatus] = useState<string>("TODOS");
  const [filtroBusca, setFiltroBusca] = useState("");
  const [mostrarApenas, setMostrarApenas] = useState<"TODOS" | "ERRO">("TODOS");

  const { data: historico = [], isLoading, refetch } = trpc.whatsapp.historicoEnvios.useQuery({
    status: mostrarApenas === "ERRO" ? "ERRO" : undefined,
    busca: filtroBusca || undefined,
    limit: 100,
  }, { refetchInterval: 60_000 });

  const erros = historico.filter((h: any) => h.status === "ERRO");
  const enviados = historico.filter((h: any) => h.status === "ENVIADO");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="w-5 h-5 text-blue-600" />
          Histórico de Envios WhatsApp
          {erros.length > 0 && (
            <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
              {erros.length} erro{erros.length > 1 ? "s" : ""}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Resumo */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-gray-800">{historico.length}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-700">{enviados.length}</p>
            <p className="text-xs text-muted-foreground">Enviados</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-700">{erros.length}</p>
            <p className="text-xs text-muted-foreground">Erros</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={filtroBusca}
              onChange={e => setFiltroBusca(e.target.value)}
              placeholder="Buscar por nome ou número..."
              className="pl-8 h-8 text-xs"
            />
          </div>
          <div className="flex gap-1">
            {(["TODOS", "ERRO"] as const).map(s => (
              <button
                key={s}
                onClick={() => setMostrarApenas(s)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                  mostrarApenas === s
                    ? s === "ERRO" ? "bg-red-600 text-white" : "bg-blue-600 text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {s === "TODOS" ? "Todos" : "Só erros"}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1 px-2" onClick={() => refetch()}>
            <RefreshCw className="w-3 h-3" /> Atualizar
          </Button>
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : historico.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum envio registrado ainda.</p>
          </div>
        ) : (
          <div className="border rounded-md divide-y max-h-72 overflow-y-auto">
            {historico.map((h: any) => (
              <div key={h.id} className={`flex items-start gap-3 px-3 py-2.5 ${
                h.status === "ERRO" ? "bg-red-50" : ""
              }`}>
                <div className="mt-0.5 shrink-0">
                  {h.status === "ENVIADO"
                    ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                    : <AlertCircle className="w-4 h-4 text-red-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium truncate">{h.nome || "—"}</span>
                    <span className="text-xs font-mono text-muted-foreground">{h.telefone}</span>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">
                      {h.createdAt ? new Date(h.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>
                  </div>
                  {h.status === "ERRO" && h.erro && (
                    <p className="text-xs text-red-600 mt-0.5 truncate" title={h.erro}>
                      {h.erro.includes("não tem WhatsApp") || h.erro.includes("exists\":false")
                        ? "📵 Número não tem WhatsApp cadastrado"
                        : h.erro.length > 80 ? h.erro.substring(0, 80) + "..." : h.erro}
                    </p>
                  )}
                  {h.tipo && (
                    <span className="text-xs text-muted-foreground">{h.tipo}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Componentes de Origens ───────────────────────────────────────────────
function OrigensLista({ onEditar }: { onEditar: (o: any) => void }) {
  const utils = trpc.useUtils();
  const { data: origens = [], isLoading } = trpc.origens.listar.useQuery();
  const excluirMutation = trpc.origens.excluir.useMutation({
    onSuccess: () => { utils.origens.listar.invalidate(); toast.success("Origem excluída!"); },
    onError: () => toast.error("Erro ao excluir"),
  });
  if (isLoading) return <div className="text-sm text-muted-foreground">Carregando...</div>;
  if (!origens.length) return (
    <div className="text-center py-8 text-muted-foreground">
      <Filter className="w-8 h-8 mx-auto mb-2 opacity-30" />
      <p className="text-sm">Nenhuma origem cadastrada ainda.</p>
    </div>
  );
  return (
    <div className="space-y-2">
      {(origens as any[]).map((o: any) => (
        <div key={o.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: o.cor }} />
            <span className="font-medium text-sm">{o.nome}</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => onEditar(o)} className="h-7 w-7 p-0">
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { if (confirm(`Excluir a origem "${o.nome}"?`)) excluirMutation.mutate({ id: o.id }); }}
              className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function OrigemSalvarBtn({ editandoId, form, onClose }: { editandoId: number | null; form: { nome: string; cor: string }; onClose: () => void }) {
  const utils = trpc.useUtils();
  const criarMutation = trpc.origens.criar.useMutation({
    onSuccess: () => { utils.origens.listar.invalidate(); toast.success("Origem criada!"); onClose(); },
    onError: () => toast.error("Erro ao criar origem"),
  });
  const atualizarMutation = trpc.origens.atualizar.useMutation({
    onSuccess: () => { utils.origens.listar.invalidate(); toast.success("Origem atualizada!"); onClose(); },
    onError: () => toast.error("Erro ao atualizar origem"),
  });
  const salvando = criarMutation.isPending || atualizarMutation.isPending;
  const salvar = () => {
    if (!form.nome.trim()) { toast.error("Informe o nome da origem"); return; }
    if (editandoId) atualizarMutation.mutate({ id: editandoId, nome: form.nome, cor: form.cor });
    else criarMutation.mutate({ nome: form.nome, cor: form.cor });
  };
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
      <Button onClick={salvar} disabled={salvando} className="gap-2">
        <Check className="w-4 h-4" />
        {salvando ? "Salvando..." : editandoId ? "Salvar" : "Criar"}
      </Button>
    </div>
  );
}
// ──────────────────────────────────────────────────────────────────────────

export default function Configuracoes() {
  const { appUser, isAdmin, isLoggedIn } = useAppAuth();
  const [abaAtiva, setAbaAtiva] = useState<"usuarios" | "permissoes" | "integracoes" | "origens" | "vendedores">("usuarios");
  // Vendedores
  const { data: vendedoresCadastro = [], refetch: refetchVendedores } = trpc.vendedoresCadastro.listar.useQuery();
  const [novoVendedorNome, setNovoVendedorNome] = useState("");
  const [editandoVendedorId, setEditandoVendedorId] = useState<number | null>(null);
  const [editandoVendedorNome, setEditandoVendedorNome] = useState("");
  const criarVendedorMut = trpc.vendedoresCadastro.criar.useMutation({
    onSuccess: () => { toast.success("Vendedor criado!"); setNovoVendedorNome(""); refetchVendedores(); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarVendedorMut = trpc.vendedoresCadastro.atualizar.useMutation({
    onSuccess: () => { toast.success("Vendedor atualizado!"); setEditandoVendedorId(null); refetchVendedores(); },
    onError: (e) => toast.error(e.message),
  });
  const excluirVendedorMut = trpc.vendedoresCadastro.excluir.useMutation({
    onSuccess: () => { toast.success("Vendedor removido!"); refetchVendedores(); },
    onError: (e) => toast.error(e.message),
  });
  // Origens
  const [origemModalAberto, setOrigemModalAberto] = useState(false);
  const [origemEditandoId, setOrigemEditandoId] = useState<number | null>(null);
  const [origemForm, setOrigemForm] = useState({ nome: "", cor: "#6366f1" });
  const [whatsappNum, setWhatsappNum] = useState("");
  const [whatsappEditado, setWhatsappEditado] = useState("");
  const [whatsappAnivNum, setWhatsappAnivNum] = useState("");
  const [whatsappAnivEditado, setWhatsappAnivEditado] = useState("");
  const [whatsappGeralNum, setWhatsappGeralNum] = useState("");
  const [whatsappGeralEditado, setWhatsappGeralEditado] = useState("");
  // Z-API
  const [zapiInstanceId, setZapiInstanceId] = useState("");
  const [zapiToken, setZapiToken] = useState("");
  const [zapiClientToken, setZapiClientToken] = useState("");
  const [zapiSalvando, setZapiSalvando] = useState(false);
  const [msgInadimplentes, setMsgInadimplentes] = useState("");
  const [msgInadimplentesEditado, setMsgInadimplentesEditado] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<FormUsuario>(formVazio);
  const [usuarioPermissoes, setUsuarioPermissoes] = useState<number | null>(null);
  const [permissoesLocais, setPermissoesLocais] = useState<any[]>([]);
  const [salvandoPermissoes, setSalvandoPermissoes] = useState(false);

  const utils = trpc.useUtils();

  const { data: configWhatsapp } = trpc.inadimplentesDisparo.getConfig.useQuery();
  const { data: configWhatsappAniv } = trpc.inadimplentesDisparo.getConfigAniversario.useQuery();
  const { data: configWhatsappGeral } = trpc.inadimplentesDisparo.getConfigWhatsappGeral.useQuery();

  useEffect(() => {
    if (configWhatsapp?.whatsapp) {
      const num = configWhatsapp.whatsapp;
      const fmt = num.length === 13 ? `+${num.slice(0,2)} ${num.slice(2,4)} ${num.slice(4,8)}-${num.slice(8)}` : num;
      setWhatsappNum(fmt);
      setWhatsappEditado(fmt);
    }
  }, [configWhatsapp]);

  useEffect(() => {
    if (configWhatsappAniv?.whatsapp) {
      const num = configWhatsappAniv.whatsapp;
      const fmt = num.length === 13 ? `+${num.slice(0,2)} ${num.slice(2,4)} ${num.slice(4,8)}-${num.slice(8)}` : num;
      setWhatsappAnivNum(fmt);
      setWhatsappAnivEditado(fmt);
    }
  }, [configWhatsappAniv]);
  useEffect(() => {
    if (configWhatsappGeral?.whatsapp) {
      const num = configWhatsappGeral.whatsapp;
      const fmt = num.length === 13 ? `+${num.slice(0,2)} ${num.slice(2,4)} ${num.slice(4,8)}-${num.slice(8)}` : num;
      setWhatsappGeralNum(fmt);
      setWhatsappGeralEditado(fmt);
    }
  }, [configWhatsappGeral]);

  const updateWhatsapp = trpc.inadimplentesDisparo.updateWhatsapp.useMutation({
    onSuccess: () => toast.success("Número de WhatsApp atualizado!"),
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const updateWhatsappAniv = trpc.inadimplentesDisparo.updateWhatsappAniversario.useMutation({
    onSuccess: () => toast.success("WhatsApp de aniversário atualizado!"),
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const updateWhatsappGeral = trpc.inadimplentesDisparo.updateWhatsappGeral.useMutation({
    onSuccess: () => toast.success("WhatsApp geral atualizado!"),
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const saveZapiMut = trpc.inadimplentesDisparo.saveSystemConfig.useMutation({
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const { data: msgInadimplentesData } = trpc.inadimplentesDisparo.getMsgInadimplentes.useQuery();
  const saveMsgInadimplentes = trpc.inadimplentesDisparo.saveSystemConfig.useMutation({
    onSuccess: () => {
      toast.success("Template de mensagem salvo!");
      setMsgInadimplentes(msgInadimplentesEditado);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  useEffect(() => {
    if (msgInadimplentesData?.mensagem) {
      setMsgInadimplentes(msgInadimplentesData.mensagem);
      setMsgInadimplentesEditado(msgInadimplentesData.mensagem);
    }
  }, [msgInadimplentesData]);

  const { data: usuarios = [], isLoading } = trpc.configuracoes.listarUsuarios.useQuery();
  const { data: modulos = [] } = trpc.configuracoes.listarModulos.useQuery();
  const { data: permissoesUsuario, isLoading: loadingPerms } = trpc.configuracoes.listarPermissoes.useQuery(
    { userId: usuarioPermissoes! },
    { enabled: !!usuarioPermissoes }
  );

  // Sincronizar permissões locais quando carrega do servidor
  useState(() => {
    if (permissoesUsuario) setPermissoesLocais(permissoesUsuario);
  });

  const criarMut = trpc.configuracoes.criarUsuario.useMutation({
    onSuccess: () => {
      toast.success("Usuário criado com sucesso!");
      utils.configuracoes.listarUsuarios.invalidate();
      setModalAberto(false);
      setForm(formVazio);
    },
    onError: (e) => toast.error(e.message),
  });

  const atualizarMut = trpc.configuracoes.atualizarUsuario.useMutation({
    onSuccess: () => {
      toast.success("Usuário atualizado!");
      utils.configuracoes.listarUsuarios.invalidate();
      setModalAberto(false);
      setEditandoId(null);
      setForm(formVazio);
    },
    onError: (e) => toast.error(e.message),
  });

  const deletarMut = trpc.configuracoes.deletarUsuario.useMutation({
    onSuccess: () => {
      toast.success("Usuário removido.");
      utils.configuracoes.listarUsuarios.invalidate();
      if (usuarioPermissoes === editandoId) setUsuarioPermissoes(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const salvarPermissoesMut = trpc.configuracoes.salvarPermissoes.useMutation({
    onSuccess: () => {
      toast.success("Permissões salvas!");
      utils.configuracoes.listarPermissoes.invalidate({ userId: usuarioPermissoes! });
      setSalvandoPermissoes(false);
    },
    onError: (e) => { toast.error(e.message); setSalvandoPermissoes(false); },
  });

  function abrirCriar() {
    setEditandoId(null);
    setForm(formVazio);
    setModalAberto(true);
  }

  function abrirEditar(u: any) {
    setEditandoId(u.id);
    setForm({ nome: u.nome, email: u.email, senha: "", role: u.role });
    setModalAberto(true);
  }

  function salvar() {
    if (!form.nome || !form.email) return toast.error("Nome e email são obrigatórios.");
    if (editandoId) {
      atualizarMut.mutate({ id: editandoId, ...form });
    } else {
      if (!form.senha || form.senha.length < 6) return toast.error("Senha deve ter ao menos 6 caracteres.");
      criarMut.mutate(form);
    }
  }

  function abrirPermissoes(u: any) {
    setUsuarioPermissoes(u.id);
    setAbaAtiva("permissoes");
  }

  function togglePermissao(modulo: string, chave: PermissaoKey) {
    setPermissoesLocais(prev => prev.map(p =>
      p.modulo === modulo ? { ...p, [chave]: !p[chave] } : p
    ));
  }

  function toggleTodosModulo(modulo: string, valor: boolean) {
    setPermissoesLocais(prev => prev.map(p =>
      p.modulo === modulo ? { ...p, podeVer: valor, podeCriar: valor, podeEditar: valor, podeDeletar: valor } : p
    ));
  }

  function toggleTodosPermissao(chave: PermissaoKey, valor: boolean) {
    setPermissoesLocais(prev => prev.map(p => ({ ...p, [chave]: valor })));
  }

  function salvarPermissoes() {
    if (!usuarioPermissoes) return;
    setSalvandoPermissoes(true);
    salvarPermissoesMut.mutate({ userId: usuarioPermissoes, permissoes: permissoesLocais });
  }

  const usuarioSelecionado = usuarios.find((u: any) => u.id === usuarioPermissoes);

  // Acesso controlado pelo PermissaoGuard na rota — não bloquear aqui

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1a2f5e, #2d4a8a)" }}>
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Configurações</h1>
            <p className="text-sm text-gray-500">Gestão de usuários e permissões do sistema</p>
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-2 border-b border-gray-200">
          {[
            { id: "usuarios", label: "Usuários", icon: Users },
            { id: "permissoes", label: "Permissões", icon: Shield },
            { id: "integracoes", label: "Integrações", icon: MessageCircle },
            { id: "origens", label: "Origens", icon: Filter },
            { id: "vendedores", label: "Vendedores", icon: Users },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setAbaAtiva(id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                abaAtiva === id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ABA: INTEGRAÇÕES */}
        {abaAtiva === "integracoes" && (
          <div className="space-y-6 max-w-2xl">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-green-600" />
                  WhatsApp para Contato de Inadimplentes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Este número aparecerá como botão de contato nos e-mails de cobrança enviados para inadimplentes.
                  Quando o cliente clicar, será redirecionado diretamente para o WhatsApp.
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-sm font-medium">Número do WhatsApp</label>
                    <Input
                      value={whatsappEditado}
                      onChange={(e) => setWhatsappEditado(e.target.value)}
                      placeholder="+55 48 3372-6890"
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">Formato: +55 DDD Número (ex: +55 48 3372-6890)</p>
                  </div>
                  <Button
                    className="gap-2 mt-5"
                    onClick={() => updateWhatsapp.mutate({ numero: whatsappEditado })}
                    disabled={updateWhatsapp.isPending || !whatsappEditado.trim()}
                  >
                    <Save className="w-4 h-4" />
                    {updateWhatsapp.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
                {configWhatsapp && (
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <p className="text-xs text-green-700 dark:text-green-300">
                      ✅ Número atual configurado: <strong className="font-mono">{whatsappNum}</strong>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-pink-500" />
                  WhatsApp para Resposta de Aniversário
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Este número aparece como botão nos e-mails de aniversário. Quando o cliente clicar, será redirecionado para o WhatsApp para responder os parabéns.
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-sm font-medium">Número do WhatsApp</label>
                    <Input
                      value={whatsappAnivEditado}
                      onChange={(e) => setWhatsappAnivEditado(e.target.value)}
                      placeholder="+55 45 9999-9999"
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">Formato: +55 DDD Número (ex: +55 45 9999-9999)</p>
                  </div>
                  <Button
                    className="gap-2 mt-5"
                    onClick={() => updateWhatsappAniv.mutate({ numero: whatsappAnivEditado })}
                    disabled={updateWhatsappAniv.isPending || !whatsappAnivEditado.trim()}
                  >
                    <Save className="w-4 h-4" />
                    {updateWhatsappAniv.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
                {whatsappAnivNum && (
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <p className="text-xs text-green-700 dark:text-green-300">
                      ✅ Número atual configurado: <strong className="font-mono">{whatsappAnivNum}</strong>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-blue-600" />
                  WhatsApp Geral (Campanhas de Marketing)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Este número é usado como botão de contato nos e-mails de campanhas gerais, como a Campanha Médicos - DIT.
                  Quando o destinatário clicar, será redirecionado diretamente para o WhatsApp.
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-sm font-medium">Número do WhatsApp</label>
                    <Input
                      value={whatsappGeralEditado}
                      onChange={(e) => setWhatsappGeralEditado(e.target.value)}
                      placeholder="+55 48 3372-6890"
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">Formato: +55 DDD Número (ex: +55 48 3372-6890)</p>
                  </div>
                  <Button
                    className="gap-2 mt-5"
                    onClick={() => updateWhatsappGeral.mutate({ numero: whatsappGeralEditado })}
                    disabled={updateWhatsappGeral.isPending || !whatsappGeralEditado.trim()}
                  >
                    <Save className="w-4 h-4" />
                    {updateWhatsappGeral.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
                {whatsappGeralNum && (
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <p className="text-xs text-green-700 dark:text-green-300">
                      ✅ Número atual configurado: <strong className="font-mono">{whatsappGeralNum}</strong>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Card Template Mensagem Inadimplentes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-orange-500" />
                  Template da Mensagem WhatsApp — Inadimplentes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Este é o texto enviado automaticamente via WhatsApp para os inadimplentes selecionados.
                  Use <code className="bg-muted px-1 rounded text-xs font-mono">&#123;&#123;nome&#125;&#125;</code> para inserir o primeiro nome do cliente automaticamente.
                </p>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Mensagem</label>
                  <textarea
                    className="w-full min-h-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-mono"
                    value={msgInadimplentesEditado}
                    onChange={(e) => setMsgInadimplentesEditado(e.target.value)}
                    placeholder="Olá, {{nome}}! ..."
                  />
                  <p className="text-xs text-muted-foreground">Dica: Use \n para quebras de linha. A variável &#123;&#123;nome&#125;&#125; será substituída pelo primeiro nome do cliente.</p>
                </div>
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMsgInadimplentesEditado(msgInadimplentes)}
                    disabled={msgInadimplentesEditado === msgInadimplentes}
                  >
                    Desfazer alterações
                  </Button>
                  <Button
                    className="gap-2"
                    onClick={() => saveMsgInadimplentes.mutate({ chave: 'wa_automacao_inadimplentes_msg', valor: msgInadimplentesEditado })}
                    disabled={saveMsgInadimplentes.isPending || !msgInadimplentesEditado.trim()}
                  >
                    <Save className="w-4 h-4" />
                    {saveMsgInadimplentes.isPending ? "Salvando..." : "Salvar Template"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Card Evolution API */}
<CardEvolutionApi />

            {/* Card Histórico de Envios WhatsApp */}
            <CardHistoricoEnvios />
          </div>
        )}

        {/* ABA: USUÁRIOS */}
        {abaAtiva === "usuarios" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{usuarios.length} usuário(s) cadastrado(s)</p>
              <Button onClick={abrirCriar} className="gap-2" style={{ background: "linear-gradient(135deg, #1a2f5e, #2d4a8a)" }}>
                <Plus className="w-4 h-4" /> Novo Usuário
              </Button>
            </div>

            {isLoading ? (
              <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : (
              <div className="grid gap-3">
                {usuarios.map((u: any) => (
                  <Card key={u.id} className="border border-gray-100 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
                            u.role === "admin" ? "bg-gradient-to-br from-purple-500 to-purple-700" : "bg-gradient-to-br from-blue-500 to-blue-700"
                          }`}>
                            {u.nome.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-800 truncate">{u.nome}</span>
                              <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">
                                {u.role === "admin" ? "Admin" : "Usuário"}
                              </Badge>
                              {!u.ativo && <Badge variant="destructive" className="text-xs">Inativo</Badge>}
                            </div>
                            <p className="text-sm text-gray-500 truncate">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => abrirPermissoes(u)}
                            className="gap-1 text-xs"
                            title="Gerenciar permissões"
                          >
                            <Shield className="w-3.5 h-3.5" /> Permissões
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => abrirEditar(u)} title="Editar">
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Remover o usuário "${u.nome}"?`)) deletarMut.mutate({ id: u.id });
                            }}
                            className="text-red-500 hover:text-red-700"
                            title="Remover"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA: PERMISSÕES */}
        {abaAtiva === "permissoes" && (
          <div className="space-y-4">
            {/* Seletor de usuário */}
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm font-medium text-gray-700">Usuário:</label>
              <Select
                value={usuarioPermissoes?.toString() ?? ""}
                onValueChange={(v) => {
                  setUsuarioPermissoes(parseInt(v));
                  setPermissoesLocais([]);
                }}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Selecione um usuário..." />
                </SelectTrigger>
                <SelectContent>
                  {usuarios.map((u: any) => (
                    <SelectItem key={u.id} value={u.id.toString()}>
                      {u.nome} {u.role === "admin" ? "(Admin)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {usuarioSelecionado?.role === "admin" && (
                <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                  Admin — acesso total automático
                </Badge>
              )}
            </div>

            {!usuarioPermissoes && (
              <div className="text-center py-16 text-gray-400">
                <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Selecione um usuário para gerenciar suas permissões</p>
              </div>
            )}

            {usuarioPermissoes && loadingPerms && (
              <div className="text-center py-12 text-gray-400">Carregando permissões...</div>
            )}

            {usuarioPermissoes && !loadingPerms && permissoesUsuario && (
              <>
                {/* Ações globais */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500 font-medium">Marcar tudo:</span>
                  {PERMISSAO_KEYS.map(chave => (
                    <div key={chave} className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 px-2 gap-1 text-green-700 border-green-200 hover:bg-green-50"
                        onClick={() => toggleTodosPermissao(chave, true)}
                      >
                        <Check className="w-3 h-3" /> {PERMISSAO_LABELS[chave]}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 px-2 gap-1 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => toggleTodosPermissao(chave, false)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Tabela de permissões */}
                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 font-semibold text-gray-700 w-48">Módulo</th>
                        {PERMISSAO_KEYS.map(chave => {
                          const Icon = PERMISSAO_ICONS[chave];
                          return (
                            <th key={chave} className="px-4 py-3 text-center font-semibold text-gray-700">
                              <div className="flex items-center justify-center gap-1">
                                <Icon className="w-3.5 h-3.5" />
                                {PERMISSAO_LABELS[chave]}
                              </div>
                            </th>
                          );
                        })}
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">Tudo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(permissoesLocais.length > 0 ? permissoesLocais : permissoesUsuario).map((p: any, idx: number) => {
                        const local = permissoesLocais.find(l => l.modulo === p.modulo) || p;
                        const todosAtivos = PERMISSAO_KEYS.every(k => local[k]);
                        return (
                          <tr key={p.modulo} className={`border-b border-gray-100 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-blue-50/30`}>
                            <td className="px-4 py-3 font-medium text-gray-800">{p.label}</td>
                            {PERMISSAO_KEYS.map(chave => (
                              <td key={chave} className="px-4 py-3 text-center">
                                <Switch
                                  checked={!!local[chave]}
                                  onCheckedChange={() => {
                                    if (permissoesLocais.length === 0) setPermissoesLocais(permissoesUsuario);
                                    togglePermissao(p.modulo, chave);
                                  }}
                                  disabled={usuarioSelecionado?.role === "admin"}
                                />
                              </td>
                            ))}
                            <td className="px-4 py-3 text-center">
                              <Switch
                                checked={todosAtivos}
                                onCheckedChange={(v) => {
                                  if (permissoesLocais.length === 0) setPermissoesLocais(permissoesUsuario);
                                  toggleTodosModulo(p.modulo, v);
                                }}
                                disabled={usuarioSelecionado?.role === "admin"}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {usuarioSelecionado?.role !== "admin" && (
                  <div className="flex justify-end">
                    <Button
                      onClick={salvarPermissoes}
                      disabled={salvandoPermissoes}
                      className="gap-2"
                      style={{ background: "linear-gradient(135deg, #1a2f5e, #2d4a8a)" }}
                    >
                      <Check className="w-4 h-4" />
                      {salvandoPermissoes ? "Salvando..." : "Salvar Permissões"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ABA: ORIGENS */}
      {abaAtiva === "origens" && (
        <div className="space-y-4 max-w-2xl">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="w-5 h-5 text-blue-600" />
                  Origens de Clientes
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() => { setOrigemEditandoId(null); setOrigemForm({ nome: "", cor: "#6366f1" }); setOrigemModalAberto(true); }}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" /> Nova Origem
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Defina as origens dos clientes (ex: Indicação, Parceria, Prospecção). Estas opções aparecem no cadastro de cliente e nos filtros da Base de Clientes.
              </p>
              <OrigensLista
                onEditar={(o: any) => { setOrigemEditandoId(o.id); setOrigemForm({ nome: o.nome, cor: o.cor || "#6366f1" }); setOrigemModalAberto(true); }}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ABA: VENDEDORES */}
      {abaAtiva === "vendedores" && (
        <div className="space-y-4 max-w-2xl">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  Vendedores
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Gerencie os vendedores disponíveis para seleção no Controle de Vendas e CRM Leads.
              </p>
              {/* Adicionar novo */}
              <div className="flex gap-2">
                <Input
                  value={novoVendedorNome}
                  onChange={e => setNovoVendedorNome(e.target.value.toUpperCase())}
                  placeholder="Nome do vendedor (ex: JOAO)"
                  onKeyDown={e => e.key === "Enter" && novoVendedorNome.trim() && criarVendedorMut.mutate({ nome: novoVendedorNome })}
                />
                <Button
                  onClick={() => novoVendedorNome.trim() && criarVendedorMut.mutate({ nome: novoVendedorNome })}
                  disabled={criarVendedorMut.isPending || !novoVendedorNome.trim()}
                  className="gap-2 flex-shrink-0"
                >
                  <Plus className="w-4 h-4" /> Adicionar
                </Button>
              </div>
              {/* Lista */}
              <div className="divide-y border rounded-lg">
                {(vendedoresCadastro as any[]).length === 0 && (
                  <p className="text-sm text-muted-foreground p-4 text-center">Nenhum vendedor cadastrado.</p>
                )}
                {(vendedoresCadastro as any[]).map((v: any) => (
                  <div key={v.id} className="flex items-center justify-between p-3 gap-3">
                    {editandoVendedorId === v.id ? (
                      <div className="flex gap-2 flex-1">
                        <Input
                          value={editandoVendedorNome}
                          onChange={e => setEditandoVendedorNome(e.target.value.toUpperCase())}
                          className="flex-1"
                          autoFocus
                          onKeyDown={e => e.key === "Enter" && atualizarVendedorMut.mutate({ id: v.id, nome: editandoVendedorNome })}
                        />
                        <Button size="sm" onClick={() => atualizarVendedorMut.mutate({ id: v.id, nome: editandoVendedorNome })} disabled={atualizarVendedorMut.isPending} className="gap-1">
                          <Check className="w-3 h-3" /> Salvar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditandoVendedorId(null)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 flex-1">
                          <span className={`w-2 h-2 rounded-full ${v.ativo ? 'bg-green-500' : 'bg-gray-300'}`} />
                          <span className="font-medium text-sm">{v.nome}</span>
                          {!v.ativo && <Badge variant="outline" className="text-xs text-gray-400">Inativo</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={!!v.ativo}
                            onCheckedChange={checked => atualizarVendedorMut.mutate({ id: v.id, ativo: checked })}
                          />
                          <Button size="sm" variant="ghost" onClick={() => { setEditandoVendedorId(v.id); setEditandoVendedorNome(v.nome); }}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => { if (confirm(`Remover ${v.nome}?`)) excluirVendedorMut.mutate({ id: v.id }); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {/* Modal Criar/Editar Origem */}
      <Dialog open={origemModalAberto} onOpenChange={setOrigemModalAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{origemEditandoId ? "Editar Origem" : "Nova Origem"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nome da Origem</label>
              <Input
                value={origemForm.nome}
                onChange={e => setOrigemForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Indicação, Parceria, Prospecção..."
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Cor</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={origemForm.cor}
                  onChange={e => setOrigemForm(f => ({ ...f, cor: e.target.value }))}
                  className="w-10 h-10 rounded cursor-pointer border"
                />
                <span className="text-sm text-muted-foreground">{origemForm.cor}</span>
              </div>
            </div>
            <OrigemSalvarBtn
              editandoId={origemEditandoId}
              form={origemForm}
              onClose={() => setOrigemModalAberto(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Criar/Editar Usuário */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              {editandoId ? "Editar Usuário" : "Novo Usuário"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Nome completo *</label>
              <Input
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Fernanda Silva"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">E-mail *</label>
              <Input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@exemplo.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                {editandoId ? "Nova senha (deixe em branco para manter)" : "Senha *"}
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="password"
                  value={form.senha}
                  onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                  placeholder={editandoId ? "••••••••" : "Mínimo 6 caracteres"}
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Perfil</label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as any }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editandoId && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Switch
                  checked={form.role !== "user" ? true : true}
                  onCheckedChange={(v) => atualizarMut.mutate({ id: editandoId!, ativo: v })}
                />
                <span className="text-sm text-gray-700">Usuário ativo</span>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setModalAberto(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={salvar}
                disabled={criarMut.isPending || atualizarMut.isPending}
                style={{ background: "linear-gradient(135deg, #1a2f5e, #2d4a8a)" }}
              >
                <Check className="w-4 h-4" />
                {criarMut.isPending || atualizarMut.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

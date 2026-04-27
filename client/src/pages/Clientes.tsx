import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users, Search, UserCheck, UserX, Plus, Pencil, Trash2,
  ChevronLeft, ChevronRight, DollarSign, TrendingUp, Percent, Download, Package, X, ChevronDown,
  Cake, Phone, Mail, PartyPopper, Bell, Loader2, Send, MessageSquare, Filter, SlidersHorizontal,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const s = String(d).substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const [yyyy, mm, dd] = s.split("-");
  return `${dd}/${mm}/${yyyy}`;
};

type ClienteForm = {
  nome: string;
  cpf: string;
  vendedor: string;
  status: string;
  produtos: string;
  telefone: string;
  celular: string;
  email: string;
  dataNascimento: string;
  endereco: string;
  bairro: string;
  cidade: string;
  cep: string;
  observacao: string;
  taxaComissao: string;
  valorTotalComissao: string;
  valorComissao: string;
  origemId: number | null;
};
const formVazio: ClienteForm = {
  nome: "", cpf: "", vendedor: "", status: "Ativo",
  produtos: "", telefone: "", celular: "", email: "", dataNascimento: "",
  endereco: "", bairro: "", cidade: "", cep: "",
  observacao: "", taxaComissao: "", valorTotalComissao: "", valorComissao: "",
  origemId: null,
};

const PAGE_SIZE = 50;

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtPct = (v: string | number | null) => {
  if (!v) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return n <= 1 ? `${(n * 100).toFixed(2)}%` : `${n.toFixed(2)}%`;
};

// ─── Botão de reenvio individual de aniversário ─────────────────────────────
function EnviarAniversarioBtn({ clienteId, nome }: { clienteId: number; nome: string }) {
  const [enviado, setEnviado] = useState(false);
  const enviarMut = trpc.clientes.enviarAniversarioIndividual.useMutation({
    onSuccess: (res) => {
      if (res.sucesso) {
        toast.success(res.mensagem);
        setEnviado(true);
        setTimeout(() => setEnviado(false), 5000);
      } else {
        toast.error(res.mensagem);
      }
    },
    onError: (e) => toast.error("Erro ao enviar: " + e.message),
  });
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={enviarMut.isPending || enviado}
      onClick={() => enviarMut.mutate({ clienteId })}
      className={`h-7 text-xs gap-1.5 ${
        enviado
          ? "border-green-400 text-green-700 bg-green-50"
          : "border-green-300 text-green-700 hover:bg-green-50"
      }`}
      title={`Enviar mensagem de aniversário para ${nome}`}
    >
      {enviarMut.isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : enviado ? (
        <MessageSquare className="h-3 w-3" />
      ) : (
        <Send className="h-3 w-3" />
      )}
      {enviado ? "Enviado" : "Enviar"}
    </Button>
  );
}

const MESES_NOMES = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export default function Clientes() {
  const [abaAtiva, setAbaAtiva] = useState<"clientes" | "aniversariantes">("clientes");
  const [mesAniversario, setMesAniversario] = useState<number>(() => new Date().getMonth() + 1);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [vendedorFiltro, setVendedorFiltro] = useState<string>("todos");
  const [produtosFiltro, setProdutosFiltro] = useState<number[]>([]);
  const [filtroProdutoAberto, setFiltroProdutoAberto] = useState(false);
  const [buscaProduto, setBuscaProduto] = useState("");
  const filtroProdutoRef = useRef<HTMLDivElement>(null);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filtroProdutoRef.current && !filtroProdutoRef.current.contains(e.target as Node)) {
        setFiltroProdutoAberto(false);
        setBuscaProduto("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const [pagina, setPagina] = useState(0);

  // Filtros avançados
  const [filtrosAvancadosAbertos, setFiltrosAvancadosAbertos] = useState(false);
  const [origemFiltro, setOrigemFiltro] = useState<number | null>(null);
  const [idadeMinFiltro, setIdadeMinFiltro] = useState("");
  const [idadeMaxFiltro, setIdadeMaxFiltro] = useState("");
  const [valorMinFiltro, setValorMinFiltro] = useState("");
  const [valorMaxFiltro, setValorMaxFiltro] = useState("");
  const [dataNascInicioFiltro, setDataNascInicioFiltro] = useState("");
  const [dataNascFimFiltro, setDataNascFimFiltro] = useState("");

  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<ClienteForm>(formVazio);
  const [produtosSelecionados, setProdutosSelecionados] = useState<number[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [boasVindasCliente, setBoasVindasCliente] = useState<{ nome: string; email: string } | null>(null);
  const [boasVindasForm, setBoasVindasForm] = useState({ destinatario: "", assunto: "", corpo: "" });
  const [enviandoBoasVindas, setEnviandoBoasVindas] = useState(false);

  // WhatsApp boas-vindas — disparo automático via Evolution API
  const [whatsBoasVindasCliente, setWhatsBoasVindasCliente] = useState<{ nome: string; telefone: string } | null>(null);
  const [whatsBoasVindasForm, setWhatsBoasVindasForm] = useState({ telefone: "", mensagem: "" });
  const enviarWhatsBoasVindasMut = trpc.whatsapp.enviarIndividual.useMutation({
    onSuccess: () => {
      toast.success(`Mensagem de boas-vindas enviada para ${whatsBoasVindasCliente?.nome}!`);
      setWhatsBoasVindasCliente(null);
    },
    onError: (e) => toast.error("Erro ao enviar: " + e.message),
  });
  const enviarWhatsBoasVindas = () => {
    if (!whatsBoasVindasForm.telefone) {
      toast.error("Informe o número de WhatsApp do cliente");
      return;
    }
    enviarWhatsBoasVindasMut.mutate({
      nome: whatsBoasVindasCliente?.nome,
      telefone: whatsBoasVindasForm.telefone,
      mensagem: whatsBoasVindasForm.mensagem,
    });
  };

  const enviarBoasVindas = async () => {
    if (!boasVindasForm.destinatario || !boasVindasForm.assunto || !boasVindasForm.corpo) {
      toast.error("Preencha destinatário, assunto e corpo do e-mail");
      return;
    }
    setEnviandoBoasVindas(true);
    try {
      const resp = await fetch("/api/email-marketing/enviar-individual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinatario: boasVindasForm.destinatario,
          destinatarioNome: boasVindasCliente?.nome,
          assunto: boasVindasForm.assunto,
          corpo: boasVindasForm.corpo,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erro ao enviar");
      toast.success(`E-mail de boas-vindas enviado para ${boasVindasForm.destinatario}!`);
      setBoasVindasCliente(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEnviandoBoasVindas(false);
    }
  };
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [buscaProdutoModal, setBuscaProdutoModal] = useState("");

  // Múltiplos vendedores por cliente
  const [vendedoresCliente, setVendedoresCliente] = useState<{ nomeVendedor: string; percentual: number }[]>([]);
  const { data: vendedoresClienteData } = trpc.comissoes.listarVendedoresCliente.useQuery(
    { clienteId: editandoId ?? 0 },
    { enabled: !!editandoId }
  );
  const salvarVendedoresMut = trpc.comissoes.salvarVendedoresCliente.useMutation();

  // Sincronizar vendedores ao abrir edição
  useEffect(() => {
    if (editandoId && vendedoresClienteData) {
      setVendedoresCliente(vendedoresClienteData.map(v => ({ nomeVendedor: v.nomeVendedor, percentual: v.percentual })));
    } else if (!editandoId) {
      setVendedoresCliente([]);
    }
  }, [editandoId, vendedoresClienteData]);

  // Regra: qualquer vendedor ≠ ELISIA divide automaticamente com ELISIA (que fica com o restante)
  type VendedorItem = { nomeVendedor: string; percentual: number };
  const aplicarRegraElisiaCliente = (lista: VendedorItem[]): VendedorItem[] => {
    const temNaoElisia = lista.some(v => v.nomeVendedor && v.nomeVendedor !== "ELISIA");
    if (!temNaoElisia) {
      return lista.map(v => v.nomeVendedor === "ELISIA" ? { ...v, percentual: 100 } : v);
    }
    const semElisia = lista.filter(v => v.nomeVendedor !== "ELISIA");
    const somaOutros = semElisia.reduce((s, v) => s + (Number(v.percentual) || 0), 0);
    const restanteElisia = Math.max(0, 100 - somaOutros);
    return [...semElisia, { nomeVendedor: "ELISIA", percentual: restanteElisia }];
  };

  const addVendedor = () => {
    const naoElisia = vendedoresCliente.filter(v => v.nomeVendedor !== "ELISIA");
    if (naoElisia.length >= 2) { toast.error("Máximo de 2 vendedores além da ELISIA"); return; }
    const novaLista = aplicarRegraElisiaCliente([...naoElisia, { nomeVendedor: "", percentual: 50 }]);
    setVendedoresCliente(novaLista);
  };
  const removeVendedor = (idx: number) => {
    const novaLista = aplicarRegraElisiaCliente(vendedoresCliente.filter((_, i) => i !== idx));
    setVendedoresCliente(novaLista);
  };
  const updateVendedor = (idx: number, field: "nomeVendedor" | "percentual", value: string | number) => {
    const atualizado = vendedoresCliente.map((v, i) => i === idx ? { ...v, [field]: value } : v);
    if (field === "nomeVendedor" || field === "percentual") {
      setVendedoresCliente(aplicarRegraElisiaCliente(atualizado));
    } else {
      setVendedoresCliente(atualizado);
    }
  };
  const totalPercentual = vendedoresCliente.reduce((s, v) => s + (Number(v.percentual) || 0), 0);

  async function buscarCep(cep: string) {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(f => ({
          ...f,
          cep: `${digits.substring(0,5)}-${digits.substring(5)}`,
          endereco: data.logradouro || f.endereco,
          bairro: data.bairro || f.bairro,
          cidade: data.localidade ? `${data.localidade}-${data.uf}` : f.cidade,
        }));
        toast.success('Endereço preenchido automaticamente!');
      } else {
        toast.error('CEP não encontrado.');
      }
    } catch {
      toast.error('Erro ao buscar CEP.');
    } finally {
      setBuscandoCep(false);
    }
  }

  const hoje = useMemo(() => new Date(), []);
  const diaHoje = hoje.getDate();
  const mesHoje = hoje.getMonth() + 1;
  const [diaConsulta, setDiaConsulta] = useState<number>(() => new Date().getDate());
  const [mesConsulta, setMesConsulta] = useState<number>(() => new Date().getMonth() + 1);
  const [statusAniversario, setStatusAniversario] = useState<"todos" | "Ativo" | "Inativo">("todos");
  const [buscaAniversario, setBuscaAniversario] = useState("");
  const [diaFiltro, setDiaFiltro] = useState<number | null>(null); // null = todos os dias do mês

  // Queries de aniversariantes
  const { data: anivDia = [] } = trpc.clientes.aniversariantesDia.useQuery(
    { dia: diaConsulta, mes: mesConsulta, statusFiltro: statusAniversario !== "todos" ? statusAniversario : undefined },
    { enabled: true }
  );
  const { data: anivMes = [] } = trpc.clientes.aniversariantesMes.useQuery(
    { mes: mesAniversario, statusFiltro: statusAniversario !== "todos" ? statusAniversario : undefined },
    { enabled: abaAtiva === "aniversariantes" }
  );

  const utils = trpc.useUtils();

  // Query de origens
  const { data: origensData = [] } = trpc.origens.listar.useQuery();

  const { data, isLoading } = trpc.clientes.listar.useQuery({
    busca: busca || undefined,
    status: statusFiltro !== "todos" ? statusFiltro : undefined,
    vendedor: vendedorFiltro !== "todos" ? vendedorFiltro : undefined,
    origemId: origemFiltro ?? undefined,
    idadeMin: idadeMinFiltro ? Number(idadeMinFiltro) : undefined,
    idadeMax: idadeMaxFiltro ? Number(idadeMaxFiltro) : undefined,
    valorMin: valorMinFiltro ? Number(valorMinFiltro) : undefined,
    valorMax: valorMaxFiltro ? Number(valorMaxFiltro) : undefined,
    dataNascimentoInicio: dataNascInicioFiltro || undefined,
    dataNascimentoFim: dataNascFimFiltro || undefined,
    limit: PAGE_SIZE,
    offset: pagina * PAGE_SIZE,
  });

  const { data: vendedoresData } = trpc.clientes.listarVendedores.useQuery();
  const vendedores = vendedoresData || [];

  // Produtos cadastrados no banco
  const { data: todosProdutos = [] } = trpc.produtos.listar.useQuery();

  // Produtos do cliente sendo editado
  const { data: produtosDoCliente = [] } = trpc.produtos.listarDoCliente.useQuery(
    { clienteId: editandoId ?? 0 },
    { enabled: !!editandoId }
  );

  // Sincronizar produtos do cliente ao abrir edição
  // Usar JSON.stringify para evitar loop infinito com arrays
  const produtosDoClienteIds = produtosDoCliente.map((p: { id: number }) => p.id);
  const produtosDoClienteKey = JSON.stringify(produtosDoClienteIds);
  useEffect(() => {
    if (editandoId) {
      setProdutosSelecionados(produtosDoClienteIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editandoId, produtosDoClienteKey]);

  const vincularProduto = trpc.produtos.vincular.useMutation();
  const desvincularProduto = trpc.produtos.desvincular.useMutation();

  const clientes = data?.clientes || [];
  const total = data?.total || 0;
  const ativos = data?.ativos || 0;
  const inativos = data?.inativos || 0;
  const somaContribuicao = data?.somaContribuicao || 0;
  const somaComissao = data?.somaComissao || 0;
  const somaExpectativaComissao = data?.somaExpectativaComissao || 0;
  const totalPaginas = Math.ceil(total / PAGE_SIZE);

  const criarMutation = trpc.clientes.criar.useMutation({
    onSuccess: async (result: { insertId?: number } | unknown) => {
      // Vincular produtos ao novo cliente
      const novoId = (result as { insertId?: number })?.insertId;
      if (novoId && produtosSelecionados.length > 0) {
        for (const prodId of produtosSelecionados) {
          await vincularProduto.mutateAsync({ clienteId: novoId, produtoId: prodId });
        }
      }
      // Salvar vendedores do novo cliente
      if (novoId && vendedoresCliente.length > 0) {
        await salvarVendedoresMut.mutateAsync({ clienteId: novoId, vendedores: vendedoresCliente });
      }
      utils.clientes.listar.invalidate();
      utils.clientes.listarVendedores.invalidate();
      // Guardar dados para oferecer e-mail de boas-vindas
      const nomeNovo = form.nome;
      const emailNovo = form.email;
      setModalAberto(false);
      setForm(formVazio);
      setProdutosSelecionados([]);
      toast.success("Cliente criado com sucesso!");
      // Oferecer WhatsApp de boas-vindas se tiver celular cadastrado
      const celularNovo = form.celular || form.telefone;
      if (celularNovo) {
        const primeiroNomeWa = nomeNovo.split(" ")[0];
        setWhatsBoasVindasCliente({ nome: nomeNovo, telefone: celularNovo });
        setWhatsBoasVindasForm({
          telefone: celularNovo,
          mensagem: `Olá, ${primeiroNomeWa}! Seja bem-vindo(a) à família Barcellos Seguros! 😊\n\nEstamos muito felizes em ter você conosco e prontos para caminhar ao seu lado, garantindo a proteção e a tranquilidade que você merece.\n\n▶️ Assista ao nosso vídeo de boas-vindas:\nhttps://1drv.ms/v/c/dacf5f11498c58d8/IQDYWIxJEV_PIIDaJpgAAAAAAREI-MGG9ijjoN1B3qvhkXs?e=GAe8gv\n\n📱 Acompanhe-nos: @barcellosseguros\n⭐ Avalie: www.barcellosseguros.com.br\n✨ Agradecemos pela confiança! Afinal, quem ama protege.\n\nEquipe Barcellos Seguros 📞 (48) 3372-6890`,
        });
      }
      // Oferecer e-mail de boas-vindas se tiver e-mail cadastrado
      if (emailNovo) {
        const primeiroNome = nomeNovo.split(" ")[0];
        setBoasVindasCliente({ nome: nomeNovo, email: emailNovo });
        setBoasVindasForm({
          destinatario: emailNovo,
          assunto: `Bem-vindo(a) à família Barcellos Seguros, ${primeiroNome}!`,
          corpo: `<p>Olá, <strong>${nomeNovo}</strong>! Seja bem-vindo(a) à família Barcellos Seguros!</p>\n<p>Estamos muito felizes em ter você conosco e prontos para caminhar ao seu lado, garantindo a proteção e a tranquilidade que você merece.</p>\n<p>Preparamos uma mensagem especial para você:</p>\n<p style="text-align:center"><a href="https://1drv.ms/v/c/dacf5f11498c58d8/IQDYWIxJEV_PIIDaJpgAAAAAAREI-MGG9ijjoN1B3qvhkXs?e=GAe8gv" style="display:inline-block;background:#1e3a5f;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">▶ Assistir ao vídeo de boas-vindas</a></p>\n<p>📱 Acompanhe-nos e fique por dentro de tudo:<br/><strong>Instagram:</strong> @barcellosseguros</p>\n<p>⭐ Avalie nossos serviços: <a href="https://www.barcellosseguros.com.br/">www.barcellosseguros.com.br</a></p>\n<p>❓ Precisa de ajuda? Estamos sempre por aqui, no WhatsApp:<br/>📞 <strong>(48) 3372-6890</strong></p>\n<p>✨ Agradecemos pela confiança e estamos prontos para te apoiar em cada passo. Vamos juntos, sempre em busca do melhor para o seu futuro!</p>\n<p><em>Afinal, quem ama protege.</em></p>\n<p><strong>Equipe Barcellos Seguros</strong></p>`,
        });
      }
    },
    onError: (err) => toast.error("Erro ao criar cliente: " + err.message),
  });

  const atualizarMutation = trpc.clientes.atualizar.useMutation({
    onSuccess: async () => {
      // Sincronizar produtos: desvincular todos e revincular os selecionados
      if (editandoId) {
        const antigos = produtosDoCliente.map((p: { id: number }) => p.id);
        const paraRemover = antigos.filter((id: number) => !produtosSelecionados.includes(id));
        const paraAdicionar = produtosSelecionados.filter(id => !antigos.includes(id));
        for (const prodId of paraRemover) {
          await desvincularProduto.mutateAsync({ clienteId: editandoId, produtoId: prodId });
        }
        for (const prodId of paraAdicionar) {
          await vincularProduto.mutateAsync({ clienteId: editandoId, produtoId: prodId });
        }
      }
      utils.clientes.listar.invalidate();
      utils.produtos.listarDoCliente.invalidate({ clienteId: editandoId ?? 0 });
      setModalAberto(false);
      setEditandoId(null);
      setForm(formVazio);
      setProdutosSelecionados([]);
      toast.success("Cliente atualizado com sucesso!");
    },
    onError: (err) => toast.error("Erro ao atualizar cliente: " + err.message),
  });

  const excluirMutation = trpc.clientes.excluir.useMutation({
    onSuccess: () => {
      utils.clientes.listar.invalidate();
      setConfirmDeleteId(null);
      toast.success("Cliente excluído com sucesso!");
    },
    onError: (err) => toast.error("Erro ao excluir cliente: " + err.message),
  });

  const abrirNovo = () => {
    setEditandoId(null);
    setForm(formVazio);
    setProdutosSelecionados([]);
    setModalAberto(true);
  };

  const abrirEdicao = (c: typeof clientes[0]) => {
    setEditandoId(c.id);
    setForm({
      nome: c.nome || "",
      cpf: c.cpf || "",
      vendedor: c.vendedor || "",
      status: c.status || "Ativo",
      produtos: c.produtos || "",
      telefone: c.telefone || "",
      email: c.email || "",
      dataNascimento: c.dataNascimento ? new Date(c.dataNascimento).toISOString().substring(0, 10) : "",
      celular: (c as any).celular || "",
      endereco: (c as any).endereco || "",
      bairro: (c as any).bairro || "",
      cidade: (c as any).cidade || "",
      cep: (c as any).cep || "",
      observacao: c.observacao || "",
      taxaComissao: c.taxaComissao ? String(c.taxaComissao) : "",
      valorTotalComissao: c.valorTotalComissao ? String(c.valorTotalComissao) : "",
      valorComissao: c.valorComissao ? String(c.valorComissao) : "",
      origemId: (c as any).origemId || null,
    });
    setModalAberto(true);
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    // Validar percentuais de vendedores
    if (vendedoresCliente.length > 0) {
      const algumVazio = vendedoresCliente.some(v => !v.nomeVendedor.trim());
      if (algumVazio) { toast.error("Preencha o nome de todos os vendedores"); return; }
      if (Math.abs(totalPercentual - 100) > 0.01) {
        toast.error(`A soma dos percentuais deve ser 100%. Atual: ${totalPercentual.toFixed(1)}%`);
        return;
      }
    }
    const payload = {
      ...form,
      vendedor: vendedoresCliente.length > 0 ? vendedoresCliente[0].nomeVendedor : form.vendedor,
      taxaComissao: form.taxaComissao || undefined,
      valorTotalComissao: form.valorTotalComissao || undefined,
      valorComissao: form.valorComissao || undefined,
    };
    if (editandoId) {
      atualizarMutation.mutate({ id: editandoId, data: payload });
      // Salvar vendedores após atualizar cliente
      if (vendedoresCliente.length > 0) {
        await salvarVendedoresMut.mutateAsync({ clienteId: editandoId, vendedores: vendedoresCliente });
      }
    } else {
      criarMutation.mutate(payload);
      // Para novo cliente, vendedores serão salvos no onSuccess com o insertId
    }
  };

  const toggleProduto = (prodId: number) => {
    setProdutosSelecionados(prev =>
      prev.includes(prodId) ? prev.filter(id => id !== prodId) : [...prev, prodId]
    );
  };

  const resetFiltros = () => {
    setBusca("");
    setStatusFiltro("todos");
    setVendedorFiltro("todos");
    setProdutosFiltro([]);
    setOrigemFiltro(null);
    setIdadeMinFiltro("");
    setIdadeMaxFiltro("");
    setValorMinFiltro("");
    setValorMaxFiltro("");
    setDataNascInicioFiltro("");
    setDataNascFimFiltro("");
    setPagina(0);
  };

  const filtroAtivo = !!(busca || statusFiltro !== "todos" || vendedorFiltro !== "todos" || produtosFiltro.length > 0 || origemFiltro || idadeMinFiltro || idadeMaxFiltro || valorMinFiltro || valorMaxFiltro || dataNascInicioFiltro || dataNascFimFiltro);

  const toggleProdutoFiltro = (prodId: number) => {
    setProdutosFiltro(prev =>
      prev.includes(prodId) ? prev.filter(id => id !== prodId) : [...prev, prodId]
    );
    setPagina(0);
  };

  // Filtrar clientes por produtos (client-side, multi-seleção)
  const clientesFiltrados = produtosFiltro.length === 0
    ? clientes
    : clientes.filter(c => {
        const nomesProdutosFiltro = produtosFiltro.map(id =>
          todosProdutos.find((p: { id: number; descricao: string }) => p.id === id)?.descricao || ""
        );
        return nomesProdutosFiltro.some(nome =>
          ((c as any).produtosVinculados || c.produtos || "").toLowerCase().includes(nome.toLowerCase())
        );
      });

  const exportarAniversariantes = (modo: "dia" | "mes" = "dia") => {
    // Se modo=dia, exporta apenas os do dia/mês selecionado no banner; se modo=mes, exporta o mês inteiro da aba
    const lista = (modo === "dia" ? anivDia : anivMes) as any[];
    if (lista.length === 0) { toast.error("Nenhum aniversariante para exportar"); return; }
    const header = ["Dia", "Nome", "CPF", "Data Nascimento", "Telefone", "Celular", "Email", "Vendedor", "Status", "Produtos"];
    const csv = [header.join(";"), ...lista.map((a: any) => [
      a.dia || "",
      a.nome || "",
      a.cpf || "",
      a.dataNascimento ? fmtDate(a.dataNascimento) : "",
      a.telefone || "",
      a.celular || "",
      a.email || "",
      a.vendedor || "",
      a.status || "",
      (a.produtos || "").replace(/;/g, ","),
    ].join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const nomeArq = modo === "dia"
      ? `aniversariantes_${diaConsulta.toString().padStart(2,"0")}_${mesConsulta.toString().padStart(2,"0")}_${new Date().getFullYear()}.csv`
      : `aniversariantes_${MESES_NOMES[mesAniversario]}_${new Date().getFullYear()}.csv`;
    link.download = nomeArq;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${lista.length} aniversariante${lista.length !== 1 ? "s" : ""} exportado${lista.length !== 1 ? "s" : ""}!`);
  };

  const exportarExcel = () => {
    const XLSX = (window as any).__XLSX__ || (typeof require !== 'undefined' ? require('xlsx') : null);
    // Usar abordagem CSV com extensão xlsx para compatibilidade
    const rows = clientesFiltrados.map((c: any) => ({
      "Nome": c.nome || "",
      "CPF": c.cpf || "",
      "Vendedor": c.vendedor || "",
      "Origem": (origensData as any[]).find((o: any) => o.id === c.origemId)?.nome || "",
      "Status": c.status || "",
      "Produtos": (c.produtosVinculados || c.produtos || "").replace(/;/g, ", "),
      "Telefone": c.telefone || "",
      "Celular": c.celular || "",
      "Email": c.email || "",
      "Data Nascimento": c.dataNascimento ? fmtDate(c.dataNascimento) : "",
      "Contribuição": c.contribuicao ? Number(c.contribuicao).toFixed(2) : c.valorTotalComissao ? Number(c.valorTotalComissao).toFixed(2) : "",
      "Comissão": c.valorComissao ? Number(c.valorComissao).toFixed(2) : "",
      "Taxa Comissão": c.taxaComissao ? `${(Number(c.taxaComissao) * 100).toFixed(1)}%` : "",
      "Endereço": c.endereco || "",
      "Bairro": c.bairro || "",
      "Cidade": c.cidade || "",
    }));
    import('xlsx').then(({ default: XLSXLib }) => {
      const ws = XLSXLib.utils.json_to_sheet(rows);
      const wb = XLSXLib.utils.book_new();
      XLSXLib.utils.book_append_sheet(wb, ws, "Clientes");
      XLSXLib.writeFile(wb, `clientes_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success(`${rows.length} clientes exportados!`);
    }).catch(() => {
      // Fallback CSV
      const header = Object.keys(rows[0] || {});
      const csv = [header.join(";"), ...rows.map(r => header.map(h => (r as any)[h]).join(";"))].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `clientes.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Exportado como CSV!");
    });
  };

  const exportarPDF = () => {
    import('jspdf').then(({ default: jsPDF }) => {
      import('jspdf-autotable').then(() => {
        const doc = new (jsPDF as any)({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(14);
        doc.setTextColor(30, 64, 175);
        doc.text('Barcellos Seguros — Base de Clientes', 14, 15);
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} — ${clientesFiltrados.length} clientes`, 14, 22);
        const head = [['Nome', 'CPF', 'Vendedor', 'Origem', 'Status', 'Produtos', 'Contribuição', 'Comissão', 'Data Nasc.']];
        const body = clientesFiltrados.map((c: any) => [
          c.nome || '',
          c.cpf || '',
          c.vendedor || '',
          (origensData as any[]).find((o: any) => o.id === c.origemId)?.nome || '',
          c.status || '',
          (c.produtosVinculados || c.produtos || '').substring(0, 40),
          c.contribuicao ? fmt(Number(c.contribuicao)) : c.valorTotalComissao ? fmt(Number(c.valorTotalComissao)) : '',
          c.valorComissao ? fmt(Number(c.valorComissao)) : '',
          c.dataNascimento ? fmtDate(c.dataNascimento) : '',
        ]);
        (doc as any).autoTable({
          head, body, startY: 27,
          styles: { fontSize: 7, cellPadding: 2 },
          headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 247, 255] },
        });
        const pageCount = (doc as any).internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setFontSize(7);
          doc.setTextColor(150);
          doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.getWidth() - 30, doc.internal.pageSize.getHeight() - 5);
        }
        doc.save(`clientes_${new Date().toISOString().split('T')[0]}.pdf`);
        toast.success('PDF gerado!');
      });
    });
  };

  return (
    <AppLayout>
      <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Base de Clientes</h1>
          <p className="text-muted-foreground text-sm">Carteira completa de clientes da Barcellos Seguros</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {abaAtiva === "clientes" ? (
            <>
              <Button variant="outline" onClick={exportarExcel} className="gap-2 border-green-400 text-green-700 hover:bg-green-50">
                <Download className="h-4 w-4" /> Excel
              </Button>
              <Button variant="outline" onClick={exportarPDF} className="gap-2 border-red-400 text-red-700 hover:bg-red-50">
                <Download className="h-4 w-4" /> PDF
              </Button>
              <Button onClick={abrirNovo} className="gap-2">
                <Plus className="h-4 w-4" />
                Novo Cliente
              </Button>
            </>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => exportarAniversariantes("dia")} className="gap-2">
                <Download className="h-4 w-4" /> Exportar Dia
              </Button>
              <Button variant="outline" onClick={() => exportarAniversariantes("mes")} className="gap-2">
                <Download className="h-4 w-4" /> Exportar Mês
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Alerta de aniversariantes do dia */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
        {/* Cabeçalho com seletor de dia */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-100 rounded-lg">
              <PartyPopper className="h-4 w-4 text-amber-600" />
            </div>
            <p className="font-semibold text-amber-800 text-sm">
              {anivDia.length === 0
                ? `Nenhum aniversariante em ${diaConsulta.toString().padStart(2,"0")}/${mesConsulta.toString().padStart(2,"0")}`
                : anivDia.length === 1
                  ? `🎂 1 aniversariante — ${diaConsulta.toString().padStart(2,"0")}/${mesConsulta.toString().padStart(2,"0")}`
                  : `🎂 ${anivDia.length} aniversariantes — ${diaConsulta.toString().padStart(2,"0")}/${mesConsulta.toString().padStart(2,"0")}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <label className="text-xs text-amber-700 font-medium">Dia:</label>
              <select
                value={diaConsulta}
                onChange={e => setDiaConsulta(Number(e.target.value))}
                className="text-xs border border-amber-300 rounded px-2 py-1 bg-white text-amber-900 font-semibold"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d.toString().padStart(2, "0")}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-amber-700 font-medium">Mês:</label>
              <select
                value={mesConsulta}
                onChange={e => setMesConsulta(Number(e.target.value))}
                className="text-xs border border-amber-300 rounded px-2 py-1 bg-white text-amber-900 font-semibold"
              >
                {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            {(diaConsulta !== diaHoje || mesConsulta !== mesHoje) && (
              <button
                onClick={() => { setDiaConsulta(diaHoje); setMesConsulta(mesHoje); }}
                className="text-xs text-amber-700 hover:text-amber-900 underline"
              >
                Hoje
              </button>
            )}
            <button
              onClick={() => setAbaAtiva("aniversariantes")}
              className="text-xs text-amber-700 hover:text-amber-900 underline"
            >
              Ver todos do mês
            </button>
          </div>
        </div>
        {anivDia.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {anivDia.map((a: any) => (
              <div key={a.id} className="bg-white border border-amber-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Cake className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="font-semibold text-amber-900 text-sm truncate" title={a.nome}>{a.nome}</span>
                </div>
                <div className="space-y-1">
                  {/* Telefone fixo */}
                  {a.telefone ? (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                      <a href={`tel:${a.telefone}`} className="text-xs text-blue-600 hover:underline">{a.telefone}</a>
                      <span className="text-xs text-muted-foreground">(fixo)</span>
                    </div>
                  ) : null}
                  {/* Celular / WhatsApp */}
                  {a.celular ? (
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3 text-green-600 shrink-0" />
                      <a href={`tel:${a.celular}`} className="text-xs text-blue-600 hover:underline">{a.celular}</a>
                      <a
                        href={`https://wa.me/55${a.celular.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 bg-green-100 text-green-700 hover:bg-green-200 text-xs px-1.5 py-0.5 rounded-full transition-colors"
                      >
                        WA
                      </a>
                    </div>
                  ) : null}
                  {/* Email */}
                  {a.email ? (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                      <a href={`mailto:${a.email}`} className="text-xs text-blue-600 hover:underline truncate" title={a.email}>{a.email}</a>
                    </div>
                  ) : null}
                  {/* Sem contato */}
                  {!a.telefone && !a.celular && !a.email && (
                    <p className="text-xs text-muted-foreground italic">Sem dados de contato</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setAbaAtiva("clientes")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            abaAtiva === "clientes" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" /> Base de Clientes
        </button>
        <button
          onClick={() => setAbaAtiva("aniversariantes")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            abaAtiva === "aniversariantes" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Cake className="h-4 w-4" /> Aniversariantes
          {anivDia.length > 0 && (
            <span className="bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
              {anivDia.length}
            </span>
          )}
        </button>
      </div>

      {/* Conteúdo da aba Aniversariantes */}
      {abaAtiva === "aniversariantes" && (
        <div className="space-y-4">
          {/* Seletor de mês */}
          <div className="flex items-center gap-3 flex-wrap">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Aniversariantes de:</span>
            <div className="flex gap-1 flex-wrap">
              {MESES_NOMES.slice(1).map((m, i) => (
                <button
                  key={i + 1}
                  onClick={() => setMesAniversario(i + 1)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    mesAniversario === i + 1
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {m.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Filtro de status */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-foreground">Exibir:</span>
            <div className="flex gap-1">
              {(["todos", "Ativo", "Inativo"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusAniversario(s)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
                    statusAniversario === s
                      ? s === "Ativo" ? "bg-green-600 text-white border-green-600"
                        : s === "Inativo" ? "bg-red-500 text-white border-red-500"
                        : "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
                  }`}
                >
                  {s === "todos" ? "Todos" : s === "Ativo" ? "✓ Ativos" : "✗ Inativos"}
                </button>
              ))}
            </div>
          </div>

          {/* Cards de resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <Cake className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-amber-700">Total no mês</p>
                    <p className="text-2xl font-bold text-amber-800">{anivMes.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Phone className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Com telefone</p>
                    <p className="text-2xl font-bold text-green-600">
                      {anivMes.filter((a: any) => a.telefone || a.celular).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Mail className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Com email</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {anivMes.filter((a: any) => a.email).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className={mesAniversario === mesHoje ? "border-amber-300 bg-amber-50" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <PartyPopper className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Hoje</p>
                    <p className="text-2xl font-bold text-orange-600">{anivDia.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabela de aniversariantes */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  <Cake className="h-4 w-4 text-amber-500" />
                  Aniversariantes de {MESES_NOMES[mesAniversario]}
                  {mesAniversario === mesHoje && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Mês atual</Badge>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Filtro por dia */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Dia:</span>
                    <select
                      value={diaFiltro ?? ""}
                      onChange={e => setDiaFiltro(e.target.value ? Number(e.target.value) : null)}
                      className="text-xs border rounded px-2 py-1 bg-background text-foreground"
                    >
                      <option value="">Todos</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={d}>{String(d).padStart(2, "0")}</option>
                      ))}
                    </select>
                  </div>
                  {/* Busca por nome */}
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Buscar por nome..."
                      value={buscaAniversario}
                      onChange={e => setBuscaAniversario(e.target.value)}
                      className="text-xs border rounded pl-7 pr-3 py-1 bg-background text-foreground w-44 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {anivMes.length === 0 ? (
                <div className="text-center p-12 text-muted-foreground">
                  <Cake className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>Nenhum aniversariante em {MESES_NOMES[mesAniversario]}</p>
                  <p className="text-xs mt-1">Clientes sem data de nascimento cadastrada não aparecem aqui</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium w-10">Dia</th>
                        <th className="text-left p-3 font-medium">Nome</th>
                        <th className="text-left p-3 font-medium">Telefone</th>
                        <th className="text-left p-3 font-medium">Celular / WhatsApp</th>
                        <th className="text-left p-3 font-medium">Email</th>
                        <th className="text-left p-3 font-medium">Vendedor</th>
                        <th className="text-left p-3 font-medium">Status</th>
                        <th className="text-left p-3 font-medium">Enviar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {anivMes
                        .filter((a: any) => {
                          if (diaFiltro !== null && a.dia !== diaFiltro) return false;
                          if (buscaAniversario.trim()) {
                            const termo = buscaAniversario.toLowerCase();
                            if (!a.nome?.toLowerCase().includes(termo)) return false;
                          }
                          return true;
                        })
                        .map((a: any) => {
                        const isHoje = a.dia === diaHoje && mesAniversario === mesHoje;
                        return (
                          <tr
                            key={a.id}
                            className={`border-b transition-colors ${
                              isHoje ? "bg-amber-50 hover:bg-amber-100" : "hover:bg-muted/30"
                            }`}
                          >
                            <td className="p-3">
                              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                                isHoje ? "bg-amber-500 text-white" : "bg-muted text-foreground"
                              }`}>
                                {a.dia}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5">
                                {isHoje && <Cake className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                                <span className={`font-medium ${isHoje ? "text-amber-800" : "text-foreground"}`}>{a.nome}</span>
                              </div>
                              {a.dataNascimento && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {fmtDate(a.dataNascimento)}
                                </p>
                              )}
                            </td>
                            <td className="p-3">
                              {a.telefone ? (
                                <a href={`tel:${a.telefone}`} className="text-blue-600 hover:underline text-sm">{a.telefone}</a>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="p-3">
                              {a.celular ? (
                                <div className="flex items-center gap-2">
                                  <a href={`tel:${a.celular}`} className="text-blue-600 hover:underline text-sm">{a.celular}</a>
                                  <a
                                    href={`https://wa.me/55${a.celular.replace(/\D/g, "")}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 bg-green-100 text-green-700 hover:bg-green-200 text-xs px-2 py-0.5 rounded-full transition-colors"
                                  >
                                    <Phone className="h-3 w-3" /> WhatsApp
                                  </a>
                                </div>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="p-3">
                              {a.email ? (
                                <a href={`mailto:${a.email}`} className="text-blue-600 hover:underline text-sm flex items-center gap-1">
                                  <Mail className="h-3 w-3" />{a.email}
                                </a>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="p-3">
                              {a.vendedor ? <Badge variant="outline" className="text-xs">{a.vendedor}</Badge> : "—"}
                            </td>
                            <td className="p-3">
                              <Badge className={`text-xs ${
                                a.status === "Ativo" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                              }`}>{a.status || "—"}</Badge>
                            </td>
                            <td className="p-3">
                              <EnviarAniversarioBtn clienteId={a.id} nome={a.nome} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Conteúdo da aba Clientes (oculto quando aniversariantes está ativo) */}
      {abaAtiva === "clientes" && (
      <>
      {/* Totalizadores dinâmicos */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-bold text-foreground">{total.toLocaleString("pt-BR")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <UserCheck className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ativos</p>
                <p className="text-xl font-bold text-green-600">{ativos.toLocaleString("pt-BR")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <UserX className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Inativos</p>
                <p className="text-xl font-bold text-red-500">{inativos.toLocaleString("pt-BR")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-2 lg:col-span-1">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <DollarSign className="h-4 w-4 text-indigo-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Contribuição Total</p>
                <p className="text-base font-bold text-foreground">{fmt(somaContribuicao)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <TrendingUp className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Comissão Total</p>
                <p className="text-base font-bold text-orange-600">{fmt(somaComissao)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Percent className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Expectativa Comissão</p>
                <p className="text-base font-bold text-purple-600">{fmt(somaExpectativaComissao)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

          {filtroAtivo && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-4 py-2">
          <span className="font-medium text-foreground">Filtro ativo:</span>
          {busca && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded">Busca: "{busca}"</span>}
          {statusFiltro !== "todos" && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded">Status: {statusFiltro}</span>}
          {vendedorFiltro !== "todos" && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded">Vendedor: {vendedorFiltro}</span>}
          {produtosFiltro.map(id => {
            const prod = todosProdutos.find((p: { id: number; descricao: string }) => p.id === id);
            return prod ? (
              <span key={id} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded flex items-center gap-1">
                {prod.descricao.length > 30 ? prod.descricao.substring(0, 30) + "…" : prod.descricao}
                <button onClick={() => toggleProdutoFiltro(id)} className="hover:text-blue-900"><X className="h-3 w-3" /></button>
              </span>
            ) : null;
          })}
          <span className="text-muted-foreground">— os totalizadores acima refletem apenas os registros filtrados</span>
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, CPF..."
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setPagina(0); }}
                className="pl-9"
              />
            </div>

            <Select value={vendedorFiltro} onValueChange={(v) => { setVendedorFiltro(v); setPagina(0); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Vendedores</SelectItem>
                {vendedores.map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filtro por produto — multi-seleção */}
            <div className="relative" ref={filtroProdutoRef}>
              <button
                type="button"
                onClick={() => setFiltroProdutoAberto(v => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors w-[220px] ${
                  produtosFiltro.length > 0
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-input bg-background text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <Package className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left truncate">
                  {produtosFiltro.length === 0
                    ? "Filtrar por Produto"
                    : `${produtosFiltro.length} produto${produtosFiltro.length > 1 ? "s" : ""} selecionado${produtosFiltro.length > 1 ? "s" : ""}`
                  }
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              </button>
              {filtroProdutoAberto && (
                <div className="absolute top-full left-0 mt-1 z-50 w-[320px] bg-background border rounded-md shadow-lg">
                  <div className="p-2 border-b flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Selecione os produtos</span>
                    {produtosFiltro.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { setProdutosFiltro([]); setPagina(0); }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Limpar ({produtosFiltro.length})
                      </button>
                    )}
                  </div>
                  <div className="p-2 border-b">
                    <input
                      type="text"
                      placeholder="Buscar produto..."
                      value={buscaProduto}
                      onChange={e => setBuscaProduto(e.target.value)}
                      className="w-full text-xs px-2 py-1.5 border rounded bg-background text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto p-2 space-y-0.5">
                    {todosProdutos.filter((p: { id: number; codigo: string; descricao: string }) => {
                      if (!buscaProduto) return true;
                      const b = buscaProduto.toLowerCase();
                      return p.codigo.toLowerCase().includes(b) || p.descricao.toLowerCase().includes(b);
                    }).map((p: { id: number; codigo: string; descricao: string }) => (
                      <label
                        key={p.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                          produtosFiltro.includes(p.id)
                            ? "bg-blue-50 text-blue-700"
                            : "hover:bg-muted/50 text-foreground"
                        }`}
                      >
                        <Checkbox
                          checked={produtosFiltro.includes(p.id)}
                          onCheckedChange={() => toggleProdutoFiltro(p.id)}
                          className="shrink-0"
                        />
                        <span className="font-mono text-muted-foreground mr-1">[{p.codigo}]</span>
                        <span className="flex-1">{p.descricao.length > 40 ? p.descricao.substring(0, 40) + "…" : p.descricao}</span>
                      </label>
                    ))}
                  </div>
                  <div className="p-2 border-t">
                    <button
                      type="button"
                      onClick={() => { setFiltroProdutoAberto(false); setBuscaProduto(""); }}
                      className="w-full text-xs text-center py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      Aplicar filtro
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {[
                { val: "todos", label: "Todos" },
                { val: "Ativo", label: "Ativos" },
                { val: "Inativo", label: "Inativos" },
              ].map((s) => (
                <button
                  key={s.val}
                  onClick={() => { setStatusFiltro(s.val); setPagina(0); }}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    statusFiltro === s.val
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {filtroAtivo && (
              <Button variant="ghost" size="sm" onClick={resetFiltros} className="text-muted-foreground">
                Limpar filtros
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiltrosAvancadosAbertos(v => !v)}
              className={`gap-2 ${filtrosAvancadosAbertos ? "border-primary text-primary bg-primary/5" : ""}`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtros Avançados
              {(origemFiltro || idadeMinFiltro || idadeMaxFiltro || valorMinFiltro || valorMaxFiltro || dataNascInicioFiltro || dataNascFimFiltro) && (
                <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                  {[origemFiltro, idadeMinFiltro, idadeMaxFiltro, valorMinFiltro, valorMaxFiltro, dataNascInicioFiltro, dataNascFimFiltro].filter(Boolean).length}
                </span>
              )}
            </Button>
          </div>

          {/* Painel de filtros avançados */}
          {filtrosAvancadosAbertos && (
            <div className="mt-3 pt-3 border-t grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* Origem */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Origem</label>
                <Select
                  value={origemFiltro ? String(origemFiltro) : "todos"}
                  onValueChange={(v) => { setOrigemFiltro(v === "todos" ? null : Number(v)); setPagina(0); }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todas as origens" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as origens</SelectItem>
                    {(origensData as any[]).map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ background: o.cor }} />
                          {o.nome}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Faixa de Idade */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Idade (anos)</label>
                <div className="flex gap-1">
                  <Input
                    type="number"
                    placeholder="Mín"
                    value={idadeMinFiltro}
                    onChange={e => { setIdadeMinFiltro(e.target.value); setPagina(0); }}
                    className="h-8 text-xs"
                  />
                  <Input
                    type="number"
                    placeholder="Máx"
                    value={idadeMaxFiltro}
                    onChange={e => { setIdadeMaxFiltro(e.target.value); setPagina(0); }}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Faixa de Valor (Contribuição) */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Contribuição (R$)</label>
                <div className="flex gap-1">
                  <Input
                    type="number"
                    placeholder="Mín"
                    value={valorMinFiltro}
                    onChange={e => { setValorMinFiltro(e.target.value); setPagina(0); }}
                    className="h-8 text-xs"
                  />
                  <Input
                    type="number"
                    placeholder="Máx"
                    value={valorMaxFiltro}
                    onChange={e => { setValorMaxFiltro(e.target.value); setPagina(0); }}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Data de Nascimento */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Data de Nascimento</label>
                <div className="flex gap-1">
                  <Input
                    type="date"
                    value={dataNascInicioFiltro}
                    onChange={e => { setDataNascInicioFiltro(e.target.value); setPagina(0); }}
                    className="h-8 text-xs"
                    title="De"
                  />
                  <Input
                    type="date"
                    value={dataNascFimFiltro}
                    onChange={e => { setDataNascFimFiltro(e.target.value); setPagina(0); }}
                    className="h-8 text-xs"
                    title="Até"
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">
            {isLoading ? "Carregando..." : `${total.toLocaleString("pt-BR")} clientes encontrados`}
          </CardTitle>
          {totalPaginas > 1 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Página {pagina + 1} de {totalPaginas}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={pagina >= totalPaginas - 1} onClick={() => setPagina(p => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Nome</th>
                  <th className="text-left p-3 font-medium">CPF</th>
                  <th className="text-left p-3 font-medium">Vendedor</th>
                  <th className="text-left p-3 font-medium">Produtos</th>
                  <th className="text-right p-3 font-medium">Contribuição</th>
                  <th className="text-right p-3 font-medium">Comissão</th>
                  <th className="text-right p-3 font-medium">Taxa Comissão</th>
                  <th className="text-center p-3 font-medium">Status</th>
                  <th className="text-center p-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="text-center p-8 text-muted-foreground">Carregando clientes...</td>
                  </tr>
                ) : clientesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center p-8 text-muted-foreground">Nenhum cliente encontrado</td>
                  </tr>
                ) : (
                  clientesFiltrados.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium">{c.nome}</td>
                      <td className="p-3 text-muted-foreground font-mono text-xs">{c.cpf || "—"}</td>
                      <td className="p-3">
                        {c.vendedor ? (
                          <Badge variant="outline" className="text-xs">{c.vendedor}</Badge>
                        ) : "—"}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs max-w-[180px] truncate" title={(c as any).produtosVinculados || c.produtos || ""}>
                        {(c as any).produtosVinculados || (c.produtos && c.produtos !== "nan" ? c.produtos : null) || "—"}
                      </td>
                      <td className="p-3 text-right font-medium text-foreground">
                        {c.contribuicao ? fmt(Number(c.contribuicao)) : c.valorTotalComissao ? fmt(Number(c.valorTotalComissao)) : "—"}
                      </td>
                      <td className="p-3 text-right font-medium text-orange-600">
                        {c.valorComissao ? fmt(Number(c.valorComissao)) : "—"}
                      </td>
                      <td className="p-3 text-right text-purple-600 font-medium">
                        {c.taxaComissao ? fmtPct(c.taxaComissao) : "—"}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => atualizarMutation.mutate({ id: c.id, data: { status: c.status === "Ativo" ? "Inativo" : "Ativo" } })}
                          title="Clique para alternar status"
                        >
                          <Badge
                            className={`text-xs cursor-pointer transition-opacity hover:opacity-70 ${
                              c.status === "Ativo"
                                ? "bg-green-100 text-green-700 hover:bg-green-100"
                                : "bg-red-100 text-red-700 hover:bg-red-100"
                            }`}
                          >
                            {c.status}
                          </Badge>
                        </button>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEdicao(c)} title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => setConfirmDeleteId(c.id)} title="Excluir">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação inferior */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between p-4 border-t text-sm text-muted-foreground">
              <span>Exibindo {pagina * PAGE_SIZE + 1}–{Math.min((pagina + 1) * PAGE_SIZE, total)} de {total.toLocaleString("pt-BR")} clientes</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                </Button>
                <Button variant="outline" size="sm" disabled={pagina >= totalPaginas - 1} onClick={() => setPagina(p => p + 1)}>
                  Próxima <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Criação/Edição */}
      <Dialog open={modalAberto} onOpenChange={(open) => { setModalAberto(open); if (!open) { setEditandoId(null); setForm(formVazio); setProdutosSelecionados([]); } }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoId ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Nome *</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo" />
              </div>
              <div className="space-y-1">
                <Label>CPF</Label>
                <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" />
              </div>
              <div className="space-y-1">
                <Label>Data de Nascimento</Label>
                <Input type="date" value={form.dataNascimento} onChange={(e) => setForm({ ...form, dataNascimento: e.target.value })} />
              </div>
              {/* Gerenciador de Múltiplos Vendedores */}
              <div className="col-span-2 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    Vendedores
                    {vendedoresCliente.length > 0 && (
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                        Math.abs(totalPercentual - 100) < 0.01 ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                      }`}>{totalPercentual.toFixed(0)}%</span>
                    )}
                  </Label>
                  {vendedoresCliente.filter(v => v.nomeVendedor !== "ELISIA").length < 2 && (
                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addVendedor}>
                      <Plus className="h-3 w-3 mr-1" /> Adicionar vendedor
                    </Button>
                  )}
                </div>
                {vendedoresCliente.length === 0 ? (
                  <div className="text-xs text-muted-foreground p-3 border rounded-md bg-muted/20 text-center">
                    Nenhum vendedor vinculado.
                    <button type="button" className="ml-1 text-primary underline" onClick={addVendedor}>Adicionar</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {vendedoresCliente.map((v, idx) => {
                      const isElisia = v.nomeVendedor === "ELISIA";
                      return (
                        <div key={idx} className={`flex items-center gap-2 p-2 border rounded-md ${isElisia ? "bg-primary/5 border-primary/20" : "bg-muted/10"}`}>
                          <div className="flex-1">
                            {isElisia ? (
                              <div className="h-8 px-3 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">auto</span>
                                ELISIA
                              </div>
                            ) : (
                              <Select value={v.nomeVendedor || "_vazio"} onValueChange={(val) => updateVendedor(idx, "nomeVendedor", val === "_vazio" ? "" : val)}>
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="Selecionar vendedor" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="_vazio">Selecionar...</SelectItem>
                                  {vendedores.filter(vv => vv !== "ELISIA" && !vendedoresCliente.some((vc, i) => i !== idx && vc.nomeVendedor === vv)).map((vv) => (
                                    <SelectItem key={vv} value={vv}>{vv}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                          <div className="w-24 flex items-center gap-1">
                            <Input
                              type="number" min={0} max={100} step={1}
                              value={v.percentual}
                              readOnly={isElisia}
                              onChange={e => !isElisia && updateVendedor(idx, "percentual", Number(e.target.value))}
                              className={`h-8 text-sm text-center ${isElisia ? "bg-muted/50 text-muted-foreground cursor-default" : ""}`}
                              placeholder="%"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                          {!isElisia ? (
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeVendedor(idx)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <div className="h-8 w-8" />
                          )}
                        </div>
                      );
                    })}
                    {vendedoresCliente.length > 1 && Math.abs(totalPercentual - 100) > 0.01 && (
                      <p className="text-xs text-orange-600">⚠️ A soma dos percentuais deve ser 100%. Atual: {totalPercentual.toFixed(1)}%</p>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Origem</Label>
                <Select
                  value={form.origemId ? String(form.origemId) : "__none__"}
                  onValueChange={(v) => setForm({ ...form, origemId: v && v !== "__none__" ? Number(v) : null })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a origem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem origem</SelectItem>
                    {(origensData as any[]).map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ background: o.cor }} />
                          {o.nome}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(00) 0000-0000" />
              </div>
              <div className="space-y-1">
                <Label>Celular</Label>
                <Input value={form.celular} onChange={(e) => setForm({ ...form, celular: e.target.value })} placeholder="(00) 00000-0000" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>E-mail</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@exemplo.com" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Endereço</Label>
                <Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} placeholder="Rua, número, complemento" />
              </div>
              <div className="space-y-1">
                <Label>Bairro</Label>
                <Input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} placeholder="Bairro" />
              </div>
              <div className="space-y-1">
                <Label>Cidade</Label>
                <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} placeholder="Cidade-UF" />
              </div>
              <div className="space-y-1">
                <Label>CEP</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.cep}
                    onChange={(e) => setForm({ ...form, cep: e.target.value })}
                    onBlur={(e) => buscarCep(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarCep(form.cep); } }}
                    placeholder="00000-000"
                    maxLength={9}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => buscarCep(form.cep)}
                    disabled={buscandoCep}
                    className="shrink-0 px-3"
                  >
                    {buscandoCep ? (
                      <span className="animate-spin text-xs">&#9696;</span>
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Pressione Enter ou clique na lupa para preencher o endereço</p>
              </div>

              {/* Seletor de Produtos */}
              <div className="col-span-2 space-y-2">
                <Label className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Produtos Vinculados
                  {produtosSelecionados.length > 0 && (
                    <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">{produtosSelecionados.length} selecionado{produtosSelecionados.length > 1 ? "s" : ""}</Badge>
                  )}
                </Label>

                {/* Badges dos produtos selecionados */}
                {produtosSelecionados.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-blue-50 border border-blue-200 rounded-md">
                    {produtosSelecionados.map(id => {
                      const prod = todosProdutos.find((p: { id: number; codigo: string; descricao: string }) => p.id === id);
                      if (!prod) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full font-medium"
                        >
                          <span className="opacity-75">[{prod.codigo}]</span>
                          {prod.descricao.length > 25 ? prod.descricao.substring(0, 25) + "…" : prod.descricao}
                          <button
                            type="button"
                            onClick={() => toggleProduto(id)}
                            className="ml-0.5 hover:bg-blue-700 rounded-full p-0.5"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Busca rápida de produto */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={buscaProdutoModal}
                    onChange={e => setBuscaProdutoModal(e.target.value)}
                    placeholder="Buscar por código ou nome..."
                    className="pl-8 h-8 text-xs"
                  />
                  {buscaProdutoModal && (
                    <button type="button" onClick={() => setBuscaProdutoModal('')} className="absolute right-2 top-2 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Lista de checkboxes */}
                <div className="border rounded-md max-h-44 overflow-y-auto bg-muted/20">
                  {todosProdutos.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Nenhum produto cadastrado. Importe um extrato para cadastrar produtos automaticamente.</p>
                  ) : (
                    <div className="divide-y">
                      {todosProdutos.filter((p: { id: number; codigo: string; descricao: string }) => {
                        if (!buscaProdutoModal) return true;
                        const b = buscaProdutoModal.toLowerCase();
                        return p.codigo?.toLowerCase().includes(b) || p.descricao?.toLowerCase().includes(b);
                      }).map((p: { id: number; codigo: string; descricao: string }) => (
                        <label
                          key={p.id}
                          htmlFor={`prod-${p.id}`}
                          className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                            produtosSelecionados.includes(p.id)
                              ? "bg-blue-50 text-blue-700"
                              : "hover:bg-muted/50 text-foreground"
                          }`}
                        >
                          <Checkbox
                            id={`prod-${p.id}`}
                            checked={produtosSelecionados.includes(p.id)}
                            onCheckedChange={() => toggleProduto(p.id)}
                            className="shrink-0"
                          />
                          <span className="text-xs font-mono text-muted-foreground shrink-0">[{p.codigo}]</span>
                          <span className="text-xs flex-1">{p.descricao}</span>
                          {produtosSelecionados.includes(p.id) && (
                            <span className="text-xs text-blue-600 font-medium shrink-0">✓</span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Selecione os produtos contratados por este cliente. Os selecionados aparecem como badges acima.</p>
              </div>

              {/* Campos financeiros */}
              <div className="col-span-2 border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Dados Financeiros</p>
              </div>
              <div className="space-y-1">
                <Label>Contribuição Mensal (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.valorTotalComissao}
                  onChange={(e) => setForm({ ...form, valorTotalComissao: e.target.value })}
                  placeholder="0,00"
                />
                <p className="text-xs text-muted-foreground">Valor total pago pelo cliente (prêmio)</p>
              </div>
              <div className="space-y-1">
                <Label>Comissão Recebida (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.valorComissao}
                  onChange={(e) => setForm({ ...form, valorComissao: e.target.value })}
                  placeholder="0,00"
                />
                <p className="text-xs text-muted-foreground">Comissão efetivamente recebida</p>
              </div>
              <div className="space-y-1">
                <Label>Taxa de Comissão</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    max="1"
                    value={form.taxaComissao}
                    onChange={(e) => setForm({ ...form, taxaComissao: e.target.value })}
                    placeholder="Ex: 0.30"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Fração decimal (ex: 0.30 = 30%). Usada para calcular a expectativa de comissão.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Expectativa de Comissão</Label>
                <div className="flex items-center h-10 px-3 rounded-md border bg-muted/40 text-sm font-medium text-purple-600">
                  {form.valorTotalComissao && form.taxaComissao
                    ? fmt(Number(form.valorTotalComissao) * Number(form.taxaComissao))
                    : form.valorComissao
                    ? fmt(Number(form.valorComissao))
                    : "—"}
                </div>
                <p className="text-xs text-muted-foreground">Calculado automaticamente</p>
              </div>

              <div className="col-span-2 space-y-1">
                <Label>Observação</Label>
                <Textarea value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} placeholder="Observações adicionais..." rows={3} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={criarMutation.isPending || atualizarMutation.isPending}>
              {criarMutation.isPending || atualizarMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de E-mail de Boas-Vindas */}
      <Dialog open={boasVindasCliente !== null} onOpenChange={(open) => { if (!open) setBoasVindasCliente(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-green-500" />
              Enviar E-mail de Boas-Vindas
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cliente <strong>{boasVindasCliente?.nome}</strong> criado com sucesso! Deseja enviar um e-mail de boas-vindas?
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>E-mail do destinatário *</Label>
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={boasVindasForm.destinatario}
                onChange={e => setBoasVindasForm(f => ({ ...f, destinatario: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Assunto *</Label>
              <Input
                value={boasVindasForm.assunto}
                onChange={e => setBoasVindasForm(f => ({ ...f, assunto: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Corpo do e-mail (HTML) *</Label>
              <Textarea
                value={boasVindasForm.corpo}
                onChange={e => setBoasVindasForm(f => ({ ...f, corpo: e.target.value }))}
                rows={7}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">O rodapé com endereço e link de cancelamento é adicionado automaticamente.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBoasVindasCliente(null)}>Pular</Button>
            <Button onClick={enviarBoasVindas} disabled={enviandoBoasVindas} className="gap-2 bg-green-600 hover:bg-green-700">
              {enviandoBoasVindas ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {enviandoBoasVindas ? "Enviando..." : "Enviar Boas-Vindas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de WhatsApp Boas-Vindas */}
      <Dialog open={whatsBoasVindasCliente !== null} onOpenChange={(open) => { if (!open) setWhatsBoasVindasCliente(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-green-600" />
              WhatsApp de Boas-Vindas
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Deseja enviar uma mensagem de boas-vindas no WhatsApp para <strong>{whatsBoasVindasCliente?.nome}</strong>?
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Número de WhatsApp *</Label>
              <Input
                type="tel"
                placeholder="(48) 99000-0000"
                value={whatsBoasVindasForm.telefone}
                onChange={e => setWhatsBoasVindasForm(f => ({ ...f, telefone: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Mensagem *</Label>
              <Textarea
                value={whatsBoasVindasForm.mensagem}
                onChange={e => setWhatsBoasVindasForm(f => ({ ...f, mensagem: e.target.value }))}
                rows={9}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">A mensagem será enviada automaticamente via WhatsApp (48) 99210-8365.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWhatsBoasVindasCliente(null)}>Pular</Button>
            <Button onClick={enviarWhatsBoasVindas} disabled={enviarWhatsBoasVindasMut.isPending} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
              {enviarWhatsBoasVindasMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
              {enviarWhatsBoasVindasMut.isPending ? "Enviando..." : "Enviar Agora"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão */}
      <Dialog open={confirmDeleteId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => confirmDeleteId && excluirMutation.mutate({ id: confirmDeleteId })} disabled={excluirMutation.isPending}>
              {excluirMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
      )}
    </div>
    </AppLayout>
  );
}

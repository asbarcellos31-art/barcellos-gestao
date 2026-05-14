import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  TrendingUp, DollarSign, Users, BarChart2, Plus, Pencil, Trash2,
  CheckCircle, XCircle, Target, Percent, Download, UserPlus, Database, Mail, Loader2, MessageSquare,
  Eye, Search, CheckCircle2, X, Package, AlertCircle, ShieldCheck, PhoneOff, Phone
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useAno } from "@/contexts/AnoContext";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MESES_ABREV = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const CORES = ["#1e3a5f", "#2d5a8e", "#3b82c6", "#60a5fa", "#93c5fd", "#bfdbfe"];
// Lista de corretores carregada dinamicamente do banco (fallback para os 3 padrão)

type VendaForm = {
  mes: number;
  ano: number;
  dataVenda: string;
  nomeCliente: string;
  cpfCliente: string;
  valorPremio: string;
  cpfNovo: string;
  valorComissao: string;
  comissaoPaga: string;
  implantada: string;
  corretor: string;
  produto: string;
  observacao: string;
  // Campos para envio à base e boas-vindas (v2)
  email: string;
  telefone: string;
  celular: string;
  dataNascimento: string;
  endereco: string;
  bairro: string;
  cidade: string;
  cep: string;
  origemId: number | null;
};
const formVazio = (mes: number, ano: number): VendaForm => ({
  mes, ano,
  dataVenda: "",
  nomeCliente: "",
  cpfCliente: "",
  valorPremio: "",
  cpfNovo: "NÃO",
  valorComissao: "",
  comissaoPaga: "",
  implantada: "NÃO",
  corretor: "",
  produto: "",
  observacao: "",
  email: "",
  telefone: "",
  celular: "",
  dataNascimento: "",
  endereco: "",
  bairro: "",
  cidade: "",
  cep: "",
});

export default function Vendas() {
  const { ano } = useAno();
  const [mesSel, setMesSel] = useState<number | null>(null);
  const [corretorFiltro, setCorretorFiltro] = useState<string>("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<VendaForm>(formVazio(mesSel || new Date().getMonth() + 1, ano));
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<"dashboard" | "lancamentos">("dashboard");
  const [emailVenda, setEmailVenda] = useState<{ id: number; nome: string } | null>(null);
  const [emailForm, setEmailForm] = useState({ destinatario: "", assunto: "", corpo: "" });
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [emailPreviewMode, setEmailPreviewMode] = useState<"preview" | "edit">("preview");

  // Busca por CPF
  const [cpfBuscando, setCpfBuscando] = useState(false);
  const [clienteEncontrado, setClienteEncontrado] = useState<boolean | null>(null);
  const cpfTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Produtos selecionados no modal de venda
  const [produtosSelecionados, setProdutosSelecionados] = useState<number[]>([]);
  const [buscaProdutoModal, setBuscaProdutoModal] = useState("");

  // Múltiplos vendedores por venda
  type VendedorVenda = { nomeVendedor: string; percentual: number };
  const [vendedoresVenda, setVendedoresVenda] = useState<VendedorVenda[]>([{ nomeVendedor: "", percentual: 100 }]);
  const totalPercentualVenda = vendedoresVenda.reduce((s, v) => s + (v.percentual || 0), 0);

  // Regra: qualquer vendedor ≠ ELISIA divide automaticamente com ELISIA (que fica com o restante)
  const aplicarRegraElisia = (lista: VendedorVenda[]): VendedorVenda[] => {
    const temNaoElisia = lista.some(v => v.nomeVendedor && v.nomeVendedor !== "ELISIA");
    if (!temNaoElisia) {
      // Só ELISIA ou vazio: garante que ELISIA fica com 100%
      return lista.map(v => v.nomeVendedor === "ELISIA" ? { ...v, percentual: 100 } : v);
    }
    // Há vendedor ≠ ELISIA: recalcular ELISIA como restante
    const semElisia = lista.filter(v => v.nomeVendedor !== "ELISIA");
    const somaOutros = semElisia.reduce((s, v) => s + (v.percentual || 0), 0);
    const restanteElisia = Math.max(0, 100 - somaOutros);
    return [...semElisia, { nomeVendedor: "ELISIA", percentual: restanteElisia }];
  };

  const adicionarVendedorVenda = () => {
    if (vendedoresVenda.length >= 3) return;
    // Adiciona novo vendedor com 50% e recalcula ELISIA
    const novaLista = aplicarRegraElisia([...vendedoresVenda.filter(v => v.nomeVendedor !== "ELISIA"), { nomeVendedor: "", percentual: 50 }]);
    setVendedoresVenda(novaLista);
  };
  const removerVendedorVenda = (idx: number) => {
    const novaLista = aplicarRegraElisia(vendedoresVenda.filter((_, i) => i !== idx));
    setVendedoresVenda(novaLista);
  };
  const atualizarVendedorVenda = (idx: number, campo: keyof VendedorVenda, valor: string | number) => {
    const atualizado = vendedoresVenda.map((v, i) => i === idx ? { ...v, [campo]: valor } : v);
    // Se mudou o nome para um vendedor ≠ ELISIA, aplicar regra
    if (campo === "nomeVendedor") {
      setVendedoresVenda(aplicarRegraElisia(atualizado));
    } else if (campo === "percentual") {
      // Ao mudar percentual de vendedor ≠ ELISIA, recalcular ELISIA
      const temNaoElisia = atualizado.some(v => v.nomeVendedor && v.nomeVendedor !== "ELISIA");
      if (temNaoElisia) {
        setVendedoresVenda(aplicarRegraElisia(atualizado));
      } else {
        setVendedoresVenda(atualizado);
      }
    } else {
      setVendedoresVenda(atualizado);
    }
  };

  // Busca de CEP no modal de venda
  const [buscandoCep, setBuscandoCep] = useState(false);

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

  const toggleProduto = (id: number) => {
    setProdutosSelecionados(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  // Validação em lote de números WhatsApp
  const [modalValidacaoAberto, setModalValidacaoAberto] = useState(false);
  const [resultadosValidacao, setResultadosValidacao] = useState<Array<{
    id: number; nome: string; celular: string; celularFormatado: string; temWhatsApp: boolean; erro?: string;
  }> | null>(null);
  const validarLoteMut = trpc.whatsapp.validarNumerosLote.useMutation({
    onSuccess: (data) => {
      setResultadosValidacao(data.resultados);
    },
    onError: (e) => toast.error(`Erro na validação: ${e.message}`),
  });

  function iniciarValidacaoLote() {
    const vendasComCelular = vendas
      .filter(v => (v as any).celular || (v as any).telefone)
      .slice(0, 50) // limitar a 50 por vez
      .map(v => ({
        id: v.id,
        nome: v.nomeCliente || "",
        celular: (v as any).celular || (v as any).telefone || "",
      }));
    if (vendasComCelular.length === 0) {
      toast.error("Nenhuma venda com celular cadastrado.");
      return;
    }
    setResultadosValidacao(null);
    setModalValidacaoAberto(true);
    validarLoteMut.mutate({ vendas: vendasComCelular });
  }

  // WhatsApp individual — disparo automático via Evolution API
  const [whatsVenda, setWhatsVenda] = useState<{ id: number; nome: string } | null>(null);
  const [whatsForm, setWhatsForm] = useState({ telefone: "", mensagem: "" });
  const [whatsErroNumero, setWhatsErroNumero] = useState<string | null>(null); // erro de número inválido
  const abrirWhatsapp = (v: typeof vendas[0]) => {
    const primeiroNome = (v.nomeCliente || "").split(" ")[0];
    const telCadastrado = (v as any).celular || (v as any).telefone || "";
    setWhatsVenda({ id: v.id, nome: v.nomeCliente || "" });
    setWhatsForm({
      telefone: telCadastrado,
      mensagem: `Olá, ${primeiroNome}! Seja bem-vindo(a) à família Barcellos Seguros! 😊\n\nEstamos muito felizes em ter você conosco e prontos para caminhar ao seu lado, garantindo a proteção e a tranquilidade que você merece.\n\n📱 Acompanhe-nos: @barcellosseguros\n⭐ Avalie: www.barcellosseguros.com.br\n✨ Agradecemos pela confiança! Afinal, quem ama protege.\n\nEquipe Barcellos Seguros 📞 (48) 99210-8365`,
    });
  };
  const utils = trpc.useUtils();
  const enviarWhatsappMut = trpc.whatsapp.enviarIndividual.useMutation({
    onSuccess: () => {
      toast.success(`Mensagem de boas-vindas enviada para ${whatsVenda?.nome}!`);
      setWhatsErroNumero(null);
      setWhatsVenda(null);
      utils.vendas.listar.invalidate();
    },
    onError: (e) => {
      const msg = e.message || "";
      if (msg.includes("não tem WhatsApp") || msg.includes("exists") || msg.includes("Bad Request")) {
        setWhatsErroNumero(msg);
      } else {
        toast.error("Erro ao enviar: " + msg);
      }
    },
  });
  const enviarWhatsappIndividual = () => {
    if (!whatsForm.telefone) {
      toast.error("Informe o número de WhatsApp do cliente");
      return;
    }
    enviarWhatsappMut.mutate({
      nome: whatsVenda?.nome,
      telefone: whatsForm.telefone,
      mensagem: whatsForm.mensagem,
      vendaId: whatsVenda?.id,
    });
  };

  // Busca automática por CPF
  const buscarClientePorCpfHandler = async (cpf: string) => {
    const cpfLimpo = cpf.replace(/\D/g, "");
    if (cpfLimpo.length < 11) {
      setClienteEncontrado(null);
      return;
    }
    setCpfBuscando(true);
    try {
      const resp = await fetch(`/api/trpc/clientes.buscarPorCpf?input=${encodeURIComponent(JSON.stringify({ json: { cpf: cpfLimpo } }))}`);
      const data = await resp.json();
      const cliente = data?.result?.data?.json ?? data?.result?.data;
      if (cliente) {
        setClienteEncontrado(true);
        setForm(f => ({
          ...f,
          nomeCliente: cliente.nome || f.nomeCliente,
          email: cliente.email || f.email,
          telefone: cliente.telefone || f.telefone,
          celular: cliente.celular || f.celular,
          dataNascimento: cliente.dataNascimento ? new Date(cliente.dataNascimento).toISOString().split('T')[0] : f.dataNascimento,
          endereco: cliente.endereco || f.endereco,
          bairro: cliente.bairro || f.bairro,
          cidade: cliente.cidade || f.cidade,
          cep: cliente.cep || f.cep,
        }));
        toast.success(`Cliente encontrado: ${cliente.nome}`);
      } else {
        setClienteEncontrado(false);
      }
    } catch {
      setClienteEncontrado(false);
    } finally {
      setCpfBuscando(false);
    }
  };

  const handleCpfChange = (cpf: string) => {
    setForm(f => ({ ...f, cpfCliente: cpf }));
    setClienteEncontrado(null);
    if (cpfTimerRef.current) clearTimeout(cpfTimerRef.current);
    const cpfLimpo = cpf.replace(/\D/g, "");
    if (cpfLimpo.length === 11) {
      cpfTimerRef.current = setTimeout(() => buscarClientePorCpfHandler(cpf), 500);
    }
  };

  const abrirEmail = (v: typeof vendas[0]) => {
    const primeiroNome = (v.nomeCliente || "").split(" ")[0];
    const emailCadastrado = (v as any).email || "";
    setEmailVenda({ id: v.id, nome: v.nomeCliente || "" });
    const nomeCompleto = v.nomeCliente || "";
    setEmailForm({
      destinatario: emailCadastrado,
      assunto: `Bem-vindo(a) \u00e0 Barcellos Seguros, ${primeiroNome}!`,
      corpo: `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>
  body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .header { background: #1e3a5f; padding: 24px 32px; text-align: center; }
  .header h1 { color: #fff; margin: 0; font-size: 22px; letter-spacing: 1px; }
  .header p { color: #a8c4e0; margin: 4px 0 0; font-size: 13px; }
  .body { padding: 32px; color: #333; line-height: 1.7; font-size: 15px; }
  .saudacao { font-size: 17px; font-weight: bold; color: #1e3a5f; margin-bottom: 16px; }
  .assinatura { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #555; font-size: 14px; white-space: pre-line; }
  .footer { background: #f8f9fa; padding: 16px 32px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #e5e7eb; }
  .btn { display:inline-block; background:#1e3a5f; color:#fff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:15px; }
</style></head>
<body>
<div class="container">
  <div class="header"><h1>Barcellos Seguros</h1><p>Cuidando de quem voc\u00ea ama</p></div>
  <div class="body">
    <div class="saudacao">Ol\u00e1, ${nomeCompleto}! Seja bem-vindo(a) \u00e0 fam\u00edlia Barcellos Seguros!</div>
    <p>Estamos muito felizes em ter voc\u00ea conosco e prontos para caminhar ao seu lado, garantindo a prote\u00e7\u00e3o e a tranquilidade que voc\u00ea merece.</p>
    <p>Preparamos uma mensagem especial para voc\u00ea:</p>
    <p style="text-align:center"><a class="btn" href="https://1drv.ms/v/c/dacf5f11498c58d8/IQDYWIxJEV_PIIDaJpgAAAAAAREI-MGG9ijjoN1B3qvhkXs?e=GAe8gv">&#9654; Assistir ao v\u00eddeo de boas-vindas</a></p>
    <p>&#128241; Acompanhe-nos e fique por dentro de tudo:<br/><strong>Instagram:</strong> @barcellosseguros</p>
    <p>&#11088; Avalie nossos servi\u00e7os: <a href="https://www.barcellosseguros.com.br/">www.barcellosseguros.com.br</a></p>
    <p>&#10067; Precisa de ajuda? Estamos sempre por aqui, no WhatsApp:<br/>&#128222; <strong>(48) 3372-6890</strong></p>
    <p>&#10024; Agradecemos pela confian\u00e7a e estamos prontos para te apoiar em cada passo. Vamos juntos, sempre em busca do melhor para o seu futuro!</p>
    <p><em>Afinal, quem ama protege.</em></p>
    <div class="assinatura">Atenciosamente,\nEquipe Barcellos Seguros\n(48) 3372-6890 | atendimento@barcellosseguros.com</div>
  </div>
  <div class="footer">Barcellos Seguros &bull; atendimento@barcellosseguros.com &bull; Florian\u00f3polis - SC</div>
</div>
</body></html>`,
    });
  };

  const enviarEmailIndividual = async () => {
    if (!emailForm.destinatario || !emailForm.assunto || !emailForm.corpo) {
      toast.error("Preencha destinatário, assunto e corpo do e-mail");
      return;
    }
    setEnviandoEmail(true);
    try {
      const resp = await fetch("/api/email-marketing/enviar-individual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinatario: emailForm.destinatario,
          destinatarioNome: emailVenda?.nome,
          assunto: emailForm.assunto,
          corpo: emailForm.corpo,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Erro ao enviar");
      toast.success(`E-mail enviado para ${emailForm.destinatario}!`);
      setEmailVenda(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEnviandoEmail(false);
    }
    };
  const { data: vendedoresAtivos = [] } = trpc.vendedoresCadastro.listarAtivos.useQuery();
  const CORRETORES: string[] = vendedoresAtivos.length > 0 ? vendedoresAtivos : ["ELISIA", "FERNANDA", "NAYARA"];
  const { data: dadosVendas, isLoading } = trpc.vendas.listar.useQuery({
    ano,
    mes: mesSel || undefined,
    corretor: corretorFiltro || undefined,
  });

  const { data: resumo } = trpc.vendas.resumoPorCorretor.useQuery({
    ano,
    mes: mesSel || undefined,
  });

  const { data: metricas } = trpc.vendas.metricas.useQuery({
    ano,
    mes: mesSel || undefined,
  });

  const { data: resumoMensal } = trpc.vendas.resumoMensal.useQuery({ ano });

  const vendas = dadosVendas?.vendas || [];
  const corretores = resumo || [];

  const m = metricas || { totalPropostas: 0, cpfNovos: 0, faturamento: 0, comissaoTotal: 0, ticketMedio: 0, comissoesPagas: 0, implantadas: 0 };

  const criarMutation = trpc.vendas.criar.useMutation({
    onSuccess: () => {
      utils.vendas.listar.invalidate();
      utils.vendas.resumoPorCorretor.invalidate();
      utils.vendas.metricas.invalidate();
      utils.vendas.resumoMensal.invalidate();
      setModalAberto(false);
      toast.success("Venda registrada com sucesso!");
    },
    onError: (err) => toast.error("Erro ao registrar venda: " + err.message),
  });

  const atualizarMutation = trpc.vendas.atualizar.useMutation({
    onSuccess: async () => {
      // Invalidar cache e refetch explícito para garantir dados atualizados
      await utils.vendas.listar.invalidate();
      utils.vendas.resumoPorCorretor.invalidate();
      utils.vendas.metricas.invalidate();
      utils.vendas.resumoMensal.invalidate();
      setModalAberto(false);
      setEditandoId(null);
      toast.success("Venda atualizada com sucesso!");
    },
    onError: (err) => toast.error("Erro ao atualizar venda: " + err.message),
  });

  const excluirMutation = trpc.vendas.excluir.useMutation({
    onSuccess: () => {
      utils.vendas.listar.invalidate();
      utils.vendas.resumoPorCorretor.invalidate();
      utils.vendas.metricas.invalidate();
      utils.vendas.resumoMensal.invalidate();
      setConfirmDeleteId(null);
      toast.success("Venda excluída com sucesso!");
    },
    onError: (err) => toast.error("Erro ao excluir venda: " + err.message),
  });

  const enviarParaBaseMutation = trpc.vendas.enviarParaBase.useMutation({
    onSuccess: (result) => {
      utils.vendas.listar.invalidate();
      if (result.acao === "criado") {
        toast.success("✅ Cliente cadastrado na Base de Clientes com sucesso!");
      } else {
        toast.success("✅ Cliente já existe na base — dados atualizados!");
      }
    },
    onError: (err) => toast.error("Erro ao enviar para base: " + err.message),
  });

  // Produtos cadastrados no banco
  const { data: todosProdutos = [] } = trpc.produtos.listar.useQuery();
  // Origens cadastradas no banco
  const { data: origensData = [] } = trpc.origens.listar.useQuery();

  const abrirNovo = () => {
    setEditandoId(null);
    setForm(formVazio(mesSel || new Date().getMonth() + 1, ano));
    setProdutosSelecionados([]);
    setBuscaProdutoModal("");
    setVendedoresVenda([{ nomeVendedor: "", percentual: 100 }]);
    setModalAberto(true);
  };

  const abrirEdicao = (v: typeof vendas[0]) => {
    setBuscaProdutoModal("");
    // Ao editar, pré-selecionar os produtos que já estão salvos na venda
    if (v.produto && (todosProdutos as any[]).length > 0) {
      const nomesSalvos = v.produto.split(",").map((s: string) => s.trim().toLowerCase());
      const idsSalvos = (todosProdutos as any[])
        .filter((p: any) => nomesSalvos.includes(p.descricao.toLowerCase()))
        .map((p: any) => p.id);
      setProdutosSelecionados(idsSalvos);
    } else {
      setProdutosSelecionados([]);
    }
    setEditandoId(v.id);
    setForm({
      mes: v.mes,
      ano: v.ano,
      dataVenda: v.dataVenda ? (() => { const d = new Date(v.dataVenda!); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`; })() : "",
      nomeCliente: v.nomeCliente || "",
      cpfCliente: v.cpfCliente || "",
      valorPremio: v.valorPremio ? String(v.valorPremio) : "",
      cpfNovo: v.cpfNovo || "NÃO",
      valorComissao: v.valorComissao ? String(v.valorComissao) : "",
      comissaoPaga: v.comissaoPaga || "",
      implantada: v.implantada || "NÃO",
      corretor: v.corretor || "",
      produto: v.produto || "",
      observacao: v.observacao || "",
      email: (v as any).email || "",
      telefone: (v as any).telefone || "",
      celular: (v as any).celular || "",
      dataNascimento: (v as any).dataNascimento ? (() => { const d = new Date((v as any).dataNascimento); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`; })() : "",
      endereco: (v as any).endereco || "",
      bairro: (v as any).bairro || "",
      cidade: (v as any).cidade || "",
      cep: (v as any).cep || "",
      origemId: (v as any).origemId || null,
    });
    // Carregar vendedores salvos na venda (vendedoresJson)
    try {
      const vJson = (v as any).vendedoresJson;
      if (vJson) {
        const parsed = typeof vJson === "string" ? JSON.parse(vJson) : vJson;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setVendedoresVenda(parsed);
        } else {
          setVendedoresVenda(v.corretor ? [{ nomeVendedor: v.corretor, percentual: 100 }] : [{ nomeVendedor: "", percentual: 100 }]);
        }
      } else {
        setVendedoresVenda(v.corretor ? [{ nomeVendedor: v.corretor, percentual: 100 }] : [{ nomeVendedor: "", percentual: 100 }]);
      }
    } catch {
      setVendedoresVenda(v.corretor ? [{ nomeVendedor: v.corretor, percentual: 100 }] : [{ nomeVendedor: "", percentual: 100 }]);
    }
    setModalAberto(true);
  };

  const salvar = () => {
    if (!form.nomeCliente.trim()) {
      toast.error("Nome do cliente é obrigatório");
      return;
    }
    // Converter produtos selecionados (checkboxes) em string separada por vírgula
    // Se há produtos selecionados via checkbox, eles prevalecem sobre o campo texto livre
    let produtoFinal = form.produto;
    if (produtosSelecionados.length > 0) {
      const nomesProdutos = produtosSelecionados
        .map(id => (todosProdutos as any[]).find((p: any) => p.id === id))
        .filter(Boolean)
        .map((p: any) => p.descricao);
      produtoFinal = nomesProdutos.join(", ");
    }
    // Determinar corretor principal (primeiro vendedor com nome preenchido)
    const corretorPrincipal = vendedoresVenda.find(v => v.nomeVendedor.trim())?.nomeVendedor || form.corretor;
    // Serializar lista de vendedores como JSON
    const vendedoresValidos = vendedoresVenda.filter(v => v.nomeVendedor.trim());
    const vendedoresJsonStr = vendedoresValidos.length > 0 ? JSON.stringify(vendedoresValidos) : null;
    const payload = {
      ...form,
      produto: produtoFinal,
      corretor: corretorPrincipal,
      vendedoresJson: vendedoresJsonStr,
      valorPremio: form.valorPremio ? parseFloat(form.valorPremio.replace(",", ".")) : null,
      valorComissao: form.valorComissao ? parseFloat(form.valorComissao.replace(",", ".")) : null,
    };
    if (editandoId) {
      // CORRECAO: Remover mes e ano do payload para atualizar (sao chaves imutaveis)
      const { mes, ano, ...dataAtualizar } = payload;
      atualizarMutation.mutate({ id: editandoId, data: dataAtualizar });
    } else {
      criarMutation.mutate(payload as any);
    }
  };

  const formatCurrency = (v: number | string | null) => {
    if (!v) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
  };

  const formatDate = (d: string | Date | null) => {
    if (!d) return "—";
    const s = String(d).substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
    const [yyyy, mm, dd] = s.split("-");
    return `${dd}/${mm}/${yyyy}`;
  };

  const pieData = corretores.map((c) => ({
    name: c.corretor || "Não informado",
    value: Number(c.totalPremio),
  })).filter(c => c.value > 0);

  const barData = (resumoMensal || []).map((r) => ({
    mes: MESES_ABREV[r.mes] || `M${r.mes}`,
    faturamento: Number(r.faturamento),
    comissao: Number(r.comissaoTotal),
    vendas: Number(r.totalVendas),
  }));

  const pctCpfNovo = m.totalPropostas > 0 ? (m.cpfNovos / m.totalPropostas * 100).toFixed(1) : "0";

  const periodoLabel = mesSel ? `${MESES[mesSel]}_${ano}` : `Ano_${ano}`;

  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();
    const rows = vendas.map(v => ({
      "Data": v.dataVenda ? formatDate(v.dataVenda) : "",
      "Cliente": v.nomeCliente || "",
      "CPF": v.cpfCliente || "",
      "Corretor": v.corretor || "",
      "Produto": v.produto || "",
      "Valor Prêmio": v.valorPremio ? Number(v.valorPremio) : 0,
      "CPF Novo": v.cpfNovo || "",
      "Comissão": v.valorComissao ? Number(v.valorComissao) : 0,
      "Com. Paga": v.comissaoPaga || "",
      "Implantada": v.implantada || "",
      "Observação": v.observacao || "",
    }));
    // Linha de totais
    rows.push({
      "Data": "TOTAL",
      "Cliente": "",
      "CPF": "",
      "Corretor": "",
      "Produto": `${vendas.length} lançamentos`,
      "Valor Prêmio": vendas.reduce((s, v) => s + (v.valorPremio ? Number(v.valorPremio) : 0), 0),
      "CPF Novo": "",
      "Comissão": vendas.reduce((s, v) => s + (v.valorComissao ? Number(v.valorComissao) : 0), 0),
      "Com. Paga": "",
      "Implantada": "",
      "Observação": "",
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [10, 30, 16, 14, 20, 14, 10, 14, 12, 12, 30].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Vendas");
    XLSX.writeFile(wb, `Vendas_${periodoLabel}${corretorFiltro ? `_${corretorFiltro}` : ""}.xlsx`);
    toast.success("Excel exportado!");
  };

  const exportarPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    // Cabeçalho
    doc.setFillColor(30, 64, 175);
    doc.rect(0, 0, 297, 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("BARCELLOS SEGUROS — Controle de Vendas", 14, 13);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const filtroLabel = [
      mesSel ? MESES[mesSel] : "Ano todo",
      ano,
      corretorFiltro ? `| ${corretorFiltro}` : "",
    ].filter(Boolean).join(" ");
    doc.text(filtroLabel, 297 - 14, 13, { align: "right" });
    // Totais
    const totalPremio = vendas.reduce((s, v) => s + (v.valorPremio ? Number(v.valorPremio) : 0), 0);
    const totalComissao = vendas.reduce((s, v) => s + (v.valorComissao ? Number(v.valorComissao) : 0), 0);
    const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text(`Total: ${vendas.length} lançamentos  |  Valor Prêmio: ${fmt(totalPremio)}  |  Comissão: ${fmt(totalComissao)}`, 14, 27);
    // Tabela
    const body = vendas.map(v => [
      v.dataVenda ? formatDate(v.dataVenda) : "",
      (v.nomeCliente || "").slice(0, 28),
      v.cpfCliente || "",
      v.corretor || "",
      (v.produto || "").slice(0, 20),
      v.valorPremio ? fmt(Number(v.valorPremio)) : "—",
      v.cpfNovo || "",
      v.valorComissao ? fmt(Number(v.valorComissao)) : "—",
      v.comissaoPaga || "",
      v.implantada || "",
    ]);
    autoTable(doc, {
      startY: 31,
      head: [["Data", "Cliente", "CPF", "Corretor", "Produto", "Valor Prêmio", "CPF Novo", "Comissão", "Com. Paga", "Implantada"]],
      body,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 42 },
        2: { cellWidth: 24 },
        3: { cellWidth: 22 },
        4: { cellWidth: 32 },
        5: { cellWidth: 24, halign: "right" },
        6: { cellWidth: 16, halign: "center" },
        7: { cellWidth: 24, halign: "right" },
        8: { cellWidth: 18, halign: "center" },
        9: { cellWidth: 18, halign: "center" },
      },
      margin: { left: 14, right: 14 },
    });
    // Rodapé
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(`Barcellos Seguros — gerado em ${new Date().toLocaleString("pt-BR")} — pág. ${i}/${pageCount}`, 14, 205);
    }
    doc.save(`Vendas_${periodoLabel}${corretorFiltro ? `_${corretorFiltro}` : ""}.pdf`);
    toast.success("PDF exportado!");
  };

  return (
    <AppLayout>
      <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Controle de Vendas</h1>
          <p className="text-muted-foreground">Propostas e comissões por corretor — {ano}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={exportarExcel} className="gap-2 border-green-600 text-green-700 hover:bg-green-50">
            <Download className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" onClick={exportarPDF} className="gap-2 border-red-600 text-red-700 hover:bg-red-50">
            <Download className="h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" onClick={iniciarValidacaoLote} className="gap-2 border-green-300 text-green-700 hover:bg-green-50">
            <ShieldCheck className="h-4 w-4" /> Validar WhatsApp
          </Button>
          <Button onClick={abrirNovo} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Venda
          </Button>
        </div>
      </div>

      {/* Filtros de Mês */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => setMesSel(null)}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            !mesSel ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Anual
        </button>
        {MESES.slice(1).map((m, i) => (
          <button
            key={i + 1}
            onClick={() => setMesSel(i + 1)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              mesSel === i + 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {m.slice(0, 3)}
          </button>
        ))}
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setAbaAtiva("dashboard")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            abaAtiva === "dashboard" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setAbaAtiva("lancamentos")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            abaAtiva === "lancamentos" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Lançamentos ({vendas.length})
        </button>
      </div>

      {abaAtiva === "dashboard" && (
        <div className="space-y-6">
          {/* Indicadores Principais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total de Propostas</p>
                    <p className="text-2xl font-bold">{m.totalPropostas}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <DollarSign className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Faturamento</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(m.faturamento)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <BarChart2 className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Comissão Total</p>
                    <p className="text-lg font-bold text-purple-600">{formatCurrency(m.comissaoTotal)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Target className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ticket Médio</p>
                    <p className="text-lg font-bold text-orange-600">{formatCurrency(m.ticketMedio)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Indicadores Secundários */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">CPF Novos</p>
                    <p className="text-2xl font-bold">{m.cpfNovos}</p>
                    <p className="text-xs text-muted-foreground">{pctCpfNovo}% do total</p>
                  </div>
                  <div className="p-3 bg-teal-100 rounded-full">
                    <Percent className="h-5 w-5 text-teal-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Com. Pagas</p>
                    <p className="text-2xl font-bold text-green-600">{m.comissoesPagas}</p>
                    <p className="text-xs text-muted-foreground">de {m.totalPropostas} propostas</p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-full">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Implantadas</p>
                    <p className="text-2xl font-bold text-blue-600">{m.implantadas}</p>
                    <p className="text-xs text-muted-foreground">de {m.totalPropostas} propostas</p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-full">
                    <CheckCircle className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Performance por Vendedor + Gráfico */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Performance por Vendedor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left pb-2 font-medium">Vendedor</th>
                      <th className="text-right pb-2 font-medium">Prop.</th>
                      <th className="text-right pb-2 font-medium">CPF Novos</th>
                      <th className="text-right pb-2 font-medium">Faturamento</th>
                      <th className="text-right pb-2 font-medium">Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {corretores.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-4 text-muted-foreground">Sem dados</td></tr>
                    ) : (
                      corretores.map((c, i) => (
                        <tr key={i} className="border-b hover:bg-muted/30">
                          <td className="py-2 font-medium">{c.corretor || "—"}</td>
                          <td className="py-2 text-right">{Number(c.totalVendas)}</td>
                          <td className="py-2 text-right text-teal-600">{Number(c.cpfNovos)}</td>
                          <td className="py-2 text-right text-green-600 text-xs">{formatCurrency(Number(c.totalPremio))}</td>
                          <td className="py-2 text-right text-purple-600 text-xs">{formatCurrency(Number(c.totalComissao))}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Faturamento por Vendedor</CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {pieData.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[220px] text-muted-foreground">Sem dados para exibir</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Gráfico Mensal */}
          {!mesSel && barData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Evolução Mensal — {ano}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={barData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="faturamento" name="Faturamento" fill="#1e3a5f" />
                    <Bar dataKey="comissao" name="Comissão" fill="#3b82c6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {abaAtiva === "lancamentos" && (
        <div className="space-y-4">
          {/* Filtro por corretor */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setCorretorFiltro("")}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    !corretorFiltro ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  Todos
                </button>
                {CORRETORES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCorretorFiltro(c)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      corretorFiltro === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tabela de Lançamentos */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">
                {isLoading ? "Carregando..." : `${vendas.length} lançamentos`}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Data</th>
                      <th className="text-left p-3 font-medium">Nome do Cliente</th>
                      <th className="text-left p-3 font-medium">CPF</th>
                      <th className="text-right p-3 font-medium">Valor</th>
                      <th className="text-center p-3 font-medium">CPF Novo</th>
                      <th className="text-right p-3 font-medium">Comissão</th>
                      <th className="text-center p-3 font-medium">Com. Paga</th>
                      <th className="text-center p-3 font-medium">Implantada</th>
                      <th className="text-center p-3 font-medium">Vendedor</th>
                      <th className="text-center p-3 font-medium">Base</th>
                      <th className="text-center p-3 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={11} className="text-center p-8 text-muted-foreground">Carregando...</td></tr>
                    ) : vendas.length === 0 ? (
                      <tr><td colSpan={11} className="text-center p-8 text-muted-foreground">Nenhuma venda encontrada</td></tr>
                    ) : (
                      vendas.map((v) => (
                        <tr key={v.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 text-xs text-muted-foreground">{formatDate(v.dataVenda)}</td>
                          <td className="p-3 font-medium">{v.nomeCliente}</td>
                          <td className="p-3 text-muted-foreground font-mono text-xs">{v.cpfCliente || "—"}</td>
                          <td className="p-3 text-right text-green-600 font-medium">{v.valorPremio ? formatCurrency(Number(v.valorPremio)) : "—"}</td>
                          <td className="p-3 text-center">
                            <Badge className={`text-xs ${v.cpfNovo === "SIM" ? "bg-teal-100 text-teal-700" : "bg-gray-100 text-gray-500"}`}>
                              {v.cpfNovo || "NÃO"}
                            </Badge>
                          </td>
                          <td className="p-3 text-right text-purple-600">{v.valorComissao ? formatCurrency(Number(v.valorComissao)) : "—"}</td>
                          <td className="p-3 text-center">
                            {v.comissaoPaga === "PAGO" ? (
                              <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                            ) : (
                              <XCircle className="h-4 w-4 text-gray-300 mx-auto" />
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <Badge className={`text-xs ${v.implantada === "SIM" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                              {v.implantada || "NÃO"}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">
                            <Badge variant="outline" className="text-xs">{v.corretor || "—"}</Badge>
                          </td>
                          <td className="p-3 text-center">
                            {v.naBase ? (
                              <Badge className="text-xs bg-green-100 text-green-700 border-green-200 gap-1">
                                <Database className="h-3 w-3" />
                                Na Base
                              </Badge>
                            ) : (
                              <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">
                                Pendente
                              </Badge>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {!v.naBase && v.implantada === "SIM" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => enviarParaBaseMutation.mutate({ id: v.id })}
                                  disabled={enviarParaBaseMutation.isPending}
                                  title="Enviar para Base de Clientes"
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 ${(v as any).boasVindasEnviadoEm ? 'text-green-700 bg-green-100 hover:bg-green-200' : 'text-green-600 hover:text-green-700 hover:bg-green-50'}`}
                                onClick={() => abrirWhatsapp(v)}
                                title={(v as any).boasVindasEnviadoEm ? `Boas-vindas enviado em ${new Date((v as any).boasVindasEnviadoEm).toLocaleDateString('pt-BR')}` : 'Enviar WhatsApp Boas-Vindas'}
                              >
                                {(v as any).boasVindasEnviadoEm ? <CheckCircle2 className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:text-blue-600 hover:bg-blue-50" onClick={() => abrirEmail(v)} title="Enviar E-mail">
                                <Mail className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEdicao(v)} title="Editar">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => setConfirmDeleteId(v.id)} title="Excluir">
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
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal de Criação/Edição */}
      <Dialog open={modalAberto} onOpenChange={(open) => { setModalAberto(open); if (!open) { setEditandoId(null); setProdutosSelecionados([]); setBuscaProdutoModal(""); setVendedoresVenda([{ nomeVendedor: "", percentual: 100 }]); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editandoId ? "Editar Venda" : "Nova Venda"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Mês</Label>
                <Select value={String(form.mes)} onValueChange={(v) => setForm({ ...form, mes: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MESES.slice(1).map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Data da Venda</Label>
                <Input type="date" value={form.dataVenda} onChange={(e) => setForm({ ...form, dataVenda: e.target.value })} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Nome do Cliente *</Label>
                <Input value={form.nomeCliente} onChange={(e) => setForm({ ...form, nomeCliente: e.target.value })} placeholder="Nome completo" />
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5">
                  CPF
                  {cpfBuscando && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                  {clienteEncontrado === true && <span className="flex items-center gap-1 text-xs text-green-600 font-normal"><CheckCircle2 className="h-3 w-3" /> Encontrado na base</span>}
                  {clienteEncontrado === false && <span className="text-xs text-amber-600 font-normal">Não cadastrado</span>}
                </Label>
                <Input
                  value={form.cpfCliente}
                  onChange={(e) => handleCpfChange(e.target.value)}
                  placeholder="000.000.000-00"
                  className={clienteEncontrado === true ? "border-green-400 bg-green-50" : ""}
                />
              </div>
              <div className="space-y-1">
                <Label>Valor (Prêmio)</Label>
                <Input value={form.valorPremio} onChange={(e) => setForm({ ...form, valorPremio: e.target.value })} placeholder="0,00" />
              </div>
              <div className="space-y-1">
                <Label>CPF Novo</Label>
                <Select value={form.cpfNovo} onValueChange={(v) => setForm({ ...form, cpfNovo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SIM">SIM</SelectItem>
                    <SelectItem value="NÃO">NÃO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Comissão</Label>
                <Input value={form.valorComissao} onChange={(e) => setForm({ ...form, valorComissao: e.target.value })} placeholder="0,00" />
              </div>
              <div className="space-y-1">
                <Label>Com. Paga</Label>
                <Select value={form.comissaoPaga || "_vazio"} onValueChange={(v) => setForm({ ...form, comissaoPaga: v === "_vazio" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_vazio">—</SelectItem>
                    <SelectItem value="PAGO">PAGO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Implantada</Label>
                <Select value={form.implantada} onValueChange={(v) => setForm({ ...form, implantada: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SIM">SIM</SelectItem>
                    <SelectItem value="NÃO">NÃO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Vendedor(es)</Label>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    Math.abs(totalPercentualVenda - 100) < 0.01
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>{totalPercentualVenda.toFixed(0)}%</span>
                </div>
                {vendedoresVenda.map((vv, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                        <Select
                          value={vv.nomeVendedor || "_vazio"}
                          onValueChange={(val) => atualizarVendedorVenda(idx, "nomeVendedor", val === "_vazio" ? "" : val)}
                        >
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Selecionar vendedor" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_vazio">—</SelectItem>
                            {CORRETORES.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      <div className="flex items-center gap-1 w-24">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={vv.percentual}
                          onChange={(e) => atualizarVendedorVenda(idx, "percentual", parseFloat(e.target.value) || 0)}
                          className="w-16 text-center"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                      {vendedoresVenda.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removerVendedorVenda(idx)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                ))}
                {vendedoresVenda.length < 3 && (
                  <button
                    type="button"
                    onClick={adicionarVendedorVenda}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Adicionar vendedor
                  </button>
                )}
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="flex items-center gap-2">
                  Produto (texto livre)
                  {produtosSelecionados.length > 0 && (
                    <span className="text-xs text-amber-600 font-normal">⚠️ Será substituído pelos produtos selecionados abaixo</span>
                  )}
                </Label>
                <Input
                  value={produtosSelecionados.length > 0
                    ? (produtosSelecionados.map(id => (todosProdutos as any[]).find((p: any) => p.id === id)?.descricao).filter(Boolean).join(", "))
                    : form.produto
                  }
                  onChange={(e) => {
                    // Só permite editar o texto livre se não há checkboxes selecionados
                    if (produtosSelecionados.length === 0) {
                      setForm({ ...form, produto: e.target.value });
                    }
                  }}
                  readOnly={produtosSelecionados.length > 0}
                  placeholder="Ex: Vida, Residencial... (ou selecione abaixo)"
                  className={produtosSelecionados.length > 0 ? "bg-blue-50 text-blue-800" : ""}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Observação</Label>
                <Textarea value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} rows={2} />
              </div>
            </div>

            {/* Dados de Contato e Endereço — espelho da Base de Clientes */}
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contato &amp; Endereço</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@exemplo.com" />
                </div>
                <div className="space-y-1">
                  <Label>Telefone</Label>
                  <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(48) 3000-0000" />
                </div>
                <div className="space-y-1">
                  <Label>Celular</Label>
                  <Input value={form.celular} onChange={(e) => setForm({ ...form, celular: e.target.value })} placeholder="(48) 99000-0000" />
                </div>
                <div className="space-y-1">
                  <Label>Data de Nascimento</Label>
                  <Input type="date" value={form.dataNascimento} onChange={(e) => setForm({ ...form, dataNascimento: e.target.value })} />
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
                      {buscandoCep ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Enter ou lupa para preencher endereço</p>
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
                <div className="col-span-2 space-y-1">
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
              </div>

              {/* Seletor de Produtos — idêntico ao da Base de Clientes */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Produtos Vinculados
                  {produtosSelecionados.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{produtosSelecionados.length} selecionado{produtosSelecionados.length > 1 ? "s" : ""}</span>
                  )}
                </Label>

                {/* Badges dos produtos selecionados */}
                {produtosSelecionados.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-blue-50 border border-blue-200 rounded-md">
                    {produtosSelecionados.map(id => {
                      const prod = todosProdutos.find((p: any) => p.id === id);
                      if (!prod) return null;
                      return (
                        <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full font-medium">
                          <span className="opacity-75">[{prod.codigo}]</span>
                          {prod.descricao.length > 25 ? prod.descricao.substring(0, 25) + "…" : prod.descricao}
                          <button type="button" onClick={() => toggleProduto(id)} className="ml-0.5 hover:bg-blue-700 rounded-full p-0.5">
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
                <div className="border rounded-md max-h-40 overflow-y-auto bg-muted/20">
                  {todosProdutos.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Nenhum produto cadastrado.</p>
                  ) : (
                    <div className="divide-y">
                      {(todosProdutos as any[]).filter(p => {
                        if (!buscaProdutoModal) return true;
                        const b = buscaProdutoModal.toLowerCase();
                        return p.codigo?.toLowerCase().includes(b) || p.descricao?.toLowerCase().includes(b);
                      }).map((p: any) => (
                        <label
                          key={p.id}
                          htmlFor={`vprod-${p.id}`}
                          className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                            produtosSelecionados.includes(p.id)
                              ? 'bg-blue-50 border-l-2 border-blue-500'
                              : 'hover:bg-muted/50'
                          }`}
                        >
                          <Checkbox
                            id={`vprod-${p.id}`}
                            checked={produtosSelecionados.includes(p.id)}
                            onCheckedChange={() => toggleProduto(p.id)}
                          />
                          <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">{p.codigo}</span>
                          <span className="text-xs truncate">{p.descricao}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setModalAberto(false)} className="sm:mr-auto">Cancelar</Button>
            {editandoId && (
              <Button
                variant="outline"
                className="gap-2 border-green-600 text-green-700 hover:bg-green-50"
                onClick={() => enviarParaBaseMutation.mutate({ id: editandoId! })}
                disabled={enviarParaBaseMutation.isPending}
              >
                {enviarParaBaseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                Enviar para a Base
              </Button>
            )}
            <Button onClick={salvar} disabled={criarMutation.isPending || atualizarMutation.isPending}>
              {criarMutation.isPending || atualizarMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de E-mail Individual */}
      <Dialog open={emailVenda !== null} onOpenChange={(open) => { if (!open) { setEmailVenda(null); setEmailPreviewMode("preview"); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-500" />
              Boas-vindas — {emailVenda?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col gap-3 min-h-0">
            {/* Campos de destinatário e assunto */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Destinatário *</Label>
                <Input
                  type="email"
                  placeholder="email@exemplo.com"
                  value={emailForm.destinatario}
                  onChange={e => setEmailForm(f => ({ ...f, destinatario: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assunto *</Label>
                <Input
                  value={emailForm.assunto}
                  onChange={e => setEmailForm(f => ({ ...f, assunto: e.target.value }))}
                />
              </div>
            </div>
            {/* Abas Preview / Editar HTML */}
            <div className="flex items-center gap-1 border-b">
              <button
                onClick={() => setEmailPreviewMode("preview")}
                className={`px-3 py-1.5 text-sm font-medium rounded-t transition-colors ${
                  emailPreviewMode === "preview"
                    ? "border border-b-0 border-border bg-background text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="h-3.5 w-3.5 inline mr-1" />Pré-visualização
              </button>
              <button
                onClick={() => setEmailPreviewMode("edit")}
                className={`px-3 py-1.5 text-sm font-medium rounded-t transition-colors ${
                  emailPreviewMode === "edit"
                    ? "border border-b-0 border-border bg-background text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Pencil className="h-3.5 w-3.5 inline mr-1" />Editar HTML
              </button>
            </div>
            {/* Conteúdo da aba */}
            <div className="flex-1 overflow-hidden" style={{ minHeight: 320 }}>
              {emailPreviewMode === "preview" ? (
                <div className="border rounded-lg overflow-hidden h-full">
                  <iframe
                    srcDoc={emailForm.corpo}
                    className="w-full h-full"
                    style={{ height: 360, border: 'none' }}
                    title="preview-email-boas-vindas"
                    sandbox="allow-same-origin"
                  />
                </div>
              ) : (
                <div className="h-full flex flex-col gap-1">
                  <Textarea
                    value={emailForm.corpo}
                    onChange={e => setEmailForm(f => ({ ...f, corpo: e.target.value }))}
                    rows={12}
                    className="font-mono text-xs flex-1 resize-none"
                    style={{ minHeight: 320 }}
                  />
                  <p className="text-xs text-muted-foreground">HTML completo. O rodapé com endereço é adicionado automaticamente pelo SendGrid.</p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => { setEmailVenda(null); setEmailPreviewMode("preview"); }}>Cancelar</Button>
            <Button onClick={enviarEmailIndividual} disabled={enviandoEmail} className="gap-2">
              {enviandoEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {enviandoEmail ? "Enviando..." : "Enviar E-mail"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Validação em Lote de WhatsApp */}
      <Dialog open={modalValidacaoAberto} onOpenChange={setModalValidacaoAberto}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-600" />
              Validação de Números WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {validarLoteMut.isPending && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
                <p className="text-sm text-muted-foreground">Verificando números... isso pode levar alguns segundos.</p>
              </div>
            )}
            {resultadosValidacao && (
              <div className="space-y-2">
                <div className="flex gap-4 p-3 bg-muted rounded-lg text-sm">
                  <span className="text-green-700 font-semibold">✅ Com WhatsApp: {resultadosValidacao.filter(r => r.temWhatsApp).length}</span>
                  <span className="text-red-700 font-semibold">❌ Sem WhatsApp: {resultadosValidacao.filter(r => !r.temWhatsApp).length}</span>
                  <span className="text-muted-foreground">Total: {resultadosValidacao.length}</span>
                </div>
                <div className="space-y-1">
                  {resultadosValidacao.map(r => (
                    <div key={r.id} className={`flex items-center gap-3 p-2.5 rounded-lg border text-sm ${
                      r.temWhatsApp ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                    }`}>
                      {r.temWhatsApp
                        ? <Phone className="h-4 w-4 text-green-600 flex-shrink-0" />
                        : <PhoneOff className="h-4 w-4 text-red-500 flex-shrink-0" />}
                      <span className="flex-1 font-medium truncate">{r.nome}</span>
                      <span className="text-muted-foreground text-xs font-mono">{r.celular}</span>
                      {r.erro && <span className="text-xs text-red-600 truncate max-w-[150px]">{r.erro}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalValidacaoAberto(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de WhatsApp Individual */}
      <Dialog open={whatsVenda !== null} onOpenChange={(open) => { if (!open) { setWhatsVenda(null); setWhatsErroNumero(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-green-600" />
              Enviar WhatsApp — {whatsVenda?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Alerta de número inválido com edição rápida */}
            {whatsErroNumero && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-700">Número sem WhatsApp</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      O número <strong>{whatsForm.telefone}</strong> não tem WhatsApp cadastrado.
                      Corrija o número abaixo e tente novamente.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label>Número de WhatsApp *</Label>
              <Input
                type="tel"
                placeholder="(48) 99000-0000"
                value={whatsForm.telefone}
                onChange={e => { setWhatsForm(f => ({ ...f, telefone: e.target.value })); setWhatsErroNumero(null); }}
                className={whatsErroNumero ? "border-red-400 bg-red-50 focus:border-red-500" : ""}
              />
              <p className="text-xs text-muted-foreground">Preencha com o celular cadastrado ou digite outro número.</p>
            </div>
            <div className="space-y-1">
              <Label>Mensagem *</Label>
              <Textarea
                value={whatsForm.mensagem}
                onChange={e => setWhatsForm(f => ({ ...f, mensagem: e.target.value }))}
                rows={10}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">A mensagem será enviada automaticamente via WhatsApp (48) 99210-8365.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWhatsVenda(null)}>Cancelar</Button>
            <Button onClick={enviarWhatsappIndividual} disabled={enviarWhatsappMut.isPending} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
              {enviarWhatsappMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
              {enviarWhatsappMut.isPending ? "Enviando..." : "Enviar Agora"}
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
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir esta venda? Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => confirmDeleteId && excluirMutation.mutate({ id: confirmDeleteId })} disabled={excluirMutation.isPending}>
              {excluirMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AppLayout>
  );
}

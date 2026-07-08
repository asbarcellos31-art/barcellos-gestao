import AppLayout from "@/components/AppLayout";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus, Search, Edit2, Trash2, Download, Phone, Calendar,
  TrendingUp, Users, CheckCircle, XCircle, Clock, AlertCircle, Upload, UserPlus,
  ChevronLeft, ChevronRight, Target, BarChart2, Settings2, X, MessageSquare, FileText
} from "lucide-react";

// ─── Status da esteira (fiel à planilha CRM_LEADS_ELISIA_BARCELLOS) ─────────
const STATUS_LEAD: Record<string, { label: string; cls: string; dot: string; metricaKey: string }> = {
  "AGUARDANDO":   { label: "Aguardando",   cls: "bg-gray-100 text-gray-700 border-gray-300",       dot: "bg-gray-400",   metricaKey: "aguardando" },
  "SEM CONTATO":  { label: "Sem Contato",  cls: "bg-orange-100 text-orange-700 border-orange-300", dot: "bg-orange-400", metricaKey: "semContato" },
  "EM CONTATO":   { label: "Em Contato",   cls: "bg-blue-100 text-blue-700 border-blue-300",       dot: "bg-blue-500",   metricaKey: "emContato" },
  "AGENDAMENTO":  { label: "Agendamentos", cls: "bg-purple-100 text-purple-700 border-purple-300", dot: "bg-purple-500", metricaKey: "agendamento" },
  "FECHAMENTO":   { label: "Fechamento",   cls: "bg-green-100 text-green-700 border-green-300",    dot: "bg-green-500",  metricaKey: "fechamento" },
  "RECUSADO":     { label: "Recusado",     cls: "bg-red-100 text-red-700 border-red-300",          dot: "bg-red-500",    metricaKey: "recusado" },
  "ENVIADO":      { label: "Enviado",      cls: "bg-teal-100 text-teal-700 border-teal-300",       dot: "bg-teal-500",   metricaKey: "enviado" },
};

const MESES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const ANO_ATUAL = new Date().getFullYear();

const fmt = (v: number | null | undefined) =>
  v ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v) : "—";

const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const s = String(d).substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "—";
  const [yyyy, mm, dd] = s.split("-");
  return `${dd}/${mm}/${yyyy}`;
};

type LeadForm = {
  nome: string; cpf: string;
  telefone: string; celular2: string; celular3: string;
  fixo1: string; fixo2: string; fixo3: string;
  logradouro: string; numero: string; complemento: string;
  bairro: string; cidade: string; uf: string;
  dataEntrega: string; mes: string; ano: string;
  status: "AGUARDANDO" | "SEM CONTATO" | "EM CONTATO" | "AGENDAMENTO" | "FECHAMENTO" | "RECUSADO" | "ENVIADO";
  valorEstimado: string; historico: string; observacao: string; dataFechamento: string;
  origem: string; vendedor: string;
};

const FORM_VAZIO: LeadForm = {
  nome: "", cpf: "",
  telefone: "", celular2: "", celular3: "",
  fixo1: "", fixo2: "", fixo3: "",
  logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", uf: "",
  dataEntrega: "",
  mes: String(new Date().getMonth() + 1), ano: String(ANO_ATUAL),
  status: "AGUARDANDO", valorEstimado: "",
  historico: "", observacao: "", dataFechamento: "",
  origem: "", vendedor: "",
};

export default function CrmLeads() {
  const utils = trpc.useUtils();
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [mesFiltro, setMesFiltro] = useState("todos");
  const [anoFiltro, setAnoFiltro] = useState(ANO_ATUAL);
  const [vendedorFiltro, setVendedorFiltro] = useState("todos");
  const [origemFiltro, setOrigemFiltro] = useState("todos");
  const [mesSelecionado, setMesSelecionado] = useState(new Date().getMonth() + 1);
  const [anoSelecionado, setAnoSelecionado] = useState(ANO_ATUAL);
  const [vendedorMensal, setVendedorMensal] = useState("todos");
  const [vendedorAnual, setVendedorAnual] = useState("todos");
  const [aba, setAba] = useState("mensal");
  const [modal, setModal] = useState(false);
  const [modalOrigens, setModalOrigens] = useState(false);
  const [novaOrigem, setNovaOrigem] = useState("");
  const [modalImport, setModalImport] = useState(false);
  const [vendedorImport, setVendedorImport] = useState("");
  const [origemImport, setOrigemImport] = useState("");
  const [arquivoImport, setArquivoImport] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [mesImport, setMesImport] = useState(String(new Date().getMonth() + 1));
  const [anoImport, setAnoImport] = useState(String(ANO_ATUAL));
  const [modalDuplicatas, setModalDuplicatas] = useState(false);
  const [duplicatasInfo, setDuplicatasInfo] = useState<{
    novos: any[]; existentes: { payload: any; leadId: number; nome: string }[];
  }>({ novos: [], existentes: [] });
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<LeadForm>(FORM_VAZIO);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [cidadesFiltro, setCidadesFiltro] = useState<string[]>([]);
  const [ufFiltro, setUfFiltro] = useState("todos");
  const [leadsSelecionados, setLeadsSelecionados] = useState<number[]>([]);
  const [pdfFromTable, setPdfFromTable] = useState(false);

  // PDF lista vendedor
  const [pdfLeadsOpen, setPdfLeadsOpen] = useState(false);
  const [pdfMes, setPdfMes] = useState(String(new Date().getMonth() + 1));
  const [pdfAno, setPdfAno] = useState(String(ANO_ATUAL));
  const [pdfVendedor, setPdfVendedor] = useState("todos");
  const [pdfCampos, setPdfCampos] = useState({
    cpf: true, telefone: true, celular2: true, celular3: false,
    fixo1: true, fixo2: false, fixo3: false,
    logradouro: false, bairro: true, cidade: true,
    origem: false, status: false, valorEstimado: false,
  });
  const [pdfSelecionados, setPdfSelecionados] = useState<number[]>([]);

  // Query de leads para o PDF (ativa só com o dialog aberto)
  const { data: leadsPdfData, isFetching: fetchingPdf } = trpc.crmLeads.listar.useQuery(
    {
      mes: Number(pdfMes) || undefined,
      ano: Number(pdfAno),
      vendedor: pdfVendedor !== "todos" ? pdfVendedor : undefined,
    },
    { enabled: pdfLeadsOpen && !pdfFromTable }
  );

  // Auto-seleciona todos ao carregar (só quando NÃO vem da seleção da tabela)
  useEffect(() => {
    if (!pdfFromTable && leadsPdfData?.leads) {
      setPdfSelecionados(leadsPdfData.leads.map((l: any) => l.id));
    }
  }, [leadsPdfData, pdfFromTable]);

  // Origens, vendedores, cidades e UFs
  const { data: origensData } = trpc.crmLeads.listarOrigens.useQuery();
  const { data: vendedoresData } = trpc.clientes.listarVendedores.useQuery();
  const { data: cidadesData = [] } = trpc.crmLeads.listarCidades.useQuery();
  const { data: ufsData = [] } = trpc.crmLeads.listarUFs.useQuery();
  const origens = origensData || [];
  // Filtrar vendedores válidos (sem "*VENDEDOR NÃO INFORMADO*" e sem múltiplos)
  const vendedores = (vendedoresData || []).filter(v =>
    v && !v.includes("*") && !v.includes(",")
  );

  // Query para a aba mensal (mês selecionado) - usa filtro de vendedor próprio da aba
  const { data: dadosMensal, isLoading: loadingMensal } = trpc.crmLeads.listar.useQuery({
    busca: busca || undefined,
    status: statusFiltro !== "todos" ? statusFiltro : undefined,
    mes: mesSelecionado,
    ano: anoSelecionado,
    vendedor: vendedorMensal !== "todos" ? vendedorMensal : undefined,
    origem: origemFiltro !== "todos" ? origemFiltro : undefined,
  });
  // Query para a aba de lista geral (filtros livres)
  const { data, isLoading } = trpc.crmLeads.listar.useQuery({
    busca: busca || undefined,
    status: statusFiltro !== "todos" ? statusFiltro : undefined,
    mes: mesFiltro !== "todos" ? Number(mesFiltro) : undefined,
    ano: anoFiltro,
    vendedor: vendedorFiltro !== "todos" ? vendedorFiltro : undefined,
    origem: origemFiltro !== "todos" ? origemFiltro : undefined,
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
    cidades: cidadesFiltro.length > 0 ? cidadesFiltro : undefined,
    uf: ufFiltro !== "todos" ? ufFiltro : undefined,
  });
  // Métricas mensais do mês selecionado (com filtro por vendedor)
  const { data: metricasMensal } = trpc.crmLeads.metricas.useQuery({ mes: mesSelecionado, ano: anoSelecionado, vendedor: vendedorMensal !== "todos" ? vendedorMensal : undefined });
  // Métricas anuais (com filtro por vendedor)
  const { data: metricasAnual } = trpc.crmLeads.metricas.useQuery({ ano: anoFiltro, vendedor: vendedorAnual !== "todos" ? vendedorAnual : undefined });
  const metricas = metricasAnual;

  const criarClienteMut = trpc.clientes.criar.useMutation({
    onSuccess: () => toast.success("Lead cadastrado como cliente na Base de Clientes!"),
    onError: (e) => toast.error("Erro ao cadastrar: " + e.message),
  });

  const cadastrarComoCliente = (lead: any) => {
    if (!confirm(`Cadastrar "${lead.nome}" na Base de Clientes?`)) return;
    criarClienteMut.mutate({
      nome: lead.nome,
      telefone: lead.telefone || null,
      status: "ATIVO",
      observacao: `Convertido do CRM Leads em ${new Date().toLocaleDateString("pt-BR")}`,
    });
  };

  const criarOrigemMut = trpc.crmLeads.criarOrigem.useMutation({
    onSuccess: () => {
      utils.crmLeads.listarOrigens.invalidate();
      toast.success("Origem adicionada!");
      setNovaOrigem("");
    },
    onError: (e) => toast.error(e.message),
  });

  const excluirOrigemMut = trpc.crmLeads.excluirOrigem.useMutation({
    onSuccess: () => {
      utils.crmLeads.listarOrigens.invalidate();
      toast.success("Origem removida!");
    },
    onError: (e) => toast.error(e.message),
  });

  const criarMut = trpc.crmLeads.criar.useMutation({
    onSuccess: () => {
      utils.crmLeads.listar.invalidate();
      utils.crmLeads.metricas.invalidate();
      utils.crmLeads.listarVendedores.invalidate();
      toast.success("Lead adicionado!");
      setModal(false);
      setForm(FORM_VAZIO);
    },
    onError: (e) => toast.error(e.message),
  });

  const atualizarMut = trpc.crmLeads.atualizar.useMutation({
    onSuccess: () => {
      utils.crmLeads.listar.invalidate();
      utils.crmLeads.metricas.invalidate();
      toast.success("Lead atualizado!");
      setModal(false);
      setEditandoId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const excluirMut = trpc.crmLeads.excluir.useMutation({
    onSuccess: () => {
      utils.crmLeads.listar.invalidate();
      utils.crmLeads.metricas.invalidate();
      toast.success("Lead removido!");
    },
    onError: (e) => toast.error(e.message),
  });

  const marcarEnviadosMut = trpc.crmLeads.marcarEnviados.useMutation({
    onSuccess: () => { utils.crmLeads.listar.invalidate(); utils.crmLeads.metricas.invalidate(); },
  });

  const verificarDuplicatasMut = trpc.crmLeads.verificarDuplicatas.useMutation();

  const executarImport = async (novos: any[], existentes: { payload: any; leadId: number }[], modo: "atualizar" | "pular") => {
    setImportando(true);
    let criados = 0, atualizados = 0;
    try {
      for (const payload of novos) {
        await criarMut.mutateAsync(payload);
        criados++;
      }
      if (modo === "atualizar") {
        for (const { payload, leadId } of existentes) {
          await atualizarMut.mutateAsync({ id: leadId, data: payload });
          atualizados++;
        }
      }
      utils.crmLeads.listar.invalidate();
      utils.crmLeads.listarCidades.invalidate();
      utils.crmLeads.listarUFs.invalidate();
      const msg = modo === "atualizar"
        ? `${criados} criado(s), ${atualizados} atualizado(s)!`
        : `${criados} criado(s), ${existentes.length} duplicata(s) pulada(s).`;
      toast.success(msg);
    } finally {
      setImportando(false);
      setModalImport(false);
      setModalDuplicatas(false);
      setArquivoImport(null);
      setVendedorImport("");
      setOrigemImport("");
      setMesImport(String(new Date().getMonth() + 1));
      setAnoImport(String(ANO_ATUAL));
    }
  };

  const excluirLoteMut = trpc.crmLeads.excluirLote.useMutation({
    onSuccess: (res) => {
      utils.crmLeads.listar.invalidate();
      utils.crmLeads.metricas.invalidate();
      utils.crmLeads.listarCidades.invalidate();
      utils.crmLeads.listarUFs.invalidate();
      toast.success(`${res.deletados} lead(s) excluído(s)!`);
      setLeadsSelecionados([]);
    },
    onError: (e) => toast.error(e.message),
  });

  const excluirSelecionados = () => {
    if (!leadsSelecionados.length) return;
    if (!confirm(`Excluir ${leadsSelecionados.length} lead(s) selecionado(s)? Esta ação não pode ser desfeita.`)) return;
    excluirLoteMut.mutate({ ids: leadsSelecionados });
  };

  const excluirTodosMut = trpc.crmLeads.excluirTodos.useMutation({
    onSuccess: (res) => {
      utils.crmLeads.listar.invalidate();
      utils.crmLeads.metricas.invalidate();
      toast.success(`${res.deletados} lead(s) excluído(s) do mês!`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleExcluirTodos = () => {
    if (!confirm(`Deseja excluir TODOS os leads de ${MESES_FULL[mesSelecionado - 1]}/${anoSelecionado}? Esta ação não pode ser desfeita.`)) return;
    excluirTodosMut.mutate({ mes: mesSelecionado, ano: anoSelecionado });
  };

  const abrirNovo = () => { setForm(FORM_VAZIO); setEditandoId(null); setModal(true); };

  const abrirEditar = (l: any) => {
    setForm({
      nome: l.nome || "",
      cpf: l.cpf || "",
      telefone: l.telefone || "",
      celular2: l.celular2 || "",
      celular3: l.celular3 || "",
      fixo1: l.fixo1 || "",
      fixo2: l.fixo2 || "",
      fixo3: l.fixo3 || "",
      logradouro: l.logradouro || "",
      numero: l.numero || "",
      complemento: l.complemento || "",
      bairro: l.bairro || "",
      cidade: l.cidade || "",
      uf: l.uf || "",
      dataEntrega: l.dataEntrega ? new Date(l.dataEntrega).toISOString().split("T")[0] : "",
      mes: String(l.mes || new Date().getMonth() + 1),
      ano: String(l.ano || ANO_ATUAL),
      status: l.status || "AGUARDANDO",
      valorEstimado: l.valorEstimado ? String(l.valorEstimado) : "",
      historico: l.historico || "",
      observacao: l.observacao || "",
      dataFechamento: l.dataFechamento ? new Date(l.dataFechamento).toISOString().split("T")[0] : "",
      origem: l.origem || "",
      vendedor: l.vendedor || "",
    });
    setEditandoId(l.id);
    setModal(true);
  };

  const salvar = () => {
    const payload = {
      nome: form.nome,
      cpf: form.cpf || null,
      telefone: form.telefone || null,
      celular2: form.celular2 || null,
      celular3: form.celular3 || null,
      fixo1: form.fixo1 || null,
      fixo2: form.fixo2 || null,
      fixo3: form.fixo3 || null,
      logradouro: form.logradouro || null,
      numero: form.numero || null,
      complemento: form.complemento || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      uf: form.uf || null,
      dataEntrega: form.dataEntrega || null,
      mes: form.mes ? Number(form.mes) : null,
      ano: form.ano ? Number(form.ano) : null,
      status: form.status,
      valorEstimado: form.valorEstimado ? Number(form.valorEstimado.replace(",", ".")) : null,
      historico: form.historico || null,
      observacao: form.observacao || null,
      dataFechamento: form.dataFechamento || null,
      origem: form.origem || null,
      vendedor: form.vendedor || null,
    };
    if (editandoId) {
      atualizarMut.mutate({ id: editandoId, data: payload });
    } else {
      criarMut.mutate(payload);
    }
  };

  const selecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setArquivoImport(file);
    setModalImport(true);
    e.target.value = "";
  };

  const importarExcel = async () => {
    const file = arquivoImport;
    if (!file) return;
    if (!vendedorImport.trim()) { toast.error("Selecione ou informe o vendedor responsável."); return; }
    setImportando(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      let headerRow = 0;
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        if (rows[i].some((c: any) => String(c).toLowerCase().includes("nome"))) { headerRow = i; break; }
      }
      const headers = rows[headerRow].map((h: any) => String(h).toLowerCase().trim().replace(/\s+/g, "_"));
      const isNovoFormato = headers[0] === "documento" || headers.includes("logradouro") || headers.includes("ddd_cel_1");

      const fmtFone = (ddd: any, num: any): string | null => {
        const d = String(ddd ?? "").trim();
        const n = String(num ?? "").trim();
        if (!n || n === "0") return null;
        return d ? `(${d}) ${n}` : n;
      };

      // 1. Parseia todos os payloads
      const payloads: any[] = [];
      for (let i = headerRow + 1; i < rows.length; i++) {
        const row = rows[i];
        if (isNovoFormato) {
          const cpfRaw = String(row[0] ?? "").trim();
          const nome = String(row[1] ?? "").trim();
          if (!nome) continue;
          const logradouro = [String(row[2] ?? "").trim(), String(row[3] ?? "").trim()].filter(Boolean).join(" ") || null;
          const numero = String(row[4] ?? "").trim() || null;
          const complemento = String(row[5] ?? "").trim() || null;
          const bairro = String(row[6] ?? "").trim() || null;
          const cidade = String(row[7] ?? "").trim() || null;
          const uf = String(row[8] ?? "").trim().toUpperCase() || null;
          const telefone = fmtFone(row[10], row[11]);
          const celular2 = fmtFone(row[12], row[13]);
          const celular3 = fmtFone(row[14], row[15]);
          const fixo1 = fmtFone(row[16], row[17]);
          const fixo2 = fmtFone(row[18], row[19]);
          const fixo3 = fmtFone(row[20], row[21]);
          const cpfNum = cpfRaw.replace(/\D/g, "").padStart(11, "0");
          const cpf = cpfNum.length === 11
            ? `${cpfNum.slice(0,3)}.${cpfNum.slice(3,6)}.${cpfNum.slice(6,9)}-${cpfNum.slice(9)}`
            : cpfRaw || null;
          payloads.push({ nome, cpf, telefone, celular2, celular3, fixo1, fixo2, fixo3, logradouro, numero, complemento, bairro, cidade, uf,
            mes: mesImport ? Number(mesImport) : null, ano: anoImport ? Number(anoImport) : null,
            status: "AGUARDANDO", historico: null, observacao: null, dataFechamento: null, dataEntrega: null,
            valorEstimado: null, origem: origemImport || null, vendedor: vendedorImport.trim() });
        } else {
          const nomeIdx = headers.findIndex((h: string) => h.includes("nome"));
          const telIdx = headers.findIndex((h: string) => h.includes("tel") || h.includes("fone"));
          const dataIdx = headers.findIndex((h: string) => h.includes("data") || h.includes("entrega"));
          const statusIdx = headers.findIndex((h: string) => h.includes("status"));
          const valorIdx = headers.findIndex((h: string) => h.includes("valor"));
          const nome = nomeIdx >= 0 ? String(row[nomeIdx] || "").trim() : "";
          if (!nome) continue;
          const statusRaw = statusIdx >= 0 ? String(row[statusIdx] || "").trim().toUpperCase() : "AGUARDANDO";
          const statusMap: Record<string, string> = { "AGUARDANDO": "AGUARDANDO", "SEM CONTATO": "SEM CONTATO", "EM CONTATO": "EM CONTATO", "AGENDAMENTO": "AGENDAMENTO", "FECHAMENTO": "FECHAMENTO", "RECUSADO": "RECUSADO", "ENVIADO": "ENVIADO" };
          const valorRaw = valorIdx >= 0 ? parseFloat(String(row[valorIdx] || "0").replace(",", ".")) : null;
          payloads.push({ nome, cpf: null, telefone: telIdx >= 0 ? (String(row[telIdx] || "").trim().slice(0, 30) || null) : null,
            dataEntrega: dataIdx >= 0 && row[dataIdx] ? String(row[dataIdx]) : null,
            mes: mesImport ? Number(mesImport) : null, ano: anoImport ? Number(anoImport) : null,
            status: (statusMap[statusRaw] || "AGUARDANDO") as any,
            valorEstimado: valorRaw && !isNaN(valorRaw) ? valorRaw : null,
            historico: null, observacao: null, dataFechamento: null, origem: origemImport || null, vendedor: vendedorImport.trim() });
        }
      }

      if (!payloads.length) { toast.error("Nenhum lead encontrado na planilha."); return; }

      // 2. Verifica duplicatas no servidor
      const cpfs = payloads.map(p => p.cpf ?? null);
      const nomes = payloads.map(p => p.nome);
      const encontrados = await verificarDuplicatasMut.mutateAsync({ cpfs, nomes });

      const novos: any[] = [];
      const existentes: { payload: any; leadId: number; nome: string }[] = [];

      for (const payload of payloads) {
        const match = encontrados.find((e: any) =>
          (payload.cpf && e.cpf && e.cpf === payload.cpf) ||
          e.nome.toUpperCase() === payload.nome.toUpperCase()
        );
        if (match) {
          existentes.push({ payload, leadId: match.id, nome: match.nome });
        } else {
          novos.push(payload);
        }
      }

      // 3. Se há duplicatas, mostra modal; senão importa direto
      if (existentes.length > 0) {
        setDuplicatasInfo({ novos, existentes });
        setModalImport(false);
        setArquivoImport(null);
        setImportando(false);
        setModalDuplicatas(true);
        return;
      }

      await executarImport(novos, [], "pular");
    } catch (err) {
      toast.error("Erro ao importar planilha. Verifique o formato.");
      console.error(err);
      setImportando(false);
    }
  };

  const gerarListaPdf = async () => {
    const fonte = pdfFromTable ? leads : (leadsPdfData?.leads || []);
    const leadsParaPdf = fonte.filter((l: any) => pdfSelecionados.includes(l.id));
    if (!leadsParaPdf.length) { toast.error("Nenhum lead encontrado para o período selecionado."); return; }

    const [{ default: jsPDF }, { addBarcellosHeader, addBarcellosFooter }] = await Promise.all([
      import("jspdf"),
      import("@/lib/pdfHelpers"),
    ]);

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentW = pageW - margin * 2;
    const mesLabel = MESES_FULL[Number(pdfMes) - 1] || "";
    const subtitleParts = [`${mesLabel} ${pdfAno}`, pdfVendedor !== "todos" ? pdfVendedor : ""].filter(Boolean);
    const subtitle = subtitleParts.join(" — ");

    const buildBullets = (lead: any): string[] => {
      const b: string[] = [];
      if (pdfCampos.cpf && lead.cpf) b.push(`CPF: ${lead.cpf}`);
      const fones = [
        pdfCampos.telefone && lead.telefone ? `Cel: ${lead.telefone}` : null,
        pdfCampos.celular2 && lead.celular2 ? `Cel 2: ${lead.celular2}` : null,
        pdfCampos.celular3 && lead.celular3 ? `Cel 3: ${lead.celular3}` : null,
        pdfCampos.fixo1 && lead.fixo1 ? `Fixo: ${lead.fixo1}` : null,
        pdfCampos.fixo2 && lead.fixo2 ? `Fixo 2: ${lead.fixo2}` : null,
        pdfCampos.fixo3 && lead.fixo3 ? `Fixo 3: ${lead.fixo3}` : null,
      ].filter(Boolean) as string[];
      b.push(...fones);
      if (pdfCampos.logradouro) {
        const end = [lead.logradouro, lead.numero, lead.complemento].filter(Boolean).join(", ");
        if (end) b.push(`Endereço: ${end}`);
      }
      if (pdfCampos.bairro && lead.bairro) b.push(`Bairro: ${lead.bairro}`);
      if (pdfCampos.cidade && (lead.cidade || lead.uf))
        b.push(`Cidade: ${[lead.cidade, lead.uf].filter(Boolean).join("/")}`);
      if (pdfCampos.origem && lead.origem) b.push(`Origem: ${lead.origem}`);
      if (pdfCampos.status) b.push(`Status: ${STATUS_LEAD[lead.status]?.label || lead.status}`);
      if (pdfCampos.valorEstimado && lead.valorEstimado)
        b.push(`Valor Est.: ${fmt(Number(lead.valorEstimado))}`);
      return b;
    };

    let y = addBarcellosHeader(doc, "Lista de Leads para Envio", subtitle);
    const annotH = 18;

    for (let i = 0; i < leadsParaPdf.length; i++) {
      const lead = leadsParaPdf[i];
      const bullets = buildBullets(lead);
      const cardH = 9 + bullets.length * 5 + annotH + 6;

      if (y + cardH > pageH - 18) {
        addBarcellosFooter(doc);
        doc.addPage();
        y = addBarcellosHeader(doc, "Lista de Leads para Envio", subtitle);
      }

      // Nome em destaque
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 64, 175);
      doc.text(lead.nome.toUpperCase(), margin, y + 6);
      y += 9;

      // Bullets
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(45, 45, 60);
      for (const bullet of bullets) {
        doc.text(`—  ${bullet}`, margin + 4, y + 4);
        y += 5;
      }
      y += 2;

      // Caixa de anotações
      doc.setDrawColor(200, 212, 235);
      doc.setFillColor(249, 251, 255);
      doc.roundedRect(margin, y, contentW, annotH, 2, 2, "FD");
      doc.setFontSize(6.5);
      doc.setTextColor(190, 195, 215);
      doc.text("Anotações do vendedor:", margin + 3, y + 4.5);
      y += annotH + 2;

      // Separador
      if (i < leadsParaPdf.length - 1) {
        doc.setDrawColor(218, 225, 245);
        doc.line(margin, y + 1.5, pageW - margin, y + 1.5);
        y += 5;
      }
    }

    addBarcellosFooter(doc);
    const safeName = (pdfVendedor !== "todos" ? pdfVendedor : "todos").replace(/\s+/g, "_");
    doc.save(`lista_leads_${mesLabel}_${pdfAno}_${safeName}.pdf`);

    // Marca todos os leads como ENVIADO
    const ids = leadsParaPdf.map((l: any) => l.id);
    await marcarEnviadosMut.mutateAsync({ ids });
    toast.success(`Lista gerada! ${ids.length} lead(s) marcados como ENVIADO.`);
    setPdfLeadsOpen(false);
    setLeadsSelecionados([]);
    setPdfFromTable(false);
  };

  const exportarCSV = () => {
    const rows = leads;
    const header = ["ID", "Nome", "Telefone", "Data da Entrega", "Mês", "Ano", "Status", "Valor Estimado", "Histórico"];
    const csv = [header.join(";"), ...rows.map((r: any, i: number) => [
      i + 1, r.nome, r.telefone || "", fmtDate(r.dataEntrega),
      r.mes ? MESES_FULL[r.mes - 1] : "", r.ano || "",
      STATUS_LEAD[r.status]?.label || r.status,
      r.valorEstimado ? Number(r.valorEstimado).toFixed(2).replace(".", ",") : "",
      (r.historico || "").replace(/;/g, ","),
    ].join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `crm_leads_${anoFiltro}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Relatório exportado!");
  };

  const leads = data?.leads || [];
  const leadsMensal = dadosMensal?.leads || [];
  const total = metricas?.total || 0;
  const totalMensal = metricasMensal?.total || 0;

  const navegarMes = (dir: number) => {
    let novoMes = mesSelecionado + dir;
    let novoAno = anoSelecionado;
    if (novoMes > 12) { novoMes = 1; novoAno++; }
    if (novoMes < 1) { novoMes = 12; novoAno--; }
    setMesSelecionado(novoMes);
    setAnoSelecionado(novoAno);
  };

  // Contagem por status para os cards mensais
  const contagemMensal = (key: string) => {
    const m = metricasMensal as any;
    if (!m) return 0;
    const map: Record<string, string> = {
      "AGUARDANDO": "aguardando", "SEM CONTATO": "semContato",
      "EM CONTATO": "emContato", "AGENDAMENTO": "agendamento",
      "FECHAMENTO": "fechamento", "RECUSADO": "recusado",
    };
    return Number(m[map[key]] || 0);
  };

  // Contagem por status para os cards anuais
  const contagem = (key: string) => {
    const m = metricas as any;
    if (!m) return 0;
    const map: Record<string, string> = {
      "AGUARDANDO": "aguardando", "SEM CONTATO": "semContato",
      "EM CONTATO": "emContato", "AGENDAMENTO": "agendamento",
      "FECHAMENTO": "fechamento", "RECUSADO": "recusado",
    };
    return Number(m[map[key]] || 0);
  };

  return (
    <AppLayout>
      <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM Leads</h1>
          <p className="text-muted-foreground text-sm">Gestão de leads e funil de conversão — {anoFiltro}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {leadsSelecionados.length > 0 && (
            <Button
              variant="outline"
              onClick={excluirSelecionados}
              disabled={excluirLoteMut.isPending}
              className="gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-400"
            >
              <Trash2 className="h-4 w-4" />
              {excluirLoteMut.isPending ? "Excluindo..." : `Excluir (${leadsSelecionados.length})`}
            </Button>
          )}
          <Button
            variant={leadsSelecionados.length > 0 ? "default" : "outline"}
            onClick={() => {
              if (leadsSelecionados.length > 0) {
                setPdfFromTable(true);
                setPdfSelecionados(leadsSelecionados);
              } else {
                setPdfFromTable(false);
              }
              setPdfLeadsOpen(true);
            }}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            Gerar Lista PDF{leadsSelecionados.length > 0 ? ` (${leadsSelecionados.length})` : ""}
          </Button>
          <Button variant="outline" onClick={exportarCSV} className="gap-2">
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
          <label className="cursor-pointer">
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={selecionarArquivo} />
            <Button variant="outline" asChild className="gap-2 pointer-events-none">
              <span><Upload className="h-4 w-4" /> Importar Excel</span>
            </Button>
          </label>
          <Button onClick={abrirNovo} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Lead
          </Button>
        </div>
      </div>

      {/* Busca geral */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar lead por nome, CPF ou telefone..."
          className="pl-9"
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        {busca && (
          <button onClick={() => setBusca("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="mensal">Mensal</TabsTrigger>
          <TabsTrigger value="anual">Anual</TabsTrigger>
          <TabsTrigger value="lista">Base de Leads</TabsTrigger>
        </TabsList>

        {/* ─── ABA MENSAL ─────────────────────────────────────────────── */}
        <TabsContent value="mensal" className="space-y-6 mt-4">
          {/* Seletor de mês com navegação por setas */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" onClick={() => navegarMes(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center min-w-[160px]">
                <p className="text-lg font-bold">{MESES_FULL[mesSelecionado - 1]}</p>
                <p className="text-sm text-muted-foreground">{anoSelecionado}</p>
              </div>
              <Button variant="outline" size="icon" onClick={() => navegarMes(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{totalMensal}</p>
              <p className="text-xs text-muted-foreground">leads neste mês</p>
            </div>
          </div>

          {/* Filtro por vendedor - Mensal */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">Vendedor:</span>
            <button
              onClick={() => setVendedorMensal("todos")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                vendedorMensal === "todos" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Todos
            </button>
            {vendedores.map((v) => (
              <button
                key={v}
                onClick={() => setVendedorMensal(v)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  vendedorMensal === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Funil do mês */}
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Funil de Vendas — {MESES_FULL[mesSelecionado - 1]} {anoSelecionado}{vendedorMensal !== "todos" ? ` — ${vendedorMensal}` : ""}
            </h2>
            <div className="space-y-2">
              {Object.entries(STATUS_LEAD).map(([key, val]) => {
                const count = contagemMensal(key);
                const pct = totalMensal > 0 ? Math.round((count / totalMensal) * 100) : 0;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-28 text-sm font-medium flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${val.dot}`} />
                      {val.label}
                    </div>
                    <div className="flex-1 h-7 bg-muted rounded overflow-hidden relative">
                      <div
                        className={`h-full ${val.dot} opacity-80 rounded transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                      {count > 0 && (
                        <span className="absolute inset-0 flex items-center px-2 text-xs font-bold text-white mix-blend-difference">
                          {count} ({pct}%)
                        </span>
                      )}
                    </div>
                    <span className="w-8 text-right font-bold text-sm">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cards de métricas do mês */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total de Leads",  value: totalMensal,                          icon: <Users className="h-4 w-4 text-blue-500" />,   cls: "text-foreground" },
              { label: "Em Contato",      value: contagemMensal("EM CONTATO"),         icon: <Phone className="h-4 w-4 text-blue-500" />,   cls: "text-blue-600" },
              { label: "Agendamentos",    value: contagemMensal("AGENDAMENTO"),        icon: <Calendar className="h-4 w-4 text-purple-500" />, cls: "text-purple-600" },
              { label: "Fechamentos",     value: contagemMensal("FECHAMENTO"),         icon: <CheckCircle className="h-4 w-4 text-green-500" />, cls: "text-green-600" },
              { label: "% Conversão",     value: `${metricasMensal?.taxaConversao || 0}%`, icon: <TrendingUp className="h-4 w-4 text-green-500" />, cls: "text-green-600" },
              { label: "Sem Contato",     value: contagemMensal("SEM CONTATO"),        icon: <AlertCircle className="h-4 w-4 text-orange-400" />, cls: "text-orange-600" },
              { label: "Aguardando",      value: contagemMensal("AGUARDANDO"),         icon: <Clock className="h-4 w-4 text-gray-400" />,   cls: "text-gray-600" },
              { label: "Recusado",        value: contagemMensal("RECUSADO"),           icon: <XCircle className="h-4 w-4 text-red-400" />,  cls: "text-red-600" },
            ].map(item => (
              <Card key={item.label}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    {item.icon}
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </div>
                  <p className={`text-3xl font-bold ${item.cls}`}>{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Lista de leads do mês */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{leadsMensal.length} lead{leadsMensal.length !== 1 ? "s" : ""} em {MESES_FULL[mesSelecionado - 1]}</CardTitle>
                {leadsMensal.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-400 text-xs"
                    onClick={handleExcluirTodos}
                    disabled={excluirTodosMut.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {excluirTodosMut.isPending ? "Excluindo..." : `Excluir todos (${leadsMensal.length})`}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingMensal ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : leadsMensal.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Target className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>Nenhum lead em {MESES_FULL[mesSelecionado - 1]} {anoSelecionado}</p>
                  <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={abrirNovo}>
                    <Plus className="h-4 w-4" /> Adicionar lead neste mês
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="p-3 text-left font-medium text-muted-foreground">Nome</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">Telefone</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">Data Entrega</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
                        <th className="p-3 text-right font-medium text-muted-foreground">Valor Est.</th>
                        <th className="p-3 text-center font-medium text-muted-foreground">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leadsMensal.map((lead: any) => {
                        const st = STATUS_LEAD[lead.status] || STATUS_LEAD["AGUARDANDO"];
                        return (
                          <tr key={lead.id} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="p-3 font-medium">
                              <div className="flex items-center gap-1.5">
                                <span>{lead.nome}</span>
                                {(lead.observacao || lead.historico) && (
                                  <span title={[lead.observacao, lead.historico].filter(Boolean).join(' | ')} className="flex-shrink-0 cursor-help">
                                    <MessageSquare className="h-3.5 w-3.5 text-amber-500 fill-amber-100" />
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground">{lead.telefone || "—"}</td>
                            <td className="p-3 text-muted-foreground">{fmtDate(lead.dataEntrega)}</td>
                            <td className="p-3">
                              <Badge variant="outline" className={`text-xs ${st.cls}`}>
                                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${st.dot}`} />
                                {st.label}
                              </Badge>
                            </td>
                            <td className="p-3 text-right">{lead.valorEstimado ? fmt(Number(lead.valorEstimado)) : "—"}</td>
                            <td className="p-3">
                              <div className="flex justify-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEditar(lead)}>
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                                {lead.status === "FECHAMENTO" && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" title="Cadastrar como cliente" onClick={() => cadastrarComoCliente(lead)}>
                                    <UserPlus className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
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
        </TabsContent>

        {/* ─── ABA ANUAL ──────────────────────────────────────────────────── */}
        <TabsContent value="anual" className="space-y-6 mt-4">
          {/* Seletor de ano */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" onClick={() => setAnoFiltro(a => a - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center min-w-[80px]">
                <p className="text-xl font-bold">{anoFiltro}</p>
              </div>
              <Button variant="outline" size="icon" onClick={() => setAnoFiltro(a => a + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{total}</p>
              <p className="text-xs text-muted-foreground">leads em {anoFiltro}</p>
            </div>
          </div>

          {/* Filtro por vendedor - Anual */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">Vendedor:</span>
            <button
              onClick={() => setVendedorAnual("todos")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                vendedorAnual === "todos" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Todos
            </button>
            {vendedores.map((v) => (
              <button
                key={v}
                onClick={() => setVendedorAnual(v)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  vendedorAnual === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Funil anual */}
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Funil de Vendas — {anoFiltro}{vendedorAnual !== "todos" ? ` — ${vendedorAnual}` : ""}
            </h2>
            <div className="space-y-2">
              {Object.entries(STATUS_LEAD).map(([key, val]) => {
                const count = contagem(key);
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-28 text-sm font-medium flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${val.dot}`} />
                      {val.label}
                    </div>
                    <div className="flex-1 h-7 bg-muted rounded overflow-hidden relative">
                      <div
                        className={`h-full ${val.dot} opacity-80 rounded transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                      {count > 0 && (
                        <span className="absolute inset-0 flex items-center px-2 text-xs font-bold text-white mix-blend-difference">
                          {count} ({pct}%)
                        </span>
                      )}
                    </div>
                    <span className="w-8 text-right font-bold text-sm">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cards de métricas anuais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total de Leads",  value: total,                        icon: <Users className="h-4 w-4 text-blue-500" />,   cls: "text-foreground" },
              { label: "Em Contato",      value: contagem("EM CONTATO"),       icon: <Phone className="h-4 w-4 text-blue-500" />,   cls: "text-blue-600" },
              { label: "Agendamentos",    value: contagem("AGENDAMENTO"),      icon: <Calendar className="h-4 w-4 text-purple-500" />, cls: "text-purple-600" },
              { label: "Fechamentos",     value: contagem("FECHAMENTO"),       icon: <CheckCircle className="h-4 w-4 text-green-500" />, cls: "text-green-600" },
              { label: "% Conversão",     value: `${metricas?.taxaConversao || 0}%`, icon: <TrendingUp className="h-4 w-4 text-green-500" />, cls: "text-green-600" },
              { label: "Sem Contato",     value: contagem("SEM CONTATO"),      icon: <AlertCircle className="h-4 w-4 text-orange-400" />, cls: "text-orange-600" },
              { label: "Aguardando",      value: contagem("AGUARDANDO"),       icon: <Clock className="h-4 w-4 text-gray-400" />,   cls: "text-gray-600" },
              { label: "Recusado",        value: contagem("RECUSADO"),         icon: <XCircle className="h-4 w-4 text-red-400" />,  cls: "text-red-600" },
            ].map(item => (
              <Card key={item.label}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    {item.icon}
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </div>
                  <p className={`text-3xl font-bold ${item.cls}`}>{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tabela mensal do ano */}
          {metricas?.mensal && metricas.mensal.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart2 className="h-4 w-4" /> Análise por Mês — {anoFiltro}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium text-muted-foreground">Mês</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Total</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Fechamentos</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">% Conversão</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Valor Est.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metricas.mensal.map((m: any) => (
                        <tr
                          key={`${m.ano}-${m.mes}`}
                          className="border-b hover:bg-muted/30 cursor-pointer"
                          onClick={() => { setMesSelecionado(m.mes); setAnoSelecionado(m.ano); setAba("mensal"); }}
                        >
                          <td className="py-2 font-medium">{m.mes ? MESES_FULL[m.mes - 1] : "—"}</td>
                          <td className="py-2 text-right">{m.total}</td>
                          <td className="py-2 text-right text-green-600 font-medium">{m.fechamento}</td>
                          <td className="py-2 text-right">
                            {m.total > 0 ? Math.round((m.fechamento / m.total) * 100) : 0}%
                          </td>
                          <td className="py-2 text-right">{fmt(m.totalValor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── DASHBOARD ANTIGO (renomeado para não quebrar) ─────────────── */}
        <TabsContent value="dashboard" className="space-y-6 mt-4">
          {/* Indicadores de Performance — fiel à planilha */}
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Indicadores de Performance — {anoFiltro}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total de Leads",  value: total,                        icon: <Users className="h-4 w-4 text-blue-500" />,   cls: "text-foreground" },
                { label: "Em Contato",      value: contagem("EM CONTATO"),       icon: <Phone className="h-4 w-4 text-blue-500" />,   cls: "text-blue-600" },
                { label: "Agendamentos",    value: contagem("AGENDAMENTO"),      icon: <Calendar className="h-4 w-4 text-purple-500" />, cls: "text-purple-600" },
                { label: "Fechamentos",     value: contagem("FECHAMENTO"),       icon: <CheckCircle className="h-4 w-4 text-green-500" />, cls: "text-green-600" },
                { label: "% Conversão",     value: `${metricas?.taxaConversao || 0}%`, icon: <TrendingUp className="h-4 w-4 text-green-500" />, cls: "text-green-600" },
                { label: "Sem Contato",     value: contagem("SEM CONTATO"),      icon: <AlertCircle className="h-4 w-4 text-orange-400" />, cls: "text-orange-600" },
                { label: "Aguardando",      value: contagem("AGUARDANDO"),       icon: <Clock className="h-4 w-4 text-gray-400" />,   cls: "text-gray-600" },
                { label: "Recusado",        value: contagem("RECUSADO"),         icon: <XCircle className="h-4 w-4 text-red-400" />,  cls: "text-red-600" },
              ].map(item => (
                <Card key={item.label}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-1">
                      {item.icon}
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                    </div>
                    <p className={`text-3xl font-bold ${item.cls}`}>{item.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Análise por Status (barras) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Análise por Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(STATUS_LEAD).map(([key, val]) => {
                const count = contagem(key);
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${val.dot}`} />
                        <span className="font-medium">{val.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground text-xs">{pct}%</span>
                        <span className="font-bold w-8 text-right">{count}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${val.dot} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {(metricas?.totalValorEstimado || 0) > 0 && (
                <div className="pt-2 border-t text-sm flex justify-between">
                  <span className="text-muted-foreground">Valor Estimado Total</span>
                  <span className="font-bold">{fmt(metricas?.totalValorEstimado)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Análise Mensal */}
          {metricas?.mensal && metricas.mensal.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Análise por Mês — {anoFiltro}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium text-muted-foreground">Mês</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Total</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Fechamentos</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">% Conversão</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Valor Est.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metricas.mensal.map((m: any) => (
                        <tr key={`${m.ano}-${m.mes}`} className="border-b hover:bg-muted/30">
                          <td className="py-2">{m.mes ? MESES_FULL[m.mes - 1] : "—"}</td>
                          <td className="py-2 text-right">{m.total}</td>
                          <td className="py-2 text-right text-green-600 font-medium">{m.fechamento}</td>
                          <td className="py-2 text-right">
                            {m.total > 0 ? Math.round((m.fechamento / m.total) * 100) : 0}%
                          </td>
                          <td className="py-2 text-right">{fmt(m.totalValor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── BASE DE LEADS ──────────────────────────────────────────────── */}
        <TabsContent value="lista" className="space-y-4 mt-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-3">
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {Object.entries(STATUS_LEAD).map(([key, val]) => (
                  <SelectItem key={key} value={key}>{val.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={mesFiltro} onValueChange={setMesFiltro}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Mês" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os meses</SelectItem>
                {MESES_FULL.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {vendedores.length > 0 && (
              <Select value={vendedorFiltro} onValueChange={setVendedorFiltro}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Vendedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os vendedores</SelectItem>
                  {vendedores.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {origens.length > 0 && (
              <Select value={origemFiltro} onValueChange={setOrigemFiltro}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Origem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as origens</SelectItem>
                  {origens.map(o => <SelectItem key={o.id} value={o.nome}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">De:</Label>
              <Input type="date" className="w-36" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Até:</Label>
              <Input type="date" className="w-36" value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
            {(dataInicio || dataFim) && (
              <Button variant="ghost" size="sm" onClick={() => { setDataInicio(""); setDataFim(""); }} className="text-muted-foreground">
                <X className="h-4 w-4 mr-1" /> Limpar datas
              </Button>
            )}
            {ufsData.length > 0 && (
              <Select value={ufFiltro} onValueChange={setUfFiltro}>
                <SelectTrigger className="w-28"><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos UFs</SelectItem>
                  {ufsData.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {cidadesData.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-48 justify-between font-normal text-sm">
                    {cidadesFiltro.length === 0
                      ? "Todas as cidades"
                      : cidadesFiltro.length === 1
                      ? cidadesFiltro[0]
                      : `${cidadesFiltro.length} cidades`}
                    {cidadesFiltro.length > 0 && (
                      <span
                        className="ml-1 text-muted-foreground hover:text-foreground"
                        onClick={e => { e.stopPropagation(); setCidadesFiltro([]); }}
                      >
                        <X className="h-3 w-3" />
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <div className="max-h-60 overflow-y-auto space-y-0.5">
                    {cidadesData.map(c => (
                      <label key={c} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer">
                        <Checkbox
                          checked={cidadesFiltro.includes(c)}
                          onCheckedChange={v => setCidadesFiltro(sel =>
                            v ? [...sel, c] : sel.filter(x => x !== c)
                          )}
                        />
                        <span className="text-sm">{c}</span>
                      </label>
                    ))}
                  </div>
                  {cidadesFiltro.length > 0 && (
                    <button
                      className="mt-2 w-full text-xs text-center text-blue-600 hover:underline"
                      onClick={() => setCidadesFiltro([])}
                    >
                      Limpar seleção
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setModalOrigens(true)}>
              <Settings2 className="h-4 w-4" /> Origens
            </Button>
          </div>

          {/* Tabela */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{leads.length} lead{leads.length !== 1 ? "s" : ""}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : leads.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>Nenhum lead encontrado</p>
                  <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={abrirNovo}>
                    <Plus className="h-4 w-4" /> Adicionar primeiro lead
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="p-3 w-10">
                          <Checkbox
                            checked={leads.length > 0 && leadsSelecionados.length === leads.length}
                            onCheckedChange={v => setLeadsSelecionados(v ? leads.map((l: any) => l.id) : [])}
                          />
                        </th>
                        <th className="p-3 text-left font-medium text-muted-foreground">#</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">Nome</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">Telefones</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">Localização</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">Origem</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">Vendedor</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">Mês/Ano</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
                        <th className="p-3 text-center font-medium text-muted-foreground">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((lead: any, idx: number) => {
                        const st = STATUS_LEAD[lead.status] || STATUS_LEAD["AGUARDANDO"];
                        return (
                          <tr
                            key={lead.id}
                            className={`border-b hover:bg-muted/30 transition-colors ${leadsSelecionados.includes(lead.id) ? "bg-blue-50/60" : ""}`}
                          >
                            <td className="p-3">
                              <Checkbox
                                checked={leadsSelecionados.includes(lead.id)}
                                onCheckedChange={v => setLeadsSelecionados(sel =>
                                  v ? [...sel, lead.id] : sel.filter(id => id !== lead.id)
                                )}
                              />
                            </td>
                            <td className="p-3 text-muted-foreground text-xs">{idx + 1}</td>
                            <td className="p-3 font-medium">
                              <div className="flex items-center gap-1.5">
                                <span>{lead.nome}</span>
                                {(lead.observacao || lead.historico) && (
                                  <span title={[lead.observacao, lead.historico].filter(Boolean).join(' | ')} className="flex-shrink-0 cursor-help">
                                    <MessageSquare className="h-3.5 w-3.5 text-amber-500 fill-amber-100" />
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              <div className="space-y-0.5">
                                {[lead.telefone, lead.celular2, lead.celular3, lead.fixo1, lead.fixo2, lead.fixo3]
                                  .filter(Boolean)
                                  .map((t, i) => (
                                    <div key={i} className="flex items-center gap-1 whitespace-nowrap">
                                      <Phone className="h-3 w-3 shrink-0" /> {t}
                                    </div>
                                  ))
                                }
                                {!lead.telefone && !lead.celular2 && !lead.celular3 && !lead.fixo1 && "—"}
                              </div>
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {lead.cidade || lead.uf ? (
                                <div>
                                  {lead.cidade && <div className="font-medium text-foreground">{lead.cidade}{lead.uf ? `/${lead.uf}` : ""}</div>}
                                  {lead.bairro && <div className="text-xs">{lead.bairro}</div>}
                                </div>
                              ) : "—"}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {lead.origem ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">{lead.origem}</span>
                              ) : "—"}
                            </td>
                            <td className="p-3 text-muted-foreground text-xs">{lead.vendedor || "—"}</td>
                            <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                              {lead.mes ? MESES_ABREV[lead.mes - 1] : "—"}{lead.ano ? `/${lead.ano}` : ""}
                            </td>
                            <td className="p-3">
                              <Badge className={`${st.cls} border text-xs`}>{st.label}</Badge>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => abrirEditar(lead)}
                                  className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                                  title="Editar lead"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => cadastrarComoCliente(lead)}
                                  className="p-1.5 hover:bg-green-50 rounded text-muted-foreground hover:text-green-600 transition-colors"
                                  title="Cadastrar como cliente na Base de Clientes"
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm(`Remover lead "${lead.nome}"?`)) {
                                      excluirMut.mutate({ id: lead.id });
                                    }
                                  }}
                                  className="p-1.5 hover:bg-red-50 rounded text-muted-foreground hover:text-red-600 transition-colors"
                                  title="Excluir lead"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
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
        </TabsContent>
      </Tabs>

      {/* ─── Modal de inserção/edição ─────────────────────────────────────── */}
      <Dialog open={modal} onOpenChange={v => { setModal(v); if (!v) { setEditandoId(null); setForm(FORM_VAZIO); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editandoId ? "Editar Lead" : "Novo Lead"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label>Nome <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Nome completo do lead"
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              />
            </div>

            {/* CPF */}
            <div className="space-y-1.5">
              <Label>CPF</Label>
              <Input
                placeholder="000.000.000-00"
                value={form.cpf}
                onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))}
              />
            </div>

            {/* Telefones */}
            <div className="space-y-1.5">
              <Label>Celular 1</Label>
              <Input placeholder="(47) 99999-9999" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Celular 2</Label>
                <Input placeholder="(47) 99999-9999" value={form.celular2} onChange={e => setForm(f => ({ ...f, celular2: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Celular 3</Label>
                <Input placeholder="(47) 99999-9999" value={form.celular3} onChange={e => setForm(f => ({ ...f, celular3: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Fixo 1</Label>
                <Input placeholder="(47) 3333-4444" value={form.fixo1} onChange={e => setForm(f => ({ ...f, fixo1: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Fixo 2</Label>
                <Input placeholder="(47) 3333-4444" value={form.fixo2} onChange={e => setForm(f => ({ ...f, fixo2: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Fixo 3</Label>
                <Input placeholder="(47) 3333-4444" value={form.fixo3} onChange={e => setForm(f => ({ ...f, fixo3: e.target.value }))} />
              </div>
            </div>

            {/* Endereço */}
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Endereço</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Logradouro</Label>
                  <Input placeholder="Rua das Flores" value={form.logradouro} onChange={e => setForm(f => ({ ...f, logradouro: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Número</Label>
                  <Input placeholder="123" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Complemento</Label>
                  <Input placeholder="Apto 201" value={form.complemento} onChange={e => setForm(f => ({ ...f, complemento: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Bairro</Label>
                  <Input placeholder="Centro" value={form.bairro} onChange={e => setForm(f => ({ ...f, bairro: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Cidade</Label>
                  <Input placeholder="Joinville" value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">UF</Label>
                  <Input placeholder="SC" maxLength={2} value={form.uf} onChange={e => setForm(f => ({ ...f, uf: e.target.value.toUpperCase() }))} />
                </div>
              </div>
            </div>

            {/* Data da Entrega */}
            <div className="space-y-1.5">
              <Label>Data da Entrega</Label>
              <Input
                type="date"
                value={form.dataEntrega}
                onChange={e => setForm(f => ({ ...f, dataEntrega: e.target.value }))}
              />
            </div>

            {/* Mês e Ano */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Mês</Label>
                <Select value={form.mes} onValueChange={v => setForm(f => ({ ...f, mes: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MESES_FULL.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ano</Label>
                <Input
                  type="number"
                  value={form.ano}
                  onChange={e => setForm(f => ({ ...f, ano: e.target.value }))}
                  min={2015}
                  max={2050}
                />
              </div>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as LeadForm["status"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LEAD).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${val.dot}`} />
                        {val.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Valor Estimado */}
            <div className="space-y-1.5">
              <Label>Valor Estimado (R$)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={form.valorEstimado}
                onChange={e => setForm(f => ({ ...f, valorEstimado: e.target.value }))}
              />
            </div>

            {/* Histórico */}
            <div className="space-y-1.5">
              <Label>Histórico / Observações de Contato</Label>
              <Textarea
                placeholder="Registre aqui o histórico de contatos, tentativas, respostas..."
                value={form.historico}
                onChange={e => setForm(f => ({ ...f, historico: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Data de Fechamento */}
            {(form.status === "FECHAMENTO" || form.status === "RECUSADO") && (
              <div className="space-y-1.5">
                <Label>Data de Fechamento</Label>
                <Input
                  type="date"
                  value={form.dataFechamento}
                  onChange={e => setForm(f => ({ ...f, dataFechamento: e.target.value }))}
                />
              </div>
            )}

            {/* Origem */}
            <div className="space-y-1.5">
              <Label>Origem do Lead</Label>
              <Select value={form.origem || "_none"} onValueChange={v => setForm(f => ({ ...f, origem: v === "_none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem origem</SelectItem>
                  {origens.map(o => <SelectItem key={o.id} value={o.nome}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Vendedor */}
            <div className="space-y-1.5">
              <Label>Vendedor Responsável</Label>
              <Select value={form.vendedor || "_none"} onValueChange={v => setForm(f => ({ ...f, vendedor: v === "_none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o vendedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem vendedor</SelectItem>
                  {vendedores.map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Observação interna */}
            <div className="space-y-1.5">
              <Label>Observação Interna</Label>
              <Textarea
                placeholder="Observações internas..."
                value={form.observacao}
                onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setModal(false); setEditandoId(null); }}>Cancelar</Button>
            <Button
              onClick={salvar}
              disabled={!form.nome.trim() || criarMut.isPending || atualizarMut.isPending}
            >
              {criarMut.isPending || atualizarMut.isPending ? "Salvando..." : editandoId ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

    {/* ─── Modal de Gestão de Origens ─────────────────────────────────────── */}
    <Dialog open={modalOrigens} onOpenChange={setModalOrigens}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar Origens de Leads</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Input
              placeholder="Nova origem (ex: Evento, Parceria...)"
              value={novaOrigem}
              onChange={e => setNovaOrigem(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && novaOrigem.trim()) { criarOrigemMut.mutate({ nome: novaOrigem.trim() }); } }}
            />
            <Button
              onClick={() => { if (novaOrigem.trim()) criarOrigemMut.mutate({ nome: novaOrigem.trim() }); }}
              disabled={!novaOrigem.trim() || criarOrigemMut.isPending}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {origens.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma origem cadastrada</p>
            ) : origens.map(o => (
              <div key={o.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/40 hover:bg-muted/70 group">
                <span className="text-sm">{o.nome}</span>
                <button
                  onClick={() => { if (confirm(`Remover origem "${o.nome}"?`)) excluirOrigemMut.mutate({ id: o.id }); }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded text-muted-foreground hover:text-red-600 transition-all"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setModalOrigens(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ─── Modal de Confirmação de Importação ─────────────────────────────── */}
    <Dialog open={modalImport} onOpenChange={v => { if (!v) { setModalImport(false); setArquivoImport(null); setVendedorImport(""); setOrigemImport(""); setMesImport(String(new Date().getMonth() + 1)); setAnoImport(String(ANO_ATUAL)); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar Leads</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {arquivoImport && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 border">
              <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm truncate">{arquivoImport.name}</span>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Vendedor Responsável <span className="text-red-500">*</span></Label>
            <Select value={vendedorImport || "_none"} onValueChange={v => setVendedorImport(v === "_none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o vendedor..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none" disabled>Selecione o vendedor</SelectItem>
                {vendedores.map(v => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mês de Referência</Label>
              <Select value={mesImport} onValueChange={setMesImport}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES_FULL.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ano</Label>
              <Input
                type="number"
                value={anoImport}
                onChange={e => setAnoImport(e.target.value)}
                min={2020}
                max={2050}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Origem dos Leads <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Select value={origemImport || "_none"} onValueChange={v => setOrigemImport(v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Sem origem definida</SelectItem>
                {origens.map(o => <SelectItem key={o.id} value={o.nome}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setModalImport(false); setArquivoImport(null); setVendedorImport(""); setOrigemImport(""); }}>Cancelar</Button>
          <Button
            onClick={importarExcel}
            disabled={!vendedorImport.trim() || importando}
          >
            {importando ? "Importando..." : "Confirmar Importação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {/* ─── Dialog: Gerar Lista PDF para Vendedor ────────────────────────── */}
    <Dialog open={pdfLeadsOpen} onOpenChange={setPdfLeadsOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerar Lista de Leads — PDF</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {pdfFromTable ? (
            <p className="text-xs bg-blue-50 text-blue-700 rounded px-3 py-2">
              {leadsSelecionados.length} lead(s) selecionados da tabela
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Mês base</Label>
                  <Select value={pdfMes} onValueChange={setPdfMes}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MESES_FULL.map((m, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ano</Label>
                  <Input type="number" value={pdfAno} onChange={e => setPdfAno(e.target.value)} min={2020} max={2050} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Vendedor</Label>
                <Select value={pdfVendedor} onValueChange={setPdfVendedor}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os vendedores</SelectItem>
                    {vendedores.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Campos a exibir</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "cpf",          label: "CPF" },
                { key: "telefone",     label: "Celular 1" },
                { key: "celular2",     label: "Celular 2" },
                { key: "celular3",     label: "Celular 3" },
                { key: "fixo1",        label: "Fixo 1" },
                { key: "fixo2",        label: "Fixo 2" },
                { key: "fixo3",        label: "Fixo 3" },
                { key: "logradouro",   label: "Endereço" },
                { key: "bairro",       label: "Bairro" },
                { key: "cidade",       label: "Cidade/UF" },
                { key: "origem",       label: "Origem" },
                { key: "status",       label: "Status" },
                { key: "valorEstimado",label: "Valor Est." },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox
                    checked={pdfCampos[key as keyof typeof pdfCampos]}
                    onCheckedChange={v => setPdfCampos(c => ({ ...c, [key]: !!v }))}
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>
          {!pdfFromTable && (
            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Leads {fetchingPdf ? "carregando..." : `(${pdfSelecionados.length}/${leadsPdfData?.leads?.length ?? 0} selecionados)`}
                </p>
                {!fetchingPdf && (leadsPdfData?.leads?.length ?? 0) > 0 && (
                  <div className="flex gap-2">
                    <button className="text-xs text-blue-600 hover:underline" onClick={() => setPdfSelecionados((leadsPdfData?.leads || []).map((l: any) => l.id))}>Todos</button>
                    <span className="text-muted-foreground text-xs">|</span>
                    <button className="text-xs text-blue-600 hover:underline" onClick={() => setPdfSelecionados([])}>Nenhum</button>
                  </div>
                )}
              </div>
              {fetchingPdf ? (
                <p className="text-xs text-muted-foreground text-center py-3">Carregando...</p>
              ) : (leadsPdfData?.leads?.length ?? 0) === 0 ? (
                <p className="text-xs text-center text-muted-foreground py-3">Nenhum lead no período selecionado.</p>
              ) : (
                <div className="max-h-52 overflow-y-auto space-y-0.5 border rounded-md p-2 bg-muted/20">
                  {(leadsPdfData?.leads || []).map((lead: any) => {
                    const temFone = !!(lead.telefone || lead.celular2 || lead.celular3 || lead.fixo1);
                    return (
                      <label key={lead.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                        <Checkbox
                          checked={pdfSelecionados.includes(lead.id)}
                          onCheckedChange={v => setPdfSelecionados(sel =>
                            v ? [...sel, lead.id] : sel.filter(id => id !== lead.id)
                          )}
                        />
                        <span className={`text-sm font-medium flex-1 ${!temFone ? "text-muted-foreground" : ""}`}>{lead.nome}</span>
                        {!temFone && <span className="text-xs text-orange-400">sem fone</span>}
                        {lead.telefone && <span className="text-xs text-muted-foreground">{lead.telefone}</span>}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {pdfSelecionados.length > 0 && (
            <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1.5">
              {pdfSelecionados.length} lead(s) serão marcados como <strong>ENVIADO</strong> ao gerar.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPdfLeadsOpen(false)}>Cancelar</Button>
          <Button
            onClick={gerarListaPdf}
            disabled={fetchingPdf || pdfSelecionados.length === 0 || marcarEnviadosMut.isPending}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            {marcarEnviadosMut.isPending ? "Salvando..." : "Gerar PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ── Modal: Duplicatas na Importação ─────────────────────────────── */}
    <Dialog open={modalDuplicatas} onOpenChange={v => { if (!v) setModalDuplicatas(false); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Leads já existem no sistema</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {duplicatasInfo.existentes.length > 0 && (
            <div>
              <p className="text-sm font-medium text-orange-700 mb-1">
                {duplicatasInfo.existentes.length} lead(s) já cadastrado(s):
              </p>
              <ul className="text-sm text-gray-700 space-y-0.5 max-h-40 overflow-y-auto border rounded p-2 bg-orange-50">
                {duplicatasInfo.existentes.map((e, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <span className="text-orange-500">•</span> {e.nome}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {duplicatasInfo.novos.length > 0 && (
            <p className="text-sm text-gray-600">
              <span className="font-medium text-green-700">{duplicatasInfo.novos.length} novo(s)</span> serão criados.
            </p>
          )}
          {duplicatasInfo.novos.length === 0 && (
            <p className="text-sm text-gray-500">Nenhum lead novo para criar.</p>
          )}
          <p className="text-sm text-gray-500 pt-1">O que deseja fazer com os existentes?</p>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => setModalDuplicatas(false)}
          >
            Cancelar
          </Button>
          {duplicatasInfo.novos.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => executarImport(duplicatasInfo.novos, [], "pular")}
            >
              Criar apenas os novos ({duplicatasInfo.novos.length})
            </Button>
          )}
          <Button
            onClick={() => executarImport(duplicatasInfo.novos, duplicatasInfo.existentes, "atualizar")}
          >
            Atualizar existentes{duplicatasInfo.novos.length > 0 ? ` e criar novos` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </AppLayout>
  );
}

import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, MessageCircle, RefreshCw, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const MESES_NOMES = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Configuração padrão — apenas as 3 corretoras principais
const CONFIG_PADRAO = [
  { corretor: "ELISIA",   apelido: "Mãe",      emoji: "👩‍💼" },
  { corretor: "FERNANDA", apelido: "Fernanda",  emoji: "👩‍💼" },
  { corretor: "NAYARA",   apelido: "Nayara",    emoji: "👩‍💼" },
];

const STORAGE_KEY = "mensagem_diaria_config";

type CorretorConfig = { corretor: string; apelido: string; emoji: string };

function fmtSimples(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(v);
}

export default function MensagemDiaria() {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [copiado, setCopiado] = useState(false);
  const [editandoTexto, setEditandoTexto] = useState(false);
  const [textoEditado, setTextoEditado] = useState("");
  const [editandoConfig, setEditandoConfig] = useState(false);
  const [config, setConfig] = useState<CorretorConfig[]>(() => {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      return salvo ? JSON.parse(salvo) : CONFIG_PADRAO;
    } catch {
      return CONFIG_PADRAO;
    }
  });
  const [novoCorretor, setNovoCorretor] = useState("");

  // Salva config no localStorage sempre que mudar
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const { data, isLoading, refetch } = trpc.mensagemDiaria.buscarDados.useQuery(
    { mes, ano },
    { refetchOnWindowFocus: false }
  );

  // Gera o texto da mensagem automaticamente com base nos dados e config
  const mensagemGerada = useMemo(() => {
    if (!data) return "";

    const nomeMes = MESES_NOMES[mes] || `Mês ${mes}`;
    const linhas: string[] = [];

    linhas.push("🚨 ‼️ atualização diária ‼️🚨");
    linhas.push("");

    // ── Resultado do mês ──────────────────────────────────────────────────────
    linhas.push(`💰 RESULTADO ${nomeMes.toUpperCase()}`);
    linhas.push(` R$ ${fmtSimples(data.receitaMes)}`);

    for (const cfg of config) {
      const d = data.porCorretorMes.find(r => r.corretor === cfg.corretor);
      if (d) {
        linhas.push(`${cfg.apelido} ${cfg.emoji} ${fmtSimples(d.receita)}`);
      }
    }
    linhas.push("");

    // ── Total no ano ──────────────────────────────────────────────────────────
    linhas.push("🐓 Total ano 🐓");
    linhas.push(`R💲 ${fmtSimples(data.receitaAno)}`);

    for (const cfg of config) {
      const d = data.porCorretorAno.find(r => r.corretor === cfg.corretor);
      if (d) {
        linhas.push(`${cfg.apelido} ${cfg.emoji} R$ ${fmtSimples(d.receita)} / ${d.percentualAno}% `);
      }
    }
    linhas.push("");

    // ── Propostas aceitas ─────────────────────────────────────────────────────
    linhas.push(`📋 🖌️ Propostas: ${data.propostasMes} aceitas.`);
    for (const cfg of config) {
      const d = data.porCorretorMes.find(r => r.corretor === cfg.corretor);
      if (d && d.propostas > 0) {
        linhas.push(`${cfg.apelido} ${cfg.emoji} ${d.propostas}`);
      }
    }
    linhas.push("");

    // ── CPFs novos ────────────────────────────────────────────────────────────
    linhas.push(`🆔 CPF novos ${data.cpfsNovosMes}`);
    for (const cfg of config) {
      const d = data.porCorretorMes.find(r => r.corretor === cfg.corretor);
      if (d && d.cpfsNovos > 0) {
        linhas.push(`${cfg.apelido} ${cfg.emoji} ${d.cpfsNovos}`);
      }
    }

    return linhas.join("\n");
  }, [data, mes, config]);

  // Quando os dados chegam, reseta o texto editado
  useEffect(() => {
    setTextoEditado(mensagemGerada);
    setEditandoTexto(false);
  }, [mensagemGerada]);

  const textoAtual = editandoTexto ? textoEditado : mensagemGerada;

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(textoAtual);
      setCopiado(true);
      toast.success("Mensagem copiada! Cole no WhatsApp.");
      setTimeout(() => setCopiado(false), 3000);
    } catch {
      toast.error("Erro ao copiar. Selecione o texto manualmente.");
    }
  };

  const mesAnterior = () => {
    if (mes === 1) { setMes(12); setAno(a => a - 1); }
    else setMes(m => m - 1);
  };
  const mesSeguinte = () => {
    if (mes === 12) { setMes(1); setAno(a => a + 1); }
    else setMes(m => m + 1);
  };

  // Corretores disponíveis nos dados (que não estão na config)
  const corretoresDisponiveis = useMemo(() => {
    if (!data) return [];
    const todos = new Set([
      ...data.porCorretorMes.map(r => r.corretor),
      ...data.porCorretorAno.map(r => r.corretor),
    ]);
    const naConfig = new Set(config.map(c => c.corretor));
    return Array.from(todos).filter(c => !naConfig.has(c)).sort();
  }, [data, config]);

  const adicionarCorretor = (corretor: string) => {
    if (!corretor) return;
    const nome = corretor.trim().toUpperCase();
    if (config.find(c => c.corretor === nome)) return;
    setConfig(prev => [...prev, { corretor: nome, apelido: nome.charAt(0) + nome.slice(1).toLowerCase(), emoji: "👩‍💼" }]);
    setNovoCorretor("");
  };

  const removerCorretor = (corretor: string) => {
    setConfig(prev => prev.filter(c => c.corretor !== corretor));
  };

  const atualizarConfig = (corretor: string, campo: "apelido" | "emoji", valor: string) => {
    setConfig(prev => prev.map(c => c.corretor === corretor ? { ...c, [campo]: valor } : c));
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-green-600" />
              Mensagem Diária
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Resumo automático para enviar no grupo — dados do Controle de Vendas
            </p>
          </div>

          {/* Seletor de mês */}
          <div className="flex items-center gap-2 bg-white border rounded-xl px-3 py-2 shadow-sm">
            <button onClick={mesAnterior} className="p-1 rounded hover:bg-gray-100 transition-colors">
              <ChevronLeft className="w-4 h-4 text-gray-500" />
            </button>
            <span className="font-semibold text-gray-700 min-w-[130px] text-center text-sm">
              {MESES_NOMES[mes]} {ano}
            </span>
            <button onClick={mesSeguinte} className="p-1 rounded hover:bg-gray-100 transition-colors">
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Preview / Editor da mensagem */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-gray-700 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-green-500" />
                  {editandoTexto ? "Editando Mensagem" : "Preview da Mensagem"}
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={isLoading}
                    className="h-8 text-xs"
                  >
                    <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? "animate-spin" : ""}`} />
                    Atualizar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!editandoTexto) {
                        setTextoEditado(mensagemGerada);
                        setEditandoTexto(true);
                      } else {
                        setEditandoTexto(false);
                      }
                    }}
                    className="h-8 text-xs"
                  >
                    <Pencil className="w-3 h-3 mr-1" />
                    {editandoTexto ? "Ver Preview" : "Editar"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="flex items-center justify-center h-48 text-gray-400">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                  Carregando dados...
                </div>
              ) : editandoTexto ? (
                /* Área de edição livre */
                <textarea
                  value={textoEditado}
                  onChange={e => setTextoEditado(e.target.value)}
                  className="w-full h-72 text-sm font-mono border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-green-400 resize-none bg-gray-50"
                  placeholder="Edite a mensagem aqui..."
                />
              ) : (
                /* Balão estilo WhatsApp */
                <div className="bg-[#e5ddd5] rounded-xl p-4 min-h-[200px] shadow-inner">
                  <div className="bg-white rounded-xl rounded-tl-none p-3 shadow-sm">
                    {mensagemGerada ? (
                      <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
                        {mensagemGerada}
                      </pre>
                    ) : (
                      <span className="text-gray-400 italic text-xs">
                        Nenhum dado encontrado para {MESES_NOMES[mes]} {ano}.
                        Importe as vendas para gerar a mensagem.
                      </span>
                    )}
                  </div>
                </div>
              )}

              <Button
                onClick={handleCopiar}
                disabled={!textoAtual || isLoading}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
              >
                {copiado ? (
                  <><Check className="w-4 h-4 mr-2" /> Copiado!</>
                ) : (
                  <><Copy className="w-4 h-4 mr-2" /> Copiar para WhatsApp</>
                )}
              </Button>

              {editandoTexto && (
                <p className="text-xs text-amber-600 text-center">
                  ⚠️ Você está editando manualmente. Clique em "Ver Preview" para voltar ao automático.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Painel direito */}
          <div className="space-y-4">
            {/* Cards de resumo */}
            {data && (
              <div className="grid grid-cols-2 gap-3">
                <Card className="shadow-sm">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-gray-500 font-medium">Receita {MESES_NOMES[mes]}</p>
                    <p className="text-xl font-bold text-blue-700 mt-0.5">{fmt(data.receitaMes)}</p>
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-gray-500 font-medium">Total no Ano {ano}</p>
                    <p className="text-xl font-bold text-green-700 mt-0.5">{fmt(data.receitaAno)}</p>
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-gray-500 font-medium">Propostas {MESES_NOMES[mes]}</p>
                    <p className="text-xl font-bold text-purple-700 mt-0.5">{data.propostasMes}</p>
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-gray-500 font-medium">CPFs Novos {MESES_NOMES[mes]}</p>
                    <p className="text-xl font-bold text-orange-700 mt-0.5">{data.cpfsNovosMes}</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Configuração de corretoras */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-gray-700">
                    Corretoras na Mensagem
                  </CardTitle>
                  <button
                    onClick={() => setEditandoConfig(!editandoConfig)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {editandoConfig ? "Fechar" : "Editar"}
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {editandoConfig ? (
                  <>
                    {config.map(cfg => (
                      <div key={cfg.corretor} className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-20 truncate font-mono">{cfg.corretor}</span>
                        <input
                          type="text"
                          value={cfg.apelido}
                          onChange={e => atualizarConfig(cfg.corretor, "apelido", e.target.value)}
                          placeholder="Apelido"
                          className="flex-1 text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <input
                          type="text"
                          value={cfg.emoji}
                          onChange={e => atualizarConfig(cfg.corretor, "emoji", e.target.value)}
                          placeholder="Emoji"
                          className="w-12 text-xs border rounded px-2 py-1 text-center focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <button
                          onClick={() => removerCorretor(cfg.corretor)}
                          className="p-1 text-red-400 hover:text-red-600"
                          title="Remover"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    {/* Adicionar corretor */}
                    <div className="pt-2 border-t">
                      <p className="text-xs text-gray-500 mb-1.5 font-medium">Adicionar corretor:</p>
                      {corretoresDisponiveis.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {corretoresDisponiveis.map(c => (
                            <button
                              key={c}
                              onClick={() => adicionarCorretor(c)}
                              className="text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded px-2 py-0.5 hover:bg-blue-100"
                            >
                              + {c}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={novoCorretor}
                          onChange={e => setNovoCorretor(e.target.value.toUpperCase())}
                          placeholder="Nome do corretor (ex: TAINÁ)"
                          className="flex-1 text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          onKeyDown={e => e.key === "Enter" && adicionarCorretor(novoCorretor)}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => adicionarCorretor(novoCorretor)}
                          className="h-7 text-xs"
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-1.5">
                    {config.map(cfg => (
                      <div key={cfg.corretor} className="flex items-center gap-2 text-sm">
                        <span className="text-lg">{cfg.emoji}</span>
                        <span className="font-medium text-gray-700">{cfg.apelido}</span>
                        <span className="text-xs text-gray-400">({cfg.corretor})</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Instrução rápida */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800">
              <p className="font-semibold mb-1">Como usar:</p>
              <ol className="list-decimal list-inside space-y-0.5 text-green-700">
                <li>Selecione o mês de referência</li>
                <li>Se precisar ajustar o texto, clique em <strong>Editar</strong></li>
                <li>Clique em <strong>Copiar para WhatsApp</strong> e cole no grupo</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

import AppLayout from "@/components/AppLayout";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Search, Edit2, Clock, AlertTriangle, CheckCircle, XCircle,
  Download, Phone, ArrowRight, Users, ChevronRight, Eye, Calendar, FileText
} from "lucide-react";

// ─── Colunas da esteira (fiel à planilha) ───────────────────────────────────
const COLUNAS = [
  {
    key: "AGUARDANDO",
    label: "AGUARDANDO",
    desc: "Beneficiários aguardando (< 2 meses do pagamento)",
    headerCls: "bg-gray-100 border-gray-300",
    badgeCls: "bg-gray-100 text-gray-700 border-gray-300",
    dotCls: "bg-gray-400",
    icon: <Clock className="h-4 w-4 text-gray-500" />,
  },
  {
    key: "ENTRAR EM CONTATO",
    label: "ENTRAR EM CONTATO",
    desc: "Prontos para abordagem (≥ 2 meses após pagamento)",
    headerCls: "bg-yellow-50 border-yellow-300",
    badgeCls: "bg-yellow-100 text-yellow-800 border-yellow-300",
    dotCls: "bg-yellow-500",
    icon: <AlertTriangle className="h-4 w-4 text-yellow-600" />,
  },
  {
    key: "FECHADO",
    label: "FECHADO",
    desc: "Contato realizado e proposta fechada",
    headerCls: "bg-green-50 border-green-300",
    badgeCls: "bg-green-100 text-green-700 border-green-300",
    dotCls: "bg-green-500",
    icon: <CheckCircle className="h-4 w-4 text-green-600" />,
  },
  {
    key: "RECUSADO",
    label: "RECUSADO",
    desc: "Contato realizado, proposta recusada",
    headerCls: "bg-red-50 border-red-300",
    badgeCls: "bg-red-100 text-red-700 border-red-300",
    dotCls: "bg-red-500",
    icon: <XCircle className="h-4 w-4 text-red-600" />,
  },
];

const formatDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
};

type Beneficiario = {
  id: number;
  nome: string;
  telefone?: string | null;
  nomeSegurado?: string | null;
  statusSinistro?: string | null;
  statusCRM: string;
  historico?: string | null;
  dataFechamento?: string | Date | null;
  observacao?: string | null;
  createdAt: Date;
  diasDesde?: number;
  deveEntrarEmContato?: boolean;
};

export default function CrmBeneficiarios() {
  const utils = trpc.useUtils();
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState(false);
  const [modalVer, setModalVer] = useState(false);
  const [editando, setEditando] = useState<Beneficiario | null>(null);
  const [vendo, setVendo] = useState<Beneficiario | null>(null);
  const [form, setForm] = useState({
    statusCRM: "AGUARDANDO",
    historico: "",
    dataFechamento: "",
    observacao: "",
  });

  const { data, isLoading } = trpc.crmBeneficiarios.listar.useQuery({
    busca: busca || undefined,
  });
  const { data: metricas } = trpc.crmBeneficiarios.metricas.useQuery();

  const atualizarMut = trpc.crmBeneficiarios.atualizar.useMutation({
    onSuccess: () => {
      utils.crmBeneficiarios.listar.invalidate();
      utils.crmBeneficiarios.metricas.invalidate();
      toast.success("Beneficiário atualizado!");
      setModal(false);
      setEditando(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const abrirVer = (b: Beneficiario) => {
    setVendo(b);
    setModalVer(true);
  };

  const abrirEditar = (b: Beneficiario) => {
    setModalVer(false);
    setVendo(null);
    setEditando(b);
    setForm({
      statusCRM: b.statusCRM,
      historico: b.historico || "",
      dataFechamento: b.dataFechamento ? new Date(b.dataFechamento).toISOString().split("T")[0] : "",
      observacao: b.observacao || "",
    });
    setModal(true);
  };

  const salvar = () => {
    if (!editando) return;
    atualizarMut.mutate({
      id: editando.id,
      data: { ...form, dataFechamento: form.dataFechamento || null },
    });
  };

  // Mover diretamente para próximo status
  const moverStatus = (b: Beneficiario, novoStatus: string) => {
    atualizarMut.mutate({ id: b.id, data: { statusCRM: novoStatus } });
  };

  const exportarCSV = () => {
    const rows = beneficiarios;
    const header = ["Nome", "Telefone", "Segurado", "Status Sinistro", "Status CRM", "Dias Aguardando", "Histórico", "Data Fechamento"];
    const csv = [header.join(";"), ...rows.map(r => [
      r.nome, r.telefone || "", r.nomeSegurado || "", r.statusSinistro || "",
      r.statusCRM, r.diasDesde || 0,
      (r.historico || "").replace(/;/g, ","),
      formatDate(r.dataFechamento),
    ].join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `crm_beneficiarios.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Relatório exportado!");
  };

  const beneficiarios: Beneficiario[] = (data?.beneficiarios || []) as Beneficiario[];

  // Separar por coluna
  const porColuna = (status: string) =>
    beneficiarios.filter(b => {
      if (busca.trim()) {
        const bk = busca.toLowerCase();
        if (!b.nome.toLowerCase().includes(bk) && !(b.nomeSegurado || "").toLowerCase().includes(bk)) return false;
      }
      return b.statusCRM === status;
    });

  // Alertas: aguardando ≥ 60 dias
  const alertas = beneficiarios.filter(b => b.deveEntrarEmContato);

  return (
    <AppLayout>
      <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM Beneficiários</h1>
          <p className="text-muted-foreground text-sm">
            Esteira de acompanhamento pós-sinistro — beneficiários entram em AGUARDANDO e migram para ENTRAR EM CONTATO após 2 meses do pagamento
          </p>
        </div>
        <Button variant="outline" onClick={exportarCSV} className="gap-2">
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      {/* Alerta de beneficiários que devem entrar em contato (≥60 dias) */}
      {alertas.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-yellow-800">
              {alertas.length} beneficiário{alertas.length > 1 ? "s" : ""} aguardando há 2 meses ou mais — mover para "Entrar em Contato"
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {alertas.slice(0, 6).map(b => (
                <button
                  key={b.id}
                  onClick={() => moverStatus(b, "ENTRAR EM CONTATO")}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border border-yellow-300 rounded text-xs transition-colors"
                >
                  {b.nome} ({b.diasDesde}d) <ArrowRight className="h-3 w-3" />
                </button>
              ))}
              {alertas.length > 6 && (
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 border border-yellow-300 rounded text-xs">
                  +{alertas.length - 6} mais
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cards de totais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {COLUNAS.map(col => {
          const count = col.key === "AGUARDANDO" ? metricas?.aguardando :
                        col.key === "ENTRAR EM CONTATO" ? metricas?.entrarEmContato :
                        col.key === "FECHADO" ? metricas?.fechado :
                        metricas?.recusado;
          return (
            <Card key={col.key} className={`border ${col.headerCls}`}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  {col.icon}
                  <span className="text-xs font-medium text-muted-foreground">{col.label}</span>
                </div>
                <p className="text-3xl font-bold">{count || 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {metricas?.total ? Math.round(((count || 0) / metricas.total) * 100) : 0}% do total
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou segurado..."
          className="pl-9"
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
      </div>

      {/* Kanban — 3 colunas principais (AGUARDANDO | ENTRAR EM CONTATO | FECHADO) */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUNAS.filter(c => c.key !== "RECUSADO").map(col => {
            const items = porColuna(col.key);
            const proximoStatus =
              col.key === "AGUARDANDO" ? "ENTRAR EM CONTATO" :
              col.key === "ENTRAR EM CONTATO" ? "FECHADO" : null;
            const statusRecusado = col.key === "ENTRAR EM CONTATO" ? "RECUSADO" : null;

            return (
              <div key={col.key} className="flex flex-col gap-3">
                {/* Cabeçalho da coluna */}
                <div className={`flex items-center gap-2 p-3 rounded-lg border ${col.headerCls}`}>
                  {col.icon}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{col.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{col.desc}</p>
                  </div>
                  <Badge className={`${col.badgeCls} border text-xs font-bold`}>{items.length}</Badge>
                </div>

                {/* Cards dos beneficiários */}
                <div className="space-y-2 min-h-[120px]">
                  {items.length === 0 ? (
                    <div className="flex items-center justify-center h-20 border-2 border-dashed border-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Nenhum beneficiário</p>
                    </div>
                  ) : (
                    items.map(b => (
                      <Card key={b.id} className={`border ${b.deveEntrarEmContato ? "border-yellow-400 bg-yellow-50/50" : ""}`}>
                        <CardContent className="p-3 space-y-2">
                          {/* Nome e telefone */}
                          <div className="flex items-start justify-between gap-2">
                            <button
                              onClick={() => abrirVer(b)}
                              className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                            >
                              <p className="font-semibold text-sm truncate hover:underline">{b.nome}</p>
                              {b.telefone && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Phone className="h-3 w-3" /> {b.telefone}
                                </p>
                              )}
                            </button>
                            <div className="flex gap-1">
                              <button
                                onClick={() => abrirVer(b)}
                                className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                                title="Ver detalhes"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => abrirEditar(b)}
                                className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                                title="Editar status"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Segurado */}
                          {b.nomeSegurado && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Users className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{b.nomeSegurado}</span>
                            </div>
                          )}

                          {/* Status do sinistro */}
                          {b.statusSinistro && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                              {b.statusSinistro}
                            </Badge>
                          )}

                          {/* Alerta de dias */}
                          {b.deveEntrarEmContato && (
                            <div className="flex items-center gap-1 text-xs text-yellow-700 bg-yellow-100 rounded px-2 py-1">
                              <AlertTriangle className="h-3 w-3" />
                              {b.diasDesde}d aguardando — mover para contato
                            </div>
                          )}

                          {/* Histórico */}
                          {b.historico && (
                            <p className="text-xs text-muted-foreground italic line-clamp-2 border-l-2 border-muted pl-2">
                              {b.historico}
                            </p>
                          )}

                          {/* Data fechamento */}
                          {b.dataFechamento && (
                            <p className="text-xs text-muted-foreground">
                              Fechado em: {formatDate(b.dataFechamento)}
                            </p>
                          )}

                          {/* Botões de ação */}
                          {(proximoStatus || statusRecusado) && (
                            <div className="flex gap-1 pt-1">
                              {proximoStatus && (
                                <button
                                  onClick={() => moverStatus(b, proximoStatus)}
                                  className="flex-1 flex items-center justify-center gap-1 text-xs py-1 px-2 bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors"
                                >
                                  {proximoStatus === "ENTRAR EM CONTATO" ? "Entrar em Contato" : "Fechar"}
                                  <ChevronRight className="h-3 w-3" />
                                </button>
                              )}
                              {statusRecusado && (
                                <button
                                  onClick={() => moverStatus(b, statusRecusado)}
                                  className="flex items-center justify-center gap-1 text-xs py-1 px-2 bg-red-50 hover:bg-red-100 text-red-600 rounded transition-colors"
                                >
                                  <XCircle className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Coluna RECUSADO — separada embaixo */}
      {porColuna("RECUSADO").length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="h-4 w-4 text-red-500" />
            <h3 className="font-semibold text-sm text-red-700">RECUSADO ({porColuna("RECUSADO").length})</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {porColuna("RECUSADO").map(b => (
              <Card key={b.id} className="border border-red-200 bg-red-50/30">
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm truncate">{b.nome}</p>
                    <button onClick={() => abrirEditar(b)} className="p-1 hover:bg-muted rounded text-muted-foreground">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {b.nomeSegurado && <p className="text-xs text-muted-foreground truncate">{b.nomeSegurado}</p>}
                  {b.historico && <p className="text-xs text-muted-foreground italic line-clamp-1">{b.historico}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Modal de visualização */}
      <Dialog open={modalVer} onOpenChange={v => { setModalVer(v); if (!v) setVendo(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {vendo?.nome}
            </DialogTitle>
            <DialogDescription>Detalhes do beneficiário e histórico de acompanhamento</DialogDescription>
          </DialogHeader>
          {vendo && (
            <div className="space-y-4 py-2">
              {/* Status atual */}
              {(() => {
                const col = COLUNAS.find(c => c.key === vendo.statusCRM);
                return col ? (
                  <div className={`flex items-center gap-3 p-3 rounded-lg border ${col.headerCls}`}>
                    {col.icon}
                    <div>
                      <p className="text-xs text-muted-foreground">Status atual na esteira</p>
                      <p className="font-bold text-sm">{col.label}</p>
                    </div>
                  </div>
                ) : null;
              })()}

              <Separator />

              {/* Dados do beneficiário */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {vendo.telefone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Telefone</p>
                      <p className="font-medium">{vendo.telefone}</p>
                    </div>
                  </div>
                )}
                {vendo.nomeSegurado && (
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Segurado</p>
                      <p className="font-medium">{vendo.nomeSegurado}</p>
                    </div>
                  </div>
                )}
                {vendo.statusSinistro && (
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Status do Sinistro</p>
                      <Badge variant="outline" className="text-xs">{vendo.statusSinistro}</Badge>
                    </div>
                  </div>
                )}
                {vendo.diasDesde !== undefined && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Dias aguardando</p>
                      <p className={`font-medium ${vendo.deveEntrarEmContato ? "text-yellow-600 font-bold" : ""}`}>
                        {vendo.diasDesde} dias
                        {vendo.deveEntrarEmContato && " ⚠️"}
                      </p>
                    </div>
                  </div>
                )}
                {vendo.dataFechamento && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Data de Fechamento</p>
                      <p className="font-medium">{formatDate(vendo.dataFechamento)}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Histórico */}
              {vendo.historico && (
                <>
                  <Separator />
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Histórico de Contato</p>
                    <div className="bg-muted/40 rounded-lg p-3 text-sm whitespace-pre-wrap border-l-4 border-primary/30">
                      {vendo.historico}
                    </div>
                  </div>
                </>
              )}

              {/* Observação */}
              {vendo.observacao && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Observação Interna</p>
                  <div className="bg-muted/40 rounded-lg p-3 text-sm italic">
                    {vendo.observacao}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setModalVer(false); setVendo(null); }}>Fechar</Button>
            <Button onClick={() => vendo && abrirEditar(vendo)} className="gap-2">
              <Edit2 className="h-4 w-4" /> Editar Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de edição */}
      <Dialog open={modal} onOpenChange={v => { setModal(v); if (!v) setEditando(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Beneficiário — {editando?.nome}</DialogTitle>
            <DialogDescription>Atualize o status na esteira e registre o histórico de contato</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Info do segurado */}
            {editando?.nomeSegurado && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="text-muted-foreground text-xs mb-1">Segurado</p>
                <p className="font-medium">{editando.nomeSegurado}</p>
                {editando.statusSinistro && <Badge variant="outline" className="text-xs mt-1">{editando.statusSinistro}</Badge>}
              </div>
            )}

            {/* Status na esteira */}
            <div className="space-y-1.5">
              <Label>Status na Esteira</Label>
              <Select value={form.statusCRM} onValueChange={v => setForm(f => ({ ...f, statusCRM: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLUNAS.map(col => (
                    <SelectItem key={col.key} value={col.key}>
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${col.dotCls}`} />
                        {col.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Histórico de contato */}
            <div className="space-y-1.5">
              <Label>Histórico / Observações de Contato</Label>
              <Textarea
                placeholder="Registre aqui o histórico de contatos, tentativas, respostas..."
                value={form.historico}
                onChange={e => setForm(f => ({ ...f, historico: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Data de fechamento */}
            {(form.statusCRM === "FECHADO" || form.statusCRM === "RECUSADO") && (
              <div className="space-y-1.5">
                <Label>Data de Fechamento</Label>
                <Input
                  type="date"
                  value={form.dataFechamento}
                  onChange={e => setForm(f => ({ ...f, dataFechamento: e.target.value }))}
                />
              </div>
            )}

            {/* Observação */}
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
            <Button variant="outline" onClick={() => { setModal(false); setEditando(null); }}>Cancelar</Button>
            <Button onClick={salvar} disabled={atualizarMut.isPending}>
              {atualizarMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AppLayout>
  );
}

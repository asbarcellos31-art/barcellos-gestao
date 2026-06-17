import { decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar, date, bigint, boolean } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── CONTAS A PAGAR ───────────────────────────────────────────────────────────
export const contas = mysqlTable("contas", {
  id: int("id").autoincrement().primaryKey(),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  dataVencimento: date("dataVencimento").notNull(),
  valor: decimal("valor", { precision: 15, scale: 2 }).notNull(),
  dataPagamento: date("dataPagamento"),
  status: mysqlEnum("status", ["PAGO", "PENDENTE", "ATRASADO"]).default("PENDENTE").notNull(),
  categoria: mysqlEnum("categoria", [
    "SALARIO", "COMISSAO", "DISTRIBUICAO", "VEICULO", "ESTRUTURA",
    "BANCO", "IMPOSTOS", "ALIMENTACAO", "MATERIAL_ESCRITORIO", "DIVERSOS",
  ]).notNull(),
  vinculo: mysqlEnum("vinculo", ["ANDERSON", "NAYARA", "ELISIA", "BARCELLOS"]).notNull(),
  valorPago: decimal("valorPago", { precision: 15, scale: 2 }),
  tipo: mysqlEnum("tipo", ["RECEITA", "DESPESA"]).default("DESPESA").notNull(),
  mes: int("mes").notNull(),
  ano: int("ano").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Conta = typeof contas.$inferSelect;
export type InsertConta = typeof contas.$inferInsert;

// ─── COMISSÕES ────────────────────────────────────────────────────────────────

// Registro de cada upload de extrato da seguradora
export const extratoUploads = mysqlTable("extrato_uploads", {
  id: int("id").autoincrement().primaryKey(),
  nomeArquivo: varchar("nomeArquivo", { length: 255 }).notNull(),
  mes: int("mes").notNull(),
  ano: int("ano").notNull(),
  totalRegistros: int("totalRegistros").default(0),
  totalComissao: decimal("totalComissao", { precision: 15, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ExtratoUpload = typeof extratoUploads.$inferSelect;

// Linhas do extrato de comissão da seguradora
export const extratoComissao = mysqlTable("extrato_comissao", {
  id: int("id").autoincrement().primaryKey(),
  uploadId: int("uploadId").notNull(),
  mes: int("mes").notNull(),
  ano: int("ano").notNull(),
  // Dados do produtor/corretor
  cpfProdutor: varchar("cpfProdutor", { length: 20 }),
  codigoProdutor: varchar("codigoProdutor", { length: 20 }),
  nomeProdutor: varchar("nomeProdutor", { length: 255 }),
  // Dados do cliente
  tipoCliente: varchar("tipoCliente", { length: 50 }),
  nomeCliente: varchar("nomeCliente", { length: 255 }),
  cpfCliente: varchar("cpfCliente", { length: 20 }),
  // Dados do produto/apólice
  proposta: varchar("proposta", { length: 50 }),
  inscricao: varchar("inscricao", { length: 50 }),
  descricaoProduto: varchar("descricaoProduto", { length: 255 }),
  codigoProduto: varchar("codigoProduto", { length: 20 }),
  upVenda: varchar("upVenda", { length: 100 }),
  // Valores
  valorBase: decimal("valorBase", { precision: 15, scale: 2 }),
  parcelaComissionada: int("parcelaComissionada"),
  competenciaComissionada: varchar("competenciaComissionada", { length: 20 }),
  parcelaFaturada: int("parcelaFaturada"),
  competenciaFaturada: varchar("competenciaFaturada", { length: 20 }),
  valorAngariacao: decimal("valorAngariacao", { precision: 15, scale: 2 }),
  // Valores de comissão detalhados
  valorComissao: decimal("valorComissao", { precision: 15, scale: 2 }),
  pctComissao: decimal("pctComissao", { precision: 10, scale: 4 }),
  valorIncentivo: decimal("valorIncentivo", { precision: 15, scale: 2 }),
  pctIncentivo: decimal("pctIncentivo", { precision: 10, scale: 4 }),
  valorComissaoTotal: decimal("valorComissaoTotal", { precision: 15, scale: 2 }), // valorComissao + valorIncentivo
  pctComissaoTotal: decimal("pctComissaoTotal", { precision: 10, scale: 4 }), // pctComissao + pctComissao*pctIncentivo
  // Corretor mapeado internamente
  corretorInterno: varchar("corretorInterno", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ExtratoComissao = typeof extratoComissao.$inferSelect;
export type InsertExtratoComissao = typeof extratoComissao.$inferInsert;

// ─── INADIMPLENTES ────────────────────────────────────────────────────────────

// Registro de cada upload de planilha de inadimplentes
export const inadimplenteUploads = mysqlTable("inadimplente_uploads", {
  id: int("id").autoincrement().primaryKey(),
  nomeArquivo: varchar("nomeArquivo", { length: 255 }).notNull(),
  mes: int("mes").notNull(),
  ano: int("ano").notNull(),
  totalRegistros: int("totalRegistros").default(0),
  totalValor: decimal("totalValor", { precision: 15, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InadimplenteUpload = typeof inadimplenteUploads.$inferSelect;

// Registros de inadimplentes
export const inadimplentes = mysqlTable("inadimplentes", {
  id: int("id").autoincrement().primaryKey(),
  uploadId: int("uploadId").notNull(),
  mes: int("mes").notNull(),
  ano: int("ano").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  cpf: varchar("cpf", { length: 20 }),
  telefone1: varchar("telefone1", { length: 30 }),
  telefone2: varchar("telefone2", { length: 30 }),
  mesParcela: varchar("mesParcela", { length: 200 }),
  parcela: varchar("parcela", { length: 50 }),
  formaPagamento: varchar("formaPagamento", { length: 50 }),
  valorParcelas: varchar("valorParcelas", { length: 2000 }), // pode ter múltiplos valores separados por vírgula
  valorTotal: decimal("valorTotal", { precision: 15, scale: 2 }),
  produtos: text("produtos"),
  status: varchar("status", { length: 50 }).default("PENDENTE"),
  historicoCobranca: text("historicoCobranca"),
  observacao: text("observacao"),
  emailContato: varchar("emailContato", { length: 255 }),
  telefoneContato: varchar("telefoneContato", { length: 50 }),
  boletoPdf: text("boleto_pdf"),
  boletoNome: varchar("boleto_nome", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Inadimplente = typeof inadimplentes.$inferSelect;
export type InsertInadimplente = typeof inadimplentes.$inferInsert;

// ─── CLIENTES ────────────────────────────────────────────────────────────────
// ─── ORIGENS DE CLIENTES ────────────────────────────────────────────────────
export const origensCliente = mysqlTable("origens_cliente", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull(),
  cor: varchar("cor", { length: 20 }).default("#6366f1"),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type OrigemCliente = typeof origensCliente.$inferSelect;
export type InsertOrigemCliente = typeof origensCliente.$inferInsert;

export const clientes = mysqlTable("clientes", {
  id: int("id").autoincrement().primaryKey(),
  cpf: varchar("cpf", { length: 20 }).unique(),
  nome: varchar("nome", { length: 255 }).notNull(),
  produtos: text("produtos"),
  vendedor: varchar("vendedor", { length: 100 }),
  status: varchar("status", { length: 20 }).default("Ativo"),
  valorTotalComissao: decimal("valorTotalComissao", { precision: 15, scale: 2 }),
  valorComissao: decimal("valorComissao", { precision: 15, scale: 2 }),
  percentualComissao: decimal("percentualComissao", { precision: 10, scale: 4 }),
  taxaComissao: decimal("taxaComissao", { precision: 10, scale: 4 }), // taxa de comissão cadastrada para o cliente (ex: 0.30 = 30%)
  contribuicao: decimal("contribuicao", { precision: 15, scale: 2 }), // valor base atualizado a cada importação do extrato
  // Campos para complementar depois
  dataNascimento: date("dataNascimento"),
  telefone: varchar("telefone", { length: 30 }),
  email: varchar("email", { length: 255 }),
  endereco: text("endereco"),
  bairro: varchar("bairro", { length: 100 }),
  cidade: varchar("cidade", { length: 100 }),
  cep: varchar("cep", { length: 10 }),
  estado: varchar("estado", { length: 2 }),
  celular: varchar("celular", { length: 30 }),
  observacao: text("observacao"),
  sexo: mysqlEnum("sexo", ["M", "F", "OUTRO"]),
  origemId: int("origemId"),  // FK para origens_cliente.id
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Cliente = typeof clientes.$inferSelect;
export type InsertCliente = typeof clientes.$inferInsert;

// ─── VENDEDORES POR CLIENTE ──────────────────────────────────────────────────
// Permite que um cliente tenha 1, 2 ou 3 vendedores com percentuais distintos
export const clienteVendedores = mysqlTable("cliente_vendedores", {
  id: int("id").autoincrement().primaryKey(),
  clienteId: int("clienteId").notNull(),           // FK para clientes.id
  nomeVendedor: varchar("nomeVendedor", { length: 100 }).notNull(), // nome livre/dinâmico
  percentual: decimal("percentual", { precision: 5, scale: 2 }).notNull(), // ex: 50.00 = 50%
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ClienteVendedor = typeof clienteVendedores.$inferSelect;
export type InsertClienteVendedor = typeof clienteVendedores.$inferInsert;

// ─── VENDAS ───────────────────────────────────────────────────────────────────
export const vendas = mysqlTable("vendas", {
  id: int("id").autoincrement().primaryKey(),
  mes: int("mes").notNull(),
  ano: int("ano").notNull(),
  // Campos fiéis à planilha CONTROLEVENDAS2026
  dataVenda: date("dataVenda"),
  nomeCliente: varchar("nomeCliente", { length: 255 }),
  cpfCliente: varchar("cpfCliente", { length: 20 }),
  valorPremio: decimal("valorPremio", { precision: 15, scale: 2 }),        // VALOR
  cpfNovo: varchar("cpfNovo", { length: 10 }).default("NÃO"),              // CPF NOVO (SIM/NÃO)
  valorComissao: decimal("valorComissao", { precision: 15, scale: 2 }),    // COMISSÃO
  comissaoPaga: varchar("comissaoPaga", { length: 20 }).default(""),       // COM. PAGA (PAGO/vazio)
  implantada: varchar("implantada", { length: 10 }).default("NÃO"),       // IMPLANTADA (SIM/NÃO)
  corretor: varchar("corretor", { length: 100 }),                          // vendedor principal
  vendedoresJson: text("vendedoresJson"),                                    // JSON: [{nomeVendedor, percentual}]
  // Campos complementares
  produto: varchar("produto", { length: 255 }),
  proposta: varchar("proposta", { length: 50 }),
  observacao: text("observacao"),
  naBase: boolean("naBase").default(false),                                 // Se o cliente já foi enviado para a Base de Clientes
  boasVindasEnviadoEm: timestamp("boasVindasEnviadoEm"),                    // Data/hora do envio de boas-vindas WhatsApp
  // Campos para envio à base e e-mail de boas-vindas
  email: varchar("email", { length: 255 }),
  telefone: varchar("telefone", { length: 30 }),
  celular: varchar("celular", { length: 30 }),
  dataNascimento: date("dataNascimento"),
  endereco: varchar("endereco", { length: 255 }),
  bairro: varchar("bairro", { length: 100 }),
  cidade: varchar("cidade", { length: 100 }),
  cep: varchar("cep", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Venda = typeof vendas.$inferSelect;
export type InsertVenda = typeof vendas.$inferInsert;

// ─── SINISTROS ────────────────────────────────────────────────────────────────
export const sinistros = mysqlTable("sinistros", {
  id: int("id").autoincrement().primaryKey(),
  // Campos fiéis à planilha CRMSINISTROSBARCELLOS
  nomeSegurado: varchar("nomeSegurado", { length: 255 }).notNull(),
  cpfSegurado: varchar("cpfSegurado", { length: 20 }),
  protocolo: varchar("protocolo", { length: 50 }),
  dataProtocolo: date("dataProtocolo"),
  produto: varchar("produto", { length: 255 }),
  valorCapital: decimal("valorCapital", { precision: 15, scale: 2 }),
  valorRecebido: decimal("valorRecebido", { precision: 15, scale: 2 }),
  status: mysqlEnum("status", ["Pagamento", "Em Análise", "Pendente", "Recusado"]).default("Em Análise").notNull(),
  dataRecebimento: date("dataRecebimento"),
  dataNascimento: date("dataNascimento"),
  // Beneficiários (até 5, fiel à planilha)
  beneficiario1: varchar("beneficiario1", { length: 255 }),
  telefone1: varchar("telefone1", { length: 30 }),
  beneficiario2: varchar("beneficiario2", { length: 255 }),
  telefone2: varchar("telefone2", { length: 30 }),
  beneficiario3: varchar("beneficiario3", { length: 255 }),
  telefone3: varchar("telefone3", { length: 30 }),
  beneficiario4: varchar("beneficiario4", { length: 255 }),
  telefone4: varchar("telefone4", { length: 30 }),
  beneficiario5: varchar("beneficiario5", { length: 255 }),
  telefone5: varchar("telefone5", { length: 30 }),
  observacao: text("observacao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Sinistro = typeof sinistros.$inferSelect;
export type InsertSinistro = typeof sinistros.$inferInsert;

// CRM de Beneficiários — esteira de acompanhamento por beneficiário de cada sinistro
export const beneficiariosCRM = mysqlTable("beneficiarios_crm", {
  id: int("id").autoincrement().primaryKey(),
  sinistroId: int("sinistroId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  telefone: varchar("telefone", { length: 30 }),
  nomeSegurado: varchar("nomeSegurado", { length: 255 }), // segurado vinculado (para referência)
  statusSinistro: varchar("statusSinistro", { length: 50 }), // status do sinistro no momento
  // Esteira do CRM (fiel à planilha)
  statusCRM: mysqlEnum("statusCRM", ["AGUARDANDO", "ENTRAR EM CONTATO", "FECHADO", "RECUSADO"]).default("AGUARDANDO").notNull(),
  dataFechamento: date("dataFechamento"),
  historico: text("historico"), // histórico de contatos/anotações
  observacao: text("observacao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BeneficiarioCRM = typeof beneficiariosCRM.$inferSelect;
export type InsertBeneficiarioCRM = typeof beneficiariosCRM.$inferInsert;

// --- CRM LEADS ---
export const crmLeads = mysqlTable("crm_leads", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  cpf: varchar("cpf", { length: 20 }),
  telefone: varchar("telefone", { length: 30 }),   // celular 1
  celular2: varchar("celular2", { length: 30 }),
  celular3: varchar("celular3", { length: 30 }),
  fixo1: varchar("fixo1", { length: 30 }),
  fixo2: varchar("fixo2", { length: 30 }),
  fixo3: varchar("fixo3", { length: 30 }),
  logradouro: varchar("logradouro", { length: 255 }),
  numero: varchar("numero", { length: 20 }),
  complemento: varchar("complemento", { length: 100 }),
  bairro: varchar("bairro", { length: 100 }),
  cidade: varchar("cidade", { length: 100 }),
  uf: varchar("uf", { length: 2 }),
  dataEntrega: date("dataEntrega"),
  mes: int("mes"),
  ano: int("ano"),
  status: mysqlEnum("status", ["AGUARDANDO", "SEM CONTATO", "EM CONTATO", "AGENDAMENTO", "FECHAMENTO", "RECUSADO", "ENVIADO"]).default("AGUARDANDO").notNull(),
  valorEstimado: decimal("valorEstimado", { precision: 15, scale: 2 }),
  historico: text("historico"),
  observacao: text("observacao"),
  dataFechamento: date("dataFechamento"),
  origem: varchar("origem", { length: 100 }),
  vendedor: varchar("vendedor", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CrmLead = typeof crmLeads.$inferSelect;
export type InsertCrmLead = typeof crmLeads.$inferInsert;

// --- ORIGENS DE LEADS ---
export const crmOrigensLeads = mysqlTable("crm_origens_leads", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull().unique(),
  ativa: boolean("ativa").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CrmOrigemLead = typeof crmOrigensLeads.$inferSelect;
export type InsertCrmOrigemLead = typeof crmOrigensLeads.$inferInsert;

// ─── PRODUTOS ────────────────────────────────────────────────────────────────
export const produtos = mysqlTable("produtos", {
  id: int("id").autoincrement().primaryKey(),
  codigo: varchar("codigo", { length: 20 }).notNull().unique(),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Produto = typeof produtos.$inferSelect;
export type InsertProduto = typeof produtos.$inferInsert;

// Vínculo entre cliente e produto(s) — um cliente pode ter múltiplos produtos
export const clienteProdutos = mysqlTable("cliente_produtos", {
  id: int("id").autoincrement().primaryKey(),
  clienteId: int("clienteId").notNull(),
  produtoId: int("produtoId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ClienteProduto = typeof clienteProdutos.$inferSelect;
export type InsertClienteProduto = typeof clienteProdutos.$inferInsert;

// ─── FINANCEIRO BARCELLOS 2026 ────────────────────────────────────────────────

// DRE: lançamentos mensais de receitas e despesas
export const dreLancamentos = mysqlTable("dre_lancamentos", {
  id: int("id").autoincrement().primaryKey(),
  mes: int("mes").notNull(),       // 1-12
  ano: int("ano").notNull(),
  tipo: mysqlEnum("tipo", ["RECEITA", "DESPESA"]).notNull(),
  categoria: varchar("categoria", { length: 100 }).notNull(), // ex: "Comissões Total", "Salários e Remunerações"
  subcategoria: varchar("subcategoria", { length: 100 }), // ex: "Angariação", "Carteira"
  valor: decimal("valor", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DreLancamento = typeof dreLancamentos.$inferSelect;
export type InsertDreLancamento = typeof dreLancamentos.$inferInsert;

// Histórico anual de receitas (2015-2026+)
export const historicoAnual = mysqlTable("historico_anual", {
  id: int("id").autoincrement().primaryKey(),
  ano: int("ano").notNull().unique(),
  receitaTotal: decimal("receitaTotal", { precision: 15, scale: 2 }).notNull(),
  carteira: decimal("carteira", { precision: 15, scale: 2 }).notNull(),
  angariacao: decimal("angariacao", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type HistoricoAnual = typeof historicoAnual.$inferSelect;
export type InsertHistoricoAnual = typeof historicoAnual.$inferInsert;

// Metas anuais
export const metasAnuais = mysqlTable("metas_anuais", {
  id: int("id").autoincrement().primaryKey(),
  ano: int("ano").notNull(),
  mes: int("mes").notNull(), // 0 = meta anual, 1-12 = meta mensal
  metaReceita: decimal("metaReceita", { precision: 15, scale: 2 }).notNull(),
  metaCarteira: decimal("metaCarteira", { precision: 15, scale: 2 }).notNull(),
  metaAngariacao: decimal("metaAngariacao", { precision: 15, scale: 2 }).notNull(),
  metaLucro: decimal("metaLucro", { precision: 15, scale: 2 }),
  metaVendas: decimal("metaVendas", { precision: 15, scale: 2 }), // Meta de prêmio total de vendas (soma de todos os vendedores)
  metaCpfs: int("metaCpfs").default(0),
  metaPropostas: int("metaPropostas").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MetaAnual = typeof metasAnuais.$inferSelect;
export type InsertMetaAnual = typeof metasAnuais.$inferInsert;

// ─── Módulo Cancelados ────────────────────────────────────────────────────────
export const uploadsCancelados = mysqlTable("uploads_cancelados", {
  id: int("id").autoincrement().primaryKey(),
  mes: int("mes").notNull(),
  ano: int("ano").notNull(),
  nomeArquivo: varchar("nomeArquivo", { length: 255 }),
  totalRegistros: int("totalRegistros").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type UploadCancelado = typeof uploadsCancelados.$inferSelect;
export type InsertUploadCancelado = typeof uploadsCancelados.$inferInsert;

export const cancelados = mysqlTable("cancelados", {
  id: int("id").autoincrement().primaryKey(),
  uploadId: int("uploadId"),
  mes: int("mes").notNull(),
  ano: int("ano").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  cpf: varchar("cpf", { length: 20 }),
  produto: varchar("produto", { length: 255 }),
  status: mysqlEnum("status", ["DESISTIU", "INADIMPLENTE", "OBITO", "REGULACAO", "ALTERACAO_BENEFICIO", "RECUPERADO"]).notNull().default("INADIMPLENTE"),
  observacao: text("observacao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Cancelado = typeof cancelados.$inferSelect;
export type InsertCancelado = typeof cancelados.$inferInsert;

// ─── Módulo Configurações: Usuários Internos, Permissões e Sessões ────────────
export const appUsers = mysqlTable("app_users", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  senhaHash: varchar("senhaHash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["admin", "user"]).notNull().default("user"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AppUser = typeof appUsers.$inferSelect;
export type InsertAppUser = typeof appUsers.$inferInsert;

// Módulos disponíveis no sistema
export const MODULOS_SISTEMA = [
  "dashboard",
  "contas",
  "clientes",
  "vendas",
  "comissoes",
  "comissoes_pendentes",
  "inadimplentes",
  "cancelados",
  "sinistros",
  "crm_leads",
  "crm_beneficiarios",
  "financeiro",
  "configuracoes",
] as const;
export type ModuloSistema = typeof MODULOS_SISTEMA[number];

export const appPermissoes = mysqlTable("app_permissoes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  modulo: varchar("modulo", { length: 64 }).notNull(),
  podeVer: boolean("podeVer").notNull().default(false),
  podeCriar: boolean("podeCriar").notNull().default(false),
  podeEditar: boolean("podeEditar").notNull().default(false),
  podeDeletar: boolean("podeDeletar").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AppPermissao = typeof appPermissoes.$inferSelect;
export type InsertAppPermissao = typeof appPermissoes.$inferInsert;

export const appSessions = mysqlTable("app_sessions", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 512 }).notNull().unique(),
  userId: int("userId").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AppSession = typeof appSessions.$inferSelect;
export type InsertAppSession = typeof appSessions.$inferInsert;

// ── EXTRATO BANCÁRIO ──────────────────────────────────────────────────────────
export const uploadsExtratoBancario = mysqlTable("uploads_extrato_bancario", {
  id: int("id").autoincrement().primaryKey(),
  mes: int("mes").notNull(),
  ano: int("ano").notNull(),
  nomeArquivo: varchar("nomeArquivo", { length: 255 }).notNull(),
  totalLancamentos: int("totalLancamentos").notNull().default(0),
  totalEntradas: decimal("totalEntradas", { precision: 12, scale: 2 }).notNull().default("0"),
  totalSaidas: decimal("totalSaidas", { precision: 12, scale: 2 }).notNull().default("0"),
  confirmado: boolean("confirmado").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type UploadsExtratoBancario = typeof uploadsExtratoBancario.$inferSelect;

export const extratoBancario = mysqlTable("extrato_bancario", {
  id: int("id").autoincrement().primaryKey(),
  uploadId: int("uploadId").notNull(),
  data: varchar("data", { length: 20 }).notNull(),
  lancamento: varchar("lancamento", { length: 255 }).notNull(),
  detalhes: varchar("detalhes", { length: 500 }).notNull().default(""),
  nrDocumento: varchar("nrDocumento", { length: 50 }).notNull().default(""),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  tipo: mysqlEnum("tipo", ["Entrada", "Saída"]).notNull(),
  categoria: varchar("categoria", { length: 50 }),
  vinculo: varchar("vinculo", { length: 50 }),
  observacao: varchar("observacao", { length: 255 }).notNull().default(""),
  confirmado: boolean("confirmado").notNull().default(false),
  lancamentoContasId: int("lancamentoContasId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ExtratoBancario = typeof extratoBancario.$inferSelect;
export type InsertExtratoBancario = typeof extratoBancario.$inferInsert;

// --- RELATORIO EXECUTIVO ---
export const relatoriosExecutivos = mysqlTable("relatorios_executivos", {
  id: int("id").autoincrement().primaryKey(),
  mes: int("mes").notNull(),
  ano: int("ano").notNull(),
  // Campos editáveis pelo usuário
  acaoNecessaria: text("acaoNecessaria"),
  insightReceita: text("insightReceita"),
  insightColaboradores: text("insightColaboradores"),
  acoesCorretivas: text("acoesCorretivas"), // JSON array de strings
  metaProximoMes: text("metaProximoMes"),
  observacoesGerais: text("observacoesGerais"),
  // Metas manuais (se quiser sobrescrever as metas da tabela metasAnuais)
  metaReceitaManual: decimal("metaReceitaManual", { precision: 15, scale: 2 }),
  metaCpfsManual: int("metaCpfsManual"),
  metaPropostasManual: int("metaPropostasManual"),
  imap: decimal("imap", { precision: 5, scale: 2 }), // Pontuação IMAP do mês
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type RelatorioExecutivo = typeof relatoriosExecutivos.$inferSelect;
export type InsertRelatorioExecutivo = typeof relatoriosExecutivos.$inferInsert;

// ─── GESTÃO DO TEMPO (TRÍADE DO TEMPO) ───────────────────────────────────────
export const tarefas = mysqlTable("tarefas", {
  id: int("id").autoincrement().primaryKey(),
  // Vinculado ao usuário do sistema próprio (app_users)
  appUserId: int("appUserId").notNull(),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  descricao: text("descricao"),
  // Tríade: IMPORTANTE (verde), URGENTE (vermelho), CIRCUNSTANCIAL (amarelo)
  triade: mysqlEnum("triade", ["IMPORTANTE", "URGENTE", "CIRCUNSTANCIAL"]).notNull().default("IMPORTANTE"),
  // Categoria pessoal
  categoria: mysqlEnum("categoria", [
    "COMERCIAL", "SAUDE", "CASA_FAMILIA", "PESSOAL", "FINANCEIRO", "EDUCACAO", "OUTROS"
  ]).default("COMERCIAL").notNull(),
  // Duração estimada em minutos
  duracaoMin: int("duracaoMin").default(30),
  // Data e hora agendada
  dataAgendada: date("dataAgendada"),
  horaAgendada: varchar("horaAgendada", { length: 5 }), // "HH:MM"
  // Status de execução
  status: mysqlEnum("status", ["PENDENTE", "EM_EXECUCAO", "CONCLUIDA", "CANCELADA"]).default("PENDENTE").notNull(),
  // Tempo real de execução em segundos (timer)
  tempoExecucaoSeg: int("tempoExecucaoSeg").default(0),
  // Recorrência
  recorrente: boolean("recorrente").default(false),
  recorrencia: mysqlEnum("recorrencia", ["DIARIA", "SEMANAL", "MENSAL"]),
  // Dias da semana para recorrência semanal: "0,1,2,3,4,5,6" (0=Dom, 1=Seg, ..., 6=Sáb)
  diasSemana: varchar("diasSemana", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Tarefa = typeof tarefas.$inferSelect;
export type InsertTarefa = typeof tarefas.$inferInsert;

// ─── TAREFA OCORRÊNCIAS ───────────────────────────────────────────────────────
// Registra o status de cada ocorrência de uma tarefa recorrente por data
export const tarefaOcorrencias = mysqlTable("tarefa_ocorrencias", {
  id: int("id").autoincrement().primaryKey(),
  tarefaId: int("tarefaId").notNull(),
  appUserId: int("appUserId").notNull(),
  data: date("data").notNull(), // "YYYY-MM-DD" da ocorrência
  status: mysqlEnum("status", ["PENDENTE", "CONCLUIDA", "ATRASADA", "CANCELADA"]).default("PENDENTE").notNull(),
  tempoExecucaoSeg: int("tempoExecucaoSeg").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TarefaOcorrencia = typeof tarefaOcorrencias.$inferSelect;
export type InsertTarefaOcorrencia = typeof tarefaOcorrencias.$inferInsert;

// ─── EMAIL MARKETING ──────────────────────────────────────────────────────────

// Templates de e-mail
export const emailTemplates = mysqlTable("email_templates", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  assunto: varchar("assunto", { length: 500 }).notNull(),
  corpo: text("corpo").notNull(), // JSON (BLOCKS:...) ou HTML legado
  saudacao: varchar("saudacao", { length: 500 }).default("Olá, {{nome}}!"),
  assinatura: text("assinatura"),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = typeof emailTemplates.$inferInsert;

// Listas de destinatários
export const emailListas = mysqlTable("email_listas", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  totalContatos: int("totalContatos").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EmailLista = typeof emailListas.$inferSelect;
export type InsertEmailLista = typeof emailListas.$inferInsert;

// Contatos de cada lista
export const emailContatos = mysqlTable("email_contatos", {
  id: int("id").autoincrement().primaryKey(),
  listaId: int("listaId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  cpf: varchar("cpf", { length: 20 }),
  telefone: varchar("telefone", { length: 30 }),
  dadosExtras: text("dadosExtras"), // JSON com campos adicionais da planilha
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EmailContato = typeof emailContatos.$inferSelect;
export type InsertEmailContato = typeof emailContatos.$inferInsert;

// Campanhas de disparo
export const emailCampanhas = mysqlTable("email_campanhas", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  templateId: int("templateId").notNull(),
  listaId: int("listaId").notNull(),
  status: mysqlEnum("status", ["RASCUNHO", "AGENDADA", "ENVIANDO", "CONCLUIDA", "CANCELADA"]).default("RASCUNHO").notNull(),
  totalDestinatarios: int("totalDestinatarios").default(0).notNull(),
  totalEnviados: int("totalEnviados").default(0).notNull(),
  totalErros: int("totalErros").default(0).notNull(),
  dataAgendada: timestamp("dataAgendada"),
  dataInicio: timestamp("dataInicio"),
  dataConclusao: timestamp("dataConclusao"),
  remetente: varchar("remetente", { length: 320 }).default("atendimento@barcellosseguros.com.br").notNull(),
  nomeRemetente: varchar("nomeRemetente", { length: 255 }).default("Barcellos Seguros").notNull(),
  anexoUrl: varchar("anexoUrl", { length: 1024 }),
  anexoNome: varchar("anexoNome", { length: 255 }),
  anexoTipo: varchar("anexoTipo", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EmailCampanha = typeof emailCampanhas.$inferSelect;
export type InsertEmailCampanha = typeof emailCampanhas.$inferInsert;

// Log de envios individuais
export const emailEnvios = mysqlTable("email_envios", {
  id: int("id").autoincrement().primaryKey(),
  campanhaId: int("campanhaId").notNull(),
  contatoId: int("contatoId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  status: mysqlEnum("status", ["PENDENTE", "ENVIADO", "ERRO"]).default("PENDENTE").notNull(),
  erro: text("erro"),
  enviadoEm: timestamp("enviadoEm"),
  aberturas: int("aberturas").default(0).notNull(),
  abertoPrimeiramente: timestamp("abertoPrimeiramente"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EmailEnvio = typeof emailEnvios.$inferSelect;
export type InsertEmailEnvio = typeof emailEnvios.$inferInsert;

// ─── WHATSAPP MARKETING (Z-API) ───────────────────────────────────────────────

// Listas de contatos WhatsApp (reutiliza estrutura similar ao e-mail)
export const whatsappListas = mysqlTable("whatsapp_listas", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  totalContatos: int("totalContatos").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WhatsappLista = typeof whatsappListas.$inferSelect;
export type InsertWhatsappLista = typeof whatsappListas.$inferInsert;

// Contatos de cada lista WhatsApp
export const whatsappContatos = mysqlTable("whatsapp_contatos", {
  id: int("id").autoincrement().primaryKey(),
  listaId: int("listaId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  telefone: varchar("telefone", { length: 30 }).notNull(), // formato: 5548999999999
  cpf: varchar("cpf", { length: 20 }),
  dadosExtras: text("dadosExtras"), // JSON com campos adicionais
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WhatsappContato = typeof whatsappContatos.$inferSelect;
export type InsertWhatsappContato = typeof whatsappContatos.$inferInsert;

// Campanhas WhatsApp
export const whatsappCampanhas = mysqlTable("whatsapp_campanhas", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  mensagem: text("mensagem").notNull(), // Texto com variáveis {{nome}}, {{produto}}, etc.
  listaId: int("listaId"),
  status: mysqlEnum("status", ["RASCUNHO", "AGENDADA", "ENVIANDO", "CONCLUIDA", "CANCELADA"]).default("RASCUNHO").notNull(),
  totalDestinatarios: int("totalDestinatarios").default(0).notNull(),
  totalEnviados: int("totalEnviados").default(0).notNull(),
  totalErros: int("totalErros").default(0).notNull(),
  dataAgendada: timestamp("dataAgendada"),
  dataInicio: timestamp("dataInicio"),
  dataConclusao: timestamp("dataConclusao"),
  intervaloMs: int("intervaloMs").default(3000).notNull(), // intervalo entre mensagens em ms (anti-ban)
  mediaUrl: varchar("mediaUrl", { length: 1000 }), // URL do arquivo de mídia (imagem/vídeo/PDF)
  mediaType: varchar("mediaType", { length: 20 }), // "image" | "video" | "document"
  instanciaId: varchar("instanciaId", { length: 20 }).default("whatsapp-1"), // instância WhatsApp para disparo
  limiteDiario: int("limiteDiario").default(0).notNull(), // 0 = sem limite; >0 = máx envios por dia
  enviadosHoje: int("enviadosHoje").default(0).notNull(), // contador do dia atual (reset automático)
  dataUltimoEnvio: timestamp("dataUltimoEnvio"), // data do último envio para reset diário
  pausada: boolean("pausada").default(false).notNull(), // true = campanha pausada
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WhatsappCampanha = typeof whatsappCampanhas.$inferSelect;
export type InsertWhatsappCampanha = typeof whatsappCampanhas.$inferInsert;

// Log de envios individuais WhatsApp
export const whatsappEnvios = mysqlTable("whatsapp_envios", {
  id: int("id").autoincrement().primaryKey(),
  campanhaId: int("campanhaId"),
  nome: varchar("nome", { length: 255 }),
  telefone: varchar("telefone", { length: 30 }).notNull(),
  mensagem: text("mensagem").notNull(),
  tipo: varchar("tipo", { length: 50 }).default("CAMPANHA").notNull(),
  status: varchar("status", { length: 50 }).default("PENDENTE").notNull(),
  erro: text("erro"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WhatsappEnvio = typeof whatsappEnvios.$inferSelect;
export type InsertWhatsappEnvio = typeof whatsappEnvios.$inferInsert;

// ─── SEGMENTO TEMPLATES ────────────────────────────────────────────────────────────────────────────────────
// Templates de segmentação salvos pelo usuário para reutilização em campanhas
export const segmentoTemplates = mysqlTable("segmento_templates", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  filtros: text("filtros").notNull(), // JSON com os filtros: { status, produtoCodigo, cidade, vendedor, idadeMin, idadeMax, contribuicaoMin, contribuicaoMax, sexo }
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SegmentoTemplate = typeof segmentoTemplates.$inferSelect;
export type InsertSegmentoTemplate = typeof segmentoTemplates.$inferInsert;

// ─── LEMBRETES ────────────────────────────────────────────────────────────────
// Lembretes rápidos de compromissos (aniversários, almoços, reuniões informais, etc.)
export const lembretes = mysqlTable("lembretes", {
  id: int("id").autoincrement().primaryKey(),
  appUserId: int("appUserId").notNull(),
  texto: varchar("texto", { length: 500 }).notNull(),
  data: date("data").notNull(), // "YYYY-MM-DD"
  hora: varchar("hora", { length: 5 }), // "HH:MM" opcional
  icone: varchar("icone", { length: 10 }).default("📌"), // emoji do tipo
  concluido: boolean("concluido").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Lembrete = typeof lembretes.$inferSelect;
export type InsertLembrete = typeof lembretes.$inferInsert;

// ─── VENDEDORES ───────────────────────────────────────────────────────────────
export const vendedores = mysqlTable("vendedores", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Vendedor = typeof vendedores.$inferSelect;
export type InsertVendedor = typeof vendedores.$inferInsert;

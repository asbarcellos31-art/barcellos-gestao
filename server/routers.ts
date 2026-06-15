import { z } from "zod";
import { listarVendedoresCadastro, listarVendedoresAtivos, criarVendedor, atualizarVendedor, excluirVendedor } from "./vendedoresDb";
import {
  listarTarefasPorData,
  listarTarefasSemData,
  listarTarefasSemana,
  listarTarefasPorPeriodo,
  criarTarefa,
  atualizarTarefa,
  concluirTarefa,
  excluirTarefa,
  duplicarTarefa,
  obterScoreProdutividade,
  buscarTarefas,
} from "./tarefasDb";
import {
  listarUsuarios,
  buscarUsuarioPorId,
  criarUsuario,
  atualizarUsuario,
  deletarUsuario,
  loginUsuario,
  validarSessao,
  logoutSessao,
  listarPermissoesUsuario,
  salvarPermissoes,
  garantirAdminPadrao,
  MODULOS_SISTEMA,
} from "./configuracoesDb";
import {
  listarLancamentosExtrato,
  listarUploadsExtrato,
  atualizarLancamentoExtrato,
  atualizarLoteExtrato,
  resumoPorCategoria,
  confirmarImportacaoExtrato,
  deletarUploadExtrato,
  CATEGORIAS,
  VINCULOS,
  excluirLancamentosSemCategoria,
  excluirLancamentoExtrato,
} from "./extratoBancarioDb";
import { listarOrigens, criarOrigem, atualizarOrigem, excluirOrigem } from "./origensDb";
import {
  listarCancelados,
  criarCancelado,
  atualizarCancelado,
  excluirCancelado,
  metricasCanceladosMensal,
  metricasCanceladosAnual,
  anosDisponiveisCancelados,
  listarUploadsCancelados,
  deletarUploadCancelados,
  entradaSaidaMensal,
  entradaSaidaAcumulada,
} from "./canceladosDb";
import { COOKIE_NAME } from "@shared/const";
import { inadimplentesDisparoRouter } from "./inadimplentesDisparoRouter";
import { enviarAniversarioIndividual } from "./emailAutomacao";
import { whatsappRouter } from "./whatsappRouter";
import { magTrpcRouter } from "./magBoletosRouter";
import { obterRelatorio, salvarRelatorio, obterMetricasMes, listarRelatorios } from "./relatorioExecutivoDb";
import { buscarDadosMensagemDiaria } from "./mensagemDiariaDb";
import { listarLembretes, criarLembrete, toggleLembrete, excluirLembrete, atualizarLembrete } from "./lembretesDb";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  listarContas,
  listarTodasContas,
  criarConta,
  atualizarConta,
  excluirConta,
  buscarContaPorId,
  alertasVencimento,
  contasVencidas,
  metricas,
  custosPorVinculo,
  custosPorCategoria,
  resumoMensalContas,
} from "./db";
import {
  listarClientes,
  criarCliente,
  atualizarCliente,
  excluirCliente,
  listarVendedores,
  listarVendas,
  resumoVendasPorCorretor,
  metricasVendas,
  resumoMensalVendas,
  criarVenda,
  atualizarVenda,
  excluirVenda,
  comissoesPendentesPorVendedor,
  listarVendasComissaoPendente,
  marcarComissoesPagas,
  listarSinistros,
  criarSinistro,
  atualizarSinistro,
  excluirSinistro,
  metricasSinistros,
  listarBeneficiariosCRM,
  listarTodosBeneficiariosCRM,
  criarBeneficiarioCRM,
  atualizarBeneficiarioCRM,
  excluirBeneficiarioCRM,
  metricasCRMBeneficiarios,
  listarLeads,
  metricasLeads,
  criarLead,
  atualizarLead,
  excluirLead,
  excluirLeadsPorMesAno,
  marcarLeadsEnviados,
  listarOrigensLeads,
  criarOrigemLead,
  excluirOrigemLead,
  listarVendedoresLeads,
  listarCidadesLeads,
  listarUFsLeads,
  listarProdutos,
  listarProdutosDoCliente,
  vincularProdutoCliente,
  desvincularProdutoCliente,
  listarClientesPorProduto,
  listarAniversariantes,
  listarAniversariantesMes,
  enviarVendaParaBase,
  buscarClientePorCpf,
} from "./clientesDb";
import {
  listarDrePorAno,
  listarDrePorMes,
  upsertDreLancamento,
  resumoDrePorAno,
  listarHistoricoAnual,
  upsertHistoricoAnual,
  listarMetasPorAno,
  upsertMeta,
  listarComparativoMensal,
  dreCarteiraMensalPorAno,
  dreAutoPreenchimento,
} from "./financeiroDb";
import {
  listarExtratoUploads,
  deletarExtratoUpload,
  resumoComissoesPorCorretor,
  detalheCorretorExtrato,
  metricasComissoes,
  comissoesPendentesDetalhado,
  metricasComissoesPendentes,
  listarVendedoresCliente,
  salvarVendedoresCliente,
  listarInadimplenteUploads,
  deletarInadimplenteUpload,
  listarInadimplentes,
  metricasInadimplentes,
  atualizarStatusInadimplente,
  criarInadimplente,
  atualizarInadimplente,
  excluirInadimplente,
  resumoAnualInadimplentes,
} from "./comissoesDb";

const contaInput = z.object({
  descricao: z.string().min(1),
  dataVencimento: z.string(), // YYYY-MM-DD
  valor: z.string(),
  dataPagamento: z.string().optional().nullable(),
  status: z.enum(["PAGO", "PENDENTE", "ATRASADO"]),
  categoria: z.enum([
    "SALARIO",
    "COMISSAO",
    "DISTRIBUICAO",
    "VEICULO",
    "ESTRUTURA",
    "BANCO",
    "IMPOSTOS",
    "ALIMENTACAO",
    "MATERIAL_ESCRITORIO",
    "DIVERSOS",
  ]),
  vinculo: z.enum(["ANDERSON", "NAYARA", "ELISIA", "BARCELLOS"]),
  valorPago: z.string().optional().nullable(),
  mes: z.number().int().min(1).max(12),
  ano: z.number().int().min(2000).max(2100),
  tipo: z.enum(["RECEITA", "DESPESA"]).default("DESPESA"),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  contas: router({
     listar: publicProcedure
      .input(z.object({ mes: z.number().nullish(), ano: z.number().nullish() }))
      .query(({ input }) => listarContas({ mes: input.mes ?? undefined, ano: input.ano ?? undefined })),
    listarTodas: publicProcedure
      .input(z.object({ ano: z.number().nullish() }))
      .query(({ input }) => listarTodasContas(input.ano ?? undefined)),

    criar: publicProcedure
      .input(contaInput)
      .mutation(({ input }) =>
        criarConta({
          ...input,
          dataVencimento: input.dataVencimento as unknown as Date,
          dataPagamento: input.dataPagamento ? (input.dataPagamento as unknown as Date) : null,
        })
      ),

    atualizar: publicProcedure
      .input(z.object({ id: z.number(), data: contaInput.partial() }))
      .mutation(({ input }) => {
        const data: Record<string, unknown> = { ...input.data };
        // Garantir que datas chegam no formato YYYY-MM-DD para o MySQL
        if (input.data.dataVencimento) {
          const raw = String(input.data.dataVencimento);
          data.dataVencimento = raw.length >= 10 ? raw.substring(0, 10) as unknown as Date : input.data.dataVencimento as unknown as Date;
        }
        if (input.data.dataPagamento) {
          const raw = String(input.data.dataPagamento);
          data.dataPagamento = raw.length >= 10 ? raw.substring(0, 10) as unknown as Date : input.data.dataPagamento as unknown as Date;
        } else if (input.data.dataPagamento === null) {
          data.dataPagamento = null;
        }
        return atualizarConta(input.id, data as Parameters<typeof atualizarConta>[1]);
      }),

    excluir: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => excluirConta(input.id)),
    criarRecorrente: publicProcedure
      .input(contaInput.extend({
        mesesRecorrencia: z.number().int().min(1).max(60),
      }))
      .mutation(async ({ input }) => {
        const { mesesRecorrencia, ...base } = input;
        const criadas: number[] = [];
        for (let i = 0; i < mesesRecorrencia; i++) {
          let mes = base.mes + i;
          let ano = base.ano;
          while (mes > 12) { mes -= 12; ano++; }
          // Ajustar dataVencimento para o mesmo dia no mês correto
          const [yyyy, mm, dd] = base.dataVencimento.split("-");
          const novoMes = String(mes).padStart(2, "0");
          const novoAno = String(ano);
          const novaData = `${novoAno}-${novoMes}-${dd}`;
          await criarConta({
            ...base,
            mes,
            ano,
            dataVencimento: novaData as unknown as Date,
            dataPagamento: i === 0 && base.dataPagamento ? (base.dataPagamento as unknown as Date) : null,
            status: i === 0 ? base.status : "PENDENTE",
          });
          criadas.push(i);
        }
        return { criadas: criadas.length };
      }),

    buscarPorId: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => buscarContaPorId(input.id)),

    alertas: publicProcedure
      .input(z.object({ dias: z.number().nullish() }))
      .query(({ input }) => alertasVencimento(input.dias ?? 10)),

    vencidas: publicProcedure.query(() => contasVencidas()),

     metricas: publicProcedure
      .input(z.object({ mes: z.number().nullish(), ano: z.number().nullish() }))
      .query(({ input }) => metricas(input.mes ?? undefined, input.ano ?? undefined)),
    custosPorVinculo: publicProcedure
      .input(z.object({ mes: z.number().nullish(), ano: z.number().nullish() }))
      .query(({ input }) => custosPorVinculo(input.mes ?? undefined, input.ano ?? undefined)),
    custosPorCategoria: publicProcedure
      .input(z.object({ mes: z.number().nullish(), ano: z.number().nullish() }))
      .query(({ input }) => custosPorCategoria(input.mes ?? undefined, input.ano ?? undefined)),
    resumoMensal: publicProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => resumoMensalContas(input.ano)),
  }),

  comissoes: router({
    uploads: publicProcedure.query(() => listarExtratoUploads()),
    deletarUpload: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deletarExtratoUpload(input.id)),
    resumoPorCorretor: publicProcedure
      .input(z.object({ mes: z.number().nullish(), ano: z.number().nullish(), vendedor: z.string().optional() }))
      .query(({ input }) => resumoComissoesPorCorretor(input.mes ?? undefined, input.ano ?? undefined, input.vendedor)),
    detalheCorretor: publicProcedure
      .input(z.object({ vendedor: z.string(), mes: z.number().nullish(), ano: z.number().nullish() }))
      .query(({ input }) => detalheCorretorExtrato(input.vendedor, input.mes ?? undefined, input.ano ?? undefined)),
    metricas: publicProcedure
      .input(z.object({ mes: z.number().nullish(), ano: z.number().nullish(), vendedor: z.string().optional() }))
      .query(({ input }) => metricasComissoes(input.mes ?? undefined, input.ano ?? undefined, input.vendedor)),
    pendentesDetalhado: publicProcedure
      .input(z.object({ mes: z.number(), ano: z.number(), vendedor: z.string().optional() }))
      .query(({ input }) => comissoesPendentesDetalhado(input.mes, input.ano, input.vendedor)),
    metricasPendentes: publicProcedure
      .input(z.object({ mes: z.number(), ano: z.number() }))
      .query(({ input }) => metricasComissoesPendentes(input.mes, input.ano)),
    listarVendedoresCliente: publicProcedure
      .input(z.object({ clienteId: z.number() }))
      .query(({ input }) => listarVendedoresCliente(input.clienteId)),
    salvarVendedoresCliente: publicProcedure
      .input(z.object({
        clienteId: z.number(),
        vendedores: z.array(z.object({
          nomeVendedor: z.string().min(1),
          percentual: z.number().min(0).max(100),
        })),
      }))
      .mutation(({ input }) => salvarVendedoresCliente(input.clienteId, input.vendedores)),
  }),

  origens: router({
    listar: publicProcedure
      .query(() => listarOrigens()),
    criar: publicProcedure
      .input(z.object({ nome: z.string().min(1), cor: z.string().optional() }))
      .mutation(({ input }) => criarOrigem(input.nome, input.cor)),
    atualizar: publicProcedure
      .input(z.object({ id: z.number(), nome: z.string().min(1), cor: z.string().optional(), ativo: z.boolean().optional() }))
      .mutation(({ input }) => atualizarOrigem(input.id, input.nome, input.cor, input.ativo)),
    excluir: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => excluirOrigem(input.id)),
  }),

  clientes: router({
    listar: publicProcedure
      .input(z.object({
        busca: z.string().optional(),
        status: z.string().optional(),
        vendedor: z.string().optional(),
        origemId: z.number().optional(),
        idadeMin: z.number().optional(),
        idadeMax: z.number().optional(),
        valorMin: z.number().optional(),
        valorMax: z.number().optional(),
        produto: z.string().optional(),
        dataNascimentoInicio: z.string().optional(),
        dataNascimentoFim: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }))
      .query(({ input }) => listarClientes(input)),
    listarVendedores: publicProcedure
      .query(() => listarVendedores()),
    criar: publicProcedure
      .input(z.object({
        nome: z.string().min(1),
        cpf: z.string().optional().nullable(),
        vendedor: z.string().optional().nullable(),
        status: z.string().optional().nullable(),
        produtos: z.string().optional().nullable(),
        telefone: z.string().optional().nullable(),
        celular: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        dataNascimento: z.string().optional().nullable(),
        endereco: z.string().optional().nullable(),
        bairro: z.string().optional().nullable(),
        cidade: z.string().optional().nullable(),
        cep: z.string().optional().nullable(),
        observacao: z.string().optional().nullable(),
        taxaComissao: z.string().optional().nullable(),
        valorTotalComissao: z.string().optional().nullable(),
        valorComissao: z.string().optional().nullable(),
        origemId: z.number().optional().nullable(),
      }))
      .mutation(({ input }) => criarCliente(input as any)),
    atualizar: publicProcedure
      .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(({ input }) => atualizarCliente(input.id, input.data as any)),
     excluir: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => excluirCliente(input.id)),
    aniversariantesDia: publicProcedure
      .input(z.object({ dia: z.number().optional(), mes: z.number().optional(), statusFiltro: z.string().optional() }))
      .query(({ input }) => listarAniversariantes(input.dia, input.mes, input.statusFiltro)),
    aniversariantesMes: publicProcedure
      .input(z.object({ mes: z.number().optional(), statusFiltro: z.string().optional() }))
      .query(({ input }) => listarAniversariantesMes(input.mes, input.statusFiltro)),
    enviarAniversarioIndividual: publicProcedure
      .input(z.object({ clienteId: z.number() }))
      .mutation(({ input }) => enviarAniversarioIndividual(input.clienteId)),
    buscarPorCpf: publicProcedure
      .input(z.object({ cpf: z.string() }))
      .query(({ input }) => buscarClientePorCpf(input.cpf)),
    exportarTodos: publicProcedure
      .input(z.object({ status: z.string().optional() }))
      .query(({ input }) => listarClientes({ status: input.status, limit: 99999, offset: 0 })),
  }),
  vendas: router({
    listar: publicProcedure
      .input(z.object({ mes: z.number().nullish(), ano: z.number().nullish(), corretor: z.string().optional() }))
      .query(({ input }) => listarVendas({ mes: input.mes ?? undefined, ano: input.ano ?? undefined, corretor: input.corretor })),
    resumoPorCorretor: publicProcedure
      .input(z.object({ mes: z.number().nullish(), ano: z.number().nullish() }))
      .query(({ input }) => resumoVendasPorCorretor(input.ano ?? undefined, input.mes ?? undefined)),
    metricas: publicProcedure
      .input(z.object({ mes: z.number().nullish(), ano: z.number().nullish() }))
      .query(({ input }) => metricasVendas(input.ano ?? undefined, input.mes ?? undefined)),
    resumoMensal: publicProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => resumoMensalVendas(input.ano)),
    criar: publicProcedure
      .input(z.object({
        mes: z.number(), ano: z.number(),
        cpfCliente: z.string().optional().nullable(),
        nomeCliente: z.string(),
        produto: z.string().optional().nullable(),
        corretor: z.string().optional().nullable(),
        dataVenda: z.string().optional().nullable(),
        valorPremio: z.number().optional().nullable(),
        cpfNovo: z.string().optional().nullable(),
        valorComissao: z.number().optional().nullable(),
        comissaoPaga: z.string().optional().nullable(),
        implantada: z.string().optional().nullable(),
        proposta: z.string().optional().nullable(),
        observacao: z.string().optional().nullable(),
        email: z.string().optional().nullable(),
        telefone: z.string().optional().nullable(),
        celular: z.string().optional().nullable(),
        dataNascimento: z.string().optional().nullable(),
        endereco: z.string().optional().nullable(),
        bairro: z.string().optional().nullable(),
        cidade: z.string().optional().nullable(),
        cep: z.string().optional().nullable(),
       vendedoresJson: z.string().optional().nullable(),
        origemId: z.number().optional().nullable(),
      }))
      .mutation(({ input }) => criarVenda(input as any)),
    atualizar: publicProcedure
      .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(({ input }) => atualizarVenda(input.id, input.data as Partial<Parameters<typeof atualizarVenda>[1]>)),
    excluir: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => excluirVenda(input.id)),
    comissoesPendentes: publicProcedure
      .input(z.object({ ano: z.number().optional() }))
      .query(({ input }) => comissoesPendentesPorVendedor(input.ano)),
    listarPendentes: publicProcedure
      .input(z.object({ corretor: z.string().optional(), ano: z.number().optional() }))
      .query(({ input }) => listarVendasComissaoPendente(input)),
    marcarPagas: publicProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(({ input }) => marcarComissoesPagas(input.ids)),
    enviarParaBase: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => enviarVendaParaBase(input.id)),
  }),

  sinistros: router({
    listar: publicProcedure
      .input(z.object({ busca: z.string().optional(), status: z.string().optional(), dataInicio: z.string().optional(), dataFim: z.string().optional() }))
      .query(({ input }) => listarSinistros(input)),
    metricas: publicProcedure.query(() => metricasSinistros()),
    criar: publicProcedure
      .input(z.object({
        nomeSegurado: z.string(),
        cpfSegurado: z.string().optional().nullable(),
        protocolo: z.string().optional().nullable(),
        dataProtocolo: z.string().optional().nullable(),
        produto: z.string().optional().nullable(),
        valorCapital: z.number().optional().nullable(),
        valorRecebido: z.number().optional().nullable(),
        status: z.enum(["Pagamento", "Em Análise", "Pendente", "Recusado"]).optional(),
        dataRecebimento: z.string().optional().nullable(),
        dataNascimento: z.string().optional().nullable(),
        beneficiario1: z.string().optional().nullable(),
        telefone1: z.string().optional().nullable(),
        beneficiario2: z.string().optional().nullable(),
        telefone2: z.string().optional().nullable(),
        beneficiario3: z.string().optional().nullable(),
        telefone3: z.string().optional().nullable(),
        beneficiario4: z.string().optional().nullable(),
        telefone4: z.string().optional().nullable(),
        beneficiario5: z.string().optional().nullable(),
        telefone5: z.string().optional().nullable(),
        observacao: z.string().optional().nullable(),
      }))
      .mutation(({ input }) => criarSinistro(input as any)),
    atualizar: publicProcedure
      .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(({ input }) => atualizarSinistro(input.id, input.data as any)),
    excluir: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => excluirSinistro(input.id)),
    // CRM de Beneficiários
    listarBeneficiarios: publicProcedure
      .input(z.object({ sinistroId: z.number() }))
      .query(({ input }) => listarBeneficiariosCRM(input.sinistroId)),
    metricasCRM: publicProcedure.query(() => metricasCRMBeneficiarios()),
    criarBeneficiario: publicProcedure
      .input(z.object({
        sinistroId: z.number(),
        nome: z.string(),
        telefone: z.string().optional().nullable(),
        nomeSegurado: z.string().optional().nullable(),
        statusSinistro: z.string().optional().nullable(),
        statusCRM: z.enum(["AGUARDANDO", "ENTRAR EM CONTATO", "FECHADO", "RECUSADO"]).optional(),
        dataFechamento: z.string().optional().nullable(),
        historico: z.string().optional().nullable(),
        observacao: z.string().optional().nullable(),
      }))
      .mutation(({ input }) => criarBeneficiarioCRM(input as any)),
    atualizarBeneficiario: publicProcedure
      .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(({ input }) => atualizarBeneficiarioCRM(input.id, input.data as any)),
    excluirBeneficiario: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => excluirBeneficiarioCRM(input.id)),
  }),

  inadimplentes: router({
    uploads: publicProcedure.query(() => listarInadimplenteUploads()),
    deletarUpload: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deletarInadimplenteUpload(input.id)),
    listar: publicProcedure
      .input(z.object({ mes: z.number().nullish(), ano: z.number().nullish(), status: z.string().nullish() }))
      .query(({ input }) => listarInadimplentes(input.mes ?? undefined, input.ano ?? undefined, input.status ?? undefined)),
    metricas: publicProcedure
      .input(z.object({ mes: z.number().nullish(), ano: z.number().nullish() }))
      .query(({ input }) => metricasInadimplentes(input.mes ?? undefined, input.ano ?? undefined)),
    atualizarStatus: publicProcedure
      .input(z.object({ id: z.number(), status: z.string(), historico: z.string().optional() }))
      .mutation(({ input }) => atualizarStatusInadimplente(input.id, input.status, input.historico)),
    criar: publicProcedure
      .input(z.object({
        mes: z.number(), ano: z.number(),
        nome: z.string().min(1),
        cpf: z.string().optional().nullable(),
        telefone1: z.string().optional().nullable(),
        mesParcela: z.string().optional().nullable(),
        parcela: z.string().optional().nullable(),
        formaPagamento: z.string().optional().nullable(),
        valorParcelas: z.string().optional().nullable(),
        valorTotal: z.number().optional().nullable(),
        produtos: z.string().optional().nullable(),
        status: z.string().optional().nullable(),
        historicoCobranca: z.string().optional().nullable(),
      }))
      .mutation(({ input }) => criarInadimplente(input as any)),
    atualizar: publicProcedure
      .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(({ input }) => atualizarInadimplente(input.id, input.data)),
    excluir: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => excluirInadimplente(input.id)),
    resumoAnual: publicProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => resumoAnualInadimplentes(input.ano)),
  }),

  crmLeads: router({
    listar: publicProcedure
      .input(z.object({
        busca: z.string().optional(), status: z.string().optional(),
        mes: z.number().optional(), ano: z.number().optional(),
        vendedor: z.string().optional(), origem: z.string().optional(),
        dataInicio: z.string().optional(), dataFim: z.string().optional(),
        cidades: z.array(z.string()).optional(), uf: z.string().optional(), bairro: z.string().optional(),
      }))
      .query(({ input }) => listarLeads(input)),
    listarOrigens: publicProcedure.query(() => listarOrigensLeads()),
    listarCidades: publicProcedure.query(() => listarCidadesLeads()),
    listarUFs: publicProcedure.query(() => listarUFsLeads()),
    criarOrigem: publicProcedure
      .input(z.object({ nome: z.string().min(1) }))
      .mutation(({ input }) => criarOrigemLead(input.nome)),
    excluirOrigem: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => excluirOrigemLead(input.id)),
    listarVendedores: publicProcedure.query(() => listarVendedoresLeads()),
    metricas: publicProcedure
      .input(z.object({ ano: z.number().optional(), mes: z.number().optional(), vendedor: z.string().optional() }))
      .query(({ input }) => metricasLeads(input.ano, input.mes, input.vendedor)),
    criar: publicProcedure
      .input(z.object({
        nome: z.string(),
        cpf: z.string().optional().nullable(),
        telefone: z.string().optional().nullable(),
        celular2: z.string().optional().nullable(),
        celular3: z.string().optional().nullable(),
        fixo1: z.string().optional().nullable(),
        fixo2: z.string().optional().nullable(),
        fixo3: z.string().optional().nullable(),
        logradouro: z.string().optional().nullable(),
        numero: z.string().optional().nullable(),
        complemento: z.string().optional().nullable(),
        bairro: z.string().optional().nullable(),
        cidade: z.string().optional().nullable(),
        uf: z.string().optional().nullable(),
        dataEntrega: z.string().optional().nullable(),
        mes: z.number().optional().nullable(),
        ano: z.number().optional().nullable(),
        status: z.enum(["AGUARDANDO", "SEM CONTATO", "EM CONTATO", "AGENDAMENTO", "FECHAMENTO", "RECUSADO", "ENVIADO"]).optional(),
        valorEstimado: z.number().optional().nullable(),
        historico: z.string().optional().nullable(),
        observacao: z.string().optional().nullable(),
        dataFechamento: z.string().optional().nullable(),
        origem: z.string().optional().nullable(),
        vendedor: z.string().optional().nullable(),
      }))
      .mutation(({ input }) => criarLead(input as any)),
    atualizar: publicProcedure
      .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(({ input }) => atualizarLead(input.id, input.data)),
    excluir: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => excluirLead(input.id)),
    excluirTodos: publicProcedure
      .input(z.object({ mes: z.number(), ano: z.number() }))
      .mutation(({ input }) => excluirLeadsPorMesAno(input.mes, input.ano)),
    marcarEnviados: publicProcedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(({ input }) => marcarLeadsEnviados(input.ids)),
  }),

  produtos: router({
    listar: publicProcedure.query(() => listarProdutos()),
    listarDoCliente: publicProcedure
      .input(z.object({ clienteId: z.number() }))
      .query(({ input }) => listarProdutosDoCliente(input.clienteId)),
    vincular: publicProcedure
      .input(z.object({ clienteId: z.number(), produtoId: z.number() }))
      .mutation(({ input }) => vincularProdutoCliente(input.clienteId, input.produtoId)),
    desvincular: publicProcedure
      .input(z.object({ clienteId: z.number(), produtoId: z.number() }))
      .mutation(({ input }) => desvincularProdutoCliente(input.clienteId, input.produtoId)),
    listarClientesPorProduto: publicProcedure
      .input(z.object({ produtoId: z.number() }))
      .query(({ input }) => listarClientesPorProduto(input.produtoId)),
  }),

  crmBeneficiarios: router({
    listar: publicProcedure
      .input(z.object({ busca: z.string().optional(), statusCRM: z.string().optional() }))
      .query(({ input }) => listarTodosBeneficiariosCRM(input)),
    metricas: publicProcedure.query(() => metricasCRMBeneficiarios()),
    atualizar: publicProcedure
      .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(({ input }) => atualizarBeneficiarioCRM(input.id, input.data as any)),
    excluir: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => excluirBeneficiarioCRM(input.id)),
  }),
  financeiro: router({
    drePorAno: publicProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => listarDrePorAno(input.ano)),
    drePorMes: publicProcedure
      .input(z.object({ mes: z.number(), ano: z.number() }))
      .query(({ input }) => listarDrePorMes(input.mes, input.ano)),
    resumoDre: publicProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => resumoDrePorAno(input.ano)),
    salvarDre: publicProcedure
      .input(z.object({
        mes: z.number(),
        ano: z.number(),
        tipo: z.enum(["RECEITA", "DESPESA"]),
        categoria: z.string(),
        subcategoria: z.string().optional().nullable(),
        valor: z.string(),
      }))
      .mutation(({ input }) => upsertDreLancamento(input)),
    historicoAnual: publicProcedure.query(() => listarHistoricoAnual()),
    salvarHistorico: publicProcedure
      .input(z.object({
        ano: z.number(),
        receitaTotal: z.string(),
        carteira: z.string(),
        angariacao: z.string(),
      }))
      .mutation(({ input }) => upsertHistoricoAnual(input)),
    metasPorAno: publicProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => listarMetasPorAno(input.ano)),
    salvarMeta: publicProcedure
      .input(z.object({
        ano: z.number(),
        mes: z.number(),
        metaReceita: z.string(),
        metaCarteira: z.string(),
        metaAngariacao: z.string(),
        metaLucro: z.string().optional().nullable(),
        metaVendas: z.string().optional().nullable(),
        metaCpfs: z.number().optional().nullable(),
        metaPropostas: z.number().optional().nullable(),
      }))
      .mutation(({ input }) => upsertMeta(input)),
    comparativoMensal: publicProcedure.query(() => listarComparativoMensal()),
    carteiraMensal: publicProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => dreCarteiraMensalPorAno(input.ano)),
    autoPreenchimento: publicProcedure
      .input(z.object({ mes: z.number(), ano: z.number() }))
      .query(({ input }) => dreAutoPreenchimento(input.mes, input.ano)),
  }),
  cancelados: router({
    listar: publicProcedure
      .input(z.object({
        mes: z.number().optional(),
        ano: z.number().optional(),
        status: z.string().optional(),
        busca: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }))
      .query(({ input }) => listarCancelados(input)),
    criar: publicProcedure
      .input(z.object({
        mes: z.number(),
        ano: z.number(),
        nome: z.string().min(1),
        cpf: z.string().optional().nullable(),
        produto: z.string().optional().nullable(),
        status: z.string(),
        observacao: z.string().optional().nullable(),
      }))
      .mutation(({ input }) => criarCancelado(input as any)),
    atualizar: publicProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          nome: z.string().optional(),
          cpf: z.string().optional().nullable(),
          produto: z.string().optional().nullable(),
          status: z.string().optional(),
          observacao: z.string().optional().nullable(),
          mes: z.number().optional(),
          ano: z.number().optional(),
        }),
      }))
      .mutation(({ input }) => atualizarCancelado(input.id, input.data as any)),
    excluir: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => excluirCancelado(input.id)),
    metricasMensal: publicProcedure
      .input(z.object({ mes: z.number(), ano: z.number() }))
      .query(({ input }) => metricasCanceladosMensal(input.mes, input.ano)),
    metricasAnual: publicProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => metricasCanceladosAnual(input.ano)),
    anosDisponiveis: publicProcedure
      .query(() => anosDisponiveisCancelados()),
    listarUploads: publicProcedure
      .query(() => listarUploadsCancelados()),
    deletarUpload: publicProcedure
      .input(z.object({ uploadId: z.number() }))
      .mutation(({ input }) => deletarUploadCancelados(input.uploadId)),
    entradaSaidaMensal: publicProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => entradaSaidaMensal(input.ano)),
    entradaSaidaAcumulada: publicProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => entradaSaidaAcumulada(input.ano)),
  }),
  // ─── Configurações / Usuários ──────────────────────────────────────────────
  configuracoes: router({
    // Login próprio (independente do Manus OAuth)
    login: publicProcedure
      .input(z.object({ email: z.string().email(), senha: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const result = await loginUsuario(input.email, input.senha);
        if (!result) throw new Error("Email ou senha inválidos");
        return result;
      }),
    validarToken: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const user = await validarSessao(input.token);
        return user;
      }),
    logout: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        await logoutSessao(input.token);
        return { ok: true };
      }),
    // Usuários (somente admin)
    listarUsuarios: publicProcedure
      .query(() => listarUsuarios()),
    criarUsuario: publicProcedure
      .input(z.object({
        nome: z.string().min(2),
        email: z.string().email(),
        senha: z.string().min(6),
        role: z.enum(["admin", "user"]).default("user"),
      }))
      .mutation(({ input }) => criarUsuario(input)),
    atualizarUsuario: publicProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().optional(),
        email: z.string().email().optional(),
        senha: z.string().optional(),
        role: z.enum(["admin", "user"]).optional(),
        ativo: z.boolean().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...dados } = input;
        return atualizarUsuario(id, dados);
      }),
    deletarUsuario: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deletarUsuario(input.id)),
    // Permissões
    listarPermissoes: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => listarPermissoesUsuario(input.userId)),
    salvarPermissoes: publicProcedure
      .input(z.object({
        userId: z.number(),
        permissoes: z.array(z.object({
          modulo: z.string(),
          podeVer: z.boolean(),
          podeCriar: z.boolean(),
          podeEditar: z.boolean(),
          podeDeletar: z.boolean(),
        })),
      }))
      .mutation(({ input }) => salvarPermissoes(input.userId, input.permissoes)),
    listarModulos: publicProcedure
      .query(() => MODULOS_SISTEMA),
  }),
  vendedoresCadastro: router({
    listar: publicProcedure
      .query(() => listarVendedoresCadastro()),
    listarAtivos: publicProcedure
      .query(() => listarVendedoresAtivos()),
    criar: publicProcedure
      .input(z.object({ nome: z.string().min(1) }))
      .mutation(({ input }) => criarVendedor(input.nome)),
    atualizar: publicProcedure
      .input(z.object({ id: z.number(), nome: z.string().min(1).optional(), ativo: z.boolean().optional() }))
      .mutation(({ input }) => {
        const { id, ...dados } = input;
        return atualizarVendedor(id, dados);
      }),
    excluir: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => excluirVendedor(input.id)),
  }),
  extratoBancario: router({
    listarUploads: publicProcedure
      .query(() => listarUploadsExtrato()),
    listarLancamentos: publicProcedure
      .input(z.object({ uploadId: z.number() }))
      .query(({ input }) => listarLancamentosExtrato(input.uploadId)),
    atualizarLancamento: publicProcedure
      .input(z.object({
        id: z.number(),
        categoria: z.string().nullable().optional(),
        vinculo: z.string().nullable().optional(),
        observacao: z.string().optional(),
      }))
      .mutation(({ input }) => {
        const { id, ...params } = input;
        return atualizarLancamentoExtrato(id, params);
      }),
    atualizarLote: publicProcedure
      .input(z.object({
        uploadId: z.number(),
        lancamentoTipo: z.string(),
        categoria: z.string().nullable().optional(),
        vinculo: z.string().nullable().optional(),
      }))
      .mutation(({ input }) => {
        const { uploadId, lancamentoTipo, ...params } = input;
        return atualizarLoteExtrato(uploadId, lancamentoTipo, params);
      }),
    resumo: publicProcedure
      .input(z.object({ uploadId: z.number() }))
      .query(({ input }) => resumoPorCategoria(input.uploadId)),
    confirmar: publicProcedure
      .input(z.object({ uploadId: z.number(), mes: z.number(), ano: z.number() }))
      .mutation(({ input }) => confirmarImportacaoExtrato(input.uploadId, input.mes, input.ano)),
    deletarUpload: publicProcedure
      .input(z.object({ uploadId: z.number() }))
      .mutation(({ input }) => deletarUploadExtrato(input.uploadId)),
    excluirSemCategoria: publicProcedure
      .input(z.object({ uploadId: z.number() }))
      .mutation(({ input }) => excluirLancamentosSemCategoria(input.uploadId)),
    excluirLancamento: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => excluirLancamentoExtrato(input.id)),
    listarCategorias: publicProcedure
      .query(() => CATEGORIAS),
    listarVinculos: publicProcedure
      .query(() => VINCULOS),
  }),
  mensagemDiaria: router({
    buscarDados: publicProcedure
      .input(z.object({ mes: z.number(), ano: z.number() }))
      .query(({ input }) => buscarDadosMensagemDiaria(input.mes, input.ano)),
  }),

  relatorio: router({
    obterMetricas: publicProcedure
      .input(z.object({ mes: z.number(), ano: z.number() }))
      .query(({ input }) => obterMetricasMes(input.mes, input.ano)),
    obter: publicProcedure
      .input(z.object({ mes: z.number(), ano: z.number() }))
      .query(({ input }) => obterRelatorio(input.mes, input.ano)),
    salvar: publicProcedure
      .input(z.object({
        mes: z.number(),
        ano: z.number(),
        acaoNecessaria: z.string().nullable().optional(),
        insightReceita: z.string().nullable().optional(),
        insightColaboradores: z.string().nullable().optional(),
        acoesCorretivas: z.string().nullable().optional(),
        metaProximoMes: z.string().nullable().optional(),
        observacoesGerais: z.string().nullable().optional(),
        metaReceitaManual: z.string().nullable().optional(),
        metaCpfsManual: z.number().nullable().optional(),
        metaPropostasManual: z.number().nullable().optional(),
        imap: z.string().nullable().optional(),
      }))
      .mutation(({ input }) => {
        const { mes, ano, ...dados } = input;
        return salvarRelatorio(mes, ano, dados);
      }),
    listar: publicProcedure
      .input(z.object({ ano: z.number() }))
      .query(({ input }) => listarRelatorios(input.ano)),
  }),
  gestaoTempo: router({
    listarDia: publicProcedure
      .input(z.object({ appUserId: z.number(), data: z.string() }))
      .query(({ input }) => listarTarefasPorData(input.appUserId, input.data)),

    listarBacklog: publicProcedure
      .input(z.object({ appUserId: z.number() }))
      .query(({ input }) => listarTarefasSemData(input.appUserId)),

    listarSemana: publicProcedure
      .input(z.object({ appUserId: z.number(), dataInicio: z.string(), dataFim: z.string() }))
      .query(({ input }) => listarTarefasSemana(input.appUserId, input.dataInicio, input.dataFim)),

    criar: publicProcedure
      .input(z.object({
        appUserId: z.number(),
        titulo: z.string(),
        descricao: z.string().optional(),
        triade: z.enum(["IMPORTANTE", "URGENTE", "CIRCUNSTANCIAL"]),
        categoria: z.enum(["COMERCIAL", "SAUDE", "CASA_FAMILIA", "PESSOAL", "FINANCEIRO", "EDUCACAO", "OUTROS"]),
        duracaoMin: z.number().optional(),
        dataAgendada: z.string().optional(),
        horaAgendada: z.string().optional(),
        recorrente: z.boolean().optional(),
        recorrencia: z.enum(["DIARIA", "SEMANAL", "MENSAL"]).optional(),
        diasSemana: z.string().optional(),
      }))
      .mutation(({ input }) => criarTarefa(input)),

    atualizar: publicProcedure
      .input(z.object({
        id: z.number(),
        appUserId: z.number(),
        titulo: z.string().optional(),
        descricao: z.string().optional(),
        triade: z.enum(["IMPORTANTE", "URGENTE", "CIRCUNSTANCIAL"]).optional(),
        categoria: z.enum(["COMERCIAL", "SAUDE", "CASA_FAMILIA", "PESSOAL", "FINANCEIRO", "EDUCACAO", "OUTROS"]).optional(),
        duracaoMin: z.number().optional(),
        dataAgendada: z.string().optional(),
        horaAgendada: z.string().optional(),
        status: z.enum(["PENDENTE", "EM_EXECUCAO", "CONCLUIDA", "CANCELADA"]).optional(),
        tempoExecucaoSeg: z.number().optional(),
        recorrente: z.boolean().optional(),
        recorrencia: z.enum(["DIARIA", "SEMANAL", "MENSAL"]).optional(),
        diasSemana: z.string().optional(),
      }))
      .mutation(({ input }) => {
        const { id, appUserId, ...data } = input;
        return atualizarTarefa(id, appUserId, data);
      }),

    concluir: publicProcedure
      .input(z.object({ id: z.number(), appUserId: z.number(), tempoExecucaoSeg: z.number().optional(), dataOcorrencia: z.string().optional() }))
      .mutation(({ input }) => concluirTarefa(input.id, input.appUserId, input.tempoExecucaoSeg, input.dataOcorrencia)),

    excluir: publicProcedure
      .input(z.object({ id: z.number(), appUserId: z.number() }))
      .mutation(({ input }) => excluirTarefa(input.id, input.appUserId)),

    // Duplicar tarefa: cria cópia idêntica (PENDENTE, tempo zerado).
    // novaData: undefined = mesmo dia | null = sem data (backlog) | "YYYY-MM-DD" = data específica
    duplicar: publicProcedure
      .input(z.object({
        id: z.number(),
        appUserId: z.number(),
        novaData: z.string().nullable().optional(),
      }))
      .mutation(({ input }) => duplicarTarefa(input.id, input.appUserId, input.novaData)),

    score: publicProcedure
      .input(z.object({ appUserId: z.number(), dataInicio: z.string(), dataFim: z.string() }))
      .query(({ input }) => obterScoreProdutividade(input.appUserId, input.dataInicio, input.dataFim)),
    buscar: publicProcedure
      .input(z.object({ appUserId: z.number(), termo: z.string() }))
      .query(({ input }) => buscarTarefas(input.appUserId, input.termo)),
    relatorioDiario: publicProcedure
      .input(z.object({ appUserId: z.number(), data: z.string() }))
      .query(async ({ input }) => {
        const tarefas = await listarTarefasPorData(input.appUserId, input.data);
        const concluidas = tarefas.filter(t => t.status === "CONCLUIDA" || (t.tempoExecucaoSeg ?? 0) > 0);
        const totalSegundos = tarefas.reduce((acc, t) => acc + (t.tempoExecucaoSeg ?? 0), 0);
        // Agrupar por categoria
        const porCategoria: Record<string, { totalSeg: number; tarefas: number }> = {};
        for (const t of tarefas) {
          const cat = t.categoria ?? "OUTROS";
          if (!porCategoria[cat]) porCategoria[cat] = { totalSeg: 0, tarefas: 0 };
          porCategoria[cat].totalSeg += t.tempoExecucaoSeg ?? 0;
          porCategoria[cat].tarefas += 1;
        }
        return {
          data: input.data,
          totalTarefas: tarefas.length,
          tarefasConcluidas: concluidas.length,
          totalSegundos,
          porCategoria: Object.entries(porCategoria).map(([categoria, v]) => ({ categoria, ...v })),
          tarefas: tarefas.map(t => ({
            id: t.id,
            titulo: t.titulo,
            categoria: t.categoria ?? "OUTROS",
            triade: t.triade,
            status: t.status,
            duracaoMin: t.duracaoMin ?? 0,
            tempoExecucaoSeg: t.tempoExecucaoSeg ?? 0,
          })),
        };
      }),
    relatorioPorPeriodo: publicProcedure
      .input(z.object({
        appUserId: z.number(),
        dataInicio: z.string(), // YYYY-MM-DD
        dataFim: z.string(),    // YYYY-MM-DD
      }))
      .query(async ({ input }) => {
        const tarefas = await listarTarefasPorPeriodo(input.appUserId, input.dataInicio, input.dataFim);
        const concluidas = tarefas.filter(t => t.status === "CONCLUIDA" || (t.tempoExecucaoSeg ?? 0) > 0);
        const totalSegundos = tarefas.reduce((acc, t) => acc + (t.tempoExecucaoSeg ?? 0), 0);
        // Agrupar por categoria
        const porCategoria: Record<string, { totalSeg: number; tarefas: number }> = {};
        for (const t of tarefas) {
          const cat = t.categoria ?? "OUTROS";
          if (!porCategoria[cat]) porCategoria[cat] = { totalSeg: 0, tarefas: 0 };
          porCategoria[cat].totalSeg += t.tempoExecucaoSeg ?? 0;
          porCategoria[cat].tarefas += 1;
        }
        // Agrupar por dia
        const porDia: Record<string, { totalSeg: number; tarefas: number; concluidas: number }> = {};
        for (const t of tarefas) {
          const dia = t.data || "sem-data";
          if (!porDia[dia]) porDia[dia] = { totalSeg: 0, tarefas: 0, concluidas: 0 };
          porDia[dia].totalSeg += t.tempoExecucaoSeg ?? 0;
          porDia[dia].tarefas += 1;
          if (t.status === "CONCLUIDA" || (t.tempoExecucaoSeg ?? 0) > 0) {
            porDia[dia].concluidas += 1;
          }
        }
        return {
          dataInicio: input.dataInicio,
          dataFim: input.dataFim,
          totalTarefas: tarefas.length,
          tarefasConcluidas: concluidas.length,
          totalSegundos,
          porCategoria: Object.entries(porCategoria).map(([categoria, v]) => ({ categoria, ...v })),
          porDia: Object.entries(porDia)
            .map(([data, v]) => ({ data, ...v }))
            .sort((a, b) => a.data.localeCompare(b.data)),
          tarefas: tarefas.map(t => ({
            id: t.id,
            titulo: t.titulo,
            categoria: t.categoria ?? "OUTROS",
            triade: t.triade,
            status: t.status,
            duracaoMin: t.duracaoMin ?? 0,
            tempoExecucaoSeg: t.tempoExecucaoSeg ?? 0,
            data: t.data,
          })),
        };
      }),
  }),
  inadimplentesDisparo: inadimplentesDisparoRouter,
  whatsapp: whatsappRouter,
  mag: magTrpcRouter,

  lembretes: router({
    listar: publicProcedure
      .input(z.object({ appUserId: z.number(), data: z.string() }))
      .query(({ input }) => listarLembretes(input.appUserId, input.data)),
    criar: publicProcedure
      .input(z.object({
        appUserId: z.number(),
        texto: z.string().min(1),
        data: z.string(),
        hora: z.string().optional().nullable(),
        icone: z.string().optional().nullable(),
      }))
      .mutation(({ input }) => criarLembrete(input)),
    toggle: publicProcedure
      .input(z.object({ id: z.number(), appUserId: z.number() }))
      .mutation(({ input }) => toggleLembrete(input.id, input.appUserId)),
    atualizar: publicProcedure
      .input(z.object({
        id: z.number(),
        appUserId: z.number(),
        texto: z.string().min(1),
        data: z.string(),
        hora: z.string().optional().nullable(),
        icone: z.string().optional().nullable(),
      }))
      .mutation(({ input }) => atualizarLembrete(input.id, input.appUserId, {
        texto: input.texto,
        data: input.data,
        hora: input.hora,
        icone: input.icone,
      })),
    excluir: publicProcedure
      .input(z.object({ id: z.number(), appUserId: z.number() }))
      .mutation(({ input }) => excluirLembrete(input.id, input.appUserId)),
  }),
});
export type AppRouter = typeof appRouter;

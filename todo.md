# Contas a Pagar - TODO

- [x] Schema do banco de dados (tabela contas)
- [x] Backend: helpers de banco (db.ts)
- [x] Backend: rotas tRPC (listar, criar, editar, excluir)
- [x] Layout com DashboardLayout e sidebar com meses
- [x] Página mensal com tabela de lançamentos
- [x] Formulário de cadastro/edição de conta
- [x] Dropdowns: Status, Categoria, Vínculo
- [x] Consolidação automática na visualização de dados
- [x] Dashboard com filtro por mês/anual
- [x] Métricas: Total a Pagar, Total Pago, Total Recebido, Saldo Final
- [x] Análise de custos por vínculo (nominal + percentual)
- [x] Gráfico de pizza por vínculo
- [x] Análise de distribuição por categoria (nominal + percentual)
- [x] Gráfico de pizza por categoria
- [x] Alertas de vencimento nos próximos 10 dias
- [x] Alertas de contas vencidas
- [x] Exportação de relatório em Excel
- [x] Exportação de relatório em PDF
- [x] Testes vitest
- [x] Seletor de ano global na sidebar e páginas mensais
- [x] Aplicar identidade visual da Barcellos Seguros (cores, logo, tipografia)
- [x] Expandir seletor de anos para 2026-2050

## Módulo Comissões
- [x] Schema: tabelas extratoComissao e corretores
- [x] Backend: endpoint de upload de Excel (multipart)
- [x] Backend: processamento do extrato (cruzamento por corretor)
- [x] Backend: queries de resultado por corretor/mês
- [x] Frontend: página de upload de extrato mensal
- [x] Frontend: dashboard de comissões por corretor
- [x] Frontend: histórico de extratos importados

## Módulo Inadimplentes
- [x] Schema: tabela inadimplentes
- [x] Backend: endpoint de upload de planilha de inadimplentes
- [x] Backend: processamento e normalização dos dados
- [x] Backend: queries de inadimplentes por mês/status
- [x] Frontend: página de upload de planilha mensal
- [x] Frontend: painel de inadimplentes com filtros e histórico de cobrança
- [x] Frontend: alertas e indicadores de inadimplência

## Importação de Dados Reais
- [ ] Importar dados de Comissões (PAGANTES012026FORMULA.xlsx)
- [ ] Importar dados de Inadimplentes (BARCELLOSATRASADOS.xlsm)
- [ ] Importar dados de Vendas (CONTROLEVENDAS2026.xlsx)
- [ ] Importar dados de Sinistros (CRMSINISTROSBARCELLOS.xlsx)
- [ ] Importar dados de CRM de Leads (CRM_LEADS_ELISIA_BARCELLOS.xlsx)

## Melhorias Base de Clientes
- [x] Filtro por vendedor (dropdown com todos os vendedores)
- [x] Filtro por status (Ativo / Inativo / Todos)
- [x] Formulário de inserção de novo cliente
- [x] Formulário de edição de cliente existente
- [x] Edição rápida de status direto na tabela

## Melhorias Controle de Vendas
- [x] Analisar planilha CONTROLEVENDAS2026 e mapear todos os campos
- [x] Atualizar schema do banco para refletir campos exatos da planilha
- [x] Reimportar dados de vendas com todos os campos corretos (29 vendas Jan+Fev 2026)
- [x] Dashboard de vendas com métricas fiéis à planilha (Propostas, CPF Novos, Faturamento, Comissão, Ticket Médio, Com. Pagas, Implantadas)
- [x] Performance por vendedor com gráfico de pizza
- [x] Gráfico de evolução mensal
- [x] Formulário de inserção de nova venda (todos os campos da planilha)
- [x] Formulário de edição de venda existente
- [x] Filtro por vendedor na aba de lançamentos
- [x] Testes vitest para vendas e clientes

## Melhorias Inadimplentes
- [x] Atualizar schema da tabela inadimplentes com campos fiéis à planilha (produtos, historico, etc.)
- [x] Reimportar dados de Jan (70 reg) e Fev (83 reg) 2026 com todos os campos
- [x] Dashboard com métricas: Total Clientes, Valor Total, Valor Recuperado, Ticket Médio, Taxa de Recuperação
- [x] Distribuição por Forma de Pagamento e por Status no dashboard com barras de progresso
- [x] Sistema de cores por status: PAGO (verde), BOLETO (azul), EM CONTATO (amarelo), DESISTIU (vermelho), ESPECIAL (roxo)
- [x] Edição de status diretamente na tabela (clique no badge)
- [x] Modal de edição de status com seletor visual de cores e campo de histórico
- [x] Formulário completo de inserção e edição de inadimplente (todos os campos da planilha)
- [x] Filtros: por mês, por status, por forma de pagamento, busca por nome/CPF
- [x] Importação via Excel (upload de planilha mensal)
- [x] Testes vitest para inadimplentes (9 testes passando)

## Melhorias v3
- [x] Inadimplentes: botão "Novo Registro Manual" visível no cabeçalho (sempre visível em ambas as abas)
- [x] Dashboard principal: painel anual de inadimplência (cards de totais, gráfico de barras, linha de taxa de recuperação, tabela mensal detalhada)
- [x] Base de Clientes: campo taxa de comissão por cliente no schema (taxaComissao) e formulário
- [x] Base de Clientes: totalizadores dinâmicos (total clientes, contribuição, comissão, expectativa comissão) conforme filtro ativo

## Correções v4
- [x] Base de Clientes: corrigir valores incorretos dos totalizadores (estavam x100, corrigidos dividindo por 100 no banco)
- [x] Inadimplentes: painel anual movido para dentro da página de Inadimplentes (nova aba "Anual YYYY" com tabela mensal clicavel)
- [x] Dashboard principal: painel anual de inadimplência removido (agora só na página de Inadimplentes)

## Melhorias Sinistros
- [x] Atualizar schema: tabela sinistros com todos os campos da planilha (protocolo, produto, valorCapital, valorRecebido, status, dataRecebimento, obs, beneficiarios 1-5 com tel)
- [x] Criar tabela beneficiarios_crm para o CRM de beneficiários (vinculado ao sinistro, com status de esteira)
- [x] Reimportar os 4 registros reais da planilha com todos os campos + beneficiários no CRM
- [x] Backend: endpoints CRUD de sinistros (criar, editar, excluir, listar, métricas)
- [x] Backend: endpoints CRUD do CRM de beneficiários (criar, editar, excluir, listar, métricas)
- [x] Frontend: cards de métricas (total protocolos, valor capital, valor pago, CRM beneficiários)
- [x] Frontend: tabela de sinistros com filtros (status, busca) e totalizadores
- [x] Frontend: formulário completo de inserção e edição de sinistro (todos os campos da planilha)
- [x] Frontend: modal CRM de beneficiários com esteira visual (AGUARDANDO, ENTRAR EM CONTATO, FECHADO, RECUSADO)
- [x] Frontend: formulário de beneficiário com histórico, data de fechamento e seletor visual de status
- [x] Frontend: aba de acompanhamento mensal com tabela de protocolos por mês
- [x] 27 testes vitest passando

## Melhorias v5
- [x] CRM Beneficiários: página dedicada na sidebar com esteira visual, alerta de 60 dias e exportação CSV
- [x] CRM Leads: módulo completo com schema, backend, página com dashboard, esteira e CRUD
- [x] Relatórios: exportação CSV em todos os módulos (Clientes, Vendas, Inadimplentes, Sinistros, CRM Leads, CRM Beneficiários) — Contas já tinha ExportButton
- [x] Sidebar atualizada com todos os módulos (9 itens de menu)

## Melhorias v6
- [x] CRM Beneficiários: layout Kanban corrigido (3 colunas lado a lado, alerta 60 dias, modal de edição)
- [x] CRM Leads: aparece corretamente na sidebar
- [x] Painel de comissões pendentes: página dedicada na sidebar com agrupamento por vendedor, seleção em lote e exportação CSV
- [x] Importação de Leads via Excel: botão "Importar Excel" no CRM Leads com detecção automática de cabeçalhos
- [x] Cruzamento Lead → Cliente: botão UserPlus em cada lead para cadastrar diretamente na Base de Clientes

## BUG REPORT
- [ ] **CRÍTICO: Erro no upload de extrato bancário** - "Unexpected token '<', <doctype is not valid JSON" - Servidor retornando HTML (erro 500) em vez de JSON quando tenta fazer upload

## Correções v7
- [x] Sidebar: CRM Leads corrigido no AppLayout.tsx (componente real da sidebar)
- [x] CRM Beneficiários: modal de visualização completa adicionado (clicar no nome ou ícone Eye)

## Reestruturação v8
- [x] Sidebar: CRM Beneficiários como submenu de Sinistros
- [x] Sidebar: Meses 2026 e Dashboard financeiro movidos para dentro de Contas a Pagar
- [x] CRM Leads: separação por mês, importação com data de entrada, dashboard mensal e anual com funil
- [x] Dashboard principal: painel geral consolidado com visão de todos os módulos
- [x] AppLayout adicionado a todas as páginas sem sidebar (Clientes, Comissoes, ComissoesPendentes, CrmBeneficiarios, CrmLeads, Inadimplentes, Sinistros, Vendas)

## Módulo Financeiro Barcellos 2026
- [x] Schema: tabelas dre_lancamentos, historico_anual, metas_anuais
- [x] Backend: procedures tRPC para DRE, histórico, metas e comparativo
- [x] Seed: dados históricos 2015-2025 e DRE Janeiro 2026
- [x] Frontend: página Financeiro.tsx com 7 abas: Dashboard, DRE, Histórico, Comparativo, Metas, Indicadores, Projeções
- [x] Sidebar: item Financeiro adicionado na navegação
- [x] Rota /financeiro registrada no App.tsx
- [x] Dashboard Executivo: KPIs, evolução histórica, composição receita, indicadores chave, despesas/lucro, projeções
- [x] DRE 2026: tabela mensal de receitas e despesas com totais, editável por célula
- [x] Histórico Anual: tabela 2015-2025 com receita, carteira, angariação, variações e CAGR
- [x] Comparativo Mensal: tabela mês a mês por ano (2015-2025) com variações percentuais
- [x] Metas 2026: KPIs globais e acompanhamento mensal com % atingido e status
- [x] Indicadores: financeiros e operacionais com benchmarks e status visual
- [x] Projeções 2026-2030: 3 cenários (pessimista, realista, otimista) com premissas e gráficos

## Dashboard Financeiro - Contas a Pagar
- [x] KPIs: Valor a Pagar, Valor Pago, Valor Recebido, Saldo (mensal e anual)
- [x] Lista: Contas a vencer nos próximos 10 dias
- [x] Lista: Contas vencidas (em aberto)
- [x] Gráfico: evolução mensal de pagamentos e saldo
- [x] Tabela resumo mensal com % quitado e link para cada mês
- [x] Distribuição por vínculo e top categorias

## Expansão de Anos até 2050
- [x] Sidebar global: expandir ANOS_DISPONIVEIS de 2026-2050 para 2015-2050
- [x] Financeiro: seletor de ano expandido para 2015-2050
- [x] CRM Leads: filtros de mês/ano expandidos até 2050
- [x] Inadimplentes: filtros de ano expandidos até 2050
- [x] Contas a Pagar: seletor de meses/anos expandido até 2050
- [x] AnoContext: valor padrão e range expandido até 2050

## Responsividade Mobile
- [x] Sidebar: overlay mobile com botão hamburguer, fecha ao clicar fora
- [x] AppLayout: header mobile com botão de menu e seletor de ano
- [x] Cards KPI: grid responsivo em todas as páginas
- [x] Tabelas: scroll horizontal em mobile (overflow-x-auto)
- [x] Padding: p-3 em mobile, p-6 em desktop em todas as páginas
- [x] Grids fixos corrigidos para responsivos
- [x] Dashboard Geral: layout responsivo
- [x] Dashboard Financeiro: layout responsivo
- [x] Todas as páginas: padding e grids ajustados para mobile

## Correção Aba Comissões
- [x] Inspecionar campos do extrato no banco (nomeProdutor vs nomeCliente)
- [x] Corrigir agrupamento por corretor/vendedor real via JOIN com Base de Clientes por CPF
- [x] Cruzar dados com Base de Clientes (corretor responsável)
- [x] Adicionar filtro por corretor na página (dropdown)
- [x] Corrigir colunas da tabela de resultado
- [x] Gráfico de pizza com distribuição por corretor
- [x] Todos os corretores visíveis: ELISIA, FERNANDA, TAINÁ, NAYARA, ANA PAULA

## Correções v9 - Contas a Pagar
- [x] Bug: Data de vencimento não persistia ao abrir conta para editar (corrigido useEffect)
- [x] Filtro de status melhorado: Todos, Em Aberto, Atrasada, Pago com ícones visuais

## Restauração Métricas Especiais - Inadimplentes
- [x] Backend: calcular maisDeUmaCompetencia (clientes com 2+ parcelas em aberto no mesmo mês/ano)
- [x] Backend: calcular primeirasParcelas (clientes com as 12 primeiras parcelas em aberto)
- [x] Frontend: card KPI "2+ Competências" no dashboard mensal com contagem e destaque âmbar
- [x] Frontend: card KPI "12 Primeiras Parcelas" no dashboard mensal com contagem azul
- [x] Frontend: destaque visual (fundo âmbar + badge Multi) nas linhas da tabela com 2+ competências

## Correção Erro Conexão MySQL - Comissões
- [x] Substituir conexão mysql2 direta por pool de conexões no comissoesDb.ts (enableKeepAlive + connectionLimit)

## Reestruturação Comissões v2
- [x] Analisar colunas do extrato Excel (valor base, % comissão, % incentivo, valor incentivo)
- [x] Importação: atualizar campo contribuição na Base de Clientes (valor base do extrato)
- [x] Cálculo comissão total: Valor Comissão + Valor Incentivo (% comissão + % comissão × % incentivo)
- [x] Extrato por vendedor: colunas Previsão (15% × contribuição) e Realizado (50% × comissão paga)
- [x] Regra ELISIA: 100% dos próprios + 50% dos outros vendedores (Titular badge)
- [x] Regra outros vendedores: 50% da comissão paga + previsão de 15% sobre contribuição
- [x] Reformular Comissões Pendentes: clientes sem comissão no mês selecionado (cruzamento Base vs Extrato)
- [x] Filtros em Comissões Pendentes: por vendedor, mês, busca por nome/CPF

## Correção Comissões v3 + Cadastro de Produtos
- [x] Verificar se valorComissao/valorIncentivo/valorBase estão sendo salvos corretamente no banco
- [x] Unificar CPFs duplicados no extrato (GROUP BY CPF, somar comissão + incentivo) — 1.209 CPFs únicos
- [x] Trazer contribuição (valorBase) para Base de Clientes ao importar
- [x] Calcular previsão 15% sobre contribuição por vendedor (não-ELISIA)
- [x] ELISIA recebe 100% da comissão quando está em seu nome
- [x] Criar tabela de produtos (código + descrição) extraída do extrato — 99 produtos
- [x] Vincular produtos aos clientes — 1.805 vínculos criados
- [x] Seleção de produto no cadastro de cliente (seletor múltiplo com checkboxes)
- [x] Filtro por produto na Base de Clientes (dropdown com todos os 99 produtos)

## Correção Bug Loop Infinito
- [x] Clientes: corrigir Maximum update depth exceeded causado por useEffect com array instável (produtosDoCliente) — usar JSON.stringify como chave de dependência

## Melhorias UX Produtos - Clientes
- [x] Modal: visualização clara dos produtos selecionados (badges azuis com botão X acima da lista de checkboxes)
- [x] Filtro: multi-seleção de produtos na listagem (dropdown com checkboxes, fecha ao clicar fora, mostra badges ativos)

## Importação CSV + XLSX de Clientes
- [x] Analisar CSV e verificar divergências de contribuição
- [x] Atualizar telefone e email de todos os clientes via CSV
- [x] Atualizar contribuição dos clientes via CSV (sem sobrescrever valores existentes com zero)
- [x] Analisar XLSX e mapear campos (data nascimento, endereço)
- [x] Atualizar data de nascimento e endereço via XLSX
- [x] Cadastrar automaticamente clientes novos presentes nos arquivos mas ausentes no banco
- [x] Gerar inventário de clientes novos cadastrados
- [x] Corrigir uploadRouter: ao importar extrato, não zerar contribuição já preenchida (só atualizar se valorBase > 0)

## Correções 28/02
- [x] Corrigir corrupção no uploadRouter (linhas mescladas causando 41 erros TS)
- [x] Adicionar campos bairro, CEP, celular ao schema Drizzle e banco
- [x] Adicionar campos celular, endereço, bairro, cidade, CEP ao formulário de clientes
- [x] Confirmar seletor de produtos presente no modal de clientes
- [x] Confirmar métricas 2+ competências e 12 primeiras parcelas no Dashboard Inadimplentes

## Módulo Cancelados
- [x] Schema: tabela cancelados (nome, cpf, produto, mes, ano, status, uploadId, createdAt)
- [x] Schema: tabela uploads_cancelados (mes, ano, nomeArquivo, totalRegistros, createdAt)
- [x] Backend: helpers de banco (canceladosDb.ts)
- [x] Backend: procedures tRPC (listar, criar, editar, excluir, métricas mensais, métricas anuais)
- [x] Backend: endpoint de upload de planilha de cancelados (uploadRouter)
- [x] Frontend: página Cancelados.tsx com 3 abas: Dashboard Mensal, Registros, Visão Anual
- [x] Frontend: dashboard mensal (KPIs por status, pizza distribuição, top produtos cancelados)
- [x] Frontend: dashboard anual (gráfico barras empilhadas, tabela mensal clicavel, totais)
- [x] Frontend: importação de planilha mensal (upload com seleção de mês/ano, histórico de uploads)
- [x] Frontend: tabela de cancelados com filtros (mês, ano, status, busca) e paginação
- [x] Frontend: formulário de inserção/edição manual de cancelado com dropdown de motivo
- [x] Sidebar: item "Cancelamentos" adicionado entre Inadimplentes e Sinistros
- [x] Rota /cancelados registrada no App.tsx

## Módulo Configurações e Gestão de Usuários
- [x] Schema: tabela app_users (nome, email, senha hash, role, ativo, createdAt)
- [x] Schema: tabela app_permissoes (userId, modulo, podeVer, podeCriar, podeEditar, podeDeletar)
- [x] Schema: tabela app_sessions (token, userId, expiresAt)
- [x] Backend: login com email/senha próprio (bcrypt + token de sessão)
- [x] Backend: CRUD de usuários (criar, editar, ativar/desativar, resetar senha)
- [x] Backend: CRUD de permissões por módulo (13 módulos)
- [x] Backend: validarToken para sessões ativas
- [x] Admin padrão criado: asbarcellos31@gmail.com / barcellos2026
- [x] Frontend: AppAuthContext.tsx com contexto global de autenticação própria
- [x] Frontend: página Configurações.tsx (aba Usuários + aba Permissões com switches)
- [x] Frontend: PermissaoGuard.tsx — tela de Acesso Restrito para módulos bloqueados
- [x] Frontend: App.tsx — todas as rotas protegidas com PermissaoGuard
- [x] Sidebar: item Configurações adicionado após Financeiro

## Correção Acesso Configurações
- [x] PermissaoGuard: corrigido isLoading quando não há token — sem token = acesso liberado imediatamente (Manus OAuth), com token = valida permissões

## Correção Salvar Permissões
- [x] Corrigido: MySQL retornava tinyint(1) como number (0/1) ao invés de boolean — adicionado Boolean() na função listarPermissoesUsuario

## Página de Login Própria
- [x] Criar página /login com e-mail e senha, logo da Barcellos (fundo azul escuro, glassmorphism)
- [x] Integrar com AppAuthContext (login via tRPC, salvar token, redirecionar para dashboard)
- [x] Rota /login registrada no App.tsx
- [x] Ocultar itens da sidebar sem permissão podeVer para usuários logados com conta própria
- [x] Botão de logout na sidebar para usuários com login próprio (exibe nome + inicial do usuário)

## Importação de Extrato Bancário
- [ ] Schema: tabela extrato_bancario (data, lancamento, detalhes, nrDocumento, valor, tipo, categoriaId, vinculoId, uploadId, confirmado)
- [ ] Schema: tabela uploads_extrato_bancario (mes, ano, nomeArquivo, totalLancamentos, createdAt)
- [ ] Backend: endpoint de upload do Excel do extrato bancário
- [ ] Backend: procedures tRPC (listar, categorizar, resumo por categoria, confirmar importação)
- [ ] Frontend: página de importação com tabela de revisão e categorização
- [ ] Frontend: resumo agrupado por categoria antes de confirmar
- [ ] Frontend: ao confirmar, criar lançamentos no Contas a Pagar automaticamente
- [ ] Integrar na navegação do Contas a Pagar

## Filtros de Período e Auto-preenchimento DRE
- [x] Sinistros: filtros de data início/fim por dataProtocolo (backend + frontend)
- [x] CRM Leads: filtros de data início/fim por createdAt (backend + frontend)
- [x] DRE: botão "Preencher do Contas a Pagar" com seletor de mês (já implementado na sessão anterior)
- [x] Testes vitest: 17 testes para filtros de período e mapeamento DRE

## Correções Relatório Executivo - Receita vs Meta de Vendas
- [x] Corrigir: Receita do mês = comissão recebida (Contas a Pagar RECEITA/extrato) — NÃO é meta de vendas
- [x] Corrigir: Meta de Vendas = total de prêmio/propostas que todos os vendedores precisam vender no mês (ex: R$3.500)
- [x] Separar claramente os dois conceitos em todos os cards/KPIs do Relatório Executivo
- [x] CRM Leads no Relatório Executivo: adicionar breakdown de status dos leads do mês (quantos em cada status)
- [x] Campo metaVendas adicionado na tabela metas_anuais e na aba Metas do Financeiro

## Impressão/Exportação PDF do Relatório Executivo
- [x] Implementar CSS @media print para preservar layout (cores, grids, cards, gráficos)
- [x] Botão "Exportar PDF" que gera PDF fiel ao layout do sistema via html2canvas + jsPDF
- [x] Ocultar sidebar, header, botões de ação e filtros na impressão
- [x] Garantir que gráficos (Recharts SVG) sejam renderizados corretamente no PDF

## Logo Barcellos Seguros no Relatório Executivo
- [x] Localizar o logo da Barcellos Seguros usado no sistema (sidebar/AppLayout)
- [x] Substituir o placeholder "B" pelo logo real no cabeçalho do Relatório Executivo
- [x] Garantir que o logo aparece corretamente no PDF exportado (html2canvas com crossOrigin)

## Correção Exportação PDF
- [x] Identificar e corrigir erro ao exportar PDF no Relatório Executivo (oklch não suportado pelo html2canvas, substituído por html-to-image)
- [x] Logo Barcellos embutido em Base64 para evitar CORS no PDF
- [x] PDF gerado com sucesso: 3 páginas, fiel ao layout do sistema, com logo e gráficos preservados

## Seletor de Mês/Ano no Dashboard Geral
- [x] Adicionar seletor de mês e ano no topo do Dashboard Geral (botões < > + botão Hoje)
- [x] Passar mês/ano selecionado para todos os cards (Receita, Inadimplentes)
- [x] Passar mês/ano para os gráficos (Vendas Mensais destaca mês selecionado, Inadimplentes por Status)
- [x] Tabela Overview Mensal: clicar na linha seleciona o mês e atualiza todos os cards
- [x] Todos os títulos dos cards mostram o mês/ano selecionado

## Bug: Erro ao Atualizar Status de Conta
- [x] Corrigir: dataPagamento chegando no formato 'Mon Mar 09' (Date.toString) em vez de 'YYYY-MM-DD' ao editar conta — procedure atualizar agora normaliza para substring(0,10)

## Botão "Enviar para Base" no Controle de Vendas
- [x] Adicionar campo `naBase` (boolean) na tabela de vendas no schema
- [x] Criar procedure `enviarParaBase` no backend (verifica CPF, cria ou atualiza cliente)
- [x] Adicionar botão "Enviar para Base" (ícone UserPlus verde) em cada venda Implantada ainda não enviada
- [x] Adicionar badge visual "✓ Na Base" (verde) ou "Pendente" (âmbar) em cada linha

## Aba Gestão do Tempo (Tríade do Tempo - Neotriad)
- [x] Criar tabela `tarefas` no schema com campos: titulo, descricao, triade, categoria, duracaoMin, dataAgendada, horaAgendada, status, tempoExecucaoSeg, appUserId
- [x] Migrar banco com pnpm db:push
- [x] Backend: procedures listarDia, listarSemana, listarBacklog, criar, atualizar, concluir, excluir, score (por appUserId)
- [x] Frontend: página GestaoTempo.tsx com agenda diária (navegação < >), visão semanal e backlog
- [x] Classificação visual por Tríade: verde (Importante), vermelho (Urgente), amarelo (Circunstancial)
- [x] Timer de execução por tarefa (Play/Stop) com contagem de tempo
- [x] Score de produtividade dos últimos 30 dias com barras de progresso
- [x] Categorias: Comercial, Saúde, Pessoal, Casa/Família, Financeiro, Outros
- [x] Cada usuário vê apenas suas próprias tarefas (isolado por appUserId)
- [x] Rota /gestao-tempo registrada no App.tsx
- [x] Item "Gestão do Tempo" adicionado na sidebar com ícone Clock

## Bug: Gestão do Tempo exige login próprio
- [ ] Corrigir: módulo pede login quando appUser é null — usar ID fixo 1 (admin) como fallback para que qualquer usuário logado no sistema possa usar o módulo sem login adicional

## Backlog Lateral com Drag and Drop na Gestão do Tempo
- [x] Instalar @dnd-kit/core e @dnd-kit/sortable para drag and drop
- [x] Layout dividido: coluna principal (agenda) + coluna lateral direita (backlog sem data)
- [x] Arrastar tarefa do backlog para um dia da agenda define a dataAgendada automaticamente
- [x] Criar tarefa sem data vai direto para o backlog (dataAgendada = null)
- [x] Instrução visual "Arraste para agendar num dia" no backlog lateral
- [x] DragOverlay com card flutuante durante o arraste
- [x] Aba Backlog dedicada na visão de lista completa

## Melhoria Tela de Login
- [x] Adicionar botão "Entrar" visível e bem destacado na tela de login
- [x] Adicionar botão de Login visível na sidebar/rodapé do sistema para usuários não logados

## Correção Gestão do Tempo - Login Duplicado
- [x] Corrigir: Gestão do Tempo pede login mesmo com usuário já logado no sistema — usar ID 1 (admin) como fallback quando appUser for null
- [x] Adicionar botões de Login e Logout bem visíveis na sidebar (rodapé) para todos os usuários

## Redesign Gestão do Tempo - Layout Neotriad
- [ ] Layout tipo Neotriad: coluna esquerda (backlog: tarefas sem data + pendentes) + coluna direita (calendário semanal com colunas por dia)
- [ ] Seletor de período semanal (< semana anterior | semana atual | próxima semana >)
- [ ] Arrastar tarefa do backlog esquerdo para qualquer coluna de dia do calendário
- [ ] Arrastar tarefas entre dias do calendário semanal
- [ ] Gestão do Tempo como primeiro item da sidebar (antes do Dashboard Geral)
- [ ] Corrigir bug: submenu Contas a Pagar sempre aberto — deve iniciar fechado

## Redesign Gestão do Tempo v2 - Layout Neotriad Completo
- [x] Layout principal: coluna esquerda fixa (backlog: tarefas sem data + pendentes do dia) + coluna direita (calendário semanal com colunas por dia)
- [x] Coluna esquerda: lista tarefas sem data E tarefas pendentes (com data mas não concluuídas)
- [x] Arrastar qualquer tarefa da coluna esquerda para coluna de dia do calendário
- [x] Arrastar tarefas entre dias do calendário semanal
- [x] Botão Pausar tarefa (para timer em execução)
- [x] Botão Concluir tarefa visível em cada card
- [x] Editar tarefa mesmo após concluuída (reabrir para edição)
- [x] Gestão do Tempo como primeiro item da sidebar (antes do Dashboard Geral)
- [x] Corrigir bug: submenu Contas a Pagar sempre aberto — deve iniciar fechado

## CRM Leads - Sinalização de Observação
- [x] Adicionar ícone de balão/mensagem nos leads que possuem observação anotada
- [x] Tooltip ao passar o mouse mostrando o texto da observação

## Bug CRM Leads - Observação não salva
- [x] Corrigir: ícone de balão agora aparece quando lead tem historico OU observacao preenchidos (Nayara usa campo historico)

## BUG CRÍTICO - Lançamentos zerados no Controle de Vendas
- [x] Coluna naBase adicionada via SQL na tabela vendas — lançamentos voltaram a aparecer (35 registros)

## CRM Leads - Filtro por Vendedor no Dashboard
- [x] Adicionar botões de filtro por vendedor (Todos / ELISIA / FERNANDA / NAYARA) nas abas Mensal e Anual
- [x] Funil de vendas, métricas e lista de leads filtrados por vendedor selecionado
- [x] Backend: aceitar parâmetro vendedor nas queries de métricas e listagem

## BUG CRÍTICO - Gestão do Tempo erro React #310
- [x] Corrigir erro React #310: hooks useDraggable chamados dentro de .map() — extraídos para componentes BacklogItem e PendenteItem

## Correção Dashboard Overview Mensal - Meta
- [x] Corrigir: Overview Mensal agora usa metaVendas (não metaReceita) para calcular o atingimento da meta

## BUG CRÍTICO - Contas a Pagar sem datas de vencimento
- [x] Corrigir: formatDate não tratava objetos Date do JS (retornava "-") — corrigido em LancamentosMes.tsx e TodosLancamentos.tsx

## Módulo Email Marketing
- [x] Schema: tabelas email_templates, email_listas, email_contatos, email_campanhas, email_envios
- [x] Banco: tabelas criadas via SQL direto (CREATE TABLE IF NOT EXISTS)
- [x] Backend: emailMarketingDb.ts com helpers CRUD para todas as tabelas
- [x] Backend: emailMarketingRouter.ts com endpoints REST para templates, listas, campanhas, upload e disparo
- [x] Backend: registrar emailMarketingRouter no servidor principal (_core/index.ts)
- [x] Frontend: página EmailMarketing.tsx com 3 abas (Campanhas, Listas, Templates)
- [x] Frontend: aba Templates — criar/editar/excluir templates HTML com variáveis {{nome}}
- [x] Frontend: aba Listas — criar/excluir listas, importar planilha Excel/CSV, visualizar contatos
- [x] Frontend: aba Campanhas — criar/excluir campanhas, prévia antes de disparar, status em tempo real
- [x] Frontend: integração SendGrid via SENDGRID_API_KEY (aviso quando não configurada)
- [x] Sidebar: item "Email Marketing" adicionado com ícone Mail
- [x] Rota /email-marketing registrada no App.tsx
- [ ] Configurar SENDGRID_API_KEY nas variáveis de ambiente para habilitar disparo
- [ ] Verificar domínio barcellosseguros.com.br no SendGrid (autenticação de remetente)

## Templates Padrão + Preview Email Marketing
- [x] Inserir 4 templates padrão no banco: Boas-vindas, Renovação de Plano, Inadimplência e Aniversário
- [x] Adicionar botão de pré-visualização (ícone Eye) na lista de templates
- [x] Modal de preview com renderização HTML real do template (iframe)
- [x] Preview com dados de exemplo substituindo variáveis {{nome}}, {{produto}}, etc.

## Disparos Automáticos de E-mail
- [x] Tabela email_automacoes no banco (tipo, templateId, ativo, horario, ultimoDisparo)
- [x] Cron job diário: disparar e-mail de aniversário para clientes da base que aniversariam hoje
- [x] Cron job diário: disparar e-mail de inadimplência para inadimplentes com parcelas em aberto
- [x] Endpoint para listar, ativar/desativar e configurar automações
- [x] Interface de configuração de automações no Email Marketing (nova aba "Automações")

## Integração Inadimplentes ↔ Base de Clientes
- [x] Adicionar colunas emailContato e telefoneContato na tabela inadimplentes
- [x] Ao importar inadimplentes: buscar email/telefone da Base de Clientes pelo CPF automaticamente
- [x] Botão "Enriquecer Contatos" para puxar dados da base para inadimplentes já importados
- [x] Exibir email e telefone na listagem de inadimplentes
- [x] Automação de e-mail usa email direto da tabela inadimplentes (sem precisar de JOIN)

## Editor Visual de Templates de E-mail
- [x] Editor com campos simples: Assunto, Saudação, Corpo (textarea), Assinatura
- [x] Pré-visualização em tempo real ao lado do editor (split view)
- [x] Painel de variáveis disponíveis com botão "inserir" ({{nome}}, {{produto}}, etc.)
- [x] Guia passo a passo integrado na tela (accordion)
- [x] Geração automática do HTML final a partir dos campos simples
- [x] Botão "Copiar variável" para facilitar inserção no texto

## Disparo de E-mail para Inadimplentes Selecionados
- [ ] Endpoint tRPC: disparar e-mail para lista de CPFs selecionados com competências em aberto
- [ ] Checkboxes de seleção individual e "selecionar todos com e-mail" na tabela de inadimplentes
- [ ] Barra de ação flutuante ao selecionar: mostra quantos selecionados + botão "Enviar E-mail"
- [ ] Template HTML de cobrança com tabela de competências em aberto e botão WhatsApp
- [ ] Modal de confirmação antes do disparo mostrando quantos e-mails serão enviados
- [ ] Feedback de sucesso/erro por cliente após o disparo

## Agendamento de Campanhas de E-mail
- [x] Adicionar campo dataAgendada no banco (tabela email_campanhas)
- [x] Job periódico (a cada minuto) que verifica campanhas AGENDADA com dataAgendada <= agora e dispara
- [x] Interface: seletor de data e hora ao criar/editar campanha
- [x] Status visual "AGENDADA" com data/hora exibida na lista de campanhas
- [x] Botão "Agendar" separado do botão "Disparar Agora"

## Correção Fuso Horário Agendamento
- [x] Corrigir: agendamento salva 1h a mais (ex: 17:20 vira 18:20) — problema de UTC vs America/Sao_Paulo

## Campos Extras no Controle de Vendas
- [ ] Adicionar campos: email, telefone, celular, dataNascimento, endereco, bairro, cidade, cep no schema da tabela vendas
- [ ] Atualizar formulário de nova/editar venda com todos os campos da Base de Clientes
- [ ] Ao enviar para a Base, passar todos os campos preenchidos automaticamente
- [ ] Atualizar template de boas-vindas com texto da Barcellos Seguros e link do vídeo OneDrive

## Template Boas-Vindas no E-mail Marketing
- [ ] Inserir template "Boas-Vindas — Barcellos Seguros" no banco de templates para aparecer na lista do E-mail Marketing

## Integração WhatsApp Z-API
- [ ] Helper zapi.ts no backend para envio de mensagens via Z-API
- [ ] Tabela whatsapp_campanhas no schema (nome, mensagem, lista, status, dataAgendada)
- [ ] Tabela whatsapp_envios para log de disparos
- [ ] Automação: disparo WhatsApp inadimplentes (diário)
- [ ] Automação: disparo WhatsApp aniversariantes (diário)
- [ ] Automação: boas-vindas WhatsApp ao cadastrar novo cliente
- [ ] Módulo Campanhas WhatsApp na interface (criar, agendar, disparar)
- [ ] Configurações → Integrações: campos Z-API Instance ID e Token
- [ ] Status de conexão Z-API em tempo real nas Configurações

## WhatsApp - Paridade com E-mail
- [ ] Botão WhatsApp individual no Controle de Vendas (ícone verde, abre dialog com mensagem pré-pronta)
- [ ] Boas-vindas WhatsApp ao cadastrar novo cliente na Base de Clientes
- [ ] WhatsApp Marketing: página completa com abas Templates, Automações, Campanhas
- [ ] Templates editáveis: Boas-Vindas, Aniversário, Inadimplente, Campanha Médicos
- [ ] Automações: toggle on/off para aniversariantes e inadimplentes via WhatsApp
- [ ] Campanhas WhatsApp: criar, agendar e disparar para lista de contatos

## WhatsApp - Melhorias Fase 2
- [ ] Inadimplentes: checkbox de seleção + botão "Disparar WhatsApp" para envio em massa
- [ ] Template padrão aniversário com link do vídeo de boas-vindas (OneDrive)
- [ ] Templates dentro das políticas do WhatsApp (sem spam, opt-out, linguagem adequada)
- [ ] Criação de listas a partir da Base de Clientes com filtros por segmentação (ativo/inativo/produto)

## E-mail Marketing - Filtros na Importação
- [ ] Adicionar dialog com filtros (status ativo/inativo/todos + produto) na importação de contatos para listas do E-mail Marketing

## Filtros Avançados de Segmentação nas Listas (E-mail e WhatsApp Marketing)
- [ ] Endpoint para buscar produtos/cidades/vendedores distintos da base de clientes
- [ ] Backend: filtros avançados na importação (produto via select, cidade, faixa etária, faixa de valor, vendedor, status)
- [ ] Interface: dialog de importação com todos os filtros avançados (E-mail e WhatsApp Marketing)

## Filtros Avançados de Segmentação (Email e WhatsApp Marketing)
- [x] Endpoint backend /base-metadados retornando produtos, cidades e vendedores distintos da base
- [x] Filtro por produto (select com lista real da base) no Email Marketing
- [x] Filtro por vendedor responsável no Email Marketing
- [x] Filtro por cidade no Email Marketing
- [x] Filtro por faixa etária (idadeMin/idadeMax) no Email Marketing
- [x] Filtro por faixa de contribuição mensal (contribuicaoMin/contribuicaoMax) no Email Marketing
- [x] Mesmos filtros avançados no WhatsApp Marketing (com Select shadcn/ui)
- [x] Backend atualizado para aplicar todos os filtros na query de importação

## Melhorias Segmentação v2
- [x] Campo sexo/gênero na tabela clientes (schema + migração)
- [x] Campo sexo no formulário de cadastro/edição de cliente na Base de Clientes
- [x] Tabela segmentoTemplates no banco (id, nome, filtros JSON, criadoEm)
- [x] Backend: endpoints CRUD de templates de segmentos (salvar, listar, excluir)
- [x] Backend: endpoint de contagem de registros com filtros (previewCount) no Email Marketing
- [x] Backend: endpoint de contagem de registros com filtros (previewCount) no WhatsApp Marketing
- [x] Frontend: botão "Contar registros" no dialog de importação (Email Marketing)
- [x] Frontend: botão "Contar registros" no dialog de importação (WhatsApp Marketing)
- [x] Frontend: UI de templates de segmentos no dialog de importação (Email Marketing)
- [x] Frontend: UI de templates de segmentos no dialog de importação (WhatsApp Marketing)
- [x] Frontend: filtro por sexo/gênero no dialog de importação (Email e WhatsApp)
- [x] Backend: filtro por sexo aplicado na query de importação

## Layout E-mail Boas-Vindas e Z-API
- [ ] Ajustar layout do e-mail de boas-vindas para o padrão dos templates de e-mail marketing
- [ ] Orientar sobre contratação e configuração da Z-API

## Controle de Vendas - Melhorias v2
- [x] Layout do e-mail de boas-vindas: substituir textarea HTML por preview visual (iframe) no padrão dos templates
- [x] Busca automática por CPF no formulário de nova venda: ao digitar CPF, buscar na base e preencher campos automaticamente

## Bugs
- [x] Busca por CPF não encontra clientes cadastrados sem pontuação (ex: 03936482900 vs 039.364.829-00)
- [x] Bug: erro ao salvar nova venda - strings vazias causavam mismatch de parâmetros no Drizzle ORM (corrigido com sanitização no criarVenda)
- [x] Layout e-mail boas-vindas: adicionar cabeçalho e rodapé iguais aos templates de e-mail marketing

## WhatsApp - Reconexão e QR Code
- [x] Card Evolution API nas Configurações → Integrações: status em tempo real das instâncias (Conectado/Desconectado)
- [x] Botão "Conectar/Reconectar" exibe QR Code inline na própria tela (sem sair do sistema)
- [x] Auto-refresh do QR Code a cada 30 segundos
- [x] Detecção automática de conexão: QR Code fecha sozinho quando instância conecta
- [x] Botão "Atualizar agora" para verificar status manualmente

## Bugs v2
- [x] Bug: mensagem de erro confusa quando número não tem WhatsApp (exists:false) → agora exibe mensagem amigável "Número X não tem WhatsApp cadastrado. Verifique o número do cliente."

## Melhorias WhatsApp v3
- [ ] Validação em lote de números WhatsApp na página de Vendas/Clientes (botão que verifica quais números não têm WhatsApp)
- [x] Painel de histórico de erros de envio na aba Integrações das Configurações
- [x] Edição rápida de celular no modal de boas-vindas ao receber erro "número não tem WhatsApp"

## Controle de Vendas - Formulário Espelho da Base de Clientes
- [x] Formulário de nova venda idêntico ao formulário da Base de Clientes (mesmos campos, layout, seleção de produtos, busca de CEP automática)
- [x] Botão "Enviar para a Base" que cadastra o cliente na Base de Clientes somente quando clicado
- [x] Backend: procedure para criar venda + cadastrar cliente na base em uma operação

## Gestão de Tempo - Correções v2
- [x] Corrigir bug do cronômetro que zera ao sair da aba Gestão do Tempo (implementado persistência em localStorage)
- [ ] Corrigir erro TypeScript no GestaoTempo.tsx (Date vs string no campo createdAt)
- [ ] Tarefas recorrentes: conclusão por ocorrência (marcar concluída apenas no dia específico, não em todos os dias)
- [ ] Tarefas recorrentes: quando não concluída hoje, aparecer como "Atrasada" no dia seguinte

## Vendas - Validação em Lote WhatsApp
- [ ] Botão "Verificar WhatsApp" na página de Vendas que valida em lote quais clientes têm número sem WhatsApp
- [ ] Lista de resultados com opção de corrigir o número diretamente

## Bug Crítico - Gestão de Tempo
- [x] Bug: tarefas não estão sendo concluídas após implementação de ocorrências por data

## Permissões de Usuários - CRÍTICO
- [x] Nayara não consegue acessar Email MKT (adicionado módulo email_marketing para todos os usuários)
- [x] Revisar e corrigir permissões de todos os usuários para todos os módulos (agora possível via Configurações)

## Email Marketing - Funcionalidades
- [x] Botao "Duplicar" em campanhas para copiar tudo (nome, assunto, conteudo) e editar

## Email Marketing - Templates
- [x] Botao "Duplicar" em templates para copiar tudo (nome, assunto, corpo) e editar
- [x] Adicionar toolbar de formatação (negrito, itálico, sublinhado) nos blocos de texto e destaque do editor de templates de email
- [x] Corrigir preview de templates para renderizar HTML dos blocos em vez de JSON bruto
- [x] Corrigir bloco de rodapé que não aparece ao duplicar templates de email
- [x] Implementar upload de arquivo anexo nas campanhas de email marketing
- [x] Melhorar relatório de campanha de email (lista de quem recebeu e visualizou)
- [x] Corrigir histórico do WhatsApp
- [x] Adicionar botões no relatório de campanha: criar lista de quem abriu, criar lista de quem não abriu, exportar Excel

## Reorganização da Sidebar - Consolidação de Módulos
- [x] Remover segundo item "Gestão do Tempo" da sidebar (manter apenas o primeiro)
- [x] Agrupar módulos em "Financeiro": Contas a Pagar, Comissões, Comissões Pendentes, Financeiro
- [x] Agrupar módulos em "Marketing": WhatsApp Marketing, Email Marketing
- [x] Agrupar módulos em "Configurações": Metas, Configurações
- [x] Testar navegação e submenus

## Ajuste Sidebar - Mover módulos
- [x] Mover "Contas a Pagar" para dentro do submenu Financeiro
- [x] Mover "Mensagem Diária" para dentro do submenu Configurações

## Correção Real do Cronômetro - Gestão do Tempo
- [x] Refatorar cronômetro para usar timestamp de início (Date.now()) em vez de contador de segundos, para que o tempo continue correndo mesmo fora da aba

## Melhorias Gestão do Tempo
- [x] Badge piscando na sidebar em "Gestão do Tempo" quando há cronômetro ativo
- [x] Notificação ao atingir duração planejada da tarefa (ex: tarefa de 15min → alerta ao completar 15min)
- [x] Relatório diário de tempo: resumo de tempo gasto por tarefa/categoria no dia

## Mensagem Diária - Reenvio Manual
- [x] Adicionar botão de reenvio manual individual na lista de aniversariantes

## Aniversariantes - Melhoria Reenvio Manual
- [x] Adicionar seletor de dia na aba Aniversariantes para filtrar por dia específico
- [x] Adicionar campo de busca por nome de cliente na aba Aniversariantes

## WhatsApp Marketing - Anexo de Arquivo
- [x] Adicionar campo de upload de arquivo (imagem/PDF/vídeo) ao criar campanha no WhatsApp Marketing
- [x] Enviar mídia junto com a mensagem via API do WhatsApp (Evolution API)

## Melhorias Gestão do Tempo v2
- [x] Badge piscando na sidebar em "Gestão do Tempo" quando há cronômetro ativo
- [x] Relatório diário de tempo: resumo de horas gastas por tarefa/categoria no dia

## Correção Histórico WhatsApp
- [x] Corrigir aba de histórico de envios no WhatsApp Marketing (trocado protectedProcedure por publicProcedure)

## Cruzamento Base de Clientes Externa
- [ ] Exportar base interna e normalizar CPFs (zeros à esquerda, remover pontos/traços)
- [ ] Cruzar com planilha externa (1325 registros) por CPF normalizado
- [ ] Gerar relatório Excel: aba 1 (encontrados), aba 2 (novos), aba 3 (ausentes)
- [ ] Atualizar campo contribuição dos clientes encontrados no banco

## Correção Crítica v10 - Gestão do Tempo
- [x] Bug: Tempo percorrido não era registrado ao concluir tarefa (mostrava tempo estimado em vez do real)
- [x] Correção: Função concluirComTimer agora captura corretamente o tempo real percorrido
- [x] Testes: Confirmado com 2 testes práticos (31s e 39s registrados corretamente)


## Correção Crítica v11 - Gestão do Tempo (Tarefas Atrasadas)
- [x] Bug: Tarefas de hoje apareciam como atrasadas no dia seguinte
- [x] Correção: Função listarTarefasPorData agora compara com HOJE em vez de data consultada (linha 104-109)
- [x] Testes: Confirmado - tarefas de hoje não aparecem mais como atrasadas amanhã


## Correção Crítica v12 - Controle de Vendas
- [x] Bug: Dados de vendas não persistiam ao editar (cache não era invalidado)
- [x] Solução: Adicionar invalidação de cache na mutação de atualização
- [x] Testado: Editar email, salvar, reabrir e verificar que o novo valor foi salvo


## Correção Crítica v13 - Disparos de Aniversário
- [x] Bug: Disparos de parabéns não funcionavam nos dias 21 e 22
- [x] Solução: Corrigir query para buscar aniversariantes dos dias 21 E 22 (não apenas o dia exato)
- [x] Testado: Encontrados 4 clientes com aniversário em 21 e 22 de março


## Nova Feature - CRM Leads
- [ ] Adicionar campo de busca para pesquisar leads por nome ou CPF


## Nova Feature v14 - CRM Leads Busca por CPF
- [x] Adicionar campo CPF ao schema de crmLeads
- [x] Adicionar campo CPF ao formulário de novo/editar lead
- [x] Atualizar backend para buscar por CPF também


## Correção Crítica v15 - Aniversários nos fins de semana
- [x] Corrigir query para buscar aniversariantes dos dias 21 E 22 (não apenas o dia exato)
- [x] Adicionar lógica de recuperação de disparos atrasados (se não disparou em 3 dias, dispara na próxima hora configurada)


## Melhoria de UX v16 - Relatório de Campanhas
- [ ] Redesenhar tabela de relatório de envios com cores e contraste melhorados
- [ ] Adicionar filtros (status envio, visualizações, erros)
- [ ] Adicionar ordenação por coluna (nome, email, data, visualizações)
- [ ] Melhorar layout da seção de cards de resumo


## Correção Bug WhatsApp Aniversariantes
- [x] Bug: Disparos de WhatsApp para aniversariantes não estavam sendo enviados
- [x] Causa: Query buscava clientes nos dias 21 E 22 do mês, independente do dia atual
- [x] Solução: Alterar query para buscar APENAS clientes que fazem aniversário HOJE (DAY(dataNascimento) = dia de hoje)
- [x] Testado: Automação agora dispara corretamente para 5 aniversariantes do dia 24/03/2026


## Correção Bug Cálculo de Horas Trabalhadas
- [x] Bug: Na gestão de horas, o total de horas exercidas estava usando duracaoMin (cadastrada) ao invés de tempoExecucaoSeg (exercida)
- [x] Causa: Linha 621 do GestaoTempo.tsx estava somando duracaoMin para tarefas concluídas
- [x] Solução: Alterar para somar tempoExecucaoSeg convertido em minutos (tempoExecucaoSeg / 60)
- [x] Testado: Relatório agora mostra corretamente as horas exercidas (3 concluídas com 38% de conclusão)


## Correção Bug Tempo Exercido Automático
- [x] Bug: Tarefas concluídas sem tempo registrado manualmente não preenchiam automaticamente com a duração planejada
- [x] Causa: Função concluirTarefa não usava duracaoMin quando tempoExecucaoSeg era undefined
- [x] Solução: Alterar concluirTarefa para usar (duracaoMin * 60) como tempo exercido quando nenhum tempo for fornecido
- [x] Testado: Relatório agora mostra 1h49m (correto) ao invés de 1h30m (incorreto)
- [x] Resultado: 4 tarefas concluídas com tempos corretos (5min + 15min + 28m33s + 1h00m33s = 1h49m06s)


## Bug Crítico - Tempo Exercido Não Registra em Todas as Tarefas
- [x] Remover verificação tempoValido que bloqueia tarefas com duração zero
- [x] Garantir que TODAS as tarefas registrem tempo ao serem concluídas
- [x] Testar com múltiplas tarefas para garantir funcionamento geral
- [x] Resultado: 6 tarefas concluídas com tempos corretos (2h19m total, 75% de conclusão)


## Feature - Importação de Lista Fria no WhatsApp Marketing
- [ ] Adicionar botão "Importar Excel" na página de Listas de Contatos
- [ ] Criar endpoint backend para processar upload de arquivo Excel
- [ ] Validar formato do arquivo (colunas: nome, telefone)
- [ ] Inserir contatos na tabela whatsapp_contatos
- [ ] Testar com arquivo de exemplo
- [ ] Mostrar relatório de contatos importados com sucesso/erro

- [ ] WhatsApp Marketing: criar modal de upload Excel para importação de lista fria
- [ ] WhatsApp Marketing: processar arquivo Excel (ler colunas nome/telefone) no frontend
- [ ] Email Marketing: corrigir campanha MEDICO 2 (travada em "Enviando...")
- [x] Email Marketing: retomar envio dos 1.990 emails restantes da campanha MEDICO 2 DIA
- [x] Email Marketing: garantir registro correto de visualizações de emails (pixel tracking já implementado)
- [x] Email Marketing: adicionar botão "Retomar Envio" para campanhas interrompidas

## Métrica Entrada vs Saída de Clientes
- [x] Backend: endpoint entradaSaidaAcumulada já existia em canceladosDb.ts (retorna mensal + totais)
- [x] Dashboard: card "Entrada vs Saída de Clientes" com KPIs do mês e tabela mensal completa (Novos, Desistência, Inadimplência, Óbito, Total Saídas, Saldo)
- [x] Relatório Executivo: seção "Fluxo de Clientes" com KPIs do mês selecionado, tabela mensal detalhada com coluna de Retenção %, e linha de totais anuais
- [x] PDF: seção entrada-saida incluída no export com data-pdf-section="entrada-saida"

## BUG - Controle de Vendas (todos os meses)
- [x] Cadastro de venda não salva o campo "produto(s)" no banco — CORRIGIDO: salvar() agora converte produtosSelecionados (checkboxes) em string e inclui no payload
- [x] Envio para Base de Clientes não preenche o campo "produto" do cliente — CORRIGIDO: produto já estava sendo copiado, mas dependia do campo estar salvo na venda (corrigido acima)
- [x] Envio para Base de Clientes não preenche o campo "contribuição" do cliente — CORRIGIDO: enviarVendaParaBase agora copia valorPremio como contribuicao do cliente

## Gestão do Tempo — Painéis por Categoria + Lembretes
- [x] Aba "Meu Dia" reorganizada: painéis separados por categoria (Comercial, Pessoal, Saúde, etc.)
- [x] Cada painel tem cabeçalho colorido, contador de tarefas, tempo executado/planejado e botão colapsar
- [x] Botão "+" em cada painel abre modal pré-selecionando a categoria
- [x] Painel de Lembretes rápidos: campo de texto + hora + ícone emoji, salvo por data
- [x] Lembretes: marcar como visto (check verde) e excluir
- [x] Tabela lembretes criada no banco de dados

## Lembretes — Melhorias v2
- [x] Campo de data explícito no formulário de criação de lembrete (não apenas implícito pelo dia selecionado)
- [x] Modal de edição de lembrete (texto, data, hora, ícone)
- [x] Botão de editar (lápis) em cada lembrete da lista

## BUGs Urgentes
- [x] Permissão de Configurações liberada para Nayara não está surtindo efeito — CORRIGIDO: permissões agora são recarregadas a cada 30s sem precisar de logout
- [x] WhatsApp de aniversários não está reconectando — DIAGNOSTICADO: whatsapp-2 desconectado da Evolution API, precisa escanear QR code em Configurações

## BUG CRÍTICO - Permissões Nayara
- [x] Permissões liberadas pelo admin não aparecem no menu da Nayara — CORRIGIDO: podeVer() agora retorna true enquanto permissões ainda carregam (permsCarregadas flag), evitando que o menu pisque/suma. Também corrigido reset do flag ao fazer login.

## BUG CRÍTICO v3 - Permissões Nayara ainda não funcionam
- [x] Menu Configurações não aparece para Nayara — CORRIGIDO: criado canSee() no AppLayout que inclui permsLoading e isAdmin, substituindo todas as ocorrências de (!isLoggedIn || podeVer()) por canSee()

## BUG - WhatsApp aniversariantes não disparava
- [x] formatarTelefone corrigida: trata DDD duplicado, números sem 9 e DDI duplicado
- [x] endpoint disparar-agora reseta ultimoDisparo antes de disparar (permite reenvio manual)
- [x] botão "Disparar Agora" adicionado na tela de Configurações (aba WhatsApp)

## Múltiplos Vendedores por Cliente
- [x] Criar tabela cliente_vendedores (clienteId, nomeVendedor, percentual)
- [x] Migrar campo vendedor existente para nova tabela (2119 clientes migrados)
- [x] Backend: queries de comissão usando múltiplos vendedores (JOIN com cliente_vendedores, percentual proporcional)
- [x] Backend: importação do extrato divide comissão pelos vendedores cadastrados
- [x] Frontend: Base de Clientes — painel de múltiplos vendedores com percentuais no modal de edição
- [x] Frontend: Comissões — tabela de resumo com colunas Previsão 15%, Realizado e % Total; detalhe do corretor com coluna % Parte

## Múltiplos Vendedores no Controle de Vendas
- [x] Formulário de nova venda: substituir Select único de Vendedor por painel dinâmico (até 3 vendedores com percentuais)
- [x] Ao salvar venda, persistir vendedores no campo corretor (principal) e campo vendedoresJson (JSON)
- [x] Bug 'nan' no campo produtos ao atualizar cliente corrigido (sanitização no backend)
## Regra de Divisão Automática com ELISIA
- [x] Controle de Vendas: ao selecionar vendedor ≠ ELISIA, adicionar ELISIA automaticamente com percentual restante
- [x] Base de Clientes: mesma regra no painel de vendedores do modal de edição
- [x] ELISIA aparece como read-only com badge 'auto'; dropdown dos outros vendedores exclui ELISIA

## Exportação de Relatório de Comissões
- [x] Botão "Baixar Excel" no módulo de Comissões — exporta resumo por corretor e detalhe de clientes em abas separadas

## Bug e Melhorias Comissões v2
- [x] BUG: extratos de fevereiro e março sumiram — investigado: dados foram deletados do banco (apenas Março e Abril existem); usuário precisa reimportar Fevereiro
- [x] Exportação em PDF do relatório de comissões — botão vermelho "Baixar PDF" adicionado ao lado do Excel; PDF A4 paisagem com cabeçalho azul, tabela de resumo e detalhe do corretor selecionado

## Bug Comissões v3
- [x] BUG: março não aparece na tabela de Comissões — dados deletados do banco; usuário precisa reimportar o arquivo

## Campo Origem e Filtros Avançados na Base de Clientes
- [x] Schema: tabela origens_cliente (id, nome, cor, ativo) + campo origemId na tabela clientes
- [x] Backend: CRUD de origens (listar, criar, editar, deletar) + campo origemId no listar/criar/atualizar clientes; seed com 5 origens padrão
- [x] Formulário Base de Clientes: campo Origem (Select dinâmico com origens do banco)
- [x] Filtros avançados na Base de Clientes: painel colapsável com idade mín/máx, faixa de valor, produto, vendedor, origem, data de nascimento, status
- [x] Exportação Excel e PDF dos clientes filtrados (botões no cabeçalho)
- [x] Configurações: aba Origens com CRUD completo (criar, editar, excluir, cor personalizável)

## Correção Totais Base de Clientes
- [x] Cards de Contribuição Total e Comissão Total corrigidos: agora usam campo contribuicao (atualizado pela importação do extrato) e comissão calculada por contribuicao * taxaComissao

## Correção Card Comissão Total Base de Clientes
- [ ] Card "Comissão Total" deve buscar do extrato mais recente (tabela extrato_comissao), não calcular pela tabela de clientes

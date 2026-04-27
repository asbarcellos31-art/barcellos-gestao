# Barcellos Gestão — Sistema Interno

Sistema completo de gestão para a Barcellos Seguros: contas a pagar, base de
clientes, vendas, comissões, inadimplentes, cancelamentos, sinistros, CRM,
financeiro, e-mail marketing, disparo de WhatsApp, relatórios executivos.

> Stack: **React 19 + Vite + TailwindCSS** (frontend) · **Express + tRPC + Drizzle ORM + MySQL** (backend) · **TypeScript**.

---

## Sumário

1. [Pré-requisitos](#pré-requisitos)
2. [Rodar localmente](#rodar-localmente)
3. [Variáveis de ambiente](#variáveis-de-ambiente)
4. [Deploy no Railway (recomendado)](#deploy-no-railway-recomendado)
5. [Login padrão](#login-padrão)
6. [Funcionalidades](#funcionalidades)
7. [Estrutura do projeto](#estrutura-do-projeto)
8. [Integrações externas](#integrações-externas)
9. [Notas de migração](#notas-de-migração)

---

## Pré-requisitos

- **Node.js 20+**
- **pnpm 10+** (`npm install -g pnpm`)
- **MySQL 8+** rodando localmente ou em servidor

## Rodar localmente

```bash
# 1. Instalar dependências
pnpm install

# 2. Copiar .env.example -> .env e preencher (no mínimo DATABASE_URL e JWT_SECRET)
cp .env.example .env
nano .env

# 3. Criar tabelas no banco (rodará as migrations Drizzle)
pnpm db:push

# 4. Subir em desenvolvimento (com hot-reload)
pnpm dev
```

Acesse: http://localhost:3000

Para gerar build de produção:

```bash
pnpm build
pnpm start
```

## Variáveis de ambiente

Veja `.env.example` para a lista completa com explicações. Resumo:

| Variável | Obrigatória? | Para que serve |
|---|---|---|
| `DATABASE_URL` | ✅ Sim | Conexão MySQL (`mysql://user:pwd@host:port/db`) |
| `JWT_SECRET` | ✅ Sim | Chave de assinatura de sessões. Gere uma string aleatória longa. |
| `PORT` | Não (default 3000) | Porta HTTP |
| `NODE_ENV` | Não | `development` ou `production` |
| `SENDGRID_API_KEY` | Para enviar e-mails | Chave do SendGrid |
| `SENDGRID_FROM_EMAIL` | Para enviar e-mails | Remetente verificado no SendGrid |
| `SENDGRID_FROM_NAME` | Para enviar e-mails | Nome de exibição |
| `EVOLUTION_API_URL` | Para WhatsApp | URL do servidor Evolution API |
| `EVOLUTION_API_KEY` | Para WhatsApp | Chave global do Evolution |
| `S3_BUCKET` etc. | Para uploads em prod | Veja `.env.example` |
| `PUBLIC_BASE_URL` | Em prod | URL pública final do sistema |

> **Sem SendGrid/Evolution/S3** o sistema sobe normalmente — apenas as
> funcionalidades correspondentes ficam desligadas. Uploads usam disco local
> como fallback (atenção: não persiste em hospedagens efêmeras).

## Deploy no Railway (recomendado)

Passo a passo do zero:

1. **Criar conta** em [railway.app](https://railway.app/) e instalar o CLI (opcional).

2. **Criar projeto novo** → "Deploy from GitHub repo" → selecionar este repositório.

3. **Adicionar plugin MySQL**: dentro do projeto, "+ New" → "Database" → "MySQL".
   O Railway gera automaticamente a variável `DATABASE_URL` e a injeta no serviço.

4. **Configurar variáveis** no painel do serviço (aba "Variables"):
   - `JWT_SECRET` — gere com `openssl rand -hex 32`
   - `NODE_ENV=production`
   - `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME` (se for usar e-mail)
   - `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` (se for usar WhatsApp)
   - `S3_*` (se for usar storage externo — recomendado em prod)
   - `PUBLIC_BASE_URL` — URL pública do app (ex: `https://gestao.barcellosseguros.com`)

5. **Build & deploy**: o Railway lê `railway.json` e roda
   `pnpm install && pnpm db:push && pnpm build`, depois `pnpm start`.

6. **Domínio**: aba "Settings" → "Networking" → "Generate Domain" (Railway gera
   um subdomínio grátis), ou "Custom Domain" para apontar seu próprio.

> Custo aproximado: ~$5/mês de crédito grátis no plano Hobby; sistema rodando
> tranquilo deve ficar entre **$5–$15/mês** com tráfego pequeno.

## Login padrão

Na primeira inicialização, o sistema cria automaticamente um usuário admin:

- **E-mail:** `asbarcellos31@gmail.com`
- **Senha:** `barcellos2026`

⚠️ **Troque essa senha** no primeiro acesso (Configurações → Usuários).

## Funcionalidades

### Módulos principais

- **Dashboard** — visão geral do mês/ano com métricas consolidadas
- **Contas a Pagar** — lançamentos com categorias, vínculos, status, alertas
  de vencimento, exportação Excel/PDF
- **Base de Clientes** — cadastro completo, vendedores, taxa de comissão por
  cliente, totalizadores dinâmicos
- **Controle de Vendas** — propostas, faturamento, comissões, performance por
  vendedor
- **Comissões** — upload de extrato Excel, cruzamento por corretor, dashboard
- **Comissões Pendentes** — controle separado de comissões a receber
- **Inadimplentes** — upload de planilha mensal, status (PAGO/BOLETO/EM
  CONTATO/DESISTIU/ESPECIAL), histórico de cobrança, dashboard com taxa de
  recuperação
- **Cancelamentos** — controle de clientes cancelados
- **Sinistros** — protocolos com beneficiários (CRM separado)
- **CRM Leads** — funil de leads
- **CRM Beneficiários** — esteira de beneficiários de sinistros
- **Financeiro** — extrato bancário e dashboard financeiro
- **E-mail Marketing** — campanhas, listas, templates HTML, automações
- **WhatsApp Marketing** — disparo via Evolution API
- **Mensagem Diária** — disparo automático configurável
- **Gestão de Tempo** — tarefas e lembretes
- **Metas** — controle de metas por vendedor
- **Relatório Executivo** — relatório consolidado para diretoria
- **Configurações** — usuários, permissões granulares por módulo, origens

### Recursos transversais

- Autenticação por e-mail/senha com hash bcrypt
- Sistema de permissões granular (ver/criar/editar/deletar por módulo)
- Importação de planilhas Excel (`xlsx`)
- Importação de PDFs de extrato (`pdf-parse`)
- Exportação Excel e PDF (`jspdf`, `jspdf-autotable`)
- Disparo agendado de e-mails (cron interno a cada 1 minuto)
- Templates HTML com blocos editáveis para campanhas

## Estrutura do projeto

```
.
├── client/                     # Frontend React + Vite
│   ├── public/                 # Assets estáticos
│   └── src/
│       ├── components/         # Componentes (shadcn/ui + customizados)
│       ├── contexts/           # React contexts (AppAuthContext, etc.)
│       ├── hooks/              # Hooks customizados
│       ├── lib/                # Utilitários e cliente tRPC
│       ├── pages/              # Páginas (Dashboard, Clientes, Vendas, etc.)
│       ├── App.tsx             # Roteamento (wouter)
│       └── main.tsx            # Entry point
├── server/                     # Backend Express + tRPC
│   ├── _core/                  # Bootstrap, contexto tRPC, vite SSR
│   ├── parsers/                # Parsers de extrato bancário
│   ├── *.ts                    # Routers e camadas de DB
│   └── routers.ts              # Router tRPC raiz
├── shared/                     # Tipos compartilhados client/server
├── drizzle/                    # Schema e migrations
│   ├── schema.ts               # Definição de tabelas (Drizzle ORM)
│   └── *.sql                   # Migrations geradas
├── scripts/                    # Scripts utilitários (corrigir-percentuais, etc.)
├── _scripts_legados/           # Scripts pontuais de importação histórica
├── .env.example                # Template de variáveis
├── railway.json                # Config de deploy Railway
├── package.json
├── tsconfig.json
├── vite.config.ts
└── drizzle.config.ts
```

## Integrações externas

### SendGrid (e-mail)
- Onde criar conta: https://sendgrid.com/
- Plano grátis: 100 e-mails/dia
- Após criar conta: Settings → API Keys → Create API Key (full access)
- Verificar remetente: Settings → Sender Authentication → Single Sender
- Cole a chave em `SENDGRID_API_KEY`

### Evolution API (WhatsApp)
- É um servidor próprio (open source) que conecta com WhatsApp Web
- Documentação: https://doc.evolution-api.com/
- Você precisa subir uma instância (Docker) ou usar um provedor que ofereça
- Após subir, pegue a URL e a chave global
- Configure em `EVOLUTION_API_URL` e `EVOLUTION_API_KEY`

### Storage S3 (uploads)
**Cloudflare R2** é a opção mais barata (sem taxa de egress):
- https://dash.cloudflare.com/ → R2 → Create bucket
- API Tokens → Create token "Object Read & Write"
- Configure as 5 variáveis `S3_*` (veja `.env.example`)

**AWS S3** é o padrão clássico:
- https://console.aws.amazon.com/s3 → criar bucket
- IAM → criar usuário com policy de acesso ao bucket
- Configurar `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`

## Notas de migração

Este projeto era originalmente hospedado na plataforma **Manus**. Para
funcionar fora dela, foram feitas as seguintes adaptações ao código original:

- `server/_core/oauth.ts` — desativado (era OAuth do Manus). Sistema usa
  autenticação própria via tabela `app_users` com bcrypt.
- `server/_core/sdk.ts` — virou stub. Não bate mais no servidor OAuth do Manus.
- `server/storage.ts` — reescrito para usar **AWS S3** (e compatíveis: R2,
  Spaces, MinIO) com fallback para storage local em `./uploads/`.
- `server/_core/index.ts` — removida a chamada `registerOAuthRoutes` (no-op
  agora) e adicionado `app.use("/uploads", express.static(...))`.
- `vite.config.ts` — removidos plugins Manus (`vite-plugin-manus-runtime`,
  `vite-plugin-jsx-loc`, debug collector).
- `package.json` — removidas dependências Manus.
- Scripts de importação pontual movidos para `_scripts_legados/` (não são
  necessários para rodar o sistema, foram usados para popular dados iniciais).

> Observação: o logo no Login e no AppLayout aponta para o CDN do Manus
> (`files.manuscdn.com/...`). É só uma URL pública e funciona, mas você pode
> trocar por um arquivo em `client/public/` quando quiser.

---

## Comandos úteis

```bash
pnpm dev          # roda em desenvolvimento (hot reload)
pnpm build        # build de produção
pnpm start        # roda build de produção
pnpm test         # roda testes vitest
pnpm check        # checa TypeScript sem emitir
pnpm format       # formata com prettier
pnpm db:push      # gera e aplica migrations Drizzle
```

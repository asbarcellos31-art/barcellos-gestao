import { getDb } from "./db";
import { clientes, vendas, sinistros, beneficiariosCRM, crmLeads, crmOrigensLeads, clienteProdutos, produtos as produtosTable } from "../drizzle/schema";
import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import mysql from "mysql2/promise";

// Pool para queries SQL diretas (necessário em casos onde drizzle não retorna no formato esperado)
let _pool: mysql.Pool | null = null;
function getPool(): mysql.Pool {
  if (!_pool && process.env.DATABASE_URL) {
    _pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      connectionLimit: 5,
      waitForConnections: true,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
  }
  if (!_pool) throw new Error("DATABASE_URL não configurado");
  return _pool;
}
async function queryPool<T = Record<string, unknown>>(sqlStr: string, params: unknown[] = []): Promise<T[]> {
  const pool = getPool();
  const [rows] = await pool.execute(sqlStr, params);
  return rows as T[];
}

// ============================================================
// CLIENTES
// ============================================================
export async function listarClientes(opts?: {
  busca?: string; status?: string; vendedor?: string;
  origemId?: number; idadeMin?: number; idadeMax?: number;
  valorMin?: number; valorMax?: number; produto?: string;
  dataNascimentoInicio?: string; dataNascimentoFim?: string;
  limit?: number; offset?: number;
}) {
  const db = await getDb();
  if (!db) return { clientes: [], total: 0, ativos: 0, inativos: 0, vendedores: [] };

  const conditions = [];
  if (opts?.status && opts.status !== "todos") {
    conditions.push(eq(clientes.status, opts.status));
  }
  if (opts?.vendedor && opts.vendedor !== "todos") {
    // Filtra clientes onde:
    // - Tem o vendedor antigo (campo clientes.vendedor) bate, OU
    // - Tem registro em cliente_vendedores com esse nome (case-insensitive)
    conditions.push(sql`(
      UPPER(${clientes.vendedor}) = UPPER(${opts.vendedor})
      OR ${clientes.id} IN (
        SELECT clienteId FROM cliente_vendedores WHERE UPPER(nomeVendedor) = UPPER(${opts.vendedor})
      )
    )`);
  }
  if (opts?.origemId) {
    conditions.push(eq(clientes.origemId, opts.origemId));
  }
  if (opts?.valorMin !== undefined) {
    conditions.push(sql`COALESCE(${clientes.valorTotalComissao}, 0) >= ${opts.valorMin}`);
  }
  if (opts?.valorMax !== undefined) {
    conditions.push(sql`COALESCE(${clientes.valorTotalComissao}, 0) <= ${opts.valorMax}`);
  }
  if (opts?.idadeMin !== undefined) {
    conditions.push(sql`TIMESTAMPDIFF(YEAR, ${clientes.dataNascimento}, CURDATE()) >= ${opts.idadeMin}`);
  }
  if (opts?.idadeMax !== undefined) {
    conditions.push(sql`TIMESTAMPDIFF(YEAR, ${clientes.dataNascimento}, CURDATE()) <= ${opts.idadeMax}`);
  }
  if (opts?.dataNascimentoInicio) {
    conditions.push(sql`${clientes.dataNascimento} >= ${opts.dataNascimentoInicio}`);
  }
  if (opts?.dataNascimentoFim) {
    conditions.push(sql`${clientes.dataNascimento} <= ${opts.dataNascimentoFim}`);
  }
  if (opts?.busca) {
    const b = `%${opts.busca}%`;
    conditions.push(
      or(
        like(clientes.nome, b),
        like(clientes.cpf, b),
        like(clientes.vendedor, b)
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = opts?.limit || 100;
  const offset = opts?.offset || 0;

  let rows = await db.select().from(clientes).where(where).orderBy(asc(clientes.nome)).limit(limit).offset(offset);

  // Buscar produtos vinculados para todos os clientes retornados
  const clienteIds = rows.map(r => r.id);
  let produtosPorCliente: Record<number, string> = {};
  if (clienteIds.length > 0) {
    const vinculosRaw = await db
      .select({ clienteId: clienteProdutos.clienteId, descricao: produtosTable.descricao })
      .from(clienteProdutos)
      .innerJoin(produtosTable, eq(produtosTable.id, clienteProdutos.produtoId))
      .where(sql`${clienteProdutos.clienteId} IN (${sql.join(clienteIds.map(id => sql`${id}`), sql`, `)})`);
    for (const v of vinculosRaw) {
      if (!produtosPorCliente[v.clienteId]) produtosPorCliente[v.clienteId] = '';
      produtosPorCliente[v.clienteId] = produtosPorCliente[v.clienteId]
        ? produtosPorCliente[v.clienteId] + ', ' + v.descricao
        : v.descricao;
    }
  }

  // Totais
  const [totais] = await db.select({
    total: sql<number>`COUNT(*)`,
    ativos: sql<number>`SUM(CASE WHEN LOWER(status) = 'ativo' THEN 1 ELSE 0 END)`,
    inativos: sql<number>`SUM(CASE WHEN status = 'Inativo' THEN 1 ELSE 0 END)`,
    somaContribuicao: sql<string>`COALESCE(SUM(contribuicao), 0)`,
    // Comissão Total = soma do valorComissao de cada cliente (atualizado pela importação do extrato: comissão + incentivo)
    somaComissao: sql<string>`COALESCE(SUM(COALESCE(valorComissao, 0)), 0)`,
    // Expectativa = soma de (contribuicao * taxaComissao) para clientes com taxa cadastrada
    somaExpectativaComissao: sql<string>`COALESCE(SUM(CASE WHEN taxaComissao IS NOT NULL AND taxaComissao > 0 THEN COALESCE(contribuicao, 0) * taxaComissao ELSE COALESCE(valorComissao, 0) END), 0)`,
  }).from(clientes).where(where);

  // Lista de vendedores únicos
  const vendedoresRows = await db.selectDistinct({ vendedor: clientes.vendedor }).from(clientes).where(sql`vendedor IS NOT NULL AND vendedor != ''`).orderBy(asc(clientes.vendedor));
  const vendedores = vendedoresRows.map(r => r.vendedor).filter(Boolean) as string[];

  // Filtro por produto (pós-query, pois produto está em tabela separada)
  if (opts?.produto && opts.produto !== "todos") {
    const produtoFiltro = opts.produto.toLowerCase();
    rows = rows.filter(c => {
      const prod = (produtosPorCliente[c.id] || c.produtos || '').toLowerCase();
      return prod.includes(produtoFiltro);
    });
  }

  // Enriquecer cada cliente com os produtos vinculados
  const clientesComProdutos = rows.map(c => ({
    ...c,
    produtosVinculados: produtosPorCliente[c.id] || c.produtos || '',
  }));

  // ─── PROPORCIONALIDADE POR VENDEDOR ──────────────────────────────────────
  // Quando filtra por um vendedor específico:
  //   - Contribuição: VALOR CHEIO (cliente paga 100%, independente do vendedor)
  //   - Comissão recebida: valorComissao × percentual_dela
  //   - Expectativa: contribuicao × taxaComissao × percentual_dela
  // Clientes sem registro em cliente_vendedores: aparecem com badge de aviso
  // e usam percentual = 100 (não há de onde calcular outra coisa).
  let totalAjustadoContribuicao = 0;
  let totalAjustadoComissao = 0;
  let totalAjustadoExpectativa = 0;
  let qtdSemCadastroVendedorTotal = 0;
  const vendedorFiltrado = (opts?.vendedor && opts.vendedor !== "todos") ? opts.vendedor : null;

  if (vendedorFiltrado) {
    // 1) Totais agregados de TODOS os clientes do vendedor (não só os da página)
    //    Regras:
    //      Contribuição = soma cheia (cliente paga 100% independente do vendedor)
    //      Comissão recebida = soma(valorComissao × % do vendedor)
    //      Expectativa = soma(contribuição × taxaComissao) — NÃO multiplica pelo % do vendedor
    const totaisAjList = await queryPool<{
      somaContrib: string; somaComis: string; somaExpect: string; qtdSemCv: number;
    }>(
      `SELECT
        COALESCE(SUM(COALESCE(c.contribuicao, 0)), 0) as somaContrib,
        COALESCE(SUM(
          CASE WHEN cv.percentual IS NOT NULL
            THEN COALESCE(c.valorComissao, 0) * cv.percentual / 100
            ELSE COALESCE(c.valorComissao, 0)
          END
        ), 0) as somaComis,
        COALESCE(SUM(
          CASE WHEN c.taxaComissao IS NOT NULL AND c.taxaComissao > 0
               THEN COALESCE(c.contribuicao, 0) * c.taxaComissao
               ELSE 0
          END
        ), 0) as somaExpect,
        COUNT(CASE WHEN cv.id IS NULL THEN 1 END) as qtdSemCv
      FROM clientes c
      LEFT JOIN cliente_vendedores cv
        ON cv.clienteId = c.id
        AND UPPER(cv.nomeVendedor) = UPPER(?)
      WHERE (
        UPPER(c.vendedor) = UPPER(?)
        OR c.id IN (
          SELECT clienteId FROM cliente_vendedores WHERE UPPER(nomeVendedor) = UPPER(?)
        )
      )`,
      [vendedorFiltrado, vendedorFiltrado, vendedorFiltrado]
    );
    if (totaisAjList[0]) {
      totalAjustadoContribuicao = parseFloat(String(totaisAjList[0].somaContrib ?? "0"));
      totalAjustadoComissao = parseFloat(String(totaisAjList[0].somaComis ?? "0"));
      totalAjustadoExpectativa = parseFloat(String(totaisAjList[0].somaExpect ?? "0"));
      qtdSemCadastroVendedorTotal = Number(totaisAjList[0].qtdSemCv ?? 0);
    }
    console.log(`[Clientes/listar] Vendedor=${vendedorFiltrado} | Contrib=${totalAjustadoContribuicao.toFixed(2)} | Comis=${totalAjustadoComissao.toFixed(2)} | Expect=${totalAjustadoExpectativa.toFixed(2)} | SemCv=${qtdSemCadastroVendedorTotal}`);

    // 2) Para os clientes EXIBIDOS na página: enriquece com percentual e
    //    valores ajustados (linha-a-linha na tabela)
    if (clienteIds.length > 0) {
      const placeholders = clienteIds.map(() => '?').join(',');
      const cvList = await queryPool<{ clienteId: number; percentual: string }>(
        `SELECT clienteId, percentual
         FROM cliente_vendedores
         WHERE clienteId IN (${placeholders})
           AND UPPER(nomeVendedor) = UPPER(?)`,
        [...clienteIds, vendedorFiltrado]
      );
      const percentualPorCliente: Record<number, number> = {};
      for (const r of cvList) {
        percentualPorCliente[Number(r.clienteId)] = parseFloat(String(r.percentual ?? "0"));
      }

      for (const c of clientesComProdutos as any[]) {
        const pct = percentualPorCliente[c.id]; // undefined se não tem cv
        const contrib = parseFloat(String(c.contribuicao ?? "0")) || 0;
        const comis = parseFloat(String(c.valorComissao ?? "0")) || 0;
        const taxa = parseFloat(String(c.taxaComissao ?? "0")) || 0;
        // Expectativa = contribuição × taxa (sem aplicar % do vendedor)
        const expect = taxa > 0 ? contrib * taxa : 0;

        if (pct !== undefined) {
          c.semVendedorCadastrado = false;
          c.percentualVendedor = pct;
          c.contribuicaoExibida = contrib;              // CHEIA
          c.valorComissaoAjustado = comis * pct / 100;  // proporcional ao recebido
          c.expectativaAjustada = expect;               // SEM proporção
        } else {
          c.semVendedorCadastrado = true;
          c.percentualVendedor = 100;
          c.contribuicaoExibida = contrib;
          c.valorComissaoAjustado = comis;
          c.expectativaAjustada = expect;
        }
      }
    }
  }

  return {
    clientes: clientesComProdutos,
    total: Number(totais?.total || 0),
    ativos: Number(totais?.ativos || 0),
    inativos: Number(totais?.inativos || 0),
    somaContribuicao: vendedorFiltrado ? totalAjustadoContribuicao : parseFloat(totais?.somaContribuicao || "0"),
    somaComissao: vendedorFiltrado ? totalAjustadoComissao : parseFloat(totais?.somaComissao || "0"),
    somaExpectativaComissao: vendedorFiltrado ? totalAjustadoExpectativa : parseFloat(totais?.somaExpectativaComissao || "0"),
    vendedores,
    // Indicadores quando filtra por vendedor específico
    filtradoPorVendedor: vendedorFiltrado,
    // Quantidade de clientes sem cadastro em cliente_vendedores (só quando filtrado)
    clientesSemCadastroVendedor: vendedorFiltrado ? qtdSemCadastroVendedorTotal : 0,
  };
}

export async function criarCliente(data: typeof clientes.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  // Sanitizar: converter strings vazias em undefined, remover valores 'nan' / NaN
  const sanitized = Object.fromEntries(
    Object.entries(data).map(([k, v]) => {
      if (v === "" || v === "nan" || v === "NaN") return [k, undefined];
      if (typeof v === "number" && isNaN(v)) return [k, undefined];
      return [k, v];
    })
  ) as typeof clientes.$inferInsert;
  const [result] = await db.insert(clientes).values(sanitized);
  return result;
}

export async function atualizarCliente(id: number, data: Partial<typeof clientes.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  // Sanitizar: converter strings vazias em null, remover valores 'nan' / NaN para evitar erros no MySQL
  const sanitized = Object.fromEntries(
    Object.entries(data).map(([k, v]) => {
      if (v === "" || v === "nan" || v === "NaN") return [k, null];
      if (typeof v === "number" && isNaN(v)) return [k, null];
      return [k, v];
    })
  ) as Partial<typeof clientes.$inferInsert>;
  await db.update(clientes).set({ ...sanitized, updatedAt: new Date() }).where(eq(clientes.id, id));
  return { success: true };
}

export async function excluirCliente(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  await db.delete(clientes).where(eq(clientes.id, id));
  return { success: true };
}

export async function listarVendedores() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.selectDistinct({ vendedor: clientes.vendedor }).from(clientes).where(sql`vendedor IS NOT NULL AND vendedor != ''`).orderBy(asc(clientes.vendedor));
  return rows.map(r => r.vendedor).filter(Boolean) as string[];
}

export async function buscarClientePorCpf(cpf: string) {
  const db = await getDb();
  if (!db) return null;
  const cpfLimpo = cpf.replace(/\D/g, "");
  if (cpfLimpo.length < 11) return null;
  // Normaliza ambos os lados: remove pontos, traços e barras do CPF armazenado
  // para comparar apenas os dígitos, independente do formato de armazenamento
  const rows = await db.select().from(clientes).where(
    sql`REPLACE(REPLACE(REPLACE(${clientes.cpf}, '.', ''), '-', ''), '/', '') = ${cpfLimpo}`
  ).limit(1);
  return rows[0] || null;
}

// ============================================================
// VENDAS
// ============================================================
export async function listarVendas(opts?: { mes?: number; ano?: number; corretor?: string }) {
  const db = await getDb();
  if (!db) return { vendas: [], total: 0, totalPremio: 0, totalComissao: 0 };

  const conditions = [];
  if (opts?.ano) conditions.push(eq(vendas.ano, opts.ano));
  if (opts?.mes) conditions.push(eq(vendas.mes, opts.mes));
  if (opts?.corretor) conditions.push(like(vendas.corretor, `%${opts.corretor}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(vendas).where(where).orderBy(vendas.mes, vendas.dataVenda);

  const [totais] = await db.select({
    total: sql<number>`COUNT(*)`,
    totalPremio: sql<number>`SUM(COALESCE(valorPremio, 0))`,
    totalComissao: sql<number>`SUM(COALESCE(valorComissao, 0))`,
  }).from(vendas).where(where);

  return {
    vendas: rows,
    total: Number(totais?.total || 0),
    totalPremio: Number(totais?.totalPremio || 0),
    totalComissao: Number(totais?.totalComissao || 0),
  };
}

export async function resumoVendasPorCorretor(ano?: number, mes?: number) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (ano) conditions.push(eq(vendas.ano, ano));
  if (mes) conditions.push(eq(vendas.mes, mes));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db.select({
    corretor: vendas.corretor,
    totalVendas: sql<number>`COUNT(*)`,
    totalPremio: sql<number>`SUM(COALESCE(valorPremio, 0))`,
    totalComissao: sql<number>`SUM(COALESCE(valorComissao, 0))`,
    cpfNovos: sql<number>`SUM(CASE WHEN cpfNovo = 'SIM' THEN 1 ELSE 0 END)`,
    comissoesPagas: sql<number>`SUM(CASE WHEN comissaoPaga = 'PAGO' THEN 1 ELSE 0 END)`,
    implantadas: sql<number>`SUM(CASE WHEN implantada = 'SIM' THEN 1 ELSE 0 END)`,
  }).from(vendas).where(where).groupBy(vendas.corretor).orderBy(sql`SUM(COALESCE(valorComissao, 0)) DESC`);
}

export async function metricasVendas(ano?: number, mes?: number) {
  const db = await getDb();
  if (!db) return { totalPropostas: 0, cpfNovos: 0, faturamento: 0, comissaoTotal: 0, ticketMedio: 0, comissoesPagas: 0, implantadas: 0 };

  const conditions = [];
  if (ano) conditions.push(eq(vendas.ano, ano));
  if (mes) conditions.push(eq(vendas.mes, mes));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [r] = await db.select({
    totalPropostas: sql<number>`COUNT(*)`,
    cpfNovos: sql<number>`SUM(CASE WHEN cpfNovo = 'SIM' THEN 1 ELSE 0 END)`,
    faturamento: sql<number>`SUM(COALESCE(valorPremio, 0))`,
    comissaoTotal: sql<number>`SUM(COALESCE(valorComissao, 0))`,
    comissoesPagas: sql<number>`SUM(CASE WHEN comissaoPaga = 'PAGO' THEN 1 ELSE 0 END)`,
    implantadas: sql<number>`SUM(CASE WHEN implantada = 'SIM' THEN 1 ELSE 0 END)`,
  }).from(vendas).where(where);

  // Buscar incentivos da tabela extrato_comissao
  let incentivosTotal = 0;
  if (ano && mes) {
    const [incentivos] = await db.select({
      total: sql<number>`SUM(COALESCE(valorIncentivo, 0))`,
    }).from(sql`extrato_comissao`).where(sql`ano = ${ano} AND mes = ${mes}`);
    incentivosTotal = Number(incentivos?.total || 0);
  }

  const totalPropostas = Number(r?.totalPropostas || 0);
  const faturamento = Number(r?.faturamento || 0);
  const ticketMedio = totalPropostas > 0 ? faturamento / totalPropostas : 0;
  const comissaoTotal = Number(r?.comissaoTotal || 0) + incentivosTotal;

  return {
    totalPropostas,
    cpfNovos: Number(r?.cpfNovos || 0),
    faturamento,
    comissaoTotal,
    ticketMedio,
    comissoesPagas: Number(r?.comissoesPagas || 0),
    implantadas: Number(r?.implantadas || 0),
  };
}

export async function resumoMensalVendas(ano: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select({
    mes: vendas.mes,
    totalVendas: sql<number>`COUNT(*)`,
    faturamento: sql<number>`SUM(COALESCE(valorPremio, 0))`,
    comissaoTotal: sql<number>`SUM(COALESCE(valorComissao, 0))`,
    cpfNovos: sql<number>`SUM(CASE WHEN cpfNovo = 'SIM' THEN 1 ELSE 0 END)`,
  }).from(vendas).where(eq(vendas.ano, ano)).groupBy(vendas.mes).orderBy(asc(vendas.mes));
}

// Comissões pendentes por vendedor
export async function comissoesPendentesPorVendedor(ano?: number) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [sql`(comissaoPaga IS NULL OR comissaoPaga = '' OR comissaoPaga != 'PAGO')`];
  if (ano) conditions.push(eq(vendas.ano, ano));
  const where = and(...conditions);

  return db.select({
    corretor: vendas.corretor,
    totalPendentes: sql<number>`COUNT(*)`,
    totalComissao: sql<number>`SUM(COALESCE(valorComissao, 0))`,
    totalPremio: sql<number>`SUM(COALESCE(valorPremio, 0))`,
  }).from(vendas).where(where).groupBy(vendas.corretor).orderBy(sql`SUM(COALESCE(valorComissao, 0)) DESC`);
}

export async function listarVendasComissaoPendente(opts?: { corretor?: string; ano?: number }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [sql`(comissaoPaga IS NULL OR comissaoPaga = '' OR comissaoPaga != 'PAGO')`];
  if (opts?.ano) conditions.push(eq(vendas.ano, opts.ano));
  if (opts?.corretor) conditions.push(eq(vendas.corretor, opts.corretor));
  const where = and(...conditions);

  return db.select().from(vendas).where(where).orderBy(vendas.corretor, asc(vendas.mes));
}

export async function marcarComissoesPagas(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error('DB não disponível');
  if (ids.length === 0) return { success: true, count: 0 };
  await db.update(vendas).set({ comissaoPaga: 'PAGO' }).where(sql`id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
  return { success: true, count: ids.length };
}

export async function criarVenda(data: typeof vendas.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  // Sanitizar: converter strings vazias em undefined (omitir do insert) para evitar erro de parâmetros
  const sanitized: typeof vendas.$inferInsert = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v === "" ? undefined : v])
  ) as typeof vendas.$inferInsert;
  const [result] = await db.insert(vendas).values(sanitized);
  return result;
}

export async function atualizarVenda(id: number, data: Partial<typeof vendas.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  // Sanitizar: converter strings vazias em null para evitar erro de parâmetros no MySQL
  const sanitized = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v === "" ? null : v])
  ) as Partial<typeof vendas.$inferInsert>;
  await db.update(vendas).set(sanitized).where(eq(vendas.id, id));
  return { success: true };
}

export async function excluirVenda(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  await db.delete(vendas).where(eq(vendas.id, id));
  return { success: true };
}

export async function enviarVendaParaBase(vendaId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");

  // Buscar a venda
  const [venda] = await db.select().from(vendas).where(eq(vendas.id, vendaId)).limit(1);
  if (!venda) throw new Error("Venda não encontrada");

  const cpfLimpo = venda.cpfCliente ? venda.cpfCliente.replace(/\D/g, "") : null;
  let acao: "criado" | "atualizado" = "criado";
  let clienteId: number | null = null;

  // Campos de contato/endereço a copiar da venda para o cliente
  // valorPremio da venda = contribuição mensal do cliente (prêmio do seguro)
  const dadosContato = {
    email: (venda as any).email || undefined,
    telefone: (venda as any).telefone || undefined,
    celular: (venda as any).celular || undefined,
    dataNascimento: (venda as any).dataNascimento || undefined,
    endereco: (venda as any).endereco || undefined,
    bairro: (venda as any).bairro || undefined,
    cidade: (venda as any).cidade || undefined,
    cep: (venda as any).cep || undefined,
    vendedor: venda.corretor || undefined,
    // Contribuição = valor do prêmio mensal
    contribuicao: venda.valorPremio ? String(venda.valorPremio) : undefined,
    // Origem: copia a origem da venda para o cliente
    origemId: (venda as any).origemId || undefined,
  };
  // Remover campos undefined para não sobrescrever dados existentes com null
  const dadosContatoFiltrado = Object.fromEntries(
    Object.entries(dadosContato).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );

  if (cpfLimpo) {
    // Verificar se o cliente já existe pelo CPF
    const existente = await db.select().from(clientes).where(eq(clientes.cpf, cpfLimpo)).limit(1);
    if (existente.length > 0) {
      // Atualizar: adicionar produto se não estiver na lista + copiar dados de contato
      const clienteAtual = existente[0];
      clienteId = clienteAtual.id;
      const produtosAtuais = clienteAtual.produtos ? clienteAtual.produtos.split(",").map(p => p.trim()) : [];
      if (venda.produto && !produtosAtuais.includes(venda.produto)) {
        produtosAtuais.push(venda.produto);
      }
      await db.update(clientes).set({
        produtos: produtosAtuais.join(", "),
        status: "Ativo",
        updatedAt: new Date(),
        ...dadosContatoFiltrado,
      }).where(eq(clientes.id, clienteAtual.id));
      acao = "atualizado";
    } else {
      // Criar novo cliente com todos os dados de contato
      const [result] = await db.insert(clientes).values({
        cpf: cpfLimpo,
        nome: venda.nomeCliente || "SEM NOME",
        produtos: venda.produto || "",
        status: "Ativo",
        ...dadosContatoFiltrado,
      });
      clienteId = (result as any).insertId;
      acao = "criado";
    }
  } else {
    // Sem CPF: criar cliente sem CPF com dados de contato
    const [result] = await db.insert(clientes).values({
      cpf: "",
      nome: venda.nomeCliente || "SEM NOME",
      produtos: venda.produto || "",
      status: "Ativo",
      ...dadosContatoFiltrado,
    });
    clienteId = (result as any).insertId;
    acao = "criado";
  }

  // Marcar a venda como enviada para a base
  await db.update(vendas).set({ naBase: true, updatedAt: new Date() }).where(eq(vendas.id, vendaId));

  return { success: true, acao, clienteId };
}

// ============================================================
// SINISTROS
// ============================================================
export async function listarSinistros(opts?: { busca?: string; status?: string; dataInicio?: string; dataFim?: string }) {
  const db = await getDb();
  if (!db) return { sinistros: [], total: 0 };

  const conditions = [];
  if (opts?.status) conditions.push(eq(sinistros.status, opts.status as "Pagamento" | "Em Análise" | "Pendente" | "Recusado"));
  if (opts?.busca) {
    const b = `%${opts.busca}%`;
    conditions.push(or(like(sinistros.nomeSegurado, b), like(sinistros.cpfSegurado, b), like(sinistros.protocolo, b)));
  }
  if (opts?.dataInicio) conditions.push(sql`DATE(${sinistros.dataProtocolo}) >= ${opts.dataInicio}`);
  if (opts?.dataFim) conditions.push(sql`DATE(${sinistros.dataProtocolo}) <= ${opts.dataFim}`);

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(sinistros).where(where).orderBy(desc(sinistros.dataProtocolo));

  const [totais] = await db.select({
    total: sql<number>`COUNT(*)`,
    totalCapital: sql<number>`SUM(COALESCE(valorCapital, 0))`,
    totalRecebido: sql<number>`SUM(COALESCE(valorRecebido, 0))`,
  }).from(sinistros).where(where);

  return {
    sinistros: rows,
    total: Number(totais?.total || 0),
    totalCapital: Number(totais?.totalCapital || 0),
    totalRecebido: Number(totais?.totalRecebido || 0),
  };
}

export async function criarSinistro(data: typeof sinistros.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  const [result] = await db.insert(sinistros).values(data);
  return result;
}

function sanitizarData(val: unknown): Date | null {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  const ano = parseInt(s.split("-")[0]);
  if (isNaN(ano) || ano < 1900 || ano > 2100) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function atualizarSinistro(id: number, data: Partial<typeof sinistros.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  const sanitized = {
    ...data,
    dataProtocolo: sanitizarData(data.dataProtocolo as unknown),
    dataRecebimento: sanitizarData(data.dataRecebimento as unknown),
    dataNascimento: sanitizarData(data.dataNascimento as unknown),
  };
  await db.update(sinistros).set(sanitized).where(eq(sinistros.id, id));
  return { success: true };
}

export async function excluirSinistro(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  // Excluir beneficiários do CRM primeiro
  await db.delete(beneficiariosCRM).where(eq(beneficiariosCRM.sinistroId, id));
  await db.delete(sinistros).where(eq(sinistros.id, id));
  return { success: true };
}

export async function metricasSinistros() {
  const db = await getDb();
  if (!db) return { total: 0, pagamentos: 0, emAnalise: 0, pendentes: 0, recusados: 0, totalCapital: 0, totalRecebido: 0, mensal: [] };

  const [totais] = await db.select({
    total: sql<number>`COUNT(*)`,
    pagamentos: sql<number>`SUM(CASE WHEN status = 'Pagamento' THEN 1 ELSE 0 END)`,
    emAnalise: sql<number>`SUM(CASE WHEN status = 'Em Análise' THEN 1 ELSE 0 END)`,
    pendentes: sql<number>`SUM(CASE WHEN status = 'Pendente' THEN 1 ELSE 0 END)`,
    recusados: sql<number>`SUM(CASE WHEN status = 'Recusado' THEN 1 ELSE 0 END)`,
    totalCapital: sql<number>`SUM(COALESCE(valorCapital, 0))`,
    totalRecebido: sql<number>`SUM(COALESCE(valorRecebido, 0))`,
  }).from(sinistros);

  const mensal = await db.select({
    mes: sql<number>`MONTH(dataProtocolo)`,
    ano: sql<number>`YEAR(dataProtocolo)`,
    total: sql<number>`COUNT(*)`,
    pagamentos: sql<number>`SUM(CASE WHEN status = 'Pagamento' THEN 1 ELSE 0 END)`,
    pendentes: sql<number>`SUM(CASE WHEN status = 'Pendente' THEN 1 ELSE 0 END)`,
    recusados: sql<number>`SUM(CASE WHEN status = 'Recusado' THEN 1 ELSE 0 END)`,
    totalCapital: sql<number>`SUM(COALESCE(valorCapital, 0))`,
    totalRecebido: sql<number>`SUM(COALESCE(valorRecebido, 0))`,
  }).from(sinistros)
    .where(sql`dataProtocolo IS NOT NULL`)
    .groupBy(sql`YEAR(dataProtocolo)`, sql`MONTH(dataProtocolo)`)
    .orderBy(sql`YEAR(dataProtocolo)`, sql`MONTH(dataProtocolo)`);

  return {
    total: Number(totais?.total || 0),
    pagamentos: Number(totais?.pagamentos || 0),
    emAnalise: Number(totais?.emAnalise || 0),
    pendentes: Number(totais?.pendentes || 0),
    recusados: Number(totais?.recusados || 0),
    totalCapital: Number(totais?.totalCapital || 0),
    totalRecebido: Number(totais?.totalRecebido || 0),
    mensal: mensal.map(m => ({
      mes: Number(m.mes),
      ano: Number(m.ano),
      total: Number(m.total),
      pagamentos: Number(m.pagamentos),
      pendentes: Number(m.pendentes),
      recusados: Number(m.recusados),
      totalCapital: Number(m.totalCapital),
      totalRecebido: Number(m.totalRecebido),
    })),
  };
}

// ============================================================
// CRM DE BENEFICIÁRIOS
// ============================================================
export async function listarBeneficiariosCRM(sinistroId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(beneficiariosCRM).where(eq(beneficiariosCRM.sinistroId, sinistroId)).orderBy(asc(beneficiariosCRM.createdAt));
}

export async function criarBeneficiarioCRM(data: typeof beneficiariosCRM.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  const [result] = await db.insert(beneficiariosCRM).values(data);
  return result;
}

export async function atualizarBeneficiarioCRM(id: number, data: Partial<typeof beneficiariosCRM.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  await db.update(beneficiariosCRM).set(data).where(eq(beneficiariosCRM.id, id));
  return { success: true };
}

export async function excluirBeneficiarioCRM(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  await db.delete(beneficiariosCRM).where(eq(beneficiariosCRM.id, id));
  return { success: true };
}

export async function metricasCRMBeneficiarios() {
  const db = await getDb();
  if (!db) return { total: 0, aguardando: 0, entrarEmContato: 0, fechado: 0, recusado: 0 };

  const [totais] = await db.select({
    total: sql<number>`COUNT(*)`,
    aguardando: sql<number>`SUM(CASE WHEN statusCRM = 'AGUARDANDO' THEN 1 ELSE 0 END)`,
    entrarEmContato: sql<number>`SUM(CASE WHEN statusCRM = 'ENTRAR EM CONTATO' THEN 1 ELSE 0 END)`,
    fechado: sql<number>`SUM(CASE WHEN statusCRM = 'FECHADO' THEN 1 ELSE 0 END)`,
    recusado: sql<number>`SUM(CASE WHEN statusCRM = 'RECUSADO' THEN 1 ELSE 0 END)`,
  }).from(beneficiariosCRM);

  return {
    total: Number(totais?.total || 0),
    aguardando: Number(totais?.aguardando || 0),
    entrarEmContato: Number(totais?.entrarEmContato || 0),
    fechado: Number(totais?.fechado || 0),
    recusado: Number(totais?.recusado || 0),
  };
}

// ============================================================
// CRM LEADS
// ============================================================

export async function listarLeads(opts?: { busca?: string; status?: string; mes?: number; ano?: number; vendedor?: string; origem?: string; dataInicio?: string; dataFim?: string; cidades?: string[]; uf?: string; bairro?: string }) {
  const db = await getDb();
  if (!db) return { leads: [], total: 0 };

  // Migração lazy: adiciona colunas novas se ainda não existirem
  const novaColunas = [
    "ALTER TABLE crm_leads ADD COLUMN celular2 VARCHAR(30)",
    "ALTER TABLE crm_leads ADD COLUMN celular3 VARCHAR(30)",
    "ALTER TABLE crm_leads ADD COLUMN fixo1 VARCHAR(30)",
    "ALTER TABLE crm_leads ADD COLUMN fixo2 VARCHAR(30)",
    "ALTER TABLE crm_leads ADD COLUMN fixo3 VARCHAR(30)",
    "ALTER TABLE crm_leads ADD COLUMN logradouro VARCHAR(255)",
    "ALTER TABLE crm_leads ADD COLUMN numero VARCHAR(20)",
    "ALTER TABLE crm_leads ADD COLUMN complemento VARCHAR(100)",
    "ALTER TABLE crm_leads ADD COLUMN bairro VARCHAR(100)",
    "ALTER TABLE crm_leads ADD COLUMN cidade VARCHAR(100)",
    "ALTER TABLE crm_leads ADD COLUMN uf VARCHAR(2)",
  ];
  for (const stmt of novaColunas) {
    try { await db.execute(sql.raw(stmt)); } catch { /* coluna já existe */ }
  }

  const conditions = [];
  if (opts?.status && opts.status !== "todos") {
    conditions.push(eq(crmLeads.status, opts.status as any));
  }
  if (opts?.mes) conditions.push(eq(crmLeads.mes, opts.mes));
  if (opts?.ano) conditions.push(eq(crmLeads.ano, opts.ano));
  if (opts?.vendedor && opts.vendedor !== "todos") conditions.push(eq(crmLeads.vendedor, opts.vendedor));
  if (opts?.origem && opts.origem !== "todos") conditions.push(eq(crmLeads.origem, opts.origem));
  if (opts?.uf && opts.uf !== "todos") conditions.push(eq(crmLeads.uf, opts.uf));
  if (opts?.cidades && opts.cidades.length > 0) {
    conditions.push(or(...opts.cidades.map(c => eq(crmLeads.cidade, c)))!);
  }
  if (opts?.bairro) conditions.push(like(crmLeads.bairro, `%${opts.bairro}%`));
  if (opts?.busca) {
    const b = `%${opts.busca}%`;
    conditions.push(or(
      like(crmLeads.nome, b),
      like(crmLeads.cpf, b),
      like(crmLeads.telefone, b),
      like(crmLeads.cidade, b),
      like(crmLeads.bairro, b),
    ));
  }
  if (opts?.dataInicio) conditions.push(sql`DATE(${crmLeads.createdAt}) >= ${opts.dataInicio}`);
  if (opts?.dataFim) conditions.push(sql`DATE(${crmLeads.createdAt}) <= ${opts.dataFim}`);

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(crmLeads).where(where).orderBy(desc(crmLeads.createdAt));

  return { leads: rows, total: rows.length };
}

export async function listarCidadesLeads() {
  const db = await getDb();
  if (!db) return [];
  try {
    const [rows] = await db.execute(sql`SELECT DISTINCT cidade FROM crm_leads WHERE cidade IS NOT NULL AND cidade != '' ORDER BY cidade`) as any;
    return (rows as any[]).map((r: any) => r.cidade as string);
  } catch { return []; }
}

export async function listarUFsLeads() {
  const db = await getDb();
  if (!db) return [];
  try {
    const [rows] = await db.execute(sql`SELECT DISTINCT uf FROM crm_leads WHERE uf IS NOT NULL AND uf != '' ORDER BY uf`) as any;
    return (rows as any[]).map((r: any) => r.uf as string);
  } catch { return []; }
}

export async function listarOrigensLeads() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(crmOrigensLeads).orderBy(asc(crmOrigensLeads.nome));
  return rows;
}

export async function criarOrigemLead(nome: string) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  const [result] = await db.insert(crmOrigensLeads).values({ nome, ativa: true });
  return { id: (result as any).insertId, nome };
}

export async function excluirOrigemLead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  await db.delete(crmOrigensLeads).where(eq(crmOrigensLeads.id, id));
  return { success: true };
}

export async function listarVendedoresLeads() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.selectDistinct({ vendedor: crmLeads.vendedor }).from(crmLeads).where(sql`vendedor IS NOT NULL AND vendedor != ''`);
  return rows.map(r => r.vendedor).filter(Boolean) as string[];
}

export async function metricasLeads(ano?: number, mes?: number, vendedor?: string) {
  const db = await getDb();
  if (!db) return { total: 0, aguardando: 0, semContato: 0, emContato: 0, agendamento: 0, fechamento: 0, recusado: 0, totalValorEstimado: 0, taxaConversao: 0, mensal: [] };

  const conditions: any[] = [];
  if (ano) conditions.push(eq(crmLeads.ano, ano));
  if (mes) conditions.push(eq(crmLeads.mes, mes));
  if (vendedor) conditions.push(eq(crmLeads.vendedor, vendedor));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totais] = await db.select({
    total: sql<number>`COUNT(*)`,
    aguardando: sql<number>`SUM(CASE WHEN status = 'AGUARDANDO' THEN 1 ELSE 0 END)`,
    semContato: sql<number>`SUM(CASE WHEN status = 'SEM CONTATO' THEN 1 ELSE 0 END)`,
    emContato: sql<number>`SUM(CASE WHEN status = 'EM CONTATO' THEN 1 ELSE 0 END)`,
    agendamento: sql<number>`SUM(CASE WHEN status = 'AGENDAMENTO' THEN 1 ELSE 0 END)`,
    fechamento: sql<number>`SUM(CASE WHEN status = 'FECHAMENTO' THEN 1 ELSE 0 END)`,
    recusado: sql<number>`SUM(CASE WHEN status = 'RECUSADO' THEN 1 ELSE 0 END)`,
    totalValorEstimado: sql<string>`COALESCE(SUM(valorEstimado), 0)`,
  }).from(crmLeads).where(where);

  const total = Number(totais?.total || 0);
  const fechamento = Number(totais?.fechamento || 0);

  // Mensal
  const mensalRows = await db.select({
    mes: crmLeads.mes,
    ano: crmLeads.ano,
    total: sql<number>`COUNT(*)`,
    fechamento: sql<number>`SUM(CASE WHEN status = 'FECHAMENTO' THEN 1 ELSE 0 END)`,
    totalValor: sql<string>`COALESCE(SUM(valorEstimado), 0)`,
  }).from(crmLeads).where(where).groupBy(crmLeads.ano, crmLeads.mes).orderBy(asc(crmLeads.ano), asc(crmLeads.mes));

  return {
    total,
    aguardando: Number(totais?.aguardando || 0),
    semContato: Number(totais?.semContato || 0),
    emContato: Number(totais?.emContato || 0),
    agendamento: Number(totais?.agendamento || 0),
    fechamento,
    recusado: Number(totais?.recusado || 0),
    totalValorEstimado: Number(totais?.totalValorEstimado || 0),
    taxaConversao: total > 0 ? Math.round((fechamento / total) * 100) : 0,
    mensal: mensalRows.map(m => ({
      mes: m.mes,
      ano: m.ano,
      total: Number(m.total),
      fechamento: Number(m.fechamento),
      totalValor: Number(m.totalValor),
    })),
  };
}

export async function criarLead(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  const [result] = await db.insert(crmLeads).values(data);
  return { id: (result as any).insertId };
}

export async function atualizarLead(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  await db.update(crmLeads).set({ ...data, updatedAt: new Date() }).where(eq(crmLeads.id, id));
  return { success: true };
}

export async function excluirLead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  await db.delete(crmLeads).where(eq(crmLeads.id, id));
  return { success: true };
}

export async function excluirLeadsPorMesAno(mes: number, ano: number) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  const result = await db.delete(crmLeads).where(and(eq(crmLeads.mes, mes), eq(crmLeads.ano, ano)));
  return { success: true, deletados: (result as any).affectedRows ?? 0 };
}

export async function excluirLeadsEmLote(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  if (!ids.length) return { success: true, deletados: 0 };
  await db.delete(crmLeads)
    .where(sql`id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
  return { success: true, deletados: ids.length };
}

export async function marcarLeadsEnviados(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  if (!ids.length) return { success: true, atualizados: 0 };
  await db.update(crmLeads)
    .set({ status: "ENVIADO", updatedAt: new Date() })
    .where(sql`id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
  return { success: true, atualizados: ids.length };
}

// ============================================================
// CRM BENEFICIÁRIOS — Página dedicada (todos os beneficiários)
// ============================================================
export async function listarTodosBeneficiariosCRM(opts?: { busca?: string; statusCRM?: string }) {
  const db = await getDb();
  if (!db) return { beneficiarios: [] };

  const conditions = [];
  if (opts?.statusCRM && opts.statusCRM !== "todos") {
    conditions.push(eq(beneficiariosCRM.statusCRM, opts.statusCRM as any));
  }
  if (opts?.busca) {
    const b = `%${opts.busca}%`;
    conditions.push(or(like(beneficiariosCRM.nome, b), like(beneficiariosCRM.nomeSegurado, b)));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(beneficiariosCRM).where(where).orderBy(asc(beneficiariosCRM.statusCRM), desc(beneficiariosCRM.createdAt));

  // Calcular dias aguardando (para lógica dos 2 meses)
  const now = new Date();
  return {
    beneficiarios: rows.map(b => {
      const diasDesde = Math.floor((now.getTime() - new Date(b.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      const deveEntrarEmContato = b.statusCRM === "AGUARDANDO" && diasDesde >= 60;
      return { ...b, diasDesde, deveEntrarEmContato };
    }),
  };
}

// ============================================================
// PRODUTOS
// ============================================================
import mysql from "mysql2/promise";

let _prodPool: mysql.Pool | null = null;
function getProdPool(): mysql.Pool {
  if (!_prodPool && process.env.DATABASE_URL) {
    _prodPool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      connectionLimit: 5,
      waitForConnections: true,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
  }
  if (!_prodPool) throw new Error("DATABASE_URL não configurado");
  return _prodPool;
}
async function queryProdPool<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const pool = getProdPool();
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

export async function listarProdutos() {
  const rows = await queryProdPool<{ id: number; codigo: string; descricao: string; ativo: boolean }>(
    `SELECT id, codigo, descricao, ativo FROM produtos WHERE ativo = 1 ORDER BY descricao`
  );
  return rows;
}

export async function listarProdutosDoCliente(clienteId: number) {
  const rows = await queryProdPool<{ id: number; codigo: string; descricao: string }>(
    `SELECT p.id, p.codigo, p.descricao 
     FROM produtos p
     INNER JOIN cliente_produtos cp ON cp.produtoId = p.id
     WHERE cp.clienteId = ?
     ORDER BY p.descricao`,
    [clienteId]
  );
  return rows;
}

export async function vincularProdutoCliente(clienteId: number, produtoId: number) {
  await queryProdPool(
    `INSERT IGNORE INTO cliente_produtos (clienteId, produtoId) VALUES (?, ?)`,
    [clienteId, produtoId]
  );
  return { success: true };
}

export async function desvincularProdutoCliente(clienteId: number, produtoId: number) {
  await queryProdPool(
    `DELETE FROM cliente_produtos WHERE clienteId = ? AND produtoId = ?`,
    [clienteId, produtoId]
  );
  return { success: true };
}

export async function listarClientesPorProduto(produtoId: number) {
  const rows = await queryProdPool<{ id: number; nome: string; cpf: string; vendedor: string; contribuicao: number }>(
    `SELECT c.id, c.nome, c.cpf, c.vendedor, c.contribuicao
     FROM clientes c
     INNER JOIN cliente_produtos cp ON cp.clienteId = c.id
     WHERE cp.produtoId = ?
     ORDER BY c.nome`,
    [produtoId]
  );
  return rows;
}

export async function listarAniversariantes(dia?: number, mes?: number, statusFiltro?: string) {
  const hoje = new Date();
  const diaFiltro = dia ?? hoje.getDate();
  const mesFiltro = mes ?? (hoje.getMonth() + 1);
  let statusClause = "";
  if (statusFiltro === "Ativo") statusClause = " AND LOWER(status) = 'ativo'";
  else if (statusFiltro === "Inativo") statusClause = " AND status = 'Inativo'";
  const rows = await queryProdPool<{
    id: number; nome: string; cpf: string; dataNascimento: string;
    telefone: string | null; celular: string | null; email: string | null;
    vendedor: string | null; status: string | null; produtos: string | null;
  }>(
    `SELECT id, nome, cpf, dataNascimento, telefone, celular, email, vendedor, status, produtos
     FROM clientes
     WHERE dataNascimento IS NOT NULL AND MONTH(dataNascimento) = ? AND DAY(dataNascimento) = ?${statusClause}
     ORDER BY nome`,
    [mesFiltro, diaFiltro]
  );
  return rows;
}

export async function listarAniversariantesMes(mes?: number, statusFiltro?: string) {
  const hoje = new Date();
  const mesFiltro = mes ?? (hoje.getMonth() + 1);
  let statusClause = "";
  if (statusFiltro === "Ativo") statusClause = " AND LOWER(status) = 'ativo'";
  else if (statusFiltro === "Inativo") statusClause = " AND status = 'Inativo'";
  const rows = await queryProdPool<{
    id: number; nome: string; cpf: string; dataNascimento: string;
    telefone: string | null; celular: string | null; email: string | null;
    vendedor: string | null; status: string | null; produtos: string | null; dia: number;
  }>(
    `SELECT id, nome, cpf, dataNascimento, telefone, celular, email, vendedor, status, produtos,
            DAY(dataNascimento) as dia
     FROM clientes
     WHERE dataNascimento IS NOT NULL AND MONTH(dataNascimento) = ?${statusClause}
     ORDER BY DAY(dataNascimento), nome`,
    [mesFiltro]
  );
  return rows;
}

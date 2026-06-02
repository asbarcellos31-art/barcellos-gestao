import { eq, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { dreLancamentos, historicoAnual, metasAnuais } from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;
function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    _db = drizzle(process.env.DATABASE_URL);
  }
  return _db!;
}

// ─── DRE ─────────────────────────────────────────────────────────────────────

export async function listarDrePorAno(ano: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(dreLancamentos)
    .where(eq(dreLancamentos.ano, ano))
    .orderBy(dreLancamentos.mes, dreLancamentos.tipo, dreLancamentos.categoria);
  return rows;
}

export async function listarDrePorMes(mes: number, ano: number) {
  const db = getDb();
  return db
    .select()
    .from(dreLancamentos)
    .where(and(eq(dreLancamentos.mes, mes), eq(dreLancamentos.ano, ano)))
    .orderBy(dreLancamentos.tipo, dreLancamentos.categoria);
}

export async function upsertDreLancamento(data: {
  mes: number;
  ano: number;
  tipo: "RECEITA" | "DESPESA";
  categoria: string;
  subcategoria?: string | null;
  valor: string;
}) {
  const db = getDb();
  // Verifica se já existe
  const existing = await db
    .select()
    .from(dreLancamentos)
    .where(
      and(
        eq(dreLancamentos.mes, data.mes),
        eq(dreLancamentos.ano, data.ano),
        eq(dreLancamentos.tipo, data.tipo),
        eq(dreLancamentos.categoria, data.categoria),
        data.subcategoria
          ? eq(dreLancamentos.subcategoria, data.subcategoria)
          : sql`subcategoria IS NULL`
      )
    );
  if (existing.length > 0) {
    await db
      .update(dreLancamentos)
      .set({ valor: data.valor, updatedAt: new Date() })
      .where(eq(dreLancamentos.id, existing[0].id));
  } else {
    await db.insert(dreLancamentos).values({
      mes: data.mes,
      ano: data.ano,
      tipo: data.tipo,
      categoria: data.categoria,
      subcategoria: data.subcategoria ?? null,
      valor: data.valor,
    });
  }

  // Atualiza histórico anual automaticamente quando receita é salva
  if (data.tipo === 'RECEITA' && data.categoria === 'Comissões Total') {
    const [rRows] = await db
      .select({ total: sql<string>`SUM(CAST(valor AS DECIMAL(15,2)))` })
      .from(dreLancamentos)
      .where(and(eq(dreLancamentos.ano, data.ano), eq(dreLancamentos.tipo, 'RECEITA'), eq(dreLancamentos.categoria, 'Comissões Total'), sql`subcategoria IS NULL`));
    const [cRows] = await db
      .select({ total: sql<string>`SUM(CAST(valor AS DECIMAL(15,2)))` })
      .from(dreLancamentos)
      .where(and(eq(dreLancamentos.ano, data.ano), eq(dreLancamentos.tipo, 'RECEITA'), sql`subcategoria = 'Carteira'`));
    const [aRows] = await db
      .select({ total: sql<string>`SUM(CAST(valor AS DECIMAL(15,2)))` })
      .from(dreLancamentos)
      .where(and(eq(dreLancamentos.ano, data.ano), eq(dreLancamentos.tipo, 'RECEITA'), sql`subcategoria = 'Angariação'`));
    const receitaTotal = (rRows as any)?.total ?? '0';
    const carteira = (cRows as any)?.total ?? '0';
    const angariacao = (aRows as any)?.total ?? '0';
    await upsertHistoricoAnual({ ano: data.ano, receitaTotal: String(receitaTotal), carteira: String(carteira), angariacao: String(angariacao) });
  }

  return 0;
}

export async function resumoDrePorAno(ano: number) {
  const db = getDb();
  // Agrega por mês: total receitas, total despesas
  const rows = await db
    .select({
      mes: dreLancamentos.mes,
      tipo: dreLancamentos.tipo,
      total: sql<string>`SUM(valor)`,
    })
    .from(dreLancamentos)
    .where(eq(dreLancamentos.ano, ano))
    .groupBy(dreLancamentos.mes, dreLancamentos.tipo)
    .orderBy(dreLancamentos.mes);
  return rows;
}

// ─── DRE AUTO-PREENCHIMENTO ─────────────────────────────────────────────────
// Busca valores do Contas a Pagar para preencher automaticamente o DRE
// Mapeamento:
//   Comissões Total      → RECEITA tipo=RECEITA (soma valorPago onde status=Pago)
//   Salários/Remunerações→ DESPESA vínculo ANDERSON + NAYARA (DISTRIBUICAO)
//   Comissões Pagas      → DESPESA categoria=COMISSAO
//   Contador             → DESPESA descricao LIKE '%CONTADOR%'
//   Combustível          → DESPESA categoria=VEICULO
//   Alimentação          → DESPESA categoria=ALIMENTACAO
//   Material Escritório  → DESPESA categoria=MATERIAL_ESCRITORIO
//   Cartão de Crédito    → DESPESA descricao LIKE '%CARTAO PJ BB%'
//   Marketing            → DESPESA descricao LIKE '%MARKETING%'
//   Luz                  → DESPESA descricao LIKE '%LUZ ESCRIT%'
//   Condomínio           → DESPESA descricao LIKE '%CONDOMINIO ESCRIT%'
//   Internet             → DESPESA descricao LIKE '%TELEFONE ESCRIT%'
//   Impostos             → DESPESA categoria=IMPOSTOS

export async function dreAutoPreenchimento(mes: number, ano: number) {
  const db = getDb();

  // Receita total (tipo=RECEITA, status=Pago)
  const [recRows] = await db.execute(
    sql`SELECT COALESCE(SUM(COALESCE(valorPago, valor)), 0) as total
        FROM contas WHERE mes=${mes} AND ano=${ano} AND tipo='RECEITA' AND status='Pago'`
  ) as any;
  const comissoesTotal = parseFloat(recRows[0]?.total || "0");

  // Salários e Remunerações = distribuição Anderson + Nayara (vinculo IN ('ANDERSON','NAYARA'), status=Pago)
  const [salRows] = await db.execute(
    sql`SELECT COALESCE(SUM(COALESCE(valorPago, valor)), 0) as total
        FROM contas WHERE mes=${mes} AND ano=${ano} AND tipo='DESPESA' AND status='Pago'
        AND vinculo IN ('ANDERSON','NAYARA')`
  ) as any;
  const salariosRemuneracoes = parseFloat(salRows[0]?.total || "0");

  // Comissões Pagas = categoria COMISSAO (despesas pagas)
  const [comPagRows] = await db.execute(
    sql`SELECT COALESCE(SUM(COALESCE(valorPago, valor)), 0) as total
        FROM contas WHERE mes=${mes} AND ano=${ano} AND tipo='DESPESA' AND status='Pago'
        AND categoria='COMISSAO'`
  ) as any;
  const comissoesPagas = parseFloat(comPagRows[0]?.total || "0");

  // Contador = descricao LIKE '%CONTADOR%'
  const [contRows] = await db.execute(
    sql`SELECT COALESCE(SUM(COALESCE(valorPago, valor)), 0) as total
        FROM contas WHERE mes=${mes} AND ano=${ano} AND tipo='DESPESA' AND status='Pago'
        AND descricao LIKE '%CONTADOR%'`
  ) as any;
  const contador = parseFloat(contRows[0]?.total || "0");

  // Combustível = categoria VEICULO
  const [combRows] = await db.execute(
    sql`SELECT COALESCE(SUM(COALESCE(valorPago, valor)), 0) as total
        FROM contas WHERE mes=${mes} AND ano=${ano} AND tipo='DESPESA' AND status='Pago'
        AND categoria='VEICULO'`
  ) as any;
  const combustivel = parseFloat(combRows[0]?.total || "0");

  // Alimentação = categoria ALIMENTACAO
  const [alimRows] = await db.execute(
    sql`SELECT COALESCE(SUM(COALESCE(valorPago, valor)), 0) as total
        FROM contas WHERE mes=${mes} AND ano=${ano} AND tipo='DESPESA' AND status='Pago'
        AND categoria='ALIMENTACAO'`
  ) as any;
  const alimentacao = parseFloat(alimRows[0]?.total || "0");

  // Material de Escritório = categoria MATERIAL_ESCRITORIO
  const [matRows] = await db.execute(
    sql`SELECT COALESCE(SUM(COALESCE(valorPago, valor)), 0) as total
        FROM contas WHERE mes=${mes} AND ano=${ano} AND tipo='DESPESA' AND status='Pago'
        AND categoria='MATERIAL_ESCRITORIO'`
  ) as any;
  const materialEscritorio = parseFloat(matRows[0]?.total || "0");

  // Cartão de Crédito = descricao LIKE '%CARTAO PJ BB%'
  const [cartRows] = await db.execute(
    sql`SELECT COALESCE(SUM(COALESCE(valorPago, valor)), 0) as total
        FROM contas WHERE mes=${mes} AND ano=${ano} AND tipo='DESPESA' AND status='Pago'
        AND descricao LIKE '%CARTAO PJ BB%'`
  ) as any;
  const cartaoCredito = parseFloat(cartRows[0]?.total || "0");

  // Marketing = descricao LIKE '%MARKETING%'
  const [mktRows] = await db.execute(
    sql`SELECT COALESCE(SUM(COALESCE(valorPago, valor)), 0) as total
        FROM contas WHERE mes=${mes} AND ano=${ano} AND tipo='DESPESA' AND status='Pago'
        AND descricao LIKE '%MARKETING%'`
  ) as any;
  const marketing = parseFloat(mktRows[0]?.total || "0");

  // Luz = descricao LIKE '%LUZ ESCRIT%'
  const [luzRows] = await db.execute(
    sql`SELECT COALESCE(SUM(COALESCE(valorPago, valor)), 0) as total
        FROM contas WHERE mes=${mes} AND ano=${ano} AND tipo='DESPESA' AND status='Pago'
        AND descricao LIKE '%LUZ ESCRIT%'`
  ) as any;
  const luz = parseFloat(luzRows[0]?.total || "0");

  // Condomínio = descricao LIKE '%CONDOMINIO ESCRIT%'
  const [condRows] = await db.execute(
    sql`SELECT COALESCE(SUM(COALESCE(valorPago, valor)), 0) as total
        FROM contas WHERE mes=${mes} AND ano=${ano} AND tipo='DESPESA' AND status='Pago'
        AND descricao LIKE '%CONDOMINIO ESCRIT%'`
  ) as any;
  const condominio = parseFloat(condRows[0]?.total || "0");

  // Internet = descricao LIKE '%TELEFONE ESCRIT%'
  const [intRows] = await db.execute(
    sql`SELECT COALESCE(SUM(COALESCE(valorPago, valor)), 0) as total
        FROM contas WHERE mes=${mes} AND ano=${ano} AND tipo='DESPESA' AND status='Pago'
        AND descricao LIKE '%TELEFONE ESCRIT%'`
  ) as any;
  const internet = parseFloat(intRows[0]?.total || "0");

  // Impostos = categoria IMPOSTOS
  const [impRows] = await db.execute(
    sql`SELECT COALESCE(SUM(COALESCE(valorPago, valor)), 0) as total
        FROM contas WHERE mes=${mes} AND ano=${ano} AND tipo='DESPESA' AND status='Pago'
        AND categoria='IMPOSTOS'`
  ) as any;
  const impostos = parseFloat(impRows[0]?.total || "0");

  return {
    comissoesTotal,
    salariosRemuneracoes,
    comissoesPagas,
    contador,
    combustivel,
    alimentacao,
    materialEscritorio,
    cartaoCredito,
    marketing,
    luz,
    condominio,
    internet,
    impostos,
  };
}

// ─── HISTÓRICO ANUAL ─────────────────────────────────────────────────────────

export async function listarHistoricoAnual() {
  const db = getDb();
  return db.select().from(historicoAnual).orderBy(historicoAnual.ano);
}

export async function upsertHistoricoAnual(data: {
  ano: number;
  receitaTotal: string;
  carteira: string;
  angariacao: string;
}) {
  const db = getDb();
  const existing = await db
    .select()
    .from(historicoAnual)
    .where(eq(historicoAnual.ano, data.ano));
  if (existing.length > 0) {
    await db
      .update(historicoAnual)
      .set({ receitaTotal: data.receitaTotal, carteira: data.carteira, angariacao: data.angariacao, updatedAt: new Date() })
      .where(eq(historicoAnual.id, existing[0].id));
  } else {
    await db.insert(historicoAnual).values(data);
  }
}

// ─── METAS ───────────────────────────────────────────────────────────────────

export async function listarMetasPorAno(ano: number) {
  const db = getDb();
  return db
    .select()
    .from(metasAnuais)
    .where(eq(metasAnuais.ano, ano))
    .orderBy(metasAnuais.mes);
}

export async function upsertMeta(data: {
  ano: number;
  mes: number;
  metaReceita: string;
  metaCarteira: string;
  metaAngariacao: string;
  metaLucro?: string | null;
  metaVendas?: string | null;
  metaCpfs?: number | null;
  metaPropostas?: number | null;
}) {
  const db = getDb();
  const existing = await db
    .select()
    .from(metasAnuais)
    .where(and(eq(metasAnuais.ano, data.ano), eq(metasAnuais.mes, data.mes)));
  if (existing.length > 0) {
    await db
      .update(metasAnuais)
      .set({
        metaReceita: data.metaReceita,
        metaCarteira: data.metaCarteira || data.metaReceita,
        metaAngariacao: data.metaAngariacao || "0",
        metaLucro: data.metaLucro || null,
        metaVendas: data.metaVendas || null,
        metaCpfs: data.metaCpfs ?? null,
        metaPropostas: data.metaPropostas ?? null,
        updatedAt: new Date(),
      })
      .where(eq(metasAnuais.id, existing[0].id));
  } else {
    await db.insert(metasAnuais).values({
      ...data,
      metaCarteira: data.metaCarteira || data.metaReceita,
      metaAngariacao: data.metaAngariacao || "0",
      metaLucro: data.metaLucro || null,
      metaVendas: data.metaVendas || null,
    });
  }
}

// ─── DADOS MENSAIS DE CARTEIRA E ANGARIAÇÃO ─────────────────────────────────

export async function dreCarteiraMensalPorAno(ano: number) {
  const db = getDb();
  // Busca carteira e angariação mês a mês para o ano
  const rows = await db
    .select({
      mes: dreLancamentos.mes,
      subcategoria: dreLancamentos.subcategoria,
      valor: sql<string>`SUM(valor)`,
    })
    .from(dreLancamentos)
    .where(
      and(
        eq(dreLancamentos.ano, ano),
        eq(dreLancamentos.tipo, 'RECEITA'),
        eq(dreLancamentos.categoria, 'Comissões Total'),
        sql`subcategoria IN ('Carteira', 'Angariação')`
      )
    )
    .groupBy(dreLancamentos.mes, dreLancamentos.subcategoria)
    .orderBy(dreLancamentos.mes);
  
  // Organizar em array de 12 meses
  const carteira = Array(12).fill(0);
  const angariacao = Array(12).fill(0);
  for (const r of rows) {
    const idx = r.mes - 1;
    if (idx >= 0 && idx < 12) {
      if (r.subcategoria === 'Carteira') carteira[idx] = parseFloat(r.valor);
      if (r.subcategoria === 'Angariação') angariacao[idx] = parseFloat(r.valor);
    }
  }
  return { carteira, angariacao };
}

// ─── DADOS COMPARATIVO MENSAL ────────────────────────────────────────────────
// Dados históricos mensais 2015-2024 da planilha COMPARATIVO MENSAL
// 2025 e 2026+ são puxados dinamicamente do DRE
const COMPARATIVO_HISTORICO: Record<number, number[]> = {
  2015: [23268,65943,69626,66050,65423,74848,81959,75730,77398,78577,76432,95000],
  2016: [73550,72096,81260,78956,79208,89667,87858,89087,93144,89083,94801,92000],
  2017: [99000,84098,96678,112283,106038,98111,97634,97471,99347,97011,107412,100000],
  2018: [94981,94454,97286,97833,81103,91613,92841,91082,102412,103779,102495,100000],
  2019: [102633,86638,90108,90587,87665,96316,97832,97304,98416,97355,93653,100000],
  2020: [93960,90285,95197,91833,93332,102711,99938,98080,100327,102193,103024,101825],
  2021: [99156,99557,116863,103233,102525,113308,113298,113654,112448,109918,110977,109316],
  2022: [111360,108728,112224,111677,110285,128851,129947,127321,123884,126309,126509,120000],
  2023: [121155,116969,132203,121880,126730,141429,149961,143918,148468,154797,160561,150000],
  2024: [142280,153148,153687,152914,153272,170418,176904,170451,162579,164864,164490,160000],
};

export async function listarComparativoMensal() {
  const db = getDb();
  // Busca receita mês a mês para 2025 e 2026 do DRE
  const rows = await db
    .select({
      mes: dreLancamentos.mes,
      ano: dreLancamentos.ano,
      valor: sql<string>`SUM(CAST(valor AS DECIMAL(15,2)))`,
    })
    .from(dreLancamentos)
    .where(
      and(
        sql`ano >= 2025`,
        eq(dreLancamentos.tipo, 'RECEITA'),
        eq(dreLancamentos.categoria, 'Comissões Total'),
        sql`subcategoria IS NULL`
      )
    )
    .groupBy(dreLancamentos.mes, dreLancamentos.ano)
    .orderBy(dreLancamentos.ano, dreLancamentos.mes);

  // Montar dados dinâmicos por ano
  const dadosDinamicos: Record<number, number[]> = {};
  for (const r of rows) {
    if (!dadosDinamicos[r.ano]) dadosDinamicos[r.ano] = Array(12).fill(0);
    dadosDinamicos[r.ano][r.mes - 1] = parseFloat(r.valor);
  }

  const dados: Record<number, number[]> = { ...COMPARATIVO_HISTORICO, ...dadosDinamicos };
  const anos = Object.keys(dados).map(Number).sort();

  return {
    meses: ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"],
    anos,
    dados,
  };
}

// Mantido para compatibilidade — agora é dinâmico
export const COMPARATIVO_MENSAL_DATA = {
  meses: ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"],
  anos: Object.keys(COMPARATIVO_HISTORICO).map(Number).sort(),
  dados: COMPARATIVO_HISTORICO,
};

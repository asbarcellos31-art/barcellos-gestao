import { and, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, contas, InsertConta, Conta } from "../drizzle/schema";
import { ENV } from './_core/env';
import { getPool } from "./sharedPool";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db) {
    try {
      _db = drizzle(getPool());
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      return null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Contas helpers ───────────────────────────────────────────────────────────

export async function listarContas(filters: { mes?: number; ano?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.mes) conditions.push(eq(contas.mes, filters.mes));
  if (filters.ano) conditions.push(eq(contas.ano, filters.ano));
  return db
    .select()
    .from(contas)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(contas.dataVencimento);
}

export async function listarTodasContas(ano?: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(contas)
    .where(ano ? eq(contas.ano, ano) : undefined)
    .orderBy(contas.dataVencimento);
}

export async function criarConta(data: InsertConta) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(contas).values(data);
  return result;
}

export async function atualizarConta(id: number, data: Partial<InsertConta>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(contas).set(data).where(eq(contas.id, id));
}

export async function excluirConta(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(contas).where(eq(contas.id, id));
}

export async function buscarContaPorId(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contas).where(eq(contas.id, id)).limit(1);
  return result[0];
}

export async function alertasVencimento(diasAntecedencia: number = 10) {
  const db = await getDb();
  if (!db) return [];
  const hoje = new Date();
  const limite = new Date();
  limite.setDate(limite.getDate() + diasAntecedencia);
  const hojeStr = hoje.toISOString().split("T")[0];
  const limiteStr = limite.toISOString().split("T")[0];

  return db
    .select()
    .from(contas)
    .where(
      and(
        eq(contas.status, "PENDENTE"),
        sql`${contas.dataVencimento} >= ${hojeStr}`,
        sql`${contas.dataVencimento} <= ${limiteStr}`
      )
    )
    .orderBy(contas.dataVencimento);
}

export async function contasVencidas() {
  const db = await getDb();
  if (!db) return [];
  const hoje = new Date().toISOString().split("T")[0];
  return db
    .select()
    .from(contas)
    .where(
      and(
        eq(contas.status, "PENDENTE"),
        sql`${contas.dataVencimento} < ${hoje}`
      )
    )
    .orderBy(contas.dataVencimento);
}

export async function metricas(mes?: number, ano?: number) {
  const db = await getDb();
  if (!db) return { totalAPagar: 0, totalPago: 0, totalRecebido: 0, saldoFinal: 0 };

  const conditions = [];
  if (mes) conditions.push(eq(contas.mes, mes));
  if (ano) conditions.push(eq(contas.ano, ano));

  const rows = await db
    .select()
    .from(contas)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  let totalDespesas = 0;
  let totalDespesasPago = 0;
  let totalReceitas = 0;
  let totalReceitasPago = 0;

  // Totais por vínculo (despesas)
  let totalDespesasElisia = 0;
  let totalDespesasElisiaPago = 0;
  let totalDespesasBarcellos = 0;
  let totalDespesasBarcellosP = 0;

  for (const c of rows) {
    const valor = parseFloat(String(c.valor)) || 0;
    const valorPago = parseFloat(String(c.valorPago ?? 0)) || 0;
    const tipo = (c as any).tipo ?? "DESPESA";
    if (tipo === "RECEITA") {
      totalReceitas += valor;
      if (c.status === "PAGO") totalReceitasPago += valorPago || valor;
    } else {
      totalDespesas += valor;
      if (c.status === "PAGO") totalDespesasPago += valorPago || valor;
      if (c.vinculo === "ELISIA") {
        totalDespesasElisia += valor;
        if (c.status === "PAGO") totalDespesasElisiaPago += valorPago || valor;
      } else {
        // Barcellos = Anderson + Nayara + Barcellos (tudo que não é Elisia)
        totalDespesasBarcellos += valor;
        if (c.status === "PAGO") totalDespesasBarcellosP += valorPago || valor;
      }
    }
  }

  // Saldo líquido Elisia = despesas pagas vinculadas à Elisia (o que ela gastou / sobrou pra ela)
  // Saldo líquido Barcellos = Receitas recebidas - Despesas pagas (exceto Elisia)
  const saldoLiquidoElisia = totalDespesasElisiaPago;
  const saldoLiquidoBarcellos = totalReceitasPago - totalDespesasBarcellosP;

  return {
    totalAPagar: totalDespesas,
    totalPago: totalDespesasPago,
    totalRecebido: totalReceitasPago,
    saldoFinal: totalDespesas - totalDespesasPago,
    totalReceitas,
    totalDespesas,
    totalDespesasElisia,
    totalDespesasElisiaPago,
    totalDespesasBarcellos,
    totalDespesasBarcellosP,
    // Saldo líquido Elisia = tudo que está vinculado à Elisia (sobra pessoal dela)
    saldoLiquidoElisia,
    // Saldo líquido Barcellos = receitas recebidas - despesas pagas (exceto Elisia)
    saldoLiquido: saldoLiquidoBarcellos,
  };
}

export async function custosPorVinculo(mes?: number, ano?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (mes) conditions.push(eq(contas.mes, mes));
  if (ano) conditions.push(eq(contas.ano, ano));
  // Apenas despesas pagas
  conditions.push(sql`(tipo = 'DESPESA' OR tipo IS NULL)`);
  conditions.push(eq(contas.status, 'PAGO'));

  const rows = await db
    .select()
    .from(contas)
    .where(and(...conditions));

  const map: Record<string, number> = { ANDERSON: 0, NAYARA: 0, ELISIA: 0, BARCELLOS: 0 };
  for (const c of rows) {
    // Usar valorPago se disponível, senão valor
    const v = parseFloat(String(c.valorPago ?? c.valor)) || 0;
    map[c.vinculo] = (map[c.vinculo] || 0) + v;
  }
  const total = Object.values(map).reduce((a, b) => a + b, 0);
  return Object.entries(map).map(([vinculo, valor]) => ({
    vinculo,
    valor,
    percentual: total > 0 ? (valor / total) * 100 : 0,
  }));
}

export async function custosPorCategoria(mes?: number, ano?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (mes) conditions.push(eq(contas.mes, mes));
  if (ano) conditions.push(eq(contas.ano, ano));
  // Apenas despesas pagas
  conditions.push(sql`(tipo = 'DESPESA' OR tipo IS NULL)`);
  conditions.push(eq(contas.status, 'PAGO'));

  const rows = await db
    .select()
    .from(contas)
    .where(and(...conditions));

  const map: Record<string, number> = {};
  for (const c of rows) {
    // Usar valorPago se disponível, senão valor
    const v = parseFloat(String(c.valorPago ?? c.valor)) || 0;
    map[c.categoria] = (map[c.categoria] || 0) + v;
  }
  const total = Object.values(map).reduce((a, b) => a + b, 0);
  return Object.entries(map).map(([categoria, valor]) => ({
    categoria,
    valor,
    percentual: total > 0 ? (valor / total) * 100 : 0,
  }));
}

// Resumo mensal de contas para o Dashboard Financeiro (evolução ao longo do ano)
export async function resumoMensalContas(ano: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(contas)
    .where(eq(contas.ano, ano));

  const meses: Record<number, { despesas: number; despesasPago: number; receitas: number; receitasPago: number }> = {};
  for (let m = 1; m <= 12; m++) meses[m] = { despesas: 0, despesasPago: 0, receitas: 0, receitasPago: 0 };

  for (const c of rows) {
    const m = c.mes;
    if (m < 1 || m > 12) continue;
    const valor = parseFloat(String(c.valor)) || 0;
    const valorPago = parseFloat(String(c.valorPago ?? 0)) || 0;
    const tipo = (c as any).tipo ?? "DESPESA";
    if (tipo === "RECEITA") {
      meses[m].receitas += valor;
      if (c.status === "PAGO") meses[m].receitasPago += valorPago || valor;
    } else {
      meses[m].despesas += valor;
      if (c.status === "PAGO") meses[m].despesasPago += valorPago || valor;
    }
  }

  return Object.entries(meses).map(([mes, v]) => ({
    mes: Number(mes),
    aPagar: v.despesas,
    pago: v.despesasPago,
    receitas: v.receitas,
    receitasPago: v.receitasPago,
    saldo: v.receitasPago - v.despesasPago,
  }));
}

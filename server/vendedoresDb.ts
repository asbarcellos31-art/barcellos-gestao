import { getDb } from "./db";
import { vendedores } from "../drizzle/schema";
import { eq, asc } from "drizzle-orm";

export async function listarVendedoresCadastro() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(vendedores).orderBy(asc(vendedores.nome));
}

export async function listarVendedoresAtivos(): Promise<string[]> {
  const db = await getDb();
  if (!db) return ["ELISIA", "FERNANDA", "NAYARA"];
  const rows = await db.select().from(vendedores).where(eq(vendedores.ativo, true)).orderBy(asc(vendedores.nome));
  if (rows.length === 0) return ["ELISIA", "FERNANDA", "NAYARA"];
  return rows.map(v => v.nome);
}

export async function criarVendedor(nome: string) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.insert(vendedores).values({ nome: nome.toUpperCase().trim(), ativo: true });
  return { ok: true };
}

export async function atualizarVendedor(id: number, dados: { nome?: string; ativo?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const update: Record<string, unknown> = {};
  if (dados.nome !== undefined) update.nome = dados.nome.toUpperCase().trim();
  if (dados.ativo !== undefined) update.ativo = dados.ativo;
  await db.update(vendedores).set(update as any).where(eq(vendedores.id, id));
  return { ok: true };
}

export async function excluirVendedor(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(vendedores).where(eq(vendedores.id, id));
  return { ok: true };
}

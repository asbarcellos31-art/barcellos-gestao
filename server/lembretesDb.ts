import { getDb } from "./db";
import { lembretes } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

export async function listarLembretes(appUserId: number, data: string) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  const rows = await db
    .select()
    .from(lembretes)
    .where(and(eq(lembretes.appUserId, appUserId), sql`DATE(${lembretes.data}) = ${data}`));
  return rows;
}

export async function criarLembrete(data: {
  appUserId: number;
  texto: string;
  data: string;
  hora?: string | null;
  icone?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  // Converter string YYYY-MM-DD para Date para o Drizzle
  const dataDate = new Date(data.data + "T12:00:00");
  const [result] = await db.insert(lembretes).values({
    appUserId: data.appUserId,
    texto: data.texto,
    data: dataDate,
    hora: data.hora ?? null,
    icone: data.icone ?? "📌",
    concluido: false,
  });
  return result;
}

export async function toggleLembrete(id: number, appUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  const [atual] = await db
    .select()
    .from(lembretes)
    .where(and(eq(lembretes.id, id), eq(lembretes.appUserId, appUserId)))
    .limit(1);
  if (!atual) throw new Error("Lembrete não encontrado");
  await db
    .update(lembretes)
    .set({ concluido: !atual.concluido })
    .where(eq(lembretes.id, id));
  return { success: true };
}

export async function atualizarLembrete(id: number, appUserId: number, dados: {
  texto: string;
  data: string;
  hora?: string | null;
  icone?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  const dataDate = new Date(dados.data + "T12:00:00");
  await db
    .update(lembretes)
    .set({ texto: dados.texto, data: dataDate, hora: dados.hora ?? null, icone: dados.icone ?? "📌" })
    .where(and(eq(lembretes.id, id), eq(lembretes.appUserId, appUserId)));
  return { success: true };
}

export async function excluirLembrete(id: number, appUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");
  await db
    .delete(lembretes)
    .where(and(eq(lembretes.id, id), eq(lembretes.appUserId, appUserId)));
  return { success: true };
}

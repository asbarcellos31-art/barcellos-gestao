import { getDb } from "./db";
import {
  emailTemplates, emailListas, emailContatos, emailCampanhas, emailEnvios,
  InsertEmailTemplate, InsertEmailLista, InsertEmailContato,
  InsertEmailCampanha,
} from "../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";

// ─── TEMPLATES ───────────────────────────────────────────────────────────────

export async function listarTemplates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailTemplates).orderBy(desc(emailTemplates.createdAt));
}

export async function criarTemplate(data: InsertEmailTemplate) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(emailTemplates).values(data);
  return result;
}

export async function atualizarTemplate(id: number, data: Partial<InsertEmailTemplate>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(emailTemplates).set(data).where(eq(emailTemplates.id, id));
}

export async function excluirTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
}

export async function duplicarTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const template = await buscarTemplate(id);
  if (!template) throw new Error("Template nao encontrado");
  
  const novoTemplate = {
    nome: `${template.nome} - Copia`,
    assunto: template.assunto,
    corpo: template.corpo,
    saudacao: template.saudacao ?? "Olá, {{nome}}!",
    assinatura: template.assinatura ?? "Atenciosamente,\nEquipe Barcellos Seguros",
  };
  
  const [result] = await db.insert(emailTemplates).values(novoTemplate);
  return result;
}

export async function buscarTemplate(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [t] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id));
  return t ?? null;
}

// ─── LISTAS ───────────────────────────────────────────────────────────────────

export async function listarListas() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailListas).orderBy(desc(emailListas.createdAt));
}

export async function criarLista(data: InsertEmailLista) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(emailListas).values(data);
  return result;
}

export async function excluirLista(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(emailContatos).where(eq(emailContatos.listaId, id));
  await db.delete(emailListas).where(eq(emailListas.id, id));
}

export async function inserirContatos(listaId: number, contatos: Omit<InsertEmailContato, "listaId">[]) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (contatos.length === 0) return;
  const rows = contatos.map(c => ({ ...c, listaId }));
  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(emailContatos).values(rows.slice(i, i + 500));
  }
  await db.update(emailListas)
    .set({ totalContatos: sql`(SELECT COUNT(*) FROM email_contatos WHERE listaId = ${listaId})` })
    .where(eq(emailListas.id, listaId));
}

export async function listarContatos(listaId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailContatos).where(eq(emailContatos.listaId, listaId)).orderBy(emailContatos.nome);
}

// ─── CAMPANHAS ────────────────────────────────────────────────────────────────

export async function listarCampanhas() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailCampanhas).orderBy(desc(emailCampanhas.createdAt));
}

export async function criarCampanha(data: InsertEmailCampanha) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(emailCampanhas).values(data);
  return result;
}

export async function atualizarCampanha(id: number, data: Partial<InsertEmailCampanha>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(emailCampanhas).set(data).where(eq(emailCampanhas.id, id));
}

export async function excluirCampanha(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(emailEnvios).where(eq(emailEnvios.campanhaId, id));
  await db.delete(emailCampanhas).where(eq(emailCampanhas.id, id));
}

export async function buscarCampanha(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [c] = await db.select().from(emailCampanhas).where(eq(emailCampanhas.id, id));
  return c ?? null;
}

export async function duplicarCampanha(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const campanha = await buscarCampanha(id);
  if (!campanha) throw new Error("Campanha nao encontrada");
  
  const novaCampanha = {
    ...campanha,
    nome: `${campanha.nome} - Copia`,
    status: "RASCUNHO" as const,
    totalDestinatarios: 0,
    totalEnviados: 0,
    totalErros: 0,
    dataAgendada: null,
    dataInicio: null,
    dataConclusao: null,
  };
  delete (novaCampanha as any).id;
  delete (novaCampanha as any).createdAt;
  
  const [result] = await db.insert(emailCampanhas).values(novaCampanha as any);
  return result;
}

// ─── ENVIOS ───────────────────────────────────────────────────────────────────

export async function listarEnviosCampanha(campanhaId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailEnvios).where(eq(emailEnvios.campanhaId, campanhaId)).orderBy(emailEnvios.createdAt);
}

export async function marcarEnvioSucesso(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(emailEnvios).set({ status: "ENVIADO", enviadoEm: new Date() }).where(eq(emailEnvios.id, id));
}

export async function marcarEnvioErro(id: number, erro: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(emailEnvios).set({ status: "ERRO", erro }).where(eq(emailEnvios.id, id));
}

export async function registrarAbertura(envioId: number) {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql`UPDATE email_envios SET aberturas = aberturas + 1, abertoPrimeiramente = COALESCE(abertoPrimeiramente, NOW()) WHERE id = ${envioId}`
  );
}

export async function listarAberturasCampanha(campanhaId: number) {
  const db = await getDb();
  if (!db) return [];
  const [rows]: any = await db.execute(
    sql`SELECT ee.id, ee.email, ee.status, ee.aberturas, ee.abertoPrimeiramente, ee.enviadoEm, ee.erro,
               ec.nome as contatoNome
        FROM email_envios ee
        LEFT JOIN email_contatos ec ON ec.id = ee.contatoId
        WHERE ee.campanhaId = ${campanhaId}
        ORDER BY ee.aberturas DESC, ee.enviadoEm DESC`
  );
  return rows || [];
}

import mysql from "mysql2/promise";

async function queryPool<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const conn = await mysql.createConnection(process.env.DATABASE_URL as string);
  try {
    const [rows] = await conn.execute(sql, params);
    return rows as T[];
  } finally {
    await conn.end();
  }
}

export interface Origem {
  id: number;
  nome: string;
  cor: string;
  ativo: boolean;
  createdAt: string;
}

export async function listarOrigens(): Promise<Origem[]> {
  const rows = await queryPool<{ id: number; nome: string; cor: string; ativo: number; createdAt: string }>(
    `SELECT id, nome, cor, ativo, createdAt FROM origens_cliente ORDER BY nome ASC`
  );
  return rows.map(r => ({ ...r, ativo: Boolean(r.ativo) }));
}

export async function criarOrigem(nome: string, cor?: string): Promise<{ id: number }> {
  await queryPool(`INSERT INTO origens_cliente (nome, cor) VALUES (?, ?)`, [nome, cor || "#6366f1"]);
  const [last] = await queryPool<{ id: number }>(`SELECT LAST_INSERT_ID() as id`);
  return { id: last.id };
}

export async function atualizarOrigem(id: number, nome: string, cor?: string, ativo?: boolean): Promise<void> {
  const setClauses: string[] = ["nome = ?"];
  const params: unknown[] = [nome];
  if (cor !== undefined) { setClauses.push("cor = ?"); params.push(cor); }
  if (ativo !== undefined) { setClauses.push("ativo = ?"); params.push(ativo ? 1 : 0); }
  params.push(id);
  await queryPool(`UPDATE origens_cliente SET ${setClauses.join(", ")} WHERE id = ?`, params);
}

export async function excluirOrigem(id: number): Promise<void> {
  // Desvincula clientes antes de excluir
  await queryPool(`UPDATE clientes SET origemId = NULL WHERE origemId = ?`, [id]);
  await queryPool(`DELETE FROM origens_cliente WHERE id = ?`, [id]);
}

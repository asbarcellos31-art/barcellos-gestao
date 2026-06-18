import mysql from "mysql2/promise";

const rawPool = mysql.createPool({
  uri: process.env.DATABASE_URL!,
  connectionLimit: 3,
  enableKeepAlive: true,
});

async function rawQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await rawPool.execute(sql, params);
  return rows as T[];
}

export async function ensureTimerTable() {
  await rawPool.execute(`
    CREATE TABLE IF NOT EXISTS timer_ativo (
      appUserId INT NOT NULL PRIMARY KEY,
      tarefaId INT NOT NULL,
      startedAt DATETIME NULL,
      segundosAcumulados INT NOT NULL DEFAULT 0,
      duracaoMin INT NULL,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

export async function salvarTimer(
  appUserId: number,
  tarefaId: number,
  startedAt: string | null,
  segundosAcumulados: number,
  duracaoMin: number | null
) {
  const startedAtMysql = startedAt
    ? new Date(startedAt).toISOString().replace("T", " ").replace(/\.\d+Z$/, "")
    : null;
  await rawPool.execute(
    `INSERT INTO timer_ativo (appUserId, tarefaId, startedAt, segundosAcumulados, duracaoMin)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       tarefaId = VALUES(tarefaId),
       startedAt = VALUES(startedAt),
       segundosAcumulados = VALUES(segundosAcumulados),
       duracaoMin = VALUES(duracaoMin)`,
    [appUserId, tarefaId, startedAtMysql, segundosAcumulados, duracaoMin]
  );
}

export async function limparTimer(appUserId: number) {
  await rawPool.execute(`DELETE FROM timer_ativo WHERE appUserId = ?`, [appUserId]);
}

export async function obterTimer(appUserId: number) {
  const rows = await rawQuery<{
    tarefaId: number;
    startedAt: Date | null;
    segundosAcumulados: number;
    duracaoMin: number | null;
  }>(
    `SELECT tarefaId, startedAt, segundosAcumulados, duracaoMin FROM timer_ativo WHERE appUserId = ?`,
    [appUserId]
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    tarefaId: row.tarefaId,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    segundosAcumulados: row.segundosAcumulados,
    duracaoMin: row.duracaoMin,
  };
}

import { Router } from "express";
import mysql from "mysql2/promise";

const router = Router();

/**
 * Remove DDD duplicado do telefone.
 * Ex: "(48)48996172474" → "(48) 99617-2474"
 *     "(49)49991278305" → "(49) 99127-8305"
 *     "4833462148"      → "(48) 3346-2148"
 */
function normalizarTelefone(tel: string): string {
  if (!tel) return tel;
  const raw = tel.trim();
  const matchParen = raw.match(/^\((\d{2})\)/);
  let ddd = "", numero = "";
  if (matchParen) {
    ddd = matchParen[1];
    const resto = raw.replace(/^\(\d{2}\)/, "").replace(/\D/g, "");
    // Se o restante começa com o mesmo DDD, remover
    numero = resto.startsWith(ddd) ? resto.slice(ddd.length) : resto;
  } else {
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 10) { ddd = digits.slice(0, 2); numero = digits.slice(2); }
    else return raw;
  }
  if (!ddd || !numero) return raw;
  if (numero.length === 9) return `(${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`;
  if (numero.length === 8) return `(${ddd}) ${numero.slice(0, 4)}-${numero.slice(4)}`;
  return `(${ddd}) ${numero}`;
}

/**
 * POST /api/inadimplentes/enriquecer-contatos
 * Busca email e telefone na Base de Clientes pelo CPF e atualiza a tabela inadimplentes.
 * - Normaliza o CPF antes de comparar (remove pontos, traços, espaços e padeia com zeros).
 * - Normaliza o telefone removendo DDD duplicado antes de salvar.
 * - Sempre sobrescreve com o valor normalizado da base de clientes.
 */
router.post("/inadimplentes/enriquecer-contatos", async (_req, res) => {
  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection(process.env.DATABASE_URL!);

    // Buscar pares (inadimplente.id, telefone/email do cliente)
    const [rows]: any = await conn.execute(`
      SELECT i.id,
             COALESCE(NULLIF(TRIM(c.email), ''), NULL) AS emailCliente,
             COALESCE(NULLIF(TRIM(c.celular), ''), NULLIF(TRIM(c.telefone), ''), NULL) AS telCliente
      FROM inadimplentes i
      INNER JOIN clientes c ON
        LPAD(REGEXP_REPLACE(i.cpf, '[^0-9]', ''), 11, '0') = LPAD(REGEXP_REPLACE(c.cpf, '[^0-9]', ''), 11, '0')
      WHERE c.cpf IS NOT NULL AND i.cpf IS NOT NULL
    `);

    let atualizados = 0;
    for (const row of rows) {
      // Sempre normalizar o telefone da base antes de salvar
      const telNormalizado = row.telCliente ? normalizarTelefone(row.telCliente) : null;
      await conn.execute(
        `UPDATE inadimplentes
         SET emailContato    = COALESCE(?, emailContato),
             telefoneContato = ?
         WHERE id = ?`,
        [row.emailCliente ?? null, telNormalizado ?? null, row.id]
      );
      atualizados++;
    }

    console.log(`[EnriquecerContatos] ${atualizados} inadimplentes atualizados com dados da Base de Clientes`);
    res.json({ ok: true, atualizados });
  } catch (e: any) {
    console.error("[EnriquecerContatos] Erro:", e);
    res.status(500).json({ error: e.message });
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
});

export default router;

/**
 * Script de migração: popula cliente_vendedores para todos os clientes
 * que ainda não têm registro nessa tabela.
 *
 * Regras:
 *   - vendedor = ELISIA  → ELISIA 100%
 *   - vendedor = outro   → outro 50% + ELISIA 50%
 *   - vendedor = null    → ignora
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  connectionLimit: 3,
});

async function main() {
  const conn = await pool.getConnection();
  try {
    // Busca clientes que NÃO têm nenhum registro em cliente_vendedores
    const [clientes] = await conn.execute(`
      SELECT id, vendedor FROM clientes
      WHERE vendedor IS NOT NULL AND vendedor != ''
      AND NOT EXISTS (
        SELECT 1 FROM cliente_vendedores cv WHERE cv.clienteId = clientes.id
      )
    `);

    console.log(`Clientes a migrar: ${clientes.length}`);

    let migrados = 0;
    await conn.beginTransaction();

    for (const c of clientes) {
      const vendedor = c.vendedor.trim().toUpperCase();
      if (!vendedor) continue;

      if (vendedor === "ELISIA") {
        // ELISIA sozinha = 100%
        await conn.execute(
          `INSERT INTO cliente_vendedores (clienteId, nomeVendedor, percentual) VALUES (?, ?, ?)`,
          [c.id, "ELISIA", "100.00"]
        );
      } else {
        // Outro vendedor = 50% + ELISIA 50%
        await conn.execute(
          `INSERT INTO cliente_vendedores (clienteId, nomeVendedor, percentual) VALUES (?, ?, ?), (?, ?, ?)`,
          [c.id, c.vendedor.trim(), "50.00", c.id, "ELISIA", "50.00"]
        );
      }
      migrados++;
    }

    await conn.commit();
    console.log(`✅ Migração concluída: ${migrados} clientes processados.`);
  } catch (e) {
    await conn.rollback();
    console.error("❌ Erro na migração:", e.message);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

main();

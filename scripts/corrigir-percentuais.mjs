/**
 * Corrige percentuais em lote usando SQL direto:
 * - Vendedores != ELISIA com 100% e sem par ELISIA → atualiza para 50% e insere ELISIA 50%
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 3 });

async function main() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Passo 1: Atualiza para 50% todos os vendedores != ELISIA que estão sozinhos com 100%
    const [upd] = await conn.execute(`
      UPDATE cliente_vendedores cv
      SET cv.percentual = '50.00'
      WHERE UPPER(cv.nomeVendedor) != 'ELISIA'
        AND cv.percentual = '100.00'
        AND (SELECT COUNT(*) FROM cliente_vendedores cv2 WHERE cv2.clienteId = cv.clienteId) = 1
    `);
    console.log(`Passo 1: ${upd.affectedRows} registros atualizados para 50%`);

    // Passo 2: Insere ELISIA 50% para todos os clientes que agora têm 1 vendedor != ELISIA com 50%
    const [ins] = await conn.execute(`
      INSERT INTO cliente_vendedores (clienteId, nomeVendedor, percentual)
      SELECT cv.clienteId, 'ELISIA', '50.00'
      FROM cliente_vendedores cv
      WHERE UPPER(cv.nomeVendedor) != 'ELISIA'
        AND cv.percentual = '50.00'
        AND (SELECT COUNT(*) FROM cliente_vendedores cv2 WHERE cv2.clienteId = cv.clienteId) = 1
    `);
    console.log(`Passo 2: ${ins.affectedRows} registros ELISIA 50% inseridos`);

    await conn.commit();
    console.log("✅ Correção concluída!");

    // Resumo final
    const [resumo] = await conn.execute(`
      SELECT nomeVendedor, percentual, COUNT(*) as total
      FROM cliente_vendedores
      GROUP BY nomeVendedor, percentual
      ORDER BY nomeVendedor, percentual
    `);
    console.log("\nResumo após correção:");
    console.table(resumo);

  } catch (e) {
    await conn.rollback();
    console.error("❌ Erro:", e.message);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

main();

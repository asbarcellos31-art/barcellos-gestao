import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Criar tabela
await conn.execute(`
  CREATE TABLE IF NOT EXISTS cliente_vendedores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    clienteId INT NOT NULL,
    nomeVendedor VARCHAR(100) NOT NULL,
    percentual DECIMAL(5,2) NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
    INDEX idx_clienteId (clienteId)
  )
`);
console.log("Tabela cliente_vendedores criada ✓");

// 2. Buscar clientes com vendedor cadastrado que ainda não foram migrados
const [clientes] = await conn.execute(`
  SELECT c.id, c.vendedor
  FROM clientes c
  WHERE c.vendedor IS NOT NULL AND c.vendedor != ''
    AND NOT EXISTS (
      SELECT 1 FROM cliente_vendedores cv WHERE cv.clienteId = c.id
    )
`);
console.log(`${clientes.length} clientes para migrar...`);

if (clientes.length > 0) {
  // 3. Batch insert — um único INSERT com todos os valores
  const values = clientes.map(c => [c.id, c.vendedor, "100.00"]);
  const placeholders = values.map(() => "(?, ?, ?)").join(", ");
  const flat = values.flat();
  await conn.execute(
    `INSERT INTO cliente_vendedores (clienteId, nomeVendedor, percentual) VALUES ${placeholders}`,
    flat
  );
  console.log(`${clientes.length} clientes migrados com 100% ✓`);
} else {
  console.log("Nenhum cliente novo para migrar.");
}

// 4. Verificar
const [[{ total }]] = await conn.execute("SELECT COUNT(*) as total FROM cliente_vendedores");
console.log(`Total de registros em cliente_vendedores: ${total}`);

await conn.end();

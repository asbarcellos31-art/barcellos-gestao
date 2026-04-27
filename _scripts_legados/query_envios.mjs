import mysql from 'mysql2/promise';

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Buscar últimos erros de envio
const [erros] = await db.execute(
  `SELECT id, nome, telefone, status, erro, createdAt FROM whatsapp_envios 
   WHERE tipo = 'CAMPANHA' AND campanhaId = 90002 
   ORDER BY createdAt DESC LIMIT 20`
);

console.log("📋 Últimos 20 envios da campanha MEDICO:\n");
erros.forEach((e, i) => {
  console.log(`${i+1}. ${e.nome} (${e.telefone})`);
  console.log(`   Status: ${e.status}`);
  if (e.erro) console.log(`   Erro: ${e.erro.substring(0, 150)}`);
  console.log(`   Data: ${e.createdAt}\n`);
});

await db.end();

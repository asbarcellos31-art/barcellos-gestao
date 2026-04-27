import mysql from 'mysql2/promise';
import XLSX from 'xlsx';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
console.log('✓ Conectado ao banco!');

const wb = XLSX.readFile('/home/ubuntu/upload/PAGANTES012026FORMULA.xlsx');
const ws = wb.Sheets['EXTRATO COMISSAO'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

console.log(`Total de linhas: ${rows.length}`);
console.log('Header:', rows[0]?.slice(0, 25));

// Colunas da planilha (baseado na análise anterior):
// 0: CPF/CNPJ do Produtor
// 1: Código do produtor
// 2: Tipo de cliente (CARTEIRA INDIVIDUAL, GRUPAL, etc.)
// 3: Nome/Razão social (nome do produtor/corretor)
// 4: CPF/CNPJ do cliente
// 5: Proposta
// 6: UP da venda
// 7: Nº Inscrição
// 8: Descrição Produto (col 9 no 0-index)
// 9: Código do produto
// ... (verificar colunas de valor)

// Verificar colunas de valor
console.log('Colunas 15-25:', rows[0]?.slice(15, 25));
console.log('Exemplo linha 1 cols 15-25:', rows[1]?.slice(15, 25));

const parseNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  if (isNaN(n) || !isFinite(n) || Math.abs(n) > 999999999) return null;
  return n;
};

// Limpar dados anteriores
await conn.query('DELETE FROM extrato_comissao');

const registros = [];
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (!row || !row.some(v => v !== null && v !== '')) continue;
  
  const cpfProdutor = String(row[0] || '').replace(/\D/g, '').slice(0, 20) || null;
  const codigoProdutor = String(row[1] || '').trim().slice(0, 50) || null;
  const tipoCliente = String(row[2] || '').trim().slice(0, 100) || null;
  const nomeCliente = String(row[3] || '').trim().slice(0, 200) || null;
  const cpfCliente = String(row[4] || '').replace(/\D/g, '').slice(0, 20) || null;
  const proposta = String(row[5] || '').trim().slice(0, 50) || null;
  const upVenda = String(row[6] || '').trim().slice(0, 50) || null;
  const inscricao = String(row[7] || '').trim().slice(0, 50) || null;
  const descricaoProduto = String(row[8] || '').trim().slice(0, 200) || null;
  const codigoProduto = String(row[9] || '').trim().slice(0, 50) || null;
  
  // Valores de comissão - verificar colunas corretas
  const valorBase = parseNum(row[15]);
  const parcelaComissionada = parseNum(row[16]);
  const competenciaComissionada = String(row[17] || '').trim().slice(0, 20) || null;
  const parcelaFaturada = parseNum(row[18]);
  const competenciaFaturada = String(row[19] || '').trim().slice(0, 20) || null;
  const valorAngariacao = parseNum(row[20]);
  const valorComissaoTotal = parseNum(row[21]);
  const corretorInterno = String(row[22] || '').trim().slice(0, 200) || null;
  
  if (!cpfProdutor && !nomeCliente) continue;
  
  registros.push([
    null, // uploadId - removido
    1,    // mes
    2026, // ano
    cpfProdutor,
    codigoProdutor,
    nomeCliente, // nomeProdutor (é o nome do cliente/segurado nessa planilha)
    tipoCliente,
    nomeCliente,
    cpfCliente,
    proposta,
    inscricao,
    descricaoProduto,
    codigoProduto,
    upVenda,
    valorBase,
    parcelaComissionada,
    competenciaComissionada,
    parcelaFaturada,
    competenciaFaturada,
    valorAngariacao,
    valorComissaoTotal,
    corretorInterno,
  ]);
}

console.log(`\nTotal de registros para importar: ${registros.length}`);

const BATCH = 500;
let total = 0;
for (let i = 0; i < registros.length; i += BATCH) {
  const batch = registros.slice(i, i + BATCH);
  await conn.query(
    `INSERT INTO extrato_comissao (mes, ano, cpfProdutor, codigoProdutor, nomeProdutor, tipoCliente, nomeCliente, cpfCliente, proposta, inscricao, descricaoProduto, codigoProduto, upVenda, valorBase, parcelaComissionada, competenciaComissionada, parcelaFaturada, competenciaFaturada, valorAngariacao, valorComissaoTotal, corretorInterno) VALUES ?`,
    [batch.map(r => r.slice(1))]
  );
  total += batch.length;
  process.stdout.write(`\r  Importando: ${total}/${registros.length}`);
}

console.log(`\n✓ ${total} registros de comissão importados!`);
await conn.end();
console.log('✓ Concluído!');

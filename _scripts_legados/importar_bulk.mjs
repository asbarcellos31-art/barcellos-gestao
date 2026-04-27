/**
 * Script de importação em lote (bulk insert) para máxima performance.
 */
import mysql from 'mysql2/promise';
import xlsx from 'xlsx';

const DATABASE_URL = process.env.DATABASE_URL || '';
const m = DATABASE_URL.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const [, user, pass, host, port, db] = m;

const conn = await mysql.createConnection({
  host, port: +port, user, password: pass, database: db,
  ssl: { rejectUnauthorized: true }
});
console.log('✓ Conectado ao banco de dados!');

function limparValor(v) {
  if (v == null) return 0;
  const s = String(v).replace(/R\$|\n|\s/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(s) || 0;
}

function limparCpf(v) {
  if (!v) return null;
  return String(v).replace(/\D/g, '').substring(0, 20) || null;
}

function parseData(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return s.slice(0, 10);
  return null;
}

// Limpar dados anteriores para evitar duplicatas
console.log('\nLimpando dados anteriores...');
await conn.execute('DELETE FROM extrato_comissao');
await conn.execute('DELETE FROM extrato_uploads');
await conn.execute('DELETE FROM inadimplentes');
await conn.execute('DELETE FROM inadimplente_uploads');
console.log('✓ Dados anteriores removidos');

// ============================================================
// IMPORTAR COMISSÕES (bulk insert em lotes de 500)
// ============================================================
console.log('\n=== Importando Comissões ===');
const wbComissao = xlsx.readFile('/home/ubuntu/upload/PAGANTES012026FORMULA.xlsx', { cellDates: true });
const wsComissao = wbComissao.Sheets['EXTRATO COMISSAO'];
const rowsComissao = xlsx.utils.sheet_to_json(wsComissao, { header: 1, defval: null });

const [upComissaoResult] = await conn.execute(
  'INSERT INTO extrato_uploads (nomeArquivo, mes, ano, totalRegistros, totalComissao, createdAt) VALUES (?,?,?,?,?,NOW())',
  ['PAGANTES012026FORMULA.xlsx', 1, 2026, 0, 0]
);
const uploadComissaoId = upComissaoResult.insertId;

let totalComissoes = 0;
let totalValorComissao = 0;
let batchComissao = [];

for (let i = 1; i < rowsComissao.length; i++) {
  const row = rowsComissao[i];
  if (!row[0]) continue;

  const competencia = row[12] ? String(row[12]).substring(0, 20) : null;
  let mesComp = 1, anoComp = 2026;
  if (competencia && competencia.length === 6) {
    anoComp = parseInt(competencia.slice(0, 4)) || 2026;
    mesComp = parseInt(competencia.slice(4)) || 1;
  }

  const valorComissao = limparValor(row[21]);
  totalValorComissao += valorComissao;

  batchComissao.push([
    uploadComissaoId, mesComp, anoComp,
    limparCpf(row[0]),
    row[1] ? String(row[1]).substring(0, 20) : null,
    row[2] ? String(row[2]).substring(0, 50) : null,
    row[3] ? String(row[3]).substring(0, 255) : null,
    limparCpf(row[4]),
    row[5] ? String(row[5]).substring(0, 50) : null,
    row[7] ? String(row[7]).substring(0, 50) : null,
    row[8] ? String(row[8]).substring(0, 255) : null,
    row[9] ? String(row[9]).substring(0, 20) : null,
    row[6] ? String(row[6]).substring(0, 100) : null,
    limparValor(row[10]),
    parseInt(row[11]) || 0,
    competencia,
    parseInt(row[13]) || 0,
    row[14] ? String(row[14]).substring(0, 20) : null,
    limparValor(row[19]),
    valorComissao,
  ]);

  // Inserir em lotes de 500
  if (batchComissao.length >= 500) {
    const placeholders = batchComissao.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())').join(',');
    await conn.query(
      `INSERT INTO extrato_comissao 
      (uploadId,mes,ano,cpfProdutor,codigoProdutor,tipoCliente,nomeCliente,cpfCliente,
       proposta,inscricao,descricaoProduto,codigoProduto,upVenda,valorBase,
       parcelaComissionada,competenciaComissionada,parcelaFaturada,competenciaFaturada,
       valorAngariacao,valorComissaoTotal,createdAt) VALUES ${placeholders}`,
      batchComissao.flat()
    );
    totalComissoes += batchComissao.length;
    process.stdout.write(`\r  Inseridos: ${totalComissoes}/${rowsComissao.length - 1}...`);
    batchComissao = [];
  }
}

// Inserir restante
if (batchComissao.length > 0) {
  const placeholders = batchComissao.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())').join(',');
  await conn.query(
    `INSERT INTO extrato_comissao 
    (uploadId,mes,ano,cpfProdutor,codigoProdutor,tipoCliente,nomeCliente,cpfCliente,
     proposta,inscricao,descricaoProduto,codigoProduto,upVenda,valorBase,
     parcelaComissionada,competenciaComissionada,parcelaFaturada,competenciaFaturada,
     valorAngariacao,valorComissaoTotal,createdAt) VALUES ${placeholders}`,
    batchComissao.flat()
  );
  totalComissoes += batchComissao.length;
}

await conn.execute(
  'UPDATE extrato_uploads SET totalRegistros=?, totalComissao=? WHERE id=?',
  [totalComissoes, totalValorComissao, uploadComissaoId]
);
console.log(`\n  ✓ ${totalComissoes} registros de comissão (R$ ${totalValorComissao.toFixed(2)})`);

// ============================================================
// IMPORTAR INADIMPLENTES (bulk insert)
// ============================================================
console.log('\n=== Importando Inadimplentes ===');
const wbInad = xlsx.readFile('/home/ubuntu/upload/BARCELLOSATRASADOS(1).xlsm', { cellDates: true });

const abasMeses = [
  { aba: 'JANEIRO 2026', mes: 1, ano: 2026 },
  { aba: 'FEVEREIRO 2026', mes: 2, ano: 2026 },
];

let totalInadimplentes = 0;

for (const { aba, mes, ano } of abasMeses) {
  if (!wbInad.SheetNames.includes(aba)) {
    console.log(`  ! Aba '${aba}' não encontrada`);
    continue;
  }

  const ws = wbInad.Sheets[aba];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });

  const [upResult] = await conn.execute(
    'INSERT INTO inadimplente_uploads (nomeArquivo, mes, ano, totalRegistros, totalValor, createdAt) VALUES (?,?,?,?,?,NOW())',
    [`BARCELLOSATRASADOS_${aba}.xlsx`, mes, ano, 0, 0]
  );
  const uploadId = upResult.insertId;

  let total = 0;
  let totalValor = 0;
  let batch = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;
    const nome = String(row[0]).substring(0, 255);
    if (!nome || nome.toLowerCase() === 'nome') continue;

    let cpf, tel1, tel2, mesParcela, parcela, formaPag, valor, valorTotalCli, produtos, status, historico;

    if (mes === 1) {
      cpf = limparCpf(row[2]);
      tel1 = row[3] ? String(row[3]).substring(0, 30) : null;
      tel2 = row[4] ? String(row[4]).substring(0, 30) : null;
      mesParcela = parseData(row[5]);
      parcela = row[6] ? String(row[6]).substring(0, 20) : null;
      formaPag = row[7] ? String(row[7]).substring(0, 50) : null;
      valor = limparValor(row[8]);
      valorTotalCli = limparValor(row[9]);
      produtos = null;
      status = row[11] ? String(row[11]).substring(0, 50) : 'PENDENTE';
      historico = row[12] ? String(row[12]).substring(0, 500) : null;
    } else {
      cpf = limparCpf(row[1]);
      tel1 = row[2] ? String(row[2]).substring(0, 30) : null;
      tel2 = null;
      mesParcela = parseData(row[3]);
      parcela = row[4] ? String(row[4]).substring(0, 20) : null;
      formaPag = row[5] ? String(row[5]).substring(0, 50) : null;
      valor = limparValor(row[6]);
      valorTotalCli = limparValor(row[7]);
      produtos = row[8] ? String(row[8]).substring(0, 300) : null;
      status = row[9] ? String(row[9]).substring(0, 50) : 'PENDENTE';
      historico = row[10] ? String(row[10]).substring(0, 500) : null;
    }

    const statusUpper = (status || 'PENDENTE').toUpperCase().trim();
    const statusNorm = ['PAGO', 'PENDENTE', 'EM NEGOCIAÇÃO', 'CANCELADO'].includes(statusUpper)
      ? statusUpper : 'PENDENTE';
    const valorFinal = valorTotalCli > 0 ? valorTotalCli : valor;
    totalValor += valorFinal;

    batch.push([uploadId, mes, ano, nome, cpf, tel1, tel2, mesParcela, parcela,
      formaPag, valorFinal, produtos, statusNorm, historico]);

    if (batch.length >= 200) {
      const ph = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())').join(',');
      await conn.query(
        `INSERT INTO inadimplentes (uploadId,mes,ano,nome,cpf,telefone1,telefone2,mesParcela,parcela,
         formaPagamento,valorTotal,produtos,status,historicoCobranca,createdAt) VALUES ${ph}`,
        batch.flat()
      );
      total += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    const ph = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())').join(',');
    await conn.query(
      `INSERT INTO inadimplentes (uploadId,mes,ano,nome,cpf,telefone1,telefone2,mesParcela,parcela,
       formaPagamento,valorTotal,produtos,status,historicoCobranca,createdAt) VALUES ${ph}`,
      batch.flat()
    );
    total += batch.length;
  }

  await conn.execute(
    'UPDATE inadimplente_uploads SET totalRegistros=?, totalValor=? WHERE id=?',
    [total, totalValor, uploadId]
  );

  totalInadimplentes += total;
  console.log(`  ✓ ${aba}: ${total} inadimplentes (R$ ${totalValor.toFixed(2)})`);
}

console.log('\n' + '='.repeat(50));
console.log('IMPORTAÇÃO CONCLUÍDA!');
console.log(`  Comissões:     ${totalComissoes} registros`);
console.log(`  Inadimplentes: ${totalInadimplentes} registros`);
console.log('='.repeat(50));

await conn.end();

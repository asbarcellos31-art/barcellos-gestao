/**
 * Script de importação de dados reais das planilhas da Barcellos Seguros
 * para o banco de dados MySQL do sistema web.
 */
import mysql from 'mysql2/promise';
import xlsx from 'xlsx';
import { readFileSync } from 'fs';

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
  // DD/MM/YYYY
  const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return s.slice(0, 10);
  return null;
}

// ============================================================
// IMPORTAR COMISSÕES
// ============================================================
async function importarComissoes() {
  console.log('\n=== Importando Comissões ===');
  const wb = xlsx.readFile('/home/ubuntu/upload/PAGANTES012026FORMULA.xlsx', { cellDates: true });
  const ws = wb.Sheets['EXTRATO COMISSAO'];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Criar registro de upload
  const [upResult] = await conn.execute(
    'INSERT INTO extrato_uploads (nomeArquivo, mes, ano, totalRegistros, totalComissao, createdAt) VALUES (?,?,?,?,?,NOW())',
    ['PAGANTES012026FORMULA.xlsx', 1, 2026, 0, 0]
  );
  const uploadId = upResult.insertId;

  let total = 0;
  let totalComissao = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;

    const cpfProdutor = limparCpf(row[0]);
    const codigoProdutor = row[1] ? String(row[1]).substring(0, 20) : null;
    const tipoCliente = row[2] ? String(row[2]).substring(0, 50) : null;
    const nomeCliente = row[3] ? String(row[3]).substring(0, 255) : null;
    const cpfCliente = limparCpf(row[4]);
    const proposta = row[5] ? String(row[5]).substring(0, 50) : null;
    const upVenda = row[6] ? String(row[6]).substring(0, 100) : null;
    const inscricao = row[7] ? String(row[7]).substring(0, 50) : null;
    const descricaoProduto = row[8] ? String(row[8]).substring(0, 255) : null;
    const codigoProduto = row[9] ? String(row[9]).substring(0, 20) : null;
    const valorBase = limparValor(row[10]);
    const parcelaComissionada = parseInt(row[11]) || 0;
    const competenciaComissionada = row[12] ? String(row[12]).substring(0, 20) : null;
    const parcelaFaturada = parseInt(row[13]) || 0;
    const competenciaFaturada = row[14] ? String(row[14]).substring(0, 20) : null;
    const valorAngariacao = limparValor(row[19]);
    const valorComissaoTotal = limparValor(row[21]);

    // Extrair mês/ano da competência (formato YYYYMM)
    let mesComp = 1, anoComp = 2026;
    if (competenciaComissionada && competenciaComissionada.length === 6) {
      anoComp = parseInt(competenciaComissionada.slice(0, 4)) || 2026;
      mesComp = parseInt(competenciaComissionada.slice(4)) || 1;
    }

    try {
      await conn.execute(
        `INSERT INTO extrato_comissao 
        (uploadId, mes, ano, cpfProdutor, codigoProdutor, tipoCliente, nomeCliente, cpfCliente, 
         proposta, inscricao, descricaoProduto, codigoProduto, upVenda, valorBase, 
         parcelaComissionada, competenciaComissionada, parcelaFaturada, competenciaFaturada,
         valorAngariacao, valorComissaoTotal, createdAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
        [uploadId, mesComp, anoComp, cpfProdutor, codigoProdutor, tipoCliente, nomeCliente, cpfCliente,
         proposta, inscricao, descricaoProduto, codigoProduto, upVenda, valorBase,
         parcelaComissionada, competenciaComissionada, parcelaFaturada, competenciaFaturada,
         valorAngariacao, valorComissaoTotal]
      );
      total++;
      totalComissao += valorComissaoTotal;
    } catch (e) {
      // ignora linha com erro
    }
  }

  await conn.execute(
    'UPDATE extrato_uploads SET totalRegistros=?, totalComissao=? WHERE id=?',
    [total, totalComissao, uploadId]
  );

  console.log(`  ✓ ${total} registros de comissão importados (Total: R$ ${totalComissao.toFixed(2)})`);
  return total;
}

// ============================================================
// IMPORTAR INADIMPLENTES
// ============================================================
async function importarInadimplentes() {
  console.log('\n=== Importando Inadimplentes ===');
  const wb = xlsx.readFile('/home/ubuntu/upload/BARCELLOSATRASADOS(1).xlsm', { cellDates: true });

  const abasMeses = [
    { aba: 'JANEIRO 2026', mes: 1, ano: 2026 },
    { aba: 'FEVEREIRO 2026', mes: 2, ano: 2026 },
  ];

  let totalGeral = 0;

  for (const { aba, mes, ano } of abasMeses) {
    if (!wb.SheetNames.includes(aba)) {
      console.log(`  ! Aba '${aba}' não encontrada`);
      continue;
    }

    const ws = wb.Sheets[aba];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });

    // Criar upload
    const [upResult] = await conn.execute(
      'INSERT INTO inadimplente_uploads (nomeArquivo, mes, ano, totalRegistros, totalValor, createdAt) VALUES (?,?,?,?,?,NOW())',
      [`BARCELLOSATRASADOS_${aba}.xlsx`, mes, ano, 0, 0]
    );
    const uploadId = upResult.insertId;

    let total = 0;
    let totalValor = 0;

    // Pular linha de header (linha 0)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;

      const nome = String(row[0]).substring(0, 255);
      if (!nome || nome.toLowerCase() === 'nome') continue;

      let cpf, tel1, tel2, mesParcela, parcela, formaPag, valor, valorTotalCli, produtos, status, historico;

      if (mes === 1) {
        // Janeiro: Nome | (vazio) | CPF | Tel1 | Tel2 | Mes_Parcela | Parcela | Forma_Pag | Valor | Soma Total | Data_Venc | Status | Historico
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
        // Fevereiro: Nome | CPF | Tel1 | Mes_Parcela | Parcela | Forma_Pag | Valor | Soma Total | Produtos | Status | Historico
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

      // Normalizar status
      const statusUpper = (status || 'PENDENTE').toUpperCase().trim();
      const statusNorm = ['PAGO', 'PENDENTE', 'EM NEGOCIAÇÃO', 'CANCELADO'].includes(statusUpper)
        ? statusUpper : 'PENDENTE';

      const valorFinal = valorTotalCli > 0 ? valorTotalCli : valor;

      try {
        await conn.execute(
          `INSERT INTO inadimplentes 
          (uploadId, mes, ano, nome, cpf, telefone1, telefone2, mesParcela, parcela,
           formaPagamento, valorTotal, produtos, status, historicoCobranca, createdAt)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
          [uploadId, mes, ano, nome, cpf, tel1, tel2, mesParcela, parcela,
           formaPag, valorFinal, produtos, statusNorm, historico]
        );
        total++;
        totalValor += valorFinal;
      } catch (e) {
        // ignora linha com erro
      }
    }

    await conn.execute(
      'UPDATE inadimplente_uploads SET totalRegistros=?, totalValor=? WHERE id=?',
      [total, totalValor, uploadId]
    );

    totalGeral += total;
    console.log(`  ✓ ${aba}: ${total} inadimplentes (Total: R$ ${totalValor.toFixed(2)})`);
  }

  return totalGeral;
}

// ============================================================
// EXECUTAR IMPORTAÇÃO
// ============================================================
try {
  const totalComissoes = await importarComissoes();
  const totalInadimplentes = await importarInadimplentes();

  console.log('\n' + '='.repeat(50));
  console.log('IMPORTAÇÃO CONCLUÍDA!');
  console.log(`  Comissões:     ${totalComissoes} registros`);
  console.log(`  Inadimplentes: ${totalInadimplentes} registros`);
  console.log('='.repeat(50));
} finally {
  await conn.end();
}

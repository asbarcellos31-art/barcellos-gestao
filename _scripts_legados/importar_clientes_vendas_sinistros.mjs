import mysql from 'mysql2/promise';
import xlsx from 'xlsx';

const DATABASE_URL = process.env.DATABASE_URL || '';
const m = DATABASE_URL.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
const [, user, pass, host, port, db] = m;

const conn = await mysql.createConnection({
  host, port: +port, user, password: pass, database: db,
  ssl: { rejectUnauthorized: true }
});
console.log('✓ Conectado ao banco de dados!\n');

function limparCpf(v) {
  if (!v) return null;
  return String(v).replace(/\D/g, '').substring(0, 20) || null;
}

function limparValor(v, maxVal = 9999999999999.99) {
  if (v == null || v === '') return null;
  const s = String(v).replace(/R\$|\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  // Limitar valores absurdos (fórmulas quebradas na planilha)
  if (Math.abs(n) > maxVal) return null;
  return n;
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

function limparStr(v, max = 255) {
  if (!v) return null;
  return String(v).trim().substring(0, max) || null;
}

// ============================================================
// 1. IMPORTAR CLIENTES (CARTEIRA_FINAL_PADRONIZADA)
// ============================================================
console.log('=== Importando Clientes ===');
await conn.execute('DELETE FROM clientes');

const wbClientes = xlsx.readFile('/home/ubuntu/upload/CARTEIRA_FINAL_PADRONIZADA(1).xlsx', { cellDates: true });
const wsBase = wbClientes.Sheets['Base'];
const rowsBase = xlsx.utils.sheet_to_json(wsBase, { header: 1, defval: null });

let batchClientes = [];
let totalClientes = 0;

for (let i = 2; i < rowsBase.length; i++) {
  const row = rowsBase[i];
  if (!row[0] && !row[1]) continue;
  const nome = limparStr(row[1]);
  if (!nome) continue;

  const cpf = limparCpf(row[0]);
  const produtos = limparStr(row[2], 1000);
  const vendedor = limparStr(row[3], 100);
  const status = limparStr(row[4], 20) || 'Ativo';
  const valorTotal = limparValor(row[5]);
  const valorComissao = limparValor(row[6]);
  const percentual = limparValor(row[7]);

  batchClientes.push([cpf, nome, produtos, vendedor, status, valorTotal, valorComissao, percentual]);

  if (batchClientes.length >= 300) {
    const ph = batchClientes.map(() => '(?,?,?,?,?,?,?,?,NOW(),NOW())').join(',');
    await conn.query(
      `INSERT IGNORE INTO clientes (cpf,nome,produtos,vendedor,status,valorTotalComissao,valorComissao,percentualComissao,createdAt,updatedAt) VALUES ${ph}`,
      batchClientes.flat()
    );
    totalClientes += batchClientes.length;
    process.stdout.write(`\r  Inseridos: ${totalClientes}...`);
    batchClientes = [];
  }
}

if (batchClientes.length > 0) {
  const ph = batchClientes.map(() => '(?,?,?,?,?,?,?,?,NOW(),NOW())').join(',');
  await conn.query(
    `INSERT IGNORE INTO clientes (cpf,nome,produtos,vendedor,status,valorTotalComissao,valorComissao,percentualComissao,createdAt,updatedAt) VALUES ${ph}`,
    batchClientes.flat()
  );
  totalClientes += batchClientes.length;
}
console.log(`\n  ✓ ${totalClientes} clientes importados`);

// ============================================================
// 2. IMPORTAR VENDAS (CONTROLEVENDAS2026)
// ============================================================
console.log('\n=== Importando Vendas ===');
await conn.execute('DELETE FROM vendas');

const wbVendas = xlsx.readFile('/home/ubuntu/upload/CONTROLEVENDAS2026.xlsx', { cellDates: true });
let totalVendas = 0;

const mesesVendas = [
  { aba: 'JANEIRO', mes: 1 },
  { aba: 'FEVEREIRO', mes: 2 },
  { aba: 'MARÇO', mes: 3 },
  { aba: 'ABRIL', mes: 4 },
  { aba: 'MAIO', mes: 5 },
  { aba: 'JUNHO', mes: 6 },
  { aba: 'JULHO', mes: 7 },
  { aba: 'AGOSTO', mes: 8 },
  { aba: 'SETEMBRO', mes: 9 },
  { aba: 'OUTUBRO', mes: 10 },
  { aba: 'NOVEMBRO', mes: 11 },
  { aba: 'DEZEMBRO', mes: 12 },
];

for (const { aba, mes } of mesesVendas) {
  // Tentar encontrar aba com variações de nome
  const sheetName = wbVendas.SheetNames.find(s =>
    s.toUpperCase().includes(aba) || aba.includes(s.toUpperCase().split(' ')[0])
  );
  if (!sheetName) continue;

  const ws = wbVendas.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Encontrar linha de header (procurar linha com "NOME" ou "CLIENTE")
  let headerRow = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const r = rows[i];
    if (r && r.some(c => c && String(c).toUpperCase().includes('NOME'))) {
      headerRow = i;
      break;
    }
  }

  let batchVendas = [];
  let countMes = 0;

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    const nome = limparStr(row[0]);
    if (!nome || nome.toUpperCase() === 'NOME' || nome.toUpperCase() === 'TOTAL') continue;

    const cpf = limparCpf(row[1]);
    const produto = limparStr(row[2]);
    const corretor = limparStr(row[3]);
    const dataVenda = parseData(row[4]);
    const valorPremio = limparValor(row[5]);
    const valorComissao = limparValor(row[6]);
    const percentual = limparValor(row[7]);
    const status = limparStr(row[8]) || 'ATIVA';
    const proposta = limparStr(row[9]);

    batchVendas.push([mes, 2026, cpf, nome, produto, corretor, dataVenda,
      valorPremio, valorComissao, percentual, status, proposta]);

    if (batchVendas.length >= 200) {
      const ph = batchVendas.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())').join(',');
      await conn.query(
        `INSERT INTO vendas (mes,ano,cpfCliente,nomeCliente,produto,corretor,dataVenda,
         valorPremio,valorComissao,percentualComissao,status,proposta,createdAt,updatedAt) VALUES ${ph}`,
        batchVendas.flat()
      );
      countMes += batchVendas.length;
      batchVendas = [];
    }
  }

  if (batchVendas.length > 0) {
    const ph = batchVendas.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())').join(',');
    await conn.query(
      `INSERT INTO vendas (mes,ano,cpfCliente,nomeCliente,produto,corretor,dataVenda,
       valorPremio,valorComissao,percentualComissao,status,proposta,createdAt,updatedAt) VALUES ${ph}`,
      batchVendas.flat()
    );
    countMes += batchVendas.length;
  }

  if (countMes > 0) {
    console.log(`  ✓ ${aba}: ${countMes} vendas`);
    totalVendas += countMes;
  }
}
console.log(`  Total: ${totalVendas} vendas importadas`);

// ============================================================
// 3. IMPORTAR SINISTROS (CRMSINISTROSBARCELLOS)
// ============================================================
console.log('\n=== Importando Sinistros ===');
await conn.execute('DELETE FROM sinistros');

const wbSinistros = xlsx.readFile('/home/ubuntu/upload/CRMSINISTROSBARCELLOS.xlsx', { cellDates: true });
// Aba correta é 'Base de Dados'
const wsSinistros = wbSinistros.Sheets['Base de Dados'];
const rowsSinistros = xlsx.utils.sheet_to_json(wsSinistros, { header: 1, defval: null });

// Header está na linha 1 (índice 0)
// Colunas: 0:Segurado, 1:CPF, 2:Protocolo, 3:DataProtocolo, 4:Produto,
//          5:ValorCapital, 6:ValorRecebido, 7:Status, 8:DataRecebimento,
//          9:Beneficiário1, 10:Tel1, 11:Beneficiário2, 12:Tel2
console.log(`  Total de linhas: ${rowsSinistros.length - 1}`);

let batchSinistros = [];
let totalSinistros = 0;

for (let i = 1; i < rowsSinistros.length; i++) {
  const row = rowsSinistros[i];
  if (!row || !row[0]) continue;

  const nomeSegurado = limparStr(row[0]);
  if (!nomeSegurado) continue;

  // Beneficiário: concatenar os disponíveis
  const benefs = [row[9], row[11], row[13]].filter(b => b && String(b).trim() !== 'SEM BENEFICIARIO').map(b => limparStr(b, 100)).filter(Boolean);
  const beneficiario = benefs.length > 0 ? benefs[0] : null;

  batchSinistros.push([
    limparStr(row[2], 50),              // protocolo
    limparCpf(row[1]),                  // cpfSegurado
    nomeSegurado,                       // nomeSegurado
    limparStr(row[4]),                  // produto
    parseData(row[3]),                  // dataOcorrencia (data do protocolo)
    parseData(row[8]),                  // dataAbertura (data recebimento)
    limparValor(row[5]),                // valorCapital
    limparValor(row[6]),                // valorRecebido
    limparStr(row[7], 50) || 'ABERTO', // status
    null,                               // tipoBeneficio
    beneficiario,                       // beneficiario
    null,                               // cpfBeneficiario
    null,                               // corretor
  ]);

  if (batchSinistros.length >= 200) {
    const ph = batchSinistros.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())').join(',');
    await conn.query(
      `INSERT INTO sinistros (protocolo,cpfSegurado,nomeSegurado,produto,dataOcorrencia,dataAbertura,
       valorCapital,valorRecebido,status,tipoBeneficio,beneficiario,cpfBeneficiario,corretor,
       createdAt,updatedAt) VALUES ${ph}`,
      batchSinistros.flat()
    );
    totalSinistros += batchSinistros.length;
    process.stdout.write(`\r  Inseridos: ${totalSinistros}...`);
    batchSinistros = [];
  }
}

if (batchSinistros.length > 0) {
  const ph = batchSinistros.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())').join(',');
  await conn.query(
    `INSERT INTO sinistros (protocolo,cpfSegurado,nomeSegurado,produto,dataOcorrencia,dataAbertura,
     valorCapital,valorRecebido,status,tipoBeneficio,beneficiario,cpfBeneficiario,corretor,
     createdAt,updatedAt) VALUES ${ph}`,
    batchSinistros.flat()
  );
  totalSinistros += batchSinistros.length;
}
console.log(`\n  ✓ ${totalSinistros} sinistros importados`);

// ============================================================
// RESUMO FINAL
// ============================================================
console.log('\n' + '='.repeat(55));
console.log('IMPORTAÇÃO COMPLETA!');
console.log(`  Clientes:   ${totalClientes} registros`);
console.log(`  Vendas:     ${totalVendas} registros`);
console.log(`  Sinistros:  ${totalSinistros} registros`);
console.log('='.repeat(55));

await conn.end();

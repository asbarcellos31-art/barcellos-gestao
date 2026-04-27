import { createRequire } from 'module';
import mysql from 'mysql2/promise';

const require = createRequire(import.meta.url);
const XLSX = require('./node_modules/xlsx');

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log('=== REIMPORTANDO EXTRATO DE COMISSÃO ===\n');

// 1. Ler o arquivo Excel
const wb = XLSX.readFile('/home/ubuntu/upload/extratocomissao.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, {header: 1, defval: null});

// Índices das colunas (baseado no cabeçalho analisado):
// 0: CPF/CNPJ do Produtor
// 1: Código do produtor
// 2: Tipo de cliente
// 3: Nome/Razão social (cliente)
// 4: CPF/CNPJ do cliente
// 5: Proposta
// 6: UP da venda
// 7: Nº Inscrição
// 8: Descrição Produto
// 9: Código do produto
// 10: Valor base
// 11: Parcela comissionada
// 12: Competência comissionada
// 13: Parcela faturada
// 14: Competência faturada
// 15: Descrição Provisão
// 16: Tipo de lançamento
// 17: Data prevista
// 18: Data de efetivação
// 19: Valor Angariação
// 20: % Angariação
// 21: Valor Comissão
// 22: % Comissão
// 23: Valor estorno
// 24: % estorno
// 25: Valor incentivo
// 26: % incentivo
// 27: Valor bonificação
// 28: % bonificação
// 29: Código da Verba
// 30: Nome da Verba

const rows = data.slice(1).filter(r => r && r[4]); // pular cabeçalho e linhas sem CPF
console.log(`Total linhas com CPF: ${rows.length}`);

// 2. Extrair produtos únicos
const produtosMap = new Map();
rows.forEach(r => {
  const codigo = r[9] ? String(r[9]).trim() : null;
  const descricao = r[8] ? String(r[8]).trim() : null;
  if (codigo && descricao && !produtosMap.has(codigo)) {
    produtosMap.set(codigo, descricao);
  }
});
console.log(`Produtos únicos encontrados: ${produtosMap.size}`);

// 3. Inserir/atualizar produtos no banco
let produtosInseridos = 0;
for (const [codigo, descricao] of produtosMap.entries()) {
  await conn.query(
    `INSERT INTO produtos (codigo, descricao) VALUES (?, ?) ON DUPLICATE KEY UPDATE descricao = VALUES(descricao)`,
    [codigo, descricao]
  );
  produtosInseridos++;
}
console.log(`Produtos inseridos/atualizados: ${produtosInseridos}`);

// 4. Buscar mapa de produtos (codigo -> id)
const [prodRows] = await conn.query('SELECT id, codigo FROM produtos');
const prodIdMap = new Map(prodRows.map(p => [p.codigo, p.id]));

// 5. Atualizar os campos valorBase, valorComissao, pctComissao, valorIncentivo, pctIncentivo no extrato_comissao
// Primeiro, verificar se existe um uploadId para Jan/2026
const [uploads] = await conn.query('SELECT id, mes, ano FROM extrato_uploads ORDER BY id DESC LIMIT 5');
console.log('\nUploads existentes:', uploads);

// Pegar o upload mais recente (ou criar um novo)
let uploadId;
if (uploads.length > 0) {
  uploadId = uploads[0].id;
  console.log(`Usando uploadId: ${uploadId}`);
} else {
  const [result] = await conn.query(
    `INSERT INTO extrato_uploads (nomeArquivo, mes, ano, totalRegistros) VALUES (?, ?, ?, ?)`,
    ['extratocomissao.xlsx', 1, 2026, rows.length]
  );
  uploadId = result.insertId;
  console.log(`Novo uploadId criado: ${uploadId}`);
}

// 6. Limpar extrato atual e reinserir com dados corretos
console.log('\nLimpando extrato atual...');
await conn.query('DELETE FROM extrato_comissao WHERE uploadId = ?', [uploadId]);

// 7. Agrupar linhas por CPF do cliente para unificar
// Cada linha é uma combinação de CPF + produto (pode ter comissão OU incentivo)
// Precisamos somar tudo por CPF
const cpfData = new Map();

rows.forEach(r => {
  const cpf = String(r[4]).trim();
  const nome = r[3] ? String(r[3]).trim() : '';
  const codigoProduto = r[9] ? String(r[9]).trim() : null;
  const descricaoProduto = r[8] ? String(r[8]).trim() : null;
  const valorBase = parseFloat(r[10]) || 0;
  const valorComissao = parseFloat(r[21]) || 0;
  const pctComissao = parseFloat(r[22]) || 0;
  const valorIncentivo = parseFloat(r[25]) || 0;
  const pctIncentivo = parseFloat(r[26]) || 0;

  if (!cpfData.has(cpf)) {
    cpfData.set(cpf, {
      cpf,
      nome,
      valorBase: 0,
      valorComissao: 0,
      pctComissao: 0,
      valorIncentivo: 0,
      pctIncentivo: 0,
      produtos: new Set(),
      linhas: 0,
    });
  }

  const entry = cpfData.get(cpf);
  entry.valorBase += valorBase;
  entry.valorComissao += valorComissao;
  entry.valorIncentivo += valorIncentivo;
  // Para % comissão: usar a média ponderada (ou o valor mais alto)
  if (pctComissao > entry.pctComissao) entry.pctComissao = pctComissao;
  if (pctIncentivo > entry.pctIncentivo) entry.pctIncentivo = pctIncentivo;
  if (codigoProduto) entry.produtos.add(codigoProduto);
  entry.linhas++;
});

console.log(`CPFs únicos após agrupamento: ${cpfData.size}`);

// 8. Inserir linhas unificadas no extrato_comissao
let inseridos = 0;
for (const [cpf, entry] of cpfData.entries()) {
  const valorComissaoTotal = entry.valorComissao + entry.valorIncentivo;
  // % total = % comissão + (% comissão × % incentivo)
  const pctComissaoTotal = entry.pctComissao + (entry.pctComissao * entry.pctIncentivo);

  const produtosArr = [...entry.produtos];
  const codigoProduto = produtosArr[0] || null;
  const descricaoProduto = codigoProduto ? produtosMap.get(codigoProduto) || null : null;

  await conn.query(
    `INSERT INTO extrato_comissao 
     (uploadId, mes, ano, cpfCliente, nomeCliente, codigoProduto, descricaoProduto,
      valorBase, valorComissao, pctComissao, valorIncentivo, pctIncentivo, valorComissaoTotal, pctComissaoTotal)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uploadId, 1, 2026,
      cpf, entry.nome,
      codigoProduto, descricaoProduto,
      entry.valorBase.toFixed(2),
      entry.valorComissao.toFixed(2),
      entry.pctComissao.toFixed(4),
      entry.valorIncentivo.toFixed(2),
      entry.pctIncentivo.toFixed(4),
      valorComissaoTotal.toFixed(2),
      pctComissaoTotal.toFixed(4),
    ]
  );
  inseridos++;
}
console.log(`Linhas inseridas no extrato_comissao: ${inseridos}`);

// 9. Atualizar contribuição na tabela clientes (valorBase do extrato)
console.log('\nAtualizando contribuição na Base de Clientes...');
let clientesAtualizados = 0;
let clientesNaoEncontrados = 0;

for (const [cpf, entry] of cpfData.entries()) {
  // Normalizar CPF (remover pontos, traços, etc.)
  const cpfNorm = cpf.replace(/\D/g, '');
  
  // Tentar atualizar pelo CPF normalizado
  const [result] = await conn.query(
    `UPDATE clientes SET contribuicao = ? WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), '/', '') = ?`,
    [entry.valorBase.toFixed(2), cpfNorm]
  );
  
  if (result.affectedRows > 0) {
    clientesAtualizados++;
  } else {
    clientesNaoEncontrados++;
  }
}
console.log(`Clientes com contribuição atualizada: ${clientesAtualizados}`);
console.log(`CPFs do extrato não encontrados na base: ${clientesNaoEncontrados}`);

// 10. Vincular produtos aos clientes na tabela cliente_produtos
console.log('\nVinculando produtos aos clientes...');
let vinculosInseridos = 0;

// Limpar vínculos antigos
await conn.query('DELETE FROM cliente_produtos');

for (const [cpf, entry] of cpfData.entries()) {
  const cpfNorm = cpf.replace(/\D/g, '');
  
  // Buscar cliente pelo CPF
  const [clienteRows] = await conn.query(
    `SELECT id FROM clientes WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), '/', '') = ?`,
    [cpfNorm]
  );
  
  if (clienteRows.length === 0) continue;
  const clienteId = clienteRows[0].id;
  
  // Inserir vínculos com cada produto
  for (const codigoProd of entry.produtos) {
    const produtoId = prodIdMap.get(codigoProd);
    if (!produtoId) continue;
    
    await conn.query(
      `INSERT IGNORE INTO cliente_produtos (clienteId, produtoId) VALUES (?, ?)`,
      [clienteId, produtoId]
    );
    vinculosInseridos++;
  }
}
console.log(`Vínculos cliente-produto inseridos: ${vinculosInseridos}`);

// 11. Verificar resultado final
const [totalExtrato] = await conn.query('SELECT COUNT(*) as total, SUM(valorComissaoTotal) as totalComissao FROM extrato_comissao WHERE uploadId = ?', [uploadId]);
console.log('\n=== RESULTADO FINAL ===');
console.log(`Total registros no extrato: ${totalExtrato[0].total}`);
console.log(`Total comissão: R$ ${parseFloat(totalExtrato[0].totalComissao || 0).toFixed(2)}`);

const [totalProdutos] = await conn.query('SELECT COUNT(*) as total FROM produtos');
console.log(`Total produtos cadastrados: ${totalProdutos[0].total}`);

const [totalVinculos] = await conn.query('SELECT COUNT(*) as total FROM cliente_produtos');
console.log(`Total vínculos cliente-produto: ${totalVinculos[0].total}`);

const [clientesComContrib] = await conn.query('SELECT COUNT(*) as total FROM clientes WHERE contribuicao IS NOT NULL AND contribuicao > 0');
console.log(`Clientes com contribuição atualizada: ${clientesComContrib[0].total}`);

await conn.end();
console.log('\nConcluído!');

/**
 * Script de enriquecimento da base de clientes
 * Fontes:
 *   1. CSV (faturas): telefone, email, contribuição
 *   2. XLSX (cadastro): data nascimento, endereço, bairro, cidade, cep, celular, email
 * Regras:
 *   - Atualiza campos vazios ou nulos no banco
 *   - Contribuição: usa soma do CSV; não zera se já tiver valor e CSV for 0
 *   - Clientes novos (presentes nos arquivos mas ausentes no banco): cadastra automaticamente
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const XLSX = require('xlsx');
const fs = require('fs');
const csv = require('csv-parse/sync');

const DB_URL = process.env.DATABASE_URL;

function cleanCpf(v) {
  return String(v || '').replace(/[^0-9]/g, '').trim();
}

function parseValorBR(v) {
  try {
    return parseFloat(String(v || '0').trim().replace(/\./g, '').replace(',', '.')) || 0;
  } catch { return 0; }
}

function formatDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  // DD/MM/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Excel serial number
  const n = Number(s);
  if (!isNaN(n) && n > 10000) {
    const d = XLSX.SSF.parse_date_code(n);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  return null;
}

function normalizeTel(v) {
  if (!v) return '';
  let s = String(v).replace(/[^0-9+]/g, '');
  // Remove prefixo 55 se tiver mais de 11 dígitos
  if (s.startsWith('55') && s.length > 11) s = s.slice(2);
  return s;
}

// ─── 1. Ler CSV ───────────────────────────────────────────────────────────────
console.log('\n📄 Lendo CSV de faturas...');
const csvRaw = fs.readFileSync('/home/ubuntu/upload/9a6166b72c8b4c25a28e24eb447fefe5.csv');
const csvRows = csv.parse(csvRaw, {
  delimiter: ';',
  columns: true,
  bom: true,
  skip_empty_lines: true,
  relax_column_count: true,
});

const csvPorCpf = new Map();
for (const r of csvRows) {
  const cpf = cleanCpf(r['CPF/CNPJ']);
  if (!cpf || cpf.length < 8) continue;
  if (!csvPorCpf.has(cpf)) {
    csvPorCpf.set(cpf, {
      nome: (r['Nome Cliente'] || '').trim(),
      tel: normalizeTel(r['Telefone']),
      email: (r['E-mail'] || '').trim(),
      contribuicao: 0,
    });
  }
  const entry = csvPorCpf.get(cpf);
  entry.contribuicao += parseValorBR(r['Premio com IOF Inscricao']);
  if (!entry.tel && r['Telefone']) entry.tel = normalizeTel(r['Telefone']);
  if (!entry.email && r['E-mail']) entry.email = (r['E-mail'] || '').trim();
}
console.log(`  → ${csvPorCpf.size} CPFs únicos no CSV`);
const totalContribCsv = [...csvPorCpf.values()].reduce((s, v) => s + v.contribuicao, 0);
console.log(`  → Contribuição total CSV: R$ ${totalContribCsv.toFixed(2)}`);

// ─── 2. Ler XLSX ──────────────────────────────────────────────────────────────
console.log('\n📊 Lendo XLSX de cadastro...');
const wb = XLSX.readFile('/home/ubuntu/upload/undefined.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const xlsxRows = XLSX.utils.sheet_to_json(ws, { defval: '' });

const xlsxPorCpf = new Map();
for (const r of xlsxRows) {
  const cpf = cleanCpf(r['CPF/CNPJ']);
  if (!cpf || cpf.length < 8) continue;
  if (xlsxPorCpf.has(cpf)) continue; // pegar só a primeira ocorrência
  
  const ddd = String(r['DDD'] || '').trim();
  const fone = String(r['Número fone'] || '').trim();
  const dddCel = String(r['DDD celular'] || '').trim();
  const cel = String(r['Número celular'] || '').trim();
  
  // Montar telefone: DDD + número
  let telMontado = '';
  if (fone) {
    const foneClean = fone.replace(/[^0-9]/g, '');
    telMontado = ddd ? `(${ddd})${foneClean}` : foneClean;
  }
  let celMontado = '';
  if (cel) {
    const celClean = cel.replace(/[^0-9]/g, '');
    celMontado = dddCel ? `(${dddCel})${celClean}` : celClean;
  }
  
  // Endereço completo
  const end = [r['Endereço'], r['Número'], r['Complemento']].filter(Boolean).join(', ');
  const cidade = String(r['Cidade'] || '').trim();
  const bairro = String(r['Bairro'] || '').trim();
  const cep = String(r['Cep'] || '').trim().replace(/[^0-9-]/g, '');
  
  // Vendedor: normalizar
  let vendedor = String(r['Vendedor'] || '').trim().toUpperCase();
  if (vendedor.includes('ELISIA')) vendedor = 'ELISIA';
  else if (vendedor.includes('FERNANDA')) vendedor = 'FERNANDA';
  else if (vendedor.includes('NAYARA')) vendedor = 'NAYARA';
  else if (vendedor.includes('ANA PAULA')) vendedor = 'ANA PAULA';
  
  xlsxPorCpf.set(cpf, {
    nome: String(r['Cliente'] || '').trim(),
    dataNascimento: formatDate(r['Data Nascimento']),
    endereco: end,
    bairro,
    cidade,
    cep,
    email: String(r['E-mail'] || '').trim(),
    telefone: telMontado,
    celular: celMontado,
    vendedor,
  });
}
console.log(`  → ${xlsxPorCpf.size} CPFs únicos no XLSX`);

// ─── 3. Conectar ao banco ─────────────────────────────────────────────────────
console.log('\n🔌 Conectando ao banco...');
const conn = await mysql.createConnection(DB_URL);

const [bancRows] = await conn.query('SELECT id, cpf, nome, telefone, email, contribuicao, dataNascimento, endereco, bairro, cidade, cep, celular, vendedor, status FROM clientes');
const bancoPorCpf = new Map();
for (const r of bancRows) {
  const cpf = cleanCpf(r.cpf);
  if (cpf) bancoPorCpf.set(cpf, r);
}
console.log(`  → ${bancoPorCpf.size} clientes no banco`);

// ─── 4. Atualizar clientes existentes ─────────────────────────────────────────
console.log('\n🔄 Atualizando clientes existentes...');
let atualizados = 0;
let contribuicaoAtualizada = 0;

for (const [cpf, banco] of bancoPorCpf) {
  const csv = csvPorCpf.get(cpf);
  const xlsx = xlsxPorCpf.get(cpf);
  
  const updates = {};
  
  // Do CSV: telefone, email, contribuição
  if (csv) {
    if (csv.tel && !banco.telefone) updates.telefone = csv.tel;
    if (csv.email && !banco.email) updates.email = csv.email;
    // Contribuição: atualiza se CSV > 0 (nunca zera)
    if (csv.contribuicao > 0) {
      updates.contribuicao = csv.contribuicao.toFixed(2);
      contribuicaoAtualizada++;
    }
  }
  
  // Do XLSX: nascimento, endereço, bairro, cidade, cep, celular, email (se ainda vazio)
  if (xlsx) {
    if (xlsx.dataNascimento && !banco.dataNascimento) updates.dataNascimento = xlsx.dataNascimento;
    if (xlsx.endereco && !banco.endereco) updates.endereco = xlsx.endereco;
    if (xlsx.bairro && !banco.bairro) updates.bairro = xlsx.bairro;
    if (xlsx.cidade && !banco.cidade) updates.cidade = xlsx.cidade;
    if (xlsx.cep && !banco.cep) updates.cep = xlsx.cep;
    if (xlsx.celular && !banco.celular) updates.celular = xlsx.celular;
    // Telefone do XLSX se ainda vazio
    if (xlsx.telefone && !banco.telefone && !updates.telefone) updates.telefone = xlsx.telefone;
    // Email do XLSX se ainda vazio
    if (xlsx.email && !banco.email && !updates.email) updates.email = xlsx.email;
  }
  
  if (Object.keys(updates).length > 0) {
    const sets = Object.keys(updates).map(k => `\`${k}\` = ?`).join(', ');
    const vals = [...Object.values(updates), banco.id];
    await conn.query(`UPDATE clientes SET ${sets} WHERE id = ?`, vals);
    atualizados++;
  }
}
console.log(`  → ${atualizados} clientes atualizados (${contribuicaoAtualizada} com contribuição)`);

// ─── 5. Cadastrar clientes novos ──────────────────────────────────────────────
console.log('\n➕ Verificando clientes novos...');
const novosClientes = [];

// Fontes de novos clientes: XLSX (mais completo) + CSV
const todosCpfsNovos = new Set([...xlsxPorCpf.keys(), ...csvPorCpf.keys()]);

for (const cpf of todosCpfsNovos) {
  if (bancoPorCpf.has(cpf)) continue; // já existe
  
  const xlsx = xlsxPorCpf.get(cpf);
  const csv = csvPorCpf.get(cpf);
  
  const nome = xlsx?.nome || csv?.nome || '';
  if (!nome) continue;
  
  const novoCliente = {
    cpf,
    nome,
    status: 'Ativo',
    vendedor: xlsx?.vendedor || '',
    dataNascimento: xlsx?.dataNascimento || null,
    endereco: xlsx?.endereco || '',
    bairro: xlsx?.bairro || '',
    cidade: xlsx?.cidade || '',
    cep: xlsx?.cep || '',
    telefone: xlsx?.telefone || csv?.tel || '',
    celular: xlsx?.celular || '',
    email: xlsx?.email || csv?.email || '',
    contribuicao: csv?.contribuicao > 0 ? csv.contribuicao.toFixed(2) : null,
  };
  
  novosClientes.push(novoCliente);
}

console.log(`  → ${novosClientes.length} clientes novos para cadastrar`);

let cadastrados = 0;
const inventario = [];

for (const c of novosClientes) {
  try {
    const [res] = await conn.query(
      `INSERT INTO clientes (cpf, nome, status, vendedor, dataNascimento, endereco, bairro, cidade, cep, telefone, celular, email, contribuicao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.cpf, c.nome, c.status, c.vendedor || null, c.dataNascimento, c.endereco || null, c.bairro || null, c.cidade || null, c.cep || null, c.telefone || null, c.celular || null, c.email || null, c.contribuicao]
    );
    cadastrados++;
    inventario.push({ ...c, id: res.insertId });
  } catch (e) {
    console.error(`Erro ao cadastrar ${c.nome} (${c.cpf}):`, e.message);
  }
}
console.log(`  → ${cadastrados} clientes cadastrados com sucesso`);

// ─── 6. Resumo final ──────────────────────────────────────────────────────────
const [totFinal] = await conn.query('SELECT SUM(contribuicao) as total, COUNT(*) as qtd FROM clientes WHERE contribuicao > 0');
const [totalGeral] = await conn.query('SELECT COUNT(*) as total FROM clientes');
console.log('\n✅ RESUMO FINAL:');
console.log(`  Total clientes no banco: ${totalGeral[0].total}`);
console.log(`  Clientes com contribuição: ${totFinal[0].qtd}`);
console.log(`  Contribuição total: R$ ${Number(totFinal[0].total).toFixed(2)}`);
console.log(`  Clientes atualizados: ${atualizados}`);
console.log(`  Clientes novos cadastrados: ${cadastrados}`);

// Salvar inventário de novos clientes
fs.writeFileSync('/home/ubuntu/contas_a_pagar/inventario_novos_clientes.json', JSON.stringify(inventario, null, 2));
console.log(`\n📋 Inventário salvo em inventario_novos_clientes.json`);

await conn.end();

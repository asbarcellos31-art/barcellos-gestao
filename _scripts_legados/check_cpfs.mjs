import mysql from 'mysql2/promise';
import fs from 'fs';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// CPFs da base (sem formatação)
const [rows] = await conn.execute('SELECT REPLACE(REPLACE(REPLACE(cpf, ".", ""), "-", ""), "/", "") as cpf_norm, vendedor FROM clientes WHERE cpf IS NOT NULL AND cpf != ""');
const baseCpfs = new Map(rows.map(r => [r.cpf_norm, r.vendedor]));
console.log('CPFs na base:', baseCpfs.size);

// CPFs do extrato
const content = fs.readFileSync('/home/ubuntu/upload/11a2aa0ebf434b90baf69b3980a48f6e.csv', 'utf8').replace(/^\uFEFF/, '');
const lines = content.split('\n');
const headers = lines[0].split(';').map(h => h.trim());
const iCpf = headers.findIndex(h => h.includes('CPF/CNPJ do cliente'));
const iNome = headers.findIndex(h => h.includes('Nome'));

console.log('iCpf:', iCpf, 'iNome:', iNome);

const extratoCpfs = new Map();
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(';');
  if (!cols[iCpf]) continue;
  const cpf = cols[iCpf].trim().replace(/\D/g, '');
  const nome = (cols[iNome] || '').trim();
  if (cpf && !extratoCpfs.has(cpf)) extratoCpfs.set(cpf, nome);
}
console.log('CPFs únicos no extrato:', extratoCpfs.size);

// Cruzar
let encontrados = 0, semCorretor = 0;
const semCorretorExemplos = [];
for (const [cpf, nome] of extratoCpfs) {
  if (baseCpfs.has(cpf)) {
    encontrados++;
  } else {
    semCorretor++;
    if (semCorretorExemplos.length < 10) semCorretorExemplos.push({cpf, nome});
  }
}
console.log('Encontrados na base:', encontrados);
console.log('Sem corretor (não na base):', semCorretor);
console.log('Exemplos sem corretor:', JSON.stringify(semCorretorExemplos, null, 2));

// Verificar CPFs com zeros à esquerda - problema de formatação
console.log('\nVerificando CPFs com zeros à esquerda no extrato:');
let comZero = 0;
for (const [cpf] of extratoCpfs) {
  if (cpf.length < 11) comZero++;
}
console.log('CPFs com menos de 11 dígitos no extrato:', comZero);

// Verificar se com padding de zeros ficam na base
let encontradosComPad = 0;
for (const [cpf, nome] of extratoCpfs) {
  if (!baseCpfs.has(cpf)) {
    const cpfPad = cpf.padStart(11, '0');
    if (baseCpfs.has(cpfPad)) {
      encontradosComPad++;
    }
  }
}
console.log('Encontrados com padding de zeros:', encontradosComPad);

await conn.end();

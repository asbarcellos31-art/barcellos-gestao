import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/contas_a_pagar/.env' });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ─── Histórico Anual 2015-2025 ────────────────────────────────────────────────
const historico = [
  { ano: 2015, receitaTotal: 850000, carteira: 820000, angariacao: 30000 },
  { ano: 2016, receitaTotal: 920000, carteira: 888000, angariacao: 32000 },
  { ano: 2017, receitaTotal: 995000, carteira: 960000, angariacao: 35000 },
  { ano: 2018, receitaTotal: 1050000, carteira: 1012000, angariacao: 38000 },
  { ano: 2019, receitaTotal: 1110000, carteira: 1070000, angariacao: 40000 },
  { ano: 2020, receitaTotal: 1172705, carteira: 1135782, angariacao: 36923 },
  { ano: 2021, receitaTotal: 1304253, carteira: 1267900, angariacao: 36354 },
  { ano: 2022, receitaTotal: 1420000, carteira: 1380000, angariacao: 40000 },
  { ano: 2023, receitaTotal: 1550000, carteira: 1505000, angariacao: 45000 },
  { ano: 2024, receitaTotal: 1700000, carteira: 1650000, angariacao: 50000 },
  { ano: 2025, receitaTotal: 2080000, carteira: 2010000, angariacao: 70000 },
];

await conn.execute('DELETE FROM historico_anual');
for (const h of historico) {
  await conn.execute(
    'INSERT INTO historico_anual (ano, receitaTotal, carteira, angariacao) VALUES (?,?,?,?)',
    [h.ano, h.receitaTotal, h.carteira, h.angariacao]
  );
}
console.log('Histórico anual inserido:', historico.length, 'registros');

// ─── DRE Janeiro 2026 ─────────────────────────────────────────────────────────
await conn.execute('DELETE FROM dre_lancamentos WHERE mes=1 AND ano=2026');
const dreJan = [
  // RECEITAS
  { tipo: 'RECEITA', categoria: 'Comissões Total', subcategoria: null, valor: 167315 },
  { tipo: 'RECEITA', categoria: 'Comissões Total', subcategoria: 'Angariação', valor: 4200 },
  { tipo: 'RECEITA', categoria: 'Comissões Total', subcategoria: 'Carteira', valor: 163115 },
  // DESPESAS
  { tipo: 'DESPESA', categoria: 'Salários e Remunerações', subcategoria: null, valor: 27500 },
  { tipo: 'DESPESA', categoria: 'Comissões Pagas', subcategoria: null, valor: 11369.96 },
  { tipo: 'DESPESA', categoria: 'Contador', subcategoria: null, valor: 356 },
  { tipo: 'DESPESA', categoria: 'Combustível', subcategoria: null, valor: 700 },
  { tipo: 'DESPESA', categoria: 'Alimentação', subcategoria: null, valor: 1980 },
  { tipo: 'DESPESA', categoria: 'Material Escritório', subcategoria: null, valor: 1010 },
  { tipo: 'DESPESA', categoria: 'Outras Despesas', subcategoria: null, valor: 1010 },
  { tipo: 'DESPESA', categoria: 'Cartão de Crédito', subcategoria: null, valor: 0 },
  { tipo: 'DESPESA', categoria: 'Marketing', subcategoria: null, valor: 0 },
  { tipo: 'DESPESA', categoria: 'Luz', subcategoria: null, valor: 0 },
  { tipo: 'DESPESA', categoria: 'Condomínio', subcategoria: null, valor: 0 },
  { tipo: 'DESPESA', categoria: 'Internet', subcategoria: null, valor: 0 },
];
for (const d of dreJan) {
  await conn.execute(
    'INSERT INTO dre_lancamentos (mes, ano, tipo, categoria, subcategoria, valor) VALUES (?,?,?,?,?,?)',
    [1, 2026, d.tipo, d.categoria, d.subcategoria, d.valor]
  );
}
console.log('DRE Janeiro 2026 inserido:', dreJan.length, 'registros');

// ─── Metas 2026 ───────────────────────────────────────────────────────────────
await conn.execute('DELETE FROM metas_anuais WHERE ano=2026');
// Meta anual (mes=0)
await conn.execute(
  'INSERT INTO metas_anuais (ano, mes, metaReceita, metaCarteira, metaAngariacao, metaLucro) VALUES (?,?,?,?,?,?)',
  [2026, 0, 2500000, 2400000, 100000, 500000]
);
// Metas mensais (mes=1..12) - R$208.333/mês e R$200.000 carteira
const meses = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
for (let m = 1; m <= 12; m++) {
  await conn.execute(
    'INSERT INTO metas_anuais (ano, mes, metaReceita, metaCarteira, metaAngariacao, metaLucro) VALUES (?,?,?,?,?,?)',
    [2026, m, 208333, 200000, 8333, 41667]
  );
}
console.log('Metas 2026 inseridas');

await conn.end();
console.log('Seed concluído!');

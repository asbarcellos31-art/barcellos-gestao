import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('./node_modules/xlsx');

const wb = XLSX.readFile('/home/ubuntu/upload/extratocomissao.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, {header: 1, defval: null});

console.log('Total linhas:', data.length);
console.log('Cabeçalho:', JSON.stringify(data[0]));

// Índices corretos:
// 0: CPF/CNPJ Produtor, 3: Nome/Razão Social, 4: CPF/CNPJ Cliente
// 8: Descrição Produto, 9: Código Produto, 10: Valor Base
// 21: Valor Comissão, 22: % Comissão
// 25: Valor Incentivo, 26: % Incentivo

// Verificar CPFs duplicados
const cpfMap = new Map();
data.slice(1).forEach(r => {
  if (!r || !r[4]) return;
  const cpf = String(r[4]);
  if (!cpfMap.has(cpf)) cpfMap.set(cpf, []);
  cpfMap.get(cpf).push(r);
});

const dups = [...cpfMap.entries()].filter(([k, v]) => v.length > 1);
console.log('\nCPFs únicos:', cpfMap.size);
console.log('CPFs com múltiplas linhas:', dups.length);

if (dups.length > 0) {
  const [cpf, rows] = dups[0];
  console.log('\nExemplo CPF', cpf, ':');
  rows.forEach(r => {
    console.log('  Nome:', r[3], '| Produto:', r[8], '| ValBase:', r[10], '| ValCom:', r[21], '| %Com:', r[22], '| ValInc:', r[25], '| %Inc:', r[26]);
  });
}

// Verificar linhas com incentivo > 0
const withIncentivo = data.slice(1).filter(r => r && r[25] && parseFloat(r[25]) > 0);
console.log('\nLinhas com incentivo > 0:', withIncentivo.length);

// Verificar linhas com comissão = 0 mas incentivo > 0
const onlyIncentivo = data.slice(1).filter(r => r && r[25] && parseFloat(r[25]) > 0 && (!r[21] || parseFloat(r[21]) === 0));
console.log('Linhas com APENAS incentivo (sem comissão):', onlyIncentivo.length);
if (onlyIncentivo.length > 0) {
  console.log('Exemplo:', JSON.stringify(onlyIncentivo[0]));
}

// Verificar o corretorInterno - qual coluna é?
console.log('\nAmostra de linhas com corretorInterno:');
data.slice(1, 5).forEach(r => {
  console.log('  Todos campos:', JSON.stringify(r));
});

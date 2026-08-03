export interface LancamentoItau {
  data: string;
  lancamento: string;
  valor: number;
  tipo: "Entrada" | "Saída";
}

const DATE_LINE_RE = /^(\d{2}\/\d{2}\/\d{4})\s*(.*)/;
const PAGE_MARKER_RE = /^--\s*\d+\s+of\s+\d+\s*--$/i;
const BR_VALUE_RE = /-?[\d]{1,3}(?:\.\d{3})*,\d{2}/g;
// Prefixos de lançamento que indicam início de nova transação
const TX_START_RE = /^(PIX |TED |PAGAMENTOS |RECEBIMENTOS |SISPAG |ELECTRON |ELCSS |ELDEF |PR )/i;

const SKIP_PREFIXES = [
  'SALDO ANTERIOR',
  'SALDO TOTAL DISPON',
  'SALDO MOVIMENTA',
  'SALDO APLIC',
  'SDO APLIC',
  'APL APLIC AUT',
  'RES APLIC AUT',
  'RENDIMENTOS REND PAGO',
];

function shouldSkip(text: string): boolean {
  const upper = text.toUpperCase().trim();
  return SKIP_PREFIXES.some(p => upper.startsWith(p));
}

function hasValue(parts: string[]): boolean {
  return new RegExp(BR_VALUE_RE.source).test(parts.join(' '));
}

function toISO(ddmmyyyy: string): string {
  const [d, mo, a] = ddmmyyyy.split('/');
  return `${a}-${mo}-${d}`;
}

export function parseExtratoItau(text: string): LancamentoItau[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const lancamentos: LancamentoItau[] = [];

  const groups: { date: string; parts: string[] }[] = [];
  let current: { date: string; parts: string[] } | null = null;

  for (const line of lines) {
    // Ignorar marcadores de página do pdf-parse
    if (PAGE_MARKER_RE.test(line)) continue;

    const m = line.match(DATE_LINE_RE);
    if (m) {
      if (current) groups.push(current);
      current = { date: m[1], parts: m[2] ? [m[2]] : [] };
    } else if (current) {
      // Se o grupo atual já tem valor e esta linha começa novo tipo de transação,
      // inicia grupo implícito com a mesma data (caso de quebra de página)
      if (hasValue(current.parts) && TX_START_RE.test(line)) {
        groups.push(current);
        current = { date: current.date, parts: [line] };
      } else {
        current.parts.push(line);
      }
    }
  }
  if (current) groups.push(current);

  for (const group of groups) {
    const fullText = group.parts.join(' ').trim();
    if (!fullText) continue;
    if (shouldSkip(fullText)) continue;

    const matches = [...fullText.matchAll(new RegExp(BR_VALUE_RE.source, 'g'))];
    if (matches.length === 0) continue;

    const valorStr = matches[matches.length - 1][0];
    const valor = Math.abs(parseFloat(valorStr.replace(/\./g, '').replace(',', '.')));
    if (valor === 0) continue;

    const tipo: "Entrada" | "Saída" = valorStr.startsWith('-') ? 'Saída' : 'Entrada';

    // Descrição: remover todos os valores numéricos, CNPJ e CPF
    const desc = fullText
      .replace(/-?[\d]{1,3}(?:\.\d{3})*,\d{2}/g, '')
      .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, '')
      .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!desc) continue;

    lancamentos.push({
      data: toISO(group.date),
      lancamento: desc.substring(0, 200),
      valor,
      tipo,
    });
  }

  return lancamentos;
}

/**
 * Parser do Extrato de Conta Corrente — Banco do Brasil
 *
 * Recebe o texto extraído pelo PDFParse (pdf-parse v2) e retorna os lançamentos
 * com o histórico EXATAMENTE como aparece no extrato original.
 *
 * Formato do texto extraído:
 *
 * PADRÃO A — Compra com Cartão (tipo na mesma linha da data):
 *   "33,83 (-)"
 *   "02/02/2026 99008 142661 Compra com Cartão"
 *   "31/01 11:51 COMBO ATACADISTA"
 *   → lancamento = "Compra com Cartão\n31/01 11:51 COMBO ATACADISTA"
 *
 * PADRÃO B — Recebimento / Pix (tipo em linha separada):
 *   "827,97 (+)"
 *   "02/02/2026 14134 135711"
 *   "Recebimento Fornecedor"
 *   "33.608.308/0001-73 MONGERAL AEGON"
 *   "SEGU"
 *   → lancamento = "Recebimento Fornecedor\n33.608.308/0001-73 MONGERAL AEGON SEGU"
 *
 * PADRÃO C — Pix Enviado (tipo na mesma linha da data):
 *   "37,90 (-)"
 *   "03/02/2026 13105 20301 Pix - Enviado"
 *   "03/02 21:27 SUSHIMENSC"
 *   → lancamento = "Pix - Enviado\n03/02 21:27 SUSHIMENSC"
 *
 * Estratégia:
 * - Cada lançamento começa com uma linha de VALOR (ex: "33,83 (-)")
 * - Seguida de uma linha com DATA (pode ter tipo junto ou não)
 * - Seguida de linhas de detalhe
 * - O campo "lancamento" é montado como: TIPO + newline + DETALHE(S)
 *   exatamente como aparece no extrato, para facilitar identificação
 */

export interface LancamentoBB {
  data: string;          // AAAA-MM-DD
  lancamento: string;    // Histórico completo fiel ao extrato
  valor: number;
  tipo: "Entrada" | "Saída";
}

const VALUE_RE = /^([0-9]+(?:\.[0-9]{3})*,[0-9]{2})\s*(\([+\-]\)|\*)\s*$/;
const DATE_WITH_HIST_RE = /^(\d{2}\/\d{2}\/\d{4})\s+\d+\s+\S+\s+(.+)$/;  // data + lote + doc + histórico
const DATE_ONLY_RE = /^(\d{2}\/\d{2}\/\d{4})\s+\d+\s*\S*\s*$/;            // data + lote (+ doc opcional), sem histórico

const SKIP_LINES = [
  /^Extrato de Conta/i,
  /^Cliente\s/i,
  /^Agência:/i,
  /^Lançamentos\s*$/i,
  /^Dia\s+Lote/i,
  /Saldo Anterior/i,
  /Saldo do dia/i,
  /^\s*$/,
];

function shouldSkip(s: string): boolean {
  return SKIP_LINES.some((p) => p.test(s.trim()));
}

function parseValue(str: string): { valor: number; tipo: "Entrada" | "Saída" } | null {
  const m = str.trim().match(VALUE_RE);
  if (!m) return null;
  const val = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
  if (m[2] === "(+)") return { valor: val, tipo: "Entrada" };
  if (m[2] === "(-)") return { valor: val, tipo: "Saída" };
  return null; // asterisco (*) = bloqueio judicial — ignorar
}

function toISO(ddmmyyyy: string): string {
  const [d, mo, a] = ddmmyyyy.split("/");
  return `${a}-${mo}-${d}`;
}

export function parseExtratoBB(text: string): LancamentoBB[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const lancamentos: LancamentoBB[] = [];

  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Linha de valor → início de um grupo
    const vp = parseValue(line);
    if (!vp) { i++; continue; }
    i++;

    // Coletar linhas do grupo até o próximo valor
    let date: string | null = null;
    const histParts: string[] = [];

    while (i < lines.length && !parseValue(lines[i])) {
      const l = lines[i];
      i++;

      if (shouldSkip(l)) continue;

      // Linha com data + histórico junto (ex: "02/02/2026 99008 142661 Compra com Cartão")
      const dwh = l.match(DATE_WITH_HIST_RE);
      if (dwh) {
        if (dwh[1] !== "00/00/0000") date = dwh[1];
        const hist = dwh[2].trim();
        if (hist) histParts.push(hist);
        continue;
      }

      // Linha só com data (ex: "02/02/2026 14134 135711")
      const donly = l.match(DATE_ONLY_RE);
      if (donly) {
        if (donly[1] !== "00/00/0000") date = donly[1];
        continue;
      }

      // Linha de detalhe/histórico puro
      histParts.push(l);
    }

    if (!date || histParts.length === 0) continue;

    // Montar o histórico fiel ao extrato:
    // Primeira parte = tipo (ex: "Compra com Cartão")
    // Partes seguintes = detalhe (ex: "31/01 11:51 COMBO ATACADISTA")
    // Separados por " | " para ficar legível na tabela
    const lancamento = histParts.join(" | ").replace(/\s+/g, " ").trim();

    lancamentos.push({
      data: toISO(date),
      lancamento: lancamento.substring(0, 200),
      valor: vp.valor,
      tipo: vp.tipo,
    });
  }

  return lancamentos;
}

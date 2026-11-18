import { getPool } from "./sharedPool";

/**
 * Motivo de a comissão do mês não ter sido recebida — mesma lógica da planilha de outubro/2026:
 *  1. Entrou comissão (do 1º dia do mês até hoje)  → COMISSÃO RECEBIDA
 *  2. Fatura do mês paga e sem comissão            → PARCELA PAGA SEM COMISSÃO (cobrar MAG, com data do pagamento)
 *  3. Fatura cancelada                              → CANCELADA
 *  4. Fatura em atraso/aberto                       → NÃO PAGOU
 *  5. Sem fatura no mês                             → SEM PARCELA NO MÊS (há fatura vizinha) ou SEM COBRANÇA NA MAG
 *  6. CPF aparece com outro nome na MAG             → CPF ERRADO NO CADASTRO
 */

export interface DadosMotivo {
  mes: number;
  ano: number;
  cpf: string;
  nome: string;
  comissaoValor?: number | string | null;
  comissaoDatas?: string | null;
  statusArrecadacao?: string | null;
  statusFatura?: string | null;
  dataPagamentoArrecadacao?: string | null;
  vencimentoFatura?: string | null;
  formaPagamento?: string | null;
  orgaoConsignante?: string | null;
  ondeEstaMag?: string | null;
  nomeMag?: string | null;
  arrecadacaoMesesVizinhos?: string | null;
  statusClienteMag?: string | null;
  clienteDesdeMag?: string | null;
  premioMag?: string | null;
  coberturasMag?: string | null;
  cancelamentoMag?: string | null;
  cpfMag?: string | null;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function normalizar(s: string) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
}

function mesmoNome(a: string, b: string) {
  const pa = normalizar(a).split(" ").filter(x => x.length > 2);
  const pb = new Set(normalizar(b).split(" ").filter(x => x.length > 2));
  if (!pa.length || !pb.size) return true;
  return pa.filter(x => pb.has(x)).length >= Math.min(2, pa.length, pb.size);
}

async function ultimaComissao(cpf: string): Promise<{ comp: string | null; produto: string | null }> {
  const limpo = cpf.replace(/\D/g, "");
  const [rows]: any = await getPool().execute(
    `SELECT competenciaComissionada AS comp, descricaoProduto AS produto FROM extrato_comissao
      WHERE REPLACE(REPLACE(REPLACE(cpfCliente,'.',''),'-',''),'/','') IN (?, ?)
      ORDER BY competenciaComissionada DESC LIMIT 1`,
    [limpo, limpo.replace(/^0+/, "")]
  );
  return rows[0] ? { comp: rows[0].comp || null, produto: rows[0].produto || null } : { comp: null, produto: null };
}

// Histórico de comissão do cliente nos extratos do ano (para "parcela paga sem comissão")
async function historicoComissao(cpf: string, mes: number, ano: number): Promise<string> {
  const limpo = cpf.replace(/\D/g, "");
  const [rows]: any = await getPool().execute(
    `SELECT competenciaComissionada AS comp, SUM(valorComissaoTotal) AS v, MAX(parcelaComissionada) AS parc,
            GROUP_CONCAT(DISTINCT proposta) AS prop
       FROM extrato_comissao
      WHERE REPLACE(REPLACE(REPLACE(cpfCliente,'.',''),'-',''),'/','') IN (?, ?) AND competenciaComissionada LIKE ?
      GROUP BY competenciaComissionada ORDER BY competenciaComissionada`,
    [limpo, limpo.replace(/^0+/, ""), `${ano}%`]
  );
  const comValor = (rows as any[]).filter(r => parseFloat(r.v) > 0);
  if (!comValor.length) {
    return `Comissão nos extratos ${ano}: NUNCA. O produto não está comissionando para a Barcellos — perguntar à MAG por que essa apólice não gera comissão.`;
  }
  const ult = comValor[comValor.length - 1];
  const fmtComp = (c: string) => `${c.slice(4)}/${c.slice(0, 4)}`;
  const meses = comValor.map(r => r.comp.slice(4)).join(", ");
  const anterior = `${ano}${String(mes - 1).padStart(2, "0")}`;
  const regular = comValor.length >= 3 && ult.comp >= anterior;
  return `Comissão nos extratos ${ano}: ${regular ? "todo mês" : "meses " + meses} até ${fmtComp(ult.comp)} (última R$ ${parseFloat(ult.v).toFixed(2).replace(".", ",")}, parcela ${ult.parc}, proposta ${ult.prop}). ${String(mes).padStart(2, "0")}/${ano} pago e sem comissão — COBRAR da MAG se não vier no próximo extrato.`;
}

// Situação do cliente nos Inadimplentes do sistema (importação do mês e do seguinte), conferindo a competência
async function situacaoInadimplentes(cpf: string, mes: number, ano: number, forma?: string | null): Promise<string> {
  const limpo = cpf.replace(/\D/g, "").replace(/^0+/, "");
  const prox = mes === 12 ? { m: 1, a: ano + 1 } : { m: mes + 1, a: ano };
  const comp = `${String(mes).padStart(2, "0")}/${String(ano).slice(2)}`;
  const [rows]: any = await getPool().execute(
    `SELECT mes, ano, mesParcela FROM inadimplentes
      WHERE TRIM(LEADING '0' FROM REPLACE(REPLACE(cpf,'.',''),'-','')) = ? AND ((mes = ? AND ano = ?) OR (mes = ? AND ano = ?))`,
    [limpo, mes, ano, prox.m, prox.a]
  );
  const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const desc = (m: number, a: number) => {
    const r = (rows as any[]).find(x => x.mes === m && x.ano === a);
    if (!r) return `${MES[m - 1].toUpperCase()} NÃO`;
    return new RegExp(`\\b${comp.replace("/", "\\/")}\\b`).test(r.mesParcela || "")
      ? `${MES[m - 1].toUpperCase()} SIM (${r.mesParcela})`
      : `${MES[m - 1].toUpperCase()} NÃO (só ${r.mesParcela})`;
  };
  const a = desc(mes, ano), b = desc(prox.m, prox.a);
  const nenhum = !a.includes("SIM") && !b.includes("SIM");
  return `Inadimplentes do sistema (comp. ${comp}): ${a} · ${b}${nenhum && /folha/i.test(forma || "") ? " — desconto em folha não vem na lista de inadimplentes da MAG" : ""}`;
}

export async function calcularMotivo(d: DadosMotivo): Promise<{ motivo: string; motivoDetalhe: string }> {
  const r = await calcularMotivoBase(d);
  try {
    if (r.motivo === "PARCELA PAGA SEM COMISSÃO") {
      const extra = [d.clienteDesdeMag ? `Cliente MAG desde ${d.clienteDesdeMag}` : "", d.coberturasMag ? `Produtos: ${d.coberturasMag}` : ""].filter(Boolean).join(" · ");
      r.motivoDetalhe += (extra ? ` ║ ${extra}` : "") + ` ║ ${await historicoComissao(d.cpf, d.mes, d.ano)}`;
    } else if (r.motivo.startsWith("NÃO PAGOU")) {
      r.motivoDetalhe += ` ║ ${await situacaoInadimplentes(d.cpf, d.mes, d.ano, d.formaPagamento)}`;
    }
  } catch (e: any) {
    console.error("[Motivo] enriquecer:", e.message);
  }
  return r;
}

async function calcularMotivoBase(d: DadosMotivo): Promise<{ motivo: string; motivoDetalhe: string }> {
  const cv = parseFloat(String(d.comissaoValor ?? 0)) || 0;
  if (cv > 0) {
    return { motivo: "COMISSÃO RECEBIDA", motivoDetalhe: `R$ ${cv.toFixed(2).replace(".", ",")} em ${d.comissaoDatas || "-"}` };
  }

  if (d.nomeMag && d.nome && !mesmoNome(d.nome, d.nomeMag)) {
    return { motivo: "CPF ERRADO NO CADASTRO", motivoDetalhe: `Na MAG esse CPF pertence a ${d.nomeMag} — corrigir o CPF do cliente` };
  }

  const st = String(d.statusFatura || d.statusArrecadacao || "").trim();
  const stl = st.toLowerCase();
  const venc = d.vencimentoFatura ? ` (venc. ${d.vencimentoFatura})` : "";
  const forma = d.formaPagamento ? ` via ${d.formaPagamento}` : "";
  const orgao = d.orgaoConsignante ? ` · Órgão: ${d.orgaoConsignante}` : "";

  if (stl.startsWith("paga")) {
    let det = (d.dataPagamentoArrecadacao ? `Pago em ${d.dataPagamentoArrecadacao}` : "Pago (a MAG não mostra a data)") + forma + venc + orgao;
    const mesSeguinte = String((d.mes % 12) + 1).padStart(2, "0");
    if (d.vencimentoFatura && d.vencimentoFatura.slice(3, 5) === mesSeguinte) {
      det += " · venceu no mês seguinte: a comissão tende a vir no próximo extrato";
    }
    return { motivo: "PARCELA PAGA SEM COMISSÃO", motivoDetalhe: det };
  }
  if (stl.startsWith("cancel")) {
    return { motivo: "CANCELADA", motivoDetalhe: `Fatura ${String(d.mes).padStart(2, "0")}/${d.ano} cancelada${d.ondeEstaMag ? ". " + d.ondeEstaMag : ""}` };
  }
  if (st && !stl.startsWith("sem registro")) {
    const det = [d.vencimentoFatura ? `Venc. ${d.vencimentoFatura}` : "", d.formaPagamento || "", d.orgaoConsignante ? `Órgão: ${d.orgaoConsignante}` : "", d.ondeEstaMag || ""]
      .filter(Boolean).join(" · ");
    return { motivo: `NÃO PAGOU — ${st.toUpperCase()}`, motivoDetalhe: det || "-" };
  }

  if (d.arrecadacaoMesesVizinhos) {
    return { motivo: "SEM PARCELA NO MÊS", motivoDetalhe: `Não há fatura no mês; faturas nos meses vizinhos: ${d.arrecadacaoMesesVizinhos.slice(0, 250)}` };
  }
  // Situação na carteira da MAG (quando a varredura consultou)
  const stc = String(d.statusClienteMag || "");
  const cpfMagLimpo = String(d.cpfMag || "").replace(/\D/g, "");
  if (cpfMagLimpo && cpfMagLimpo.replace(/^0+/, "") !== d.cpf.replace(/\D/g, "").replace(/^0+/, "")) {
    return { motivo: "CPF ERRADO NO CADASTRO", motivoDetalhe: `Na MAG o cliente está com o CPF ${d.cpfMag} (status ${stc || "?"}). Corrigir o CPF no nosso cadastro.` };
  }
  if (stc === "Não encontrado") {
    return { motivo: "SEM COBRANÇA NA MAG", motivoDetalhe: "Cliente NÃO EXISTE na MAG (nem pelo CPF nem pelo nome). Verificar se a apólice foi implantada ou se o cadastro está certo." };
  }
  if (stc) {
    const cobs = String(d.coberturasMag || "");
    const temAtivaPaga = cobs.split(";").some(c => /ativ/i.test(c) && !/inativ/i.test(c) && !/\(R\$ 0,00\)/.test(c));
    if (/inativo/i.test(stc) || (cobs && !temAtivaPaga)) {
      return {
        motivo: "CANCELADA",
        motivoDetalhe: `Apólice CANCELADA na MAG${d.cancelamentoMag ? ` em ${d.cancelamentoMag}` : ""} — cliente ${stc.toLowerCase()} na MAG${/inativo/i.test(stc) ? "" : " só com assistência sem prêmio"}. Coberturas: ${cobs || "-"}. Está ATIVO no nosso sistema: dar baixa.`,
      };
    }
    if (d.clienteDesdeMag) {
      const [dd, mm, aa] = d.clienteDesdeMag.split("/").map(Number);
      if (aa && (aa > d.ano || (aa === d.ano && mm >= d.mes))) {
        return { motivo: "SEM PARCELA NO MÊS", motivoDetalhe: `Cliente novo: entrou na MAG em ${d.clienteDesdeMag} (prêmio ${d.premioMag || "?"}). Ainda não teve fatura no mês.` };
      }
    }
  }
  const u = await ultimaComissao(d.cpf).catch(() => ({ comp: null, produto: null }));
  if (u.comp && /^\d{6}$/.test(u.comp)) {
    return {
      motivo: "SEM COBRANÇA NA MAG",
      motivoDetalhe: `Nenhuma fatura na MAG no mês e vizinhos. Última comissão: ${MESES[parseInt(u.comp.slice(4), 10) - 1]}/${u.comp.slice(0, 4)}${u.produto ? ` (${u.produto})` : ""}. Apólice parou de cobrar na MAG, mas está ativa no nosso sistema`,
    };
  }
  return {
    motivo: "SEM COBRANÇA NA MAG",
    motivoDetalhe: "Nenhuma fatura na MAG e nenhuma comissão em extrato. Verificar se a apólice foi implantada ou se o CPF está certo",
  };
}

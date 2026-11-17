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

export async function calcularMotivo(d: DadosMotivo): Promise<{ motivo: string; motivoDetalhe: string }> {
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

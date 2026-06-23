import { eq, and, sql, desc } from "drizzle-orm";
import { getDb } from "./db";
import { relatoriosExecutivos, metasAnuais } from "../drizzle/schema";

const MESES_NOMES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// ─── Buscar ou criar rascunho do relatório ─────────────────────────────────
export async function obterRelatorio(mes: number, ano: number) {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db.select().from(relatoriosExecutivos)
      .where(and(eq(relatoriosExecutivos.mes, mes), eq(relatoriosExecutivos.ano, ano)))
      .limit(1);
    return rows[0] || null;
  } catch {
    // Fallback: coluna imap pode não existir ainda — usa SQL sem ela
    const [rows] = await db.execute(
      sql`SELECT id, mes, ano, acaoNecessaria, insightReceita, insightColaboradores, acoesCorretivas, metaProximoMes, observacoesGerais, metaReceitaManual, metaCpfsManual, metaPropostasManual, createdAt, updatedAt FROM relatorios_executivos WHERE mes=${mes} AND ano=${ano} LIMIT 1`
    ) as any;
    return (rows as any[])[0] || null;
  }
}

export async function salvarRelatorio(mes: number, ano: number, dados: {
  acaoNecessaria?: string | null;
  insightReceita?: string | null;
  insightColaboradores?: string | null;
  acoesCorretivas?: string | null;
  metaProximoMes?: string | null;
  observacoesGerais?: string | null;
  metaReceitaManual?: string | null;
  metaCpfsManual?: number | null;
  metaPropostasManual?: number | null;
  imap?: string | null;
}) {
  const db = await getDb();
  if (!db) return null;

  // Tenta adicionar coluna imap se ainda não existir
  try {
    await db.execute(sql`ALTER TABLE relatorios_executivos ADD COLUMN imap DECIMAL(5,2)`);
  } catch (e: any) {
    if (e?.errno !== 1060 && !e?.message?.includes("Duplicate column")) {
      console.warn("[salvarRelatorio] imap column issue:", e?.message);
    }
  }

  const existente = await obterRelatorio(mes, ano);
  if (existente) {
    try {
      await db.update(relatoriosExecutivos)
        .set({ ...dados, updatedAt: new Date() })
        .where(eq(relatoriosExecutivos.id, existente.id));
    } catch (errUpdate) {
      const { imap: imapVal, ...dadosSemImap } = dados;
      await db.update(relatoriosExecutivos)
        .set({ ...dadosSemImap, updatedAt: new Date() })
        .where(eq(relatoriosExecutivos.id, existente.id));
    }
    return { ...existente, ...dados };
  } else {
    try {
      const [result] = await db.insert(relatoriosExecutivos).values({ mes, ano, ...dados });
      return { id: (result as any).insertId, mes, ano, ...dados };
    } catch (errInsert) {
      const { imap: imapVal, ...dadosSemImap } = dados;
      const [result] = await db.insert(relatoriosExecutivos).values({ mes, ano, ...dadosSemImap });
      return { id: (result as any).insertId, mes, ano, ...dadosSemImap };
    }
  }
}

// ─── Métricas consolidadas do mês (todos os módulos) ─────────────────────
export async function obterMetricasMes(mes: number, ano: number) {
  const db = await getDb();
  if (!db) return null;

  // Todas as queries independentes em paralelo
  const [
    [extratoCntRows],
    [extratoCntAntRows],
    [recExtratoRows],
    [recContasRows],
    [recExtratoAntRows],
    [recContasAntRows],
    [acumExtRows],
    [acumContRows],
    [contasRows],
    [vendasRows],
    [vendasAntRows],
    [corretoresRows],
    [produtosRows],
    [inadRows],
    [inadAcumRows],
    [cancRows],
    [cancAcumRows],
    [leadsStatusRows],
    [leadsAcumRows],
    [leadsVendMesRows],
    [leadsVendPorMesRows],
    [leadsVendPorAnoRows],
    [leadsOrigMesRows],
    [leadsOrigAnoRows],
    [sinistrosRows],
    [benefRows],
    [imapRows],
    metaRows,
    metaAnualRows,
    [vendasMensaisRows],
    [vendasMensaisAntRows],
    metasMensaisRows,
    [custosBarcellosRows],
  ] = await Promise.all([
    db.execute(sql`SELECT COUNT(*) as cnt FROM extrato_comissao WHERE mes=${mes} AND ano=${ano}`) as any,
    db.execute(sql`SELECT COUNT(*) as cnt FROM extrato_comissao WHERE mes=${mes} AND ano=${ano - 1}`) as any,
    db.execute(sql`SELECT COALESCE(SUM(valorComissaoTotal), 0) as receita FROM extrato_comissao WHERE mes=${mes} AND ano=${ano}`) as any,
    db.execute(sql`SELECT COALESCE(SUM(COALESCE(valorPago, valor)), 0) as receita FROM contas WHERE mes=${mes} AND ano=${ano} AND tipo='RECEITA' AND status='Pago'`) as any,
    db.execute(sql`SELECT COALESCE(SUM(valorComissaoTotal), 0) as receita FROM extrato_comissao WHERE mes=${mes} AND ano=${ano - 1}`) as any,
    db.execute(sql`SELECT COALESCE(SUM(COALESCE(valorPago, valor)), 0) as receita FROM contas WHERE mes=${mes} AND ano=${ano - 1} AND tipo='RECEITA' AND status='Pago'`) as any,
    db.execute(sql`SELECT COALESCE(SUM(valorComissaoTotal), 0) as receitaAcum FROM extrato_comissao WHERE ano=${ano} AND mes<=${mes}`) as any,
    db.execute(sql`SELECT COALESCE(SUM(COALESCE(valorPago, valor)), 0) as receitaAcum FROM contas WHERE ano=${ano} AND mes<=${mes} AND tipo='RECEITA' AND status='Pago'`) as any,
    db.execute(sql`SELECT COUNT(*) as totalContas, COALESCE(SUM(valor), 0) as totalValor, COALESCE(SUM(CASE WHEN status='Pago' AND tipo='DESPESA' THEN COALESCE(valorPago, valor) ELSE 0 END), 0) as totalPago, COALESCE(SUM(CASE WHEN (status='Pendente' OR status='Em Aberto') AND tipo='DESPESA' THEN valor ELSE 0 END), 0) as totalPendente, COALESCE(SUM(CASE WHEN status='Vencido' AND tipo='DESPESA' THEN valor ELSE 0 END), 0) as totalVencido FROM contas WHERE mes=${mes} AND ano=${ano}`) as any,
    db.execute(sql`SELECT COUNT(*) as propostas, COALESCE(SUM(CASE WHEN cpfNovo='SIM' THEN 1 ELSE 0 END), 0) as cpfsNovos, COALESCE(SUM(valorComissao), 0) as receitaVendas, COALESCE(SUM(valorPremio), 0) as totalPremio, COALESCE(SUM(CASE WHEN implantada='SIM' THEN 1 ELSE 0 END), 0) as implantadas, COALESCE(SUM(CASE WHEN comissaoPaga='SIM' THEN 1 ELSE 0 END), 0) as comissoesPagas FROM vendas WHERE mes=${mes} AND ano=${ano}`) as any,
    db.execute(sql`SELECT COUNT(*) as propostas, COALESCE(SUM(CASE WHEN cpfNovo='SIM' THEN 1 ELSE 0 END), 0) as cpfsNovos FROM vendas WHERE mes=${mes} AND ano=${ano - 1}`) as any,
    db.execute(sql`SELECT corretor, COUNT(*) as propostas, COALESCE(SUM(CASE WHEN cpfNovo='SIM' THEN 1 ELSE 0 END), 0) as cpfsNovos, COALESCE(SUM(valorComissao), 0) as comissao, COALESCE(SUM(valorPremio), 0) as premio FROM vendas WHERE mes=${mes} AND ano=${ano} AND corretor IS NOT NULL AND corretor != '' GROUP BY corretor ORDER BY premio DESC`) as any,
    db.execute(sql`SELECT produto, COUNT(*) as total FROM vendas WHERE mes=${mes} AND ano=${ano} AND produto IS NOT NULL GROUP BY produto ORDER BY total DESC LIMIT 5`) as any,
    db.execute(sql`SELECT status, COUNT(*) as total, COALESCE(SUM(valorTotal), 0) as totalValor FROM inadimplentes WHERE mes=${mes} AND ano=${ano} GROUP BY status`) as any,
    db.execute(sql`SELECT COUNT(*) as total, COALESCE(SUM(valorTotal), 0) as totalValor FROM inadimplentes WHERE ano=${ano}`) as any,
    db.execute(sql`SELECT status, COUNT(*) as total FROM cancelados WHERE mes=${mes} AND ano=${ano} GROUP BY status`) as any,
    db.execute(sql`SELECT status, COUNT(*) as total FROM cancelados WHERE ano=${ano} GROUP BY status`) as any,
    db.execute(sql`SELECT status, COUNT(*) as total FROM crm_leads WHERE mes=${mes} AND ano=${ano} GROUP BY status`) as any,
    db.execute(sql`SELECT status, COUNT(*) as total FROM crm_leads WHERE ano=${ano} GROUP BY status`) as any,
    db.execute(sql`SELECT vendedor, mes, status, COUNT(*) as total FROM crm_leads WHERE ano=${ano} AND vendedor IS NOT NULL AND vendedor != '' GROUP BY vendedor, mes, status ORDER BY vendedor, mes, total DESC`) as any,
    db.execute(sql`SELECT vendedor, COUNT(*) as total FROM crm_leads WHERE mes=${mes} AND ano=${ano} AND vendedor IS NOT NULL AND vendedor != '' GROUP BY vendedor ORDER BY total DESC`) as any,
    db.execute(sql`SELECT vendedor, COUNT(*) as total FROM crm_leads WHERE ano=${ano} AND vendedor IS NOT NULL AND vendedor != '' GROUP BY vendedor ORDER BY total DESC`) as any,
    db.execute(sql`SELECT origem, COUNT(*) as total FROM crm_leads WHERE mes=${mes} AND ano=${ano} AND origem IS NOT NULL AND origem != '' GROUP BY origem ORDER BY total DESC LIMIT 5`) as any,
    db.execute(sql`SELECT origem, COUNT(*) as total FROM crm_leads WHERE ano=${ano} AND origem IS NOT NULL AND origem != '' GROUP BY origem ORDER BY total DESC LIMIT 5`) as any,
    db.execute(sql`SELECT status, COUNT(*) as total, COALESCE(SUM(valorCapital), 0) as totalCapital FROM sinistros WHERE (MONTH(dataProtocolo) = ${mes} AND YEAR(dataProtocolo) = ${ano}) OR (dataProtocolo IS NULL AND MONTH(createdAt) = ${mes} AND YEAR(createdAt) = ${ano}) GROUP BY status`) as any,
    db.execute(sql`SELECT statusCRM, COUNT(*) as total FROM beneficiarios_crm GROUP BY statusCRM`) as any,
    db.execute(sql`SELECT mes, ano, imap FROM relatorios_executivos WHERE imap IS NOT NULL AND (ano < ${ano} OR (ano = ${ano} AND mes <= ${mes})) ORDER BY ano DESC, mes DESC LIMIT 12`) as any,
    db.select().from(metasAnuais).where(and(eq(metasAnuais.ano, ano), eq(metasAnuais.mes, mes))).limit(1),
    db.select().from(metasAnuais).where(and(eq(metasAnuais.ano, ano), eq(metasAnuais.mes, 0))).limit(1),
    db.execute(sql`SELECT mes, COALESCE(SUM(valorPremio), 0) as totalPremio, COUNT(*) as totalPropostas, COALESCE(SUM(CASE WHEN cpfNovo = 'SIM' THEN 1 ELSE 0 END), 0) as cpfsNovos FROM vendas WHERE ano = ${ano} GROUP BY mes ORDER BY mes`) as any,
    db.execute(sql`SELECT mes, COALESCE(SUM(valorPremio), 0) as totalPremio FROM vendas WHERE ano = ${ano - 1} GROUP BY mes ORDER BY mes`) as any,
    db.select().from(metasAnuais).where(eq(metasAnuais.ano, ano)),
    db.execute(sql`SELECT COALESCE(SUM(COALESCE(valorPago, valor)), 0) as total FROM contas WHERE mes=${mes} AND ano=${ano} AND tipo='DESPESA' AND status='Pago' AND (vinculo IS NULL OR vinculo NOT IN ('ELISIA', 'Elisia', 'elisia'))`) as any,
  ]);

  // ── 1. RECEITA ────────────────────────────────────────────────────────
  const temExtrato = parseInt((extratoCntRows as any)[0]?.cnt || "0") > 0;
  const temExtratoAnt = parseInt((extratoCntAntRows as any)[0]?.cnt || "0") > 0;
  const receitaReal = temExtrato
    ? parseFloat((recExtratoRows as any)[0]?.receita || "0")
    : parseFloat((recContasRows as any)[0]?.receita || "0");
  const receitaAnoAnterior = temExtratoAnt
    ? parseFloat((recExtratoAntRows as any)[0]?.receita || "0")
    : parseFloat((recContasAntRows as any)[0]?.receita || "0");
  const receitaAcumuladaExtrato = parseFloat((acumExtRows as any)[0]?.receitaAcum || "0");
  const receitaAcumuladaContas = parseFloat((acumContRows as any)[0]?.receitaAcum || "0");
  const receitaAcumulada = temExtrato ? receitaAcumuladaExtrato : receitaAcumuladaContas;

  // ── 2. CONTAS A PAGAR ─────────────────────────────────────────────────
  const contas = {
    total: parseInt((contasRows as any)[0]?.totalContas || "0"),
    totalValor: parseFloat((contasRows as any)[0]?.totalValor || "0"),
    totalPago: parseFloat((contasRows as any)[0]?.totalPago || "0"),
    totalPendente: parseFloat((contasRows as any)[0]?.totalPendente || "0"),
    totalVencido: parseFloat((contasRows as any)[0]?.totalVencido || "0"),
  };

  // ── 3. VENDAS ─────────────────────────────────────────────────────────
  const propostas = parseInt((vendasRows as any)[0]?.propostas || "0");
  const cpfsNovos = parseInt((vendasRows as any)[0]?.cpfsNovos || "0");
  const receitaVendas = parseFloat((vendasRows as any)[0]?.receitaVendas || "0");
  const totalPremio = parseFloat((vendasRows as any)[0]?.totalPremio || "0");
  const implantadas = parseInt((vendasRows as any)[0]?.implantadas || "0");
  const propostasAnoAnterior = parseInt((vendasAntRows as any)[0]?.propostas || "0");
  const cpfsNovosAnoAnterior = parseInt((vendasAntRows as any)[0]?.cpfsNovos || "0");
  const totalPremioCorretores = (corretoresRows as any[]).reduce((s: number, r: any) => s + parseFloat(r.premio || "0"), 0);
  const corretores = (corretoresRows as any[]).map((r: any) => ({
    nome: r.corretor,
    receita: parseFloat(r.comissao || "0"),
    premio: parseFloat(r.premio || "0"),
    propostas: parseInt(r.propostas || "0"),
    cpfsNovos: parseInt(r.cpfsNovos || "0"),
    percentual: totalPremioCorretores > 0 ? Math.round((parseFloat(r.premio || "0") / totalPremioCorretores) * 100) : 0,
  }));
  const produtosMaisVendidos = (produtosRows as any[]).map((r: any) => ({ produto: r.produto, total: parseInt(r.total || "0") }));

  // ── 4. INADIMPLENTES ─────────────────────────────────────────────────
  const inadimplentes = { pago: 0, emContato: 0, boleto: 0, desistiu: 0, totalPago: 0, totalEmAberto: 0, total: 0, totalValor: 0 };
  for (const r of inadRows as any[]) {
    const total = parseInt(r.total || "0"); const valor = parseFloat(r.totalValor || "0");
    inadimplentes.total += total; inadimplentes.totalValor += valor;
    const s = (r.status || "").toUpperCase();
    if (s === "PAGO") { inadimplentes.pago = total; inadimplentes.totalPago += valor; }
    else if (s === "EM CONTATO") { inadimplentes.emContato = total; inadimplentes.totalEmAberto += valor; }
    else if (s === "BOLETO") { inadimplentes.boleto = total; inadimplentes.totalEmAberto += valor; }
    else if (s === "DESISTIU") { inadimplentes.desistiu = total; }
  }
  const inadimplentesAcumulados = { total: parseInt((inadAcumRows as any)[0]?.total || "0"), totalValor: parseFloat((inadAcumRows as any)[0]?.totalValor || "0") };

  // ── 5. CANCELADOS ─────────────────────────────────────────────────────
  const canceladosBreakdown: Record<string, number> = {};
  let canceladosTotal = 0;
  for (const r of cancRows as any[]) { canceladosBreakdown[r.status || 'SEM_STATUS'] = parseInt(r.total || '0'); canceladosTotal += parseInt(r.total || '0'); }
  const cancelados = { total: canceladosTotal, breakdown: canceladosBreakdown };
  const cancAcumBreakdown: Record<string, number> = {};
  let cancAcumTotal = 0;
  for (const r of cancAcumRows as any[]) { cancAcumBreakdown[r.status || 'SEM_STATUS'] = parseInt(r.total || '0'); cancAcumTotal += parseInt(r.total || '0'); }
  const canceladosAcumulados = { total: cancAcumTotal, breakdown: cancAcumBreakdown };

  // ── 6. CRM LEADS ──────────────────────────────────────────────────────
  const leadsStatus: Record<string, number> = {};
  let leadsTotal = 0;
  for (const r of leadsStatusRows as any[]) { leadsStatus[r.status || "Sem Status"] = parseInt(r.total || "0"); leadsTotal += parseInt(r.total || "0"); }
  const leadsAcumStatus: Record<string, number> = {};
  let leadsAcumTotal = 0;
  for (const r of leadsAcumRows as any[]) { leadsAcumStatus[r.status || "Sem Status"] = parseInt(r.total || "0"); leadsAcumTotal += parseInt(r.total || "0"); }
  const leadsDetalhadoPorVendedor: Record<string, Record<number, { total: number; status: Record<string, number> }>> = {};
  for (const r of leadsVendMesRows as any[]) {
    const vend = r.vendedor; const m2 = parseInt(r.mes); const qtd = parseInt(r.total || "0");
    if (!leadsDetalhadoPorVendedor[vend]) leadsDetalhadoPorVendedor[vend] = {};
    if (!leadsDetalhadoPorVendedor[vend][m2]) leadsDetalhadoPorVendedor[vend][m2] = { total: 0, status: {} };
    leadsDetalhadoPorVendedor[vend][m2].total += qtd;
    leadsDetalhadoPorVendedor[vend][m2].status[r.status || "Sem Status"] = qtd;
  }
  const leadsVendSrc = leadsTotal > 0 ? leadsVendPorMesRows : leadsVendPorAnoRows;
  const leadsPorVendedor = (leadsVendSrc as any[]).map((r: any) => ({ vendedor: r.vendedor, total: parseInt(r.total || "0") }));
  const leadsOrigSrc = leadsTotal > 0 ? leadsOrigMesRows : leadsOrigAnoRows;
  const leadsPorOrigem = (leadsOrigSrc as any[]).map((r: any) => ({ origem: r.origem, total: parseInt(r.total || "0") }));

  // ── 7. SINISTROS ──────────────────────────────────────────────────────
  const sinistros: { status: string; total: number; totalCapital: number }[] = [];
  let sinistrosTotal = 0; let sinistrosTotalCapital = 0;
  for (const r of sinistrosRows as any[]) {
    const total = parseInt(r.total || "0"); const capital = parseFloat(r.totalCapital || "0");
    sinistros.push({ status: r.status || "Sem Status", total, totalCapital: capital });
    sinistrosTotal += total; sinistrosTotalCapital += capital;
  }

  // ── 8. BENEFICIÁRIOS ──────────────────────────────────────────────────
  const beneficiarios: { status: string; total: number }[] = [];
  let benefTotal = 0;
  for (const r of benefRows as any[]) { const total = parseInt(r.total || "0"); beneficiarios.push({ status: r.statusCRM || "Sem Status", total }); benefTotal += total; }

  // ── 9. METAS ──────────────────────────────────────────────────────────
  const meta = metaRows[0] || null;
  const metaReceita = parseFloat(meta?.metaCarteira || "0");
  const metaPremioVendas = parseFloat(meta?.metaReceita || "0");
  const metaVendas = parseFloat(meta?.metaVendas || "0");
  const metaAngariacao = parseFloat(meta?.metaAngariacao || "0");
  const metaCpfs = meta?.metaCpfs ? parseInt(String(meta.metaCpfs)) : 0;
  const metaPropostas = meta?.metaPropostas ? parseInt(String(meta.metaPropostas)) : 0;
  const metaAnual = parseFloat(metaAnualRows[0]?.metaCarteira || "0");

  // IMAP
  const imapRowsArr = imapRows as any[];
  const mesAtualImap = imapRowsArr.find((r: any) => parseInt(r.mes) === mes && parseInt(r.ano) === ano);
  const imapMes = mesAtualImap ? parseFloat(String(mesAtualImap.imap)) : null;
  const imapValores12 = imapRowsArr.map((r: any) => ({ mes: parseInt(r.mes), ano: parseInt(r.ano), valor: parseFloat(String(r.imap)) }));
  const imapMedia = imapValores12.length > 0 ? imapValores12.reduce((s, v) => s + v.valor, 0) / imapValores12.length : null;
  const imapMax = imapValores12.length > 0 ? Math.max(...imapValores12.map((v) => v.valor)) : null;
  const imapMin = imapValores12.length > 0 ? Math.min(...imapValores12.map((v) => v.valor)) : null;
  const imapMaxMes = imapMax !== null ? imapValores12.find((v) => v.valor === imapMax)?.mes ?? null : null;
  const imapMinMes = imapMin !== null ? imapValores12.find((v) => v.valor === imapMin)?.mes ?? null : null;

  // Comparativo mensal de vendas
  const vendasMensaisAtual: Record<number, { premio: number; propostas: number; cpfs: number }> = {};
  for (const r of vendasMensaisRows as any[]) { vendasMensaisAtual[Number(r.mes)] = { premio: parseFloat(String(r.totalPremio || "0")), propostas: Number(r.totalPropostas || 0), cpfs: Number(r.cpfsNovos || 0) }; }
  const vendasMensaisAnterior: Record<number, number> = {};
  for (const r of vendasMensaisAntRows as any[]) { vendasMensaisAnterior[Number(r.mes)] = parseFloat(String(r.totalPremio || "0")); }
  const metasMensaisMap: Record<number, { metaPremio: number; metaPropostas: number; metaCpfs: number }> = {};
  for (const r of metasMensaisRows) { if (r.mes >= 1 && r.mes <= 12) metasMensaisMap[r.mes] = { metaPremio: parseFloat(String(r.metaReceita || "0")), metaPropostas: r.metaPropostas || 0, metaCpfs: r.metaCpfs || 0 }; }
  const comparativoVendasMensal = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const atual = vendasMensaisAtual[m] || { premio: 0, propostas: 0, cpfs: 0 };
    const anterior = vendasMensaisAnterior[m] || 0;
    const metaM = metasMensaisMap[m] || { metaPremio: 0, metaPropostas: 0, metaCpfs: 0 };
    return { mes: m, premio: atual.premio, propostas: atual.propostas, cpfsNovos: atual.cpfs, premioAnoAnterior: anterior, metaPremio: metaM.metaPremio, metaPropostas: metaM.metaPropostas, metaCpfs: metaM.metaCpfs, atingPremio: metaM.metaPremio > 0 ? (atual.premio / metaM.metaPremio) * 100 : 0, variacaoAno: anterior > 0 ? ((atual.premio - anterior) / anterior) * 100 : 0 };
  });

  // ── 10. CUSTOS ────────────────────────────────────────────────────────
  const custos = parseFloat((custosBarcellosRows as any)[0]?.total || '0');
  const lucroLiquido = receitaReal - custos;
  const margem = receitaReal > 0 ? (lucroLiquido / receitaReal) * 100 : 0;
  const projecaoAnual = mes > 0 ? (receitaAcumulada / mes) * 12 : 0;

  return {
    mes,
    ano,
    nomeMes: MESES_NOMES[mes],
    // Receita
    receitaReal,
    receitaAnoAnterior,
    receitaAcumulada,
    variacaoReceita: receitaAnoAnterior > 0 ? ((receitaReal - receitaAnoAnterior) / receitaAnoAnterior) * 100 : 0,
    percentualMeta: metaReceita > 0 ? (receitaReal / metaReceita) * 100 : 0,
    metaReceita,
    // Custos e lucro
    custos,
    lucroLiquido,
    margem,
    // Projeção
    projecaoAnual,
    metaAnual,
    percentualMetaAnual: metaAnual > 0 ? (projecaoAnual / metaAnual) * 100 : 0,
    // Meta de vendas (prêmio total)
    metaVendas,
    percentualMetaVendas: metaVendas > 0 ? (totalPremio / metaVendas) * 100 : 0,
    // Meta de prêmio de vendas NOVAS no mês (R$) — para comparar com totalPremio quando relevante
    metaPremioVendas,
    percentualMetaPremioVendas: metaPremioVendas > 0 ? (totalPremio / metaPremioVendas) * 100 : 0,
    // Meta de angariação (vendas novas por mês — R$ recebido como angariação)
    metaAngariacao,
    // IMAP
    imap: imapMes,
    imapMedia: imapMedia !== null ? parseFloat(imapMedia.toFixed(2)) : null,
    imapMax,
    imapMin,
    imapMaxMes,
    imapMinMes,
    imapValores: imapValores12,
    // Contas a pagar
    contas,
    // Vendas
    propostas,
    propostasAnoAnterior,
    variacaoPropostas: propostasAnoAnterior > 0 ? ((propostas - propostasAnoAnterior) / propostasAnoAnterior) * 100 : 0,
    percentualMetaPropostas: metaPropostas > 0 ? (propostas / metaPropostas) * 100 : 0,
    metaPropostas,
    cpfsNovos,
    cpfsNovosAnoAnterior,
    variacaoCpfs: cpfsNovosAnoAnterior > 0 ? ((cpfsNovos - cpfsNovosAnoAnterior) / cpfsNovosAnoAnterior) * 100 : 0,
    percentualMetaCpfs: metaCpfs > 0 ? (cpfsNovos / metaCpfs) * 100 : 0,
    metaCpfs,
    receitaVendas,
    totalPremio,
    implantadas,
    corretores,
    produtosMaisVendidos,
    // Comparativo mensal de vendas (todos os 12 meses do ano)
    comparativoVendasMensal,
    // Inadimplentes
    inadimplentes,
    inadimplentesAcumulados,
    // Cancelados
    cancelados,
    canceladosAcumulados,
    // CRM Leads
    leadsTotal,
    leadsStatus,
    leadsAcumTotal,
    leadsAcumStatus,
    leadsPorVendedor,
    leadsPorOrigem,
    leadsDetalhadoPorVendedor,
    // Sinistros
    sinistros,
    sinistrosTotal,
    sinistrosTotalCapital,
    // CRM Beneficiários
    beneficiarios,
    benefTotal,
  };
}

// ─── Listar relatórios existentes ─────────────────────────────────────────
export async function listarRelatorios(ano: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(relatoriosExecutivos)
      .where(eq(relatoriosExecutivos.ano, ano))
      .orderBy(desc(relatoriosExecutivos.mes));
  } catch {
    const [rows] = await db.execute(
      sql`SELECT id, mes, ano, acaoNecessaria, insightReceita, insightColaboradores, acoesCorretivas, metaProximoMes, observacoesGerais, metaReceitaManual, metaCpfsManual, metaPropostasManual, createdAt, updatedAt FROM relatorios_executivos WHERE ano=${ano} ORDER BY mes DESC`
    ) as any;
    return rows as any[];
  }
}

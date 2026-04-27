import { getDb } from "./db";
import { vendas } from "../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";

const MESES_NOMES = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export interface CorretorDados {
  corretor: string;
  receita: number;
  propostas: number;
  cpfsNovos: number;
  percentualAno?: number;
}

export interface DadosMensagemDiaria {
  mes: number;
  ano: number;
  nomeMes: string;
  receitaMes: number;
  propostasMes: number;
  cpfsNovosMes: number;
  porCorretorMes: CorretorDados[];
  receitaAno: number;
  propostasAno: number;
  cpfsNovosAno: number;
  porCorretorAno: CorretorDados[];
}

export async function buscarDadosMensagemDiaria(mes: number, ano: number): Promise<DadosMensagemDiaria | null> {
  const db = await getDb();
  if (!db) return null;

  // ── Dados do mês por corretor — usa valorPremio (FATURAMENTO) ────────────────
  const mesDados = await db
    .select({
      corretor: vendas.corretor,
      receita: sql<string>`ROUND(SUM(COALESCE(${vendas.valorPremio}, 0)), 2)`,
      propostas: sql<number>`COUNT(*)`,
      cpfsNovos: sql<number>`SUM(CASE WHEN ${vendas.cpfNovo} = 'SIM' THEN 1 ELSE 0 END)`,
    })
    .from(vendas)
    .where(and(eq(vendas.mes, mes), eq(vendas.ano, ano)))
    .groupBy(vendas.corretor)
    .orderBy(sql`SUM(COALESCE(${vendas.valorPremio}, 0)) DESC`);

  // ── Dados do ano por corretor — usa valorPremio (FATURAMENTO) ────────────────
  const anoDados = await db
    .select({
      corretor: vendas.corretor,
      receita: sql<string>`ROUND(SUM(COALESCE(${vendas.valorPremio}, 0)), 2)`,
      propostas: sql<number>`COUNT(*)`,
      cpfsNovos: sql<number>`SUM(CASE WHEN ${vendas.cpfNovo} = 'SIM' THEN 1 ELSE 0 END)`,
    })
    .from(vendas)
    .where(eq(vendas.ano, ano))
    .groupBy(vendas.corretor)
    .orderBy(sql`SUM(COALESCE(${vendas.valorPremio}, 0)) DESC`);

  // Normaliza e filtra corretores válidos
  const normalizar = (rows: typeof mesDados): CorretorDados[] =>
    rows
      .map(r => ({
        corretor: String(r.corretor || "").trim().toUpperCase(),
        receita: parseFloat(String(r.receita || "0")),
        propostas: Number(r.propostas || 0),
        cpfsNovos: Number(r.cpfsNovos || 0),
      }))
      .filter(r => r.corretor && !r.corretor.includes("*") && !r.corretor.includes(","));

  const porMes = normalizar(mesDados);
  const porAno = normalizar(anoDados);

  const receitaMes = porMes.reduce((s, r) => s + r.receita, 0);
  const propostasMes = porMes.reduce((s, r) => s + r.propostas, 0);
  const cpfsNovosMes = porMes.reduce((s, r) => s + r.cpfsNovos, 0);

  const receitaAno = porAno.reduce((s, r) => s + r.receita, 0);
  const propostasAno = porAno.reduce((s, r) => s + r.propostas, 0);
  const cpfsNovosAno = porAno.reduce((s, r) => s + r.cpfsNovos, 0);

  const porCorretorAno = porAno.map(r => ({
    ...r,
    percentualAno: receitaAno > 0 ? Math.round((r.receita / receitaAno) * 100) : 0,
  }));

  return {
    mes,
    ano,
    nomeMes: MESES_NOMES[mes] || `Mês ${mes}`,
    receitaMes,
    propostasMes,
    cpfsNovosMes,
    porCorretorMes: porMes,
    receitaAno,
    propostasAno,
    cpfsNovosAno,
    porCorretorAno,
  };
}

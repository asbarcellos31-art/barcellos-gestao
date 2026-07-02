import { getPool } from "./sharedPool";

export type TipoLancamento = "Entrada" | "Saída";
export type CategoriaContas = "SALARIO" | "COMISSAO" | "DISTRIBUICAO" | "VEICULO" | "ESTRUTURA" | "BANCO" | "IMPOSTOS" | "ALIMENTACAO" | "MATERIAL_ESCRITORIO" | "DIVERSOS";
export type VinculoContas = "ANDERSON" | "NAYARA" | "ELISIA" | "BARCELLOS";

export const CATEGORIAS: CategoriaContas[] = [
  "SALARIO", "COMISSAO", "DISTRIBUICAO", "VEICULO", "ESTRUTURA",
  "BANCO", "IMPOSTOS", "ALIMENTACAO", "MATERIAL_ESCRITORIO", "DIVERSOS"
];

export const VINCULOS: VinculoContas[] = ["ANDERSON", "NAYARA", "ELISIA", "BARCELLOS"];

export interface LancamentoExtrato {
  id: number;
  uploadId: number;
  data: string;
  lancamento: string;
  detalhes: string;
  nrDocumento: string;
  valor: number;
  tipo: TipoLancamento;
  categoria: CategoriaContas | null;
  vinculo: VinculoContas | null;
  observacao: string;
  confirmado: boolean;
  lancamentoContasId: number | null;
}

export interface UploadExtratoBancario {
  id: number;
  mes: number;
  ano: number;
  nomeArquivo: string;
  totalLancamentos: number;
  totalEntradas: number;
  totalSaidas: number;
  confirmado: boolean;
  createdAt: Date;
}

// Criar upload e inserir lançamentos
export async function criarUploadExtrato(params: {
  mes: number;
  ano: number;
  nomeArquivo: string;
  lancamentos: Array<{
    data: string;
    lancamento: string;
    detalhes: string;
    nrDocumento: string;
    valor: number;
    tipo: TipoLancamento;
  }>;
}): Promise<{ uploadId: number; total: number }> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();

    // Deletar upload anterior do mesmo mês/ano se não confirmado
    const [uploads] = await conn.execute(
      "SELECT id FROM uploads_extrato_bancario WHERE mes = ? AND ano = ? AND confirmado = FALSE",
      [params.mes, params.ano]
    ) as any[];
    for (const u of uploads) {
      await conn.execute("DELETE FROM extrato_bancario WHERE uploadId = ?", [u.id]);
      await conn.execute("DELETE FROM uploads_extrato_bancario WHERE id = ?", [u.id]);
    }

    const totalEntradas = params.lancamentos
      .filter(l => l.tipo === "Entrada")
      .reduce((s, l) => s + l.valor, 0);
    const totalSaidas = params.lancamentos
      .filter(l => l.tipo === "Saída")
      .reduce((s, l) => s + l.valor, 0);

    const [result] = await conn.execute(
      `INSERT INTO uploads_extrato_bancario (mes, ano, nomeArquivo, totalLancamentos, totalEntradas, totalSaidas, confirmado)
       VALUES (?, ?, ?, ?, ?, ?, FALSE)`,
      [params.mes, params.ano, params.nomeArquivo, params.lancamentos.length, totalEntradas.toFixed(2), totalSaidas.toFixed(2)]
    ) as any[];

    const uploadId = result.insertId;

    for (const l of params.lancamentos) {
      await conn.execute(
        `INSERT INTO extrato_bancario (uploadId, data, lancamento, detalhes, nrDocumento, valor, tipo)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uploadId, l.data, l.lancamento, l.detalhes, l.nrDocumento, l.valor.toFixed(2), l.tipo]
      );
    }

    await conn.commit();
    return { uploadId, total: params.lancamentos.length };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Listar lançamentos de um upload
export async function listarLancamentosExtrato(uploadId: number): Promise<LancamentoExtrato[]> {
  const [rows] = await getPool().execute(
    `SELECT id, uploadId, data, lancamento, detalhes, nrDocumento,
            CAST(valor AS DECIMAL(12,2)) as valor, tipo, categoria, vinculo,
            observacao, confirmado, lancamentoContasId
     FROM extrato_bancario WHERE uploadId = ? ORDER BY data, id`,
    [uploadId]
  ) as any[];
  return rows.map((r: any) => ({
    ...r,
    valor: parseFloat(r.valor),
    confirmado: Boolean(r.confirmado),
  }));
}

// Listar uploads
export async function listarUploadsExtrato(): Promise<UploadExtratoBancario[]> {
  const [rows] = await getPool().execute(
    `SELECT id, mes, ano, nomeArquivo, totalLancamentos,
            CAST(totalEntradas AS DECIMAL(12,2)) as totalEntradas,
            CAST(totalSaidas AS DECIMAL(12,2)) as totalSaidas,
            confirmado, createdAt
     FROM uploads_extrato_bancario ORDER BY ano DESC, mes DESC`
  ) as any[];
  return rows.map((r: any) => ({
    ...r,
    totalEntradas: parseFloat(r.totalEntradas),
    totalSaidas: parseFloat(r.totalSaidas),
    confirmado: Boolean(r.confirmado),
  }));
}

// Atualizar categoria/vínculo de um lançamento
export async function atualizarLancamentoExtrato(id: number, params: {
  categoria?: string | null;
  vinculo?: string | null;
  observacao?: string;
}): Promise<void> {
  const sets: string[] = [];
  const vals: any[] = [];
  if (params.categoria !== undefined) { sets.push("categoria = ?"); vals.push(params.categoria); }
  if (params.vinculo !== undefined) { sets.push("vinculo = ?"); vals.push(params.vinculo); }
  if (params.observacao !== undefined) { sets.push("observacao = ?"); vals.push(params.observacao); }
  if (sets.length === 0) return;
  vals.push(id);
  await getPool().execute(`UPDATE extrato_bancario SET ${sets.join(", ")} WHERE id = ?`, vals);
}

// Atualizar categoria/vínculo em lote (por tipo de lançamento)
export async function atualizarLoteExtrato(uploadId: number, lancamentoTipo: string, params: {
  categoria?: string | null;
  vinculo?: string | null;
}): Promise<number> {
  const sets: string[] = [];
  const vals: any[] = [];
  if (params.categoria !== undefined) { sets.push("categoria = ?"); vals.push(params.categoria); }
  if (params.vinculo !== undefined) { sets.push("vinculo = ?"); vals.push(params.vinculo); }
  if (sets.length === 0) return 0;
  vals.push(uploadId, lancamentoTipo);
  const [result] = await getPool().execute(
    `UPDATE extrato_bancario SET ${sets.join(", ")} WHERE uploadId = ? AND lancamento = ?`,
    vals
  ) as any[];
  return result.affectedRows;
}

// Resumo por categoria
export interface ResumoPorCategoria {
  categoria: string | null;
  vinculo: string | null;
  tipo: TipoLancamento;
  total: number;
  quantidade: number;
}

export async function resumoPorCategoria(uploadId: number): Promise<ResumoPorCategoria[]> {
  const [rows] = await getPool().execute(
    `SELECT categoria, vinculo, tipo,
            SUM(ABS(valor)) as total, COUNT(*) as quantidade
     FROM extrato_bancario
     WHERE uploadId = ?
     GROUP BY categoria, vinculo, tipo
     ORDER BY tipo, categoria`,
    [uploadId]
  ) as any[];
  return rows.map((r: any) => ({
    ...r,
    total: parseFloat(r.total),
    quantidade: parseInt(r.quantidade),
  }));
}

// Confirmar importação — criar lançamentos no Contas a Pagar
export async function confirmarImportacaoExtrato(uploadId: number, mes: number, ano: number): Promise<{
  criados: number;
  erros: string[];
}> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();

    // Buscar resumo por categoria+vínculo+tipo
    const [grupos] = await conn.execute(
      `SELECT categoria, vinculo, tipo,
              SUM(ABS(valor)) as total, COUNT(*) as quantidade,
              GROUP_CONCAT(detalhes SEPARATOR ' | ') as descricoes
       FROM extrato_bancario
       WHERE uploadId = ? AND categoria IS NOT NULL AND vinculo IS NOT NULL
       GROUP BY categoria, vinculo, tipo`,
      [uploadId]
    ) as any[];

    const erros: string[] = [];
    let criados = 0;

    for (const g of grupos as any[]) {
      try {
        const total = parseFloat(g.total);
        const status = g.tipo === "Entrada" ? "PAGO" : "PAGO";
        const descricao = `${g.tipo === "Entrada" ? "Receita" : "Despesa"} - ${g.categoria} (${g.quantidade} lançamentos do extrato)`;
        const hoje = new Date().toISOString().split("T")[0];

        const tipoLancamento = g.tipo === "Entrada" ? "RECEITA" : "DESPESA";
        const [res] = await conn.execute(
          `INSERT INTO contas (descricao, dataVencimento, valor, dataPagamento, status, categoria, vinculo, valorPago, tipo, mes, ano)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [descricao, hoje, total.toFixed(2), hoje, status, g.categoria, g.vinculo, total.toFixed(2), tipoLancamento, mes, ano]
        ) as any[];

        // Marcar lançamentos como confirmados
        await conn.execute(
          `UPDATE extrato_bancario SET confirmado = TRUE, lancamentoContasId = ?
           WHERE uploadId = ? AND categoria = ? AND vinculo = ? AND tipo = ?`,
          [res.insertId, uploadId, g.categoria, g.vinculo, g.tipo]
        );

        criados++;
      } catch (e: any) {
        erros.push(`${g.categoria}/${g.vinculo}: ${e.message}`);
      }
    }

    // Marcar upload como confirmado
    await conn.execute(
      "UPDATE uploads_extrato_bancario SET confirmado = TRUE WHERE id = ?",
      [uploadId]
    );

    await conn.commit();
    return { criados, erros };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Deletar upload
export async function deletarUploadExtrato(uploadId: number): Promise<void> {
  await getPool().execute("DELETE FROM extrato_bancario WHERE uploadId = ?", [uploadId]);
  await getPool().execute("DELETE FROM uploads_extrato_bancario WHERE id = ?", [uploadId]);
}

// Excluir lançamentos sem categoria de um upload
export async function excluirLancamentosSemCategoria(uploadId: number): Promise<{ excluidos: number }> {
  const [result] = await getPool().execute(
    "DELETE FROM extrato_bancario WHERE uploadId = ? AND categoria IS NULL AND confirmado = FALSE",
    [uploadId]
  ) as any[];
  return { excluidos: result.affectedRows };
}

// Excluir um lançamento individual
export async function excluirLancamentoExtrato(id: number): Promise<void> {
  const pool = getPool();
  // Busca uploadId e tipo antes de deletar para recalcular totais
  const [rows] = await pool.execute("SELECT uploadId, tipo FROM extrato_bancario WHERE id = ?", [id]) as any[];
  await pool.execute("DELETE FROM extrato_bancario WHERE id = ? AND confirmado = FALSE", [id]);
  if (rows.length > 0) {
    const { uploadId } = rows[0];
    await pool.execute(
      `UPDATE uploads_extrato_bancario
       SET totalEntradas = (SELECT COALESCE(SUM(ABS(valor)),0) FROM extrato_bancario WHERE uploadId = ? AND tipo = 'Entrada'),
           totalSaidas   = (SELECT COALESCE(SUM(ABS(valor)),0) FROM extrato_bancario WHERE uploadId = ? AND tipo = 'Saída'),
           totalLancamentos = (SELECT COUNT(*) FROM extrato_bancario WHERE uploadId = ?)
       WHERE id = ?`,
      [uploadId, uploadId, uploadId, uploadId]
    );
  }
}

// Corrigir mês/ano de um upload (e dos lançamentos vinculados no Contas a Pagar)
export async function corrigirMesUploadExtrato(uploadId: number, mes: number, ano: number): Promise<{ contasAtualizadas: number }> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      "UPDATE uploads_extrato_bancario SET mes = ?, ano = ? WHERE id = ?",
      [mes, ano, uploadId]
    );

    const [rows] = await conn.execute(
      "SELECT DISTINCT lancamentoContasId FROM extrato_bancario WHERE uploadId = ? AND lancamentoContasId IS NOT NULL",
      [uploadId]
    ) as any[];

    let contasAtualizadas = 0;
    if (rows.length > 0) {
      const ids = (rows as any[]).map((r: any) => r.lancamentoContasId);
      const placeholders = ids.map(() => "?").join(",");
      const [res] = await conn.execute(
        `UPDATE contas SET mes = ?, ano = ? WHERE id IN (${placeholders})`,
        [mes, ano, ...ids]
      ) as any[];
      contasAtualizadas = res.affectedRows;
    }

    await conn.commit();
    return { contasAtualizadas };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

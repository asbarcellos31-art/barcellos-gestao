import { getPool } from "./sharedPool";

async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await getPool().execute(sql, params);
  return rows as T[];
}

// ─── Uploads ─────────────────────────────────────────────────────────────────

export async function criarUploadCancelados(data: {
  mes: number; ano: number; nomeArquivo?: string; totalRegistros: number;
}) {
  const [result] = await getPool().execute(
    `INSERT INTO uploads_cancelados (mes, ano, nomeArquivo, totalRegistros) VALUES (?, ?, ?, ?)`,
    [data.mes, data.ano, data.nomeArquivo ?? null, data.totalRegistros]
  ) as any;
  return result.insertId as number;
}

export async function listarUploadsCancelados() {
  return query<{
    id: number; mes: number; ano: number; nomeArquivo: string | null;
    totalRegistros: number; createdAt: Date;
  }>(`SELECT * FROM uploads_cancelados ORDER BY ano DESC, mes DESC`);
}

export async function deletarUploadCancelados(uploadId: number) {
  await getPool().execute(`DELETE FROM cancelados WHERE uploadId = ?`, [uploadId]);
  await getPool().execute(`DELETE FROM uploads_cancelados WHERE id = ?`, [uploadId]);
}

// ─── Cancelados CRUD ─────────────────────────────────────────────────────────

export async function inserirCancelados(registros: {
  uploadId: number; mes: number; ano: number;
  nome: string; cpf?: string; produto?: string;
  status: string; observacao?: string;
}[]) {
  if (registros.length === 0) return;
  const values = registros.map(r =>
    `(${r.uploadId}, ${r.mes}, ${r.ano}, ${getPool().escape(r.nome)}, ${getPool().escape(r.cpf ?? null)}, ${getPool().escape(r.produto ?? null)}, ${getPool().escape(r.status)}, ${getPool().escape(r.observacao ?? null)})`
  ).join(",");
  await getPool().execute(
    `INSERT INTO cancelados (uploadId, mes, ano, nome, cpf, produto, status, observacao) VALUES ${values}`
  );
}

export async function listarCancelados(params: {
  mes?: number; ano?: number; status?: string; busca?: string;
  limit?: number; offset?: number;
}) {
  const where: string[] = [];
  const vals: any[] = [];
  if (params.mes) { where.push("mes = ?"); vals.push(params.mes); }
  if (params.ano) { where.push("ano = ?"); vals.push(params.ano); }
  if (params.status && params.status !== "todos") { where.push("status = ?"); vals.push(params.status); }
  if (params.busca) {
    where.push("(nome LIKE ? OR cpf LIKE ? OR produto LIKE ?)");
    const b = `%${params.busca}%`;
    vals.push(b, b, b);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const limit = params.limit ?? 100;
  const offset = params.offset ?? 0;
  const rows = await query<any>(
    `SELECT * FROM cancelados ${whereClause} ORDER BY ano DESC, mes DESC, nome ASC LIMIT ${limit} OFFSET ${offset}`,
    vals
  );
  const [countRow] = await query<any>(`SELECT COUNT(*) as total FROM cancelados ${whereClause}`, vals);
  return { registros: rows, total: Number(countRow.total) };
}

export async function criarCancelado(data: {
  mes: number; ano: number; nome: string; cpf?: string;
  produto?: string; status: string; observacao?: string;
}) {
  const [result] = await getPool().execute(
    `INSERT INTO cancelados (mes, ano, nome, cpf, produto, status, observacao) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.mes, data.ano, data.nome, data.cpf ?? null, data.produto ?? null, data.status, data.observacao ?? null]
  ) as any;
  return result.insertId as number;
}

export async function atualizarCancelado(id: number, data: Partial<{
  nome: string; cpf: string; produto: string; status: string;
  observacao: string; mes: number; ano: number;
}>) {
  const sets: string[] = [];
  const vals: any[] = [];
  if (data.nome !== undefined) { sets.push("nome = ?"); vals.push(data.nome); }
  if (data.cpf !== undefined) { sets.push("cpf = ?"); vals.push(data.cpf); }
  if (data.produto !== undefined) { sets.push("produto = ?"); vals.push(data.produto); }
  if (data.status !== undefined) { sets.push("status = ?"); vals.push(data.status); }
  if (data.observacao !== undefined) { sets.push("observacao = ?"); vals.push(data.observacao); }
  if (data.mes !== undefined) { sets.push("mes = ?"); vals.push(data.mes); }
  if (data.ano !== undefined) { sets.push("ano = ?"); vals.push(data.ano); }
  if (sets.length === 0) return;
  vals.push(id);
  await getPool().execute(`UPDATE cancelados SET ${sets.join(", ")} WHERE id = ?`, vals);
}

export async function excluirCancelado(id: number) {
  await getPool().execute(`DELETE FROM cancelados WHERE id = ?`, [id]);
}

// ─── Métricas ─────────────────────────────────────────────────────────────────

export async function metricasCanceladosMensal(mes: number, ano: number) {
  const [totais] = await query<any>(
    `SELECT COUNT(*) as total FROM cancelados WHERE mes = ? AND ano = ?`,
    [mes, ano]
  );
  const porStatus = await query<any>(
    `SELECT status, COUNT(*) as qtd FROM cancelados WHERE mes = ? AND ano = ? GROUP BY status ORDER BY qtd DESC`,
    [mes, ano]
  );
  const porProduto = await query<any>(
    `SELECT COALESCE(produto, 'Não informado') as produto, COUNT(*) as qtd
     FROM cancelados WHERE mes = ? AND ano = ?
     GROUP BY produto ORDER BY qtd DESC LIMIT 10`,
    [mes, ano]
  );
  return {
    total: Number(totais.total),
    porStatus: porStatus.map((r: any) => ({ status: r.status, qtd: Number(r.qtd) })),
    porProduto: porProduto.map((r: any) => ({ produto: r.produto, qtd: Number(r.qtd) })),
  };
}

export async function metricasCanceladosAnual(ano: number) {
  const porMes = await query<any>(
    `SELECT mes, COUNT(*) as total,
      SUM(status = 'DESISTIU') as desistiu,
      SUM(status = 'INADIMPLENTE') as inadimplente,
      SUM(status = 'OBITO') as obito,
      SUM(status = 'REGULACAO') as regulacao,
      SUM(status = 'ALTERACAO_BENEFICIO') as alteracao_beneficio,
      SUM(status = 'RECUPERADO') as recuperado
     FROM cancelados WHERE ano = ? GROUP BY mes ORDER BY mes`,
    [ano]
  );
  const [totais] = await query<any>(
    `SELECT COUNT(*) as total,
      SUM(status = 'DESISTIU') as desistiu,
      SUM(status = 'INADIMPLENTE') as inadimplente,
      SUM(status = 'OBITO') as obito,
      SUM(status = 'REGULACAO') as regulacao,
      SUM(status = 'ALTERACAO_BENEFICIO') as alteracao_beneficio,
      SUM(status = 'RECUPERADO') as recuperado
     FROM cancelados WHERE ano = ?`,
    [ano]
  );
  return {
    porMes: porMes.map((r: any) => ({
      mes: Number(r.mes),
      total: Number(r.total),
      desistiu: Number(r.desistiu || 0),
      inadimplente: Number(r.inadimplente || 0),
      obito: Number(r.obito || 0),
      regulacao: Number(r.regulacao || 0),
      alteracao_beneficio: Number(r.alteracao_beneficio || 0),
      recuperado: Number(r.recuperado || 0),
    })),
    totais: {
      total: Number(totais.total || 0),
      desistiu: Number(totais.desistiu || 0),
      inadimplente: Number(totais.inadimplente || 0),
      obito: Number(totais.obito || 0),
      regulacao: Number(totais.regulacao || 0),
      alteracao_beneficio: Number(totais.alteracao_beneficio || 0),
      recuperado: Number(totais.recuperado || 0),
    },
  };
}

export async function anosDisponiveisCancelados(): Promise<number[]> {
  const rows = await query<any>(`SELECT DISTINCT ano FROM cancelados ORDER BY ano DESC`);
  return rows.map((r: any) => Number(r.ano));
}

// ─── Entrada vs Saída ─────────────────────────────────────────────────────────

export async function entradaSaidaMensal(ano: number) {
  // Saídas por mês: DESISTIU + INADIMPLENTE + OBITO (excluindo RECUPERADO, REGULACAO, ALTERACAO_BENEFICIO)
  const saidas = await query<any>(
    `SELECT mes,
      COUNT(*) as totalSaidas,
      SUM(status = 'DESISTIU') as desistiu,
      SUM(status = 'INADIMPLENTE') as inadimplente,
      SUM(status = 'OBITO') as obito
     FROM cancelados
     WHERE ano = ? AND status IN ('DESISTIU','INADIMPLENTE','OBITO')
     GROUP BY mes ORDER BY mes`,
    [ano]
  );

  // Clientes novos por mês: cpfNovo = 'SIM' na tabela vendas
  const entradas = await query<any>(
    `SELECT mes,
      COUNT(*) as totalNovos
     FROM vendas
     WHERE ano = ? AND cpfNovo = 'SIM'
     GROUP BY mes ORDER BY mes`,
    [ano]
  );

  // Montar array com 12 meses
  const meses = Array.from({ length: 12 }, (_, i) => i + 1);
  return meses.map(mes => {
    const s = saidas.find((r: any) => Number(r.mes) === mes);
    const e = entradas.find((r: any) => Number(r.mes) === mes);
    const totalSaidas = Number(s?.totalSaidas || 0);
    const totalNovos = Number(e?.totalNovos || 0);
    return {
      mes,
      totalNovos,
      totalSaidas,
      desistiu: Number(s?.desistiu || 0),
      inadimplente: Number(s?.inadimplente || 0),
      obito: Number(s?.obito || 0),
      saldo: totalNovos - totalSaidas,
    };
  });
}

export async function entradaSaidaAcumulada(ano: number) {
  const mensal = await entradaSaidaMensal(ano);
  const totalNovos = mensal.reduce((a, m) => a + m.totalNovos, 0);
  const totalSaidas = mensal.reduce((a, m) => a + m.totalSaidas, 0);
  return {
    mensal,
    totais: {
      totalNovos,
      totalSaidas,
      desistiu: mensal.reduce((a, m) => a + m.desistiu, 0),
      inadimplente: mensal.reduce((a, m) => a + m.inadimplente, 0),
      obito: mensal.reduce((a, m) => a + m.obito, 0),
      saldo: totalNovos - totalSaidas,
    },
  };
}

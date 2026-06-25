import { getDb } from "./db";
import { tarefas, tarefaOcorrencias } from "../drizzle/schema";
import { eq, and, gte, lte, lt, ne, desc, asc, isNull, or, notInArray, inArray, sql } from "drizzle-orm";
import { getPool } from "./sharedPool";
async function rawQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await getPool().execute(sql, params);
  return rows as T[];
}

// ─── HELPER: normaliza Date ou string para "YYYY-MM-DD" ─────────────────────
function toDateStr(raw: Date | string | null | undefined): string {
  if (!raw) return "";
  if (raw instanceof Date) {
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, "0");
    const d = String(raw.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(raw).substring(0, 10);
}

// ─── HELPER: verifica se uma tarefa recorrente deve aparecer em determinada data ─
function tarefaAparece(tarefa: { recorrente: boolean | null; recorrencia: string | null; diasSemana: string | null; dataAgendada: Date | string | null }, dataStr: string): boolean {
  if (!tarefa.recorrente) return false;
  const d = new Date(dataStr + "T12:00:00");
  const diaSemana = d.getDay(); // 0=Dom, 1=Seg, ..., 6=Sáb
  const diaDoMes = d.getDate();

  if (tarefa.recorrencia === "DIARIA") return true;

  if (tarefa.recorrencia === "SEMANAL") {
    if (!tarefa.diasSemana) return true;
    const dias = tarefa.diasSemana.split(",").map(Number);
    return dias.includes(diaSemana);
  }

  if (tarefa.recorrencia === "MENSAL") {
    if (tarefa.dataAgendada) {
      const refStr = toDateStr(tarefa.dataAgendada);
      const ref = new Date(refStr + "T12:00:00");
      return ref.getDate() === diaDoMes;
    }
    return true;
  }

  return false;
}

// ─── HELPER: busca ocorrências de tarefas recorrentes para um conjunto de datas ─
async function buscarOcorrencias(appUserId: number, tarefaIds: number[], datas: string[]) {
  if (tarefaIds.length === 0 || datas.length === 0) return new Map<string, { status: string; tempoExecucaoSeg: number }>();
  const db = await getDb();
  if (!db) return new Map<string, { status: string; tempoExecucaoSeg: number }>();

  // Busca todas as ocorrências para os IDs e datas informados
  const placeholders = tarefaIds.map(() => "?").join(",");
  const dataPlaceholders = datas.map(() => "?").join(",");
  const rows = await rawQuery(
    `SELECT tarefaId, data, status, tempoExecucaoSeg FROM tarefa_ocorrencias WHERE appUserId = ? AND tarefaId IN (${placeholders}) AND data IN (${dataPlaceholders})`,
    [appUserId, ...tarefaIds, ...datas]
  ) as any[];

  const map = new Map<string, { status: string; tempoExecucaoSeg: number }>();
  for (const row of (rows || [])) {
    const key = `${row.tarefaId}__${toDateStr(row.data)}`;
    map.set(key, { status: row.status, tempoExecucaoSeg: row.tempoExecucaoSeg ?? 0 });
  }
  return map;
}

// ─── HELPER: verifica se uma data é anterior a hoje (atrasada) ───────────────
function isAtrasada(dataStr: string): boolean {
  // Comparar apenas a data, sem considerar hora ou timezone
  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  // Usar <= para marcar como atrasada apenas se a data for ANTERIOR (não igual)
  return dataStr < hojeStr;
}

// ─── LISTAR TAREFAS POR USUÁRIO E DATA ───────────────────────────────────────
export async function listarTarefasPorData(appUserId: number, data: string) {
  const db = await getDb();
  if (!db) return [];

  // CORRECAO: Calcular hoje para comparacao correta
  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

  const [fixas, recorrentes, atrasadasDiasAnteriores] = await Promise.all([
    db.select().from(tarefas)
      .where(and(eq(tarefas.appUserId, appUserId), sql`DATE(${tarefas.dataAgendada}) = ${data}`))
      .orderBy(asc(tarefas.horaAgendada), asc(tarefas.id)),
    db.select().from(tarefas)
      .where(and(eq(tarefas.appUserId, appUserId), eq(tarefas.recorrente, true)))
      .orderBy(asc(tarefas.horaAgendada), asc(tarefas.id)),
    // Tarefas fixas (nao recorrentes) de dias ANTERIORES que ainda estao pendentes/em execucao
    // CORRECAO: Buscar apenas tarefas com data < HOJE (nao < data consultada)
    db.select().from(tarefas)
      .where(and(
        eq(tarefas.appUserId, appUserId),
        eq(tarefas.recorrente, false),
        sql`DATE(${tarefas.dataAgendada}) < ${hojeStr}`,
        or(
          eq(tarefas.status, "PENDENTE"),
          eq(tarefas.status, "EM_EXECUCAO")
        )
      ))
      .orderBy(asc(tarefas.dataAgendada), asc(tarefas.horaAgendada), asc(tarefas.id)),
  ]);

  const recorrentesNoDia = recorrentes.filter(t => tarefaAparece(t, data));
  // Separar fixas em: fixas puras (não recorrentes) e recorrentes com dataAgendada
  const fixasPuras = fixas.filter(t => !t.recorrente);
  const idsFixasPuras = new Set(fixasPuras.map(t => t.id));
  const idsRecorrentesComData = new Set(fixas.filter(t => t.recorrente).map(t => t.id));
  // Recorrentes extras: as que aparecem hoje mas não têm dataAgendada = hoje
  const recorrentesExtras = recorrentesNoDia.filter(t => !idsFixasPuras.has(t.id) && !idsRecorrentesComData.has(t.id));
  // Todas as recorrentes que aparecem hoje (com ou sem dataAgendada)
  const todasRecorrentes = [...fixas.filter(t => t.recorrente), ...recorrentesExtras];

  // Busca ocorrências para TODAS as recorrentes neste dia
  const ocorrencias = await buscarOcorrencias(appUserId, todasRecorrentes.map(t => t.id), [data]);

  // Filtrar atrasadas: excluir as que já aparecem no dia atual (pelo id)
  const idsJaNoDia = new Set([...fixasPuras, ...todasRecorrentes].map(t => t.id));
  const atrasadasFiltradas = atrasadasDiasAnteriores.filter(t => !idsJaNoDia.has(t.id));

  // Se a data consultada é passada, remover da lista principal as tarefas fixas
  // PENDENTE/EM_EXECUCAO — elas já aparecem no dia atual como ATRASADA.
  const dataEhPassada = isAtrasada(data);
  const fixasPurasVisiveis = dataEhPassada
    ? fixasPuras.filter(t => t.status !== "PENDENTE" && t.status !== "EM_EXECUCAO")
    : fixasPuras;

  const todasTarefas = [...fixasPurasVisiveis, ...todasRecorrentes].sort((a, b) => {
    const ha = a.horaAgendada ?? "99:99";
    const hb = b.horaAgendada ?? "99:99";
    return ha.localeCompare(hb) || a.id - b.id;
  });

  const resultadoPrincipal = todasTarefas.map(t => {
    const ocKey = `${t.id}__${data}`;
    const ocorrencia = t.recorrente ? ocorrencias.get(ocKey) : null;

    // Para recorrentes: usa o status da ocorrência se existir, senão PENDENTE
    // Se a data é passada e não há ocorrência concluída, marca como ATRASADA
    let statusFinal = t.status as string;
    if (t.recorrente) {
      if (ocorrencia) {
        statusFinal = ocorrencia.status;
      } else if (isAtrasada(data)) {
        statusFinal = "ATRASADA";
  } else {       statusFinal = "PENDENTE";
      }
    }

    return {
      ...t,
      dataAgendada: t.dataAgendada ? toDateStr(t.dataAgendada) : null,
      createdAt: t.createdAt ? t.createdAt.toISOString() : null,
      updatedAt: t.updatedAt ? t.updatedAt.toISOString() : null,
      status: statusFinal as "PENDENTE" | "EM_EXECUCAO" | "CONCLUIDA" | "CANCELADA" | "ATRASADA",
      tempoExecucaoSeg: t.recorrente && ocorrencia ? ocorrencia.tempoExecucaoSeg : (t.tempoExecucaoSeg ?? 0),
      _dataOcorrencia: t.recorrente ? data : null,
    };
  });

  // Adicionar tarefas atrasadas de dias anteriores ao final da lista, marcadas como ATRASADA
  const resultadoAtrasadas = atrasadasFiltradas.map(t => ({
    ...t,
    dataAgendada: t.dataAgendada ? toDateStr(t.dataAgendada) : null,
    createdAt: t.createdAt ? t.createdAt.toISOString() : null,
    updatedAt: t.updatedAt ? t.updatedAt.toISOString() : null,
    status: "ATRASADA" as "PENDENTE" | "EM_EXECUCAO" | "CONCLUIDA" | "CANCELADA" | "ATRASADA",
    tempoExecucaoSeg: t.tempoExecucaoSeg ?? 0,
    _dataOcorrencia: null,
  }));

  const resultadoPrincipalFiltrado = resultadoPrincipal.filter(
    t => !(t.recorrente && t.status === "CANCELADA")
  );

  return [...resultadoPrincipalFiltrado, ...resultadoAtrasadas];
}

// ─── LISTAR TAREFAS SEM DATA (BACKLOG) ───────────────────────────────────────
export async function listarTarefasSemData(appUserId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(tarefas)
    .where(and(eq(tarefas.appUserId, appUserId), isNull(tarefas.dataAgendada), eq(tarefas.recorrente, false)))
    .orderBy(desc(tarefas.createdAt));
}

// ─── LISTAR TAREFAS DA SEMANA ─────────────────────────────────────────────────
export async function listarTarefasSemana(appUserId: number, dataInicio: string, dataFim: string) {
  const db = await getDb();
  if (!db) return [];

  const [fixas, recorrentes] = await Promise.all([
    db.select().from(tarefas)
      .where(and(
        eq(tarefas.appUserId, appUserId),
        gte(tarefas.dataAgendada, dataInicio as unknown as Date),
        lte(tarefas.dataAgendada, dataFim as unknown as Date)
      ))
      .orderBy(asc(tarefas.dataAgendada), asc(tarefas.horaAgendada)),
    db.select().from(tarefas)
      .where(and(eq(tarefas.appUserId, appUserId), eq(tarefas.recorrente, true)))
      .orderBy(asc(tarefas.horaAgendada), asc(tarefas.id)),
  ]);

  const diasSemana: string[] = [];
  const inicio = new Date(dataInicio + "T12:00:00");
  for (let i = 0; i < 7; i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const dy = String(d.getDate()).padStart(2, "0");
    diasSemana.push(`${y}-${mo}-${dy}`);
  }

  const idsFixas = new Set(fixas.map(t => t.id));
  const extras: (typeof fixas[0] & { _dataOcorrencia?: string | null })[] = [];

  for (const dia of diasSemana) {
    for (const t of recorrentes) {
      if (!idsFixas.has(t.id) && tarefaAparece(t, dia)) {
        extras.push({ ...t, dataAgendada: dia as unknown as Date });
      }
    }
  }

  // Busca ocorrências para todos os recorrentes nas datas da semana
  const recorrentesIds = recorrentes.map(t => t.id);
  const ocorrencias = await buscarOcorrencias(appUserId, recorrentesIds, diasSemana);

  return [...fixas, ...extras].sort((a, b) => {
    const da = toDateStr(a.dataAgendada) || "9999-99-99";
    const db2 = toDateStr(b.dataAgendada) || "9999-99-99";
    return da.localeCompare(db2) || (a.horaAgendada ?? "99:99").localeCompare(b.horaAgendada ?? "99:99");
  }).map(t => {
    const dataStr = toDateStr(t.dataAgendada);
    const ocKey = `${t.id}__${dataStr}`;
    const ocorrencia = t.recorrente ? ocorrencias.get(ocKey) : null;

    let statusFinal = t.status as string;
    if (t.recorrente) {
      if (ocorrencia) {
        statusFinal = ocorrencia.status;
      } else if (isAtrasada(dataStr)) {
        statusFinal = "ATRASADA";
      } else {
        statusFinal = "PENDENTE";
      }
    }

    return {
      ...t,
      dataAgendada: dataStr || null,
      createdAt: t.createdAt ? t.createdAt.toISOString() : null,
      updatedAt: t.updatedAt ? t.updatedAt.toISOString() : null,
      status: statusFinal as "PENDENTE" | "EM_EXECUCAO" | "CONCLUIDA" | "CANCELADA" | "ATRASADA",
      tempoExecucaoSeg: t.recorrente && ocorrencia ? ocorrencia.tempoExecucaoSeg : (t.tempoExecucaoSeg ?? 0),
      _dataOcorrencia: t.recorrente ? dataStr : null,
    };
  }).filter(t => !(t.recorrente && t.status === "CANCELADA"));
}

// ─── CRIAR TAREFA ─────────────────────────────────────────────────────────────
export async function criarTarefa(data: {
  appUserId: number;
  titulo: string;
  descricao?: string;
  triade: "IMPORTANTE" | "URGENTE" | "CIRCUNSTANCIAL";
  categoria: "COMERCIAL" | "SAUDE" | "CASA_FAMILIA" | "PESSOAL" | "FINANCEIRO" | "EDUCACAO" | "OUTROS";
  duracaoMin?: number;
  dataAgendada?: string;
  horaAgendada?: string;
  recorrente?: boolean;
  recorrencia?: "DIARIA" | "SEMANAL" | "MENSAL";
  diasSemana?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  return db.insert(tarefas).values({
    appUserId: data.appUserId,
    titulo: data.titulo,
    descricao: data.descricao,
    triade: data.triade,
    categoria: data.categoria,
    duracaoMin: data.duracaoMin ?? 30,
    dataAgendada: (data.dataAgendada && data.dataAgendada.trim()) ? (data.dataAgendada as unknown as Date) : null,
    horaAgendada: data.horaAgendada,
    status: "PENDENTE",
    recorrente: data.recorrente ?? false,
    recorrencia: data.recorrencia,
    diasSemana: data.diasSemana,
  });
}

// ─── DUPLICAR TAREFA ──────────────────────────────────────────────────────────
// Cria uma cópia idêntica da tarefa (sem o histórico de execução), opcionalmente
// para outra data ou sem data (backlog).
export async function duplicarTarefa(
  id: number,
  appUserId: number,
  novaData?: string | null
) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  // Busca a tarefa original
  const orig = await db.select().from(tarefas)
    .where(and(eq(tarefas.id, id), eq(tarefas.appUserId, appUserId)))
    .limit(1);
  if (!orig[0]) throw new Error("Tarefa não encontrada");
  const t = orig[0];
  // Insere uma cópia. Status reseta para PENDENTE, tempo zerado.
  // Se novaData === null  -> tarefa sem data (backlog)
  // Se novaData === undefined -> mantém a data original (duplica no mesmo dia)
  // Se novaData === "YYYY-MM-DD" -> usa essa data
  const dataFinal = novaData === null
    ? null
    : novaData === undefined
      ? t.dataAgendada
      : (novaData as unknown as Date);
  return db.insert(tarefas).values({
    appUserId: t.appUserId,
    titulo: t.titulo,
    descricao: t.descricao,
    triade: t.triade,
    categoria: t.categoria,
    duracaoMin: t.duracaoMin,
    dataAgendada: dataFinal,
    horaAgendada: t.horaAgendada,
    status: "PENDENTE",
    tempoExecucaoSeg: 0,
    recorrente: t.recorrente,
    recorrencia: t.recorrencia,
    diasSemana: t.diasSemana,
  });
}

// ─── ATUALIZAR TAREFA ─────────────────────────────────────────────────────────
export async function atualizarTarefa(
  id: number,
  appUserId: number,
  data: Partial<{
    titulo: string;
    descricao: string;
    triade: "IMPORTANTE" | "URGENTE" | "CIRCUNSTANCIAL";
    categoria: "COMERCIAL" | "SAUDE" | "CASA_FAMILIA" | "PESSOAL" | "FINANCEIRO" | "EDUCACAO" | "OUTROS";
    duracaoMin: number;
    dataAgendada: string;
    horaAgendada: string;
    status: "PENDENTE" | "EM_EXECUCAO" | "CONCLUIDA" | "CANCELADA";
    tempoExecucaoSeg: number;
    recorrente: boolean;
    recorrencia: "DIARIA" | "SEMANAL" | "MENSAL";
    diasSemana: string;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  const { dataAgendada, ...rest } = data;
  // Se dataAgendada vier vazia ou null, salva como NULL (move pro backlog).
  // Se vier undefined, mantém o valor atual (não mexe na coluna).
  let dataParaSalvar: Date | null | undefined = undefined;
  if (dataAgendada !== undefined) {
    dataParaSalvar = (dataAgendada === "" || dataAgendada === null) ? null : (dataAgendada as unknown as Date);
  }
  await db
    .update(tarefas)
    .set({
      ...rest,
      ...(dataParaSalvar !== undefined ? { dataAgendada: dataParaSalvar } : {}),
    })
    .where(and(eq(tarefas.id, id), eq(tarefas.appUserId, appUserId)));
}

// ─── CONCLUIR TAREFA ──────────────────────────────────────────────────────────
// Para tarefas recorrentes, registra a ocorrência na tabela tarefa_ocorrencias
// Para tarefas normais, atualiza o status diretamente na tabela tarefas
export async function concluirTarefa(id: number, appUserId: number, tempoExecucaoSeg?: number, dataOcorrencia?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");

  // Verifica se é uma tarefa recorrente
  const [tarefa] = await db.select().from(tarefas).where(and(eq(tarefas.id, id), eq(tarefas.appUserId, appUserId)));
  if (!tarefa) throw new Error("Tarefa não encontrada");

  // CORREÇÃO: Se nenhum tempo foi fornecido, usar duracaoMin como tempo exercido (convertido para segundos)
  const tempoExecucaoFinal = tempoExecucaoSeg !== undefined && tempoExecucaoSeg > 0 
    ? tempoExecucaoSeg 
    : (tarefa.duracaoMin ?? 0) * 60; // Converter minutos para segundos

  if (tarefa.recorrente && dataOcorrencia) {
    // Registra/atualiza a ocorrência para este dia específico
    // SEMPRE registra tempoExecucaoFinal (fornecido ou calculado a partir de duracaoMin)
    await rawQuery(
      `INSERT INTO tarefa_ocorrencias (tarefaId, appUserId, data, status, tempoExecucaoSeg)
       VALUES (?, ?, ?, 'CONCLUIDA', ?)
       ON DUPLICATE KEY UPDATE status = 'CONCLUIDA', tempoExecucaoSeg = ?`,
      [id, appUserId, dataOcorrencia, tempoExecucaoFinal, tempoExecucaoFinal]
    );
  } else {
    // Tarefa normal: atualiza diretamente
    // Se dataOcorrencia foi passada (tarefa atrasada concluída hoje), mover dataAgendada para hoje
    // SEMPRE registra tempoExecucaoFinal (sem verificação tempoValido)
    await rawQuery(
      `UPDATE tarefas SET status = 'CONCLUIDA', tempoExecucaoSeg = ?${dataOcorrencia ? ', dataAgendada = ?' : ''} WHERE id = ? AND appUserId = ?`,
      dataOcorrencia
        ? [tempoExecucaoFinal, dataOcorrencia, id, appUserId]
        : [tempoExecucaoFinal, id, appUserId]
    );
  }
}

// ─── EXCLUIR TAREFA ───────────────────────────────────────────────────────────
export async function excluirTarefa(id: number, appUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await db.delete(tarefas).where(and(eq(tarefas.id, id), eq(tarefas.appUserId, appUserId)));
}

// ─── EXCLUIR OCORRÊNCIA (cancelar só no dia) ─────────────────────────────────
// Usado em tarefas recorrentes para ocultar só a ocorrência de uma data específica.
export async function excluirOcorrenciaTarefa(id: number, appUserId: number, data: string) {
  const db = await getDb();
  if (!db) throw new Error("DB indisponível");
  await rawQuery(
    `INSERT INTO tarefa_ocorrencias (tarefaId, appUserId, data, status, tempoExecucaoSeg)
     VALUES (?, ?, ?, 'CANCELADA', 0)
     ON DUPLICATE KEY UPDATE status = 'CANCELADA'`,
    [id, appUserId, data]
  );
}

// ─── SCORE DE PRODUTIVIDADE ───────────────────────────────────────────────────
export async function obterScoreProdutividade(appUserId: number, dataInicio: string, dataFim: string) {
  const db = await getDb();
  if (!db) return { total: 0, importante: 0, urgente: 0, circunstancial: 0, pctImportante: 0, pctUrgente: 0, pctCircunstancial: 0 };

  const rows = await db
    .select()
    .from(tarefas)
    .where(
      and(
        eq(tarefas.appUserId, appUserId),
        gte(tarefas.dataAgendada, dataInicio as unknown as Date),
        lte(tarefas.dataAgendada, dataFim as unknown as Date),
        eq(tarefas.status, "CONCLUIDA")
      )
    );

  const total = rows.length;
  if (total === 0) return { total: 0, importante: 0, urgente: 0, circunstancial: 0, pctImportante: 0, pctUrgente: 0, pctCircunstancial: 0 };

  const importante = rows.filter((r) => r.triade === "IMPORTANTE").length;
  const urgente = rows.filter((r) => r.triade === "URGENTE").length;
  const circunstancial = rows.filter((r) => r.triade === "CIRCUNSTANCIAL").length;

  return {
    total,
    importante,
    urgente,
    circunstancial,
    pctImportante: Math.round((importante / total) * 100),
    pctUrgente: Math.round((urgente / total) * 100),
    pctCircunstancial: Math.round((circunstancial / total) * 100),
  };
}

// ─── Listar tarefas FIXAS num período arbitrário (para relatórios) ────────────
// Não expande recorrências — apenas tarefas com dataAgendada dentro do intervalo
// e tarefas recorrentes com tempo executado em ocorrências dentro do intervalo.
export async function listarTarefasPorPeriodo(
  appUserId: number,
  dataInicio: string,
  dataFim: string
) {
  const db = await getDb();
  if (!db) return [];

  // 1) Tarefas com dataAgendada no período (fixas + recorrentes com data)
  const fixas = await db.select().from(tarefas)
    .where(and(
      eq(tarefas.appUserId, appUserId),
      sql`DATE(${tarefas.dataAgendada}) >= ${dataInicio}`,
      sql`DATE(${tarefas.dataAgendada}) <= ${dataFim}`
    ))
    .orderBy(asc(tarefas.dataAgendada), asc(tarefas.horaAgendada));

  // 2) Ocorrências de tarefas recorrentes no período (com tempo > 0)
  const ocorrencias = await rawQuery<{
    tarefaId: number;
    data: string;
    status: string;
    tempoExecucaoSeg: number;
  }>(
    `SELECT o.tarefaId, o.data, o.status, o.tempoExecucaoSeg
     FROM tarefa_ocorrencias o
     INNER JOIN tarefas t ON t.id = o.tarefaId
     WHERE t.appUserId = ?
       AND DATE(o.data) >= ?
       AND DATE(o.data) <= ?
       AND (o.tempoExecucaoSeg > 0 OR o.status = 'CONCLUIDA')`,
    [appUserId, dataInicio, dataFim]
  );

  // Buscar dados completos das tarefas das ocorrências
  const idsRecorrentesComOcorrencia = [
    ...new Set(ocorrencias.map(o => o.tarefaId))
  ].filter(id => !fixas.find(f => f.id === id));
  
  const tarefasRecorrentesInfo = idsRecorrentesComOcorrencia.length > 0
    ? await db.select().from(tarefas)
        .where(and(
          eq(tarefas.appUserId, appUserId),
          inArray(tarefas.id, idsRecorrentesComOcorrencia)
        ))
    : [];

  // Resultado: tarefas com dataAgendada + ocorrências de recorrentes
  const resultado: Array<{
    id: number;
    titulo: string;
    categoria: string;
    triade: string;
    status: string;
    duracaoMin: number;
    tempoExecucaoSeg: number;
    data: string;
    recorrente: boolean;
  }> = [];

  // Tarefas fixas
  for (const t of fixas) {
    resultado.push({
      id: t.id,
      titulo: t.titulo ?? "",
      categoria: t.categoria ?? "OUTROS",
      triade: t.triade ?? "CIRCUNSTANCIAL",
      status: t.status ?? "PENDENTE",
      duracaoMin: t.duracaoMin ?? 0,
      tempoExecucaoSeg: t.tempoExecucaoSeg ?? 0,
      data: toDateStr(t.dataAgendada),
      recorrente: !!t.recorrente,
    });
  }

  // Ocorrências de recorrentes
  for (const o of ocorrencias) {
    const t = tarefasRecorrentesInfo.find(x => x.id === o.tarefaId)
           || fixas.find(f => f.id === o.tarefaId);
    if (!t) continue;
    // Se já está na lista (fixas) com mesma data, pula
    const dataOcorrencia = toDateStr(o.data as any);
    const jaTem = resultado.some(r => r.id === t.id && r.data === dataOcorrencia);
    if (jaTem) continue;
    resultado.push({
      id: t.id,
      titulo: t.titulo ?? "",
      categoria: t.categoria ?? "OUTROS",
      triade: t.triade ?? "CIRCUNSTANCIAL",
      status: o.status ?? "PENDENTE",
      duracaoMin: t.duracaoMin ?? 0,
      tempoExecucaoSeg: o.tempoExecucaoSeg ?? 0,
      data: dataOcorrencia,
      recorrente: true,
    });
  }
  return resultado;
}
// ─── BUSCA GLOBAL DE TAREFAS ──────────────────────────────────────────────────
// Procura tarefas por nome/título, descrição, categoria, tríade ou status.
// Retorna até 200 resultados, ordenados pelas mais recentes primeiro.
export async function buscarTarefas(appUserId: number, termo: string) {
  const db = await getDb();
  if (!db) return [];
  const termoLimpo = termo.trim();
  if (!termoLimpo) return [];
  const padrao = `%${termoLimpo}%`;
  const rows = await rawQuery<{
    id: number; titulo: string; descricao: string | null;
    triade: string; categoria: string; status: string;
    duracaoMin: number | null; tempoExecucaoSeg: number | null;
    dataAgendada: Date | string | null; horaAgendada: string | null;
    recorrente: number | boolean; createdAt: Date | string;
  }>(
    `SELECT id, titulo, descricao, triade, categoria, status,
            duracaoMin, tempoExecucaoSeg, dataAgendada, horaAgendada,
            recorrente, createdAt
     FROM tarefas
     WHERE appUserId = ?
       AND (
         titulo LIKE ?
         OR descricao LIKE ?
         OR categoria LIKE ?
         OR triade LIKE ?
         OR status LIKE ?
       )
     ORDER BY COALESCE(dataAgendada, createdAt) DESC, id DESC
     LIMIT 200`,
    [appUserId, padrao, padrao, padrao, padrao, padrao]
  );
  return (rows || []).map(r => ({
    ...r,
    dataAgendada: r.dataAgendada ? toDateStr(r.dataAgendada) : null,
    recorrente: !!r.recorrente,
  }));
}

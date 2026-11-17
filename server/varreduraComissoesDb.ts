import { getPool } from "./sharedPool";
import { calcularMotivo } from "./motivoComissao";

async function rawQuery<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await getPool().execute(sql, params);
  return rows as T[];
}

export async function ensureVarreduraComissoesTable() {
  await getPool().execute(`
    CREATE TABLE IF NOT EXISTS varredura_comissoes_pendentes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      mes INT NOT NULL,
      ano INT NOT NULL,
      cpf VARCHAR(20) NOT NULL,
      nome VARCHAR(255) NOT NULL,
      formaPagamento VARCHAR(100),
      valorPrevisto DECIMAL(15,2),
      valorPagoArrecadacao DECIMAL(15,2),
      statusArrecadacao VARCHAR(50),
      dataPagamentoArrecadacao VARCHAR(20),
      obsArrecadacao TEXT,
      comissaoValor DECIMAL(15,2),
      comissaoDatas VARCHAR(255),
      comissaoObs TEXT,
      ondeEstaMag TEXT,
      observacao TEXT,
      jobId VARCHAR(50),
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_varredura_mes_ano_cpf (mes, ano, cpf)
    )
  `);
  // Coluna adicionada depois da criação inicial da tabela — ALTER separado
  // porque CREATE TABLE IF NOT EXISTS não altera tabela já existente. Falha
  // silenciosamente se a coluna já existir (mesmo padrão das outras migrações).
  await getPool().execute(
    `ALTER TABLE varredura_comissoes_pendentes ADD COLUMN observacao TEXT`
  ).catch(() => {});
  for (const col of [
    "motivo VARCHAR(80)", "motivoDetalhe TEXT", "statusFatura VARCHAR(50)",
    "vencimentoFatura VARCHAR(20)", "orgaoConsignante VARCHAR(200)", "nomeMag VARCHAR(255)",
    "arrecadacaoMesesVizinhos TEXT",
  ]) {
    await getPool().execute(`ALTER TABLE varredura_comissoes_pendentes ADD COLUMN ${col}`).catch(() => {});
  }
}

export interface VarreduraResultadoInput {
  mes: number;
  ano: number;
  cpf: string;
  nome: string;
  formaPagamento?: string | null;
  valorPrevisto?: number | null;
  valorPagoArrecadacao?: number | null;
  statusArrecadacao?: string | null;
  dataPagamentoArrecadacao?: string | null;
  obsArrecadacao?: string | null;
  comissaoValor?: number | null;
  comissaoDatas?: string | null;
  comissaoObs?: string | null;
  ondeEstaMag?: string | null;
  statusFatura?: string | null;
  vencimentoFatura?: string | null;
  orgaoConsignante?: string | null;
  nomeMag?: string | null;
  arrecadacaoMesesVizinhos?: string | null;
  jobId: string;
}

// Upsert incremental — chamado a cada cliente processado pelo script local,
// para o resultado sobreviver mesmo se o job em memória (Map) se perder.
export async function salvarResultadoVarredura(r: VarreduraResultadoInput) {
  const cpfLimpo = (r.cpf || "").replace(/\D/g, "");
  const m = await calcularMotivo({ ...r, cpf: cpfLimpo }).catch(() => ({ motivo: null as any, motivoDetalhe: null as any }));
  await getPool().execute(
    `INSERT INTO varredura_comissoes_pendentes
       (mes, ano, cpf, nome, formaPagamento, valorPrevisto, valorPagoArrecadacao,
        statusArrecadacao, dataPagamentoArrecadacao, obsArrecadacao,
        comissaoValor, comissaoDatas, comissaoObs, ondeEstaMag, jobId,
        statusFatura, vencimentoFatura, orgaoConsignante, nomeMag, arrecadacaoMesesVizinhos, motivo, motivoDetalhe)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       nome = VALUES(nome),
       formaPagamento = VALUES(formaPagamento),
       valorPrevisto = VALUES(valorPrevisto),
       valorPagoArrecadacao = VALUES(valorPagoArrecadacao),
       statusArrecadacao = VALUES(statusArrecadacao),
       dataPagamentoArrecadacao = VALUES(dataPagamentoArrecadacao),
       obsArrecadacao = VALUES(obsArrecadacao),
       comissaoValor = VALUES(comissaoValor),
       comissaoDatas = VALUES(comissaoDatas),
       comissaoObs = VALUES(comissaoObs),
       ondeEstaMag = VALUES(ondeEstaMag),
       jobId = VALUES(jobId),
       statusFatura = VALUES(statusFatura),
       vencimentoFatura = VALUES(vencimentoFatura),
       orgaoConsignante = VALUES(orgaoConsignante),
       nomeMag = VALUES(nomeMag),
       arrecadacaoMesesVizinhos = VALUES(arrecadacaoMesesVizinhos),
       motivo = VALUES(motivo),
       motivoDetalhe = VALUES(motivoDetalhe)`,
    [
      r.mes, r.ano, cpfLimpo, r.nome,
      r.formaPagamento ?? null, r.valorPrevisto ?? null, r.valorPagoArrecadacao ?? null,
      r.statusArrecadacao ?? null, r.dataPagamentoArrecadacao ?? null, r.obsArrecadacao ?? null,
      r.comissaoValor ?? null, r.comissaoDatas ?? null, r.comissaoObs ?? null,
      r.ondeEstaMag ?? null, r.jobId,
      r.statusFatura ?? null, r.vencimentoFatura ?? null, r.orgaoConsignante ?? null, r.nomeMag ?? null,
      r.arrecadacaoMesesVizinhos ?? null, m.motivo, m.motivoDetalhe,
    ]
  );
}

// Recalcula o motivo das linhas já gravadas (ex.: resultados antigos, antes da coluna existir)
export async function recalcularMotivosVarredura(mes: number, ano: number, somenteVazios = true) {
  const rows = await rawQuery<any>(
    `SELECT * FROM varredura_comissoes_pendentes WHERE mes = ? AND ano = ?${somenteVazios ? " AND motivo IS NULL" : ""}`,
    [mes, ano]
  );
  for (const r of rows) {
    const m = await calcularMotivo({ ...r, mes, ano });
    await getPool().execute(`UPDATE varredura_comissoes_pendentes SET motivo = ?, motivoDetalhe = ? WHERE id = ?`, [m.motivo, m.motivoDetalhe, r.id]);
  }
  return rows.length;
}

export async function obterResultadoVarredura(mes: number, ano: number) {
  return rawQuery(
    `SELECT * FROM varredura_comissoes_pendentes WHERE mes = ? AND ano = ? ORDER BY nome`,
    [mes, ano]
  );
}

// Limpa resultados antigos de um mês/ano antes de rodar uma nova varredura
// (evita misturar clientes de uma execução anterior que não fazem mais parte da lista atual)
export async function limparResultadoVarredura(mes: number, ano: number) {
  await getPool().execute(
    `DELETE FROM varredura_comissoes_pendentes WHERE mes = ? AND ano = ?`,
    [mes, ano]
  );
}

// Edição manual — usuário anota o motivo/observação de um caso direto na tela
export async function atualizarObservacaoVarredura(id: number, observacao: string) {
  await getPool().execute(
    `UPDATE varredura_comissoes_pendentes SET observacao = ? WHERE id = ?`,
    [observacao, id]
  );
}

import { getPool } from "./sharedPool";

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
      jobId VARCHAR(50),
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_varredura_mes_ano_cpf (mes, ano, cpf)
    )
  `);
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
  jobId: string;
}

// Upsert incremental — chamado a cada cliente processado pelo script local,
// para o resultado sobreviver mesmo se o job em memória (Map) se perder.
export async function salvarResultadoVarredura(r: VarreduraResultadoInput) {
  const cpfLimpo = (r.cpf || "").replace(/\D/g, "");
  await getPool().execute(
    `INSERT INTO varredura_comissoes_pendentes
       (mes, ano, cpf, nome, formaPagamento, valorPrevisto, valorPagoArrecadacao,
        statusArrecadacao, dataPagamentoArrecadacao, obsArrecadacao,
        comissaoValor, comissaoDatas, comissaoObs, ondeEstaMag, jobId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       jobId = VALUES(jobId)`,
    [
      r.mes, r.ano, cpfLimpo, r.nome,
      r.formaPagamento ?? null, r.valorPrevisto ?? null, r.valorPagoArrecadacao ?? null,
      r.statusArrecadacao ?? null, r.dataPagamentoArrecadacao ?? null, r.obsArrecadacao ?? null,
      r.comissaoValor ?? null, r.comissaoDatas ?? null, r.comissaoObs ?? null,
      r.ondeEstaMag ?? null, r.jobId,
    ]
  );
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

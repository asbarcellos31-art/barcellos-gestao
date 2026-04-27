#!/usr/bin/env python3
with open('server/comissoesDb.ts', 'r') as f:
    content = f.read()

# Encontrar as linhas 68-158 (do comentário RESUMO até o fim de metricasComissoes)
lines = content.split('\n')

# Encontrar índice da linha com RESUMO POR CORRETOR
start_line = None
end_line = None
for i, line in enumerate(lines):
    if '// \u2500\u2500\u2500 RESUMO POR CORRETOR' in line:
        start_line = i
    if '// \u2500\u2500\u2500 INADIMPLENTES' in line:
        end_line = i
        break

print(f"Substituindo linhas {start_line} a {end_line-1}")

new_block = '''// \u2500\u2500\u2500 CRUD DE VENDEDORES POR CLIENTE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export async function listarVendedoresCliente(clienteId: number) {
  const rows = await queryPool<{ id: number; nomeVendedor: string; percentual: string }>(
    `SELECT id, nomeVendedor, percentual FROM cliente_vendedores WHERE clienteId = ? ORDER BY id`,
    [clienteId]
  );
  return rows.map(r => ({ id: r.id, nomeVendedor: r.nomeVendedor, percentual: parseFloat(r.percentual) }));
}

export async function salvarVendedoresCliente(
  clienteId: number,
  vendedores: { nomeVendedor: string; percentual: number }[]
) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM cliente_vendedores WHERE clienteId = ?`, [clienteId]);
    if (vendedores.length > 0) {
      const placeholders = vendedores.map(() => `(?, ?, ?)`).join(", ");
      const flat = vendedores.flatMap(v => [clienteId, v.nomeVendedor, v.percentual.toFixed(2)]);
      await conn.execute(
        `INSERT INTO cliente_vendedores (clienteId, nomeVendedor, percentual) VALUES ${placeholders}`,
        flat
      );
      await conn.execute(
        `UPDATE clientes SET vendedor = ? WHERE id = ?`,
        [vendedores[0].nomeVendedor, clienteId]
      );
    } else {
      await conn.execute(`UPDATE clientes SET vendedor = NULL WHERE id = ?`, [clienteId]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// \u2500\u2500\u2500 RESUMO POR CORRETOR (usando cliente_vendedores para divis\u00e3o proporcional) \u2500\u2500\u2500

export async function resumoComissoesPorCorretor(mes?: number, ano?: number, vendedor?: string) {
  let query = `
    SELECT 
      cv.nomeVendedor as corretor,
      COUNT(DISTINCT e.cpfCliente) as totalClientes,
      COUNT(*) as totalRegistros,
      COALESCE(SUM(e.valorBase), 0) as totalBase,
      COALESCE(SUM(e.valorComissao * cv.percentual / 100), 0) as totalValorComissao,
      COALESCE(SUM(e.valorIncentivo * cv.percentual / 100), 0) as totalValorIncentivo,
      COALESCE(SUM(e.valorComissaoTotal * cv.percentual / 100), 0) as totalComissao,
      COALESCE(SUM(e.valorBase * cv.percentual / 100 * 0.15), 0) as totalPrevisao15,
      COALESCE(SUM(e.valorComissaoTotal * cv.percentual / 100), 0) as totalRealizado50
    FROM extrato_comissao e
    INNER JOIN clientes c ON LPAD(REGEXP_REPLACE(e.cpfCliente, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(e.cpfCliente, '[^0-9]', '')) <= 11, 11, 14), '0') = LPAD(REGEXP_REPLACE(c.cpf, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(c.cpf, '[^0-9]', '')) <= 11, 11, 14), '0')
    INNER JOIN cliente_vendedores cv ON cv.clienteId = c.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (mes) { query += ` AND e.mes = ?`; params.push(mes); }
  if (ano) { query += ` AND e.ano = ?`; params.push(ano); }
  if (vendedor) { query += ` AND cv.nomeVendedor = ?`; params.push(vendedor); }
  query += ` GROUP BY cv.nomeVendedor ORDER BY totalComissao DESC`;

  const rows = await queryPool<Record<string, unknown>>(query, params);
  return rows.map(r => ({
    corretor: String(r.corretor ?? ""),
    totalClientes: Number(r.totalClientes),
    totalRegistros: Number(r.totalRegistros),
    totalBase: parseFloat(String(r.totalBase ?? "0")),
    totalValorComissao: parseFloat(String(r.totalValorComissao ?? "0")),
    totalValorIncentivo: parseFloat(String(r.totalValorIncentivo ?? "0")),
    totalComissao: parseFloat(String(r.totalComissao ?? "0")),
    totalPrevisao15: parseFloat(String(r.totalPrevisao15 ?? "0")),
    totalRealizado50: parseFloat(String(r.totalRealizado50 ?? "0")),
    isElisia: String(r.corretor ?? "").toUpperCase() === 'ELISIA',
  }));
}

// \u2500\u2500\u2500 DETALHE DOS CLIENTES DE UM CORRETOR \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export async function detalheCorretorExtrato(vendedor: string, mes?: number, ano?: number) {
  let query = `
    SELECT 
      e.id, e.nomeCliente, e.cpfCliente, e.descricaoProduto,
      e.valorBase, e.valorComissao, e.pctComissao, e.valorIncentivo, e.pctIncentivo,
      e.valorComissaoTotal, e.pctComissaoTotal,
      e.competenciaComissionada, e.proposta, e.inscricao, e.mes, e.ano,
      cv.nomeVendedor as vendedor,
      cv.percentual as percentualVendedor,
      e.valorBase * cv.percentual / 100 * 0.15 as previsao15,
      e.valorComissaoTotal * cv.percentual / 100 as realizado50
    FROM extrato_comissao e
    INNER JOIN clientes c ON LPAD(REGEXP_REPLACE(e.cpfCliente, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(e.cpfCliente, '[^0-9]', '')) <= 11, 11, 14), '0') = LPAD(REGEXP_REPLACE(c.cpf, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(c.cpf, '[^0-9]', '')) <= 11, 11, 14), '0')
    INNER JOIN cliente_vendedores cv ON cv.clienteId = c.id AND cv.nomeVendedor = ?
    WHERE 1=1
  `;
  const params: (string | number)[] = [vendedor];
  if (mes) { query += ` AND e.mes = ?`; params.push(mes); }
  if (ano) { query += ` AND e.ano = ?`; params.push(ano); }
  query += ` ORDER BY e.nomeCliente LIMIT 500`;

  return queryPool<Record<string, unknown>>(query, params);
}

// \u2500\u2500\u2500 M\u00c9TRICAS GERAIS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export async function metricasComissoes(mes?: number, ano?: number, vendedor?: string) {
  let query = `
    SELECT 
      COALESCE(SUM(e.valorComissaoTotal * cv.percentual / 100), 0) as totalComissao,
      COUNT(DISTINCT cv.nomeVendedor) as totalCorretores,
      COUNT(DISTINCT e.cpfCliente) as totalClientes,
      COUNT(*) as totalRegistros
    FROM extrato_comissao e
    INNER JOIN clientes c ON LPAD(REGEXP_REPLACE(e.cpfCliente, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(e.cpfCliente, '[^0-9]', '')) <= 11, 11, 14), '0') = LPAD(REGEXP_REPLACE(c.cpf, '[^0-9]', ''), IF(LENGTH(REGEXP_REPLACE(c.cpf, '[^0-9]', '')) <= 11, 11, 14), '0')
    INNER JOIN cliente_vendedores cv ON cv.clienteId = c.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (mes) { query += ` AND e.mes = ?`; params.push(mes); }
  if (ano) { query += ` AND e.ano = ?`; params.push(ano); }
  if (vendedor) { query += ` AND cv.nomeVendedor = ?`; params.push(vendedor); }

  const rows = await queryPool<Record<string, unknown>>(query, params);
  const row = rows[0];

  return {
    totalComissao: parseFloat(String(row?.totalComissao ?? "0")),
    totalCorretores: Number(row?.totalCorretores ?? 0),
    totalClientes: Number(row?.totalClientes ?? 0),
    totalRegistros: Number(row?.totalRegistros ?? 0),
  };
}

'''

new_lines = new_block.split('\n')
result = lines[:start_line] + new_lines + lines[end_line:]
with open('server/comissoesDb.ts', 'w') as f:
    f.write('\n'.join(result))

print("Arquivo atualizado com sucesso!")

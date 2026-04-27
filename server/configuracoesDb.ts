import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL!,
  connectionLimit: 5,
  enableKeepAlive: true,
});

export const MODULOS_SISTEMA = [
  { id: "gestao-tempo", label: "Gestão de Tempo" },
  { id: "dashboard", label: "Dashboard Geral" },
  { id: "contas", label: "Contas a Pagar" },
  { id: "clientes", label: "Base de Clientes" },
  { id: "vendas", label: "Controle de Vendas" },
  { id: "comissoes", label: "Comissões" },
  { id: "comissoes_pendentes", label: "Comissões Pendentes" },
  { id: "inadimplentes", label: "Inadimplentes" },
  { id: "cancelados", label: "Cancelamentos" },
  { id: "sinistros", label: "Sinistros" },
  { id: "crm_leads", label: "CRM Leads" },
  { id: "crm_beneficiarios", label: "CRM Beneficiários" },
  { id: "financeiro", label: "Financeiro" },
  { id: "email_marketing", label: "Email Marketing" },
  { id: "configuracoes", label: "Configurações" },
] as const;

export type ModuloId = typeof MODULOS_SISTEMA[number]["id"];

// ─── Usuários ─────────────────────────────────────────────────────────────────

export async function listarUsuarios() {
  const [rows] = await pool.execute(
    `SELECT id, nome, email, role, ativo, createdAt, updatedAt FROM app_users ORDER BY nome ASC`
  ) as any;
  return rows;
}

export async function buscarUsuarioPorEmail(email: string) {
  const [rows] = await pool.execute(
    `SELECT * FROM app_users WHERE email = ? LIMIT 1`,
    [email.toLowerCase().trim()]
  ) as any;
  return rows[0] || null;
}

export async function buscarUsuarioPorId(id: number) {
  const [rows] = await pool.execute(
    `SELECT id, nome, email, role, ativo, createdAt, updatedAt FROM app_users WHERE id = ? LIMIT 1`,
    [id]
  ) as any;
  return rows[0] || null;
}

export async function criarUsuario(dados: {
  nome: string;
  email: string;
  senha: string;
  role: "admin" | "user";
}) {
  const senhaHash = await bcrypt.hash(dados.senha, 12);
  const [result] = await pool.execute(
    `INSERT INTO app_users (nome, email, senhaHash, role, ativo) VALUES (?, ?, ?, ?, TRUE)`,
    [dados.nome.trim(), dados.email.toLowerCase().trim(), senhaHash, dados.role]
  ) as any;
  const userId = result.insertId;
  // Criar permissões padrão (todas negadas)
  for (const modulo of MODULOS_SISTEMA) {
    await pool.execute(
      `INSERT INTO app_permissoes (userId, modulo, podeVer, podeCriar, podeEditar, podeDeletar)
       VALUES (?, ?, FALSE, FALSE, FALSE, FALSE)
       ON DUPLICATE KEY UPDATE userId=userId`,
      [userId, modulo.id]
    );
  }
  return userId;
}

export async function atualizarUsuario(id: number, dados: {
  nome?: string;
  email?: string;
  senha?: string;
  role?: "admin" | "user";
  ativo?: boolean;
}) {
  const sets: string[] = [];
  const vals: any[] = [];
  if (dados.nome !== undefined) { sets.push("nome = ?"); vals.push(dados.nome.trim()); }
  if (dados.email !== undefined) { sets.push("email = ?"); vals.push(dados.email.toLowerCase().trim()); }
  if (dados.senha !== undefined && dados.senha.length > 0) {
    const hash = await bcrypt.hash(dados.senha, 12);
    sets.push("senhaHash = ?"); vals.push(hash);
  }
  if (dados.role !== undefined) { sets.push("role = ?"); vals.push(dados.role); }
  if (dados.ativo !== undefined) { sets.push("ativo = ?"); vals.push(dados.ativo ? 1 : 0); }
  if (sets.length === 0) return;
  vals.push(id);
  await pool.execute(`UPDATE app_users SET ${sets.join(", ")} WHERE id = ?`, vals);
}

export async function deletarUsuario(id: number) {
  await pool.execute(`DELETE FROM app_sessions WHERE userId = ?`, [id]);
  await pool.execute(`DELETE FROM app_permissoes WHERE userId = ?`, [id]);
  await pool.execute(`DELETE FROM app_users WHERE id = ?`, [id]);
}

// ─── Autenticação ─────────────────────────────────────────────────────────────

export async function loginUsuario(email: string, senha: string) {
  const user = await buscarUsuarioPorEmail(email);
  if (!user || !user.ativo) return null;
  const ok = await bcrypt.compare(senha, user.senhaHash);
  if (!ok) return null;
  // Criar sessão (expira em 30 dias)
  const token = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await pool.execute(
    `INSERT INTO app_sessions (token, userId, expiresAt) VALUES (?, ?, ?)`,
    [token, user.id, expiresAt]
  );
  return { token, user: { id: user.id, nome: user.nome, email: user.email, role: user.role } };
}

export async function validarSessao(token: string) {
  if (!token) return null;
  const [rows] = await pool.execute(
    `SELECT s.userId, s.expiresAt, u.nome, u.email, u.role, u.ativo
     FROM app_sessions s JOIN app_users u ON s.userId = u.id
     WHERE s.token = ? LIMIT 1`,
    [token]
  ) as any;
  const sess = rows[0];
  if (!sess) return null;
  if (!sess.ativo) return null;
  if (new Date(sess.expiresAt) < new Date()) {
    await pool.execute(`DELETE FROM app_sessions WHERE token = ?`, [token]);
    return null;
  }
  return { id: sess.userId, nome: sess.nome, email: sess.email, role: sess.role };
}

export async function logoutSessao(token: string) {
  await pool.execute(`DELETE FROM app_sessions WHERE token = ?`, [token]);
}

// ─── Permissões ───────────────────────────────────────────────────────────────

export async function listarPermissoesUsuario(userId: number) {
  const [rows] = await pool.execute(
    `SELECT modulo, podeVer, podeCriar, podeEditar, podeDeletar FROM app_permissoes WHERE userId = ?`,
    [userId]
  ) as any;
  // Garantir que todos os módulos estejam presentes
  const mapa: Record<string, any> = {};
  for (const r of rows) mapa[r.modulo] = r;
  // MySQL retorna tinyint(1) como number (0/1) — converter para boolean
  return MODULOS_SISTEMA.map(m => ({
    modulo: m.id,
    label: m.label,
    podeVer: Boolean(mapa[m.id]?.podeVer ?? false),
    podeCriar: Boolean(mapa[m.id]?.podeCriar ?? false),
    podeEditar: Boolean(mapa[m.id]?.podeEditar ?? false),
    podeDeletar: Boolean(mapa[m.id]?.podeDeletar ?? false),
  }));
}

export async function salvarPermissoes(userId: number, permissoes: Array<{
  modulo: string;
  podeVer: boolean;
  podeCriar: boolean;
  podeEditar: boolean;
  podeDeletar: boolean;
}>) {
  for (const p of permissoes) {
    await pool.execute(
      `INSERT INTO app_permissoes (userId, modulo, podeVer, podeCriar, podeEditar, podeDeletar)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE podeVer=VALUES(podeVer), podeCriar=VALUES(podeCriar),
         podeEditar=VALUES(podeEditar), podeDeletar=VALUES(podeDeletar)`,
      [userId, p.modulo, p.podeVer ? 1 : 0, p.podeCriar ? 1 : 0, p.podeEditar ? 1 : 0, p.podeDeletar ? 1 : 0]
    );
  }
}

export async function verificarPermissao(userId: number, modulo: string, acao: "podeVer" | "podeCriar" | "podeEditar" | "podeDeletar") {
  // Admin sempre tem acesso total
  const user = await buscarUsuarioPorId(userId);
  if (user?.role === "admin") return true;
  const [rows] = await pool.execute(
    `SELECT ${acao} FROM app_permissoes WHERE userId = ? AND modulo = ? LIMIT 1`,
    [userId, modulo]
  ) as any;
  return rows[0]?.[acao] === 1 || rows[0]?.[acao] === true;
}

// ─── Seed: criar admin padrão se não existir ──────────────────────────────────
export async function garantirAdminPadrao() {
  const [rows] = await pool.execute(
    `SELECT id FROM app_users WHERE email = 'asbarcellos31@gmail.com' OR role = 'admin' LIMIT 1`
  ) as any;
  if (rows.length === 0) {
    await criarUsuario({
      nome: "Administrador",
      email: "asbarcellos31@gmail.com",
      senha: "barcellos2026",
      role: "admin",
    });
    console.log("[Config] Admin padrão criado: asbarcellos31@gmail.com / barcellos2026");
  }
}

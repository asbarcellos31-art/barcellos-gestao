import { Router } from "express";
import { getDb } from "./db";
import { dispararAniversariantes, dispararInadimplentes } from "./emailAutomacao";

const router = Router();

async function getConn() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return (db as any).session?.client;
}

// Listar automações
router.get("/email-automacoes", async (_req, res) => {
  try {
    const conn = await getConn();
    const [rows]: any = await conn.execute(
      `SELECT a.*, t.nome as templateNome 
       FROM email_automacoes a 
       LEFT JOIN email_templates t ON t.id = a.templateId
       ORDER BY a.id`
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Atualizar automação (ativar/desativar, trocar template, horário)
router.put("/email-automacoes/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { ativo, templateId, horario, nome } = req.body;
    const conn = await getConn();
    const sets: string[] = [];
    const vals: any[] = [];
    if (ativo !== undefined) { sets.push("ativo = ?"); vals.push(ativo ? 1 : 0); }
    if (templateId !== undefined) { sets.push("templateId = ?"); vals.push(templateId); }
    if (horario !== undefined) { sets.push("horario = ?"); vals.push(horario); }
    if (nome !== undefined) { sets.push("nome = ?"); vals.push(nome); }
    if (sets.length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar" });
    vals.push(id);
    await conn.execute(`UPDATE email_automacoes SET ${sets.join(", ")} WHERE id = ?`, vals);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Disparar manualmente agora
router.post("/email-automacoes/:id/disparar-agora", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const conn = await getConn();
    const [[auto]]: any = await conn.execute("SELECT * FROM email_automacoes WHERE id = ?", [id]);
    if (!auto) return res.status(404).json({ error: "Automação não encontrada" });

    // Resetar ultimoDisparo para permitir reenvio manual mesmo que já tenha disparado hoje
    await conn.execute("UPDATE email_automacoes SET ultimoDisparo = NULL WHERE id = ?", [id]);

    // Responder imediatamente e disparar em background
    res.json({ ok: true, mensagem: "Disparo iniciado em background" });

    (async () => {
      if (auto.tipo === "ANIVERSARIO") {
        await dispararAniversariantes();
      } else if (auto.tipo === "INADIMPLENCIA") {
        await dispararInadimplentes();
      }
    })().catch(console.error);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Estatísticas de aniversariantes do dia
router.get("/email-automacoes/aniversariantes-hoje", async (_req, res) => {
  try {
    const conn = await getConn();
    const hoje = new Date();
    const dia = hoje.getDate();
    const mes = hoje.getMonth() + 1;
    const [rows]: any = await conn.execute(
      `SELECT nome, email, dataNascimento FROM clientes 
       WHERE email IS NOT NULL AND email != '' 
       AND DAY(dataNascimento) = ? AND MONTH(dataNascimento) = ?
       AND status = 'ativo'
       ORDER BY nome`,
      [dia, mes]
    );
    res.json({ total: rows.length, clientes: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Estatísticas de inadimplentes com e-mail
router.get("/email-automacoes/inadimplentes-com-email", async (_req, res) => {
  try {
    const conn = await getConn();
    const [rows]: any = await conn.execute(
      `SELECT COUNT(DISTINCT i.cpf) as total
       FROM inadimplentes i
       INNER JOIN clientes c ON c.cpf = i.cpf
       WHERE (i.status IS NULL OR i.status = '' OR i.status = 'pendente' OR i.status = 'em_aberto')
       AND c.email IS NOT NULL AND c.email != ''`
    );
    res.json({ total: rows[0]?.total || 0 });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

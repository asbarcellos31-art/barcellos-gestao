import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { sql } from "drizzle-orm";

// Busca o número de WhatsApp configurado no sistema
async function getWhatsappNumber(): Promise<string> {
  const db = await getDb();
 if (!db) return "554833726890";
  const rows = await db.execute(
    sql`SELECT valor FROM system_config WHERE chave = 'whatsapp_inadimplentes' LIMIT 1`
  );
  const data = rows as any[];
  if (data.length > 0 && data[0].valor) {
    // Remove tudo que não é dígito e garante no máximo 13 dígitos (55 + DDD + número)
    let num = String(data[0].valor).replace(/\D/g, "");
    // Se começar com 550 (ex: 5504833726890), remove o zero extra após o 55
    if (num.startsWith("550") && num.length > 12) {
      num = "55" + num.slice(3);
    }
    return num;
  }
  return "554833726890";
}

// Busca as competências em aberto de um CPF, agrupadas por mês/produto
async function getCompetenciasEmAberto(cpf: string): Promise<{ competencia: string; produto: string; parcelas: number }[]> {
  const db = await getDb();
  if (!db) return [];
  const cpfLimpo = cpf.replace(/\D/g, "").replace(/^0+/, "");
  const rows = await db.execute(sql`
    SELECT mesParcela, produtos
    FROM inadimplentes
    WHERE (
      TRIM(LEADING '0' FROM REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '')) = ${cpfLimpo}
    )
    AND (status IS NULL OR status NOT IN ('PAGO', 'RECUPERADO', 'QUITADO'))
    ORDER BY mesParcela ASC
  `);
  // Drizzle retorna [rows, metadata]
  const data = (Array.isArray((rows as any)[0]) ? (rows as any)[0] : rows) as any[];

  // Agrupa por produto, coletando competências únicas (o campo mesParcela pode ser uma string concatenada)
  const porProduto: Record<string, Set<string>> = {};
  for (const r of data) {
    const produto = String(r.produtos || "").trim();
    const mesParcela = String(r.mesParcela || "");
    // Separa por vírgula e normaliza cada competência
    const competencias = mesParcela.split(",").map((s: string) => s.trim()).filter(Boolean);
    const uniqueComps = Array.from(new Set(competencias));
    if (!porProduto[produto]) porProduto[produto] = new Set();
    uniqueComps.forEach((c: string) => porProduto[produto].add(c));
  }

  // Converte para o formato esperado
  const resultado: { competencia: string; produto: string; parcelas: number }[] = [];
  for (const [produto, comps] of Object.entries(porProduto)) {
    const competenciasOrdenadas = Array.from(comps).sort();
    resultado.push({
      competencia: competenciasOrdenadas.join(", "),
      produto,
      parcelas: competenciasOrdenadas.length,
    });
  }
  return resultado;
}

// Gera o HTML do e-mail de cobrança
function gerarEmailCobranca(params: {
  nome: string;
  competencias: { competencia: string; produto: string; parcelas: number }[];
  whatsappNum: string;
}): { subject: string; html: string } {
  const { nome, competencias, whatsappNum } = params;
  const primeiroNome = nome.split(" ")[0];
  const whatsappLink = `https://wa.me/${whatsappNum}?text=${encodeURIComponent(`Olá! Sou cliente Barcellos Seguros e gostaria de regularizar minha situação.`)}`;

  // Agrupa por competência (mês/ano) e lista os produtos únicos
  const porCompetencia: Record<string, { produtos: Set<string>; totalParcelas: number }> = {};
  for (const c of competencias) {
    if (!porCompetencia[c.competencia]) {
      porCompetencia[c.competencia] = { produtos: new Set(), totalParcelas: 0 };
    }
    if (c.produto) porCompetencia[c.competencia].produtos.add(c.produto);
    porCompetencia[c.competencia].totalParcelas += c.parcelas;
  }

  const linhasTabela = Object.entries(porCompetencia).map(([comp, info]) => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#374151;font-weight:600;">${comp}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#374151;">${Array.from(info.produtos).join(", ") || "—"}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;color:#dc2626;font-weight:600;text-align:center;">${info.totalParcelas} parcela${info.totalParcelas > 1 ? 's' : ''}</td>
    </tr>
  `).join("");

  const totalCompetencias = Object.keys(porCompetencia).length;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Aviso de Inadimplência</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:32px 40px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:0.5px;">BARCELLOS SEGUROS</h1>
      <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">Aviso de Pendência Financeira</p>
    </div>

    <!-- Corpo -->
    <div style="padding:36px 40px;">
      <p style="margin:0 0 16px;color:#374151;font-size:16px;">Olá, <strong>${primeiroNome}</strong>!</p>
      <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.6;">
        Identificamos pendências financeiras em seu seguro junto à <strong>MAG Seguros (Mongeral Aegon)</strong>, 
        administradas pela Barcellos Seguros.
      </p>
      <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
        Para evitar a suspensão ou cancelamento da sua cobertura, solicitamos a regularização o mais breve possível.
      </p>

      <!-- Resumo -->
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;overflow:hidden;margin-bottom:28px;">
        <div style="background:#dc2626;padding:10px 16px;">
          <p style="margin:0;color:#fff;font-size:13px;font-weight:600;">⚠️ ${totalCompetencias} competência${totalCompetencias > 1 ? 's' : ''} em aberto</p>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#fff5f5;">
              <th style="padding:10px 14px;text-align:left;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Competência</th>
              <th style="padding:10px 14px;text-align:left;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Produto / Seguro</th>
              <th style="padding:10px 14px;text-align:center;font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Parcelas</th>
            </tr>
          </thead>
          <tbody>
            ${linhasTabela}
          </tbody>
        </table>
      </div>

      <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
        Para regularizar sua situação, verificar os valores exatos ou esclarecer dúvidas, 
        entre em contato com nossa equipe pelo WhatsApp:
      </p>

      <!-- Botão WhatsApp -->
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${whatsappLink}" target="_blank"
           style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:0.3px;">
          📱 Falar no WhatsApp
        </a>
        <p style="margin:10px 0 0;color:#9ca3af;font-size:12px;">+55 48 3372-6890 — Seg a Sex, 8h às 18h</p>
      </div>

      <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;text-align:center;">
        Se você já realizou o pagamento, por favor desconsidere este aviso.<br>
        Agradecemos sua atenção.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        Barcellos Seguros · atendimento@barcellosseguros.com<br>
        Este é um e-mail automático. Não responda diretamente a esta mensagem.
      </p>
    </div>
  </div>
</body>
</html>`;

  const subject = `${primeiroNome}, você possui competências em aberto — Barcellos Seguros`;
  return { subject, html };
}

export const inadimplentesDisparoRouter = router({
  // Busca a configuração de WhatsApp
  getConfig: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { whatsapp: "554833726890" };
    const rows = await db.execute(
      sql`SELECT chave, valor, descricao FROM system_config WHERE chave = 'whatsapp_inadimplentes'`
    );
    const data = rows as any[];
    return {
      whatsapp: data.length > 0 ? String(data[0].valor || "554833726890") : "554833726890",
    };
  }),

  // Atualiza o número de WhatsApp
  updateWhatsapp: protectedProcedure
    .input(z.object({ numero: z.string().min(8) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // Remove não-dígitos e corrige zero extra após código do país (ex: 55048... → 5548...)
      let numeroLimpo = input.numero.replace(/\D/g, "");
      if (numeroLimpo.startsWith("550") && numeroLimpo.length > 12) {
        numeroLimpo = "55" + numeroLimpo.slice(3);
      }
      await db.execute(sql`
        INSERT INTO system_config (chave, valor, descricao)
        VALUES ('whatsapp_inadimplentes', ${numeroLimpo}, 'Número WhatsApp para contato de inadimplentes')
        ON DUPLICATE KEY UPDATE valor = ${numeroLimpo}
      `);
      return { ok: true };
    }),

  // Busca o número de WhatsApp de aniversário
  getConfigAniversario: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { whatsapp: "" };
    const rows = await db.execute(
      sql`SELECT valor FROM system_config WHERE chave = 'whatsapp_aniversario' LIMIT 1`
    ) as any[];
    return {
      whatsapp: rows.length > 0 ? String(rows[0].valor || "") : "",
    };
  }),

  // Atualiza o número de WhatsApp de aniversário
  updateWhatsappAniversario: protectedProcedure
    .input(z.object({ numero: z.string().min(8) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      let numeroLimpo = input.numero.replace(/\D/g, "");
      if (numeroLimpo.startsWith("550") && numeroLimpo.length > 12) {
        numeroLimpo = "55" + numeroLimpo.slice(3);
      }
      await db.execute(sql`
        INSERT INTO system_config (chave, valor, descricao)
        VALUES ('whatsapp_aniversario', ${numeroLimpo}, 'Número WhatsApp para resposta de aniversário')
        ON DUPLICATE KEY UPDATE valor = ${numeroLimpo}
      `);
      return { ok: true };
    }),

  // Busca o número de WhatsApp geral (campanhas)
  getConfigWhatsappGeral: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { whatsapp: "" };
    const rows = await db.execute(
      sql`SELECT valor FROM system_config WHERE chave = 'whatsapp_geral' LIMIT 1`
    ) as any[];
    return {
      whatsapp: rows.length > 0 ? String(rows[0].valor || "") : "",
    };
  }),

  // Atualiza o número de WhatsApp geral (campanhas)
  updateWhatsappGeral: protectedProcedure
    .input(z.object({ numero: z.string().min(8) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      let numeroLimpo = input.numero.replace(/\D/g, "");
      if (numeroLimpo.startsWith("550") && numeroLimpo.length > 12) {
        numeroLimpo = "55" + numeroLimpo.slice(3);
      }
      await db.execute(sql`
        INSERT INTO system_config (chave, valor, descricao)
        VALUES ('whatsapp_geral', ${numeroLimpo}, 'Número WhatsApp geral para campanhas')
        ON DUPLICATE KEY UPDATE valor = ${numeroLimpo}
      `);
      return { ok: true };
    }),

  // Dispara e-mail para lista de inadimplentes selecionados
  disparar: protectedProcedure
    .input(z.object({
      cpfs: z.array(z.string()).min(1).max(500),
    }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.SENDGRID_API_KEY;
      const fromEmail = process.env.SENDGRID_FROM_EMAIL || "atendimento@barcellosseguros.com";
      const fromName = process.env.SENDGRID_FROM_NAME || "Barcellos Seguros";

      if (!apiKey) {
        throw new Error("SENDGRID_API_KEY não configurada");
      }

      const whatsappNum = await getWhatsappNumber();

      const resultados: { cpf: string; nome: string; email: string; status: "enviado" | "sem_email" | "sem_competencias" | "erro"; erro?: string }[] = [];

      for (const cpf of input.cpfs) {
        const dbInst = await getDb();
        if (!dbInst) {
          resultados.push({ cpf, nome: cpf, email: "", status: "erro", erro: "DB unavailable" });
          continue;
        }
        const cpfLimpo = cpf.replace(/\D/g, "").replace(/^0+/, "");
      console.log(`[DISPARO] CPF original: "${cpf}" | CPF limpo: "${cpfLimpo}"`);

        // Busca dados do inadimplente + e-mail via JOIN com Base de Clientes
        const inadRows = await dbInst.execute(sql`
          SELECT DISTINCT
            i.nome,
            COALESCE(NULLIF(i.emailContato, ''), c.email) AS emailFinal
          FROM inadimplentes i
          LEFT JOIN clientes c ON
            TRIM(LEADING '0' FROM REPLACE(REPLACE(REPLACE(i.cpf, '.', ''), '-', ''), ' ', '')) =
            TRIM(LEADING '0' FROM REPLACE(REPLACE(REPLACE(c.cpf, '.', ''), '-', ''), ' ', ''))
          WHERE TRIM(LEADING '0' FROM REPLACE(REPLACE(REPLACE(i.cpf, '.', ''), '-', ''), ' ', '')) = ${cpfLimpo}
          LIMIT 1
        `);
        // Drizzle execute() retorna [rows, metadata] — pegar apenas o primeiro elemento
        const inadData = (Array.isArray((inadRows as any)[0]) ? (inadRows as any)[0] : inadRows) as any[];
        console.log(`[DISPARO] inadData processado para CPF "${cpfLimpo}": nome=${inadData[0]?.nome} email=${inadData[0]?.emailFinal}`);

        if (inadData.length === 0) {
          resultados.push({ cpf, nome: cpf, email: "", status: "sem_email" });
          continue;
        }

        const nome = inadData[0].nome || "Cliente";
        const email = inadData[0].emailFinal;

        if (!email) {
          resultados.push({ cpf, nome, email: "", status: "sem_email" });
          continue;
        }

        // Busca competências em aberto
        const competencias = await getCompetenciasEmAberto(cpf);
        if (competencias.length === 0) {
          resultados.push({ cpf, nome, email, status: "sem_competencias" });
          continue;
        }

        // Gera e envia o e-mail
        try {
          const { subject, html } = gerarEmailCobranca({ nome, competencias, whatsappNum });
          const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email }] }],
              from: { email: fromEmail, name: fromName },
              subject,
              content: [{ type: "text/html", value: html }],
            }),
          });
          if (!resp.ok) {
            const errBody = await resp.text();
            throw new Error(`SendGrid ${resp.status}: ${errBody}`);
          }
          resultados.push({ cpf, nome, email, status: "enviado" });
        } catch (err: any) {
          resultados.push({ cpf, nome, email, status: "erro", erro: err?.message || "Erro desconhecido" });
        }
      }

      const enviados = resultados.filter(r => r.status === "enviado").length;
      const semEmail = resultados.filter(r => r.status === "sem_email").length;
      const semCompetencias = resultados.filter(r => r.status === "sem_competencias").length;
      const erros = resultados.filter(r => r.status === "erro").length;

      return { resultados, enviados, semEmail, semCompetencias, erros };
    }),

  // Buscar template de mensagem WhatsApp de inadimplentes
  getMsgInadimplentes: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      const [rows]: any = await (db as any).execute(
        `SELECT valor FROM system_config WHERE chave = 'wa_automacao_inadimplentes_msg' LIMIT 1`
      );
      const DEFAULT_MSG = `Olá, {{nome}}! Identificamos uma pendência financeira em seu nome junto à Barcellos Seguros.\n\nPor favor, entre em contato para regularizar sua situação:\n📞 (48) 3372-6890\n\nEvite a interrupção dos seus serviços. Estamos à disposição para ajudá-lo(a).\n\nEquipe Barcellos Seguros`;
      return { mensagem: rows?.[0]?.valor || DEFAULT_MSG };
    }),

  // Endpoint genérico para salvar qualquer chave no system_config (usado para Z-API, etc.)
  saveSystemConfig: protectedProcedure
    .input(z.object({ chave: z.string().min(1), valor: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB indisponível");
      await db.execute(sql`
        INSERT INTO system_config (chave, valor, descricao)
        VALUES (${input.chave}, ${input.valor}, ${input.chave})
        ON DUPLICATE KEY UPDATE valor = ${input.valor}
      `);
      return { ok: true };
    }),
});

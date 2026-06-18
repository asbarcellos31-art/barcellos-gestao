import "dotenv/config";
import express from "express";
import path from "path";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { exportRouter } from "../exportRouter";
import uploadRouter from "../uploadRouter";
import emailMarketingRouter from "../emailMarketingRouter";
import emailAutomacaoRouter from "../emailAutomacaoRouter";
import inadimplentesEnriquecerRouter from "../inadimplentesEnriquecerRouter";
import { magBoletosExpressRouter } from "../magBoletosRouter";
import { garantirAdminPadrao } from "../configuracoesDb";
import { verificarEDisparar } from "../emailAutomacao";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { ensureTimerTable } from "../timerDb";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Garantir admin padrão no banco (se DATABASE_URL configurado)
  await garantirAdminPadrao().catch(err => {
    console.warn("[Boot] Não foi possível garantir admin padrão:", err?.message || err);
  });

  await ensureTimerTable().catch(err => {
    console.warn("[Boot] timer_ativo:", err?.message || err);
  });

  // Migrações seguras (idempotentes)
  const db = await getDb();
  if (db) {
    const migrations = [
      sql`ALTER TABLE relatorios_executivos ADD COLUMN imap DECIMAL(5,2)`,
      sql`ALTER TABLE inadimplentes ADD COLUMN boleto_pdf TEXT`,
      sql`ALTER TABLE inadimplentes ADD COLUMN boleto_nome VARCHAR(255)`,
      sql`ALTER TABLE tarefa_ocorrencias MODIFY COLUMN status ENUM('PENDENTE','CONCLUIDA','ATRASADA','CANCELADA') NOT NULL DEFAULT 'PENDENTE'`,
      sql`ALTER TABLE tarefa_ocorrencias ADD UNIQUE INDEX uq_tarefa_ocorrencia (tarefaId, appUserId, data)`,
      sql`CREATE TABLE IF NOT EXISTS timer_ativo (
        appUserId INT NOT NULL PRIMARY KEY,
        tarefaId INT NOT NULL,
        startedAt DATETIME NULL,
        segundosAcumulados INT NOT NULL DEFAULT 0,
        duracaoMin INT NULL,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
    ];
    for (const m of migrations) {
      try {
        await db.execute(m);
      } catch (e: any) {
        if (e?.errno !== 1060 && !e?.message?.includes("Duplicate column")) {
          console.warn("[Boot] Migração:", e?.message);
        }
      }
    }
  }

  const app = express();
  const server = createServer(app);

  // ─── RATE LIMITING (in-memory, simples) ─────────────────────────────────
  // Protege contra brute-force em login/recuperação e DoS em rotas públicas.
  // Sem dependência nova — implementação leve e suficiente para escala atual.
  const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
  function rateLimitCheck(key: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = rateLimitStore.get(key);
    if (!entry || entry.resetAt < now) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= max) return false;
    entry.count++;
    return true;
  }
  // Limpa entries expirados a cada 10 min
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetAt < now) rateLimitStore.delete(k);
    }
  }, 10 * 60 * 1000);

  // Middleware: 100 req/min por IP em rotas API gerais
  app.use("/api", (req, res, next) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
            || req.socket.remoteAddress
            || "unknown";
    if (!rateLimitCheck(`api:${ip}`, 200, 60_000)) {
      return res.status(429).json({ error: "Muitas requisições. Aguarde um minuto." });
    }
    next();
  });

  // Middleware extra: 5 tentativas por 15min em login/recuperação de senha
  app.use("/api/trpc/usuarios.login", (req, res, next) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
            || req.socket.remoteAddress
            || "unknown";
    if (!rateLimitCheck(`login:${ip}`, 5, 15 * 60_000)) {
      return res.status(429).json({ error: "Muitas tentativas de login. Aguarde 15 minutos." });
    }
    next();
  });

  // Body parser com limite alto para uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Servir uploads locais (fallback quando S3 não configurado)
  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

  // Rotas REST
  app.use(exportRouter);
  app.use("/api", uploadRouter);
  app.use("/api", emailMarketingRouter);
  app.use("/api", emailAutomacaoRouter);
  app.use("/api", inadimplentesEnriquecerRouter);
  app.use("/api", magBoletosExpressRouter);

  // Endpoint temporário: cruza lista de servidores com base de clientes
  app.post("/api/cruzar-servidores", async (req: any, res: any) => {
    try {
      const { servidores } = req.body as { servidores: { nome: string; cpfMeio: string }[] };
      const mysql = await import("mysql2/promise");
      const conn = await (mysql as any).default.createConnection(process.env.DATABASE_URL!);
      const [rows]: any = await conn.execute(
        `SELECT c.nome, c.cpf, c.telefone, c.email, c.cidade, c.estado, c.vendedor
         FROM clientes c`
      );
      await conn.end();

      // Índice dos servidores pelo miolo do CPF → lista de servidores com aquele miolo
      const idxCpf = new Map<string, string[]>();
      for (const s of servidores) {
        if (s.cpfMeio && s.cpfMeio.length === 6) {
          if (!idxCpf.has(s.cpfMeio)) idxCpf.set(s.cpfMeio, []);
          idxCpf.get(s.cpfMeio)!.push(s.nome);
        }
      }

      function palavras(nome: string) {
        return new Set(nome.toUpperCase().replace(/\s+/g,' ').trim().split(' ').filter(p => p.length > 2));
      }
      function nomesCompatíveis(a: string, b: string): boolean {
        const pa = palavras(a), pb = palavras(b);
        let comuns = 0;
        for (const p of pa) if (pb.has(p)) comuns++;
        return comuns >= 2;
      }

      const encontrados: any[] = [];
      for (const cliente of rows) {
        const cpfCliente = (cliente.cpf || '').replace(/\D/g, '');
        if (cpfCliente.length < 9) continue;
        const meioCpf = cpfCliente.slice(3, 9);

        const candidatos = idxCpf.get(meioCpf) || [];
        const nomeServidor = candidatos.find(n => nomesCompatíveis(n, cliente.nome || ''));
        if (nomeServidor) {
          encontrados.push({
            nomeCliente: cliente.nome,
            nomeServidor,
            cpf: cliente.cpf,
            telefone: cliente.telefone,
            email: cliente.email,
            cidade: cliente.cidade,
            estado: cliente.estado,
            vendedor: cliente.vendedor || null,
          });
        }
      }

      res.json({ total: encontrados.length, clientes: encontrados });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Endpoint temporário: atualiza origemId de clientes por CPF
  app.post("/api/atualizar-origem-clientes", async (req: any, res: any) => {
    try {
      const { cpfs, origemNome } = req.body as { cpfs: string[]; origemNome: string };
      const mysql = await import("mysql2/promise");
      const conn = await (mysql as any).default.createConnection(process.env.DATABASE_URL!);

      // Busca ou cria a origem
      const [origens]: any = await conn.execute(
        `SELECT id FROM origens_cliente WHERE nome = ? LIMIT 1`, [origemNome]
      );
      let origemId: number;
      if (origens.length > 0) {
        origemId = origens[0].id;
      } else {
        const [ins]: any = await conn.execute(
          `INSERT INTO origens_cliente (nome, cor, ativo) VALUES (?, '#1E3A6E', 1)`, [origemNome]
        );
        origemId = ins.insertId;
      }

      // Atualiza em lotes de 100
      let total = 0;
      for (let i = 0; i < cpfs.length; i += 100) {
        const lote = cpfs.slice(i, i + 100);
        const placeholders = lote.map(() => '?').join(',');
        const cpfsLimpos = lote.map((c: string) => c.replace(/\D/g,''));
        const [r]: any = await conn.execute(
          `UPDATE clientes SET origemId = ? WHERE REGEXP_REPLACE(cpf, '[^0-9]', '') IN (${placeholders})`,
          [origemId, ...cpfsLimpos]
        );
        total += r.affectedRows;
      }

      await conn.end();
      res.json({ ok: true, origemId, origemNome, atualizados: total });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Endpoint temporário: dados de campanha email marketing
  app.get("/api/temp-email-campanha", async (req: any, res: any) => {
    try {
      const mysql = await import("mysql2/promise");
      const conn = await (mysql as any).default.createConnection(process.env.DATABASE_URL!);
      const [campanhas]: any = await conn.execute(
        `SELECT c.id, c.nome, c.status, c.totalEnviados, c.createdAt,
                (SELECT COUNT(*) FROM email_envios e WHERE e.campanhaId = c.id AND e.aberturas > 0) as abriram
         FROM email_campanhas c WHERE c.nome LIKE '%médico%' OR c.nome LIKE '%medico%' ORDER BY c.createdAt DESC LIMIT 10`
      );
      // Pega o template da primeira campanha médico
      const [templates]: any = await conn.execute(
        `SELECT t.id, t.nome, t.assunto, t.corpo FROM email_templates t
         WHERE t.id = (SELECT templateId FROM email_campanhas WHERE nome LIKE '%médico%' LIMIT 1) LIMIT 1`
      );
      await conn.end();
      res.json({ campanhas, template: templates[0] || null });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Página pública de boas-vindas com player de vídeo
  app.get("/boas-vindas", (_req, res) => {
    const VIDEO_URL = "https://github.com/asbarcellos31-art/barcellos-gestao/releases/download/v-assets-1/boas-vindas-barcellos.mp4";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo(a) à Barcellos Seguros</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0f1e3d; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: Arial, sans-serif; padding: 24px; }
    .logo { color: #fff; font-size: 22px; font-weight: 700; letter-spacing: 1px; margin-bottom: 8px; text-align: center; }
    .tagline { color: #a8c4e8; font-size: 13px; margin-bottom: 32px; text-align: center; }
    .video-wrap { width: 100%; max-width: 420px; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.5); background: #000; }
    video { width: 100%; display: block; }
    .footer { color: #4a6fa5; font-size: 12px; margin-top: 24px; text-align: center; }
  </style>
</head>
<body>
  <div class="logo">Barcellos Seguros</div>
  <div class="tagline">Proteção com quem você pode confiar</div>
  <div class="video-wrap">
    <video controls autoplay playsinline preload="auto">
      <source src="${VIDEO_URL}" type="video/mp4">
    </video>
  </div>
  <div class="footer">© Barcellos Seguros — Florianópolis, SC</div>
</body>
</html>`);
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Frontend (Vite em dev, estático em prod)
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Porta ${preferredPort} ocupada, usando porta ${port}`);
  }

  server.listen(port, () => {
    console.log(`✅ Servidor rodando em http://localhost:${port}/`);
  });

  // Cron de automação de e-mails (verifica a cada minuto)
  setInterval(() => {
    verificarEDisparar().catch(console.error);
  }, 60 * 1000);
  setTimeout(() => verificarEDisparar().catch(console.error), 5000);
}

startServer().catch(err => {
  console.error("❌ Falha ao iniciar servidor:", err);
  process.exit(1);
});

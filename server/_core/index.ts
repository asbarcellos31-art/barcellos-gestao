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
import { garantirAdminPadrao } from "../configuracoesDb";
import { verificarEDisparar } from "../emailAutomacao";

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

  const app = express();
  const server = createServer(app);

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

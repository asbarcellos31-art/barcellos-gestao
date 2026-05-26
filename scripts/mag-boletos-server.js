#!/usr/bin/env node
/**
 * Servidor companheiro local — Buscador de Boletos MAG
 * Barcellos Seguros
 *
 * Como usar:
 *
 *   Setup (uma única vez — na raiz do projeto):
 *     npm install cors playwright
 *     npx playwright install chromium
 *
 *   Para usar (toda vez):
 *     node scripts/mag-boletos-server.js
 */

const express = require("express");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");
const os      = require("os");

const PORT         = 3001;
const DOWNLOAD_DIR = path.join(os.tmpdir(), "mag-boletos");
const MAG_URL      = "https://plataformadosprodutores.mag.com.br/s/";

// ── Estado global ─────────────────────────────────────────────────────────────
let browser     = null;
let context     = null;
let mainPage    = null;
let loginStatus = "aguardando"; // "aguardando" | "logado"
const jobs      = new Map();

// ── Setup ─────────────────────────────────────────────────────────────────────
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const app = express();
app.use(cors({
  origin: ["https://app.barcellosseguros.com.br", "http://localhost:5173", "http://localhost:3000"],
}));
app.use(express.json({ limit: "50mb" }));

// ── Endpoints ─────────────────────────────────────────────────────────────────

app.get("/ping", (_req, res) => {
  res.json({ ok: true, loginStatus });
});

app.post("/iniciar-sessao", async (_req, res) => {
  try {
    // Se browser já está aberto e vivo, apenas redireciona para o portal
    if (browser && mainPage) {
      try {
        await mainPage.evaluate(() => document.title);
        loginStatus = "aguardando";
        await mainPage.goto(MAG_URL, { waitUntil: "domcontentloaded" });
        monitorarLogin();
        return res.json({ ok: true });
      } catch {
        browser = null; context = null; mainPage = null;
      }
    }

    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: false, args: ["--start-maximized"] });
    context = await browser.newContext({ acceptDownloads: true, viewport: null });
    mainPage = await context.newPage();
    loginStatus = "aguardando";

    await mainPage.goto(MAG_URL, { waitUntil: "domcontentloaded" });
    monitorarLogin();

    res.json({ ok: true });
  } catch (err) {
    console.error("[MAG] Erro ao iniciar sessão:", err.message);
    res.status(500).json({ erro: err.message });
  }
});

app.get("/status-login", (_req, res) => {
  res.json({ status: loginStatus });
});

app.post("/iniciar-busca", async (req, res) => {
  const { cpfs } = req.body;
  if (!Array.isArray(cpfs) || cpfs.length === 0)
    return res.status(400).json({ erro: "Lista de CPFs inválida" });
  if (loginStatus !== "logado")
    return res.status(400).json({ erro: "Faça login no portal MAG primeiro" });

  const jobId = Date.now().toString();
  jobs.set(jobId, { cpfs, status: "rodando", eventos: [], sseClients: [] });

  processarBoletos(jobId, cpfs).catch((err) => {
    console.error("[MAG] Erro fatal no processamento:", err.message);
    emitir(jobId, "erro_fatal", { mensagem: err.message });
    jobs.get(jobId).status = "erro";
  });

  res.json({ jobId });
});

app.get("/progresso/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ erro: "Job não encontrado" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  // Replay dos eventos já ocorridos (para cliente que conectou tarde)
  for (const ev of job.eventos) {
    res.write(`event: ${ev.tipo}\ndata: ${JSON.stringify(ev.dados)}\n\n`);
  }

  if (job.status !== "rodando") { res.end(); return; }

  job.sseClients.push(res);
  req.on("close", () => {
    job.sseClients = job.sseClients.filter((c) => c !== res);
  });
});

// ── Automação ─────────────────────────────────────────────────────────────────

function monitorarLogin() {
  const t = setInterval(async () => {
    if (!mainPage) { clearInterval(t); return; }
    try {
      const url = mainPage.url();
      // Sai da tela de login quando a URL não contém mais "/login" E existe algum elemento de nav
      if (url && !url.includes("/login")) {
        const temNav = await mainPage.evaluate(() =>
          !!(document.querySelector("nav") ||
             document.querySelector(".slds-global-header") ||
             document.querySelector("[class*='navigation']") ||
             document.querySelector("[data-aura-class*='Nav']"))
        ).catch(() => false);
        if (temNav) {
          loginStatus = "logado";
          console.log("[MAG] ✓ Login detectado —", url);
          clearInterval(t);
        }
      }
    } catch { clearInterval(t); }
  }, 2000);
}

function emitir(jobId, tipo, dados) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.eventos.push({ tipo, dados });
  for (const c of job.sseClients) {
    try { c.write(`event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`); } catch {}
  }
}

async function processarBoletos(jobId, cpfs) {
  for (let i = 0; i < cpfs.length; i++) {
    const cpf = cpfs[i];
    emitir(jobId, "progresso", {
      atual: i + 1, total: cpfs.length, cpf,
      mensagem: `Processando ${i + 1}/${cpfs.length} — CPF ${cpf}`,
    });

    try {
      const res = await buscarBoletoPorCpf(cpf);
      if (res.sucesso) {
        emitir(jobId, "boleto", { cpf, base64: res.base64, nomeArquivo: res.nomeArquivo });
        emitir(jobId, "progresso", {
          atual: i + 1, total: cpfs.length, cpf,
          mensagem: `✓ ${i + 1}/${cpfs.length} — ${cpf} — boleto baixado`,
        });
      } else {
        emitir(jobId, "falha", { cpf, motivo: res.erro });
        emitir(jobId, "progresso", {
          atual: i + 1, total: cpfs.length, cpf,
          mensagem: `✗ ${i + 1}/${cpfs.length} — ${cpf} — ${res.erro}`,
        });
      }
    } catch (err) {
      emitir(jobId, "falha", { cpf, motivo: err.message });
      emitir(jobId, "progresso", {
        atual: i + 1, total: cpfs.length, cpf,
        mensagem: `✗ ${i + 1}/${cpfs.length} — ${cpf} — ${err.message}`,
      });
      // Tenta fechar abas extras que possam ter ficado abertas
      try {
        for (const p of context.pages()) {
          if (p !== mainPage) await p.close().catch(() => {});
        }
      } catch {}
    }

    if (i < cpfs.length - 1) await sleep(1500);
  }

  const job = jobs.get(jobId);
  job.status = "concluido";
  emitir(jobId, "concluido", {
    total: cpfs.length,
    sucessos: job.eventos.filter((e) => e.tipo === "boleto").length,
    falhas:   job.eventos.filter((e) => e.tipo === "falha").length,
    listaFalhas: job.eventos.filter((e) => e.tipo === "falha").map((e) => e.dados),
  });
}

async function buscarBoletoPorCpf(cpf) {
  const cpfLimpo = cpf.replace(/\D/g, "");
  const page = mainPage;

  // ── 1. Navega para "Inadimplentes" no menu ────────────────────────────────
  await page.click('a:has-text("Inadimplentes"), span:has-text("Inadimplentes")', { timeout: 15000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 });

  // ── 2. Busca o CPF ────────────────────────────────────────────────────────
  const campoBusca = await page.waitForSelector(
    'input[type="search"], input[placeholder*="CPF"], input[placeholder*="cpf"], input[name*="search"]',
    { timeout: 10000 }
  );
  await campoBusca.fill("");
  await campoBusca.type(cpfLimpo, { delay: 80 });
  await page.keyboard.press("Enter");
  await page.waitForLoadState("networkidle", { timeout: 15000 });

  // ── 3. Verifica se encontrou resultados ───────────────────────────────────
  const semResultados = await page.evaluate(() => {
    const body = document.body.innerText.toLowerCase();
    return body.includes("nenhum resultado") || body.includes("não encontrado") || body.includes("no records");
  }).catch(() => false);
  if (semResultados) return { sucesso: false, erro: "CPF não encontrado no portal MAG" };

  // ── 4. Seleciona todos os checkboxes de competências ──────────────────────
  await page.waitForSelector('input[type="checkbox"]', { timeout: 10000 });
  const checkboxes = await page.$$('input[type="checkbox"]');
  for (const cb of checkboxes) {
    if (!(await cb.isChecked().catch(() => true))) {
      await cb.check().catch(() => {});
    }
  }

  // Captura texto das competências para nomear o arquivo
  const competencias = await page.evaluate(() => {
    const tds = Array.from(document.querySelectorAll("td, [class*='competencia'], [class*='parcela']"));
    return tds
      .map((el) => el.textContent?.trim())
      .filter((t) => t && /\d{2}\/\d{4}/.test(t))
      .slice(0, 4)
      .join("_")
      .replace(/\//g, "-");
  }).catch(() => "boleto");

  // ── 5. Clica em "Cobrança Inadimplentes" ──────────────────────────────────
  await page.click('button:has-text("Cobrança Inadimplentes"), span:has-text("Cobrança Inadimplentes")', { timeout: 10000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 });

  // ── 6. Confirma geração do link ───────────────────────────────────────────
  const btnConfirmar = await page.waitForSelector(
    'button:has-text("Confirmar"), button:has-text("Gerar"), button:has-text("OK"), button:has-text("Próximo"), button:has-text("Sim")',
    { timeout: 10000 }
  );
  await btnConfirmar.click();
  await page.waitForLoadState("networkidle", { timeout: 20000 });

  // ── 7. Clica no primeiro link → nova aba ──────────────────────────────────
  const [novaAba] = await Promise.all([
    context.waitForEvent("page", { timeout: 20000 }),
    page.click(
      'a[href*="link"], a[href*="boleto"], a:has-text("Acessar"), a:has-text("Visualizar"), a:has-text("Link"), td a',
      { timeout: 10000 }
    ),
  ]);
  await novaAba.waitForLoadState("domcontentloaded", { timeout: 20000 });

  // ── 8. Clica em "Escolher pagamento" ─────────────────────────────────────
  await novaAba.click(
    'button:has-text("Escolher pagamento"), button:has-text("Pagamento"), a:has-text("Pagamento")',
    { timeout: 15000 }
  );
  await novaAba.waitForLoadState("networkidle", { timeout: 10000 });

  // ── 9. Seleciona "Boleto" ─────────────────────────────────────────────────
  await novaAba.click('label:has-text("Boleto"), button:has-text("Boleto"), input[value*="BOLETO"]', { timeout: 10000 });
  await sleep(800);

  // ── 10. Clica em "Gerar boleto" e aguarda download ────────────────────────
  const [download] = await Promise.all([
    novaAba.waitForEvent("download", { timeout: 30000 }),
    novaAba.click('button:has-text("Gerar boleto"), button:has-text("Gerar Boleto"), button:has-text("Gerar")', { timeout: 10000 }),
  ]);

  // Salva o arquivo temporariamente
  const nomeArquivo = `${cpfLimpo}-${competencias || "boleto"}.pdf`;
  const filePath = path.join(DOWNLOAD_DIR, nomeArquivo);
  await download.saveAs(filePath);
  await novaAba.close().catch(() => {});

  // ── 11. Converte para base64 ──────────────────────────────────────────────
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString("base64");
  fs.unlink(filePath, () => {}); // limpa arquivo temporário

  return { sucesso: true, base64, nomeArquivo };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("");
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║     Barcellos Seguros — Buscador de Boletos MAG        ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  console.log(`\n✓ Servidor ativo em http://localhost:${PORT}`);
  console.log("\n→ Abra https://app.barcellosseguros.com.br");
  console.log("→ Inadimplentes → selecione clientes → botão 📥 MAG\n");
});

process.on("SIGINT", async () => {
  console.log("\n[MAG] Encerrando...");
  if (browser) await browser.close().catch(() => {});
  process.exit(0);
});

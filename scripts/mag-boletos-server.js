#!/usr/bin/env node
/**
 * Servidor companheiro local — Buscador de Boletos MAG
 * Barcellos Seguros
 *
 * Como usar:
 *
 *   Setup (uma única vez — na raiz do projeto):
 *     cd scripts && npm install
 *     npx playwright install chromium
 *
 *   Toda vez que for usar:
 *     1. node scripts/mag-boletos-server.js
 *     2. ngrok http 4040          (ou ngrok http --url=sua-url-fixa 4040)
 *     3. Cole a URL do ngrok no campo do modal "Buscar Boletos MAG" no sistema
 */

const express = require("express");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");
const os      = require("os");

const PORT         = 4040;
const DOWNLOAD_DIR = path.join(os.tmpdir(), "mag-boletos");
const MAG_URL      = "https://plataformadosprodutores.mag.com.br/s/";

// ── Estado global ─────────────────────────────────────────────────────────────
let context     = null;
let mainPage    = null;
let loginStatus = "aguardando"; // "aguardando" | "logado"
let tunnelUrl   = null;

const USER_DATA_DIR = path.join(os.homedir(), ".mag-boletos-session");

// ── Setup ─────────────────────────────────────────────────────────────────────
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));

// ── Endpoints de login (chamados diretamente pelo browser do usuário) ─────────

// Verifica se o servidor está rodando e qual o status do login
app.get("/status", (_req, res) => {
  res.json({ ok: true, logado: loginStatus === "logado", tunnelUrl });
});

// Compatibilidade com nome antigo
app.get("/ping", (_req, res) => {
  res.json({ ok: true, loginStatus });
});

// Abre o Chrome com sessão persistente (não precisa logar de novo se já logou antes)
app.post("/iniciar-sessao", async (_req, res) => {
  try {
    // Se já tem contexto aberto e a página responde, só verifica o login
    if (context && mainPage) {
      try {
        await mainPage.evaluate(() => document.title);
        loginStatus = "aguardando";
        await mainPage.goto(MAG_URL, { waitUntil: "domcontentloaded" });
        monitorarLogin();
        return res.json({ ok: true });
      } catch {
        context = null; mainPage = null;
      }
    }

    const { chromium } = require("playwright");

    // Contexto persistente: salva cookies/sessão em ~/.mag-boletos-session
    // Na primeira vez pede login; nas próximas, já entra direto.
    context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      args: ["--start-maximized"],
      acceptDownloads: true,
      viewport: null,
    });

    // Reusa aba existente se houver, senão abre uma nova
    const pages = context.pages();
    mainPage = pages.length > 0 ? pages[0] : await context.newPage();

    loginStatus = "aguardando";
    await mainPage.goto(MAG_URL, { waitUntil: "domcontentloaded" });
    monitorarLogin();

    res.json({ ok: true });
  } catch (err) {
    console.error("[MAG] Erro ao iniciar sessão:", err.message);
    res.status(500).json({ erro: err.message });
  }
});

// Polling do frontend para saber se o login foi concluído
app.get("/status-login", (_req, res) => {
  res.json({ status: loginStatus });
});

// ── Endpoint de busca (chamado pelo Railway via ngrok) ────────────────────────

app.post("/buscar-boletos", async (req, res) => {
  const { jobId, clientes, callbackUrl, apiKey } = req.body;

  if (!Array.isArray(clientes) || clientes.length === 0) {
    return res.status(400).json({ erro: "Lista de clientes inválida" });
  }
  if (!jobId || !callbackUrl || !apiKey) {
    return res.status(400).json({ erro: "jobId, callbackUrl e apiKey são obrigatórios" });
  }
  if (loginStatus !== "logado") {
    return res.status(400).json({ erro: "sem_sessao" });
  }

  res.json({ ok: true, total: clientes.length });

  processarBoletos(jobId, clientes, callbackUrl, apiKey).catch((err) => {
    console.error("[MAG] Erro fatal:", err.message);
    enviarProgresso(callbackUrl, apiKey, {
      jobId, tipo: "erro_fatal", motivo: err.message,
      atual: 0, total: clientes.length, mensagem: "Erro fatal: " + err.message,
    }).catch(() => {});
  });
});

// ── Automação ─────────────────────────────────────────────────────────────────

function monitorarLogin() {
  const t = setInterval(async () => {
    if (!mainPage) { clearInterval(t); return; }
    try {
      const url = mainPage.url();
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

async function enviarCallback(url, apiKey, body) {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      console.warn(`[MAG] Callback ${url} retornou ${resp.status}`);
    }
  } catch (err) {
    console.warn("[MAG] Falha no callback:", err.message);
  }
}

async function enviarProgresso(callbackUrl, apiKey, dados) {
  return enviarCallback(`${callbackUrl}/progresso`, apiKey, dados);
}

async function processarBoletos(jobId, clientes, callbackUrl, apiKey) {
  for (let i = 0; i < clientes.length; i++) {
    const { cpf, nome } = clientes[i];

    await enviarProgresso(callbackUrl, apiKey, {
      jobId, atual: i + 1, total: clientes.length, cpf, tipo: "progresso",
      mensagem: `Processando ${i + 1}/${clientes.length} — ${nome || cpf}`,
    });

    try {
      const res = await buscarBoletoPorCpf(cpf, nome);

      if (res.sucesso) {
        await enviarCallback(`${callbackUrl}/boleto`, apiKey, {
          jobId, cpf, base64: res.base64, nomeArquivo: res.nomeArquivo,
        });
        await enviarProgresso(callbackUrl, apiKey, {
          jobId, atual: i + 1, total: clientes.length, cpf, tipo: "progresso",
          mensagem: `✓ ${i + 1}/${clientes.length} — ${nome || cpf} — boleto baixado`,
        });
        console.log(`[MAG] ✓ ${nome || cpf} — boleto enviado`);
      } else {
        await enviarProgresso(callbackUrl, apiKey, {
          jobId, atual: i + 1, total: clientes.length, cpf, tipo: "falha",
          motivo: res.erro, mensagem: `✗ ${i + 1}/${clientes.length} — ${nome || cpf} — ${res.erro}`,
        });
        console.log(`[MAG] ✗ ${nome || cpf} — ${res.erro}`);
      }
    } catch (err) {
      await enviarProgresso(callbackUrl, apiKey, {
        jobId, atual: i + 1, total: clientes.length, cpf, tipo: "falha",
        motivo: err.message, mensagem: `✗ ${i + 1}/${clientes.length} — ${nome || cpf} — ${err.message}`,
      });
      console.log(`[MAG] ✗ ${nome || cpf} — ${err.message}`);

      try {
        for (const p of context.pages()) {
          if (p !== mainPage) await p.close().catch(() => {});
        }
      } catch {}
    }

    if (i < clientes.length - 1) await sleep(1500);
  }

  // Sinaliza conclusão
  await enviarProgresso(callbackUrl, apiKey, {
    jobId, tipo: "concluido",
    atual: clientes.length, total: clientes.length,
    mensagem: "Processamento concluído",
  });
  console.log(`[MAG] Job ${jobId} concluído`);
}

async function buscarBoletoPorCpf(cpf, nome) {
  const cpfLimpo = cpf.replace(/\D/g, "");
  const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  const page = mainPage;

  // ── 1. Navega para página de inadimplências ───────────────────────────────
  const base = page.url().split("/s/")[0] + "/s/";
  const urlInad = base + "inadimplencias";
  if (!page.url().includes("inadimplencia")) {
    await page.goto(urlInad, { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(2000);
  }

  // ── 2. Busca pelo nome no campo de pesquisa ───────────────────────────────
  const campoBusca = await page.waitForSelector(
    'input[placeholder*="nome"], input[placeholder*="Nome"], input[placeholder*="Digite"]',
    { timeout: 10000 }
  );
  await campoBusca.fill("");
  await sleep(300);

  // Usa nome se disponível, senão CPF formatado
  const termoBusca = nome && nome.trim() ? nome.trim().split(" ")[0] : cpfFormatado;
  await campoBusca.fill(termoBusca);
  await sleep(1500);
  await page.keyboard.press("Enter");
  await sleep(2000);

  // ── 3. Acha a linha pelo CPF na tabela ───────────────────────────────────
  let linhaCliente = await page.$(`tr:has-text("${cpfFormatado}"), tr:has-text("${cpfLimpo}")`);

  if (!linhaCliente && nome) {
    // Tenta buscar com nome completo
    await campoBusca.fill("");
    await sleep(300);
    await campoBusca.fill(nome.trim());
    await sleep(1500);
    await page.keyboard.press("Enter");
    await sleep(2000);
    linhaCliente = await page.$(`tr:has-text("${cpfFormatado}"), tr:has-text("${cpfLimpo}")`);
  }

  if (!linhaCliente) {
    const ss = path.join(os.homedir(), "Desktop", `mag-sem-resultado-${Date.now()}.png`);
    await page.screenshot({ path: ss });
    console.log(`[MAG] Cliente não encontrado (${nome} / ${cpfFormatado}). Screenshot: ${ss}`);
    return { sucesso: false, erro: "Cliente não encontrado na listagem de inadimplentes" };
  }

  // ── 4. Clica na seta ">" para abrir o detalhe ────────────────────────────
  const seta = await linhaCliente.$('td:last-child button, td:last-child a');
  if (seta) {
    await seta.click();
  } else {
    await linhaCliente.click();
  }
  await page.waitForLoadState("load", { timeout: 15000 });
  await sleep(2000);

  // Screenshot do detalhe do cliente
  const ssDetalhe = path.join(os.homedir(), "Desktop", `mag-detalhe-${Date.now()}.png`);
  await page.screenshot({ path: ssDetalhe, fullPage: true });
  console.log(`[MAG] Screenshot detalhe cliente: ${ssDetalhe}`);

  // ── 5. Seleciona todos os checkboxes de parcelas ──────────────────────────
  const checkboxes = await page.$$('input[type="checkbox"]');
  for (const cb of checkboxes) {
    try {
      const checked = await cb.isChecked({ timeout: 2000 }).catch(() => true);
      if (!checked) {
        await cb.check({ timeout: 3000 }).catch(() => {});
      }
    } catch {}
  }
  await sleep(800);

  // Captura competências para nomear o arquivo
  const competencias = await page.evaluate(() => {
    const tds = Array.from(document.querySelectorAll("td, [class*='competencia'], [class*='parcela']"));
    return tds
      .map((el) => el.textContent?.trim())
      .filter((t) => t && /\d{2}\/\d{4}/.test(t))
      .slice(0, 4)
      .join("_")
      .replace(/\//g, "-");
  }).catch(() => "boleto");

  // ── 6. Clica em "Cobrar inadimplência" ───────────────────────────────────
  const ssBefore = path.join(os.homedir(), "Desktop", `mag-antes-cobrar-${Date.now()}.png`);
  await page.screenshot({ path: ssBefore, fullPage: true });
  console.log(`[MAG] Screenshot antes de cobrar: ${ssBefore}`);

  await page.click(
    'button:has-text("Cobrar inadimplência"), button:has-text("Cobrar Inadimplência"), ' +
    'button:has-text("Cobrança Inadimplentes"), span:has-text("Cobrar inadimplência"), ' +
    'span:has-text("Cobrança Inadimplentes")',
    { timeout: 12000 }
  );
  await sleep(1500);

  // ── 7. Confirma ──────────────────────────────────────────────────────────
  const ssConfirm = path.join(os.homedir(), "Desktop", `mag-confirmar-${Date.now()}.png`);
  await page.screenshot({ path: ssConfirm, fullPage: true });
  console.log(`[MAG] Screenshot antes de confirmar: ${ssConfirm}`);

  const btnConfirmar = await page.waitForSelector(
    'button:has-text("Confirmar"), button:has-text("Gerar"), button:has-text("OK"), button:has-text("Próximo"), button:has-text("Sim")',
    { timeout: 10000 }
  );
  await btnConfirmar.click();
  await sleep(2000);

  // ── 8. Clica no link gerado → nova aba ───────────────────────────────────
  const [novaAba] = await Promise.all([
    context.waitForEvent("page", { timeout: 20000 }),
    page.click(
      'a[href*="link"], a[href*="boleto"], a:has-text("Acessar"), a:has-text("Visualizar"), a:has-text("Link"), td a',
      { timeout: 10000 }
    ),
  ]);
  await novaAba.waitForLoadState("domcontentloaded", { timeout: 20000 });

  // ── 9. Escolher pagamento → Boleto → Gerar ───────────────────────────────
  await novaAba.click(
    'button:has-text("Escolher pagamento"), button:has-text("Pagamento"), a:has-text("Pagamento")',
    { timeout: 15000 }
  );
  await sleep(1000);

  await novaAba.click('label:has-text("Boleto"), button:has-text("Boleto"), input[value*="BOLETO"]', { timeout: 10000 });
  await sleep(800);

  const [download] = await Promise.all([
    novaAba.waitForEvent("download", { timeout: 30000 }),
    novaAba.click('button:has-text("Gerar boleto"), button:has-text("Gerar Boleto"), button:has-text("Gerar")', { timeout: 10000 }),
  ]);

  const nomeArquivo = `${cpfLimpo}-${competencias || "boleto"}.pdf`;
  const filePath = path.join(DOWNLOAD_DIR, nomeArquivo);
  await download.saveAs(filePath);
  await novaAba.close().catch(() => {});

  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString("base64");
  fs.unlink(filePath, () => {});

  return { sucesso: true, base64, nomeArquivo };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Start ─────────────────────────────────────────────────────────────────────
const { Tunnel } = require("cloudflared");

let cfTunnel = null;

app.listen(PORT, () => {
  console.log("");
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║     Barcellos Seguros — Buscador de Boletos MAG        ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  console.log(`\n✓ Servidor ativo em http://localhost:${PORT}`);
  console.log("\n⏳ Abrindo túnel público (Cloudflare)...\n");

  try {
    cfTunnel = new Tunnel(["tunnel", "--url", `http://localhost:${PORT}`]);

    cfTunnel.on("url", (url) => {
      tunnelUrl = url;
      console.log("╔════════════════════════════════════════════════════════╗");
      console.log("║  ✓ PRONTO — pode usar o sistema normalmente            ║");
      console.log(`║  ${url.padEnd(54)}║`);
      console.log("╚════════════════════════════════════════════════════════╝\n");
    });

    cfTunnel.on("error", (err) => {
      console.error("[MAG] Erro no túnel:", err.message);
    });
  } catch (err) {
    console.error("[MAG] Não foi possível abrir túnel:", err.message);
    console.log(`\n→ Alternativa manual: ngrok http ${PORT}`);
  }
});

process.on("SIGINT", async () => {
  console.log("\n[MAG] Encerrando...");
  if (cfTunnel) cfTunnel.stop();
  if (context) await context.close().catch(() => {});
  process.exit(0);
});

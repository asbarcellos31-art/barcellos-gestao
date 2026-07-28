#!/usr/bin/env node
/**
 * Servidor companheiro local — Buscador de Boletos MAG
 * Barcellos Seguros
 *
 * Como usar:
 *   Setup (uma única vez):
 *     cd scripts && npm install
 *     npx playwright install chromium
 *
 *   Toda vez que for usar:
 *     node scripts/mag-boletos-server.js
 *     (o túnel Cloudflare abre automaticamente — copie a URL no sistema)
 */

const express = require("express");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");
const os      = require("os");

const PORT         = 4040;
const DOWNLOAD_DIR = path.join(os.tmpdir(), "mag-boletos");
const MAG_URL      = "https://plataformadosprodutores.mag.com.br/s/inadimplencias";
const SS_DIR       = path.join(os.homedir(), "Desktop", "mag-screenshots");

// ── Estado global ─────────────────────────────────────────────────────────────
let context        = null;
let mainPage       = null;
let loginStatus    = "aguardando";
let tunnelUrl      = null;
let jobEmExecucao  = false;

const USER_DATA_DIR = path.join(os.homedir(), ".mag-boletos-session");

// ── Setup ─────────────────────────────────────────────────────────────────────
for (const d of [DOWNLOAD_DIR, USER_DATA_DIR, SS_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function screenshot(page, nome) {
  try {
    const ts = Date.now();
    const p = path.join(SS_DIR, `${ts}-${nome}.png`);
    await page.screenshot({ path: p, fullPage: true });
    console.log(`  [SS] ${p}`);
    return p;
  } catch {}
}

// Aguarda elemento com múltiplos seletores — retorna o primeiro que encontrar
async function esperarQualquer(page, seletores, timeout = 15000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    for (const sel of seletores) {
      try {
        const el = await page.$(sel);
        if (el) {
          const visivel = await el.isVisible().catch(() => false);
          if (visivel) return el;
        }
      } catch {}
    }
    await sleep(500);
  }
  return null;
}

// ── Endpoints de controle ─────────────────────────────────────────────────────

app.get("/status", (_req, res) => {
  // Verifica se o browser ainda está vivo
  if (loginStatus === "logado" && (!mainPage || mainPage.isClosed())) {
    loginStatus = "aguardando";
    context = null;
    mainPage = null;
  }
  res.json({ ok: true, logado: loginStatus === "logado", tunnelUrl });
});

app.get("/ping", (_req, res) => {
  res.json({ ok: true, loginStatus });
});

app.get("/status-login", (_req, res) => {
  res.json({ status: loginStatus });
});

app.post("/iniciar-sessao", async (_req, res) => {
  try {
    // Reutiliza contexto existente se ainda estiver vivo
    if (context && mainPage) {
      try {
        await mainPage.evaluate(() => document.title);
        loginStatus = "aguardando";
        await mainPage.goto(MAG_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
        monitorarLogin();
        return res.json({ ok: true });
      } catch {
        context = null; mainPage = null;
      }
    }

    // Mata qualquer Chrome preso com o mesmo perfil antes de abrir novo
    try {
      const { execSync } = require("child_process");
      execSync(`pkill -f "mag-boletos-session" 2>/dev/null || true`, { stdio: "ignore" });
      await sleep(1500);
    } catch {}

    const { chromium } = require("playwright");
    context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      args: ["--start-maximized"],
      acceptDownloads: true,
      viewport: null,
      permissions: ["notifications"],
    });

    const pages = context.pages();
    mainPage = pages.length > 0 ? pages[0] : await context.newPage();

    loginStatus = "aguardando";
    await mainPage.goto(MAG_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    monitorarLogin();

    res.json({ ok: true });
  } catch (err) {
    console.error("[MAG] Erro ao iniciar sessão:", err.message);
    res.status(500).json({ erro: err.message });
  }
});

// ── Busca de boletos (chamado pelo Railway via túnel) ─────────────────────────

app.post("/buscar-boletos", async (req, res) => {
  const { jobId, clientes, callbackUrl, apiKey } = req.body;

  if (!Array.isArray(clientes) || clientes.length === 0)
    return res.status(400).json({ erro: "Lista de clientes inválida" });
  if (!jobId || !callbackUrl || !apiKey)
    return res.status(400).json({ erro: "jobId, callbackUrl e apiKey são obrigatórios" });
  if (loginStatus !== "logado")
    return res.status(400).json({ erro: "sem_sessao" });
  if (jobEmExecucao)
    return res.status(409).json({ erro: "Já há um job em execução. Aguarde." });

  jobEmExecucao = true;
  res.json({ ok: true, total: clientes.length });

  processarBoletos(jobId, clientes, callbackUrl, apiKey).catch(err => {
    console.error("[MAG] Erro fatal:", err.message);
    jobEmExecucao = false;
    enviarProgresso(callbackUrl, apiKey, {
      jobId, tipo: "erro_fatal", motivo: err.message,
      atual: 0, total: clientes.length,
      mensagem: "Erro fatal: " + err.message,
    }).catch(() => {});
  });
});

// ── Detecção de login ─────────────────────────────────────────────────────────

function monitorarLogin() {
  console.log("[MAG] Monitorando login...");
  let tentativas = 0;
  const t = setInterval(async () => {
    if (!mainPage) { clearInterval(t); return; }
    tentativas++;
    try {
      const url = mainPage.url();
      const isLoginPage = url.includes("/login") || url.includes("login?") || url.includes("secur/login");

      if (!isLoginPage && url.includes("plataforma")) {
        // Detecta elementos típicos do portal logado
        const logado = await mainPage.evaluate(() => {
          // Salesforce Lightning — vários seletores possíveis
          return !!(
            document.querySelector(".slds-global-header") ||
            document.querySelector("[data-aura-class*='Nav']") ||
            document.querySelector("navigation-bar") ||
            document.querySelector(".slds-global-navigation-bar") ||
            document.querySelector("[class*='globalHeader']") ||
            document.querySelector(".comm-header") ||
            document.querySelector("c-navbar") ||
            // Verifica se tem menu lateral ou header de usuário logado
            document.querySelector(".slds-avatar") ||
            document.querySelector("[data-aura-class*='forceCommunity']") ||
            // Fallback: se não está na tela de login e tem conteúdo da página
            (document.body.innerText.length > 500 && !document.body.innerText.toLowerCase().includes("entrar com"))
          );
        }).catch(() => false);

        if (logado) {
          loginStatus = "logado";
          console.log("[MAG] ✓ Login detectado —", url);
          clearInterval(t);
          return;
        }
      }

      if (tentativas % 5 === 0) console.log(`[MAG] Aguardando login... URL: ${url}`);
    } catch { /* página pode estar carregando */ }
  }, 2000);

  // Timeout de 10 minutos para login
  setTimeout(() => clearInterval(t), 10 * 60 * 1000);
}

// ── Callbacks para o Railway ──────────────────────────────────────────────────

async function enviarCallback(url, apiKey, body) {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(body),
    });
    if (!resp.ok) console.warn(`[MAG] Callback ${url} → ${resp.status}`);
  } catch (err) {
    console.warn("[MAG] Falha no callback:", err.message);
  }
}

async function enviarProgresso(callbackUrl, apiKey, dados) {
  return enviarCallback(`${callbackUrl}/progresso`, apiKey, dados);
}

// ── Loop de processamento ─────────────────────────────────────────────────────

async function processarBoletos(jobId, clientes, callbackUrl, apiKey) {
  console.log(`\n[MAG] Iniciando job ${jobId} — ${clientes.length} cliente(s)`);

  for (let i = 0; i < clientes.length; i++) {
    const { cpf, nome } = clientes[i];
    console.log(`\n[MAG] ${i+1}/${clientes.length} — ${nome || cpf}`);

    await enviarProgresso(callbackUrl, apiKey, {
      jobId, atual: i + 1, total: clientes.length, cpf, tipo: "progresso",
      mensagem: `Processando ${i+1}/${clientes.length} — ${nome || cpf}`,
    });

    try {
      const res = await buscarBoletoPorCpf(cpf, nome);

      if (res.sucesso) {
        for (const boleto of res.boletos) {
          await enviarCallback(`${callbackUrl}/boleto`, apiKey, {
            jobId, cpf, base64: boleto.base64, nomeArquivo: boleto.nomeArquivo,
          });
        }
        await enviarProgresso(callbackUrl, apiKey, {
          jobId, atual: i + 1, total: clientes.length, cpf, tipo: "progresso",
          mensagem: `✓ ${i+1}/${clientes.length} — ${nome || cpf} — ${res.boletos.length} boleto(s) salvo(s)`,
        });
        console.log(`[MAG] ✓ ${res.boletos.length} boleto(s) enviados para ${nome || cpf}`);
      } else {
        await enviarProgresso(callbackUrl, apiKey, {
          jobId, atual: i + 1, total: clientes.length, cpf, tipo: "falha",
          motivo: res.erro,
          mensagem: `✗ ${i+1}/${clientes.length} — ${nome || cpf} — ${res.erro}`,
        });
        console.log(`[MAG] ✗ Falha: ${res.erro}`);
      }
    } catch (err) {
      console.error(`[MAG] Exceção em ${nome || cpf}:`, err.message);
      await enviarProgresso(callbackUrl, apiKey, {
        jobId, atual: i + 1, total: clientes.length, cpf, tipo: "falha",
        motivo: err.message,
        mensagem: `✗ ${i+1}/${clientes.length} — ${nome || cpf} — ${err.message}`,
      });

      // Fecha abas extras e volta para a aba principal
      try {
        for (const p of context.pages()) {
          if (p !== mainPage) await p.close().catch(() => {});
        }
        // Tenta navegar de volta para a página principal
        await mainPage.goto(MAG_URL, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
      } catch {}
    }

    if (i < clientes.length - 1) await sleep(2000);
  }

  await enviarProgresso(callbackUrl, apiKey, {
    jobId, tipo: "concluido",
    atual: clientes.length, total: clientes.length,
    mensagem: "Processamento concluído",
  });
  console.log(`\n[MAG] ✓ Job ${jobId} concluído`);
  jobEmExecucao = false;
}

// ── Automação no portal MAG ───────────────────────────────────────────────────

async function buscarBoletoPorCpf(cpf, nome) {
  const cpfLimpo     = cpf.replace(/\D/g, "");
  const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  const page         = mainPage;

  console.log(`  CPF: ${cpfFormatado}`);

  // ── 1. Navega para inadimplências e aguarda carregar ─────────────────────
  // Sempre navega para a página principal de busca (não apenas se não estiver em inadimplencia,
  // pois a URL pode ser a ficha de um cliente anterior)
  const urlAtual = page.url();
  const naTelaCorreta = urlAtual.replace(/\?.*/, '').replace(/\/$/, '').endsWith('/s/inadimplencias');
  if (!naTelaCorreta) {
    const magBase = "https://plataformadosprodutores.mag.com.br";
    const base    = urlAtual.includes("plataformadosprodutores") ? urlAtual.split("/s/")[0] : magBase;
    const urlInad = base + "/s/inadimplencias";
    console.log(`  Navegando para: ${urlInad}`);
    await page.goto(urlInad, { waitUntil: "domcontentloaded", timeout: 30000 });
  }
  // Verifica se sessão expirou (redirecionou para login)
  const urlPosNav = page.url();
  if (urlPosNav.includes("login") || urlPosNav.includes("identidade.mag") || urlPosNav.includes("secur/login")) {
    loginStatus = "aguardando";
    console.log("  [SESSÃO] Sessão expirada — redirecionado para login");
    return { sucesso: false, erro: "sessao_expirada" };
  }
  // Aguarda tabela ter dados reais (waitForSelector pierca shadow DOM)
  await page.waitForSelector(
    'tr:has-text("R$"), [role="row"]:has-text("R$"), tr:has-text("Regulari"), [role="row"]:has-text("Pend")',
    { timeout: 25000 }
  ).catch(() => {});
  // Verifica novamente após espera (pode ter redirecionado durante carregamento)
  if (page.url().includes("login") || page.url().includes("identidade.mag")) {
    loginStatus = "aguardando";
    return { sucesso: false, erro: "sessao_expirada" };
  }
  await sleep(1500);
  await screenshot(page, `1-inadimplencias-${cpfLimpo}`);

  // ── 2. Busca pelo cliente ─────────────────────────────────────────────────
  const campoBusca = await esperarQualquer(page, [
    'input[placeholder*="nome" i]',
    'input[placeholder*="Digite" i]',
    'input[placeholder*="buscar" i]',
    'input[placeholder*="search" i]',
    'input[type="search"]',
    'lightning-input input',
  ], 10000);

  if (!campoBusca) {
    await screenshot(page, `erro-campo-busca-${cpfLimpo}`);
    return { sucesso: false, erro: "Campo de busca não encontrado" };
  }

  const termoBusca = nome?.trim() || cpfFormatado; // nome completo para resultado único
  let linhaCliente = null;

  console.log(`  Buscando por: "${termoBusca}"`);

  // Tenta digitar até 3x — após jobs anteriores o LWC pode ignorar os primeiros caracteres
  for (let tentDigit = 0; tentDigit < 3; tentDigit++) {
    await campoBusca.click({ clickCount: 3 });
    await sleep(300);
    await page.keyboard.press("Control+a");
    await sleep(200);
    await page.keyboard.press("Delete");
    await sleep(300);
    await page.keyboard.type(termoBusca, { delay: 100 });
    await sleep(500);

    // Verifica se o campo realmente tem o texto esperado
    const valorAtual = await campoBusca.evaluate(el => el.value).catch(() => "");
    console.log(`  Campo busca (tentativa ${tentDigit + 1}): "${valorAtual}"`);
    if (valorAtual.toLowerCase().includes(termoBusca.toLowerCase().slice(0, 3))) break;
    await sleep(500);
  }

  await page.keyboard.press("Enter");

  // Aguarda linha com o nome aparecer nos resultados filtrados
  await page.waitForSelector(
    `tr:has-text("${termoBusca}"), [role="row"]:has-text("${termoBusca}")`,
    { timeout: 12000 }
  ).catch(() => {});
  await sleep(1000);
  await screenshot(page, `2-resultado-busca-${cpfLimpo}`);

  linhaCliente = await page.$(`tr:has-text("${cpfFormatado}")`);
  if (!linhaCliente) linhaCliente = await page.$(`[role="row"]:has-text("${cpfFormatado}")`);
  if (!linhaCliente) linhaCliente = await page.$(`tr:has-text("${cpfLimpo}")`);
  if (!linhaCliente) linhaCliente = await page.$(`[role="row"]:has-text("${cpfLimpo}")`);
  if (!linhaCliente) linhaCliente = await page.$(`tr:has-text("${termoBusca.toUpperCase()}")`);
  if (!linhaCliente) linhaCliente = await page.$(`[role="row"]:has-text("${termoBusca.toUpperCase()}")`);
  if (linhaCliente) console.log(`  ✓ Cliente encontrado`);

  if (!linhaCliente) {
    await screenshot(page, `erro-cliente-nao-encontrado-${cpfLimpo}`);
    return { sucesso: false, erro: `Cliente não encontrado (CPF: ${cpfFormatado})` };
  }

  // ── 3. Clica no nome do cliente para abrir ficha de inadimplências
  console.log("  Abrindo página de competências...");
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(600);

  // Tenta via locator Playwright (pierça shadow DOM nativamente)
  let clicou = false;
  const primeiroNome = (nome || '').trim().split(' ')[0];
  if (primeiroNome) {
    try {
      const el = linhaCliente.locator(`:text("${primeiroNome}")`).first();
      const bb = await el.boundingBox({ timeout: 3000 }).catch(() => null);
      if (bb) { await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); clicou = true; }
    } catch {}
  }
  if (!clicou) {
    // Fallback: bounding box da linha — coluna "Cliente" está a ~170px do início da linha
    const bb = await linhaCliente.boundingBox().catch(() => null);
    if (!bb) return { sucesso: false, erro: "Linha do cliente sem posição" };
    await page.mouse.click(bb.x + 170, bb.y + bb.height / 2);
  }

  await page.waitForLoadState("networkidle", { timeout: 25000 }).catch(() =>
    page.waitForLoadState("domcontentloaded", { timeout: 20000 })
  );
  await sleep(3000);
  const urlFicha = page.url(); // salva URL da ficha para poder retornar após cada link
  await screenshot(page, `3-competencias-${cpfLimpo}`);

  // ── 4. FASE 1: Gera links para todas as competências "Não trabalhadas" ───

  // Busca elemento por texto em shadow DOM recursivo → retorna coordenadas
  const findByText = async (textos, tags = ['button', 'a', '[role="tab"]', 'li'], timeout = 12000) => {
    const tagsSel = tags.join(',');
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const coords = await page.evaluate(({ textos, tagsSel }) => {
        function find(root) {
          for (const el of root.querySelectorAll(tagsSel)) {
            const t = (el.textContent || '').trim();
            if (textos.some(tx => t === tx || t.startsWith(tx))) {
              el.scrollIntoView({ block: 'center', behavior: 'instant' });
              const r = el.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            }
          }
          for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) { const r = find(el.shadowRoot); if (r) return r; }
          }
          return null;
        }
        return find(document);
      }, { textos, tagsSel }).catch(() => null);
      if (coords) return coords;
      await sleep(500);
    }
    return null;
  };

  // Clica a aba "Não trabalhadas" via shadow DOM recursivo (regex para tolerar encoding)
  const clicarAbaNT = async () => {
    const coords = await page.evaluate(() => {
      function find(root) {
        for (const el of root.querySelectorAll('a, button, [role="tab"], li, span, div')) {
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (t.length < 60 && /N.{0,3}o\s+trabalhadas/i.test(t)) {
            el.scrollIntoView({ block: 'center', behavior: 'instant' });
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) { const r = find(el.shadowRoot); if (r) return r; }
        }
        return null;
      }
      return find(document);
    }).catch(() => null);
    if (coords) { await page.mouse.click(coords.x, coords.y); await sleep(2000); return true; }
    console.log("  ⚠ Aba 'Não trabalhadas' não encontrada");
    return false;
  };
  await clicarAbaNT();

  const nomeLimpo = nome
    ? nome.replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, "").trim().substring(0, 40).replace(/\s+/g, "_")
    : cpfLimpo;

  const boletos = [];
  let competenciasGeradas = 0;
  const processedComps = new Set(); // competências já processadas nesta sessão

  // Garante que começa na aba Não trabalhadas.
  // Phase 1 quebra sozinha se não houver linhas (cliente só tem Trabalhadas).
  // Phase 2 (fallback) cuida dos links pré-existentes quando Phase 1 não baixou nada.
  await clicarAbaNT();
  await sleep(2000);

  // Busca todas as linhas da tabela via shadow DOM recursivo.
  // Retorna array de { comp, cbCoords } onde cbCoords aponta para o elemento VISÍVEL
  // (anda para cima a partir do input escondido até encontrar ancestral com área > 8px).
  const obterLinhasTabela = async () => {
    return page.evaluate(() => {
      const rows = [];
      const seen = new Set();

      function cbCoordsDeInput(input) {
        // Anda para cima pelo DOM até achar elemento visível (>= 8px)
        let el = input;
        for (let i = 0; i < 8 && el; i++) {
          const r = el.getBoundingClientRect();
          if (r.width >= 8 && r.height >= 8 && r.top >= -50 && r.top <= window.innerHeight + 50) {
            el.scrollIntoView({ block: 'center', behavior: 'instant' });
            const r2 = el.getBoundingClientRect();
            return { x: r2.x + r2.width / 2, y: r2.y + r2.height / 2 };
          }
          el = el.parentElement;
        }
        // Fallback: procura label ou span irmão visível
        const parent = input.parentElement;
        if (parent) {
          for (const sib of parent.querySelectorAll('label, [class*="faux"], [class*="checkbox__label"]')) {
            const r = sib.getBoundingClientRect();
            if (r.width >= 8 && r.height >= 8) {
              sib.scrollIntoView({ block: 'center', behavior: 'instant' });
              const r2 = sib.getBoundingClientRect();
              return { x: r2.x + r2.width / 2, y: r2.y + r2.height / 2 };
            }
          }
        }
        return null;
      }

      function findInputCb(root) {
        for (const e of root.querySelectorAll('*')) {
          if (e.tagName?.toLowerCase() === 'input' && e.type === 'checkbox') return e;
          if (e.shadowRoot) { const f = findInputCb(e.shadowRoot); if (f) return f; }
        }
        return null;
      }

      function scanRows(root) {
        for (const tbody of root.querySelectorAll('tbody')) {
          for (const tr of tbody.querySelectorAll('tr')) {
            const text = (tr.textContent || '').replace(/\s+/g, ' ').trim();
            if (!text || seen.has(text.slice(0, 40))) continue;
            seen.add(text.slice(0, 40));

            let comp = '';
            const m = text.match(/([A-Za-záéíóúãõÉÁÍÓÚÃÕ]+\s*[–\-]\s*\d{4}|\d{2}\/\d{4})/i);
            if (m) comp = m[0].replace(/\s*[–\-]\s*/, '-').replace('/', '-');

            const inputEl = findInputCb(tr);
            const cbCoords = inputEl ? cbCoordsDeInput(inputEl) : null;
            if (cbCoords) rows.push({ comp, cbCoords });
          }
        }
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) scanRows(el.shadowRoot);
        }
      }
      scanRows(document);
      return rows;
    }).catch(() => []);
  };

  // Força seleção via propriedade checked + evento change composed (backup)
  const forcarSelecaoCheckboxes = async (compRef) => {
    if (!compRef) return 0; // sem competência identificada → não seleciona nada
    return page.evaluate((compRef) => {
      let count = 0;
      function selectInRoot(root) {
        for (const tbody of root.querySelectorAll('tbody')) {
          for (const tr of tbody.querySelectorAll('tr')) {
            const text = (tr.textContent || '').replace(/\s+/g, ' ');
            const forms = [compRef, compRef.replace('-', ' - '), compRef.replace('-', '/')];
            if (!forms.some(f => text.includes(f))) continue;
            function activateCb(r) {
              for (const e of r.querySelectorAll('*')) {
                if (e.tagName?.toLowerCase() === 'input' && e.type === 'checkbox') {
                  if (!e.checked) {
                    e.checked = true;
                    e.dispatchEvent(new Event('change', { bubbles: true, cancelable: false, composed: true }));
                    e.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
                  }
                  return true;
                }
                if (e.shadowRoot) { if (activateCb(e.shadowRoot)) return true; }
              }
              return false;
            }
            if (activateCb(tr)) count++;
          }
        }
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) selectInRoot(el.shadowRoot);
        }
      }
      selectInRoot(document);
      return count;
    }, compRef).catch(() => 0);
  };

  // Verifica se botão Cobrar está habilitado via shadow DOM recursivo
  const cobrarHabilitado = async () => {
    return page.evaluate(() => {
      function find(root) {
        for (const el of root.querySelectorAll('button')) {
          const t = (el.textContent || '').trim();
          if (/cobrar/i.test(t)) return !el.disabled && !el.hasAttribute('disabled');
        }
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) { const r = find(el.shadowRoot); if (r !== undefined) return r; }
        }
        return undefined;
      }
      return find(document);
    }).catch(() => false);
  };

  // Clica link emitido → abre nova aba → ESCOLHER PAGAMENTO → Boleto → GERAR BOLETO → BAIXAR
  const clicarLinkEBaixar = async (link, suffix) => {
    const nomeArquivoLocal = `${nomeLimpo}-${cpfLimpo}-${suffix}-${link.txt}.pdf`;
    let pdfBytes = null;
    let paginaLink = null;

    const coordsAtual = await page.evaluate((targetHref) => {
      function findLink(root) {
        for (const el of root.querySelectorAll('a')) {
          const href = el.href || el.getAttribute('href') || '';
          if (href === targetHref) {
            el.scrollIntoView({ block: 'center', behavior: 'instant' });
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
        }
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) { const r = findLink(el.shadowRoot); if (r) return r; }
        }
        return null;
      }
      return findLink(document);
    }, link.href).catch(() => null);

    try {
      const [novaAba] = await Promise.all([
        context.waitForEvent('page', { timeout: 8000 }),
        coordsAtual
          ? page.mouse.click(coordsAtual.x, coordsAtual.y)
          : page.evaluate((h) => { const a = document.querySelector(`a[href="${h}"]`); if (a) a.click(); }, link.href),
      ]);
      paginaLink = novaAba;
      await paginaLink.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
    } catch {
      console.log("  Nenhuma nova aba — navegando via href...");
      paginaLink = await context.newPage();
      await paginaLink.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    }

    paginaLink.on('response', async (resp) => {
      if ((resp.headers()['content-type'] || '').includes('application/pdf')) {
        pdfBytes = await resp.body().catch(() => null);
      }
    });
    await sleep(3000);
    await screenshot(paginaLink, `9-link-${cpfLimpo}-${suffix}`);

    const clicarMagpag = async (el) => {
      await el.evaluate(e => { e.scrollIntoView({ block: 'center', behavior: 'instant' }); e.click(); }).catch(() => {});
    };

    const btnEscolher = await esperarQualquer(paginaLink, [
      'button:has-text("ESCOLHER PAGAMENTO")',
      'button:has-text("Escolher Pagamento")',
      'a:has-text("ESCOLHER PAGAMENTO")',
    ], 8000);
    if (btnEscolher) {
      console.log("  → ESCOLHER PAGAMENTO");
      await clicarMagpag(btnEscolher);
      await sleep(3000);
      await screenshot(paginaLink, `9a-escolher-${cpfLimpo}-${suffix}`);
    }

    const optBoleto = await esperarQualquer(paginaLink, [
      'button:has-text("Boleto")', 'label:has-text("Boleto")',
      'input[value*="boleto" i]', 'li:has-text("Boleto")',
      '[data-method*="boleto" i]', 'button:has-text("Bancário")',
    ], 8000);
    if (optBoleto) {
      console.log("  → Boleto");
      await clicarMagpag(optBoleto);
      await sleep(2000);
    }
    await screenshot(paginaLink, `9b-boleto-${cpfLimpo}-${suffix}`);

    const btnGerarBoleto = await esperarQualquer(paginaLink, [
      'button:has-text("GERAR BOLETO")',
      'button:has-text("Gerar Boleto")',
      'button:has-text("Gerar boleto")',
    ], 8000);
    if (btnGerarBoleto) {
      console.log("  → GERAR BOLETO");
      await clicarMagpag(btnGerarBoleto);
      await sleep(5000);
      await screenshot(paginaLink, `9b2-gerado-${cpfLimpo}-${suffix}`);
    }

    let baixou = false;
    let resultado = null;
    try {
      const btnBaixar = await esperarQualquer(paginaLink, [
        'button:has-text("BAIXAR BOLETO")', 'a:has-text("BAIXAR BOLETO")',
        'button:has-text("Baixar Boleto")', 'a:has-text("Baixar Boleto")',
        'button:has-text("Baixar")', 'a:has-text("Baixar")',
      ], 10000);
      if (btnBaixar) {
        console.log("  → BAIXAR BOLETO");
        const [dl] = await Promise.all([
          paginaLink.waitForEvent('download', { timeout: 20000 }),
          clicarMagpag(btnBaixar),
        ]);
        const filePath = path.join(DOWNLOAD_DIR, nomeArquivoLocal);
        await dl.saveAs(filePath);
        const base64 = fs.readFileSync(filePath).toString('base64');
        fs.unlink(filePath, () => {});
        resultado = { base64, nomeArquivo: nomeArquivoLocal };
        console.log(`  ✓ ${nomeArquivoLocal}`);
        baixou = true;
      }
    } catch (err) {
      console.log(`  ✗ Download falhou: ${String(err.message || err).slice(0, 80)}`);
    }

    if (!baixou && pdfBytes) {
      resultado = { base64: pdfBytes.toString('base64'), nomeArquivo: nomeArquivoLocal };
      console.log(`  ✓ ${nomeArquivoLocal} (PDF interceptado)`);
      baixou = true;
    }

    if (!baixou) {
      const codigoBarra = await paginaLink.evaluate(() => {
        const els = document.querySelectorAll('p, span, div');
        for (const el of els) {
          const t = (el.textContent || '').trim().replace(/\s/g, '');
          if (/^\d{47,48}$/.test(t)) return t;
        }
        return null;
      }).catch(() => null);
      if (codigoBarra) {
        console.log(`  → Código de barras: ${codigoBarra}`);
        resultado = { base64: null, codigoBarra, nomeArquivo: nomeArquivoLocal };
        baixou = true;
      }
    }

    if (!baixou) {
      await screenshot(paginaLink, `9c-sem-dl-${cpfLimpo}-${suffix}`);
      console.log(`  ✗ Não baixou — ver screenshots`);
    }

    await paginaLink.close().catch(() => {});
    return resultado;
  };

  for (let grupo = 0; grupo < 20; grupo++) {
    // Grupo > 0: força reload limpo via about:blank para resetar aba ativa no LWC
    if (grupo > 0) {
      await page.goto('about:blank', { timeout: 5000 }).catch(() => {});
      await sleep(500);
      await page.goto(urlFicha, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await sleep(5000);
      await clicarAbaNT();
    }
    await sleep(1000);

    const linhas = await obterLinhasTabela();
    // Filtra competências já processadas nesta sessão (a plataforma não remove as linhas)
    const linhasNaoProc = linhas.filter(l => !l.comp || !processedComps.has(l.comp));
    if (linhasNaoProc.length === 0) { console.log("  Sem mais competências para processar"); break; }

    const compGrupo = linhasNaoProc[0].comp;
    // Agrupa todas as linhas da mesma competência. Se não identificou, processa 1 por vez.
    const linhasGrupo = compGrupo
      ? linhasNaoProc.filter(l => l.comp === compGrupo)
      : [linhasNaoProc[0]];
    console.log(`\n  Grupo ${grupo + 1}: competência "${compGrupo || '?'}" — ${linhasGrupo.length} linha(s)`);

    // Clica SOMENTE os checkboxes das linhas do grupo atual — nunca o header
    let selecionadas = 0;
    console.log(`  Clicando ${linhasGrupo.length} checkbox(es) do grupo "${compGrupo || '?'}"...`);
    for (const linha of linhasGrupo) {
      await page.mouse.click(linha.cbCoords.x, linha.cbCoords.y);
      await sleep(600);
      selecionadas++;
    }
    await sleep(1000);

    // Backup: força seleção via propriedade + evento composed (para LWC shadow DOM)
    const forçados = await forcarSelecaoCheckboxes(compGrupo);
    console.log(`  ${selecionadas} clicado(s) via coords + ${forçados} via JS composed`);
    await screenshot(page, `4-cb-${cpfLimpo}-g${grupo}`);

    // Aguarda botão Cobrar ficar habilitado
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(800);

    const habilitado = await cobrarHabilitado();
    if (!habilitado) {
      console.log("  ⚠ Botão Cobrar ainda desabilitado após seleção — tentando novamente via force...");
      // Segunda tentativa: força diretamente e espera mais
      await forcarSelecaoCheckboxes(compGrupo);
      await sleep(2000);
    }

    const cobrarCoords = await findByText(
      ['Cobrar inadimplência', 'Cobrar Inadimplência', 'Cobrar'],
      ['button'],
      10000
    );
    if (!cobrarCoords) { console.log("  Botão Cobrar não encontrado"); break; }

    console.log("  Clicando Cobrar inadimplência...");
    await page.mouse.click(cobrarCoords.x, cobrarCoords.y);
    await sleep(2000);
    await screenshot(page, `5-cobrar-${cpfLimpo}-g${grupo}`);

    const modal = await esperarQualquer(page, [
      '[role="dialog"]', '.slds-modal', 'div[aria-modal="true"]',
      'div:has-text("Gerar link de pagamento")',
      'div:has-text("Cobrança de inadimplência")',
    ], 20000);
    if (!modal) { console.log("  Modal não apareceu"); break; }
    await sleep(1500);
    await screenshot(page, `6-modal-${cpfLimpo}-g${grupo}`);

    const vazio = await page.$('text="Nenhum resultado encontrado"').catch(() => null);
    if (vazio) {
      await page.click('button:has-text("Cancelar")', { force: true }).catch(() => {});
      console.log("  Modal vazio — sem itens"); break;
    }

    const btnGerar = await esperarQualquer(page, [
      'button:has-text("Gerar link de pagamento")',
      'button:has-text("Gerar Link de Pagamento")',
      'button:has-text("Gerar link")',
      'button:has-text("Gerar")',
    ], 10000);
    if (!btnGerar) { console.log("  Botão Gerar não encontrado"); break; }

    console.log("  Clicando Gerar link de pagamento...");
    { const bb = await btnGerar.boundingBox().catch(() => null);
      if (bb) await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
      else await btnGerar.click({ force: true }); }

    await page.waitForFunction(
      () => !document.querySelector('[role="dialog"], .slds-modal'),
      { timeout: 15000 }
    ).catch(() => {});
    await sleep(2000);
    await screenshot(page, `7-pos-gerar-${cpfLimpo}-g${grupo}`);
    console.log(`  ✓ Links gerados para "${compGrupo}"`);
    competenciasGeradas += selecionadas;
    if (compGrupo) processedComps.add(compGrupo); // marca como processada para não repetir

    // ── Ciclo completo para esta competência: vai para Trabalhadas, clica link, baixa ──
    const coAbaT = await findByText(['Trabalhadas'], ['a', 'button', '[role="tab"]', 'li'], 8000);
    if (coAbaT) { await page.mouse.click(coAbaT.x, coAbaT.y); await sleep(2500); }

    const linksComp = await coletarLinksEmitidos();
    const linkComp = linksComp.length > 0 ? linksComp[0] : null;
    if (linkComp) {
      const boletoComp = await clicarLinkEBaixar(linkComp, `g${grupo}`);
      if (boletoComp) boletos.push(boletoComp);
    }
    // Volta para a ficha para processar próxima competência
    const urlAgora = page.url();
    const fichaBaseInner = urlFicha.split('?')[0];
    if (!urlAgora.startsWith(fichaBaseInner)) {
      await page.goto(urlFicha, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await sleep(5000);
    }
  }

  // ── 5. FASE 2 (fallback): se Phase 1 não baixou nada, tenta links pré-existentes ──
  if (boletos.length === 0) {
    const fichaBase = urlFicha.split('?')[0];
    const urlAtualFase2 = page.url();
    if (!urlAtualFase2.startsWith(fichaBase)) {
      await page.goto(urlFicha, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await sleep(5000);
    }

    await findByText(['Trabalhadas'], ['a', 'button', '[role="tab"]', 'li'], 8000)
      .then(c => c && page.mouse.click(c.x, c.y)).catch(() => {});
    await sleep(2000);
    await screenshot(page, `8-trabalhadas-${cpfLimpo}`);

    const todosLinks = await coletarLinksEmitidos();
    const vistos = new Set();
    const linksEmitidos = todosLinks.filter(l => {
      if (vistos.has(l.txt)) return false;
      vistos.add(l.txt); return true;
    });
    console.log(`  ${linksEmitidos.length} link(s): ${linksEmitidos.map(l => l.txt).join(', ')}`);

    if (linksEmitidos.length === 0) {
      await screenshot(page, `8b-sem-links-${cpfLimpo}`);
      return { sucesso: false, erro: "Nenhum link emitido encontrado na aba Trabalhadas" };
    }

    for (let i = 0; i < linksEmitidos.length; i++) {
      const link = linksEmitidos[i];
      const fichaBase2 = urlFicha.split('?')[0];
      console.log(`\n  Link ${i + 1}/${linksEmitidos.length}: "${link.txt}"`);

      if (i > 0) {
        const urlNow = page.url();
        if (!urlNow.startsWith(fichaBase2)) {
          await page.goto(urlFicha, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
          await sleep(4000);
        }
        await findByText(['Trabalhadas'], ['a', 'button', '[role="tab"]', 'li'], 8000)
          .then(c => c && page.mouse.click(c.x, c.y)).catch(() => {});
        await sleep(2000);
      }

      const boleto = await clicarLinkEBaixar(link, `link${i + 1}`);
      if (boleto) boletos.push(boleto);
    }
  }

  if (boletos.length === 0) {
    return { sucesso: false, erro: "Boletos não baixados — ver screenshots 9b/9c" };
  }
  return { sucesso: true, boletos };
}

// Coleta links curtos da aba Trabalhadas via shadow DOM recursivo — deduplicado por txt
async function coletarLinksEmitidos() {
  const page = mainPage;
  return page.evaluate(() => {
    function findLinks(root) {
      const links = [];
      for (const el of root.querySelectorAll('a')) {
        const txt = (el.textContent || '').trim();
        const href = el.href || el.getAttribute('href') || '';
        if (txt.length >= 4 && txt.length <= 12 && /^[a-z0-9]+$/i.test(txt) && href) {
          el.scrollIntoView({ block: 'center', behavior: 'instant' });
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0)
            links.push({ txt, href, x: r.x + r.width / 2, y: r.y + r.height / 2 });
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) links.push(...findLinks(el.shadowRoot));
      }
      return links;
    }
    return findLinks(document);
  }).catch(() => []);
}

// ── Startup ───────────────────────────────────────────────────────────────────

const { Tunnel } = require("cloudflared");
let cfTunnel = null;

app.listen(PORT, () => {
  console.log("");
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║     Barcellos Seguros — Buscador de Boletos MAG        ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  console.log(`\n✓ Servidor ativo em http://localhost:${PORT}`);
  console.log(`\n📁 Screenshots salvas em: ${SS_DIR}`);
  console.log("\n⏳ Abrindo túnel Cloudflare...\n");

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
    console.log(`\n→ Alternativa: ngrok http ${PORT}`);
  }
});

process.on("SIGINT", async () => {
  console.log("\n[MAG] Encerrando...");
  if (cfTunnel) cfTunnel.stop();
  if (context) await context.close().catch(() => {});
  process.exit(0);
});

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
const MAG_URL      = "https://plataformadosprodutores.mag.com.br/s/";
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
  const urlAtual = page.url();
  if (!urlAtual.includes("inadimplencia")) {
    const base    = urlAtual.split("/s/")[0];
    const urlInad = (base || MAG_URL.split("/s/")[0]) + "/s/inadimplencias";
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

  const termoBusca = nome?.trim().split(" ")[0] || cpfFormatado;
  let linhaCliente = null;

  console.log(`  Buscando por: "${termoBusca}"`);
  await campoBusca.click({ clickCount: 3 });
  await page.keyboard.press("Control+a");
  // type() simula teclas reais — dispara eventos do LWC (fill() não dispara)
  await page.keyboard.type(termoBusca, { delay: 80 });
  await sleep(800);
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

  // ── 3. Clica no NOME do cliente (não no ">") → vai para página de competências
  // Clicar em ">" vai para ficha social do Salesforce (errado).
  // Clicar no nome vai para a página com a lista de parcelas/competências (correto).
  const celulas = await linhaCliente.$$("td, [role='gridcell']");
  // Segunda coluna = nome do cliente (link)
  const celulaCliente = celulas.length > 1 ? celulas[1] : celulas[0];
  const linkNome = await celulaCliente.$('a').catch(() => null);

  console.log("  Abrindo página de competências...");
  // Dismiss backdrop/modal antes de clicar — Salesforce LWC mantém overlay que intercepta cliques
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(600);

  // Usa page.mouse com coordenadas para bypassar o backdrop overlay
  const elClick = linkNome || celulaCliente;
  const bbClick = elClick ? await elClick.boundingBox().catch(() => null) : null;
  if (bbClick) {
    await page.mouse.click(bbClick.x + bbClick.width / 2, bbClick.y + bbClick.height / 2);
  } else {
    await linhaCliente.click();
  }

  await page.waitForLoadState("networkidle", { timeout: 25000 }).catch(() =>
    page.waitForLoadState("domcontentloaded", { timeout: 20000 })
  );
  await sleep(3000);
  const urlFicha = page.url(); // salva URL da ficha para poder retornar após cada link
  await screenshot(page, `3-competencias-${cpfLimpo}`);

  // ── 4. FASE 1: Gera links para todas as competências "Não trabalhadas" ───
  const clicarAbaNT = async () => {
    const abaNT = await esperarQualquer(page, [
      'a:has-text("Não trabalhadas")',
      'button:has-text("Não trabalhadas")',
      '[role="tab"]:has-text("Não trabalhadas")',
    ], 5000);
    if (abaNT) { await abaNT.click().catch(() => {}); await sleep(1500); }
  };
  await clicarAbaNT();

  const nomeLimpo = nome
    ? nome.replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, "").trim().substring(0, 40).replace(/\s+/g, "_")
    : cpfLimpo;

  const boletos = [];
  let competenciasGeradas = 0;

  for (let rodada = 0; rodada < 10; rodada++) {
    const primeiraLinha = await page.$('table tbody tr:first-child').catch(() => null);
    if (!primeiraLinha) { console.log("  Sem mais linhas não-trabalhadas"); break; }

    const competencia = await primeiraLinha.evaluate(tr => {
      for (const td of tr.querySelectorAll("td")) {
        const t = td.textContent?.trim() || "";
        if (/[A-Za-záéíóúãõ]+ - \d{4}/i.test(t)) return t.replace(" - ", "-");
        if (/\d{2}\/\d{4}/.test(t)) return t.replace("/", "-");
      }
      return "";
    }).catch(() => "");
    console.log(`  Rodada ${rodada + 1}: competência "${competencia || "?"}"`);

    // Clica checkbox — shadow DOM recursivo
    const checkCoords = await primeiraLinha.evaluate(tr => {
      function findCheckbox(root) {
        for (const el of root.querySelectorAll('*')) {
          const tag = el.tagName?.toLowerCase() || '';
          if (tag === 'input' && el.type === 'checkbox') {
            el.scrollIntoView({ block: 'center', behavior: 'instant' });
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
          if (el.shadowRoot) { const r = findCheckbox(el.shadowRoot); if (r) return r; }
        }
        return null;
      }
      return findCheckbox(tr);
    }).catch(() => null);

    if (checkCoords) {
      await page.mouse.click(checkCoords.x, checkCoords.y);
      await sleep(1200);
    } else {
      const celulaCheck = await primeiraLinha.$("td:first-child").catch(() => null);
      if (celulaCheck) {
        const bb = await celulaCheck.boundingBox().catch(() => null);
        if (bb) { await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(1200); }
      }
    }
    await screenshot(page, `4-cb-${cpfLimpo}-${rodada}`);

    const btnCobrar = await esperarQualquer(page, [
      'button:has-text("Cobrar inadimplência")',
      'button:has-text("Cobrar Inadimplência")',
      'button:has-text("Cobrar")',
    ], 10000);
    if (!btnCobrar) { console.log("  Botão Cobrar não encontrado"); break; }

    let habilitado = await btnCobrar.isEnabled().catch(() => false);
    if (!habilitado) {
      // Fallback dispatchEvent
      await primeiraLinha.evaluate(tr => {
        function triggerCheckbox(root) {
          for (const el of root.querySelectorAll('input[type="checkbox"]')) {
            if (!el.checked) {
              el.checked = true;
              el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
              el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
              return true;
            }
          }
          for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot && triggerCheckbox(el.shadowRoot)) return true;
          }
          return false;
        }
        triggerCheckbox(tr);
      }).catch(() => {});
      await sleep(1000);
      habilitado = await btnCobrar.isEnabled().catch(() => false);
    }
    if (!habilitado) { console.log("  Checkbox não registrou"); break; }

    console.log("  Clicando Cobrar inadimplência...");
    { const bb = await btnCobrar.boundingBox().catch(() => null);
      if (bb) await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
      else await btnCobrar.click({ force: true }); }
    await sleep(2000);
    await screenshot(page, `5-cobrar-${cpfLimpo}-${rodada}`);

    const modal = await esperarQualquer(page, [
      '[role="dialog"]', '.slds-modal', 'div[aria-modal="true"]',
      'div:has-text("Gerar link de pagamento")',
      'div:has-text("Cobrança de inadimplência")',
    ], 20000);
    if (!modal) { console.log("  Modal não apareceu"); break; }
    await sleep(1500);
    await screenshot(page, `6-modal-${cpfLimpo}-${rodada}`);

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

    // Aguarda modal fechar (link gerado com sucesso) — sem esperar nova aba
    await page.waitForFunction(
      () => !document.querySelector('[role="dialog"], .slds-modal'),
      { timeout: 15000 }
    ).catch(() => {});
    await sleep(2000);
    await screenshot(page, `7-pos-gerar-${cpfLimpo}-${rodada}`);
    console.log(`  ✓ Link gerado para competência "${competencia}"`);
    competenciasGeradas++;
    // O modal do MAG gera links para TODAS as competências de uma vez —
    // sai do loop imediatamente e vai para Fase 2
    break;
  }

  // Mesmo sem gerar novos links, pode haver links já emitidos anteriormente — vai direto para Fase 2
  if (competenciasGeradas === 0) {
    console.log("  Sem competências novas para gerar — verificando links já emitidos na aba Trabalhadas...");
  }

  // ── 5. FASE 2: Aba "Trabalhadas" — clica em cada link emitido e baixa ────
  console.log(`\n  ${competenciasGeradas} link(s) gerado(s) — verificando posição...`);

  // Só navega de volta se saímos da ficha do cliente (evita reload desnecessário)
  const urlAtualFase2 = page.url();
  const fichaBase = urlFicha.split('?')[0];
  if (!urlAtualFase2.startsWith(fichaBase)) {
    console.log(`  Voltando para ficha: ${urlFicha.slice(0, 60)}`);
    await page.goto(urlFicha, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await sleep(8000);
  } else {
    console.log(`  Já na ficha — sem reload`);
    await sleep(1000);
  }

  const clicarAbaT = async () => {
    // Usa evaluate com busca recursiva em shadow DOM — mesmo padrão que funciona no INVISTO
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const coords = await page.evaluate(() => {
        function findTab(root) {
          for (const el of root.querySelectorAll('a, button, [role="tab"], li')) {
            const t = (el.textContent || '').trim();
            if (t === 'Trabalhadas' || (t.startsWith('Trabalhadas') && t.length < 25)) {
              el.scrollIntoView({ block: 'center', behavior: 'instant' });
              const r = el.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            }
          }
          for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) { const r = findTab(el.shadowRoot); if (r) return r; }
          }
          return null;
        }
        return findTab(document);
      }).catch(() => null);

      if (coords) {
        await page.mouse.click(coords.x, coords.y);
        await sleep(2000);
        return true;
      }
      await sleep(600);
    }
    return false;
  };

  // Tenta coletar links já visíveis antes de clicar na aba
  await sleep(1500);
  const linksPrevia = await coletarLinksEmitidos();
  const jaTemLinks = linksPrevia.filter(l => !['publicar','pesquisa','propostas','campanhas','negociacoes'].includes(l.txt.toLowerCase())).length > 0;

  if (!jaTemLinks) {
    // Não tem links visíveis — precisa clicar na aba Trabalhadas
    if (!await clicarAbaT()) {
      return { sucesso: false, erro: "Aba Trabalhadas não encontrada" };
    }
  } else {
    console.log(`  Já na aba Trabalhadas com links visíveis`);
  }
  await screenshot(page, `8-trabalhadas-${cpfLimpo}`);

  // Coleta links curtos da aba Trabalhadas via shadow DOM recursivo — captura href absoluta
  async function coletarLinksEmitidos() {
    return page.evaluate(() => {
      function findLinks(root) {
        const links = [];
        for (const el of root.querySelectorAll('a')) {
          const txt = (el.textContent || '').trim();
          // Só links curtos lowercase/dígitos (ex: "05daf", "35068") — exclui menu
          if (txt.length >= 4 && txt.length <= 12 && /^[a-z0-9]+$/.test(txt)) {
            el.scrollIntoView({ block: 'center', behavior: 'instant' });
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              links.push({ txt, href: el.href || el.getAttribute('href') || '' });
            }
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

  const todosLinks = await coletarLinksEmitidos();
  const vistos = new Set();
  const linksEmitidos = todosLinks.filter(l => {
    if (vistos.has(l.txt) || !l.href) return false;
    vistos.add(l.txt); return true;
  });
  console.log(`  ${linksEmitidos.length} link(s): ${linksEmitidos.map(l => l.txt).join(', ')}`);

  if (linksEmitidos.length === 0) {
    await screenshot(page, `8b-sem-links-${cpfLimpo}`);
    return { sucesso: false, erro: "Nenhum link emitido encontrado na aba Trabalhadas" };
  }

  // Processa cada link — reusa UMA página para evitar CAPTCHA em nova aba
  const paginaLink = await context.newPage();
  let pdfBytes = null;
  paginaLink.on('response', async (resp) => {
    if ((resp.headers()['content-type'] || '').includes('application/pdf')) {
      pdfBytes = await resp.body().catch(() => null);
    }
  });

  for (let i = 0; i < linksEmitidos.length; i++) {
    pdfBytes = null;
    const link = linksEmitidos[i];
    const nomeArquivo = `${nomeLimpo}-${cpfLimpo}-link${i + 1}-${link.txt}.pdf`;
    console.log(`\n  Link ${i + 1}/${linksEmitidos.length}: "${link.txt}" → ${link.href.slice(0, 70)}`);

    await paginaLink.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await sleep(3000);
    await screenshot(paginaLink, `9-link-${cpfLimpo}-${i}`);

    // magpag.mag.com.br é React normal — scrollIntoView + el.click() via evaluate
    // (não usa page.mouse.click que falha quando botão está abaixo do viewport)
    const clicarMagpag = async (el) => {
      await el.evaluate(e => {
        e.scrollIntoView({ block: 'center', behavior: 'instant' });
        e.click();
      }).catch(() => {});
    };

    // Passo 1: ESCOLHER PAGAMENTO
    const btnEscolher = await esperarQualquer(paginaLink, [
      'button:has-text("ESCOLHER PAGAMENTO")',
      'button:has-text("Escolher Pagamento")',
      'a:has-text("ESCOLHER PAGAMENTO")',
    ], 8000);
    if (btnEscolher) {
      console.log("  → ESCOLHER PAGAMENTO");
      await clicarMagpag(btnEscolher);
      await sleep(3000);
      await screenshot(paginaLink, `9a-escolher-${cpfLimpo}-${i}`);
    }

    // Passo 2: seleciona Boleto (radio)
    const optBoleto = await esperarQualquer(paginaLink, [
      'button:has-text("Boleto")', 'label:has-text("Boleto")',
      'input[value*="boleto" i]',
      'li:has-text("Boleto")', '[data-method*="boleto" i]',
      'button:has-text("Bancário")',
    ], 8000);
    if (optBoleto) {
      console.log("  → Boleto");
      await clicarMagpag(optBoleto);
      await sleep(2000);
    }
    await screenshot(paginaLink, `9b-boleto-${cpfLimpo}-${i}`);

    // Passo 3: GERAR BOLETO (gera na tela, não dispara download ainda)
    const btnGerarBoleto = await esperarQualquer(paginaLink, [
      'button:has-text("GERAR BOLETO")',
      'button:has-text("Gerar Boleto")',
      'button:has-text("Gerar boleto")',
    ], 8000);
    if (btnGerarBoleto) {
      console.log("  → GERAR BOLETO");
      await clicarMagpag(btnGerarBoleto);
      await sleep(5000);
      await screenshot(paginaLink, `9b2-gerado-${cpfLimpo}-${i}`);
    }

    // Passo 4: BAIXAR BOLETO — aqui sim dispara o download
    let baixou = false;
    try {
      const btnBaixar = await esperarQualquer(paginaLink, [
        'button:has-text("BAIXAR BOLETO")',
        'a:has-text("BAIXAR BOLETO")',
        'button:has-text("Baixar Boleto")',
        'a:has-text("Baixar Boleto")',
        'button:has-text("Baixar")',
        'a:has-text("Baixar")',
      ], 10000);

      if (btnBaixar) {
        console.log("  → BAIXAR BOLETO");
        const [dl] = await Promise.all([
          paginaLink.waitForEvent('download', { timeout: 20000 }),
          clicarMagpag(btnBaixar),
        ]);
        const filePath = path.join(DOWNLOAD_DIR, nomeArquivo);
        await dl.saveAs(filePath);
        const base64 = fs.readFileSync(filePath).toString('base64');
        fs.unlink(filePath, () => {});
        boletos.push({ base64, nomeArquivo });
        console.log(`  ✓ ${nomeArquivo}`);
        baixou = true;
      }
    } catch (err) {
      console.log(`  ✗ Download falhou: ${String(err.message || err).slice(0, 80)}`);
    }

    // Estratégia 2: PDF interceptado via response
    if (!baixou && pdfBytes) {
      boletos.push({ base64: pdfBytes.toString('base64'), nomeArquivo });
      console.log(`  ✓ ${nomeArquivo} (PDF interceptado)`);
      baixou = true;
    }

    // Estratégia 3: extrai código de barras visível na tela
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
        boletos.push({ base64: null, codigoBarra, nomeArquivo });
        baixou = true;
      }
    }

    if (!baixou) {
      await screenshot(paginaLink, `9c-sem-dl-${cpfLimpo}-${i}`);
      console.log(`  ✗ Não baixou — ver 9b/9c`);
    }
  }

  await paginaLink.close().catch(() => {});

  if (boletos.length === 0) {
    return { sucesso: false, erro: "Boletos não baixados — ver screenshots 9b/9c" };
  }
  return { sucesso: true, boletos };
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

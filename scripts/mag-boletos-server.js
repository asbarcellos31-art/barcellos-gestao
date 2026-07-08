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
let context     = null;
let mainPage    = null;
let loginStatus = "aguardando";
let tunnelUrl   = null;

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

  res.json({ ok: true, total: clientes.length });

  processarBoletos(jobId, clientes, callbackUrl, apiKey).catch(err => {
    console.error("[MAG] Erro fatal:", err.message);
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
}

// ── Automação no portal MAG ───────────────────────────────────────────────────

async function buscarBoletoPorCpf(cpf, nome) {
  const cpfLimpo     = cpf.replace(/\D/g, "");
  const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  const page         = mainPage;

  console.log(`  CPF: ${cpfFormatado}`);

  // ── 1. Navega para inadimplências ─────────────────────────────────────────
  const urlAtual = page.url();
  if (!urlAtual.includes("inadimplencia")) {
    const base    = urlAtual.split("/s/")[0];
    const urlInad = (base || MAG_URL.split("/s/")[0]) + "/s/inadimplencias";
    console.log(`  Navegando para: ${urlInad}`);
    await page.goto(urlInad, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(3000);
  }
  await screenshot(page, `1-inadimplencias-${cpfLimpo}`);

  // ── 2. Busca pelo cliente ─────────────────────────────────────────────────
  const campoBusca = await esperarQualquer(page, [
    'input[placeholder*="nome" i]',
    'input[placeholder*="buscar" i]',
    'input[placeholder*="pesquisar" i]',
    'input[placeholder*="Digite" i]',
    'input[placeholder*="search" i]',
    'input[type="search"]',
    '.searchInput input',
    'lightning-input input',
  ], 15000);

  if (!campoBusca) {
    await screenshot(page, `erro-campo-busca-${cpfLimpo}`);
    return { sucesso: false, erro: "Campo de busca não encontrado" };
  }

  const termos = [];
  if (nome?.trim()) termos.push(nome.trim().split(" ")[0]);
  termos.push(cpfFormatado, cpfLimpo);

  let linhaCliente = null;
  const urlLista = page.url();

  for (const termo of termos) {
    console.log(`  Buscando por: "${termo}"`);
    await campoBusca.click({ clickCount: 3 });
    await campoBusca.fill(termo);
    await sleep(400);
    await page.keyboard.press("Enter");
    await sleep(3000);
    try {
      await page.waitForFunction(
        () => document.querySelectorAll("table tr, [role='row']").length > 1,
        { timeout: 5000 }
      );
    } catch {}

    await screenshot(page, `2-resultado-busca-${cpfLimpo}`);

    linhaCliente = await page.$(`tr:has-text("${cpfFormatado}")`);
    if (!linhaCliente) linhaCliente = await page.$(`[role="row"]:has-text("${cpfFormatado}")`);
    if (!linhaCliente) linhaCliente = await page.$(`tr:has-text("${cpfLimpo}")`);
    if (!linhaCliente) linhaCliente = await page.$(`[role="row"]:has-text("${cpfLimpo}")`);

    if (linhaCliente) { console.log(`  ✓ Cliente encontrado com "${termo}"`); break; }
  }

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
  if (linkNome) {
    await linkNome.click();
  } else if (celulaCliente) {
    await celulaCliente.click();
  } else {
    await linhaCliente.click();
  }

  await page.waitForLoadState("networkidle", { timeout: 25000 }).catch(() =>
    page.waitForLoadState("domcontentloaded", { timeout: 20000 })
  );
  await sleep(3000);
  await screenshot(page, `3-competencias-${cpfLimpo}`);

  // ── 4-N. Processa cada competência individualmente ────────────────────────
  // Garante aba "Não trabalhadas" ativa
  const abaNT = await esperarQualquer(page, [
    'a:has-text("Não trabalhadas")',
    'button:has-text("Não trabalhadas")',
    '[role="tab"]:has-text("Não trabalhadas")',
  ], 5000);
  if (abaNT) { await abaNT.click().catch(() => {}); await sleep(1500); }

  const nomeLimpo = nome
    ? nome.replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, "").trim().substring(0, 40).replace(/\s+/g, "_")
    : cpfLimpo;

  const boletos = [];

  for (let rodada = 0; rodada < 10; rodada++) {
    // Pega a primeira linha da tabela (cada ciclo a anterior some após o boleto)
    const primeiraLinha = await page.$('table tbody tr:first-child').catch(() => null);
    if (!primeiraLinha) { console.log("  Sem mais linhas — concluído"); break; }

    // Lê a competência da linha para nomear o arquivo
    const competencia = await primeiraLinha.evaluate(tr => {
      for (const td of tr.querySelectorAll("td")) {
        const t = td.textContent?.trim() || "";
        if (/[A-Za-záéíóúãõ]+ - \d{4}/i.test(t)) return t.replace(" - ", "-");
        if (/\d{2}\/\d{4}/.test(t)) return t.replace("/", "-");
      }
      return "";
    }).catch(() => "");
    console.log(`  Rodada ${rodada + 1}: competência "${competencia || "?"}"`);

    // Busca shadow DOM recursivo — mesmo padrão do script INVISTO (LWC não expõe checkbox no DOM normal)
    const checkCoords = await primeiraLinha.evaluate(tr => {
      function findCheckbox(root) {
        for (const el of root.querySelectorAll('*')) {
          const tag = el.tagName?.toLowerCase() || '';
          if (tag === 'input' && el.type === 'checkbox') {
            el.scrollIntoView({ block: 'center', behavior: 'instant' });
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2, via: 'input' };
          }
          // LWC checkbox wrapper (lightning-primitive-cell-checkbox, c-checkbox, etc.)
          if (tag.includes('checkbox') && el.shadowRoot) {
            const r = findCheckbox(el.shadowRoot);
            if (r) return r;
          }
          if (el.shadowRoot) {
            const r = findCheckbox(el.shadowRoot);
            if (r) return r;
          }
        }
        return null;
      }
      return findCheckbox(tr);
    }).catch(() => null);

    if (checkCoords) {
      console.log(`  Checkbox via shadow DOM em (${Math.round(checkCoords.x)}, ${Math.round(checkCoords.y)}) [${checkCoords.via}]`);
      await page.mouse.click(checkCoords.x, checkCoords.y);
      await sleep(1200);
    } else {
      // Fallback: clique por coordenada na célula (abordagem anterior)
      console.log("  Checkbox não encontrado no shadow DOM — usando fallback por coordenada");
      const celulaCheck = await primeiraLinha.$("td:first-child").catch(() => null);
      if (celulaCheck) {
        const bb = await celulaCheck.boundingBox().catch(() => null);
        if (bb) {
          await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
          await sleep(1200);
        }
      }
    }
    await screenshot(page, `4-cb-${cpfLimpo}-${rodada}`);

    // Confirma que o botão habilitou
    const btnCobrar = await esperarQualquer(page, [
      'button:has-text("Cobrar inadimplência")',
      'button:has-text("Cobrar Inadimplência")',
      'button:has-text("Cobrar")',
    ], 10000);

    if (!btnCobrar) {
      console.log("  Botão Cobrar não encontrado"); break;
    }
    let habilitado = await btnCobrar.isEnabled().catch(() => false);

    // Fallback: dispatchEvent direto no input se botão ainda desabilitado
    if (!habilitado) {
      console.log("  Botão desabilitado — tentando dispatchEvent no checkbox...");
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

    if (!habilitado) {
      console.log("  Botão desabilitado — checkbox não registrou (ver screenshots)"); break;
    }

    // Clica "Cobrar inadimplência"
    console.log("  Clicando Cobrar inadimplência...");
    await btnCobrar.click();
    await sleep(2000);
    await screenshot(page, `5-cobrar-${cpfLimpo}-${rodada}`);

    // Aguarda modal
    const modal = await esperarQualquer(page, [
      '[role="dialog"]', '.slds-modal', 'div[aria-modal="true"]',
      'div:has-text("Gerar link de pagamento")',
      'div:has-text("Cobrança de inadimplência")',
    ], 20000);

    if (!modal) {
      console.log("  Modal não apareceu"); break;
    }
    await sleep(1500);
    await screenshot(page, `6-modal-${cpfLimpo}-${rodada}`);

    // Verifica se modal tem itens
    const vazio = await page.$('text="Nenhum resultado encontrado"').catch(() => null);
    if (vazio) {
      await page.click('button:has-text("Cancelar")').catch(() => {});
      console.log("  Modal vazio — sem itens selecionados"); break;
    }

    // Clica "Gerar link de pagamento"
    const btnGerar = await esperarQualquer(page, [
      'button:has-text("Gerar link de pagamento")',
      'button:has-text("Gerar Link de Pagamento")',
      'button:has-text("Gerar link")',
      'button:has-text("Gerar")',
    ], 10000);

    if (!btnGerar) {
      console.log("  Botão Gerar link não encontrado"); break;
    }

    const compTag = competencia.replace(/[^a-zA-Z0-9\-]/g, "_") || `rodada${rodada}`;
    const nomeArquivo = `${nomeLimpo}-${cpfLimpo}-${compTag}.pdf`;

    console.log("  Gerando link de pagamento...");
    await screenshot(page, `7-gerar-${cpfLimpo}-${rodada}`);
    await btnGerar.click();
    await sleep(4000); // aguarda MAG processar sem bloquear em nova aba

    // Verifica o que aconteceu: nova aba, download ou permaneceu na mesma página
    const abasDepois = context.pages().filter(p => !p.isClosed());
    const novaAba = abasDepois.find(p => p !== page) || null;
    await screenshot(page, `7c-pos-gerar-${cpfLimpo}-${rodada}`);
    if (novaAba) await screenshot(novaAba, `7d-nova-aba-${cpfLimpo}-${rodada}`);

    const paginaBoleto = novaAba || page;

    if (novaAba) {
      await novaAba.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
      await sleep(2000);
      console.log("  Nova aba:", novaAba.url().slice(0, 80));
    } else {
      console.log("  Sem nova aba — analisando página atual para link/download");
    }

    // Tenta selecionar opção Boleto se houver
    const optBoleto = await esperarQualquer(paginaBoleto, [
      'label:has-text("Boleto")', 'input[value*="BOLETO"]',
      'button:has-text("Boleto")', 'li:has-text("Boleto")',
    ], 5000);
    if (optBoleto) { await optBoleto.click().catch(() => {}); await sleep(800); }

    // Tenta download direto
    let baixou = false;
    try {
      const [dl] = await Promise.all([
        paginaBoleto.waitForEvent("download", { timeout: 15000 }),
        paginaBoleto.click(
          'button:has-text("Gerar boleto"), button:has-text("Baixar boleto"), button:has-text("Baixar"), button:has-text("PDF")',
          { timeout: 8000 }
        ),
      ]);
      const filePath = path.join(DOWNLOAD_DIR, nomeArquivo);
      await dl.saveAs(filePath);
      if (novaAba) await novaAba.close().catch(() => {});
      const base64 = fs.readFileSync(filePath).toString("base64");
      fs.unlink(filePath, () => {});
      boletos.push({ base64, nomeArquivo });
      console.log(`  ✓ Boleto: ${nomeArquivo}`);
      baixou = true;
    } catch { /* sem download direto — tenta via link */ }

    if (!baixou) {
      // Procura link de boleto/pagamento no DOM (shadow DOM inclusive)
      const linkInfo = await paginaBoleto.evaluate(() => {
        function findLink(root) {
          for (const el of root.querySelectorAll('a, [href]')) {
            const href = el.getAttribute('href') || '';
            const txt = (el.textContent || '').trim();
            if (href.match(/boleto|pay|pagamento|download/i) || txt.match(/Boleto|Baixar|PDF|Copiar link/i)) {
              el.scrollIntoView({ block: 'center', behavior: 'instant' });
              const r = el.getBoundingClientRect();
              return { href, txt, x: r.x + r.width / 2, y: r.y + r.height / 2 };
            }
          }
          for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) { const r = findLink(el.shadowRoot); if (r) return r; }
          }
          return null;
        }
        return findLink(document);
      }).catch(() => null);

      if (linkInfo) {
        console.log(`  Link encontrado: "${linkInfo.txt}" href="${(linkInfo.href||'').slice(0,60)}"`);
      }

      await screenshot(paginaBoleto, `8-diagnostico-${cpfLimpo}-${rodada}`);
      if (novaAba) await novaAba.close().catch(() => {});
      console.log("  Não conseguiu baixar — ver screenshot 7c / 8-diagnostico para próximo passo");
      break;
    }

    await sleep(2000); // pausa antes da próxima competência
  }

  if (boletos.length === 0) {
    return { sucesso: false, erro: "Nenhum boleto gerado — veja screenshots para diagnóstico" };
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

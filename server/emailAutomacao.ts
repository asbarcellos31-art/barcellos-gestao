/**
 * Serviço de Automação de E-mails
 * Executa disparos automáticos diários para:
 * - Aniversariantes do dia (busca na tabela clientes por dataNascimento)
 * - Inadimplentes (busca na tabela inadimplentes com status em aberto)
 */

import { getDb } from "./db";
import { buscarTemplate } from "./emailMarketingDb";
import { enviarMensagemEvolution, enviarMensagemComRetry, enviarVideoEvolution, formatarTelefone, registrarEnvioWhatsapp, INSTANCIAS } from "./zapi";
import { resolverCorpoTemplate } from "./emailBlocosHtml";

const REMETENTE = process.env.SENDGRID_FROM_EMAIL || "atendimento@barcellosseguros.com";
const NOME_REMETENTE = process.env.SENDGRID_FROM_NAME || "Barcellos Seguros";

async function registrarEnvioEmail(dados: {
  email: string;
  contatoNome: string;
  tipo: string;
  status: 'ENVIADO' | 'ERRO';
  erro?: string;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    const conn = (db as any).session?.client;
    if (!conn) return;
    await conn.execute(
      'INSERT INTO email_envios (campanhaId, contatoId, tipo, contatoNome, email, status, erro, enviadoEm, createdAt) VALUES (NULL, NULL, ?, ?, ?, ?, ?, NOW(), NOW())',
      [dados.tipo, dados.contatoNome, dados.email, dados.status, dados.erro || null]
    );
  } catch (_) {}
}

async function enviarEmail(para: { email: string; nome: string }, assunto: string, corpo: string) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("SENDGRID_API_KEY não configurada");

  const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: para.email, name: para.nome }] }],
      from: { email: REMETENTE, name: NOME_REMETENTE },
      subject: assunto,
      content: [{ type: "text/html", value: corpo }],
    }),
  });

  if (!resp.ok && resp.status !== 202) {
    const err = await resp.text();
    throw new Error(`SendGrid erro ${resp.status}: ${err}`);
  }
  return true;
}

function substituirVariaveis(texto: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce(
    (t, [k, v]) => t.replace(new RegExp(`\\{\\{${k}\\}\\}`, "gi"), v),
    texto
  );
}

/** Envia relatório de automação para a equipe interna */
async function enviarRelatorioEquipe(
  titulo: string,
  emoji: string,
  destinatarios: Array<{ nome: string; email: string }>,
  enviados: number,
  erros: number
) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return;
  try {
    const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const linhas = destinatarios
      .map((c, idx) => `<tr style="background:${idx % 2 === 0 ? '#f8faff' : '#fff'}">
        <td style="padding:8px 12px;border-bottom:1px solid #e5eaf5">${c.nome}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5eaf5;color:#6b7280">${c.email}</td>
      </tr>`)
      .join("");
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f0f4ff">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
  <div style="background:linear-gradient(135deg,#1a2f5e,#2d4a8a);padding:28px 32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:20px">${emoji} ${titulo}</h1>
    <p style="color:#a8c4e8;margin:6px 0 0;font-size:13px">Barcellos Seguros — Automação Diária</p>
  </div>
  <div style="padding:28px 32px">
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">📅 Data/Hora:</td><td style="padding:8px 0;font-weight:600">${dataHora}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">✅ E-mails enviados:</td><td style="padding:8px 0;font-weight:700;color:#16a34a">${enviados}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">❌ Erros:</td><td style="padding:8px 0;font-weight:700;color:${erros > 0 ? '#dc2626' : '#6b7280'}">${erros}</td></tr>
    </table>
    ${destinatarios.length > 0
      ? `<h3 style="color:#1a2f5e;font-size:15px;margin:0 0 12px">Destinatários:</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#1a2f5e"><th style="padding:10px 12px;color:#fff;text-align:left">Nome</th><th style="padding:10px 12px;color:#fff;text-align:left">E-mail</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>`
      : `<p style="color:#6b7280;text-align:center">Nenhum destinatário hoje.</p>`
    }
  </div>
  <div style="background:#f8faff;padding:16px 32px;text-align:center;border-top:1px solid #e5eaf5">
    <p style="font-size:11px;color:#aaa;margin:0">Barcellos Seguros — Sistema de Gestão Interno</p>
  </div>
</div></body></html>`;
    const equipe = [
      { email: "anderson@barcellosseguros.com", name: "Anderson" },
      { email: "nayara@barcellosseguros.com", name: "Nayara" },
    ];
    for (const dest of equipe) {
      await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [dest] }],
          from: { email: REMETENTE, name: NOME_REMETENTE },
          subject: `${emoji} ${titulo} — ${enviados} e-mail(s) enviado(s)`,
          content: [{ type: "text/html", value: html }],
        }),
      });
    }
    console.log(`[AutoEmail] Relatório "${titulo}" enviado para a equipe.`);
  console.log(`[AutoEmail] Disparados ${enviados} aniversários, ${erros} erros`);
  } catch (e) {
    console.error("[AutoEmail] Erro ao enviar relatório para equipe:", e);
  }
}

/** Dispara e-mails para aniversariantes do dia */
export async function dispararAniversariantes(): Promise<{ enviados: number; erros: number }> {
  const db = await getDb();
  if (!db) return { enviados: 0, erros: 0 };

  const conn = (db as any).session?.client;
  if (!conn) return { enviados: 0, erros: 0 };

  // Buscar automação de aniversário
  const [autoRows]: any = await conn.execute(
    "SELECT * FROM email_automacoes WHERE tipo = 'ANIVERSARIO' AND ativo = 1 LIMIT 1"
  );
  if (!autoRows || autoRows.length === 0) return { enviados: 0, erros: 0 };
  const auto = autoRows[0];

  const template = await buscarTemplate(auto.templateId);
  if (!template) return { enviados: 0, erros: 0 };

  // Buscar clientes que fazem aniversário HOJE (timezone Brasília — server roda em UTC)
  const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dia = hoje.getDate();
  const mes = hoje.getMonth() + 1;

  const [clientes]: any = await conn.execute(
    `SELECT nome, email, telefone, celular FROM clientes 
     WHERE DAY(dataNascimento) = ? AND MONTH(dataNascimento) = ?
     AND LOWER(status) = 'ativo'`,
    [dia, mes]
  );

  // Buscar configurações de WhatsApp de aniversário
  let whatsappAniv = "";
  let msgTemplate = "";
  let videoUrl = "";
  try {
    const [cfgRows]: any = await conn.execute(
      "SELECT chave, valor FROM system_config WHERE chave IN ('whatsapp_aniversario','wa_automacao_aniversario_msg','wa_automacao_aniversario_video','wa_automacao_aniversario_ativo')"
    );
    const cfg: Record<string, string> = {};
    for (const r of (cfgRows || [])) cfg[r.chave] = r.valor;
    // Verificar se automacao WA está ativa
    if (cfg['wa_automacao_aniversario_ativo'] === '0') {
      console.log('[AutoWA] Automação de aniversário WhatsApp desativada');
    }
    if (cfg['whatsapp_aniversario']) {
      let num = String(cfg['whatsapp_aniversario']).replace(/\D/g, "");
      if (num.startsWith("550") && num.length > 12) num = "55" + num.slice(3);
      whatsappAniv = num;
    }
    msgTemplate = cfg['wa_automacao_aniversario_msg'] || '';
    videoUrl = cfg['wa_automacao_aniversario_video'] || '';
  } catch (_) {}

  let enviados = 0;
  let erros = 0;

  // Data de hoje em Brasília para verificação de duplicatas por cliente
  const hojeStr = new Date(new Date().getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

  for (const cliente of clientes) {
    // Verificar se já enviou WhatsApp para este cliente hoje (proteção extra contra duplicatas)
    const telefoneClienteCheck = cliente.celular || cliente.telefone;
    if (telefoneClienteCheck) {
      const telFormatado = formatarTelefone(telefoneClienteCheck);
      const [jaEnviou]: any = await conn.execute(
        "SELECT id FROM whatsapp_envios WHERE tipo = 'ANIVERSARIO' AND telefone = ? AND DATE(createdAt) = ? AND status = 'ENVIADO' LIMIT 1",
        [telFormatado, hojeStr]
      );
      if (jaEnviou?.length > 0) {
        console.log(`[AutoWA] Pulando ${cliente.nome} — já enviado hoje`);
        continue;
      }
    }
    // Enviar e-mail se tiver
    if (cliente.email) {
      try {
        const whatsappLink = whatsappAniv
          ? `https://wa.me/${whatsappAniv}?text=${encodeURIComponent("Olá! Recebi seu e-mail de aniversário, muito obrigado! 🎂")}`
          : "#";
        const vars = { nome: cliente.nome || "Cliente", whatsapp: whatsappAniv, whatsapp_link: whatsappLink };
        const assunto = substituirVariaveis(template.assunto, vars);
        const corpoHtml = resolverCorpoTemplate(template.corpo, template.saudacao, template.assinatura);
        const corpo = substituirVariaveis(corpoHtml, vars);
        await enviarEmail({ email: cliente.email, nome: cliente.nome }, assunto, corpo);
        enviados++;
        // Registrar no histórico de envios
        await registrarEnvioEmail({ email: cliente.email, contatoNome: cliente.nome || '', tipo: 'ANIVERSARIO', status: 'ENVIADO' }).catch(() => {});
      } catch (e) {
        erros++;
        console.error(`[AutoEmail] Erro ao enviar aniversário para ${cliente.email}:`, e);
        await registrarEnvioEmail({ email: cliente.email, contatoNome: cliente.nome || '', tipo: 'ANIVERSARIO', status: 'ERRO', erro: String(e) }).catch(() => {});
      }
    }
    // Enviar WhatsApp via whatsapp-2 (aniversariantes)
    const telefoneCliente = cliente.celular || cliente.telefone;
    if (telefoneCliente) {
      try {
        const primeiroNome = (cliente.nome || 'Cliente').split(' ')[0];
        const msgAniv = msgTemplate
          ? msgTemplate.replace(/@nome/gi, primeiroNome).replace(/\{\{nome\}\}/gi, primeiroNome)
          : `🎂 Parabéns, ${primeiroNome}! 🎉\n\nA equipe da Barcellos Seguros deseja a você um feliz aniversário!\n\nEquipe Barcellos Seguros\n📞 (48) 99210-8365`;
        let resultado: { sucesso: boolean; erro?: string };
        if (videoUrl) {
          // Enviar vídeo/imagem com a mensagem como legenda
          resultado = await enviarVideoEvolution(telefoneCliente, videoUrl, msgAniv, INSTANCIAS.aniversario);
        } else {
          resultado = await enviarMensagemComRetry(telefoneCliente, msgAniv, INSTANCIAS.aniversario);
        }
        await registrarEnvioWhatsapp({
          nome: cliente.nome,
          telefone: formatarTelefone(telefoneCliente),
          mensagem: msgAniv,
          tipo: "ANIVERSARIO",
          status: resultado.sucesso ? "ENVIADO" : "ERRO",
          erro: resultado.erro,
        });
        if (!resultado.sucesso) console.error(`[AutoWA] Erro aniversário WA para ${cliente.nome}:`, resultado.erro);
      } catch (e) {
        console.error(`[AutoWA] Exceção aniversário WA para ${cliente.nome}:`, e);
      }
      await new Promise(r => setTimeout(r, 3000)); // 3s entre mensagens (anti-ban)
    } else {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  // Atualizar último disparo e total enviado hoje
  await conn.execute(
    "UPDATE email_automacoes SET ultimoDisparo = NOW(), totalEnviadoHoje = ? WHERE id = ?",
    [enviados, auto.id]
  );

  console.log(`[AutoEmail] Aniversariantes: ${enviados} enviados, ${erros} erros`);

  // Relatório diário para a equipe
  await enviarRelatorioEquipe(
    "Relatório de Aniversariantes",
    "🎂",
    (clientes || []).map((c: any) => ({ nome: c.nome, email: c.email })),
    enviados,
    erros
  );

  return { enviados, erros };
}

/** Dispara e-mails para inadimplentes com parcelas em aberto */
export async function dispararInadimplentes(): Promise<{ enviados: number; erros: number }> {
  const db = await getDb();
  if (!db) return { enviados: 0, erros: 0 };

  const conn = (db as any).session?.client;
  if (!conn) return { enviados: 0, erros: 0 };

  // Buscar automação de inadimplência
  const [autoRows]: any = await conn.execute(
    "SELECT * FROM email_automacoes WHERE tipo = 'INADIMPLENCIA' AND ativo = 1 LIMIT 1"
  );
  if (!autoRows || autoRows.length === 0) return { enviados: 0, erros: 0 };
  const auto = autoRows[0];

  const template = await buscarTemplate(auto.templateId);
  if (!template) return { enviados: 0, erros: 0 };

  // Buscar inadimplentes com e-mail cadastrado na base de clientes
  // Faz JOIN entre inadimplentes (por CPF) e clientes para obter o e-mail
  const [inadimplentes]: any = await conn.execute(
    `SELECT DISTINCT i.nome, i.cpf, c.email, i.valorTotal, i.produtos
     FROM inadimplentes i
     INNER JOIN clientes c ON c.cpf = i.cpf
     WHERE (i.status IS NULL OR i.status = '' OR i.status = 'pendente' OR i.status = 'em_aberto')
     AND c.email IS NOT NULL AND c.email != ''
     LIMIT 500`
  );

  let enviados = 0;
  let erros = 0;

  for (const inad of inadimplentes) {
    // Enviar e-mail se tiver
    if (inad.email) {
      try {
        const vars = {
          nome: inad.nome || "Cliente",
          produto: inad.produtos || "seu plano",
          valor: inad.valorTotal ? `R$ ${Number(inad.valorTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "",
        };
        const assunto = substituirVariaveis(template.assunto, vars);
        const corpoHtml = resolverCorpoTemplate(template.corpo, template.saudacao, template.assinatura);
        const corpo = substituirVariaveis(corpoHtml, vars);
        await enviarEmail({ email: inad.email, nome: inad.nome }, assunto, corpo);
        enviados++;
        await registrarEnvioEmail({ email: inad.email, contatoNome: inad.nome || '', tipo: 'INADIMPLENCIA', status: 'ENVIADO' }).catch(() => {});
      } catch (e) {
        erros++;
        console.error(`[AutoEmail] Erro ao enviar inadimplência para ${inad.email}:`, e);
        await registrarEnvioEmail({ email: inad.email, contatoNome: inad.nome || '', tipo: 'INADIMPLENCIA', status: 'ERRO', erro: String(e) }).catch(() => {});
      }
    }
    // Enviar WhatsApp via whatsapp-1 (inadimplência)
    if (inad.telefone) {
      try {
        const valorFmt = inad.valorTotal
          ? `R$ ${Number(inad.valorTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
          : "";
        const msgInad = `Olá, ${inad.nome || 'Cliente'}! 👋\n\nIdentificamos que você possui parcelas em aberto do seu seguro${inad.produtos ? ` (${inad.produtos})` : ""}${valorFmt ? ` no valor de ${valorFmt}` : ""}.\n\nPara regularizar sua situação ou tirar dúvidas, entre em contato conosco:\n📞 (48) 3372-6890\n\nEstamos aqui para ajudar! 💙\n\nEquipe Barcellos Seguros`;
        const resultado = await enviarMensagemEvolution(inad.telefone, msgInad, INSTANCIAS.inadimplencia);
        await registrarEnvioWhatsapp({
          nome: inad.nome,
          telefone: formatarTelefone(inad.telefone),
          mensagem: msgInad,
          tipo: "INADIMPLENTE",
          status: resultado.sucesso ? "ENVIADO" : "ERRO",
          erro: resultado.erro,
        });
        if (!resultado.sucesso) console.error(`[AutoWA] Erro inadimplência WA para ${inad.nome}:`, resultado.erro);
      } catch (e) {
        console.error(`[AutoWA] Exceção inadimplência WA para ${inad.nome}:`, e);
      }
      await new Promise(r => setTimeout(r, 3000)); // 3s entre mensagens (anti-ban)
    } else {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  // Atualizar último disparo
  await conn.execute(
    "UPDATE email_automacoes SET ultimoDisparo = NOW(), totalEnviadoHoje = ? WHERE id = ?",
    [enviados, auto.id]
  );

  console.log(`[AutoEmail] Inadimplentes: ${enviados} enviados, ${erros} erros`);

  // Relatório diário para a equipe
  await enviarRelatorioEquipe(
    "Relatório de Inadimplentes",
    "⚠️",
    (inadimplentes || []).map((i: any) => ({ nome: i.nome, email: i.email })),
    enviados,
    erros
  );

  return { enviados, erros };
}

/** Dispara campanhas agendadas cujo dataAgendada já chegou */
async function verificarCampanhasAgendadas() {
  try {
    const db = await getDb();
    if (!db) return;
    const conn = (db as any).session?.client;
    if (!conn) return;
    // Busca campanhas com status AGENDADA e dataAgendada <= agora
    const [campanhas]: any = await conn.execute(
      "SELECT * FROM email_campanhas WHERE status = 'AGENDADA' AND dataAgendada IS NOT NULL AND dataAgendada <= NOW()"
    );
    if (!campanhas || campanhas.length === 0) return;
    for (const campanha of campanhas) {
      console.log(`[AutoEmail] Disparando campanha agendada: "${campanha.nome}" (id=${campanha.id})`);
      try {
        const port = process.env.PORT || 3000;
        const resp = await fetch(`http://localhost:${port}/api/email-marketing/campanhas/${campanha.id}/disparar`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-job": "1" },
        });
        if (resp.ok) {
          console.log(`[AutoEmail] Campanha "${campanha.nome}" iniciada com sucesso`);
        } else {
          const errText = await resp.text();
          console.error(`[AutoEmail] Erro ao disparar campanha ${campanha.id}:`, errText);
        }
      } catch (e) {
        console.error(`[AutoEmail] Exceção ao disparar campanha ${campanha.id}:`, e);
      }
    }
  } catch (e) {
    console.error("[AutoEmail] Erro em verificarCampanhasAgendadas:", e);
  }
}

/** Verifica o horário configurado e dispara se for a hora certa */
export async function verificarEDisparar() {
  try {
    const db = await getDb();
    if (!db) return;
    const conn = (db as any).session?.client;
    if (!conn) return;
    // Usar horário de Brasília (UTC-3)
    const agora = new Date();
    const horaBrasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
    const horaAtual = `${String(horaBrasilia.getUTCHours()).padStart(2, "0")}:${String(horaBrasilia.getUTCMinutes()).padStart(2, "0")}`;
    const diaHoje = horaBrasilia.toISOString().slice(0, 10);
    // Buscar horário configurado no system_config para WhatsApp de aniversário
    const [cfgHorario]: any = await conn.execute(
      "SELECT valor FROM system_config WHERE chave = 'wa_automacao_aniversario_horario' LIMIT 1"
    );
    const horarioWaAniversario = cfgHorario?.[0]?.valor || '08:00';
    // Sincronizar horário da tabela email_automacoes com o configurado no system_config
    await conn.execute(
      "UPDATE email_automacoes SET horario = ? WHERE tipo = 'ANIVERSARIO'",
      [horarioWaAniversario]
    );
    const [automacoes]: any = await conn.execute(
      "SELECT * FROM email_automacoes WHERE ativo = 1"
    );
    for (const auto of automacoes) {
      // Verificar se já disparou hoje
      const ultimoDisparo = auto.ultimoDisparo ? new Date(auto.ultimoDisparo).toISOString().slice(0, 10) : null;
      if (ultimoDisparo === diaHoje) continue; // já disparou hoje
      
      // Verificar se é a hora configurada (tolerância de 1 minuto)
      const ehHoraConfigurada = auto.horario === horaAtual;
      
      // Recuperação: se não disparou hoje e o horário configurado já passou (servidor hibernou)
      // Exemplo: configurado 08:00, servidor acordou às 10:00 → deve disparar imediatamente
      const [hConf, mConf] = (auto.horario || '08:00').split(':').map(Number);
      const minutosConfigurado = hConf * 60 + mConf;
      const [hAtual, mAtual] = horaAtual.split(':').map(Number);
      const minutosAtual = hAtual * 60 + mAtual;
      const horarioJaPassouHoje = minutosAtual >= minutosConfigurado;
      
      // Dispara se: é exatamente a hora OU o horário já passou hoje e ainda não disparou
      const deveDisparar = ehHoraConfigurada || (horarioJaPassouHoje && ultimoDisparo !== diaHoje);
      
      if (deveDisparar) {
        console.log(`[AutoEmail] Iniciando disparo automático: ${auto.nome} (horaAtual=${horaAtual}, horarioConfig=${auto.horario}, recuperacao=${!ehHoraConfigurada})`);
        // IMPORTANTE: marcar ultimoDisparo ANTES de enviar para evitar disparos duplicados
        // caso o disparo demore mais de 1 minuto (intervalo do cron)
        await conn.execute(
          "UPDATE email_automacoes SET ultimoDisparo = NOW() WHERE id = ?",
          [auto.id]
        );
        if (auto.tipo === "ANIVERSARIO") {
          await dispararAniversariantes();
        } else if (auto.tipo === "INADIMPLENCIA") {
          await dispararInadimplentes();
        }
      }
    }
    // Verificar campanhas agendadas (data/hora específica)
    await verificarCampanhasAgendadas();
  } catch (e) {
    console.error("[AutoEmail] Erro no verificarEDisparar:", e);
  }
}

/** Envia mensagem de aniversário para um cliente individual (reenvio manual) */
export async function enviarAniversarioIndividual(clienteId: number): Promise<{ sucesso: boolean; mensagem: string }> {
  const db = await getDb();
  if (!db) return { sucesso: false, mensagem: "Banco de dados indisponível" };

  const conn = (db as any).session?.client;
  if (!conn) return { sucesso: false, mensagem: "Conexão com banco indisponível" };

  // Buscar dados do cliente
  const [clienteRows]: any = await conn.execute(
    "SELECT id, nome, email, telefone, celular FROM clientes WHERE id = ? LIMIT 1",
    [clienteId]
  );
  if (!clienteRows || clienteRows.length === 0) return { sucesso: false, mensagem: "Cliente não encontrado" };
  const cliente = clienteRows[0];

  // Buscar configurações de WhatsApp de aniversário
  let msgTemplate = "";
  let videoUrl = "";
  try {
    const [cfgRows]: any = await conn.execute(
      "SELECT chave, valor FROM system_config WHERE chave IN ('wa_automacao_aniversario_msg','wa_automacao_aniversario_video')"
    );
    const cfg: Record<string, string> = {};
    for (const r of (cfgRows || [])) cfg[r.chave] = r.valor;
    msgTemplate = cfg['wa_automacao_aniversario_msg'] || '';
    videoUrl = cfg['wa_automacao_aniversario_video'] || '';
  } catch (_) {}

  const telefoneCliente = cliente.celular || cliente.telefone;
  if (!telefoneCliente) return { sucesso: false, mensagem: "Cliente sem número de telefone cadastrado" };

  const primeiroNome = (cliente.nome || 'Cliente').split(' ')[0];
  const msgAniv = msgTemplate
    ? msgTemplate.replace(/@nome/gi, primeiroNome).replace(/\{\{nome\}\}/gi, primeiroNome)
    : `🎂 Parabéns, ${primeiroNome}! 🎉\n\nA equipe da Barcellos Seguros deseja a você um feliz aniversário!\n\nEquipe Barcellos Seguros\n📞 (48) 99210-8365`;

  try {
    let resultado: { sucesso: boolean; erro?: string };
    if (videoUrl) {
      resultado = await enviarVideoEvolution(telefoneCliente, videoUrl, msgAniv, INSTANCIAS.aniversario);
    } else {
      resultado = await enviarMensagemComRetry(telefoneCliente, msgAniv, INSTANCIAS.aniversario);
    }
    await registrarEnvioWhatsapp({
      nome: cliente.nome,
      telefone: formatarTelefone(telefoneCliente),
      mensagem: msgAniv,
      tipo: "ANIVERSARIO",
      status: resultado.sucesso ? "ENVIADO" : "ERRO",
      erro: resultado.erro,
    });
    if (resultado.sucesso) {
      return { sucesso: true, mensagem: `Mensagem enviada para ${cliente.nome}!` };
    } else {
      return { sucesso: false, mensagem: resultado.erro || "Erro ao enviar mensagem" };
    }
  } catch (e: any) {
    return { sucesso: false, mensagem: e.message || "Erro inesperado ao enviar" };
  }
}

import mysql from 'mysql2/promise';

const LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663348080686/8JHGDJiU4qZSTzCTFQYFKy/barcellos-logo-transparent_1ecfd1d9.png';
const WHATSAPP_NUM = 'SEU_NUMERO_AQUI';
const SITE = 'https://www.barcellosseguros.com.br';
const INSTAGRAM = 'https://www.instagram.com/barcellosseguros';
const EMAIL = 'atendimento@barcellosseguros.com';

// Rodapé padrão — logo aparece APENAS aqui
// Para o template de aniversário, whatsappHref recebe '{{whatsapp_link}}' (substituído na hora do disparo)
function footer(whatsappHref = `https://wa.me/${WHATSAPP_NUM}`) {
  return `<div class="footer">
    <img src="${LOGO_URL}" alt="Barcellos Seguros" style="height:52px;display:block;margin:0 auto 14px;max-width:200px">
    <div class="footer-links">
      <a href="${SITE}">🌐 barcellosseguros.com.br</a>
      <a href="${whatsappHref}">💬 WhatsApp</a>
      <a href="${INSTAGRAM}">📷 @barcellosseguros</a>
      <a href="mailto:${EMAIL}">📧 ${EMAIL}</a>
    </div>
    <p style="font-size:11px;color:#aaa;margin-top:12px">Para cancelar o recebimento, responda com "DESCADASTRAR".</p>
  </div>`;
}

// Estilos base compartilhados
const baseStyle = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap');
  body{margin:0;padding:0;font-family:'Poppins',Arial,sans-serif;background:#f0f4ff}
  .container{max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
  .header{background:linear-gradient(135deg,#1a2f5e 0%,#2d4a8a 100%);padding:44px 30px;text-align:center}
  .header h1{color:#ffffff;font-size:26px;margin:0 0 6px;font-weight:800;letter-spacing:-0.5px}
  .header p{color:#a8c4e8;font-size:14px;margin:0}
  .body{padding:32px 36px}
  .text{font-size:15px;color:#444;line-height:1.8;margin-bottom:16px}
  .footer{background:#f8faff;padding:24px 30px;text-align:center;border-top:1px solid #e5eaf5}
  .footer-links{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-bottom:8px}
  .footer-links a{font-size:12px;color:#2d4a8a;text-decoration:none;font-weight:600}
  .btn{display:inline-block;padding:13px 36px;border-radius:50px;font-size:15px;font-weight:700;text-decoration:none;margin-top:8px}
  .btn-green{background:linear-gradient(135deg,#25d366,#128c7e);color:#fff;box-shadow:0 4px 12px rgba(37,211,102,0.3)}
  .btn-blue{background:linear-gradient(135deg,#1a2f5e,#2d4a8a);color:#fff;box-shadow:0 4px 12px rgba(26,47,94,0.3)}
  .cta{text-align:center;margin:28px 0}
  .destaque{background:linear-gradient(135deg,#f0f5ff,#e8f0fe);border-radius:16px;padding:24px;margin:20px 0;text-align:center}
  .destaque p{font-size:16px;color:#1a2f5e;line-height:1.8;margin:0;font-weight:500}
  .alert-box{background:#fff8f0;border-left:4px solid #f59e0b;border-radius:8px;padding:20px 24px;margin:20px 0}
  .alert-box p{margin:0;font-size:15px;color:#92400e;line-height:1.7}
  table.parcelas{width:100%;border-collapse:collapse;margin:20px 0;font-size:14px}
  table.parcelas th{background:#1a2f5e;color:#fff;padding:10px 14px;text-align:left}
  table.parcelas td{padding:10px 14px;border-bottom:1px solid #e5eaf5;color:#444}
  table.parcelas tr:last-child td{border-bottom:none}
  table.parcelas tr:nth-child(even) td{background:#f8faff}
`;

// ─── TEMPLATE 1: Boas-vindas ──────────────────────────────────────────────
const template1 = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>${baseStyle}</style></head><body>
<div class="container">
  <div class="header"><h1>Barcellos Seguros</h1><p>Protegendo o que mais importa para você</p></div>
  <div class="body">
    <p class="text">Olá, <strong>{{nome}}</strong>! 👋</p>
    <p class="text">Que ótima notícia! Você deu um passo importante para garantir a sua proteção e da sua família. Estamos muito felizes em ter você conosco.</p>
    <div class="destaque"><p>✅ Seu <strong>{{produto}}</strong> está ativo e pronto para te proteger quando você mais precisar.</p></div>
    <p class="text">Qualquer dúvida, nossa equipe está sempre disponível para ajudar. Acesse nosso site e conheça todos os benefícios:</p>
    <div class="cta"><a href="${SITE}" class="btn btn-blue">🌐 Acessar barcellosseguros.com.br</a></div>
    <p class="text" style="font-size:13px;color:#9ca3af;text-align:center">Com carinho, <strong style="color:#1a2f5e">Equipe Barcellos Seguros</strong> 💙</p>
  </div>
  ${footer()}
</div></body></html>`;

// ─── TEMPLATE 2: Boas-vindas Novo Cliente ─────────────────────────────────
const template2 = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>${baseStyle}</style></head><body>
<div class="container">
  <div class="header"><h1>Barcellos Seguros</h1><p>Protegendo o que mais importa para você</p></div>
  <div class="body">
    <p style="font-size:26px;font-weight:800;color:#1a2f5e;text-align:center;margin-bottom:6px">Seja bem-vindo(a),<br>{{nome}}! 🎉</p>
    <p class="text" style="text-align:center;color:#6b7280">É uma honra ter você na família Barcellos Seguros.</p>
    <div class="destaque"><p>Você agora conta com uma equipe dedicada a proteger o que mais importa para você — sua família, seu patrimônio e sua tranquilidade.</p></div>
    <p class="text">Conheça todos os nossos serviços e soluções em seguros no nosso site:</p>
    <div class="cta"><a href="${SITE}" class="btn btn-blue">🌐 Visitar barcellosseguros.com.br</a></div>
    <p class="text" style="font-size:13px;color:#9ca3af;text-align:center">Com carinho, <strong style="color:#1a2f5e">Equipe Barcellos Seguros</strong> 💙</p>
  </div>
  ${footer()}
</div></body></html>`;

// ─── TEMPLATE 3: Renovação ────────────────────────────────────────────────
const template3 = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>${baseStyle}</style></head><body>
<div class="container">
  <div class="header"><h1>Barcellos Seguros</h1><p>Protegendo o que mais importa para você</p></div>
  <div class="body">
    <p class="text">Olá, <strong>{{nome}}</strong>!</p>
    <p class="text">Gostaríamos de avisar que o seu <strong>{{produto}}</strong> está próximo do vencimento. Para garantir que você continue protegido sem interrupções, entre em contato conosco para renovar.</p>
    <div class="alert-box"><p>⏰ <strong>Atenção:</strong> Não deixe sua proteção vencer! Entre em contato com nossa equipe para renovar com as melhores condições.</p></div>
    <p class="text">Acesse nosso site ou fale diretamente com nossa equipe pelo WhatsApp:</p>
    <div class="cta">
      <a href="${SITE}" class="btn btn-blue" style="margin-right:8px">🌐 Ver seguros</a>
      <a href="https://wa.me/${WHATSAPP_NUM}" class="btn btn-green">💬 Renovar pelo WhatsApp</a>
    </div>
    <p class="text" style="font-size:13px;color:#9ca3af;text-align:center">Equipe <strong style="color:#1a2f5e">Barcellos Seguros</strong> 💙</p>
  </div>
  ${footer()}
</div></body></html>`;

// ─── TEMPLATE 4: Aviso de Inadimplência ───────────────────────────────────
const template4 = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>${baseStyle}</style></head><body>
<div class="container">
  <div class="header"><h1>Barcellos Seguros</h1><p>Protegendo o que mais importa para você</p></div>
  <div class="body">
    <p class="text">Olá, <strong>{{nome}}</strong>!</p>
    <p class="text">Identificamos que existem competências em aberto no seu <strong>{{produto}}</strong> junto à <strong>MAG Seguros / Mongeral Aegon</strong>. Confira o resumo abaixo:</p>
    {{tabela_parcelas}}
    <div class="alert-box"><p>⚠️ Para evitar a suspensão da sua cobertura, regularize sua situação o quanto antes. Nossa equipe está pronta para ajudar!</p></div>
    <p class="text">Entre em contato pelo WhatsApp para negociar ou tirar dúvidas:</p>
    <div class="cta"><a href="https://wa.me/${WHATSAPP_NUM}?text=Ol%C3%A1%2C+preciso+regularizar+meu+seguro" class="btn btn-green">💬 Falar pelo WhatsApp</a></div>
    <p class="text" style="font-size:13px;color:#9ca3af;text-align:center">Equipe <strong style="color:#1a2f5e">Barcellos Seguros</strong> 💙</p>
  </div>
  ${footer()}
</div></body></html>`;

// ─── TEMPLATE 5: Aniversário ───────────────────────────────────────────────
const template5 = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>${baseStyle}
.confetti{font-size:52px;text-align:center;padding:24px 20px 12px;background:linear-gradient(180deg,#fffbf0,#fff8e8);letter-spacing:8px}
.nome-destaque{font-size:28px;font-weight:800;color:#1a2f5e;text-align:center;margin-bottom:6px;line-height:1.2}
.subtitulo{font-size:15px;color:#6b7280;text-align:center;margin-bottom:24px}
.frase{font-size:14px;color:#6b7280;text-align:center;font-style:italic;margin:20px 0;line-height:1.8;padding:0 12px}
.site-box{background:linear-gradient(135deg,#1a2f5e,#2d4a8a);border-radius:16px;padding:22px;text-align:center;margin:20px 0}
.site-box p{color:#a8c4e8;font-size:13px;margin:0 0 10px}
.site-box a{color:#fff;font-size:17px;font-weight:800;text-decoration:none;border-bottom:2px solid rgba(255,255,255,0.4);padding-bottom:2px}
</style></head><body>
<div class="container">
  <div class="header"><h1>🎉 Barcellos Seguros</h1><p>Protegendo o que mais importa para você</p></div>
  <div class="confetti">🎂 🎈 🎁</div>
  <div class="body">
    <p class="nome-destaque">Feliz Aniversário,<br>{{nome}}!</p>
    <p class="subtitulo">Hoje o dia é todo seu — e a gente não podia deixar passar! 🥳</p>
    <div class="destaque"><p>🌟 Que este novo ciclo chegue cheio de saúde, leveza e momentos incríveis. Que cada sonho seu encontre o caminho certo e que as pessoas que você ama estejam sempre por perto.</p></div>
    <p class="frase">"É um privilégio cuidar de quem você mais ama. Obrigado por confiar à Barcellos Seguros a proteção da sua família." 💙</p>
    <div class="site-box">
      <p>Conheça tudo o que preparamos para proteger você e sua família:</p>
      <a href="${SITE}">www.barcellosseguros.com.br</a>
    </div>
    <p class="text" style="font-size:13px;color:#9ca3af;text-align:center">Com muito carinho e gratidão pela sua confiança,<br><strong style="color:#1a2f5e">Equipe Barcellos Seguros</strong> 💙</p>
    <div class="cta"><a href="{{whatsapp_link}}" class="btn btn-green">💬 Responder pelo WhatsApp</a></div>
  </div>
  ${footer('{{whatsapp_link}}')}
</div></body></html>`;

const conn = await mysql.createConnection(process.env.DATABASE_URL);

await conn.execute(`UPDATE email_templates SET nome=?, assunto=?, corpo=? WHERE id=1`, ['Boas-vindas - Novo Cliente', 'Bem-vindo(a) à Barcellos Seguros, {{nome}}!', template1]);
await conn.execute(`UPDATE email_templates SET corpo=? WHERE id=2`, [template2]);
await conn.execute(`UPDATE email_templates SET corpo=? WHERE id=3`, [template3]);
await conn.execute(`UPDATE email_templates SET corpo=? WHERE id=4`, [template4]);
await conn.execute(`UPDATE email_templates SET corpo=?, assunto=? WHERE id=5`, [template5, '🎂 Hoje é o seu dia, {{nome}}! A Barcellos celebra com você!']);

console.log('✅ Todos os templates atualizados com sucesso!');
await conn.end();

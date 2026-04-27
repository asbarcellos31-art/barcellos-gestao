import mysql from 'mysql2/promise';

const LOGO_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663348080686/8JHGDJiU4qZSTzCTFQYFKy/barcellos-logo-transparent_1ecfd1d9.png';
const SITE = 'https://www.barcellosseguros.com.br';
const INSTAGRAM = 'https://www.instagram.com/barcellosseguros';
const EMAIL = 'atendimento@barcellosseguros.com';
const WHATSAPP_NUM = '4892108365';

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
  .destaque{background:linear-gradient(135deg,#f0f5ff,#e8f0fe);border-radius:16px;padding:24px;margin:20px 0}
  .destaque p{font-size:16px;color:#1a2f5e;line-height:1.8;margin:0;font-weight:500}
  .pergunta-box{background:#fff8f0;border-left:4px solid #f59e0b;border-radius:8px;padding:20px 24px;margin:20px 0}
  .pergunta-box p{margin:0;font-size:16px;color:#92400e;line-height:1.7;font-weight:600}
`;

const footer = `<div class="footer">
  <img src="${LOGO_URL}" alt="Barcellos Seguros" style="height:52px;display:block;margin:0 auto 14px;max-width:200px">
  <div class="footer-links">
    <a href="${SITE}">🌐 barcellosseguros.com.br</a>
    <a href="https://wa.me/${WHATSAPP_NUM}">💬 WhatsApp</a>
    <a href="${INSTAGRAM}">📷 @barcellosseguros</a>
    <a href="mailto:${EMAIL}">📧 ${EMAIL}</a>
  </div>
  <p style="font-size:11px;color:#aaa;margin-top:12px">Para cancelar o recebimento, responda com "DESCADASTRAR".</p>
</div>`;

const templateMedico = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>${baseStyle}</style></head><body>
<div class="container">
  <div class="header">
    <h1>Barcellos Seguros</h1>
    <p>Proteção de renda para profissionais da saúde</p>
  </div>
  <div class="body">
    <p class="text">Dr(a). <strong>{{nome}}</strong>,</p>
    <p class="text">Meu nome é <strong>Anderson Barcellos</strong>, da <strong>Barcellos Seguros</strong>.</p>
    <p class="text">Nós trabalhamos com <strong>proteção de renda para profissionais liberais</strong>, principalmente médicos que atuam como PJ ou autônomos.</p>

    <div class="pergunta-box">
      <p>💡 Posso te fazer uma pergunta direta?</p>
    </div>

    <p class="text">Se você precisasse ficar afastado da atividade por <strong>60 ou 90 dias</strong>, sua renda continuaria protegida?</p>

    <div class="destaque">
      <p>A maioria dos médicos acredita que o INSS resolve esse cenário, mas ele possui algumas <strong>limitações importantes</strong> — como teto de benefício e dependência de perícia.</p>
    </div>

    <p class="text">Por isso muitos profissionais utilizam o <strong>DIT (Diária por Incapacidade Temporária)</strong>, que garante renda durante o período de afastamento por doença ou acidente.</p>

    <p class="text" style="font-size:14px;color:#666;font-style:italic">Não é seguro de vida tradicional.<br>É <strong>proteção da renda</strong> enquanto o médico está afastado da atividade profissional.</p>

    <p class="text">Se fizer sentido, posso te mostrar rapidamente como funciona.</p>

    <div class="cta">
      <a href="https://wa.me/${WHATSAPP_NUM}?text=Ol%C3%A1%20Anderson%2C%20quero%20saber%20mais%20sobre%20o%20DIT" class="btn btn-green">💬 Quero saber mais pelo WhatsApp</a>
    </div>
    <div class="cta" style="margin-top:8px">
      <a href="${SITE}" class="btn btn-blue">🌐 Conhecer a Barcellos Seguros</a>
    </div>

    <p class="text" style="font-size:13px;color:#9ca3af;text-align:center;margin-top:24px">Com respeito ao seu tempo,<br><strong style="color:#1a2f5e">Anderson Barcellos — Barcellos Seguros</strong> 💙</p>
  </div>
  ${footer}
</div></body></html>`;

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Verificar se já existe um template de médicos
const [existing] = await conn.execute(`SELECT id FROM email_templates WHERE nome LIKE '%édico%' OR nome LIKE '%DIT%' LIMIT 1`);

if (existing.length > 0) {
  await conn.execute(
    `UPDATE email_templates SET nome=?, assunto=?, corpo=? WHERE id=?`,
    ['Campanha Médicos - DIT', 'Uma pergunta rápida sobre afastamento médico', templateMedico, existing[0].id]
  );
  console.log(`✅ Template de médicos atualizado (id=${existing[0].id})`);
} else {
  const [result] = await conn.execute(
    `INSERT INTO email_templates (nome, assunto, corpo, ativo) VALUES (?, ?, ?, 1)`,
    ['Campanha Médicos - DIT', 'Uma pergunta rápida sobre afastamento médico', templateMedico]
  );
  console.log(`✅ Template de médicos criado com id=${result.insertId}`);
}

await conn.end();

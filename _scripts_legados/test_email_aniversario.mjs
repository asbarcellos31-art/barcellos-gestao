import mysql from 'mysql2/promise';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const REMETENTE = process.env.SENDGRID_FROM_EMAIL || 'atendimento@barcellosseguros.com';
const NOME_REMETENTE = process.env.SENDGRID_FROM_NAME || 'Barcellos Seguros';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Buscar template de aniversário
const [templates] = await conn.execute("SELECT * FROM email_templates WHERE id = 5 LIMIT 1");
const template = templates[0];

// Buscar número de WhatsApp de aniversário
const [wRows] = await conn.execute("SELECT valor FROM system_config WHERE chave = 'whatsapp_aniversario' LIMIT 1");
let whatsappNum = wRows.length > 0 ? wRows[0].valor : '';
// Garantir formato limpo
whatsappNum = String(whatsappNum).replace(/\D/g, '');

const whatsappLink = whatsappNum
  ? `https://wa.me/${whatsappNum}?text=${encodeURIComponent('Olá! Recebi seu e-mail de aniversário, muito obrigado! 🎂')}`
  : '#';

console.log('WhatsApp configurado:', whatsappNum);
console.log('Link gerado:', whatsappLink);

// Substituir variáveis
function substituir(texto, vars) {
  return Object.entries(vars).reduce(
    (t, [k, v]) => t.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'gi'), v),
    texto
  );
}

const vars = {
  nome: 'Anderson',
  whatsapp: whatsappNum,
  whatsapp_link: whatsappLink,
};

const assunto = substituir(template.assunto, vars);
const corpo = substituir(template.corpo, vars);

// Enviar via SendGrid
const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${SENDGRID_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    personalizations: [{ to: [{ email: 'asbarcellos31@gmail.com', name: 'Anderson' }] }],
    from: { email: REMETENTE, name: NOME_REMETENTE },
    subject: assunto,
    content: [{ type: 'text/html', value: corpo }],
  }),
});

if (resp.ok || resp.status === 202) {
  console.log('✅ E-mail de teste enviado com sucesso para asbarcellos31@gmail.com!');
  console.log('Assunto:', assunto);
} else {
  const err = await resp.text();
  console.error('❌ Erro ao enviar:', resp.status, err);
}

await conn.end();

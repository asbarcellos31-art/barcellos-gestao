import mysql from 'mysql2/promise';
import https from 'https';

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  // Buscar emails pendentes das campanhas MEDICO 2 e MEDICO 3
  const [emails] = await conn.execute(`
    SELECT e.id, e.email, e.campanhaId, t.assunto, t.corpo
    FROM email_envios e
    JOIN email_campanhas c ON e.campanhaId = c.id
    JOIN email_templates t ON c.templateId = t.id
    WHERE c.id IN (60002, 60003) AND e.status = 'PENDENTE'
    ORDER BY e.id
    LIMIT 2000
  `);
  
  console.log(`Encontrados ${emails.length} emails pendentes`);
  
  let enviados = 0;
  let erros = 0;
  let invalidos = 0;
  
  for (const email of emails) {
    // Validar email
    if (!email.email || !email.email.includes('@') || email.email.length < 5) {
      await conn.execute('UPDATE email_envios SET status = ? WHERE id = ?', ['ERRO', email.id]);
      invalidos++;
      continue;
    }
    
    try {
      const postData = JSON.stringify({
        personalizations: [{ to: [{ email: email.email }] }],
        from: { email: process.env.SENDGRID_FROM_EMAIL, name: process.env.SENDGRID_FROM_NAME },
        subject: email.assunto || 'Barcellos Seguros',
        content: [{ type: 'text/html', value: email.corpo || '<p>Mensagem</p>' }]
      });
      
      await new Promise((resolve) => {
        const req = https.request({
          hostname: 'api.sendgrid.com',
          path: '/v3/mail/send',
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
            'Content-Type': 'application/json',
            'Content-Length': postData.length
          }
        }, (res) => {
          if (res.statusCode === 202) {
            conn.execute('UPDATE email_envios SET status = ? WHERE id = ?', ['ENVIADO', email.id]);
            enviados++;
          } else {
            conn.execute('UPDATE email_envios SET status = ?, erro = ? WHERE id = ?', ['ERRO', `HTTP ${res.statusCode}`, email.id]);
            erros++;
          }
          resolve();
        });
        
        req.on('error', () => {
          conn.execute('UPDATE email_envios SET status = ? WHERE id = ?', ['ERRO', email.id]);
          erros++;
          resolve();
        });
        
        req.write(postData);
        req.end();
      });
      
      await new Promise(r => setTimeout(r, 150));
    } catch (err) {
      erros++;
    }
  }
  
  console.log(`✓ Enviados: ${enviados} | Erros: ${erros} | Inválidos: ${invalidos}`);
  await conn.end();
}

run().catch(console.error);

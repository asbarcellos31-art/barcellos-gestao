import fetch from 'node-fetch';

const EVOLUTION_BASE_URL = "http://31.97.85.41:8080";
const EVOLUTION_API_KEY = "barcellos-evolution-key-2024";

async function testarConexao() {
  console.log("🔍 Testando conexão com Evolution API...\n");

  // Teste 1: Verificar status de conexão da instância whatsapp-3
  console.log("1️⃣  Verificando status de whatsapp-3...");
  try {
    const url = `${EVOLUTION_BASE_URL}/instance/connectionState/whatsapp-3`;
    console.log(`   URL: ${url}`);
    const resp = await fetch(url, {
      headers: { "apikey": EVOLUTION_API_KEY },
      timeout: 5000
    });
    console.log(`   Status HTTP: ${resp.status}`);
    const data = await resp.text();
    console.log(`   Resposta: ${data.substring(0, 200)}`);
  } catch (err) {
    console.log(`   ❌ Erro: ${err.message}`);
  }

  console.log("\n2️⃣  Verificando status de whatsapp-1...");
  try {
    const url = `${EVOLUTION_BASE_URL}/instance/connectionState/whatsapp-1`;
    console.log(`   URL: ${url}`);
    const resp = await fetch(url, {
      headers: { "apikey": EVOLUTION_API_KEY },
      timeout: 5000
    });
    console.log(`   Status HTTP: ${resp.status}`);
    const data = await resp.text();
    console.log(`   Resposta: ${data.substring(0, 200)}`);
  } catch (err) {
    console.log(`   ❌ Erro: ${err.message}`);
  }

  console.log("\n3️⃣  Testando envio de mensagem de teste com whatsapp-3...");
  try {
    const url = `${EVOLUTION_BASE_URL}/message/sendText/whatsapp-3`;
    console.log(`   URL: ${url}`);
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: "5548999999999",
        options: { delay: 1200, presence: "composing" },
        textMessage: { text: "Teste de conexão" },
      }),
      timeout: 5000
    });
    console.log(`   Status HTTP: ${resp.status}`);
    const data = await resp.text();
    console.log(`   Resposta: ${data.substring(0, 300)}`);
  } catch (err) {
    console.log(`   ❌ Erro: ${err.message}`);
  }
}

testarConexao();

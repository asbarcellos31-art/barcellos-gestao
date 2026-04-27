/**
 * Evolution API WhatsApp Integration Helper
 * Servidor: http://31.97.85.41:8080
 *
 * Instâncias configuradas:
 *   - whatsapp-1 → Inadimplência + contato oficial nos templates (48 3372-6890)
 *   - whatsapp-2 → Aniversariantes + boas-vindas (48 99210-8365)
 *   - whatsapp-3 → Campanhas médicos - Anderson (48 99225-9899)
 */

import { getDb } from "./db";
import { whatsappEnvios } from "../drizzle/schema";
import mysql from "mysql2/promise";

// ── Configuração da Evolution API (lê do ambiente) ──────────────────────────
const EVOLUTION_BASE_URL = (process.env.EVOLUTION_API_URL || "http://31.97.85.41:8080").replace(/\/+$/, "");
const EVOLUTION_API_KEY  = process.env.EVOLUTION_API_KEY || "barcellos-evolution-key-2024";

console.log("[Evolution API] URL configurada:", EVOLUTION_BASE_URL);
console.log("[Evolution API] Key configurada:", EVOLUTION_API_KEY ? "***presente***" : "VAZIA");

// Instâncias disponíveis
export const INSTANCIAS = {
  inadimplencia: "whatsapp-1",   // (48) 3372-6890 — inadimplência e contato oficial
  aniversario:   "whatsapp-2",   // (48) 99210-8365 — aniversariantes e boas-vindas
  boasVindas:    "whatsapp-2",   // mesma instância do aniversário
  campanhas:     "whatsapp-1",   // campanhas manuais usam whatsapp-1 por padrão
  medicos:       "whatsapp-3",   // (48) 99225-9899 — Anderson — campanhas médicos
} as const;

// Mantido para compatibilidade com código existente que chama getZApiConfig()
export interface ZApiConfig {
  instanceId: string;
  token: string;
  clientToken: string;
}

export async function getZApiConfig(): Promise<ZApiConfig | null> {
  // Retorna config da instância padrão (whatsapp-1)
  return {
    instanceId: INSTANCIAS.campanhas,
    token: EVOLUTION_API_KEY,
    clientToken: "",
  };
}

/**
 * Formata o número de telefone para o padrão Evolution API (somente dígitos, com DDI)
 * Ex: "(48) 99999-9999" → "5548999999999"
 */
export function formatarTelefone(telefone: string): string {
  let digitos = telefone.replace(/\D/g, "");

  // 1) Remove DDI 55 se já presente
  if (digitos.startsWith("55") && digitos.length > 11) {
    digitos = digitos.slice(2);
  }

  // 2) Detecta DDD duplicado (ex: 484833376061 → 4833376061 ou 4848999999999 → 48999999999)
  //    Isso acontece quando o usuário digita DDD duas vezes
  if (digitos.length >= 12) {
    const ddd = digitos.slice(0, 2);
    const resto = digitos.slice(2);
    if (resto.startsWith(ddd)) {
      // DDD duplicado: remove o primeiro par
      digitos = resto;
    }
  }

  // 3) Agora digitos deve ter 10 ou 11 dígitos (sem DDI)
  //    Se tiver 10 dígitos, o número após o DDD tem apenas 8 dígitos — precisa do 9
  if (digitos.length === 10) {
    const ddd = digitos.slice(0, 2);
    const numero = digitos.slice(2); // 8 dígitos
    digitos = ddd + "9" + numero; // sempre adiciona o 9 quando tem 10 dígitos
  }

  // 4) Garante DDI 55
  return `55${digitos}`;
}

/**
 * Envia uma mensagem de texto via Evolution API com timeout de 30 segundos
 * @param instancia Nome da instância (whatsapp-1 ou whatsapp-2)
 */
export async function enviarMensagemEvolution(
  telefone: string,
  mensagem: string,
  instancia: string = INSTANCIAS.campanhas
): Promise<{ sucesso: boolean; erro?: string }> {
  const numero = formatarTelefone(telefone);
  if (numero.length < 12) {
    return { sucesso: false, erro: `Número inválido: ${telefone}` };
  }

  try {
    const url = `${EVOLUTION_BASE_URL}/message/sendText/${instancia}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos de timeout
    
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          number: numero,
          options: { delay: 1200, presence: "composing" },
          textMessage: { text: mensagem },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        const body = await resp.text();
        // Detecta número sem WhatsApp (exists: false)
        if (body.includes('"exists":false') || body.includes('"exists": false')) {
          return { sucesso: false, erro: `Número ${numero} não tem WhatsApp cadastrado. Verifique o número do cliente.` };
        }
        return { sucesso: false, erro: `Evolution API erro ${resp.status}: ${body.substring(0, 200)}` };
      }

      return { sucesso: true };
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        return { sucesso: false, erro: `Timeout ao enviar para ${numero} (30s)` };
      }
      throw fetchErr;
    }
  } catch (err: any) {
    return { sucesso: false, erro: err.message || "Erro desconhecido" };
  }
}

// URL do vídeo de boas-vindas hospedado no CDN
export const VIDEO_BOAS_VINDAS_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663348080686/8JHGDJiU4qZSTzCTFQYFKy/boas-vindas-barcellos_7492e1dd.mp4";

/**
 * Envia um vídeo como mídia via Evolution API
 */
export async function enviarVideoEvolution(
  telefone: string,
  videoUrl: string,
  caption: string,
  instancia: string = INSTANCIAS.boasVindas
): Promise<{ sucesso: boolean; erro?: string }> {
  const numero = formatarTelefone(telefone);
  if (numero.length < 12) {
    return { sucesso: false, erro: `Número inválido: ${telefone}` };
  }

  try {
    const url = `${EVOLUTION_BASE_URL}/message/sendMedia/${instancia}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos de timeout
    
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          number: numero,
          options: { delay: 1200, presence: "composing" },
          mediaMessage: {
            mediatype: "video",
            media: videoUrl,
            caption: caption,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        const body = await resp.text();
        // Detecta número sem WhatsApp (exists: false)
        if (body.includes('"exists":false') || body.includes('"exists": false')) {
          return { sucesso: false, erro: `Número ${numero} não tem WhatsApp cadastrado. Verifique o número do cliente.` };
        }
        return { sucesso: false, erro: `Evolution API erro ${resp.status}: ${body.substring(0, 200)}` };
      }

      return { sucesso: true };
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        return { sucesso: false, erro: `Timeout ao enviar vídeo para ${numero} (30s)` };
      }
      throw fetchErr;
    }
  } catch (err: any) {
    return { sucesso: false, erro: err.message || "Erro desconhecido" };
  }
}

/**
 * Envia mídia genérica (imagem, vídeo, documento) via Evolution API com timeout de 30 segundos
 * @param mediaType "image" | "video" | "document" | "audio"
 */
export async function enviarMidiaEvolution(
  telefone: string,
  mediaUrl: string,
  mediaType: "image" | "video" | "document" | "audio",
  caption: string,
  instancia: string = INSTANCIAS.campanhas
): Promise<{ sucesso: boolean; erro?: string }> {
  const numero = formatarTelefone(telefone);
  if (numero.length < 12) {
    return { sucesso: false, erro: `Número inválido: ${telefone}` };
  }

  try {
    const url = `${EVOLUTION_BASE_URL}/message/sendMedia/${instancia}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos de timeout
    
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": EVOLUTION_API_KEY,
        },
        body: JSON.stringify({
          number: numero,
          options: { delay: 1200, presence: "composing" },
          mediaMessage: {
            mediatype: mediaType,
            media: mediaUrl,
            caption: caption,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        const body = await resp.text();
        // Detecta número sem WhatsApp (exists: false)
        if (body.includes('"exists":false') || body.includes('"exists": false')) {
          return { sucesso: false, erro: `Número ${numero} não tem WhatsApp cadastrado. Verifique o número do cliente.` };
        }
        return { sucesso: false, erro: `Evolution API erro ${resp.status}: ${body.substring(0, 200)}` };
      }

      return { sucesso: true };
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        return { sucesso: false, erro: `Timeout ao enviar mídia para ${numero} (30s)` };
      }
      throw fetchErr;
    }
  } catch (err: any) {
    return { sucesso: false, erro: err.message || "Erro desconhecido" };
  }
}

/**
 * Mantido para compatibilidade — redireciona para Evolution API
 */
export async function enviarMensagemWhatsapp(
  telefone: string,
  mensagem: string,
  config?: ZApiConfig
): Promise<{ sucesso: boolean; erro?: string }> {
  return enviarMensagemEvolution(telefone, mensagem);
}

/**
 * Verifica se a Evolution API está respondendo (simples health check)
 */
export async function verificarConexaoEvolution(instancia: string): Promise<{ conectado: boolean; erro?: string }> {
  try {
    const url = `${EVOLUTION_BASE_URL}/instance/fetchInstances`;
    console.log(`[Evolution] Tentando: GET ${url} (instancia: ${instancia})`);
    const resp = await fetch(url, {
      method: "GET",
      headers: { "apikey": EVOLUTION_API_KEY },
    });
    
    if (!resp.ok) {
      console.error(`[Evolution] Resposta não OK: ${resp.status}`);
      return { conectado: false, erro: `Status ${resp.status}` };
    }
    
    const instances = await resp.json() as any[];
    const inst = instances.find((i: any) => i.instance?.instanceName === instancia);
    
    if (!inst) {
      return { conectado: false, erro: "Instância não encontrada" };
    }
    
    // Considera conectado se status é "open" ou se tem owner (conectado)
    const conectado = inst.instance?.status === "open" || !!inst.instance?.owner;
    return { conectado };
  } catch (err: any) {
    console.error(`[Evolution] ERRO em verificarConexaoEvolution:`, err.message, err.cause?.message || "");
    return { conectado: false, erro: err.message };
  }
}

/**
 * Reconecta uma instância da Evolution API
 */
export async function reconectarInstancia(instancia: string): Promise<{
  sucesso: boolean;
  mensagem: string;
}> {
  try {
    const url = `${EVOLUTION_BASE_URL}/instance/restart/${instancia}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "apikey": EVOLUTION_API_KEY },
    });
    if (!resp.ok) {
      return { sucesso: false, mensagem: `Erro ao reconectar: ${resp.status}` };
    }
    return { sucesso: true, mensagem: `Instância ${instancia} reconectada com sucesso` };
  } catch (err: any) {
    return { sucesso: false, mensagem: `Erro: ${err.message}` };
  }
}

/**
 * Envia mensagem com retry automático em caso de erro de conexão
 */
export async function enviarMensagemComRetry(
  telefone: string,
  mensagem: string,
  instancia: string = INSTANCIAS.campanhas,
  maxTentativas: number = 3
): Promise<{ sucesso: boolean; erro?: string }> {
  for (let i = 0; i < maxTentativas; i++) {
    const resultado = await enviarMensagemEvolution(telefone, mensagem, instancia);
    if (resultado.sucesso) {
      return resultado;
    }
    
    // Se erro é "Connection Closed", tenta reconectar
    if (resultado.erro?.includes("Connection Closed")) {
      await new Promise(r => setTimeout(r, 2000)); // Aguarda 2s antes de reconectar
      const reconexao = await reconectarInstancia(instancia);
      if (reconexao.sucesso) {
        console.log(`[WA] Reconexão bem-sucedida, tentando novamente...`);
      } else {
        console.log(`[WA] Falha ao reconectar: ${reconexao.mensagem}`);
      }
    }
    
    // Aguarda antes de tentar novamente
    if (i < maxTentativas - 1) {
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  
  return { sucesso: false, erro: "Falha após múltiplas tentativas" };
}

/**
 * Registra um envio de WhatsApp no banco de dados
 */
export async function registrarEnvioWhatsapp(dados: {
  campanhaId?: number;
  nome?: string;
  telefone: string;
  mensagem: string;
  tipo: string;
  status: string;
  erro?: string;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    
    await db.insert(whatsappEnvios).values({
      campanhaId: dados.campanhaId,
      nome: dados.nome,
      telefone: dados.telefone,
      mensagem: dados.mensagem,
      tipo: dados.tipo,
      status: dados.status,
      erro: dados.erro,
    });
  } catch (err) {
    console.error("[WA] Erro ao registrar envio:", err);
  }
}

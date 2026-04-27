import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { validarSessao } from "../configuracoesDb";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

/**
 * Extrai o token de sessão do app a partir da requisição tRPC.
 * O frontend (AppAuthContext) envia o token como parâmetro `token` em chamadas
 * como `validarToken`. Aqui, lemos esse token também do header Authorization
 * (caso seja enviado) ou do body da requisição quando disponível.
 *
 * Estratégia: na maior parte das rotas tRPC autenticadas, o front passa o token
 * como input `{ token }`. Esse parâmetro chega ao body da requisição. Validamos
 * o token e populamos ctx.user para que protectedProcedure e adminProcedure
 * funcionem corretamente.
 */
function extrairToken(req: CreateExpressContextOptions["req"]): string | null {
  // 1) Authorization header: "Bearer <token>"
  const authHeader = req.headers["authorization"];
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  // 2) Header customizado x-app-token
  const xToken = req.headers["x-app-token"];
  if (typeof xToken === "string" && xToken.trim().length > 0) {
    return xToken.trim();
  }

  // 3) Body do tRPC: pode estar como { token } ou { 0: { token } } (batch)
  const body: any = (req as any).body;
  if (body) {
    if (typeof body.token === "string" && body.token.length > 0) return body.token;
    if (typeof body === "object") {
      for (const key of Object.keys(body)) {
        const item = body[key];
        if (item && typeof item === "object") {
          const inner = item.json ?? item;
          if (inner && typeof inner.token === "string" && inner.token.length > 0) {
            return inner.token;
          }
        }
      }
    }
  }

  // 4) Cookie barcellos_app_token (se for usado no futuro)
  const cookieHeader = req.headers["cookie"];
  if (typeof cookieHeader === "string") {
    const match = cookieHeader.match(/barcellos_app_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }

  return null;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const token = extrairToken(opts.req);
    if (token) {
      const sess = await validarSessao(token);
      if (sess) {
        // validarSessao retorna { id, nome, email, role }.
        // O tipo User do Drizzle tem mais campos, mas para fins de autenticação
        // basta ter id/email/role disponíveis para protectedProcedure.
        user = sess as unknown as User;
      }
    }
  } catch (error) {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}

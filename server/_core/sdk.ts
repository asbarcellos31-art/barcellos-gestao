// Stub do SDK do template Manus.
// O sistema usa autenticação própria — ver `configuracoesDb.loginUsuario` e o
// procedure `usuarios.login` em routers.ts. Este SDK existe apenas para que
// o context.ts compile sem ter que reescrever toda a árvore de imports.

import type { Request } from "express";
import type { User } from "../../drizzle/schema";

class SDKServer {
  async authenticateRequest(_req: Request): Promise<User> {
    // Sem OAuth Manus — sempre lança. O ctx.user será null para o tRPC,
    // o que é o comportamento desejado: a autenticação real do app
    // é feita via token no header (validarSessao em configuracoesDb).
    throw new Error("OAuth Manus desativado — use usuarios.login");
  }
}

export const sdk = new SDKServer();

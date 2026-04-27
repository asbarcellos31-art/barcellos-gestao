// OAuth callback do template original (Manus) — desativado.
// O sistema usa autenticação própria via tRPC `usuarios.login` (email/senha
// com hash bcrypt em app_users). Este arquivo permanece apenas para manter
// compatibilidade de import; a função registerOAuthRoutes é um no-op.

import type { Express } from "express";

export function registerOAuthRoutes(_app: Express) {
  // intencionalmente vazio
}

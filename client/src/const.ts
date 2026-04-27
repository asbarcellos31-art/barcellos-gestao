export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Login URL — sistema usa autenticação própria via /login.
// Esta função existe apenas para compatibilidade com chamadas legadas
// (qualquer botão de "Login" deve redirecionar para a tela de login interna).
export const getLoginUrl = () => {
  return "/login";
};

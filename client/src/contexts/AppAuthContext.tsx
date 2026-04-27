import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { trpc } from "@/lib/trpc";

const TOKEN_KEY = "barcellos_app_token";

interface AppUser {
  id: number;
  nome: string;
  email: string;
  role: "admin" | "user";
}

interface Permissao {
  modulo: string;
  label: string;
  podeVer: boolean;
  podeCriar: boolean;
  podeEditar: boolean;
  podeDeletar: boolean;
}

interface AppAuthContextType {
  appUser: AppUser | null;
  isAdmin: boolean;
  isLoggedIn: boolean;
  isLoading: boolean;
  permissoes: Permissao[];
  podeVer: (modulo: string) => boolean;
  login: (email: string, senha: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AppAuthContext = createContext<AppAuthContextType | null>(null);

export function AppAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [permissoes, setPermissoes] = useState<Permissao[]>([]);
  // Controla se as permissões já foram carregadas ao menos uma vez
  const [permsCarregadas, setPermsCarregadas] = useState(false);

  // Só faz loading se há um token para validar
  const hasToken = !!token;

  // Validar token ao carregar — só executa se há token
  const { data: userData, isLoading: loadingToken } = trpc.configuracoes.validarToken.useQuery(
    { token: token ?? "" },
    { enabled: hasToken, retry: false }
  );

  // Carregar permissões quando usuário está logado
  // refetchInterval de 30s garante que alterações feitas pelo admin reflitam sem precisar de logout
  const { data: permsData, isLoading: loadingPerms } = trpc.configuracoes.listarPermissoes.useQuery(
    { userId: appUser?.id ?? 0 },
    { enabled: !!appUser?.id, refetchInterval: 30_000, refetchOnWindowFocus: true }
  );

  useEffect(() => {
    if (!hasToken) {
      // Sem token — não está logado, não precisa carregar nada
      setAppUser(null);
      setPermsCarregadas(false);
      return;
    }
    if (loadingToken) return;
    if (userData) {
      setAppUser(userData as AppUser);
    } else {
      // Token inválido — limpar
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setAppUser(null);
      setPermsCarregadas(false);
    }
  }, [userData, loadingToken, hasToken]);

  useEffect(() => {
    if (permsData) {
      setPermissoes(permsData as Permissao[]);
      setPermsCarregadas(true);
    }
  }, [permsData]);

  // Quando o appUser muda (ex: após login), resetar o flag de permissões carregadas
  useEffect(() => {
    if (!appUser) {
      setPermsCarregadas(false);
      setPermissoes([]);
    }
  }, [appUser?.id]);

  const loginMut = trpc.configuracoes.login.useMutation();

  const login = useCallback(async (email: string, senha: string) => {
    try {
      const result = await loginMut.mutateAsync({ email, senha });
      localStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      setPermsCarregadas(false); // Resetar para aguardar novas permissões
      setAppUser(result.user as AppUser);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message || "Email ou senha inválidos" };
    }
  }, [loginMut]);

  const logoutMut = trpc.configuracoes.logout.useMutation();

  const logout = useCallback(() => {
    if (token) logoutMut.mutate({ token });
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setAppUser(null);
    setPermissoes([]);
    setPermsCarregadas(false);
  }, [token, logoutMut]);

  const podeVer = useCallback((modulo: string) => {
    // Admin sempre tem acesso total
    if (appUser?.role === "admin") return true;
    // Se as permissões ainda não foram carregadas, mostrar o item
    // (evita piscar/sumir o menu enquanto carrega)
    if (!permsCarregadas) return true;
    // Verificar permissão do módulo
    const p = permissoes.find(p => p.modulo === modulo);
    return p?.podeVer ?? false;
  }, [appUser, permissoes, permsCarregadas]);

  // isLoading é true quando há token e ainda está validando OU quando permissões ainda carregam
  const isLoading = (hasToken && loadingToken) || (!!appUser && !permsCarregadas && loadingPerms);

  return (
    <AppAuthContext.Provider value={{
      appUser,
      isAdmin: appUser?.role === "admin",
      isLoggedIn: !!appUser,
      isLoading,
      permissoes,
      podeVer,
      login,
      logout,
    }}>
      {children}
    </AppAuthContext.Provider>
  );
}

export function useAppAuth() {
  const ctx = useContext(AppAuthContext);
  if (!ctx) throw new Error("useAppAuth deve ser usado dentro de AppAuthProvider");
  return ctx;
}

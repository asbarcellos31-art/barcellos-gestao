import { useAppAuth } from "@/contexts/AppAuthContext";
import AppLayout from "./AppLayout";
import { Lock } from "lucide-react";
import { Link } from "wouter";

interface PermissaoGuardProps {
  modulo: string;
  children: React.ReactNode;
}

export default function PermissaoGuard({ modulo, children }: PermissaoGuardProps) {
  const { isLoggedIn, isLoading, podeVer, isAdmin } = useAppAuth();

  // Enquanto carrega, não bloqueia
  if (isLoading) return <>{children}</>;

  // Se não está logado no sistema próprio, permite acesso (usa o Manus OAuth)
  // O bloqueio só se aplica a usuários que fizeram login próprio
  if (!isLoggedIn) return <>{children}</>;

  // Admin tem acesso total
  if (isAdmin) return <>{children}</>;

  // Verificar permissão do módulo
  if (podeVer(modulo)) return <>{children}</>;

  // Sem permissão
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 p-8">
        <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
          <Lock className="w-10 h-10 text-gray-300" />
        </div>
        <h2 className="text-2xl font-bold text-gray-700">Acesso Restrito</h2>
        <p className="text-gray-500 text-center max-w-sm">
          Você não tem permissão para acessar este módulo. Entre em contato com o administrador do sistema.
        </p>
        <Link href="/dashboard">
          <button className="mt-2 px-6 py-2.5 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #1a2f5e, #2d4a8a)" }}>
            Voltar ao Dashboard
          </button>
        </Link>
      </div>
    </AppLayout>
  );
}

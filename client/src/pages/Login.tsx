import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAppAuth } from "@/hooks/useAppAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";

const LOGO_URL =
  "https://files.manuscdn.com/user_upload_by_module/session_file/310519663348080686/ZHtpHfiQkNDuZEex.png";

export default function Login() {
  const [, navigate] = useLocation();
  const { login } = useAppAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !senha) return toast.error("Preencha e-mail e senha.");
    setCarregando(true);
    const result = await login(email, senha);
    if (result.ok) {
      toast.success("Bem-vindo!");
      navigate("/");
    } else {
      toast.error(result.error || "E-mail ou senha incorretos.");
      setCarregando(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: "linear-gradient(135deg, #0f1e3d 0%, #1a2f5e 50%, #0f1e3d 100%)",
      }}
    >
      {/* Card de login */}
      <div className="w-full max-w-md mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-2">
          <img
            src={LOGO_URL}
            alt="Barcellos Seguros"
            className="h-14 w-auto object-contain"
            style={{ filter: "brightness(0) invert(1)" }}
          />
          <span className="text-xs font-semibold tracking-[0.25em] text-blue-300 uppercase mt-1">
            Gestão Barcellos
          </span>
        </div>

        {/* Formulário */}
        <div
          className="rounded-2xl p-8 shadow-2xl"
          style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <h2 className="text-xl font-bold text-white mb-1 text-center">Acesso ao Sistema</h2>
          <p className="text-sm text-blue-200/70 text-center mb-6">
            Entre com suas credenciais para continuar
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* E-mail */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-blue-100">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300/60" />
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-blue-400 focus:ring-blue-400/20"
                  autoComplete="email"
                  disabled={carregando}
                />
              </div>
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-blue-100">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300/60" />
                <Input
                  type={mostrarSenha ? "text" : "password"}
                  placeholder="••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="pl-9 pr-10 bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-blue-400 focus:ring-blue-400/20"
                  autoComplete="current-password"
                  disabled={carregando}
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300/60 hover:text-blue-200 transition-colors"
                  tabIndex={-1}
                >
                  {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Botão */}
            <Button
              type="submit"
              className="w-full mt-2 font-semibold text-white h-11"
              style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)" }}
              disabled={carregando}
            >
              {carregando ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-blue-300/40 mt-6">
          © {new Date().getFullYear()} Barcellos Seguros — Sistema de Gestão
        </p>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAppAuth } from "@/hooks/useAppAuth";
import { LogOut, LogIn } from "lucide-react";
import {
  LayoutDashboard,
  Calendar,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  AlertTriangle,
  Users,
  ShoppingCart,
  FileWarning,
  UserCheck,
  PhoneCall,
  Clock,
  DollarSign,
  BarChart2,
  LineChart,
  TrendingDown,
  Settings,
  Landmark,
  Presentation,
  Send,
  Target,
  Mail,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MESES } from "../../../shared/constants";
import { useAno } from "../contexts/AnoContext";

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const ANOS_DISPONIVEIS = Array.from({ length: 36 }, (_, i) => 2015 + i); // 2015 a 2050

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  // No mobile, sidebar começa fechada; no desktop, começa aberta
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [contasExpanded, setContasExpanded] = useState(false);
  const [sinistrosExpanded, setSinistrosExpanded] = useState(false);
  const [financeiroExpanded, setFinanceiroExpanded] = useState(false);
  const [marketingExpanded, setMarketingExpanded] = useState(false);
  const [configExpanded, setConfigExpanded] = useState(false);
  const { ano, setAno } = useAno();

  // Detectar mobile
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile && !sidebarOpen) setSidebarOpen(true);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [sidebarOpen]);

  const isActive = (href: string) => location === href;
  const isUnderPath = (prefix: string) => location.startsWith(prefix);
  const { isLoggedIn, isLoading: permsLoading, appUser, logout: appLogout, podeVer, isAdmin } = useAppAuth();
  // Enquanto permissões ainda carregam, não ocultar nenhum item do menu
  const canSee = (modulo: string) => !isLoggedIn || permsLoading || isAdmin || podeVer(modulo);

  // Badge de timer ativo: verifica localStorage a cada 1s para mostrar cronômetro
  const [timerAtivoNaSidebar, setTimerAtivoNaSidebar] = useState(false);
  const [timerSegundos, setTimerSegundos] = useState(0);
  useEffect(() => {
    const check = () => {
      try {
        const saved = localStorage.getItem('timer-ativo');
        if (!saved) { setTimerAtivoNaSidebar(false); setTimerSegundos(0); return; }
        const data = JSON.parse(saved);
        const ativo = !!(data && !data.pausado && data.startedAt);
        setTimerAtivoNaSidebar(ativo);
        if (ativo) {
          const segundosAcumulados = typeof data.segundosAcumulados === 'number' ? data.segundosAcumulados : 0;
          const decorrido = Math.floor((Date.now() - data.startedAt) / 1000);
          setTimerSegundos(segundosAcumulados + decorrido);
        } else {
          setTimerSegundos(0);
        }
      } catch { setTimerAtivoNaSidebar(false); setTimerSegundos(0); }
    };
    check();
    const interval = setInterval(check, 1000); // 1s para cronômetro fluido
    return () => clearInterval(interval);
  }, [appUser?.id]);

  // Fechar sidebar ao navegar no mobile
  const handleNavClick = () => {
    if (isMobile) setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f0f4f8" }}>

      {/* Overlay mobile */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col transition-all duration-300 flex-shrink-0 shadow-xl z-30",
          // Mobile: posição fixa, desliza de fora para dentro
          isMobile
            ? cn("fixed inset-y-0 left-0 w-72", sidebarOpen ? "translate-x-0" : "-translate-x-full")
            : cn(sidebarOpen ? "w-64" : "w-16")
        )}
        style={{ background: "linear-gradient(180deg, #1a2f5e 0%, #243870 60%, #2d4a8a 100%)" }}
      >
        {/* Header com Logo */}
        <div className="border-b border-white/10">
          {sidebarOpen ? (
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <img
                  src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663348080686/ZHtpHfiQkNDuZEex.png"
                  alt="Barcellos Seguros"
                  className="h-8 w-auto object-contain object-left"
                  style={{ filter: "brightness(0) invert(1)" }}
                />
                <span className="text-[9px] font-semibold tracking-[0.2em] text-blue-300 uppercase pl-0.5">
                  Gestão Barcellos
                </span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded hover:bg-white/10 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4 text-white/50" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center py-3 gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-sm"
                style={{ background: "linear-gradient(135deg, #4a7bc8, #6a5bc8)" }}
              >
                B
              </div>
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1 rounded hover:bg-white/10 transition-colors"
              >
                <Menu className="w-4 h-4 text-white/50" />
              </button>
            </div>
          )}
        </div>

        {/* Seletor de Ano */}
        {sidebarOpen && (
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10 bg-white/5">
            <button
              onClick={() => {
                const idx = ANOS_DISPONIVEIS.indexOf(ano);
                if (idx > 0) setAno(ANOS_DISPONIVEIS[idx - 1]);
              }}
              className="p-1 rounded hover:bg-white/10 transition-colors"
              disabled={ANOS_DISPONIVEIS.indexOf(ano) === 0}
            >
              <ChevronLeft className="w-4 h-4 text-blue-300" />
            </button>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-300" />
              <select
                value={ano}
                onChange={(e) => setAno(parseInt(e.target.value))}
                className="bg-transparent text-white font-bold text-sm border-none outline-none cursor-pointer"
              >
                {ANOS_DISPONIVEIS.map((a) => (
                  <option key={a} value={a} className="bg-[#1a2f5e] text-white">{a}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                const idx = ANOS_DISPONIVEIS.indexOf(ano);
                if (idx < ANOS_DISPONIVEIS.length - 1) setAno(ANOS_DISPONIVEIS[idx + 1]);
              }}
              className="p-1 rounded hover:bg-white/10 transition-colors"
              disabled={ANOS_DISPONIVEIS.indexOf(ano) === ANOS_DISPONIVEIS.length - 1}
            >
              <ChevronRight className="w-4 h-4 text-blue-300" />
            </button>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">

          {/* Gestão do Tempo - PRIMEIRO ITEM */}
          {canSee("gestao-tempo") && (
            <NavItem href="/gestao-tempo" label="Gestão do Tempo" icon={Clock} location={location} sidebarOpen={sidebarOpen} onClick={handleNavClick} badge={timerAtivoNaSidebar} badgeSegundos={timerSegundos} />
          )}

          {/* Dashboard Geral */}
          {canSee("dashboard") && (
            <NavItem href="/dashboard" label="Dashboard Geral" icon={LayoutDashboard} location={location} sidebarOpen={sidebarOpen} onClick={handleNavClick} />
          )}



          {/* Base de Clientes */}
          {canSee("clientes") && (
            <NavItem href="/clientes" label="Base de Clientes" icon={Users} location={location} sidebarOpen={sidebarOpen} onClick={handleNavClick} />
          )}

          {/* Controle de Vendas */}
          {canSee("vendas") && (
            <NavItem href="/vendas" label="Controle de Vendas" icon={ShoppingCart} location={location} sidebarOpen={sidebarOpen} onClick={handleNavClick} />
          )}



          {/* Inadimplentes */}
          {canSee("inadimplentes") && (
            <NavItem href="/inadimplentes" label="Inadimplentes" icon={AlertTriangle} location={location} sidebarOpen={sidebarOpen} onClick={handleNavClick} />
          )}

          {/* ── FINANCEIRO (com submenu) ── */}
          {sidebarOpen ? (
            <div>
              <button
                onClick={() => setFinanceiroExpanded(!financeiroExpanded)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 w-full rounded-lg transition-all text-sm font-medium",
                  isActive("/comissoes") || isActive("/comissoes-pendentes") || isActive("/financeiro") || isUnderPath("/dashboard-financeiro") || isUnderPath("/mes/") || isActive("/extrato-bancario") || isActive("/relatorio-executivo") || isActive("/relatorio-financeiro")
                    ? "text-white"
                    : "text-blue-200 hover:bg-white/10 hover:text-white"
                )}
                style={isActive("/comissoes") || isActive("/comissoes-pendentes") || isActive("/financeiro") || isUnderPath("/dashboard-financeiro") || isUnderPath("/mes/") || isActive("/extrato-bancario") || isActive("/relatorio-executivo") || isActive("/relatorio-financeiro") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}
              >
                <LineChart className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">Financeiro</span>
                {financeiroExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>

              {financeiroExpanded && (
                <div className="ml-3 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                  {/* Contas a Pagar - Dashboard Financeiro */}
                  <Link href="/dashboard-financeiro" onClick={handleNavClick}>
                    <div className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs",
                      isActive("/dashboard-financeiro") ? "text-white font-semibold" : "text-blue-300 hover:bg-white/10 hover:text-white"
                    )}
                    style={isActive("/dashboard-financeiro") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}>
                      <DollarSign className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Contas a Pagar</span>
                    </div>
                  </Link>
                  {/* Relatório Executivo */}
                  <Link href="/relatorio-executivo" onClick={handleNavClick}>
                    <div className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs",
                      isActive("/relatorio-executivo") ? "text-white font-semibold" : "text-blue-300 hover:bg-white/10 hover:text-white"
                    )}
                    style={isActive("/relatorio-executivo") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}>
                      <Presentation className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Relatório Executivo</span>
                    </div>
                  </Link>
                  {/* Relatório Financeiro */}
                  <Link href="/relatorio-financeiro" onClick={handleNavClick}>
                    <div className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs",
                      isActive("/relatorio-financeiro") ? "text-white font-semibold" : "text-blue-300 hover:bg-white/10 hover:text-white"
                    )}
                    style={isActive("/relatorio-financeiro") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}>
                      <BarChart2 className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Relatório Financeiro</span>
                    </div>
                  </Link>
                  {/* Extrato Bancário */}
                  <Link href="/extrato-bancario" onClick={handleNavClick}>
                    <div className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs",
                      isActive("/extrato-bancario") ? "text-white font-semibold" : "text-blue-300 hover:bg-white/10 hover:text-white"
                    )}
                    style={isActive("/extrato-bancario") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}>
                      <Landmark className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Extrato Bancário</span>
                    </div>
                  </Link>
                  {/* Meses */}
                  {MESES.map((mes, idx) => {
                    const href = `/mes/${idx + 1}`;
                    return (
                      <Link key={idx} href={href} onClick={handleNavClick}>
                        <div className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs",
                          isActive(href) ? "text-white font-semibold" : "text-blue-300 hover:bg-white/10 hover:text-white"
                        )}
                        style={isActive(href) ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}>
                          <span className="w-6 text-right font-mono opacity-70 text-[10px]">{MESES_ABREV[idx]}</span>
                          <span>{mes}</span>
                        </div>
                      </Link>
                    );
                  })}
                  {/* Comissões */}
                  {canSee("comissoes") && (
                    <Link href="/comissoes" onClick={handleNavClick}>
                      <div className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs",
                        isActive("/comissoes") ? "text-white font-semibold" : "text-blue-300 hover:bg-white/10 hover:text-white"
                      )}
                      style={isActive("/comissoes") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}>
                        <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Comissões</span>
                      </div>
                    </Link>
                  )}
                  {/* Comissões Pendentes */}
                  {canSee("comissoes_pendentes") && (
                    <Link href="/comissoes-pendentes" onClick={handleNavClick}>
                      <div className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs",
                        isActive("/comissoes-pendentes") ? "text-white font-semibold" : "text-blue-300 hover:bg-white/10 hover:text-white"
                      )}
                      style={isActive("/comissoes-pendentes") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}>
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Comissões Pendentes</span>
                      </div>
                    </Link>
                  )}
                  {/* Financeiro Barcellos */}
                  {canSee("financeiro") && (
                    <Link href="/financeiro" onClick={handleNavClick}>
                      <div className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs",
                        isActive("/financeiro") ? "text-white font-semibold" : "text-blue-300 hover:bg-white/10 hover:text-white"
                      )}
                      style={isActive("/financeiro") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}>
                        <BarChart2 className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Financeiro Barcellos</span>
                      </div>
                    </Link>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <NavItem href="/dashboard-financeiro" label="Financeiro" icon={LineChart} location={location} sidebarOpen={false} onClick={handleNavClick} />
              <NavItem href="/extrato-bancario" label="Extrato" icon={Landmark} location={location} sidebarOpen={false} onClick={handleNavClick} />
              {MESES.map((mes, idx) => {
                const href = `/mes/${idx + 1}`;
                return (
                  <Link key={idx} href={href} onClick={handleNavClick}>
                    <div className={cn(
                      "flex items-center justify-center px-1 py-2 rounded-lg cursor-pointer transition-all text-[10px] font-mono font-bold",
                      isActive(href) ? "text-white" : "text-blue-300 hover:bg-white/10 hover:text-white"
                    )}
                    style={isActive(href) ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}
                    title={mes}>
                      {MESES_ABREV[idx]}
                    </div>
                  </Link>
                );
              })}
              {canSee("comissoes") && (
                <NavItem href="/comissoes" label="Comissões" icon={TrendingUp} location={location} sidebarOpen={false} onClick={handleNavClick} />
              )}
              {canSee("comissoes_pendentes") && (
                <NavItem href="/comissoes-pendentes" label="Pend." icon={Clock} location={location} sidebarOpen={false} onClick={handleNavClick} />
              )}
              {canSee("financeiro") && (
                <NavItem href="/financeiro" label="Fin." icon={BarChart2} location={location} sidebarOpen={false} onClick={handleNavClick} />
              )}
            </>
          )}

          {/* Cancelamentos */}
          {canSee("cancelados") && (
            <NavItem href="/cancelados" label="Cancelamentos" icon={TrendingDown} location={location} sidebarOpen={sidebarOpen} onClick={handleNavClick} />
          )}

          {/* ── SINISTROS (com submenu CRM Beneficiários) ── */}
          {sidebarOpen ? (
            <div>
              <button
                onClick={() => setSinistrosExpanded(!sinistrosExpanded)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 w-full rounded-lg transition-all text-sm font-medium",
                  isActive("/sinistros") || isActive("/crm-beneficiarios")
                    ? "text-white"
                    : "text-blue-200 hover:bg-white/10 hover:text-white"
                )}
                style={isActive("/sinistros") || isActive("/crm-beneficiarios") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}
              >
                <FileWarning className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">Sinistros</span>
                {sinistrosExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>

              {sinistrosExpanded && (
                <div className="ml-3 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                  <Link href="/sinistros" onClick={handleNavClick}>
                    <div className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs",
                      isActive("/sinistros") ? "text-white font-semibold" : "text-blue-300 hover:bg-white/10 hover:text-white"
                    )}
                    style={isActive("/sinistros") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}>
                      <FileWarning className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Protocolos</span>
                    </div>
                  </Link>
                  <Link href="/crm-beneficiarios" onClick={handleNavClick}>
                    <div className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs",
                      isActive("/crm-beneficiarios") ? "text-white font-semibold" : "text-blue-300 hover:bg-white/10 hover:text-white"
                    )}
                    style={isActive("/crm-beneficiarios") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}>
                      <UserCheck className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>CRM Beneficiários</span>
                    </div>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <>
              <NavItem href="/sinistros" label="Sinistros" icon={FileWarning} location={location} sidebarOpen={false} onClick={handleNavClick} />
              <NavItem href="/crm-beneficiarios" label="CRM Benef." icon={UserCheck} location={location} sidebarOpen={false} onClick={handleNavClick} />
            </>
          )}

          {/* CRM Leads */}
          {canSee("crm_leads") && (
            <NavItem href="/crm-leads" label="CRM Leads" icon={PhoneCall} location={location} sidebarOpen={sidebarOpen} onClick={handleNavClick} />
          )}

          {/* ── MARKETING (com submenu) ── */}
          {sidebarOpen ? (
            <div>
              <button
                onClick={() => setMarketingExpanded(!marketingExpanded)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 w-full rounded-lg transition-all text-sm font-medium",
                  isActive("/email-marketing") || isActive("/whatsapp-marketing")
                    ? "text-white"
                    : "text-blue-200 hover:bg-white/10 hover:text-white"
                )}
                style={isActive("/email-marketing") || isActive("/whatsapp-marketing") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}
              >
                <Mail className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">Marketing</span>
                {marketingExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>

              {marketingExpanded && (
                <div className="ml-3 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                  {/* Email Marketing */}
                  {canSee("email_marketing") && (
                    <Link href="/email-marketing" onClick={handleNavClick}>
                      <div className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs",
                        isActive("/email-marketing") ? "text-white font-semibold" : "text-blue-300 hover:bg-white/10 hover:text-white"
                      )}
                      style={isActive("/email-marketing") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}>
                        <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Email Marketing</span>
                      </div>
                    </Link>
                  )}
                  {/* WhatsApp Marketing */}
                  <Link href="/whatsapp-marketing" onClick={handleNavClick}>
                    <div className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs",
                      isActive("/whatsapp-marketing") ? "text-white font-semibold" : "text-blue-300 hover:bg-white/10 hover:text-white"
                    )}
                    style={isActive("/whatsapp-marketing") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}>
                      <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>WhatsApp Marketing</span>
                    </div>
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <>
              {canSee("email_marketing") && (
                <NavItem href="/email-marketing" label="Email" icon={Mail} location={location} sidebarOpen={false} onClick={handleNavClick} />
              )}
              <NavItem href="/whatsapp-marketing" label="WhatsApp" icon={MessageSquare} location={location} sidebarOpen={false} onClick={handleNavClick} />
            </>
          )}

          {/* ── CONFIGURAÇÕES (com submenu) ── */}
          {sidebarOpen ? (
            <div>
              <button
                onClick={() => setConfigExpanded(!configExpanded)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 w-full rounded-lg transition-all text-sm font-medium",
                  isActive("/metas") || isActive("/configuracoes") || isActive("/mensagem-diaria")
                    ? "text-white"
                    : "text-blue-200 hover:bg-white/10 hover:text-white"
                )}
                style={isActive("/metas") || isActive("/configuracoes") || isActive("/mensagem-diaria") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}
              >
                <Settings className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">Configurações</span>
                {configExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>

              {configExpanded && (
                <div className="ml-3 mt-1 space-y-0.5 border-l border-white/10 pl-2">
                  {/* Metas */}
                  <Link href="/metas" onClick={handleNavClick}>
                    <div className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs",
                      isActive("/metas") ? "text-white font-semibold" : "text-blue-300 hover:bg-white/10 hover:text-white"
                    )}
                    style={isActive("/metas") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}>
                      <Target className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Metas</span>
                    </div>
                  </Link>
                  {/* Mensagem Diária */}
                  <Link href="/mensagem-diaria" onClick={handleNavClick}>
                    <div className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs",
                      isActive("/mensagem-diaria") ? "text-white font-semibold" : "text-blue-300 hover:bg-white/10 hover:text-white"
                    )}
                    style={isActive("/mensagem-diaria") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}>
                      <Send className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Mensagem Diária</span>
                    </div>
                  </Link>
                  {/* Configurações */}
                  {canSee("configuracoes") && (
                    <Link href="/configuracoes" onClick={handleNavClick}>
                      <div className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs",
                        isActive("/configuracoes") ? "text-white font-semibold" : "text-blue-300 hover:bg-white/10 hover:text-white"
                      )}
                      style={isActive("/configuracoes") ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}>
                        <Settings className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Configurações</span>
                      </div>
                    </Link>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <NavItem href="/metas" label="Metas" icon={Target} location={location} sidebarOpen={false} onClick={handleNavClick} />
              <NavItem href="/mensagem-diaria" label="Msg" icon={Send} location={location} sidebarOpen={false} onClick={handleNavClick} />
              {canSee("configuracoes") && (
                <NavItem href="/configuracoes" label="Config" icon={Settings} location={location} sidebarOpen={false} onClick={handleNavClick} />
              )}
            </>
          )}

        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-white/10 space-y-2">
          {/* Usuário logado: exibe nome + botão Sair */}
          {isLoggedIn && sidebarOpen && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-blue-500/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-blue-200">{appUser?.nome?.charAt(0).toUpperCase()}</span>
                </div>
                <span className="text-[11px] text-blue-200 truncate">{appUser?.nome}</span>
              </div>
              <button
                onClick={() => appLogout()}
                className="p-1.5 rounded hover:bg-white/10 transition-colors flex-shrink-0"
                title="Sair"
              >
                <LogOut className="w-3.5 h-3.5 text-blue-300" />
              </button>
            </div>
          )}

          {/* Botão de Login (quando não está logado) */}
          {!isLoggedIn && sidebarOpen && (
            <Link href="/login" onClick={handleNavClick}>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-sm font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)" }}>
                <LogIn className="w-4 h-4 flex-shrink-0" />
                <span>Fazer Login</span>
              </div>
            </Link>
          )}

          {/* Botão de Logout destacado (quando logado) */}
          {isLoggedIn && sidebarOpen && (
            <button
              onClick={() => appLogout()}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-sm font-semibold text-white hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)" }}
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              <span>Sair do Sistema</span>
            </button>
          )}

          {/* Versão colapsada: ícone de login ou logout */}
          {!sidebarOpen && (
            isLoggedIn ? (
              <button
                onClick={() => appLogout()}
                className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-white/10 transition-colors"
                title="Sair do Sistema"
              >
                <LogOut className="w-4 h-4 text-red-400" />
              </button>
            ) : (
              <Link href="/login" onClick={handleNavClick}>
                <div className="flex items-center justify-center p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer" title="Fazer Login">
                  <LogIn className="w-4 h-4 text-blue-300" />
                </div>
              </Link>
            )
          )}

          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] text-blue-300">Sistema Ativo · {ano}</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header Mobile */}
        {isMobile && (
          <header className="flex items-center gap-3 px-4 py-3 border-b bg-white shadow-sm flex-shrink-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-xs"
                style={{ background: "linear-gradient(135deg, #1a2f5e, #4a7bc8)" }}
              >
                B
              </div>
              <span className="font-bold text-sm text-gray-800">Gestão Barcellos</span>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => {
                  const idx = ANOS_DISPONIVEIS.indexOf(ano);
                  if (idx > 0) setAno(ANOS_DISPONIVEIS[idx - 1]);
                }}
                className="p-1 rounded hover:bg-gray-100"
                disabled={ANOS_DISPONIVEIS.indexOf(ano) === 0}
              >
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <span className="text-sm font-bold text-gray-700 min-w-[40px] text-center">{ano}</span>
              <button
                onClick={() => {
                  const idx = ANOS_DISPONIVEIS.indexOf(ano);
                  if (idx < ANOS_DISPONIVEIS.length - 1) setAno(ANOS_DISPONIVEIS[idx + 1]);
                }}
                className="p-1 rounded hover:bg-gray-100"
                disabled={ANOS_DISPONIVEIS.indexOf(ano) === ANOS_DISPONIVEIS.length - 1}
              >
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </header>
        )}

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

// Componente auxiliar para item de nav simples
function NavItem({
  href, label, icon: Icon, location, sidebarOpen, onClick, badge, badgeSegundos
}: {
  href: string; label: string; icon: React.ElementType; location: string; sidebarOpen: boolean; onClick?: () => void; badge?: boolean; badgeSegundos?: number;
}) {
  const active = location === href;
  // Formata segundos como HH:MM:SS ou MM:SS se < 1h
  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };
  return (
    <Link href={href} onClick={onClick}>
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-sm font-medium relative",
          active ? "text-white shadow-md" : "text-blue-200 hover:bg-white/10 hover:text-white"
        )}
        style={active ? { background: "linear-gradient(90deg, #4a7bc8, #3d6bb5)" } : {}}
        title={!sidebarOpen ? (badge && badgeSegundos !== undefined ? `${label} — ${formatTime(badgeSegundos)}` : label) : undefined}
      >
        <div className="relative flex-shrink-0">
          <Icon className="w-4 h-4" />
          {badge && (
            <span
              className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-green-400 animate-pulse"
              title="Cronômetro ativo"
            />
          )}
        </div>
        {sidebarOpen && (
          <span className="flex items-center gap-2 flex-1 min-w-0">
            {label}
            {badge && (
              <span className="ml-auto text-[10px] font-mono font-bold text-green-400 tabular-nums" title="Tempo da tarefa em andamento">
                {badgeSegundos !== undefined ? formatTime(badgeSegundos) : '● ativo'}
              </span>
            )}
          </span>
        )}
      </div>
    </Link>
  );
}

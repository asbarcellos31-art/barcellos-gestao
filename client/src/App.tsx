import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import PermissaoGuard from "./components/PermissaoGuard";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AnoProvider } from "./contexts/AnoContext";
import Dashboard from "./pages/Dashboard";
import LancamentosMes from "./pages/LancamentosMes";
import TodosLancamentos from "./pages/TodosLancamentos";
import Comissoes from "./pages/Comissoes";
import Inadimplentes from "./pages/Inadimplentes";
import Clientes from "./pages/Clientes";
import Vendas from "./pages/Vendas";
import Sinistros from "./pages/Sinistros";
import CrmLeads from "./pages/CrmLeads";
import CrmBeneficiarios from "./pages/CrmBeneficiarios";
import ComissoesPendentes from "./pages/ComissoesPendentes";
import Financeiro from "./pages/Financeiro";
import Cancelados from "./pages/Cancelados";
import Configuracoes from "./pages/Configuracoes";
import DashboardFinanceiro from "./pages/DashboardFinanceiro";
import Login from "./pages/Login";
import ExtratoBancario from "./pages/ExtratoBancario";
import RelatorioExecutivo from "./pages/RelatorioExecutivo";
import RelatorioFinanceiro from "./pages/RelatorioFinanceiro";
import MensagemDiaria from "./pages/MensagemDiaria";
import Metas from "./pages/Metas";
import GestaoTempo from "./pages/GestaoTempo";
import EmailMarketing from "./pages/EmailMarketing";
import WhatsappMarketing from "./pages/WhatsappMarketing";
import Privacidade from "./pages/Privacidade";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Dashboard} />
      <Route path={"/dashboard"}>
        <PermissaoGuard modulo="dashboard"><Dashboard /></PermissaoGuard>
      </Route>
      <Route path={"/mes/:mes"}>
        {(params) => (
          <PermissaoGuard modulo="contas"><LancamentosMes /></PermissaoGuard>
        )}
      </Route>
      <Route path={"/todos"}>
        <PermissaoGuard modulo="contas"><TodosLancamentos /></PermissaoGuard>
      </Route>
      <Route path={"/dashboard-financeiro"}>
        <PermissaoGuard modulo="contas"><DashboardFinanceiro /></PermissaoGuard>
      </Route>
      <Route path={"/comissoes"}>
        <PermissaoGuard modulo="comissoes"><Comissoes /></PermissaoGuard>
      </Route>
      <Route path={"/inadimplentes"}>
        <PermissaoGuard modulo="inadimplentes"><Inadimplentes /></PermissaoGuard>
      </Route>
      <Route path={"/clientes"}>
        <PermissaoGuard modulo="clientes"><Clientes /></PermissaoGuard>
      </Route>
      <Route path={"/vendas"}>
        <PermissaoGuard modulo="vendas"><Vendas /></PermissaoGuard>
      </Route>
      <Route path={"/sinistros"}>
        <PermissaoGuard modulo="sinistros"><Sinistros /></PermissaoGuard>
      </Route>
      <Route path={"/crm-leads"}>
        <PermissaoGuard modulo="crm_leads"><CrmLeads /></PermissaoGuard>
      </Route>
      <Route path={"/crm-beneficiarios"}>
        <PermissaoGuard modulo="crm_beneficiarios"><CrmBeneficiarios /></PermissaoGuard>
      </Route>
      <Route path={"/comissoes-pendentes"}>
        <PermissaoGuard modulo="comissoes_pendentes"><ComissoesPendentes /></PermissaoGuard>
      </Route>
      <Route path={"/financeiro"}>
        <PermissaoGuard modulo="financeiro"><Financeiro /></PermissaoGuard>
      </Route>
      <Route path={"/cancelados"}>
        <PermissaoGuard modulo="cancelados"><Cancelados /></PermissaoGuard>
      </Route>
      <Route path={"/configuracoes"}>
        <PermissaoGuard modulo="configuracoes"><Configuracoes /></PermissaoGuard>
      </Route>
      <Route path={"/relatorio-executivo"} component={RelatorioExecutivo} />
      <Route path={"/relatorio-financeiro"} component={RelatorioFinanceiro} />
      <Route path={"/mensagem-diaria"} component={MensagemDiaria} />
      <Route path={"/metas"} component={Metas} />
      <Route path={"/gestao-tempo"} component={GestaoTempo} />
      <Route path={"/email-marketing"} component={EmailMarketing} />
      <Route path={"/whatsapp-marketing"} component={WhatsappMarketing} />
      <Route path={"/extrato-bancario"}>
        <PermissaoGuard modulo="financeiro"><ExtratoBancario /></PermissaoGuard>
      </Route>
      <Route path={"/privacidade"} component={Privacidade} />
      <Route path={"/login"} component={Login} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <AnoProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AnoProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

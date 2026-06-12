import { Layout } from "./components/layout";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RoleProvider } from "./contexts/RoleContext";
import NotFound from "@/pages/not-found";

import { Dashboard } from "./pages/Dashboard";
import { OnboardingList } from "./pages/OnboardingList";
import { OnboardingForm } from "./pages/OnboardingForm";
import { OnboardingDetail } from "./pages/OnboardingDetail";
import { OrdersList } from "./pages/OrdersList";
import { ComplianceRegister } from "./pages/ComplianceRegister";
import { SettlementList } from "./pages/SettlementList";
import { SettlementDetail } from "./pages/SettlementDetail";
import { PayoutList } from "./pages/PayoutList";
import { InvoiceRepository } from "./pages/InvoiceRepository";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/onboarding" component={OnboardingList} />
        <Route path="/onboarding/new" component={OnboardingForm} />
        <Route path="/onboarding/:id" component={OnboardingDetail} />
        <Route path="/orders" component={OrdersList} />
        <Route path="/compliance" component={ComplianceRegister} />
        <Route path="/settlements" component={SettlementList} />
        <Route path="/settlements/:id" component={SettlementDetail} />
        <Route path="/payouts" component={PayoutList} />
        <Route path="/invoices" component={InvoiceRepository} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RoleProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </RoleProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

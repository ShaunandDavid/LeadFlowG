import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/contexts/theme-context";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";

// Pages
import SignIn from "@/pages/sign-in";
import Dashboard from "@/pages/dashboard";
import Leads from "@/pages/leads";
import Sequences from "@/pages/sequences";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import Onboarding from "@/pages/onboarding";
import BookingPage from "@/pages/booking";
import SuppressionListPage from "@/pages/suppression-list";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component }: { component: () => JSX.Element }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" aria-label="Loading" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/sign-in" />;
  }

  return <Component />;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full">
      <AppSidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="flex items-center justify-between h-16 px-6 border-b border-border shrink-0">
          <SidebarTrigger data-testid="button-sidebar-toggle" />
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto px-6 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/sign-in" component={SignIn} />
      <Route path="/onboarding">
        {() => <ProtectedRoute component={Onboarding} />}
      </Route>
      <Route path="/dashboard">
        {() => (
          <ProtectedRoute
            component={() => (
              <AppLayout>
                <Dashboard />
              </AppLayout>
            )}
          />
        )}
      </Route>
      <Route path="/leads">
        {() => (
          <ProtectedRoute
            component={() => (
              <AppLayout>
                <Leads />
              </AppLayout>
            )}
          />
        )}
      </Route>
      <Route path="/sequences">
        {() => (
          <ProtectedRoute
            component={() => (
              <AppLayout>
                <Sequences />
              </AppLayout>
            )}
          />
        )}
      </Route>
      <Route path="/analytics">
        {() => (
          <ProtectedRoute
            component={() => (
              <AppLayout>
                <Analytics />
              </AppLayout>
            )}
          />
        )}
      </Route>
      <Route path="/settings">
        {() => (
          <ProtectedRoute
            component={() => (
              <AppLayout>
                <Settings />
              </AppLayout>
            )}
          />
        )}
      </Route>
      <Route path="/suppressions">
        {() => (
          <ProtectedRoute
            component={() => (
              <AppLayout>
                <SuppressionListPage />
              </AppLayout>
            )}
          />
        )}
      </Route>
      <Route path="/book/:tenantId/:leadId" component={BookingPage} />
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <SidebarProvider style={style as React.CSSProperties}>
              <Toaster />
              <Router />
            </SidebarProvider>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

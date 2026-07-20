import { lazy } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import PlannedModule from "./pages/PlannedModule";
import ProtectedRoute from "./components/ProtectedRoute";
import SuperuserRoute from "./components/SuperuserRoute";
import { DEFAULT_MODULE_PATH } from "./config/modules";

// Module pages are lazy-loaded so each dashboard's code (and its chart
// dependencies) is only fetched when the user navigates to it.
const DailyAnalysis = lazy(() => import("./pages/DailyAnalysis"));
const ProductionDashboard = lazy(() => import("./pages/ProductionDashboard"));
const ProjectsDashboard = lazy(() => import("./pages/ProjectsDashboard"));
const DistributionDashboard = lazy(() => import("./pages/DistributionDashboard"));
const SalesCustCare = lazy(() => import("./pages/SalesCustCare"));
const FinanceDashboard = lazy(() => import("./pages/FinanceDashboard"));
const IncidentReporting = lazy(() => import("./pages/IncidentReporting"));
const Reports = lazy(() => import("./pages/Reports"));
const DataEntry = lazy(() => import("./pages/DataEntry"));
const WaterBalanceSettings = lazy(() => import("./pages/WaterBalanceSettings"));
const UserManagement = lazy(() => import("./pages/UserManagement"));

// Shared query behavior for all modules. Individual hooks may still override
// (e.g. the production dashboard's 60s refetchInterval).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to={`/${DEFAULT_MODULE_PATH}`} replace />} />

            <Route path="daily" element={<DailyAnalysis />} />
            <Route path="production" element={<ProductionDashboard />} />
            <Route path="projects" element={<ProjectsDashboard />} />
            <Route path="distribution" element={<DistributionDashboard />} />
            <Route path="sales-custcare" element={<SalesCustCare />} />
            <Route path="revenue" element={<FinanceDashboard />} />
            <Route path="incidents" element={<IncidentReporting />} />
            <Route path="reports" element={<Reports />} />
            <Route
              path="users"
              element={
                <SuperuserRoute>
                  <UserManagement />
                </SuperuserRoute>
              }
            />
            <Route path="data" element={<DataEntry />} />
            <Route path="water-balance" element={<WaterBalanceSettings />} />

            <Route path="sanitation" element={<PlannedModule />} />
            <Route path="propoor" element={<PlannedModule />} />
            <Route path="billing" element={<PlannedModule />} />
            <Route path="accounts" element={<PlannedModule />} />
            <Route path="system-settings" element={<PlannedModule />} />
          </Route>

          <Route path="/home" element={<Navigate to="/" replace />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;

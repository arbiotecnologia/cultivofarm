import { lazy, Suspense, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LayoutDashboard, Activity, BarChart3 } from "lucide-react";
import VisaoGeral from "./VisaoGeral";

/**
 * Fase 3 — Dashboard unificado.
 *
 * Uma única entrada de menu com 3 rotas-filhas:
 *  - /dashboard/geral       → Visão Geral (composição resumida)
 *  - /dashboard/executivo   → Portal Executivo íntegro (reuso)
 *  - /dashboard/operacional → Painel Operacional íntegro (reuso)
 *
 * Regra 8: as visões Executiva/Operacional são carregadas sob demanda
 * (React.lazy). A troca de aba usa `navigate()` preservando search/hash
 * (regra 6). O estado interno de cada visão é preservado enquanto o
 * usuário permanece na rota-filha correspondente.
 *
 * Regra 15: drawers, filtros, relatórios, timelines e demais elementos
 * originais de Portal Executivo e Painel Operacional permanecem intactos
 * pois reutilizamos os componentes-página originais.
 */
const PortalExecutivoLazy = lazy(() => import("@/pages/executivo/PortalExecutivo"));
const PainelOperacionalLazy = lazy(() => import("@/pages/PainelOperacional"));

type View = "geral" | "executivo" | "operacional";

function viewFromPath(pathname: string): View {
  if (pathname.startsWith("/dashboard/executivo")) return "executivo";
  if (pathname.startsWith("/dashboard/operacional")) return "operacional";
  return "geral";
}

export default function DashboardUnificado() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();

  const view = useMemo(() => viewFromPath(pathname), [pathname]);

  const handleChange = (next: string) => {
    // Regra 6 — preservar query/hash na troca de aba.
    navigate(`/dashboard/${next}${search}${hash}`);
  };

  return (
    <div className="w-full">
      <Tabs value={view} onValueChange={handleChange} className="w-full">
        <div className="px-3 sm:px-4 md:px-6 pt-3">
          {/* Regra 19: rolagem horizontal no mobile evita overflow da página. */}
          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <TabsList className="w-max min-w-full sm:w-auto">
              <TabsTrigger value="geral" className="gap-1.5">
                <LayoutDashboard className="h-4 w-4" /> Visão Geral
              </TabsTrigger>
              <TabsTrigger value="executivo" className="gap-1.5">
                <BarChart3 className="h-4 w-4" /> Visão Executiva
              </TabsTrigger>
              <TabsTrigger value="operacional" className="gap-1.5">
                <Activity className="h-4 w-4" /> Visão Operacional
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="geral" className="mt-0" forceMount hidden={view !== "geral"}>
          {view === "geral" && <VisaoGeral />}
        </TabsContent>

        <TabsContent value="executivo" className="mt-0" forceMount hidden={view !== "executivo"}>
          {view === "executivo" && (
            <Suspense fallback={<TabFallback label="Carregando Visão Executiva..." />}>
              <PortalExecutivoLazy />
            </Suspense>
          )}
        </TabsContent>

        <TabsContent value="operacional" className="mt-0" forceMount hidden={view !== "operacional"}>
          {view === "operacional" && (
            <Suspense fallback={<TabFallback label="Carregando Visão Operacional..." />}>
              <PainelOperacionalLazy />
            </Suspense>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TabFallback({ label }: { label: string }) {
  return (
    <div className="p-6 text-sm text-muted-foreground animate-pulse">{label}</div>
  );
}

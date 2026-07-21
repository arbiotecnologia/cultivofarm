import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, RefreshCw, KeyRound, Users, ClipboardCheck, CalendarClock, Wallet } from "lucide-react";
import SyncTab from "./auditoria/SyncTab";
import SenhasTab from "./auditoria/SenhasTab";
import ClientesTab from "./auditoria/ClientesTab";
import VisitasTab from "./auditoria/VisitasTab";
import AgendaTab from "./auditoria/AgendaTab";
import AuditoriaFinanceira from "./financeiro/AuditoriaFinanceira";
import { useAuth } from "@/hooks/useAuth";

const FIN_ROLES = ["administrador", "gestor", "financeiro"];

const TABS = [
  { id: "sync", label: "Sync Offline", icon: RefreshCw, Component: SyncTab, roles: null as string[] | null },
  { id: "senhas", label: "Senhas", icon: KeyRound, Component: SenhasTab, roles: null },
  { id: "clientes", label: "Clientes", icon: Users, Component: ClientesTab, roles: null },
  { id: "visitas", label: "Visitas", icon: ClipboardCheck, Component: VisitasTab, roles: null },
  { id: "agenda", label: "Agenda", icon: CalendarClock, Component: AgendaTab, roles: null },
  { id: "financeiro", label: "Financeiro", icon: Wallet, Component: AuditoriaFinanceira, roles: FIN_ROLES },
];

export default function Auditoria() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useAuth();
  const visibleTabs = TABS.filter((t) => !t.roles || (role && t.roles.includes(role)));
  const active = visibleTabs.find((t) => t.id === searchParams.get("tab"))?.id || visibleTabs[0]?.id || "sync";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Central de Auditorias
          </h1>
          <p className="text-sm text-muted-foreground">
            Trilhas de auditoria do sistema centralizadas em um só lugar.
          </p>
        </div>
      </div>

      <Tabs
        value={active}
        onValueChange={(v) => {
          const next = new URLSearchParams(searchParams);
          next.set("tab", v);
          setSearchParams(next, { replace: true });
        }}
      >
        <TabsList className="flex flex-wrap h-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.id} value={t.id} className="gap-1 sm:gap-2 text-xs sm:text-sm">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {TABS.map(({ id, Component }) => (
          <TabsContent key={id} value={id} className="mt-4">
            <Component />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

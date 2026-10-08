import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { LogOut, User, Shield, Mail, Bell, ArrowLeftRight, Sprout, Store } from "lucide-react";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { useAvailableContexts } from "@/hooks/useAvailableContexts";
import { useSwitchPortal } from "@/hooks/useSwitchPortal";
import { getActivePortalContext, type ActivePortalContext } from "@/lib/activePortalContext";
import { getPortalDisplayLabel } from "@/lib/portalDisplayLabel";

export default function MobilePerfil() {
  const { profile, primaryRole, roles, signOut } = useAuth();
  const { isSupported, subscription, deliveryAvailable, unsubscribe, isLoading: isLoadingPush } = usePushSubscription();
  const { data: contexts } = useAvailableContexts();
  const switchPortal = useSwitchPortal();
  const canSwitch =
    !!contexts?.available_contexts?.includes("b2b") &&
    !!contexts?.available_contexts?.includes("technical");

  const activeCtx = getActivePortalContext();
  const derivedFromRole: ActivePortalContext | null =
    primaryRole === "cliente_produtor"
      ? "producer"
      : primaryRole === "parceiro_b2b" || primaryRole === "parceiro_b2b_tecnico"
        ? "b2b"
        : primaryRole
          ? "technical"
          : null;
  const effectiveCtx = activeCtx ?? derivedFromRole;

  // Rótulo unificado do papel/portal — respeita papel efetivo (aplicador,
  // consultor, produtor) e mantém usuário duplo em technical como Consultor.
  const displayRoleLabel = getPortalDisplayLabel({
    activeCtx: effectiveCtx,
    primaryRole,
    roles,
  });
  const portalLabel = displayRoleLabel;
  const PortalIcon = effectiveCtx === "b2b" ? Store : Sprout;

  const others: string[] = [];
  if (contexts?.has_b2b_access && effectiveCtx !== "b2b") others.push("Portal Parceiro B2B");
  if (contexts?.has_technical_access && effectiveCtx !== "technical") others.push("Portal Técnico");



  return (
    <div className="p-4 space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-foreground">Meu Perfil</h1>
        <Badge variant="secondary" className="gap-1">
          <PortalIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {portalLabel}
        </Badge>
      </div>


      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-lg">{profile?.nome || "Usuário"}</p>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {displayRoleLabel}
            </span>
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-center gap-3 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="text-foreground">{profile?.email || "—"}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="text-foreground">{displayRoleLabel}</span>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Notificações Push</p>
              <p className="text-[10px] text-muted-foreground">Notificações push indisponíveis no momento.</p>
            </div>
          </div>
          <Switch 
            checked={!!subscription} 
            onCheckedChange={(checked) => { if (!checked) void unsubscribe(); }}
            aria-label="Desativar inscrição push neste navegador"
            disabled={isLoadingPush || !isSupported || (!deliveryAvailable && !subscription)}
          />
        </div>
        {!isSupported && (
          <p className="text-[10px] text-destructive">Navegador não suporta push notifications.</p>
        )}
      </Card>

      {canSwitch && (
        <Button
          variant="outline"
          className="w-full h-12 text-base"
          onClick={() => switchPortal()}
        >
          <ArrowLeftRight className="h-5 w-5 mr-2" />
          Trocar de portal
        </Button>
      )}

      {others.length > 0 && (
        <Card className="p-4 space-y-2">
          <p className="text-sm font-medium">Outros acessos disponíveis</p>
          <ul className="text-xs text-muted-foreground space-y-1">
            {others.map((o) => (
              <li key={o}>• {o}</li>
            ))}
          </ul>
        </Card>
      )}

      <Button variant="destructive" className="w-full h-12 text-base" onClick={signOut}>
        <LogOut className="h-5 w-5 mr-2" />
        Sair
      </Button>

    </div>
  );
}

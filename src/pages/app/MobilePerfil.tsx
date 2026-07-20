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
            : "Parceiro B2B"
          : roleFallback;

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
              <p className="text-[10px] text-muted-foreground">Receber alertas no celular</p>
            </div>
          </div>
          <Switch 
            checked={!!subscription} 
            onCheckedChange={(checked) => checked ? subscribe() : unsubscribe()}
            disabled={isLoadingPush || !isSupported}
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

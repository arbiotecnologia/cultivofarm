import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { LogOut, User, Shield, Mail, Bell, ArrowLeftRight } from "lucide-react";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { ROLE_LABELS } from "@/lib/permissions";
import { useAvailableContexts } from "@/hooks/useAvailableContexts";
import { useSwitchPortal } from "@/hooks/useSwitchPortal";

export default function MobilePerfil() {
  const { profile, role, signOut } = useAuth();
  const { isSupported, subscription, subscribe, unsubscribe, isLoading: isLoadingPush } = usePushSubscription();
  const { data: contexts } = useAvailableContexts();
  const switchPortal = useSwitchPortal();
  const canSwitch =
    !!contexts?.available_contexts?.includes("b2b") &&
    !!contexts?.available_contexts?.includes("technical");

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold text-foreground">Meu Perfil</h1>

      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-lg">{profile?.nome || "Usuário"}</p>
            {role && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {ROLE_LABELS[role] || role}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-center gap-3 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="text-foreground">{profile?.email || "—"}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="text-foreground">{role ? ROLE_LABELS[role] || role : "—"}</span>
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

      <Button variant="destructive" className="w-full h-12 text-base" onClick={signOut}>
        <LogOut className="h-5 w-5 mr-2" />
        Sair
      </Button>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// Deliberate containment, not an environment flag that can enable delivery.
export const PUSH_DELIVERY_AVAILABLE = false;
const PUSH_WORKER_PATH = "/push-sw.js";

export function usePushSubscription() {
  const { user, profile, loading } = useAuth();
  const ready = !loading && !!user && profile?.user_id === user.id && profile?.ativo === true && !!profile.organization_id;
  const scope = ready ? `${user?.id}:${profile?.organization_id}` : "";
  const [local, setLocal] = useState<{ scope: string; subscription: PushSubscription | null }>({ scope: "", subscription: null });
  const [isLoading, setIsLoading] = useState(false);
  const isSupported = "serviceWorker" in navigator && "PushManager" in window;
  const subscription = scope && local.scope === scope ? local.subscription : null;

  useEffect(() => {
    let cancelled = false;
    setLocal({ scope: "", subscription: null });
    if (!scope || !isSupported) return;
    setIsLoading(true);
    // Inspect only: never register/update a worker or request permission on mount.
    void navigator.serviceWorker.getRegistration("/").then(async (registration) => {
      if (!registration) return null;
      const script = registration.active?.scriptURL;
      if (!script) return null;
      const url = new URL(script, window.location.origin);
      if (url.origin !== window.location.origin || url.pathname !== PUSH_WORKER_PATH) return null;
      return registration.pushManager.getSubscription();
    }).then((existing) => {
      if (!cancelled) setLocal({ scope, subscription: existing });
    }).catch(() => {
      if (!cancelled) setLocal({ scope, subscription: null });
    }).finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [scope, isSupported]);

  const subscribe = async () => {
    // No permission request, worker registration, subscription or server write.
    toast.error("Notificações push indisponíveis no momento.");
  };
  const unsubscribe = async () => {
    if (!subscription) return;
    try {
      const removed = await subscription.unsubscribe();
      if (!removed) throw new Error("LOCAL_UNSUBSCRIBE_FAILED");
      // Browser-local revocation only: ownership of an existing DB row is unproven.
      setLocal((current) => current.scope === scope ? { scope, subscription: null } : current);
      toast.success("Inscrição desativada neste navegador.");
    } catch {
      toast.error("Não foi possível desativar a inscrição neste navegador.");
    }
  };
  return { isSupported, subscription, permission: "default" as NotificationPermission, subscribe, unsubscribe,
    isLoading: ready && isLoading, deliveryAvailable: PUSH_DELIVERY_AVAILABLE, canUnsubscribe: !!subscription };
}

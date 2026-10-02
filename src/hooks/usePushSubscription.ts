import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const PUSH_WORKER_URL = "/push-sw.js";

async function getPushRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  const activeUrl = existing?.active?.scriptURL ?? existing?.waiting?.scriptURL ?? existing?.installing?.scriptURL ?? "";
  if (existing && activeUrl.endsWith(PUSH_WORKER_URL)) return existing;
  return navigator.serviceWorker.register(PUSH_WORKER_URL, { scope: "/" });
}

export function usePushSubscription() {
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSupport = async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window;
      setIsSupported(supported);
      if (supported) {
        setPermission(Notification.permission);
        const registration = await getPushRegistration();
        const sub = await registration.pushManager.getSubscription();
        setSubscription(sub);
      }
      setIsLoading(false);
    };
    checkSupport();
  }, []);

  const subscribe = async () => {
    if (!isSupported) {
      toast.error("Notificações push não são suportadas neste navegador.");
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        toast.error("Permissão de notificação negada.");
        return;
      }

      if (!VAPID_PUBLIC_KEY) {
        console.error("VITE_VAPID_PUBLIC_KEY não configurada");
        return;
      }

      const registration = await getPushRegistration();
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const { data: { user } } = await (supabase as any).auth.getUser();
      if (!user) return;

      const keys = sub.toJSON().keys;
      if (!keys || !keys.p256dh || !keys.auth) {
        throw new Error("Erro ao obter chaves da assinatura");
      }

      const { error } = await (supabase as any).from("push_subscriptions").upsert({
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: navigator.userAgent,
      } as any);

      if (error) throw error;

      setSubscription(sub);
      toast.success("Notificações push ativadas com sucesso!");
    } catch (error: any) {
      console.error("Erro ao assinar push:", error);
      toast.error("Erro ao ativar notificações: " + error.message);
    }
  };

  const unsubscribe = async () => {
    if (!subscription) return;
    try {
      await subscription.unsubscribe();
      await (supabase as any)
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", subscription.endpoint);
      setSubscription(null);
      toast.success("Notificações desativadas.");
    } catch (error: any) {
      toast.error("Erro ao desativar notificações.");
    }
  };

  return { isSupported, subscription, permission, subscribe, unsubscribe, isLoading };
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

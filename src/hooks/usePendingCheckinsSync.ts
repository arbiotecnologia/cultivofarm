import { useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  syncPendingCheckins,
  getPendingCheckins,
  type PendingCheckin,
} from "@/lib/offlineCheckinQueue";

export function usePendingCheckinsSync(registroId: string) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingCheckin[]>(() => getPendingCheckins(registroId));
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  const refresh = useCallback(() => {
    setPending(getPendingCheckins(registroId));
  }, [registroId]);

  const syncNow = useCallback(async (silent = false) => {
    if (isSyncing) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    setIsSyncing(true);
    try {
      const { synced } = await syncPendingCheckins();
      if (synced > 0) {
        if (!silent) toast.success(`${synced} check-in(s) sincronizado(s)`);
        queryClient.invalidateQueries({ queryKey: ["visita-checkins", registroId] });
      }
    } finally {
      setIsSyncing(false);
      refresh();
    }
  }, [isSyncing, queryClient, registroId, refresh]);

  useEffect(() => {
    refresh();
    // Try initial sync silently
    if (typeof navigator !== "undefined" && navigator.onLine) {
      syncNow(true);
    }

    const onOnline = () => {
      setIsOnline(true);
      syncNow(false);
    };
    const onOffline = () => setIsOnline(false);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "arbio:pending_checkins") refresh();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registroId]);

  return {
    pending,
    pendingCount: pending.length,
    isSyncing,
    isOnline,
    syncNow,
    refresh,
  };
}

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { inspectPublishedVersion } from "./registerSW";

const checkedSessionKeys = new Set<string>();

export function resetPwaUpdateControlForTests(): void {
  checkedSessionKeys.clear();
}

export function PwaUpdateControl() {
  const { user, session } = useAuth();
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      const previousUserId = previousUserIdRef.current;
      if (previousUserId) {
        for (const key of checkedSessionKeys) {
          if (key.startsWith(`${previousUserId}:`)) checkedSessionKeys.delete(key);
        }
      }
      previousUserIdRef.current = null;
      return;
    }
    previousUserIdRef.current = user.id;
    const sessionKey = `${user.id}:${session?.expires_at ?? "active"}`;
    if (checkedSessionKeys.has(sessionKey)) return;
    checkedSessionKeys.add(sessionKey);
    void inspectPublishedVersion(fetch, "login");
  }, [session?.expires_at, user]);
  return null;
}
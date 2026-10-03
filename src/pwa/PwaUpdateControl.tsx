import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { inspectPublishedVersion } from "./registerSW";

const checkedSessionKeys = new Set<string>();

export function resetPwaUpdateControlForTests(): void {
  checkedSessionKeys.clear();
}

export function PwaUpdateControl() {
  const { user, session } = useAuth();

  useEffect(() => {
    if (!user) return;
    const sessionKey = `${user.id}:${session?.expires_at ?? "active"}`;
    if (checkedSessionKeys.has(sessionKey)) return;
    checkedSessionKeys.add(sessionKey);
    void inspectPublishedVersion(fetch, "login");
  }, [session?.expires_at, user]);
  return null;
}
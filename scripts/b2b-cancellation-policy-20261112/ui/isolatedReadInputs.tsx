import { useEffect, useState } from "react";
function useInput<T>(key: string) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => { let active = true; void fetch("http://localhost:8098/input").then(r => r.json()).then(x => { if (active) setData(x[key]); }); return () => { active = false; }; }, [key]);
  return { data, isLoading: data === null };
}
export function usePedidoFormalHeader() { return useInput<Record<string, unknown>>("header"); }
export function usePartnerOrderItems() { const r = useInput<unknown[]>("items"); return { ...r, data: r.data ?? [] }; }
export function useAuth() { return { profile: null, role: null }; }
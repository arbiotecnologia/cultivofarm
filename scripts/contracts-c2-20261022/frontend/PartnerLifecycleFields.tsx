import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { EXTERNAL_CAPABILITIES, lifecycleQueryKey, submitLifecycle, type Capability, type LifecycleAction, type LifecycleClient, type LifecycleState } from "./partnerLifecycle";

const labels: Record<Capability, string> = { parceiro_b2b: "Gestor B2B", parceiro_b2b_tecnico: "Consultor técnico B2B", cliente_produtor: "Cliente/Produtor" };
// Mounted only in the existing canonical user/partner editor by the review patch.
export function PartnerLifecycleFields({ partnerId, userId }: { partnerId: string; userId: string }) {
  const fence = useStorageAccessScope("partner-user-lifecycle");
  const qc = useQueryClient();
  const scope = JSON.stringify([fence.scope, partnerId, userId]);
  const generation = useRef(scope); generation.current = scope;
  const lock = useRef<symbol | null>(null);
  const controller = useRef<AbortController | null>(null);
  const client = supabase as unknown as LifecycleClient;
  const [roles, setRoles] = useState<Capability[]>([]);
  const [expected, setExpected] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState("");
  const attempt = useRef<{ key: string; payload: string } | null>(null);
  const [ownedScope, setOwnedScope] = useState(scope);
  useEffect(() => {
    controller.current?.abort(); lock.current = null; attempt.current = null;
    setOwnedScope(scope);
    setExpected(null); setRoles([]); setReason(""); setBusy(false); setConflict(false); setMessage("");
    const predicate = (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === "partner-user-lifecycle" && q.queryKey[1] !== scope;
    void qc.cancelQueries({ predicate }); qc.removeQueries({ predicate });
    return () => { controller.current?.abort(); };
  }, [scope, qc]);
  const read = useQuery({ queryKey: lifecycleQueryKey(scope, partnerId, userId), enabled: fence.ready, retry: false,
    queryFn: async ({ signal }): Promise<LifecycleState> => {
      const current = fence.capture(); const started = scope;
      const { data, error } = await client.rpc("get_partner_user_lifecycle", { p_partner_id: partnerId, p_user_id: userId }).abortSignal(signal);
      if (signal.aborted || !current() || generation.current !== started) throw new Error("c2_context_changed");
      if (error || !data || typeof data !== "object" || Array.isArray(data)) throw new Error("c2_unavailable");
      const row = data as LifecycleState;
      if (!/^[a-f0-9]{32}$/.test(row.version) || !row.state || !Array.isArray(row.state.roles) ||
        row.state.roles.some(r => !EXTERNAL_CAPABILITIES.includes(r)) || !Array.isArray(row.history)) throw new Error("c2_unavailable");
      return row;
    } });
  useEffect(() => {
    if (!expected && ownedScope === scope && fence.ready && !read.isFetching && !read.isError && read.data) {
      setExpected(read.data.version); setRoles([...read.data.state.roles]);
    }
  }, [expected, ownedScope, scope, fence.ready, read.data, read.isFetching, read.isError]);
  async function refresh() {
    const started = scope; const current = fence.capture();
    const response = await read.refetch();
    if (!current() || generation.current !== started || response.isError || !response.data) return;
    setExpected(response.data.version); setRoles([...response.data.state.roles]); setConflict(false); attempt.current = null;
  }
  async function save(action: LifecycleAction) {
    if (lock.current || ownedScope !== scope || !fence.ready || !expected || read.isFetching || read.isError) return;
    const token = Symbol(); lock.current = token;
    const started = scope; const check = fence.capture();
    const current = () => check() && generation.current === started;
    const abort = new AbortController(); controller.current = abort;
    const selected = action === "unlink" || action === "reactivate" ? [...(read.data?.state.roles ?? [])] : [...roles];
    const payload = JSON.stringify([partnerId, userId, selected.sort(), action, expected, reason.trim()]);
    if (attempt.current?.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() };
    setBusy(true); setMessage("");
    try {
      await submitLifecycle(client, { partnerId, userId, roles: selected, action, expected, key: attempt.current.key, reason }, abort.signal, current);
      if (!current()) return;
      // Each reader has its own resource scope. Match actor scope, not a broad
      // global key; other portal activation stays closed until the next slice.
      await qc.invalidateQueries({ queryKey: lifecycleQueryKey(started, partnerId, userId) });
      if (!current()) return;
      setExpected(null); attempt.current = null; setMessage("Alteração confirmada.");
    } catch (e) {
      if (!current()) return;
      const error = e && typeof e === "object" ? e as { code?: string; message?: string } : {};
      if (error.code === "40001") { setConflict(true); setMessage("Os acessos mudaram. Atualize os dados antes de confirmar novamente."); }
      else setMessage("Não foi possível confirmar. Preserve a tentativa para verificar novamente.");
    } finally {
      if (lock.current === token) { lock.current = null; if (current()) setBusy(false); }
    }
  }
  if (!fence.ready || ownedScope !== scope) return null;
  if (read.isError) return <div role="alert">Não foi possível consultar os acessos.<Button variant="outline" onClick={() => void refresh()}>Atualizar dados</Button></div>;
  if (!read.data || read.isFetching) return <p role="status">Validando acessos…</p>;
  const disabled = busy || conflict || !expected;
  return <section className="space-y-3" aria-label="Acessos do parceiro">
    <fieldset disabled={disabled} className="flex flex-wrap gap-4">
      {EXTERNAL_CAPABILITIES.map(r => <label key={r} className="flex items-center gap-2"><Checkbox checked={roles.includes(r)} onCheckedChange={v => setRoles(old => v === true ? [...old, r] : old.filter(x => x !== r))} />{labels[r]}</label>)}
    </fieldset>
    <label className="block">Motivo<Input value={reason} maxLength={500} disabled={busy} onChange={e => setReason(e.target.value)} /></label>
    <div className="flex flex-wrap gap-2">
      <Button disabled={disabled} onClick={() => void save("assign")}>Confirmar perfis</Button>
      <Button variant="outline" disabled={disabled} onClick={() => void save("revoke_roles")}>Revogar perfis retirados</Button>
      <Button variant="outline" disabled={disabled || !read.data.state.link || !!read.data.state.link.revoked_at} onClick={() => void save("unlink")}>Desvincular parceiro</Button>
      <Button variant="outline" disabled={disabled || !read.data.state.link?.revoked_at} onClick={() => void save("reactivate")}>Reativar vínculo</Button>
      {conflict && <Button variant="outline" disabled={busy} onClick={() => void refresh()}>Atualizar dados</Button>}
    </div>
    {message && <p role="status">{message}</p>}
    <ol>{read.data.history.map((h, i) => <li key={`${h.at}:${i}`}>{h.at} — {h.action} — {h.reason}</li>)}</ol>
  </section>;
}
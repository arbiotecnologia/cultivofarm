import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { RPC, USER_ADMIN_REFINEMENT_INSTALLED, emailSchema, friendlyError } from "@/lib/configuracoes/userAdminRefinement";

const rpc = (name: string, args: Record<string, unknown> = {}) =>
  (supabase.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(name, args);

interface Pending { status: "pending" | "none"; op_id?: string; new_email?: string; accepted?: boolean }

/**
 * Do lado do TITULAR autenticado: (a) renova a sessão quando o servidor marca o JWT como desatualizado
 * (a autoridade antiga já é negada no servidor; isto só obtém um token novo); (b) sincroniza o e-mail
 * após confirmação oficial do Auth; (c) mostra o pedido pendente e permite aceitar via updateUser.
 */
export function HolderAccountGuardsInner({ userId }: { userId: string }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    (async () => {
      const st = await rpc(RPC.mySessionState);
      if (gen !== generation.current) return;
      if (!st.error && (st.data as { stale?: boolean } | null)?.stale === true) await supabase.auth.refreshSession();
      await rpc(RPC.myEmailSync);
      if (gen !== generation.current) return;
      const p = await rpc(RPC.myEmailPending);
      if (gen !== generation.current) return;
      setPending(p.error ? null : (p.data as Pending));
    })().catch(() => { /* leitura auxiliar; falha não altera nada */ });
    return () => { generation.current += 1; };
  }, [userId]);

  if (!pending || pending.status !== "pending" || !pending.op_id) return null;
  const canonical = emailSchema.safeParse(pending.new_email ?? "");
  if (!canonical.success) return null;

  const accept = async () => {
    if (busy) return; setBusy(true); setMsg(null);
    try {
      const a = await rpc(RPC.myEmailAccept, { p_op_id: pending.op_id });
      if (a.error) throw new Error(a.error.message);
      const server = (a.data as { new_email?: string }).new_email;
      if (server !== canonical.data) throw new Error("request_not_pending");
      // Fluxo oficial do Auth com a sessão do titular; a confirmação chega no(s) e-mail(s) pelo Auth.
      const { error } = await supabase.auth.updateUser({ email: server }, { emailRedirectTo: `${window.location.origin}/auth` });
      if (error) {
        // Saída segura: o servidor só libera se comprovar que o Auth não tem troca pendente para o endereço.
        const rel = await rpc(RPC.myEmailRelease, { p_op_id: pending.op_id }).catch(() => ({ data: null, error: { message: "release_failed" } }));
        const released = !rel.error && (rel.data as { released?: boolean } | null)?.released === true;
        setPending({ ...pending, accepted: !released });
        setMsg(released
          ? "Não foi possível enviar a confirmação. Nada foi alterado; você pode tentar de novo ou recusar."
          : "Não foi possível comprovar se a confirmação foi enviada. Verifique sua caixa de entrada; o pedido segue aguardando confirmação e não pode ser recusado.");
        return;
      }
      setPending({ ...pending, accepted: true });
      setMsg("Enviamos a confirmação pelo serviço de autenticação. A troca só vale depois que você confirmar pelo link recebido.");
    } catch (e) { setMsg(friendlyError((e as Error).message)); } finally { setBusy(false); }
  };
  const decline = async () => {
    if (busy) return; setBusy(true);
    const r = await rpc(RPC.myEmailDecline, { p_op_id: pending.op_id });
    setBusy(false);
    if (r.error) setMsg(friendlyError(r.error.message)); else setPending({ status: "none" });
  };
  return (
    <div role="region" aria-label="Alteração de e-mail pendente" className="fixed bottom-4 inset-x-4 sm:left-auto sm:w-96 z-50 border rounded-md bg-card text-card-foreground p-3 shadow-lg space-y-2">
      <p className="text-sm">A administração da sua empresa solicitou alterar seu e-mail de acesso para <strong className="break-all">{canonical.data}</strong>.</p>
      <p className="text-xs text-muted-foreground">Seu e-mail atual continua válido até você confirmar pelo link oficial.</p>
      {pending.accepted && <p className="text-xs text-muted-foreground">Você já aceitou. Confirme pelo link recebido; esta solicitação não pode mais ser recusada ou cancelada porque o link oficial não pode ser invalidado por aqui.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={accept}>{busy ? "Aguarde…" : "Aceitar e enviar confirmação"}</Button>
        {!pending.accepted && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={decline}>Recusar</Button>}
      </div>
      {msg && <p role="status" className="text-xs">{msg}</p>}
    </div>
  );
}

export function HolderAccountGuards() {
  const { user } = useAuth();
  if (!USER_ADMIN_REFINEMENT_INSTALLED || !user?.id) return null;
  return <HolderAccountGuardsInner key={user.id} userId={user.id} />;
}

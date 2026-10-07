import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Copy, EyeOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ConviteAdminEmpresa, MudancaEmailAdmin, useConvidarAdminEmpresa } from "@/hooks/usePlataformaSaaS";

type State = { status: string; last_sent_at?: string; next_attempt_at?: string; expires_at?: string; operation_status?: string };
const statuses: Record<string, string> = { invited: "Convite pendente", email_confirmation: "E-mail aguardando confirmação", active: "Ativo", temporary_password: "Senha provisória — troca obrigatória", suspended: "Acesso suspenso", expired: "Senha provisória expirada" };
const when = (v?: string | null) => v ? new Date(v).toLocaleString("pt-BR") : "—";

/** Seção interna do diálogo único; não cria ponto de entrada ou modal próprio. */
export function AdminAcessoSection({ convite, mudanca, convidar, operationLock, onBusyChange }: {
  convite: ConviteAdminEmpresa;
  mudanca: MudancaEmailAdmin | null;
  convidar: Pick<ReturnType<typeof useConvidarAdminEmpresa>, "mutate" | "isPending">;
  operationLock: MutableRefObject<boolean>;
  onBusyChange: (busy: boolean) => void;
}) {
  const cache = useQueryClient();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [action, setAction] = useState<"temporary_password" | "password_link" | "invite" | null>(null);
  const key = useRef<string | null>(null);
  const mounted = useRef(true);
  const inviteAmbiguous = convite.email_delivery_status === "ambiguous" || ["email_unknown_error", "email_send_ambiguous", "email_accept_persistence_failed", "email_timeout", "email_network_error", "email_send_crash", "email_delivery_setup_failed"].includes(convite.email_last_error_code ?? "");
  const ambiguous = action === "invite" ? inviteAmbiguous : state?.operation_status === "ambiguous";
  const load = async () => {
    setBusy(true); onBusyChange(true); setError(""); setState(null);
    try {
      const { data, error: failure } = await supabase.functions.invoke("platform-invite-org-admin", { body: { access_action: "state", invite_id: convite.id } });
      if (!mounted.current) return;
      if (failure || data?.error) setError("Não foi possível validar o acesso ou sua permissão.");
      else setState(data as State);
    } catch { if (mounted.current) setError("Não foi possível validar o acesso ou sua permissão."); }
    finally { if (mounted.current) { setBusy(false); onBusyChange(false); } }
  };
  useEffect(() => {
    mounted.current = true;
    if (convite.user_id) void load();
    return () => { mounted.current = false; };
    // O registro é fixo durante a abertura; a consulta só ocorre ao entrar em Acesso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const run = async () => {
    if (operationLock.current || !action || !confirmed || !state || busy) return;
    operationLock.current = true; setBusy(true); onBusyChange(true); setError(""); setNotice("");
    if (action === "invite") {
      try {
        convidar.mutate({ organizationId: convite.organization_id, nome: convite.nome, email: convite.email, cpf: convite.cpf_cnpj ?? "", telefone: convite.telefone ?? "", modo: convite.modo_acesso, responsavelPrincipal: convite.responsavel_principal, confirmAmbiguousEmailRetry: inviteAmbiguous }, {
          onSuccess: () => { setNotice("Novo convite aceito pelo servidor de e-mail. Nenhuma nova conta será criada."); setAction(null); setConfirmed(false); },
          onError: () => setError("Não foi possível concluir o convite. Confira o status antes de tentar novamente."),
          onSettled: () => { operationLock.current = false; void load(); },
        });
      } catch { operationLock.current = false; setBusy(false); onBusyChange(false); setError("Não foi possível concluir o convite. Confira o status antes de tentar novamente."); }
      return;
    }
    key.current ??= crypto.randomUUID();
    try {
      const result = await supabase.functions.invoke("platform-invite-org-admin", { body: { access_action: action, invite_id: convite.id, operation_id: key.current, confirm: true, confirm_ambiguous_email_retry: ambiguous && confirmed } });
      if (result.error || result.data?.error) {
        let message = result.data?.error;
        if (!message && result.error && "context" in result.error) {
          try { message = (await result.error.context.json()).error; } catch { /* sanitized fallback */ }
        }
        setError(typeof message === "string" ? message : "Não foi possível concluir. Verifique o estado antes de repetir.");
        return;
      }
      setPassword(typeof result.data?.senha_temporaria === "string" ? result.data.senha_temporaria : null);
      setNotice(result.data?.idempotent ? "Operação já registrada. Nenhuma senha será exibida novamente." : action === "temporary_password" ? "Senha provisória gerada; expira em 24 horas. O titular precisa definir sua senha pessoal." : "Mensagem aceita para envio. Nenhum link é exibido ao operador.");
      setAction(null); setConfirmed(false); key.current = null;
      await cache.invalidateQueries({ queryKey: ["plataforma"] });
      await load();
    } catch { setError("Não foi possível concluir. Verifique o estado antes de repetir."); }
    finally { operationLock.current = false; setBusy(false); onBusyChange(false); }
  };
  const nextAttempt = state?.next_attempt_at;
  const cooldown = !!nextAttempt && Date.parse(nextAttempt) > Date.now();
  const blocked = !state || state.status === "suspended" || cooldown || !!mudanca;
  const canResendInvite = !!convite.user_id && convite.modo_acesso === "link" && convite.status !== "ativo" && (convite.status === "falhou" || convite.status === "pendente" || inviteAmbiguous);
  const selectAction = (value: typeof action) => { if (operationLock.current) return; setAction(value); setConfirmed(false); key.current = null; };
  return <div className="space-y-4 [&_button]:min-h-11">
    {!convite.user_id && <p className="text-sm text-muted-foreground">Acesso ainda não provisionado. Confira o status antes de tentar novamente.</p>}
    {busy && <p role="status">Aguarde…</p>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {notice && <Alert><AlertDescription>{notice}</AlertDescription></Alert>}
    {state && <div className="space-y-1 text-sm"><p>{statuses[state.status] ?? "Estado indisponível"}</p><p>Último envio: {when(state.last_sent_at)}</p><p>Próximo reenvio: {when(nextAttempt)}</p>{state.expires_at && <p>Expiração: {when(state.expires_at)}</p>}{ambiguous && <p>A entrega anterior não foi confirmada. Verifique a caixa de entrada; reenviar pode duplicar a mensagem.</p>}</div>}
    {mudanca && <p className="text-sm text-muted-foreground">Há uma mudança de e-mail pendente. Reenvie ou verifique a confirmação na seção E-mail antes de alterar o acesso.</p>}
    {password ? <div className="space-y-3"><code className="block break-all rounded border p-3 select-all">{password}</code><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(password); } catch { setError("Não foi possível copiar a senha."); } }}><Copy className="mr-2 h-4 w-4" />Copiar senha</Button><Button variant="outline" onClick={() => setPassword(null)}><EyeOff className="mr-2 h-4 w-4" />Ocultar definitivamente</Button></div></div> : <div className="flex flex-col gap-2">
      {canResendInvite && <Button variant="outline" disabled={busy || blocked} onClick={() => selectAction("invite")}>Reenviar convite</Button>}
      <Button variant="outline" disabled={busy || blocked} onClick={() => selectAction("temporary_password")}>Gerar senha provisória</Button>
      <Button className="h-auto whitespace-normal py-3" disabled={busy || blocked} onClick={() => selectAction("password_link")}>Enviar link para definir/redefinir senha</Button>
    </div>}
    {action && <div className="space-y-3 border-t pt-3"><p className="text-sm">{action === "temporary_password" ? "Os acessos anteriores serão invalidados. A senha será exibida somente nesta operação, expira em 24 horas e a troca será obrigatória." : action === "invite" ? inviteAmbiguous ? "Confirme que verificou a caixa de entrada e não recebeu o convite. O reenvio pode gerar uma segunda mensagem se a entrega anterior tiver ocorrido." : "Será gerado um novo link de convite para este administrador. Use somente o convite mais recente. Nenhuma nova conta será criada." : "Será enviado um link seguro para o próprio titular definir ou redefinir sua senha."}</p><label className="flex min-h-11 items-start gap-2 text-sm"><Checkbox aria-label="Confirmo esta operação de acesso" checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} />{ambiguous ? "Verifiquei a caixa de entrada e autorizo o reenvio, ciente da possível duplicação." : "Confirmo esta operação de acesso."}</label><Button disabled={!confirmed || busy || blocked} onClick={() => void run()}>{action === "invite" ? "Confirmar reenvio do convite" : "Confirmar envio ou geração"}</Button></div>}
    <Button variant="ghost" disabled={busy || !convite.user_id} onClick={() => void load()}>Atualizar estado</Button>
  </div>;
}

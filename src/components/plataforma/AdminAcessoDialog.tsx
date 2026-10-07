import { useRef, useState } from "react";
import { KeyRound, Copy, EyeOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ConviteAdminEmpresa, MudancaEmailAdmin } from "@/hooks/usePlataformaSaaS";

type State = { status: string; last_sent_at?: string; next_attempt_at?: string; expires_at?: string };
const statuses: Record<string, string> = { invited: "Convite pendente", email_confirmation: "E-mail aguardando confirmação", active: "Ativo", temporary_password: "Senha provisória — troca obrigatória", suspended: "Acesso suspenso", expired: "Senha provisória expirada" };
const when = (v?: string) => v ? new Date(v).toLocaleString("pt-BR") : "—";

export function AdminAcessoDialog({ convite, mudanca }: { convite: ConviteAdminEmpresa; mudanca: MudancaEmailAdmin | null }) {
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [action, setAction] = useState<"temporary_password" | "password_link" | null>(null);
  const lock = useRef(false);
  const key = useRef<string | null>(null);
  const load = async () => {
    setBusy(true); setError("");
    const { data, error: failure } = await supabase.functions.invoke("platform-invite-org-admin", { body: { access_action: "state", invite_id: convite.id } });
    if (failure || data?.error) setError("Não foi possível validar o acesso ou sua permissão.");
    else setState(data as State);
    setBusy(false);
  };
  const run = async () => {
    if (lock.current || !action || !confirmed || !state) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    key.current ??= crypto.randomUUID();
    try {
      let result;
      if (action === "password_link" && mudanca) {
        result = await supabase.functions.invoke("platform-org-admin-email-change", { body: { action: "resend", invite_id: convite.id, new_email: mudanca.new_email, reason: mudanca.reason, idempotency_key: mudanca.idempotency_key, confirm: true } });
      } else result = await supabase.functions.invoke("platform-invite-org-admin", { body: { access_action: action, invite_id: convite.id, operation_id: key.current, confirm: true } });
      if (result.error || result.data?.error) {
        let message = result.data?.error;
        if (!message && result.error && "context" in result.error) {
          try { message = (await result.error.context.json()).error; } catch { /* sanitized fallback */ }
        }
        setError(typeof message === "string" ? message : "Não foi possível concluir. Verifique o estado antes de repetir.");
        return;
      }
      setPassword(typeof result.data?.senha_temporaria === "string" ? result.data.senha_temporaria : null);
      setNotice(action === "temporary_password" ? "Senha provisória gerada; expira em 24 horas. O titular precisa definir sua senha pessoal." : "Mensagem aceita para envio. Nenhum link é exibido ao operador.");
      setAction(null); setConfirmed(false); key.current = null;
      await cache.invalidateQueries({ queryKey: ["plataforma"] });
    } finally { lock.current = false; setBusy(false); }
  };
  const cooldown = !!state?.next_attempt_at && Date.parse(state.next_attempt_at) > Date.now();
  const blocked = !state || state.status === "suspended" || cooldown;
  return <>
    <Button size="sm" variant="outline" disabled={!convite.user_id || convite.status === "processando"} onClick={() => { setOpen(true); setState(null); setPassword(null); setNotice(""); setAction(null); setConfirmed(false); key.current = null; void load(); }}><KeyRound className="mr-2 h-4 w-4" />Gerenciar acesso</Button>
    <Dialog open={open} onOpenChange={v => { if (busy) return; setOpen(v); if (!v) { setPassword(null); key.current = null; } }}><DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
      <DialogHeader><DialogTitle>Gerenciar acesso</DialogTitle><DialogDescription>{convite.nome}</DialogDescription></DialogHeader>
      {busy && <p role="status">Aguarde…</p>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {notice && <Alert><AlertDescription>{notice}</AlertDescription></Alert>}
      {state && <div className="space-y-1 text-sm"><p>{mudanca ? "E-mail aguardando confirmação" : statuses[state.status] ?? "Estado indisponível"}</p><p>Último envio: {when(state.last_sent_at)}</p><p>Próximo reenvio: {when(state.next_attempt_at)}</p>{state.expires_at && <p>Expiração: {when(state.expires_at)}</p>}</div>}
      {password ? <div className="space-y-3"><code className="block break-all rounded border p-3 select-all">{password}</code><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(password); } catch { setError("Não foi possível copiar a senha."); } }}><Copy className="mr-2 h-4 w-4" />Copiar senha</Button><Button variant="outline" onClick={() => setPassword(null)}><EyeOff className="mr-2 h-4 w-4" />Ocultar definitivamente</Button></div></div> : <div className="flex flex-col gap-2">
        <Button variant="outline" disabled={busy || blocked || !!mudanca} onClick={() => { setAction("temporary_password"); setConfirmed(false); key.current = null; }}>Gerar senha provisória</Button>
        <Button disabled={busy || blocked} onClick={() => { setAction("password_link"); setConfirmed(false); key.current = null; }}>{mudanca ? "Reenviar confirmação de e-mail" : state?.status === "invited" ? "Reenviar convite" : "Enviar link para definir senha definitiva"}</Button>
      </div>}
      {action && <div className="space-y-3 border-t pt-3"><p className="text-sm">{action === "temporary_password" ? "Os acessos anteriores serão invalidados. A senha será exibida somente nesta operação, e a troca será obrigatória." : mudanca ? "Será enviada confirmação da mudança pendente aos endereços exigidos pelo Auth." : state?.status === "invited" ? "Será enviado um novo convite seguro ao titular, sem criar outra conta." : "Será enviado um link seguro para o próprio titular definir sua senha."}</p><label className="flex items-start gap-2 text-sm"><Checkbox checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} />Confirmo esta operação de acesso.</label><Button disabled={!confirmed || busy} onClick={() => void run()}>Confirmar envio ou geração</Button></div>}
      <Button variant="ghost" disabled={busy} onClick={() => void load()}>Atualizar estado</Button>
    </DialogContent></Dialog>
  </>;
}
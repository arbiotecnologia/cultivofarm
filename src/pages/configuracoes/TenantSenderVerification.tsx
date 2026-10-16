import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MailCheck, Power, PowerOff } from "lucide-react";
import { f4Message, type F4Request, type F4Result, type F4Status } from "@/lib/configuracoes/tenantSmtp";

type Props = { version: number; connectionReady: boolean; blocked: boolean; send: (input: F4Request) => Promise<F4Result> };

// Parent remounts this on identity/tenant/version change (key), dropping late responses and the typed code.
export default function TenantSenderVerification({ version, connectionReady, blocked, send }: Props) {
 const [status, setStatus] = useState<F4Status | null>(null);
 const [code, setCode] = useState("");
 const [message, setMessage] = useState("");
 const [busy, setBusy] = useState(false);
 const [confirmActive, setConfirmActive] = useState(false);
 const alive = useRef(true); const lock = useRef(false);
 const call = async (input: F4Request) => {
  if (lock.current) return null;
  lock.current = true; setBusy(true);
  try { const r = await send(input); return alive.current ? r : null; }
  catch { if (alive.current) setMessage(f4Message("SMTP_INTERNAL")); return null; }
  finally { lock.current = false; if (alive.current) setBusy(false); }
 };
 const refresh = async () => { const r = await call({ op: "status" }); if (r?.status) setStatus(r.status); else if (r) setMessage(f4Message(r.code)); };
 useEffect(() => { alive.current = true; void refresh(); return () => { alive.current = false; }; // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);
 const challenge = async () => {
  setMessage("");
  const r = await call({ op: "challenge", expected_version: version, idempotency_key: crypto.randomUUID() });
  if (!r) return; setMessage(f4Message(r.code)); await refresh();
 };
 const confirm = async () => {
  const typed = code; setCode(""); // clear before IO
  if (!/^[0-9]{8}$/.test(typed) || !status?.challenge) { setMessage("Digite os 8 dígitos recebidos."); return; }
  const r = await call({ op: "confirm", expected_version: version, challenge_id: status.challenge.id, code: typed });
  if (!r) return; setMessage(f4Message(r.code, r.attempts_left)); await refresh();
 };
 const activation = async (active: boolean) => {
  const r = await call({ op: "activation", expected_version: version, active, confirm: true });
  setConfirmActive(false);
  if (!r) return; if (r.status) { setStatus(r.status); setMessage(active ? "Email da empresa ativado. Envios automáticos continuam bloqueados nesta fase." : "Email da empresa pausado."); } else setMessage(f4Message(r.code));
 };
 const open = status?.challenge && (status.challenge.state === "sent" || status.challenge.state === "ambiguous");
 const disabled = blocked || busy;
 return <div className="mt-6 rounded-md border p-4" aria-labelledby="tenant-sender-title">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h3 id="tenant-sender-title" className="font-medium">Verificação do remetente</h3>
   <div className="flex flex-wrap gap-2">
    <Badge variant={status?.sender_verified ? "default" : "outline"}>{status?.sender_verified ? "Remetente verificado" : "Remetente não verificado"}</Badge>
    <Badge variant={status?.active ? "default" : "outline"}>{status?.active ? "Ativo" : "Inativo"}</Badge>
   </div>
  </div>
  <p className="mt-2 text-sm text-muted-foreground">Enviaremos um código para a caixa do email remetente. Só quem acessa essa caixa consegue concluir. Alterar a configuração exige nova verificação.</p>
  {message && <p role="status" className="mt-2 text-sm text-muted-foreground">{message}</p>}
  <div className="mt-3 flex flex-wrap items-end gap-3">
   <Button type="button" variant="outline" disabled={disabled || !connectionReady || status?.sender_verified === true} onClick={() => void challenge()}><MailCheck className="mr-2 h-4 w-4" />Enviar código ao remetente</Button>
   {open && <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); void confirm(); }} autoComplete="off">
    <div><Label htmlFor="tenant-sender-code">Código recebido</Label><Input id="tenant-sender-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} disabled={disabled} className="w-36" /></div>
    <Button type="submit" disabled={disabled || code.length !== 8}>Confirmar código</Button>
   </form>}
  </div>
  {!connectionReady && !status?.sender_verified && <p className="mt-2 text-xs text-muted-foreground">Teste a conexão desta versão antes de solicitar o código.</p>}
  <div className="mt-4 flex flex-wrap items-center gap-3">
   {status?.active
    ? <Button type="button" variant="outline" disabled={disabled} onClick={() => void activation(false)}><PowerOff className="mr-2 h-4 w-4" />Pausar email da empresa</Button>
    : <>
     <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmActive} disabled={disabled || !status?.sender_verified} onChange={e => setConfirmActive(e.target.checked)} />Confirmo a ativação desta configuração</label>
     <Button type="button" variant="outline" disabled={disabled || !status?.sender_verified || !confirmActive} onClick={() => void activation(true)}><Power className="mr-2 h-4 w-4" />Ativar email da empresa</Button>
    </>}
  </div>
 </div>;
}

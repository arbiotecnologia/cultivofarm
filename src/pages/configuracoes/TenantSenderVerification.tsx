import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MailCheck, PowerOff } from "lucide-react";
import { f4Message, type F4Request, type F4Result, type F4Status } from "@/lib/configuracoes/tenantSmtp";

type Props = { version: number; connectionReady: boolean; blocked: boolean; send: (input: F4Request) => Promise<F4Result> };

// F4a: sender mailbox possession only. Operational activation is unavailable until the worker contract exists.
// Every request captures a generation; any remount (StrictMode/identity/tenant) or prop change
// (version/blocked/connection) bumps it, so late responses are dropped and handlers re-check current props.
export default function TenantSenderVerification({ version, connectionReady, blocked, send }: Props) {
 const [status, setStatus] = useState<F4Status | null>(null);
 const [code, setCode] = useState("");
 const [message, setMessage] = useState("");
 const [busy, setBusy] = useState(false);
 const generation = useRef(0); const lock = useRef(false);
 const current = useRef({ version, connectionReady, blocked, send });
 current.current = { version, connectionReady, blocked, send };
 const call = async (input: F4Request): Promise<F4Result | null> => {
  if (lock.current || current.current.blocked) return null;
  const epoch = generation.current; lock.current = true; setBusy(true);
  try { const r = await current.current.send(input); return generation.current === epoch ? r : null; }
  catch { if (generation.current === epoch) setMessage(f4Message("SMTP_INTERNAL")); return null; }
  finally { if (generation.current === epoch) { lock.current = false; setBusy(false); } }
 };
 const refresh = async () => {
  const epoch = generation.current; const r = await call({ op: "status" });
  if (!r || generation.current !== epoch) return;
  if (r.status && r.status.version === current.current.version) setStatus(r.status); else setMessage(f4Message(r.status ? "SMTP_CONFLICT" : r.code));
 };
 useEffect(() => {
  generation.current += 1; lock.current = false; setBusy(false); setCode(""); setStatus(null); setMessage("");
  if (!blocked) void refresh();
  return () => { generation.current += 1; lock.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [version, blocked, connectionReady, send]);
 const challenge = async () => {
  if (!current.current.connectionReady) return;
  setMessage("");
  const epoch = generation.current;
  const r = await call({ op: "challenge", expected_version: current.current.version, idempotency_key: crypto.randomUUID() });
  if (!r || generation.current !== epoch) return; setMessage(f4Message(r.code)); await refresh();
 };
 const confirm = async () => {
  const typed = code; setCode(""); // clear before IO
  if (lock.current || current.current.blocked) return;
  if (!/^[0-9]{8}$/.test(typed) || !status?.challenge) { setMessage("Digite os 8 dígitos recebidos."); return; }
  const epoch = generation.current;
  const r = await call({ op: "confirm", expected_version: current.current.version, challenge_id: status.challenge.id, code: typed });
  if (!r || generation.current !== epoch) return; setMessage(f4Message(r.code, r.attempts_left)); await refresh();
 };
 const pause = async () => {
  const epoch = generation.current;
  const r = await call({ op: "activation", expected_version: current.current.version, active: false, confirm: true });
  if (!r || generation.current !== epoch) return;
  if (r.status) { setStatus(r.status); setMessage("Email da empresa pausado."); } else setMessage(f4Message(r.code));
 };
 const open = status?.challenge && (status.challenge.state === "sent" || status.challenge.state === "ambiguous");
 const disabled = blocked || busy;
 return <div className="mt-6 rounded-md border p-4" aria-labelledby="tenant-sender-title">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h3 id="tenant-sender-title" className="font-medium">Verificação do remetente</h3>
   <Badge variant={status?.sender_verified ? "default" : "outline"}>{status?.sender_verified ? "Remetente verificado" : "Remetente não verificado"}</Badge>
  </div>
  <p className="mt-2 text-sm text-muted-foreground">Enviaremos um código para a caixa do email remetente. Só quem acessa essa caixa consegue concluir. Isso confirma a caixa, não valida o domínio. Alterar a configuração exige nova verificação.</p>
  {status?.sender_verified && <p role="status" className="mt-2 text-sm">Remetente verificado; envio operacional ainda indisponível.</p>}
  {message && <p role="status" className="mt-2 text-sm text-muted-foreground">{message}</p>}
  <div className="mt-3 flex flex-wrap items-end gap-3">
   <Button type="button" variant="outline" disabled={disabled || !connectionReady || status?.sender_verified === true} onClick={() => void challenge()}><MailCheck className="mr-2 h-4 w-4" />Enviar código ao remetente</Button>
   {open && <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); void confirm(); }} autoComplete="off">
    <div><Label htmlFor="tenant-sender-code">Código recebido</Label><Input id="tenant-sender-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} disabled={disabled} className="w-36" /></div>
    <Button type="submit" disabled={disabled || code.length !== 8}>Confirmar código</Button>
   </form>}
  </div>
  {!connectionReady && !status?.sender_verified && <p className="mt-2 text-xs text-muted-foreground">Teste a conexão desta versão antes de solicitar o código.</p>}
  {status?.active && <div className="mt-4"><Button type="button" variant="outline" disabled={disabled} onClick={() => void pause()}><PowerOff className="mr-2 h-4 w-4" />Pausar email da empresa</Button></div>}
 </div>;
}

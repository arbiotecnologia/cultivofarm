import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { confirmationCapability, CONFIRM_CAPABILITY_RPC, dispatchConfirmation, type ConfirmationAttempt } from "@/lib/entregas/deliveryConfirmationFlow";
// Compatibility with the existing parent callback. Physical confirmation never requests billing.
export type ConfirmMode = "bill_now" | "bill_later" | "not_billable" | "physical";
interface Props { open: boolean; onClose: () => void; entrega: any | null; onConfirmed?: (mode: ConfirmMode, entregaId: string) => void }
export function ConfirmarEntregaDialog({ open, onClose, entrega, onConfirmed }: Props) {
 const { user, profile } = useAuth();
 const fence = useStorageAccessScope(`physical-confirm:${open}:${entrega?.id}`);
 const [read, setRead] = useState<{ scope: string; observed: string; status: string; os: string; proof: string } | null>(null);
 const [error, setError] = useState(""); const [busy,setBusy]=useState(false); const [uncertain,setUncertain]=useState(false);
 const [form,setForm]=useState({nome:"",cargo:"",documento:"",observacoes:""});
 const lock=useRef(false); const generation=useRef(0);
 const attempt=useRef<{ context: string; value: ConfirmationAttempt } | null>(null);
 const context=fence.scope;
 const available = read?.scope===context && fence.ready;
 const scope = { actor: user?.id ?? "", org: profile?.organization_id ?? "", entrega: entrega?.id ?? "" };
 useEffect(()=>{
  const gen=++generation.current; const current=fence.capture();
  setRead(null);setError("");setUncertain(attempt.current?.context===context);
  setForm({nome:entrega?.recebido_por_nome||entrega?.recebedor_nome||"",cargo:entrega?.recebido_por_cargo||"",documento:entrega?.recebido_por_documento||"",observacoes:entrega?.observacoes_confirmacao||""});
  if(!open||!entrega?.id||!fence.ready)return;
  void (async()=>{
   try {
    const {data,error}=await supabase.rpc(CONFIRM_CAPABILITY_RPC as any,{p_entrega:entrega.id} as any);
    if(gen!==generation.current||!current())return;
    const cap=!error&&confirmationCapability(data,scope);
    if(!cap){setError("Confirmação física indisponível. Nenhuma alteração foi enviada.");return;}
    setRead({scope:context,observed:cap.updated_at,status:cap.status,os:cap.os_id,proof:cap.comprovante_id});
   } catch {if(gen===generation.current&&current())setError("Não foi possível consultar a disponibilidade. Nenhuma alteração foi enviada.");}
  })();
 },[context,open,entrega?.id]);
 const submit=async()=>{
  if(lock.current||!available||!read||!form.nome.trim())return;
  const current=fence.capture(); if(!current())return;
  if(read.status==='entregue' && attempt.current?.context!==context){setError("Entrega já confirmada. Consulte o histórico.");return;}
  const target=scope.entrega;
  const retained=attempt.current?.context===context?attempt.current.value:null;
  const pending=retained??{scope:{...scope},roots:{os:read.os,proof:read.proof},args:{p_entrega:target,p_observed:read.observed,p_request_key:crypto.randomUUID(),p_recebedor:{...form,nome:form.nome.trim()}}};
  attempt.current={context,value:pending}; lock.current=true;setBusy(true);setError("");let sent=false;
  let timedOut=false; let settled=false; let timer: ReturnType<typeof setTimeout> | undefined;
  const alive=()=>current()&&!timedOut;
  const work=dispatchConfirmation((name,args)=>supabase.rpc(name as any,args as any) as any,pending,alive,()=>{sent=true;})
   .finally(()=>{settled=true;if(timedOut)lock.current=false;});
  try {
   await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{timedOut=true;reject(new Error("Tempo de resposta excedido. Resultado incerto; aguarde a conclusão antes de reconciliar."));},30000);})]);
   if(!current())return;
   attempt.current=null;setUncertain(false);
   toast({title:"Recebimento físico confirmado"});
   onConfirmed?.("physical",target);onClose();
  } catch(e:unknown){
   if(current()){setError(e instanceof Error?e.message:"Não foi possível confirmar.");setUncertain(sent);}
   if(!sent && !retained)attempt.current=null;
  } finally {if(timer)clearTimeout(timer);if(settled)lock.current=false;setBusy(false);}
 };
 if(!entrega)return null;
 return <Dialog open={open} onOpenChange={v=>{if(!v&&!busy)onClose();}}><DialogContent className="max-w-xl">
  <DialogHeader><DialogTitle>Confirmar entrega</DialogTitle><DialogDescription>Recebimento físico</DialogDescription></DialogHeader>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {!available&&!error&&<p role="status" className="text-sm text-muted-foreground">Consultando disponibilidade…</p>}
  <form onSubmit={e=>{e.preventDefault();void submit();}} className="space-y-3">
   <div><Label htmlFor="confirm-receiver">Recebido por *</Label><Input id="confirm-receiver" placeholder="Nome de quem recebeu na fazenda" value={form.nome} disabled={busy||uncertain} onChange={e=>setForm({...form,nome:e.target.value})}/></div>
   <div><Label htmlFor="confirm-position">Cargo</Label><Input id="confirm-position" value={form.cargo} disabled={busy||uncertain} onChange={e=>setForm({...form,cargo:e.target.value})}/></div>
   <div><Label htmlFor="confirm-document">Documento</Label><Input id="confirm-document" value={form.documento} disabled={busy||uncertain} onChange={e=>setForm({...form,documento:e.target.value})}/></div>
   <div><Label htmlFor="confirm-notes">Observações</Label><Textarea id="confirm-notes" value={form.observacoes} disabled={busy||uncertain} onChange={e=>setForm({...form,observacoes:e.target.value})}/></div>
   <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Fechar</Button><Button type="submit" disabled={busy||!available||!form.nome.trim()||entrega.status==='cancelada'}>{busy?"Confirmando…":uncertain?"Reconciliar mesma tentativa":"Confirmar entrega"}</Button></DialogFooter>
  </form>
 </DialogContent></Dialog>;
}

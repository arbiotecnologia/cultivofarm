import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, RotateCcw } from "lucide-react";
import { EMPTY_DRAFT, EMPTY_VIEW, saveSchema, safeSmtpMessage, tenantSmtpTransport, type SmtpDraft, type SmtpView, type TenantSmtpTransport } from "@/lib/configuracoes/tenantSmtp";

export default function TenantEmailSettings({ scope, transport=tenantSmtpTransport }: {scope:string;transport?:TenantSmtpTransport}) {
 const [view,setView]=useState<SmtpView>(EMPTY_VIEW);
 const [draft,setDraft]=useState<SmtpDraft>({...EMPTY_DRAFT});
 const [password,setPassword]=useState("");
 const [phase,setPhase]=useState<"loading"|"ready"|"saving"|"blocked"|"conflict">("loading");
 const [message,setMessage]=useState("");
 const [reload,setReload]=useState(0);
 const [errors,setErrors]=useState<Record<string,string>>({});
 const generation=useRef(0); const lock=useRef(false);
 useEffect(()=>{
  const epoch=++generation.current;lock.current=false;
  setPassword("");setDraft({...EMPTY_DRAFT});setView(EMPTY_VIEW);setErrors({});setMessage("");setPhase("loading");
  transport.load().then(data=>{if(generation.current!==epoch)return;setView(data);setDraft(data.config ?? {...EMPTY_DRAFT});setPhase("ready");})
   .catch(error=>{if(generation.current!==epoch)return;setMessage(safeSmtpMessage(error instanceof Error ? error.message : undefined));setPhase("blocked");});
  return ()=>{generation.current++;lock.current=false;};
 },[scope,transport,reload]);
 const field=(key:keyof SmtpDraft,value:string|number)=>setDraft(prev=>({...prev,[key]:value}));
 const save=async()=>{
  if(lock.current || phase!=="ready")return;
  const parsed=saveSchema.safeParse({expected_version:view.version,config:draft,...(password ? {password}: {})});
  if(!parsed.success){const next:Record<string,string>={};for(const issue of parsed.error.issues)next[String(issue.path.at(-1))]=issue.path[0]==="password" ? "Credencial inválida." : issue.message;setErrors(next);setPassword("");return;}
  if(!view.credential_configured && !password){setErrors({password:safeSmtpMessage("SMTP_CREDENTIAL_REQUIRED")});return;}
  lock.current=true;const epoch=generation.current;setPhase("saving");setErrors({});setMessage("");
  // Clear visible credential before asynchronous IO; never put it in a query/cache.
  setPassword("");
  try {const data=await transport.save(parsed.data);if(generation.current!==epoch)return;setView(data);setDraft(data.config ?? {...EMPTY_DRAFT});setMessage("Rascunho salvo. Remetente não verificado; envio bloqueado.");setPhase("ready");}
  catch(error){if(generation.current!==epoch)return;const code=error instanceof Error ? error.message : "SMTP_INTERNAL";setMessage(safeSmtpMessage(code));setPhase(code==="SMTP_CONFLICT" ? "conflict" : "blocked");}
  finally {if(generation.current===epoch)lock.current=false;}
 };
 const disabled=phase!=="ready";
 return <section className="mt-6 border-t pt-6" aria-labelledby="tenant-email-title">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="tenant-email-title" className="text-lg font-semibold">Email da empresa</h2><Badge variant="secondary">Envio bloqueado</Badge></div>
  <div className="my-3 flex flex-wrap gap-2"><Badge variant="outline">Rascunho</Badge><Badge variant="outline">Remetente não verificado</Badge></div>
  {phase==="loading" && <p role="status" className="text-sm text-muted-foreground">Carregando configuração…</p>}
  {message && <p role={phase==="ready" ? "status" : "alert"} className="mb-4 text-sm text-muted-foreground">{message}</p>}
  <form onSubmit={e=>{e.preventDefault();void save();}} className="grid gap-4 sm:grid-cols-2" autoComplete="off">
   <div className="min-w-0"><Label htmlFor="tenant-host">Host SMTP</Label><Input id="tenant-host" value={draft.host} onChange={e=>field("host",e.target.value)} disabled={disabled} maxLength={253} autoCapitalize="none" spellCheck={false}/>{errors.host && <p className="text-sm text-destructive">{errors.host}</p>}</div>
   <div><Label htmlFor="tenant-port">Porta</Label><Input id="tenant-port" type="number" min={1} max={65535} value={draft.port || ""} onChange={e=>field("port",Number(e.target.value))} disabled={disabled}/>{errors.port && <p className="text-sm text-destructive">{errors.port}</p>}</div>
   <div className="min-w-0"><Label htmlFor="tenant-tls">Criptografia</Label><Select value={draft.tls_mode} onValueChange={v=>field("tls_mode",v)} disabled={disabled}><SelectTrigger id="tenant-tls"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="implicit_tls">TLS implícito</SelectItem><SelectItem value="starttls_required">STARTTLS obrigatório</SelectItem></SelectContent></Select></div>
   <div className="min-w-0"><Label htmlFor="tenant-username">Usuário SMTP</Label><Input id="tenant-username" value={draft.username} onChange={e=>field("username",e.target.value)} disabled={disabled} maxLength={255} autoCapitalize="none"/>{errors.username && <p className="text-sm text-destructive">{errors.username}</p>}</div>
   <div className="min-w-0"><Label htmlFor="tenant-from">Email remetente</Label><Input id="tenant-from" type="email" value={draft.from_email} onChange={e=>field("from_email",e.target.value)} disabled={disabled} maxLength={255}/>{errors.from_email && <p className="text-sm text-destructive">{errors.from_email}</p>}</div>
   <div className="min-w-0"><Label htmlFor="tenant-name">Nome do remetente</Label><Input id="tenant-name" value={draft.from_name} onChange={e=>field("from_name",e.target.value)} disabled={disabled} maxLength={255}/>{errors.from_name && <p className="text-sm text-destructive">{errors.from_name}</p>}</div>
   <div className="min-w-0"><Label htmlFor="tenant-reply">Reply-to (opcional)</Label><Input id="tenant-reply" type="email" value={draft.reply_to} onChange={e=>field("reply_to",e.target.value)} disabled={disabled} maxLength={255}/>{errors.reply_to && <p className="text-sm text-destructive">{errors.reply_to}</p>}</div>
   <div className="min-w-0"><Label htmlFor="tenant-password">{view.credential_configured ? "Nova credencial (opcional)" : "Credencial SMTP"}</Label><Input id="tenant-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} disabled={disabled} autoComplete="new-password" maxLength={4096}/>{errors.password && <p className="text-sm text-destructive">{errors.password}</p>}{view.credential_configured && <p className="text-xs text-muted-foreground">Credencial cadastrada. O valor não está disponível para consulta.</p>}</div>
   <div className="sm:col-span-2 flex flex-wrap gap-2"><Button type="submit" disabled={disabled}><Save className="mr-2 h-4 w-4"/>{phase==="saving" ? "Salvando…" : "Salvar rascunho"}</Button><Button type="button" variant="outline" disabled={phase==="loading" || phase==="saving"} onClick={()=>setReload(v=>v+1)}><RotateCcw className="mr-2 h-4 w-4"/>Recarregar</Button></div>
  </form>
 </section>;
}

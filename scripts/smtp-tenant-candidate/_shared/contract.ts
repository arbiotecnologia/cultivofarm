import { z } from "zod";

const noControls = (v: string) => [...v].every(c => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127);
const singleLine = z.string().max(255).refine(noControls, "Não use caracteres de controle.");
export function draftHostAllowed(host: string): boolean {
  return host.length <= 253 && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)
    && !/(^|\.)(localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(host)
    && !/(^|\.)(metadata|metadata\.google\.internal)$/.test(host);
}
export const draftSchema = z.object({
  host: z.string().max(253).refine(draftHostAllowed, "Informe um domínio público, sem IP, URL ou destino local."),
  port: z.number().int().min(1).max(65535).refine(v => v !== 25, "Porta 25 não permitida nesta fase."),
  tls_mode: z.enum(["implicit_tls", "starttls_required"]),
  username: singleLine.pipe(z.string().min(1)),
  from_email: singleLine.pipe(z.string().email()),
  reply_to: singleLine.pipe(z.union([z.literal(""), z.string().email()])),
  from_name: singleLine.pipe(z.string().min(1)),
}).strict();
export type SmtpDraft = z.infer<typeof draftSchema>;
export const saveSchema = z.object({
  expected_version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  config: draftSchema,
  password: z.string().min(1).max(4096).refine(noControls).optional(),
}).strict();
export const viewSchema = z.object({
  ok: z.literal(true), version: z.number().int().min(0),
  config: draftSchema.nullable(), credential_configured: z.boolean(),
  state: z.literal("DRAFT"), sender_verified: z.literal(false), dispatch_enabled: z.literal(false),
}).strict();
export type SmtpView = z.infer<typeof viewSchema>;
export const EMPTY_DRAFT: SmtpDraft = {host:"",port:465,tls_mode:"implicit_tls",username:"",from_email:"",reply_to:"",from_name:""};
export const EMPTY_VIEW: SmtpView = {ok:true,version:0,config:null,credential_configured:false,state:"DRAFT",sender_verified:false,dispatch_enabled:false};
export const SMTP_MESSAGES: Record<string,string> = {
  SMTP_UNAVAILABLE: "Configuração por empresa aguardando implantação e revisão de segurança.",
  SMTP_FORBIDDEN: "Sem permissão para configurar o email desta empresa.",
  SMTP_UNAUTHORIZED: "Sessão expirada. Entre novamente.",
  SMTP_CONFLICT: "Outra alteração foi salva. Recarregue antes de tentar novamente.",
  SMTP_INVALID: "Revise os campos da configuração.",
  SMTP_CREDENTIAL_REQUIRED: "Informe a credencial para o primeiro rascunho.",
  SMTP_INTERNAL: "Não foi possível concluir a operação. Recarregue para verificar o estado.",
};
export function safeSmtpMessage(code: unknown): string {
  return typeof code === "string" ? SMTP_MESSAGES[code] ?? SMTP_MESSAGES.SMTP_INTERNAL : SMTP_MESSAGES.SMTP_INTERNAL;
}

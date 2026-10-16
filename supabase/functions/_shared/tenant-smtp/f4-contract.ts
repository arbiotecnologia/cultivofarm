import { z } from 'zod';
// F4 request surface. No tenant/host/recipient/credential fields accepted: all server-derived.
const version=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const f4RequestSchema=z.discriminatedUnion('op',[
 z.object({op:z.literal('status')}).strict(),
 z.object({op:z.literal('challenge'),expected_version:version,idempotency_key:z.string().uuid()}).strict(),
 z.object({op:z.literal('confirm'),expected_version:version,challenge_id:z.string().uuid(),code:z.string().regex(/^[0-9]{8}$/)}).strict(),
 // F4a: only the safe pause exists; operational activation awaits the worker contract.
 z.object({op:z.literal('activation'),expected_version:version,active:z.literal(false),confirm:z.literal(true)}).strict(),
]);
export type F4Request=z.infer<typeof f4RequestSchema>;
export const challengeStates=['claimed','executing','sent','ambiguous','failed','verified','invalidated','exhausted','expired'] as const;
export const f4StatusSchema=z.object({
 version:z.number().int().nonnegative(),sender_verified:z.boolean(),active:z.boolean(),dispatch_enabled:z.literal(false),
 challenge:z.object({id:z.string().uuid(),state:z.enum(challengeStates),expires_at:z.string().nullable(),attempts_left:z.number().int().min(0).max(5)}).strict().nullable(),
}).strict();
export type F4Status=z.infer<typeof f4StatusSchema>;
export const f4Codes=['F4_STATUS','challenge_sent','challenge_ambiguous','challenge_failed','SENDER_VERIFIED','SENDER_CHALLENGE_MISMATCH','SENDER_CHALLENGE_EXPIRED','SENDER_CHALLENGE_EXHAUSTED','SENDER_CHALLENGE_STALE','SENDER_CHALLENGE_INVALID',
 'SMTP_OPERATIONAL_NOT_READY','SMTP_UNAVAILABLE','SMTP_FORBIDDEN','SMTP_CONFLICT','SMTP_COOLDOWN','SMTP_QUOTA','SMTP_BUSY','SMTP_NOT_READY','SMTP_UNAUTHORIZED','SMTP_INVALID','SMTP_INTERNAL'] as const;
export type F4Code=typeof f4Codes[number];
export const f4ResultSchema=z.object({code:z.enum(f4Codes),status:f4StatusSchema.optional(),attempts_left:z.number().int().min(0).max(5).optional()}).strict();
export type F4Result=z.infer<typeof f4ResultSchema>;
export const CLAIM_ERRORS=['SMTP_OPERATIONAL_NOT_READY','SMTP_FORBIDDEN','SMTP_CONFLICT','SMTP_COOLDOWN','SMTP_QUOTA','SMTP_BUSY','SMTP_NOT_READY','SMTP_UNAVAILABLE','SMTP_INVALID'] as const;
export function mapRpcError(error:{code?:string;message?:string}|null|undefined):F4Code {
 const m=error?.message ?? '';
 if((CLAIM_ERRORS as readonly string[]).includes(m))return m as F4Code;
 return error?.code==='42501'?'SMTP_FORBIDDEN':'SMTP_INTERNAL';
}
export function f4Message(code:string,attemptsLeft?:number):string {
 switch(code){
  case 'challenge_sent':return 'Código enviado para a caixa do remetente. Válido por 15 minutos.';
  case 'challenge_ambiguous':return 'Envio do código incerto. Verifique a caixa do remetente; não reenvie imediatamente.';
  case 'challenge_failed':return 'Não foi possível enviar o código. Nenhuma verificação realizada.';
  case 'SENDER_VERIFIED':return 'Remetente verificado para esta versão da configuração.';
  case 'SENDER_CHALLENGE_MISMATCH':return `Código incorreto.${attemptsLeft!==undefined?` Tentativas restantes: ${attemptsLeft}.`:''}`;
  case 'SENDER_CHALLENGE_EXPIRED':return 'Código expirado. Solicite um novo código.';
  case 'SENDER_CHALLENGE_EXHAUSTED':return 'Tentativas esgotadas. Solicite um novo código.';
  case 'SENDER_CHALLENGE_STALE':return 'A configuração mudou. Solicite um novo código.';
  case 'SENDER_CHALLENGE_INVALID':return 'Código não está mais válido. Solicite um novo código.';
  case 'SMTP_OPERATIONAL_NOT_READY':return 'Remetente verificado; envio operacional ainda indisponível.';
  case 'SMTP_COOLDOWN':return 'Aguarde 60 segundos antes de solicitar outro código.';
  case 'SMTP_QUOTA':return 'Limite diário de códigos atingido. Tente amanhã.';
  case 'SMTP_BUSY':return 'Existe uma operação pendente. Não repita.';
  case 'SMTP_NOT_READY':return 'Teste primeiro a conexão da versão atual.';
  case 'SMTP_CONFLICT':return 'A configuração mudou. Recarregue.';
  case 'SMTP_UNAVAILABLE':return 'Verificação e ativação aguardando liberação.';
  default:return 'Não foi possível concluir. Recarregue para verificar o estado.';
 }
}

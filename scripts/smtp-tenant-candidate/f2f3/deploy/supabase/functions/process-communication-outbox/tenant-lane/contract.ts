import { z } from 'zod';
import { f4Codes, challengeStates } from '../../tenant-email-settings/f4/contract.ts';
// F4b request surface: identical to F4a except activation accepts true/false (still explicit confirm).
const version=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const f4bRequestSchema=z.discriminatedUnion('op',[
 z.object({op:z.literal('status')}).strict(),
 z.object({op:z.literal('challenge'),expected_version:version,idempotency_key:z.string().uuid()}).strict(),
 z.object({op:z.literal('confirm'),expected_version:version,challenge_id:z.string().uuid(),code:z.string().regex(/^[0-9]{8}$/)}).strict(),
 z.object({op:z.literal('activation'),expected_version:version,active:z.boolean(),confirm:z.literal(true)}).strict(),
]);
// dispatch_enabled becomes the server readiness (gates + active + verified + version), never client-derived.
export const f4bStatusSchema=z.object({
 version:z.number().int().nonnegative(),sender_verified:z.boolean(),active:z.boolean(),dispatch_enabled:z.boolean(),
 challenge:z.object({id:z.string().uuid(),state:z.enum(challengeStates),expires_at:z.string().nullable(),attempts_left:z.number().int().min(0).max(5)}).strict().nullable(),
}).strict();
export type F4bRequest=z.infer<typeof f4bRequestSchema>;
export type F4bStatus=z.infer<typeof f4bStatusSchema>;
export const f4bResultSchema=z.object({code:z.enum(f4Codes),status:f4bStatusSchema.optional(),attempts_left:z.number().int().min(0).max(5).optional()}).strict();
// Lane (worker) contract. Allowed contracts are a closed list; payload never carries tenant/recipient.
export const LANE_CONTRACTS=['solicitacao_atribuida_consultor_v1'] as const;
export const laneJobSchema=z.object({
 outbox_id:z.string().uuid(),fence:z.string().uuid(),version:z.number().int().positive(),
 recipient:z.string().email().max(255),subject:z.string().min(1).max(200),text:z.string().min(1).max(2000),
 config:z.object({host:z.string().min(1).max(253),port:z.literal(465),tls_mode:z.literal('implicit_tls'),username:z.string().min(1).max(320),
  from_email:z.string().email(),from_name:z.string().max(120).optional(),reply_to:z.string().max(320).optional()}).passthrough(),
 password:z.string().min(1).max(4096),
}).strict();
export const laneSkipSchema=z.union([z.null(),z.object({busy:z.literal(true)}).strict(),z.object({quota:z.literal(true)}).strict(),z.object({skipped:z.literal(true)}).strict()]);
export type LaneJob=z.infer<typeof laneJobSchema>;
export type LaneOutcome='sent'|'failed'|'ambiguous';

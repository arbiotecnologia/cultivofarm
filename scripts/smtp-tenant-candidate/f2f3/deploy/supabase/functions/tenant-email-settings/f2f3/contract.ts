import { z } from 'zod';
export const testRequestSchema = z.object({
  mode: z.enum(['connection', 'send']),
  expected_version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  idempotency_key: z.string().uuid(),
  confirm_send: z.literal(true).optional(),
}).strict().refine(v => v.mode !== 'send' || v.confirm_send === true);
export type TestRequest = z.infer<typeof testRequestSchema>;
export const resultCodes = ['smtp_connection_ok', 'smtp_send_accepted', 'smtp_send_ambiguous', 'smtp_test_failed', 'smtp_dns_blocked', 'smtp_tls_failed', 'SMTP_UNAVAILABLE', 'SMTP_FORBIDDEN', 'SMTP_CONFLICT', 'SMTP_COOLDOWN', 'SMTP_BUSY', 'SMTP_NOT_READY', 'SMTP_UNAUTHORIZED', 'SMTP_INVALID', 'SMTP_INTERNAL'] as const;
export const testResultSchema = z.object({
  code: z.enum(resultCodes), version: z.number().int().positive(),
  mode: z.enum(['connection', 'send']), dispatch_enabled: z.literal(false), sender_verified: z.literal(false),
}).strict();
export type TestResult = z.infer<typeof testResultSchema>;
export function testMessage(code: string): string {
  switch (code) {
    case 'smtp_connection_ok': return 'Conexão segura e autenticação confirmadas. Nenhum email enviado.';
    case 'smtp_send_accepted': return 'Servidor SMTP aceitou o teste. Isso não confirma entrega na caixa postal nem verifica o remetente.';
    case 'smtp_send_ambiguous': return 'Resultado incerto. Não reenvie: é necessária revisão humana.';
    case 'SMTP_COOLDOWN': return 'Aguarde antes de iniciar outro teste.';
    case 'SMTP_BUSY': return 'Existe um teste pendente. Não repita o envio.';
    case 'SMTP_NOT_READY': return 'Teste primeiro a conexão da versão atual.';
    case 'SMTP_CONFLICT': return 'A configuração mudou. Recarregue antes de testar.';
    case 'SMTP_UNAVAILABLE': return 'Testes aguardando homologação segura do ambiente.';
    default: return 'Não foi possível concluir o teste. Recarregue para verificar o estado.';
  }
}

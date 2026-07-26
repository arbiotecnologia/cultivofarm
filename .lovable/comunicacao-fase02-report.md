# Comunicação Fase 0.2 — Relatório da correção final

Status: **PACOTE DE MIGRATION PRONTO PARA APLICAÇÃO EM STAGING**.
Ambiente externo: **NÃO IMPLANTADO** — a migration/harness ainda não foram executados no banco de staging.

## Correções finais

1. **rpc_create_notificacao_operacional**
   - Removeu `pedido_b2b` e `esteira_producao` da RPC genérica por falta de vínculo comprovável no schema/callers atuais.
   - Exige identidade de usuário verificável; fluxos internos usam RPCs específicas.
   - Para `registros_consultor`, valida caller como participante real (`consultor_responsavel`, `created_by`, `finalized_by` ou `status_log.changed_by`) e resolve autorização por evento.

2. **rpc_create_portal_notification_secure**
   - Mantém `_source_type`/`_source_id` obrigatórios em par.
   - `ordem_servico`: sem responsável real no schema, apenas administrador.
   - `aplicacao`: somente administrador, `responsavel_id` ou `created_by`.
   - `registros_consultor`: participante real do registro ou administrador.

3. **rpc_record_aplicacao_email / enviar-pdf-aplicacao**
   - Sem bypass por `service_role` e sem override administrativo inseguro.
   - Destinatário aceito somente se cadastrado em `clientes.email` ou `clientes.contato_financeiro_email` do cliente da OS da aplicação.
   - Edge exige JWT de usuário, valida vínculo antes de gerar link e retorna erro se o registro RPC falhar.
   - Idempotência permite evolução atômica para `sent` sem retornar sucesso sem registro.

4. **Monitoramento vencido**
   - `ON CONFLICT DO NOTHING` evita inferência incorreta contra índice parcial.
   - Se reserva ocorrer sem notificação resolvida, a RPC lança exceção e reverte a transação.

5. **Dados legados e precheck**
   - Removidos deletes automáticos de deduplicação.
   - Precheck aborta ao detectar duplicatas que exigem saneamento/auditoria.

6. **Tipos e callers**
   - `src/integrations/supabase/types.ts` foi alinhado manualmente à migration proposta.
   - Removidos casts `(supabase.rpc as any)` das RPCs canônicas.
   - O runbook exige regenerar e comparar types após aplicação em staging.

## Validações locais

| Validação | Resultado |
| --- | --- |
| `rg` de casts/RPCs bloqueados | ✅ sem ocorrências bloqueantes |
| `bunx tsgo --noEmit` | ✅ verde |
| `bun run build` | ✅ verde, apenas warnings existentes de chunk/dynamic import/Browserslist |
| `bunx vitest run src/test/comunicacao/` | ✅ 6/6 testes |

## Escopo não implantado

- Banco, migrations oficiais e RLS em ambiente externo não foram acessados nem alterados.
- Envios reais continuam fora do escopo desta fase.

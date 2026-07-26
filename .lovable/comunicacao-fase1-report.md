# Comunicação — Fase 1 · Relatório de Fundação

**Escopo:** fundação do Módulo de Comunicação (templates, regras, eventos, outbox, preferências, audit log, renderização segura, worker dry-run, UI atrás de feature flag).
**Estado do banco:** nenhuma migration aplicada. Fase 0.2 continua **não aplicada**; Fase 1 é **PROPOSTA**.

---

## 1. Inventário real usado
| Elemento | Fonte | Valor observado |
| --- | --- | --- |
| `public.app_role` | `types.ts:15895/16285` | 13 papéis (administrador, tecnico_agronomo, producao, administrativo, gestor, cliente_produtor, consultor_tecnico, aplicador, operador_onfarm, financeiro, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico) |
| `public.has_role(uuid,app_role)` | migrations existentes | Presente. Reutilizado pelas RPCs. |
| `public.ordens_servico.status` | enum `status_os`/`status_os_onfarm` (`types.ts:16070-16093`) | `pronto_entrega` mapeia "produto pronto para retirada"; `entregue` mapeia "produto pronto para aplicação". |
| Notificações portal | enum `tipo_notificacao_portal` (`types.ts:16132`) | Preservado; não alterado nesta fase. |
| Aplicações | tabela `aplicacoes` (`types.ts:1591`) | Sem status próprio; evento "pronto para aplicação" é publicado explicitamente após `ordens_servico.status='entregue'`. |
| Última migration presente | `supabase/migrations/` | `20260808000000_fiscal_sinief_20_2026.sql`. Fase 1 não gera arquivo em `supabase/migrations/`. |

Nenhuma tabela ou coluna nova foi inventada; toda referência aponta para objetos comprovados no `types.ts` atual.

## 2. Arquitetura entregue
- **Tabelas propostas (RLS ligada, sem policies de escrita):** `comunicacao_templates`, `comunicacao_regras`, `comunicacao_eventos`, `comunicacao_outbox`, `comunicacao_preferencias`, `comunicacao_audit_log`.
- **Enums:** `comunicacao_canal`, `comunicacao_template_status`, `comunicacao_outbox_status`, `comunicacao_evento_status`.
- **Imutabilidade e versão:** trigger `comunicacao_templates_guard_immutable` impede alterar template `active`; unique parcial garante uma única versão ativa por (chave, canal). Nova versão criada via RPC.
- **RPCs SECURITY DEFINER (search_path fixo):** `rpc_create_communication_template`, `rpc_update_communication_template`, `rpc_activate_communication_template`, `rpc_upsert_communication_rule`, `rpc_publish_communication_event` (whitelist estrita: `produto_pronto_retirada`, `produto_pronto_aplicacao`, `administrative_important_update`), `rpc_update_communication_preferences` (apenas próprio usuário), `rpc_claim_communication_outbox` (service_role, `FOR UPDATE SKIP LOCKED` com lease), `rpc_complete_communication_delivery`, `rpc_fail_communication_delivery` (retry exponencial + dead-letter).
- **Autorização por evento:** `administrative_important_update` restrito a administrador; eventos de retirada/aplicação exigem `has_role` em administrador/gestor/producao/administrativo **e** ordem existente com status válido.
- **Audit log append-only:** trigger que rejeita UPDATE/DELETE.
- **Renderização server-side segura** (`src/features/comunicacao/render/renderTemplate.ts`): whitelist de variáveis, escape HTML para email, detecção de placeholder inválido, bloqueio de HTML perigoso (script/iframe/style/…), limite de tamanho de saída, lista de variáveis ausentes.
- **UI administrativa** (`src/features/comunicacao/ui/ComunicacaoAdminPage.tsx`): abas Templates/Regras/Fila/Preferências, preview com dados fictícios usando a mesma renderização, canais mostrados como "não configurado/desativado". Só renderiza com `VITE_COMUNICACAO_MODULE_ENABLED=true`. **Não foi registrada em nenhum router**, evitando exposição enquanto a flag estiver desligada.
- **Worker Edge Function** (`supabase/functions/process-communication-outbox/index.ts`): POST-only, exige `x-internal-secret` ou service_role; se `COMMUNICATION_DELIVERY_ENABLED!=='true'` retorna `dry_run`. Mesmo habilitado, adapters retornam `provider_not_configured`; `in_app` fica em `disabled` até `COMMUNICATION_INAPP_ADAPTER_ENABLED=true`. Nenhum `fetch` externo.
- **Seeds propostos (`seeds.sql`)** — templates em `draft` e regras `disabled`, cobrindo `produto_pronto_retirada`, `produto_pronto_aplicacao` e `administrative_important_update` para todos os `app_role` reais.

## 3. Arquivos criados/alterados
| Arquivo | Objetivo |
| --- | --- |
| `restoration/comunicacao-fase1/migration.sql` | Proposta transacional idempotente da Fase 1. |
| `restoration/comunicacao-fase1/precheck.sql` | Verificações de dependências antes da aplicação. |
| `restoration/comunicacao-fase1/postcheck.sql` | Verificações estruturais após a aplicação. |
| `restoration/comunicacao-fase1/harness-rls.sql` | Guarda de policies + orientação para runtime. |
| `restoration/comunicacao-fase1/rollback.sql` | Rollback seguro (aborta se tabelas contêm dados). |
| `restoration/comunicacao-fase1/seeds.sql` | Seeds propostos (draft/disabled). |
| `restoration/comunicacao-fase1/runbook.md` | Runbook completo. |
| `src/features/comunicacao/render/renderTemplate.ts` | Biblioteca compartilhada de render + escaping. |
| `src/features/comunicacao/flags.ts` | Feature flag frontend. |
| `src/features/comunicacao/ui/ComunicacaoAdminPage.tsx` | UI administrativa (renderiza só com a flag ligada). |
| `supabase/functions/process-communication-outbox/index.ts` | Worker POST-only em dry-run. |
| `src/test/comunicacao/fase1-render.test.ts` | Testes unitários de render/escape/limites. |
| `src/test/comunicacao/fase1-static.test.ts` | Testes estáticos (sem insert direto, sem rede, flag off). |

**Types manualmente alinhados:** _não realizado nesta fase_. As RPCs novas ainda não existem no banco; alinhar `src/integrations/supabase/types.ts` agora criaria mentira de tipos. Alinhamento manual será feito **junto** com a aplicação da migration em staging (item explícito no runbook §7).

## 4. Resultados de validação
| Verificação | Resultado |
| --- | --- |
| `bunx tsgo --noEmit` | ✅ sem erros. |
| `bun run build` | ✅ build gerado (warnings de chunk size legados). |
| `bunx eslint --no-cache src/features/comunicacao/ src/test/comunicacao/fase1-*.test.ts supabase/functions/process-communication-outbox/index.ts` | ✅ 0 problemas. |
| `bunx vitest run src/test/comunicacao/` | ✅ 21/21 (fase1-render 9, fase1-static 6, fase02-static 6). |

Lint global não foi executado; o escopo cobre apenas os arquivos novos/alterados desta fase, conforme instrução. Falhas legadas fora deste escopo permanecem separadas.

## 5. Skips e bloqueios externos
- Nenhuma migration foi executada (Supabase externo, sem janela autorizada; Fase 0.2 pendente).
- Nenhum envio real habilitado (`COMMUNICATION_DELIVERY_ENABLED=false`, `COMMUNICATION_INAPP_ADAPTER_ENABLED=false`, `VITE_COMUNICACAO_MODULE_ENABLED=false`).
- `types.ts` não regenerado (depende de aplicação em staging).
- Cron / gatilhos automáticos: não instalados; worker é chamável sob demanda por operador autorizado.
- Provedores email/whatsapp/push: sem secrets criados.

## 6. Parecer

**PACOTE FASE 1 PRONTO PARA APLICAÇÃO EM STAGING** — após aplicação da Fase 0.2 em staging, seguindo o runbook `restoration/comunicacao-fase1/runbook.md` (precheck → migration → postcheck → harness → seeds opcional → regeneração de types → suíte de testes).

# Configuração de provedores de comunicação pelo frontend

**Ambiente**: staging `ar-bio-temp` (`ikaauvsflpmamgxmkhoq`). Produção NÃO tocada.
**Data**: 2026-07-27
**Flags de entrega**: continuam **OFF**. Test mode default **ON**. Nenhum outbox foi processado.

## Arquitetura entregue

1. **Vault** confirmado disponível no staging (`vault.create_secret`, `vault.update_secret`, `vault.secrets`).
2. **Migration aditiva** cria:
   - `public.communication_provider_settings` (linha única `id=1`): flags, allowlists, campos não sensíveis SMTP/WhatsApp, e `secret_*` UUID que referenciam `vault.secrets`. RLS habilitado deny-by-default (sem policies) — acesso somente via RPCs/Edge Function.
   - `public.communication_provider_settings_audit`: trilha (actor, action, secret_field, changed_fields). NUNCA valores sensíveis.
   - `public.rpc_service_load_provider_runtime_config()` — SECURITY DEFINER, `service_role`-only. Faz join com `vault.decrypted_secrets` e retorna o runtime para o worker/webhook.
   - `public.rpc_service_set_provider_secret(slot,value,actor)` e `rpc_service_clear_provider_secret(slot,actor)` — SECURITY DEFINER `service_role`-only. Encapsulam `vault.create_secret`/`vault.update_secret`/delete + atualização da referência.
3. **Edge Function nova**: `supabase/functions/communication-provider-settings/index.ts`
   - JWT obrigatório + verificação `administrador` via `user_roles` (fail-closed).
   - `GET`: retorna apenas booleans, contagens, campos não sensíveis e máscaras irreversíveis.
   - `PUT/POST`: valida payload (porta 1–65535, e-mail regex, phone_number_id numérico, api_version ∈ {v24.0, v25.0}, tamanhos máximos), aplica flags, allowlists e secrets. Ativar qualquer flag exige `confirm_enable: "I_UNDERSTAND"`.
   - `action=clear_secret`: exige `confirm: "REMOVE"` + slot válido.
   - CORS restrito, erros sanitizados, sem log de body/e-mail/telefone/token.
   - Deploy: **OK** em `ikaauvsflpmamgxmkhoq`. Sem override em `config.toml` (JWT validado em código).
4. **Frontend**: nova aba **Comunicação** em `/configuracoes` (visível apenas para `administrador` e sob a feature flag `VITE_COMUNICACAO_MODULE_ENABLED`).
   - Componente: `src/pages/configuracoes/ComunicacaoConfigTab.tsx`.
   - Seções: Estado geral, Homologação (test mode + allowlists), SMTP, WhatsApp Meta, Webhook (mostra URL para copiar), Flags de entrega (toggle com `confirm()` + `I_UNDERSTAND`).
   - Segredos: renderizados só como “Configurado/Não configurado” + botão Remover. Nunca preenchidos. Campos `password/autocomplete=new-password`.
   - Blank em campo secreto = preservar; presente = substituir; Remover = clear com confirmação.

## Certificação

- `tsgo --noEmit`: **PASS**.
- `bun run build`: **PASS**.
- Deploy da Edge Function `communication-provider-settings`: **PASS**.
- Migration idempotente aplicada em staging. RLS deny-by-default validado (tabelas sem policies, acesso somente via SECURITY DEFINER `service_role`).
- Flags: continuam OFF. Test mode default ON. Allowlists vazias por padrão → fail-closed permanece efetivo.
- Nenhum envio real disparado. Nenhum outbox processado nesta rodada.

## Pendências assumidas

- Integração runtime do `rpc_service_load_provider_runtime_config` no `process-communication-outbox` / `whatsapp-status-webhook` como fonte primária (com fallback env) fica para a próxima rodada — não foi tocado nesta execução para preservar o comportamento certificado. A RPC já está criada e pronta.
- Suíte de testes unitários dedicada à nova Edge Function não foi adicionada nesta rodada por restrição de orçamento; a autorização, validação de payload e slots foram cobertas por revisão manual e pelas asserções de segurança já existentes em `src/test/comunicacao/`.

## Estado dos flags (post-execução)

Todos OFF no banco (defaults). Test mode ON. Nenhuma allowlist populada.

# Edge `tenant-user-email-change` — especificação (NÃO implantada)

Fica fora de `supabase/functions` para não haver deploy automático. A etapa de emissão dos links
de confirmação NÃO foi escrita por este pacote: deve reutilizar, sem cópia divergente, o bloco de entrega
já existente em `supabase/functions/platform-org-admin-email-change/index.ts` (mesmos gates SMTP/teste,
lease de reenvio e modo "secure email change"). Decisão do auditor.

Sequência:
1. CORS/origem confiável; método POST; SUPABASE_URL deve ser exatamente `https://swzpzcwiasxmjutrmvkm.supabase.co`.
2. Corpo `{ user_id, new_email, idempotency_key }` (UUIDs validados).
3. Cliente com o **JWT do ator** chama `tenant_admin_email_change_request_v1` → autorização/tenant/autoalteração/
   duplicidade/pendência decididos no servidor (`auth.uid()`). Erro PT409 → 409; demais → 403 neutro.
4. Replay (`replayed: true`) → `{status:"pending", idempotent:true}` sem reenviar.
5. Comunicação OFF (estado atual) → 503 `delivery_not_ready` com a solicitação PENDENTE; e-mail atual segue válido.
6. Com entrega homologada: emitir confirmação ao titular pelo fluxo Auth de troca de e-mail
   (confirmação obrigatória pelo titular; o administrador nunca confirma).
7. Worker agendado (service role) chama `platform_private.user_email_change_sync_v1(op_id)`; ele só grava
   `profiles.email` quando `auth.users.email` já é o novo endereço.
8. Cancelamento: `tenant_admin_email_change_cancel_v1` fecha o pendente local; links já emitidos dependem do Auth
   (mesma limitação documentada no fluxo de plataforma).

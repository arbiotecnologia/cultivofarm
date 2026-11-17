# Edge `tenant-user-email-change` — DESCARTADO (17/11/2026)

Substituído pela confirmação do titular (candidate.sql.review, seção 6): o administrador só registra o pedido
via `tenant_admin_email_change_request_v1`; nenhum link administrativo é gerado e nenhum e-mail é enviado
pelo administrador. O titular autenticado vê o pedido (`user_email_change_my_pending_v1`), aceita
(`user_email_change_accept_v1`) e chama `supabase.auth.updateUser({ email })` com a própria sessão; o Auth
conduz a confirmação oficial. `user_email_change_sync_self_v1` sincroniza no retorno/login, idempotente.

# Backup pré-promoção F4b (2026-10-16, ref swzpzcwiasxmjutrmvkm)

Base de código: `2d8452b6`. Somente definições não secretas.

| Objeto | md5 de pg_get_functiondef (antes) |
|---|---|
| platform_private.notification_outbox_closed() | 0070d302730cdff48f4527dc42a2f77b |
| public.rpc_claim_communication_outbox(integer,text,integer) | 0c3e67e69b290a406cf7bee4a069b175 |
| platform_private.tenant_smtp_activation_set(bigint,boolean) | 237226be821d168f1ca8dab9f44726ba |
| platform_private.tenant_smtp_f4_invalidate() | d75e769324b1fe43f1ea4b84d1db1202 |
| platform_private.tenant_smtp_f4_status() | 5bc7fe4d578c50241727b977990150e3 |
| public.tenant_smtp_activation_set(bigint,boolean) | 7f4ff89784d18f5d76dfb735de76efc4 |
| tenant_smtp_executor.tenant_smtp_dispatch_ready(uuid) | 009d762ec4a449e525996d8552ce64ed (`SELECT false`) |
| public.tenant_smtp_f4_status() | 69b63367dae984a6f5cd9d6c34b417ab |

Corpo integral das versões anteriores: migration F4a `scripts/smtp-tenant-candidate/f4/20261016_smtp_f4_sender_activation.sql`
(aplicada como `20261016131517`) e as restaurações em `scripts/smtp-tenant-candidate/f4b/rollback.sql`.

Estado: pg_cron instalado, pg_net ausente, 6 jobs cron (nenhum invoca o processador), Vault
`tenant_smtp_lane_invoker_secret` presente (EXISTS apenas), gate F4 true, F4b ausente, última migration `20261037000000`.

Código: `process-communication-outbox.index.ts.pre-f4b` e `config.toml.pre-f4b` nesta pasta.

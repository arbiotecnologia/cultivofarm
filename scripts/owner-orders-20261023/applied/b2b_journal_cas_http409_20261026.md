# b2b_journal_cas_http409_20261026 — aplicado externamente pelo auditor (NÃO REAPLICAR)

- Alvo: `platform_private.c2_recover_order_attempt_core(uuid,text,bigint,boolean,uuid)`, ref `swzpzcwiasxmjutrmvkm`.
- Causa: conflito CAS (`C2DJ_CAS_CONFLICT`) usava `ERRCODE='40001'`; PostgREST trata 40001 como
  serialization_failure e retenta indefinidamente → HTTP 504 ~125s e backends `authenticator` presos.
  Ref.: https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions
- Hotfix: pin `md5(prosrc)=81058861e8a72bc3b45401ba9893cb72`, contagem 1, substituição ÚNICA
  `ERRCODE='40001'` → `ERRCODE='PT409'`, assert de corpo exato pós, transação 20s; resultado informado `success=true`.
- Corpo esperado pós-hotfix (calculado localmente pela mesma substituição): `191fc04882f27eaa95df242c030a966c`.
  Igual ao corpo do candidate regenerado (`durable-attempt-20261026/expected.json`). Confirmação LIVE READ ONLY pendente do auditor.
- Rejeição CAS preservada (mesma condição, mesma mensagem); só muda SQLSTATE → HTTP 409 não retentável.
- Pacote conciliado: candidate/test-install/postflight/rollback/expected regenerados; rollback continua deny-only e nunca restaura 40001.

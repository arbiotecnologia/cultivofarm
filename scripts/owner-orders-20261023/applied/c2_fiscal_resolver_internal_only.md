# ACL fiscal implantada pelo proprietário — não reaplicar

Relato explícito de Renato S. Cunha em 23/10/2026 21:06 UTC:
`c2_fiscal_resolver_internal_only` já implantada no Supabase canônico
`swzpzcwiasxmjutrmvkm` pelo proprietário, não pelo agente.

- Assinatura: `public.fn_fiscal_requirement_resolve(text,text,text,text,uuid,date)`.
- EXECUTE limitado a `postgres` / `service_role`; corpo inalterado.
- MD5 do corpo capturado anteriormente: `8bb99a3c335b5f9876d99d988dcf94b0`.
- Nenhuma consulta hosted nova, aplicação ou validação JWT realizada nesta promoção frontend.
- Registro de evidência relatada, **não** cópia byte-exata da migration nem recibo de postflight coletado pelo agente.
- `fiscal/candidate.sql.review` e seu PRE de ACL anterior são históricos e não devem ser reaplicados.
- Rollback deve manter a contenção; nunca restaurar EXECUTE para authenticated/PUBLIC/anon.
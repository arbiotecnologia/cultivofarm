# Eligibility financeira — estado atual consultado, não reaplicar ACL

## Implantação independente confirmada pelo proprietário — 23/10/2026 22:54 UTC
Codex implantou `c2_billing_eligibility_internal_only` no projeto canônico, segundo relato independente: somente REVOKE EXECUTE da função de PUBLIC/anon/authenticated. Corpo MD5 `db977875e15ea49ce10fb3e5388d7dfb` INALTERADO, postgres/service_role preservados; preflight guard e postflight PASS. Único SQL caller gerador postgres SECURITY DEFINER. Registro de implantação relatada, não cópia byte-exata da migration nem execução pelo agente. Não reaplicar esse recorte ou reintroduzir ACL histórica em candidato v4/rollback.

Consulta READ ONLY22:52–22:53 UTC em23/10/2026 no Supabase canônico `swzpzcwiasxmjutrmvkm`:
- `public.fn_b2b_order_billing_eligibility(uuid)`: DEFINER, owner postgres.
- Corpo MD5 `db977875e15ea49ce10fb3e5388d7dfb`.
- ACL atual `{postgres=X/postgres,service_role=X/postgres}`.
- Privilégio efetivo authenticated=false, anon=false, service_role=true.
- Busca textual `pg_proc.prosrc` em todos schemas: único caller direto `public.generate_b2b_receivable_secure_impl(uuid)`, DEFINER/postgres, ACL postgres/service_role, corpo baseline MD5 `60be0fb336ca1537c063a001a213f7af`.

O relato anterior authenticated=true NÃO corresponde à consulta atual. À hora da consulta não havia identificação da migration; a confirmação independente acima agora identifica o recorte e Codex como executor. Nenhuma escrita/implantação foi executada pelo agente. Snapshot de corpo existente em `baseline-p1/public.fn_b2b_order_billing_eligibility.sql`.

Preservar internal-only como dependência imutável em PRE/candidato/POST/rollback (`billing-eligibility-invariant.sql`); não reaplicar grant/revoke, não criar wrapper sem cliente direto. Fiscal resolver permanece intocado.

Busca textual não certifica chamadas dinâmicas construídas com fragmentos, aplicações fora do repo ou autorização de todo call graph transitivo; testes locais e o estado de ACL não equivalem a JWT/API real deste endpoint. Writer continua fechado.
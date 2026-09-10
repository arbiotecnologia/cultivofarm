# P0b — As 2 views SECURITY DEFINER com advisor ERROR em produção

## Como foram identificadas sem consultar produção

Análise estática determinística: das **13** views `public.` criadas por
migrations com version **≤ `20260723000000`** (corte do ledger de produção),
apenas **3** não recebem `security_invoker = true` até esse corte:

| View | Corrigida por migration pós-corte? |
|---|---|
| `public.vw_esteira_laboratorio` | **sim** — `20260904130615_h7n_p0_security_invoker.sql` |
| `public.vw_fluxo_visita_tecnica` | **sim** — `20260904130615_h7n_p0_security_invoker.sql` |
| `public._src_vw_esteira_laboratorio` | **não** — nenhuma migration a corrige |

As duas com advisor ERROR em produção são, portanto,
**`public.vw_esteira_laboratorio`** e **`public.vw_fluxo_visita_tecnica`**.
`_src_vw_esteira_laboratorio` é objeto interno de origem da matview; deve ser
confirmado em precheck e, se existir e for exposto na Data API, tratado no mesmo
forward. Enquanto não confirmado, fica como pendência menor documentada.

## Correção

A correção **já existe no pacote**: `20260904130615_h7n_p0_security_invoker.sql`,
reafirmada por `20260930030000_h7o_p4_reafirmar_security_invoker_views_v1.sql`.
Não é preciso escrever SQL novo — basta garantir que essa version entre na onda
**P1 (fundações)**, antes de qualquer onda que dependa das views.

## Precheck (somente leitura)

```sql
SELECT c.relname,
       coalesce((SELECT option_value FROM pg_options_to_table(c.reloptions)
                 WHERE option_name = 'security_invoker'), 'false') AS security_invoker
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
  AND c.relname IN ('vw_esteira_laboratorio','vw_fluxo_visita_tecnica','_src_vw_esteira_laboratorio');
```

Esperado antes: `false`. Se já vier `true`, a migration é no-op e segue.

## Postcheck

```sql
-- as duas views devem ficar security_invoker = true
-- e nenhum advisor ERROR de security_definer_view deve restar
```
Rodar novamente o advisor de segurança em produção após a onda P1 e exigir
**zero** ERROR de `security_definer_view`.

## ACL

Não ampliar `GRANT`. Com `security_invoker = true` a view passa a respeitar a
RLS das tabelas base; qualquer papel que perca visibilidade a perde
**corretamente**. Se algum consumo legítimo quebrar, corrigir por policy na
tabela base, nunca revertendo para `security definer`.

## Rollback

`ALTER VIEW … SET (security_invoker = false)`. Registrado apenas para
completude: reverter reintroduz a vulnerabilidade e exige autorização humana
explícita.


## Adendo P0c — confirmação pelo advisor de produção

O Security Advisor de produção confirma **exatamente 2** ERROR
`security_definer_view`: `public.vw_esteira_laboratorio` e
`public.vw_fluxo_visita_tecnica`, ambos corrigidos por `20260904130615` dentro
do pacote. A terceira candidata estática, `public._src_vw_esteira_laboratorio`,
não aparece no advisor; permanece como verificação de precheck da onda e, se
existir com `SECURITY DEFINER`, exige decisão antes de prosseguir.

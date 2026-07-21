# Fase Fiscal 3.0 — Regeneração de `src/integrations/supabase/types.ts`

## Status
**AGUARDANDO TYPES GERADOS EXTERNAMENTE.** Nenhum `as any` novo, nenhum `@ts-ignore`, nenhum tipo manual divergente foi introduzido nesta fase.

## Por que não é gerado no sandbox
`supabase gen types` requer `SUPABASE_ACCESS_TOKEN` (personal access token) autenticado. O responsável decidiu **não fornecer** esse token ao sandbox nem ao Lovable. A geração ocorrerá externamente e o arquivo resultante será commitado depois.

## Comando de referência (executar fora do sandbox)

```sh
# Pré-requisito: Supabase CLI logada externamente (`supabase login`), sem
# gravar o token em nenhum arquivo do repositório.
npx supabase gen types typescript \
  --project-id navfzbwgwzruipouyfnk \
  --schema public \
  > src/integrations/supabase/types.ts
```

Alternativa manual: Dashboard → Settings → API → *Generate TypeScript types*.

## Checklist de validação pós-geração

1. Diff visual do arquivo — só deve haver adições fiscais (`fiscal_*`, `product_fiscal_profiles`, `service_fiscal_profiles`, `customer_fiscal_profiles`, `company_fiscal_settings`, views `v_fiscal_*`, RPC `rpc_fiscal_event_manual`, função `mask_sensitive_jsonb`).
2. `bun run typecheck` — verde.
3. `bun run build` — verde.
4. `bunx vitest run` — verde.
5. `bunx tsx scripts/verify-fiscal-types.ts` — deve reportar `OK` com todas as entidades esperadas.
6. Buscar novas ocorrências de `as any` nos diffs — nenhuma nova deve aparecer motivada pela regeneração.
7. Rodar `scripts/fiscal-security-scan.sh` — verde.

## Como falhar cedo se algo estiver faltando
O script `scripts/verify-fiscal-types.ts` faz uma checagem estática de whitelist. Se o arquivo regenerado não contiver as entidades fiscais esperadas, ele sai com exit 1 e mensagem clara.

## Regras
- Não editar `types.ts` manualmente para "consertar" divergências.
- Não introduzir `as any` como paliativo.
- Não commitar `SUPABASE_ACCESS_TOKEN` em nenhum lugar.

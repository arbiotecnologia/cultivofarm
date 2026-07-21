# Fase Fiscal 3.0.2-A.1 — Validação real e correção de referências

## A. Classificação
Subfase corretiva/validação SQL. Nenhuma emissão, provedor, token ou
certificado. Migrations aplicadas (`20260721000000`, `20260721010000`)
intocadas. Parte B **não** iniciada.

## B. Migration inédita
`20260722000000_fiscal_fase3_0_1_integridade.sql` **nunca aplicada**
(nem no projeto real `navfzbwgwzruipouyfnk` nem em staging). Arquivo
podia ser corrigido antes da primeira aplicação; timestamp preservado.

## C. Nome real da tabela de produtos
`public.produtos` (PK `id uuid`). Criada em
`20260314022647_...sql`. Não existe `public.products`.

## D. Colunas reais de `fiscal_invoices` (criação em `20260520203636_...`)
`id uuid PK`, `receivable_id uuid → accounts_receivable(id)`,
`delivery_id uuid → entregas(id)`, `invoice_type`, `invoice_number`,
`series`, `access_key`, `issue_date`, `total_amount`, `status`,
`xml_document_id`, `danfe_document_id`, `notes`, `created_by`,
`created_at`, `updated_at`. **Não possui `customer_id`.**
Colunas adicionadas por 2.0 (fase2 fundação) já inventariadas em
`docs/fiscal-fase3-0-1-inventario.md`.

## E. Relação real nota fiscal → cliente
Indireta, por duas rotas:
- `fiscal_invoices.receivable_id → accounts_receivable.customer_id → clientes.id`
- `fiscal_invoices.delivery_id  → entregas.cliente_id  → clientes.id`

Vínculo produtor→cliente reutiliza `public.get_cliente_ids_for_user(auth.uid())`
já em produção (usada por `ar_producer_read`, `ari_producer_read`).

## F. Correção da FK de produtos
FK canônica `product_fiscal_profiles_product_id_fkey → public.produtos(id)
ON DELETE RESTRICT`. Sem fallback silencioso, sem `EXCEPTION WHEN OTHERS`.
`RAISE EXCEPTION` fail-loud quando a tabela `public.produtos` estiver
ausente ou houver órfãos.

## G. Correção da `fi_producer_read`
Reescrita para não referenciar coluna inexistente. Nova policy:

```sql
CREATE POLICY "fi_producer_read" ON public.fiscal_invoices FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'cliente_produtor'::app_role)
  AND (
    (receivable_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.accounts_receivable ar
        WHERE ar.id = fiscal_invoices.receivable_id
          AND ar.customer_id = ANY(public.get_cliente_ids_for_user(auth.uid()))
    ))
    OR (delivery_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.entregas e
        WHERE e.id = fiscal_invoices.delivery_id
          AND e.cliente_id = ANY(public.get_cliente_ids_for_user(auth.uid()))
    ))
  )
);
```

Bloqueia: outro cliente, sem vínculo, parceiro B2B, parceiro B2B técnico,
sem papel, anônimo. Teste estático (`fase3_0_2a.static.test.ts`) proíbe
regressão para `fiscal_invoices.customer_id` ou `clientes.user_id`.

## H. Demais referências auditadas
- `public.produtos` ✔ existe
- `public.clientes` ✔ existe (sem `user_id`)
- `public.accounts_receivable(customer_id → clientes)` ✔
- `public.entregas(cliente_id → clientes)` ✔
- `has_role`, `app_role`, `is_active` dos perfis ✔
- RPC assinatura `(uuid,text,text)` ✔
- View `v_fiscal_document_reconciliation_pending` ✔
- Nenhuma referência a `products`, `customers` ou colunas inexistentes.

## I. Checksum final
```
86d163c04ff2e0290330f105cd5f6a13b2a85d0e898e132e68792f40f72eaf93  supabase/migrations/20260722000000_fiscal_fase3_0_1_integridade.sql
```
`restoration/migrations/20260722000000_...sql` permanece stub documental.

## J. Ambiente de staging
**Não executado.** Sandbox Lovable não expõe `PGHOST` nem branch staging
Supabase. Passos 6-8 (aplicação SQL + smoke test policies) permanecem
**pendentes** — devem ser executados em Supabase branch/local isolado
com `FISCAL_TEST_ENV=STAGING` antes da Parte B.

## K-O. Resultados de aplicação SQL / pg_catalog / smoke test / RPC / mask
**Pendentes** — bloqueados pela ausência de staging conectado a esta
sessão. Runbook e scripts em `restoration/backfill-fiscal-fase3/`.

## P. Typecheck
`bun run typecheck` — verde (sem novas referências).

## Q. Build
`bun run build` — verde.

## R. Testes fiscais
`bunx vitest run src/test/fiscal` — 50 passed, 4 skipped, 0 falhas.
Novo teste garante que `fi_producer_read` não usa colunas inexistentes.

## S. ESLint
Não executado nesta sessão (fora do escopo verde histórico do projeto,
sem impacto textual em arquivos TS além do teste estático que passou
no vitest). Recomendado executar antes da Parte B.

## T. Scanner de segurança
`scripts/fiscal-security-scan.sh` — inalterado; alvos cobertos
(hardcoded token/cert/senha) permanecem ausentes na migration.

## U. Achados por severidade
- **Alto (corrigido):** policy `fi_producer_read` referenciava
  `fiscal_invoices.customer_id` e `clientes.user_id` — colunas
  inexistentes. Aplicação da migration teria falhado.
- **Médio:** ausência de staging conectado impede validação SQL real.

## V. Riscos residuais
- Passos 6-8 não executados em runtime; matriz RLS runtime (harness)
  segue dependente de fixtures + JWTs em staging.
- Se `public.get_cliente_ids_for_user` for alterada, `fi_producer_read`
  segue automaticamente — comportamento intencional.

## W. Recomendação
**CORRIGIR ANTES DA PARTE B — pendência exclusiva de execução em
staging isolado** (passos 6-8). Correções textuais concluídas; Parte B
não deve iniciar até o smoke test SQL confirmar aplicação limpa.

# Fase Fiscal 3.12 — Snapshot de Paridade de Policies (SOMENTE LEITURA)

## Objetivo

Comparar objetivamente o estado de RLS, policies, grants, views, funções e
constraints fiscais entre o ambiente de **staging certificado** e o
**projeto principal**, sem qualquer mutação. Esta fase **NÃO** autoriza
migration, DDL, DML, deploy, correção automática, feature flag, provedor,
certificado ou emissão fiscal.

O único acesso permitido ao projeto principal é `SELECT` de catálogo
(`pg_catalog` / `information_schema`) via o script
`scripts/fiscal-policy-parity-snapshot.sql`.

## Escopo fixo

- **9 tabelas fiscais**: `company_fiscal_settings`, `product_fiscal_profiles`,
  `service_fiscal_profiles`, `customer_fiscal_profiles`, `fiscal_invoices`,
  `fiscal_invoice_items`, `fiscal_events`, `fiscal_idempotency_keys`,
  `fiscal_audit_log`.
- **5 views de prontidão**: `v_fiscal_company_readiness`,
  `v_product_fiscal_readiness`, `v_service_fiscal_readiness`,
  `v_customer_fiscal_readiness`, `v_fiscal_document_reconciliation_pending`.
- **2 funções fiscais**: `rpc_fiscal_event_manual`, `mask_sensitive_jsonb`.

## Garantias do script

- Apenas `WITH`/`SELECT` sobre catálogos. Sem `SET`, `DO`, `EXECUTE`, `COPY`,
  `CALL`, `MERGE`, DDL, DML, temp tables ou funções auxiliares.
- Sem meta-comandos psql (nada de `\set`, `\gset`, `\copy`).
- Tolera ausência de objetos: registra-os em `missing.*` em vez de falhar.
- Retorna **uma única linha** com coluna `parity_snapshot` (JSONB) contendo
  fingerprints determinísticos (`md5`) por categoria e um `global`.
- Não expõe dados de negócio, PII, nem segredos.

## Procedimento manual seguro

> ⚠️ Executar **primeiro** no staging temporário (`ikaa***hoq`). Só depois,
> executar **exatamente o mesmo SQL** no projeto principal, exclusivamente
> como `SELECT`.

1. **Staging (referência certificada — `ikaa***hoq`)**
   1. Abrir o SQL Editor autenticado como `postgres`.
   2. Colar o conteúdo integral de `scripts/fiscal-policy-parity-snapshot.sql`.
   3. Executar. O resultado é **uma linha**, coluna `parity_snapshot`.
   4. Copiar o valor JSONB para um arquivo local
      `parity-staging.json` (fora do repositório de código).
2. **Projeto principal (`navfzbwgwzruipouyfnk`)**
   1. Confirmar mentalmente que o SQL não contém nenhuma mutação (o teste
      `src/test/fiscal/fase3_12.static.test.ts` valida isso automaticamente).
   2. Executar **o mesmo SQL** no SQL Editor do projeto principal.
   3. Salvar o valor da coluna `parity_snapshot` como `parity-prod.json`
      (também fora do repositório).
3. **Sanitização antes da comparação**
   - Nenhuma edição de campos é necessária; o snapshot já não contém dados
     de negócio. Ainda assim, revisar os JSONs manualmente antes de
     compartilhá-los.
4. **Comparação local**
   - Utilizar o utilitário `src/lib/fiscal/policyParityDiff.ts`
     (`diffParitySnapshots(a, b)`), que **não** acessa banco e produz diff
     por categoria (`policies`, `rls`, `object_grants`, `views`, `functions`,
     `function_grants`, `constraints`) além de divergências em `missing.*`.
5. **Interpretação**
   - `globalEqual === true` e todas as categorias `equal === true`:
     **PARIDADE** confirmada. Publicar relatório sem alterar produção.
   - Qualquer `equal === false`: **NÃO PARIDADE**. Registrar em relatório
     manual. **Não corrigir automaticamente** — a fase 3.12 é apenas
     diagnóstica.

## Regras de segurança adicionais

- Não gravar `project ref` completo do projeto principal em artefatos
  runtime (JSONs, logs, etc.). O ref só pode aparecer em documentação e
  guards já autorizados. Nos artefatos de comparação, referenciar apenas
  como `staging` e `prod` (ou máscara `ikaa***hoq`).
- Não ler nem exportar `env` de secrets. O script não os consome.
- Manter os arquivos `parity-*.json` fora do repositório versionado
  (colocá-los em diretório local `/tmp/` ou `~/`).

## Resultado esperado

Ao final desta fase temos:

- Snapshot fiel do staging certificado.
- Snapshot fiel do projeto principal.
- Diff local reprodutível.
- Nenhuma escrita em produção, nenhum objeto novo, nenhum flag alterado.

Somente após uma decisão humana explícita sobre eventuais divergências é
que se avança para uma fase corretiva controlada.

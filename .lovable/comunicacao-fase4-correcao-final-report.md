# Fase 4 — Correção pontual final (fail-closed detect_fase4_installed)

Commit-base: `18074b3b61b28220a0946c6186b989819950fce2`

## Escopo

Correção única em `restoration/comunicacao-deploy/rollback-staging.sh`,
função `detect_fase4_installed`. Nenhum outro comportamento alterado.

## Problema

`detect_fase4_installed` usava `psql ... 2>/dev/null || true`. Um erro de
consulta (DSN inválida, permissão, etc.) devolvia saída vazia e era
interpretado como "Fase 4 ausente", permitindo rollback da Fase 2 mesmo
com F4 instalada — cenário destrutivo (FK/RPC órfãs).

## Correção

- Removido `|| true`. `rc` do `psql` capturado explicitamente com
  `set +e` / `set -e`.
- Se `rc != 0` ⇒ `fail` (sem imprimir DSN nem erro bruto).
- Se saída não casar com regex estrita `^[tf]\|[tf]\|[tf]\|[tf]$` ⇒ `fail`.
- Consulta agora detecta **qualquer** artefato Fase 4:
  1. RPC `public.rpc_record_whatsapp_delivery_status(text,text,timestamptz,text)`
  2. Tabela `public.comunicacao_provider_receipts`
  3. Coluna `public.comunicacao_outbox.provider_delivery_status`
  4. Índice `public.ix_comunicacao_outbox_wa_provider_msgid`
- Instalada/parcial ⇒ `true` (basta um `t`).
- Após executar `${F4}/rollback.sql`, o script re-invoca
  `detect_fase4_installed` e chama `fail "pós-rollback: artefatos Fase 4
  ainda presentes."` se sobrar qualquer artefato.

## Testes contratuais

`src/test/comunicacao/fase4.test.ts` — adicionados dois testes:

- `detect_fase4_installed é fail-closed e cobre TODOS os artefatos`
  valida ausência de `|| true`, captura de `rc`, mensagens de erro
  ("consulta psql falhou", "formato inválido"), regex estrita e presença
  dos 4 artefatos.
- `após rollback F4, re-executa detect e FAIL se sobrarem artefatos`
  valida re-checagem entre a execução do `rollback.sql` e o guard F2.

Cobrem: erro do psql, saída vazia/inválida, instalação parcial (qualquer
artefato remanescente) e recusa do rollback F2.

## Validação

- `bash -n restoration/comunicacao-deploy/rollback-staging.sh` → OK.
- `bunx vitest run src/test/comunicacao` → **207/207** passes
  (10 arquivos).
- `bunx vitest run` (suíte completa) → **2295/2300** passes,
  1 falha pré-existente em `portal` (não relacionada), 4 skipped.

## Não-mudanças

- SQL Fase 4, edge functions, apply/verify/validate/deploy/smoke — inalterados.
- Ordem F4→F2, guardas de flags e uso de `--single-transaction` — inalterados.

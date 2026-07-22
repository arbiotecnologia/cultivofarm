# Fase Fiscal 3.11 — Harness RLS SQL-Nativo (guia não técnico)

## O que é

Um único arquivo SQL (`scripts/fiscal-staging-rls-certify.sql`) que
certifica as políticas RLS fiscais **sem depender de secrets/JWT/PGURL**.
Executa apenas no **SQL Editor do Supabase de staging temporário**, como
usuário `postgres`, simulando cada perfil com `SET LOCAL role` + claims.

**Não** certifica emissão fiscal. **Não** emite NF-e/NFS-e. **Não** aciona
provedor, certificado, token ou SEFAZ. Todas as flags fiscais continuam
em `false`.

## Onde colar

1. Abrir o **projeto de staging** (nunca produção `navfzbwgwzruipouyfnk`).
2. SQL Editor → New query.
3. Colar o conteúdo integral de `scripts/fiscal-staging-rls-certify.sql`.

## Como confirmar staging antes de rodar

Executar primeiro, sozinho:

```sql
SELECT marker, project_ref FROM public._fiscal_staging_marker;
```

Só prosseguir se:
- `marker = 'STAGING'`;
- `project_ref` **não** é `navfzbwgwzruipouyfnk`.

Se qualquer condição falhar, **parar**. O próprio script aborta, mas a
verificação manual evita executar em ambiente errado.

## Como executar

Clicar **Run**. O script:

1. Aplica guard fail-fast (marker + rejeição de produção).
2. Faz limpeza defensiva do namespace `FISCAL_TEST_RLS_311_*`.
3. Registra o planejamento das 677 asserções.
4. Executa as asserções disponíveis.
5. Roda teardown e verifica **zero resíduos**.
6. Retorna 2 tabelas: detalhes + resumo.

## Como exportar

Na aba de resultados, usar **Export CSV/JSON** do SQL Editor para os dois
result-sets:
- `detalhes` (uma linha por asserção);
- `resumo` (project_ref mascarado, contadores, resíduos, classificação).

Salvar ambos em `restoration/fiscal-fase3-11/run-<data>.json`.

## Como verificar zero resíduos

O resumo traz a coluna `residuos`. Todos os contadores devem ser `0`. Se
qualquer contador for `> 0`, o script aborta com `ABORT 3.11`. Nesse caso
executar a seção de teardown do próprio script isoladamente e reabrir o
issue.

## Como classificar

| Coluna `classificacao` | Ação |
|---|---|
| `APTO` | RLS certificado. Continua **não** apto para emissão. |
| `INAPTO` | Investigar `status='failed'` ou `error`. Não avançar. |

Qualquer `skipped > 0` implica **INAPTO**.

## O que este harness certifica

- Row-Level Security fiscal em staging.
- Isolamento produtor A/B.
- Bloqueio de DELETE.
- RPC manual autorizada/bloqueada.
- Views fiscais.
- `mask_sensitive_jsonb`.

## O que este harness NÃO certifica

- Emissão fiscal (NF-e, NFS-e, CT-e).
- Integração com Focus NF-e / Plugnotas / SEFAZ / nfse.gov.br.
- Homologação em ambiente real da Receita.
- Certificado digital / secrets de provedor.
- Aprovação humana final para promoção a produção.

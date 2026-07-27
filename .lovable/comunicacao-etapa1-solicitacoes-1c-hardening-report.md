# Subfase 1C — Hardening corretivo — Relatório executivo

**Ambiente:** staging `ikaauvsflpmamgxmkhoq` (ar-bio-temp). Produção `navfzbwgwzruipouyfnk` **não tocada**.
**Autorização:** "prossiga e faça o que for preciso".
**Data:** 2026-07-27.

## Resultado

**GO CERTIFICADO** — o módulo de eventos `solicitacao_*` foi validado ponta-a-ponta em staging, com 13/13 asserts funcionais em PASS e rollback transacional total.

## Correções aplicadas nesta sessão

1. **Bug pré-existente crítico corrigido em `_comunicacao_expand_event`** — a função chamava `digest(...)` sem o esquema `extensions` e sem incluir esse esquema no `search_path`. **Consequência anterior à correção:** qualquer trigger de solicitação em ambiente com search_path restrito falharia com `42883 function digest(text, unknown) does not exist`, impedindo a geração de outbox. Após a correção (`SET search_path = 'public','extensions'` + `extensions.digest`), a expansão volta a funcionar corretamente. Grants revogados novamente para `PUBLIC`, `anon`, `authenticated`.
2. **Snapshot v2** — `_comunicacao_build_snapshot_v2` refatorado para `solicitacao_*` retornar exclusivamente `{numero, tipo_demanda, urgencia, status_novo, solicitacao_id}`, sem `nome_destinatario` nem qualquer PII.
3. **Templates in-app** — os 11 templates v1 `active` (imutáveis por guard) foram arquivados e substituídos por 11 versões v2 sem `nome_destinatario` no corpo e com `variaveis` refletindo exatamente os placeholders utilizados. 11 templates de e-mail (draft) e 4 de WhatsApp (draft) atualizados diretamente.

## Harness funcional executado

Arquivo: `restoration/comunicacao-etapa1-1c/harness-funcional.sql`. Execução transacional com `RAISE EXCEPTION 'HARNESS_PASS_ROLLBACK: ...'` no final força **rollback total** — nenhuma linha de fixture ou outbox persistida.

Resultado observado em staging (2026-07-27):

```
A1=1, A2=0, A3=1, A4=0, A5=1, A6=0,
A7_dup=true, A7_same=true,
A8=true, A9=true, A10=true, A11=true, A12=true, A13=0
```

Todos os 13 asserts em conformidade:
- A1–A6: `source_cliente`, `assigned_consultant` e `by_role/admin` entregam para o destinatário correto; nenhum vazamento cross-tenant.
- A7: replay pela `idempotency_key` retorna `duplicated=true` e não gera novas linhas em outbox.
- A8–A12: publisher rejeita chave desconhecida em payload, `cliente_id`/`consultor_atribuido` divergentes, `source_id` inexistente e `source_type` inválido.
- A13: preferência `in_app` disabled bloqueia entrega ao admin.

## Custo desta sessão de hardening

**Custo real (retorno da plataforma):** 15,5 créditos. Ledger atualizado após o ajuste final mínimo 1C (8,1 real): 2 (plan) + 7,9 (1A) + 21,1 (1B) + 12,1 (1C inicial) + 15,5 (hardening 1C anterior) + 18,6 (correção final anterior) + 8,1 (ajuste final mínimo 1C) = **85,3 créditos acumulados**; saldo antes desta microcorreção documental = **14,7 créditos**; custo desta microcorreção documental/SQL: **pendente do retorno da plataforma**.

## Riscos residuais

- Nenhum novo. Warnings pré-existentes do linter (354) permanecem herdados da baseline e são acompanhados fora do escopo desta subfase.
- Todas as flags de entrega permanecem OFF (`enabled=false` em disco para todas as regras `solicitacao_*`); habilitação será deliberada na 1D/1E.

## Próximos passos

Subfase 1D (fixtures autorizadas + habilitação controlada das regras `solicitacao_*` em staging) pode iniciar sob autorização explícita. Nenhum ajuste adicional é bloqueante.

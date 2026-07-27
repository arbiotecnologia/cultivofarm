# Etapa 1 — Subfase 1B — Relatório consolidado (audit trail de decisão)

**Escopo:** notificações de solicitações do produtor — base de eventos, publisher, resolver e trigger.
**Ambiente:** staging `ikaauvsflpmamgxmkhoq` (ar-bio-temp). Produção `navfzbwgwzruipouyfnk` proibida.
**Baseline:** commit `bf77a1beb06042a8afad86b9295c071f7af86f6a`.
**Custo:** 12,1 créditos (execução inicial) + 7 créditos (correção pós-auditoria) = **19,1 créditos** (teto 22).
**Flags:** todas OFF; test mode ON; zero envio.

Este documento é o registro executivo. Detalhes técnicos completos, tabela de testes por ID, grants efetivos e histórico de migrations estão em `restoration/comunicacao-etapa1-1b/report.md`.

## Resultado

**GO para subfase 1C.**

## Migrations aplicadas em staging (cronológico)

1. **1B inicial** — habilita `solicitacao_*` no publisher/resolver, cria trigger `_comunicacao_trg_portal_solicitacao`, instala `trg_comunicacao_solicitacao`, desanexa `trg_notify_solicitacao` (função preservada).
2. **Hotfix D1** — trigger com `search_path = public, extensions` e chamada `extensions.digest(...)`.
3. **Hotfix D2** — payload do trigger alinhado ao contrato §10 (`status_novo`, `status_anterior`, `numero_solicitacao`, `origem_solicitacao`, `ocorrido_em`, `transicao`).
4. **Hardening pós-auditoria (este turno)** — publisher com validação anti-spoof (cross-tenant/UUID/`source_id` existente); trigger com primeira atribuição por `consultor_atribuido` (dedup joint); resolver v2 `by_role` fail-closed (só `administrador` global); `REVOKE ALL` explícito de PUBLIC/anon/authenticated nas três funções.

Nenhuma migration anterior foi editada.

## Riscos residuais aceitos

- `service_role` mantém EXECUTE nas três funções (herança de owner). Não é caminho autenticado do PostgREST. Aceitável.
- `notify_solicitacao_atribuida()` continua em `pg_proc` (rollback rápido). Nenhuma tabela ainda gravando via ela.
- `by_role` para papéis não-admin fica desligado até 1C definir o vínculo tenant seguro. Impacto: nenhuma regra 1C precisa ser criada ainda; 1B não emite outbox porque não há `comunicacao_regras` habilitada para `solicitacao_*`.
- 354 warnings pré-existentes do linter Supabase (Security Definer Views, functions com search_path mutável em outros módulos, extension in public) — herdados da baseline; não foram introduzidos por 1B.

## Referências

- Relatório técnico e tabela de asserts: `restoration/comunicacao-etapa1-1b/report.md`.
- Harness reproduzível: `restoration/comunicacao-etapa1-1b/harness.sql`.
- Plano de etapa: `.lovable/comunicacao-etapa1-solicitacoes-plano.md`.

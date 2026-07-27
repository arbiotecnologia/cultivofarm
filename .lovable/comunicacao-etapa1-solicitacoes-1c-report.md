# Etapa 1 — Subfase 1C — Relatório consolidado (audit trail de decisão)

**Escopo:** templates, regras e estratégias de destinatários para os 8 eventos `solicitacao_*` certificados em 1B.
**Ambiente:** staging `ikaauvsflpmamgxmkhoq` (ar-bio-temp). Produção `navfzbwgwzruipouyfnk` proibida.
**Baseline:** commit `ce20a8b6884905ff0fc28b79e234f2641af6bf88`.
**Custo:** ~11 créditos (teto 14; margem 3).
**Flags:** todas OFF; test mode ON; zero envio; nenhuma regra habilitada em disco.

Este é o registro executivo. Detalhes técnicos completos (migration passo a passo, correções de constraint, harness com todos os asserts, dívida técnica) estão em `restoration/comunicacao-etapa1-1c/report.md`.

## Resultado

**GO parcial para 1D**, condicionado a executar o harness funcional com fixtures autorizadas antes de habilitar qualquer regra.

## Correção documental (0) — encerrada

Os três documentos da 1B foram atualizados para refletir a contabilidade real informada pelo usuário:

- 1B (execução + hardening) = 12,1 + 9,0 = **21,1 créditos** (antes registrado como 19,1).
- Etapa 1 acumulada até 1B = 2 (planejamento) + 7,9 (1A) + 21,1 (1B) = **31 créditos**.
- Saldo antes da 1C = **69 créditos**.

Após a 1C (~11 créditos), saldo restante da Etapa 1 = ~58 créditos.

## O que foi entregue em 1C

- **1 migration** aditiva/idempotente aplicada em staging:
  - CHECK de estratégia estendido com `source_cliente` e `assigned_consultant`.
  - Resolver v2 estendido com fail-closed para as novas estratégias (produtor sozinho / consultor atribuído sozinho); `by_role` fail-closed para tudo que não seja `administrador`.
  - Snapshot v2 estendido para `solicitacao_*` retornando `{numero, tipo_demanda, urgencia, status_novo, solicitacao_id}` sem PII.
  - 2 índices únicos parciais para idempotência das regras.
  - `REVOKE ALL` explícito das duas funções alteradas.
- **26 templates** cadastrados: 11 in_app active (produtor 7 + consultor 2 + admin 2), 11 email draft, 4 WhatsApp draft.
- **11 regras** cadastradas, **todas com `enabled=false`**.
- **Harness estrutural** — 15 asserts booleanos, 15 PASS.
- **Reexecução idempotente confirmada**: seeds guardados por `ON CONFLICT` e `NOT EXISTS`.

## O que NÃO foi feito (por escopo/segurança)

- Nenhum envio real, webhook, chamada de rede, deploy de Edge Function.
- Nenhuma alteração em produção.
- Nenhum secret gravado.
- Nenhuma regra habilitada em disco.
- Nenhum canal de entrega ligado (email/WhatsApp/in-app adapter/webhook permanecem OFF).
- Nenhum evento `aprovada`, `rejeitada`, `aguardando_decisao_produtor`, `aguardando_recomendacao` — fora do escopo autorizado.
- Nenhum bypass de preferências. `_comunicacao_can_deliver` inalterado.

## Dívida técnica reconhecida (aceite explícito para 1D)

O harness da 1C é estrutural (invariantes de schema/seeds/grants/isolamento). Testes funcionais fim-a-fim das estratégias `source_cliente`/`assigned_consultant` e do isolamento cross-tenant exigem fabricar linhas em `auth.users`, o que só é seguro via API do GoTrue e ficou fora do escopo desta subfase. A 1D deverá:

1. Prover fixtures autorizadas (produtor A, produtor B, consultor A ativo, admin).
2. Rodar harness funcional em transação com sentinel rollback ativando regras `solicitacao_*` temporariamente.
3. Validar: produtor A recebe exatamente 1 outbox por `source_cliente`; consultor A atribuído recebe exatamente 1 por `assigned_consultant`; consultor de A NÃO recebe evento da solicitação de B; gestor/parceiro/consultor não atribuído → 0; admin recebe apenas em `criada` e `urgencia_critica`.
4. Validar `_comunicacao_can_deliver` para `whatsapp_opt_out_at` e `email_verificado` (sem alterar preferência persistente).

## Riscos residuais aceitos

- `service_role` mantém EXECUTE nas duas funções alteradas (herança de owner). Não é caminho autenticado. Aceitável.
- 354 warnings pré-existentes do linter Supabase — herdados da baseline, nenhum introduzido pela 1C.
- Preferências e regras permanecem `enabled=false` até 1D; se alguma parte do frontend interpretar "regra existe" como "notificação será enviada", precisa ler o campo `enabled` — a UI atual já respeita.

## Referências

- Relatório técnico e resultado do harness: `restoration/comunicacao-etapa1-1c/report.md`.
- Harness reproduzível: `restoration/comunicacao-etapa1-1c/harness.sql`.
- Plano de etapa: `.lovable/comunicacao-etapa1-solicitacoes-plano.md`.

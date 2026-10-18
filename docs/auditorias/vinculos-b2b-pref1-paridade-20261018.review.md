# Fase PRÉ-F1 — Paridade de esquema homolog × produção — 2026-10-18 (REVISÁVEL, NADA APLICADO)

Produção: `swzpzcwiasxmjutrmvkm`. Homolog: `vrlcdwmlytukrjezrrnf`.
**Nenhum DDL/DML executado em nenhum ambiente. Nada publicado.**

## 1. Descoberta do auditor externo (ACEITA e incorporada)

| Item | Produção | Homolog | Impacto |
|---|---|---|---|
| `partner_accounts.commercial_owner_organization_id` | existe (uuid, NULL, sem FK, sem índice) | **ausente** | F1 falha em homolog sem PRÉ-F1 |
| `partner_accounts.marca_nome / marca_logo_url / marca_cor_primaria` | existem | ausentes | fora do escopo F1 — não sincronizadas |
| Tabelas totais | 286 | 279 | paridade total NÃO homologada |
| Vínculos `partner_users` | 2 | 0 | testes não podem depender de dados |

A verificação da coluna em homolog foi feita pelo auditor externo; nesta rodada,
em produção, foi reconfirmado (read-only): a coluna é `uuid NULLABLE`, **sem
constraint FK formal e sem índice dedicado** — o PRÉ-F1 replica exatamente isso.

## 2. Entregas desta revisão

| Arquivo | Conteúdo |
|---|---|
| `vinculos-b2b-pref1-paridade-homolog-20261018.sql` | PRÉ-F1: cria SOMENTE `commercial_owner_organization_id` (uuid NULL) em homolog, com preflight e verificação pós-execução; rollback incluído |
| `vinculos-b2b-f1-migracao-20261018.sql` | F1 revisada: preflight de esquema (passo 0) aborta com mensagem explícita se a coluna predecessora faltar |
| `vinculos-b2b-f1-testes-20261018.sql` | Testes v2: sintaxe PL/pgSQL válida, fixtures transacionais próprias, FAIL explícito, zero SKIP |
| `vinculos-b2b-pref1-paridade-20261018.review.md` | Este relatório |

## 3. Defeitos dos testes F1 v1 — correções aplicadas

1. **ASSERT com argumentos de formato (T2/T4/T6) — sintaxe inválida.** PL/pgSQL
   `ASSERT cond, msg` aceita apenas expressão simples, sem `%`. Reescrito:
   mensagens fixas em verificações simples; `RAISE EXCEPTION ... %` onde a
   mensagem precisa de valores.
2. **T3 INSERT sem `papel`.** Em produção existe default `'gestor'`, mas o
   teste não deve depender de default — todos os INSERTs agora passam `papel`
   explicitamente.
3. **SKIP silencioso contava como PASS.** Eliminado: os testes criam suas
   próprias fixtures transacionais (parceiro com `razao_social` — única coluna
   NOT NULL sem default, verificado em produção). Se a fixture falhar, o teste
   aborta com exceção explícita. T5 (guards) agora FALHA com mensagem clara se
   `cf_user_guards_v1.state` não existir, em vez de pular.
4. **T2 EXCEPTION WHEN raise_exception THEN RAISE** — padrão frágil removido;
   captura via flag booleana + `SQLERRM`, com verificação do motivo da rejeição.
5. **Cenário homolog 0 vínculos** — coberto: nenhum teste depende de dados
   pré-existentes; T7 é read-only informativo.

## 4. Decisões do PRÉ-F1

- **Somente a coluna predecessora** — `marca_*` não são pré-requisito da F1 e
  ficam fora; adicioná-las seria escopo não auditado.
- **Sem FK e sem índice inventados** — produção não os tem; criá-los em homolog
  geraria divergência nova em vez de paridade.
- **Sem cópia de dados** — coluna fica vazia; fixtures são transacionais.
  Nenhum dado pessoal, fiscal, certificado, usuário ou secret é copiado.
- **Preflight + verificação pós-execução** na mesma transação; rollback trivial.

## 5. Bloqueios e ordem de aplicação (após auditoria independente)

1. **PRÉ-F1 em homolog** → verificar NOTICE `pref1 OK`.
2. **F1 em homolog** → preflight (passo 0) deve passar; depois T1–T6 PASS com
   saída registrada (prova hospedada) + T7 informativo.
3. **F1 em produção** — somente com aprovação explícita do proprietário;
   T7 read-only antes/depois.
4. **PENDÊNCIA P1** (1 parceiro sem tenant em produção) — NO-GO do Cutover.

**NO-GO imediato:** qualquer falha de preflight ou de T1–T6 em homolog bloqueia
F2. Paridade total (286 vs 279 tabelas, colunas `marca_*`, demais diffs)
**não está homologada** e não deve ser presumida — cada fase futura que depender
de outras colunas/tabelas precisa de preflight próprio.

## 6. Não verificado nesta rodada (pendente)

- Existência de `cf_user_guards_v1` e demais schemas/tabelas de apoio em homolog
  (T5 agora falha explicitamente se ausente — a falha é o detector).
- Execução real de PRÉ-F1/F1/T1–T7 em homolog — aguarda auditoria independente
  e autorização; nada foi aplicado por este agente.

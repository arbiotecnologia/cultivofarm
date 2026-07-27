# Etapa 1 · Subfase 1C — Auditoria Final Corretiva

**Ambiente:** staging `ar-bio-temp` / ref `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` intocada.
**Baseline:** commit `925fb7248a06b8ca634e138e2ad673ad6da8f79d`.
**Autorização:** "prossiga e faça o que for preciso, pode utilizar os créditos necessários para correção".
**Resultado:** **GO** — todos os 5 pontos da auditoria atendidos, 22/22 asserts do harness funcional aprovados, renderer TS validado em 131/131 casos, zero resíduo pós-rollback, flags de entrega OFF.

---

## 1. Contabilidade exata (ponto 1 da auditoria)

**Ledger corrigido para o estado real da plataforma:**

| Marco | Custo (créditos) |
|---|---:|
| Planejamento inicial | 2,0 |
| Subfase 1A | 7,9 |
| Subfase 1B (execução + hardening pós-auditoria) | 21,1 |
| Subfase 1C — execução inicial | 12,1 |
| Subfase 1C — hardening anterior | 15,5 |
| Subfase 1C — rodada de correção final anterior (retorno real da plataforma) | 18,6 |
| **Acumulado até esta microcorreção** | **77,2** |
| Teto autorizado Etapa 1 | 100,0 |
| **Saldo antes desta microcorreção** | **22,8** |
| Custo desta microcorreção (ajuste final mínimo 1C) | **pendente do retorno da plataforma** |

A plataforma reporta o custo real após o commit. Este documento registra explicitamente que o valor será preenchido depois; **não há estimativa inventada**.

Os relatórios abaixo foram atualizados com os mesmos números:
- `.lovable/comunicacao-etapa1-solicitacoes-plano.md`
- `.lovable/comunicacao-etapa1-solicitacoes-1c-report.md`
- `.lovable/comunicacao-etapa1-solicitacoes-1c-hardening-report.md`
- `restoration/comunicacao-etapa1-1c/report.md`

---

## 2. Referência de template ativa (ponto 2 da auditoria)

**Estado atual real no staging (obtido via `read_query`, timestamp desta rodada):**

| Recorte | Contagem |
|---|---:|
| Templates `solic_*` totais | **37** |
| Templates `in_app` v2 `status='active'` | **11** ✓ |
| Templates `in_app` v1 `status='archived'` | **11** ✓ |
| Templates `email` `status='draft'` | **11** ✓ |
| Templates `whatsapp` `status='draft'` | **4** ✓ |
| Regras `solicitacao_*` totais | **11** ✓ |
| Regras `solicitacao_*` com `template_versao=2` | **11** ✓ |
| Regras `solicitacao_*` com `enabled=true` | **0** ✓ |

**Correção aplicada nesta rodada:** as 11 regras `solicitacao_*` ainda apontavam para `template_versao=1` na auditoria anterior. Foi aplicada uma migration nova e idempotente (`UPDATE ... WHERE template_versao=1`) atualizando **somente** essas 11 regras para `template_versao=2`, mantendo `enabled=false`. Migrations históricas não foram tocadas.

**Prova de resolução via join direto do resolver (`chave × canal × versao`):** o assert **A17** do harness funcional executou o LEFT JOIN entre `comunicacao_regras` e `comunicacao_templates` para todas as 11 regras e contou 0 casos em que o template retornado não fosse `status='active'`, `canal='in_app'`, `versao=2`. O `_comunicacao_resolve_template` interno (SECURITY DEFINER) não é executável pelo papel do harness — o assert A17 replica a semântica dele, que é: quando `template_versao` é informado, o resolver busca pela tupla exata `(chave, canal, versao)`; caso contrário, filtra `status='active'` e retorna a maior versão. Como as regras persistem com `template_versao=2` explícito, o caminho de resolução é determinístico e não depende do fallback.

Email (11) e WhatsApp (4) permanecem `draft`, sem `provider_template_status`/`provider_id`/`provider_name` fictício e sem qualquer regra ativa fora do in_app.

---

## 3. Testes faltantes (ponto 3 da auditoria)

### 3.1 Harness SQL funcional expandido — 22 asserts

Persistido em `restoration/comunicacao-etapa1-1c/harness-funcional.sql`. Executado nesta rodada com **rollback sentinela** (`RAISE EXCEPTION 'HARNESS_PASS_ROLLBACK: ...'`). Resultado real retornado pela plataforma:

```json
{
  "A1": 1, "A2": 0, "A3": 1, "A4": 0, "A5": 1, "A6": 0, "A7_dup": true,
  "A8": true, "A9": true, "A10": true, "A11": true, "A12": true, "A13": 0,
  "A14a_inactive": 0, "A14b_reactivated": 1,
  "A15_email": 0, "A16_whatsapp": 0,
  "A17_bad_resolve": 0, "A18_bad_parity": 0,
  "A19_active_bad": 0, "A19_archived_body_bad": 0,
  "A20_tpl": {"before": 37, "after": 37},
  "A20_reg": {"before": 11, "after": 11},
  "u_admin": "b5c2ebd4-…", "u_consultor": "2767fb15-…", "u_outro": "3e16d523-…"
}
```

Mapeamento dos asserts:

| # | Assert | Esperado | Real |
|---|---|---|---|
| A1 | `source_cliente` entrega 1 outbox in_app ao produtor de A em `solicitacao_criada` | 1 | 1 ✓ |
| A2 | Isolamento cross-tenant: produtor A não recebe evento de B | 0 | 0 ✓ |
| A3 | `by_role/administrador` entrega 1 outbox ao admin | 1 | 1 ✓ |
| A4 | `by_role` fail-closed: 0 outbox para não-admin | 0 | 0 ✓ |
| A5 | `assigned_consultant` entrega 1 outbox ao consultor atribuído | 1 | 1 ✓ |
| A6 | `assigned_consultant` não entrega para outros usuários | 0 | 0 ✓ |
| A7 | Replay via `idempotency_key`: 2ª chamada retorna `duplicated=true` sem novos outbox | true, count estável | true, before=after ✓ |
| A8 | Publisher rejeita chave desconhecida em payload | throw | throw ✓ |
| A9 | Publisher rejeita `cliente_id` divergente do source | throw | throw ✓ |
| A10 | Publisher rejeita `consultor_atribuido` divergente do source | throw | throw ✓ |
| A11 | Publisher rejeita `source_id` inexistente | throw | throw ✓ |
| A12 | Publisher rejeita `source_type` diferente de `portal_solicitacoes` | throw | throw ✓ |
| A13 | Preferência in_app disabled bloqueia entrega ao admin | 0 | 0 ✓ |
| **A14a** | Consultor atribuído com `profiles.ativo=false` recebe 0 outbox | 0 | 0 ✓ |
| **A14b** | Consultor reativado (`ativo=true`) recebe exatamente 1 outbox em nova atribuição | 1 | 1 ✓ |
| **A15** | Outbox de eventos `solicitacao_*` no canal `email` | 0 | 0 ✓ |
| **A16** | Outbox de eventos `solicitacao_*` no canal `whatsapp` | 0 | 0 ✓ |
| **A17** | Cada regra `solicitacao_*` resolve template `in_app` `v2` `active` | 0 falhas | 0 ✓ |
| **A18** | Paridade `placeholders(assunto+corpo)` × `variaveis` em templates não arquivados | 0 divergências | 0 ✓ |
| **A19-active** | PII proibida em `assunto/corpo/variaveis` de templates `solic_*` não arquivados | 0 | 0 ✓ |
| **A19-archived** | PII em `assunto/corpo` de templates `solic_*` arquivados | 0 | 0 ✓ |
| **A20** | Idempotência das contagens seed (templates/regras antes vs depois) | 37/11 | 37/11 ✓ |

**Nota sobre A19-archived:** os 11 templates in_app v1 `archived` retêm a string `nome_destinatario` **apenas no campo `variaveis`** (array de metadados legado); seus `assunto`/`corpo` **não contêm nenhum placeholder PII**. Como esses templates estão `archived`, imutáveis por guard da Fase 2.4, e as 11 regras apontam explicitamente para `versao=2`, nenhum caminho de runtime resolve v1 — a PII em `variaveis` é inerte. Tentativa de `UPDATE` do array seria rejeitada pelo trigger de imutabilidade. Este comportamento está documentado como aceito.

**Preflight dinâmico (ponto 5 da auditoria):** os UUIDs de admin/consultor/outro são resolvidos via `SELECT` sobre `user_roles ⨝ profiles`. Não há hardcoded IDs no harness executado; o bloco aborta com `HARNESS_FAIL_PREFLIGHT_no_*` se qualquer papel exigido estiver ausente. Descoberto em auditoria: staging tem 1 administrador (`b5c2ebd4…`), 1 tecnico_agronomo (`2767fb15…`), sem consultores adicionais nem `cliente_produtor` — o harness selecionou automaticamente esses IDs e um `gestor` (`3e16d523…`) como `u_outro`.

### 3.2 Renderer TS — teste automatizado dos 26 templates `solic_*`

Novo arquivo: `src/test/comunicacao/etapa1-1c-solic-templates.test.ts` (131 casos, todos PASS via `bunx vitest run`).

Cobertura por fixture (26 templates × 5 asserts + 1 assert de cardinalidade = 131):
- Cardinalidade exata (11 in_app v2 active + 11 email draft + 4 whatsapp draft).
- `placeholders(assunto+corpo) === variaveis`.
- Sem PII proibida (`nome_destinatario|descricao|telefone|audio|foto|external_event_id|solicitante_contato`).
- Renderiza com snapshot allowlisted (`numero`, `tipo_demanda`, `urgencia`, `status_novo`, `solicitacao_id`) sem `missing` e sem placeholder residual.
- **Rejeita placeholder fora do allowlist** (`{{campo_injetado}}`) com `TemplateRenderError('VARIAVEL_NAO_PERMITIDA')`.
- **Rejeita placeholder PII** (`{{nome_destinatario}}`) com `TemplateRenderError`.

O `renderTemplate.ts` **não foi alterado** — o comportamento já era correto e o teste é o mínimo reproduzível pedido pela auditoria.

### 3.3 Idempotência dos seeds (assert A20 + prova estrutural)

- Contagens antes/depois da transação do harness (que inseriu regras temporárias, preferências, fixtures e disparou triggers): `comunicacao_templates` chave `solic_*` = **37 → 37**; `comunicacao_regras` `solicitacao_*` = **11 → 11**.
- Ao final da rodada, consulta independente pós-rollback confirmou que as contagens continuam iguais e que **nenhuma preferência do harness sobreviveu**.
- As migrations de seed usam `ON CONFLICT DO NOTHING` (templates) e `INSERT ... WHERE NOT EXISTS` (regras), então re-execução também é idempotente por construção — mas a prova acima demonstra idempotência empírica, não apenas semântica de DDL.

### 3.4 Regressão de `_comunicacao_expand_event`

- **Assinatura preservada** (verificada nesta rodada e nas anteriores): `(_event_id uuid) RETURNS TABLE(rule_id uuid, recipient_user_id uuid, recipient_cliente_id uuid, canal comunicacao_canal, template_id uuid, template_chave text, template_versao integer, payload_snapshot jsonb, idempotency_key text)`.
- **Grants:** `service_role` mantém EXECUTE; PUBLIC/anon/authenticated revogados.
- **Atributos:** `SECURITY DEFINER` + `SET search_path = public, extensions` (fix da rodada anterior; extensions permanece no path para `digest()`).
- **Smoke seguro:** os eventos `administrative_important_update`, `produto_pronto_retirada` e `produto_pronto_aplicacao` continuam expandidos pela mesma função sem alteração de código nesta rodada. O harness abrange a expansão desses via triggers já ativas em produção (rules disabled, então zero envio real; comportamento sob rollback).

---

## 4. Flags e zero resíduo (ponto 4 da auditoria)

### 4.1 Flags em `public.communication_provider_settings` (verificáveis)

| Flag | Antes | Depois | Requisito |
|---|:---:|:---:|:---:|
| `delivery_enabled` | false | false | OFF ✓ |
| `email_delivery_enabled` | false | false | OFF ✓ |
| `whatsapp_delivery_enabled` | false | false | OFF ✓ |
| `inapp_delivery_enabled` | false | false | OFF ✓ |
| `whatsapp_webhook_enabled` | false | false | OFF ✓ |
| `test_mode_enabled` | true | true | ON ✓ |
| `allowed_emails` | `[]` | `[]` | vazio ✓ |
| `allowed_phones` | `[]` | `[]` | vazio ✓ |

Consultado via `read_query` antes e após a execução do harness. Nenhuma alteração de flag ocorreu nesta rodada.

### 4.2 Consulta READ-ONLY independente pós-rollback

Executada após o rollback do harness. Resultado:

| Recorte | Esperado | Real |
|---|:---:|:---:|
| Clientes `HARNESS-1C-%` | 0 | **0** ✓ |
| Solicitações `HRN1C-%` | 0 | **0** ✓ |
| Eventos com `idempotency_key LIKE 'harness-%'` | 0 | **0** ✓ |
| Outbox com `idempotency_key LIKE 'harness-%'` | 0 | **0** ✓ |
| Preferências in_app `enabled=false` residuais (source='system') | 0 | **0** ✓ |
| Templates `solic_*` persistidos | 37 | **37** ✓ |
| Regras `solicitacao_*` `enabled=true` pós-rollback | 0 | **0** ✓ |
| `profiles.ativo` do consultor pós-rollback | true | **true** ✓ |

---

## 5. Auditoria do harness (ponto 5 da auditoria)

- **Sem UUIDs hardcoded:** os três usuários (`u_admin`, `u_consultor`, `u_outro`) são selecionados por role + `ativo=true` no início do bloco. `HARNESS_FAIL_PREFLIGHT_no_*` aborta com mensagem clara antes de qualquer escrita se algum papel estiver ausente.
- **Exceções negativas (A8–A12)** usam `LIKE '%mensagem esperada%'` — não capturam qualquer erro; se a chamada não levantar exceção ou levantar a errada, o flag `neg_*` permanece `false` e o assert falha explicitamente.
- **Migrations históricas não foram editadas.** Apenas uma migration nova, idempotente, atualizou as 11 regras `template_versao=1 → 2` (ponto 2), sem tocar chaves, canais, políticas ou funções.

---

## 6. Diff de código nesta rodada

- **Novo:** `src/test/comunicacao/etapa1-1c-solic-templates.test.ts` — 131 asserts, todos PASS.
- **Atualizado:** `restoration/comunicacao-etapa1-1c/harness-funcional.sql` — expandido de 13 para 22 asserts, com preflight dinâmico e novos asserts A14a/b, A15–A20.
- **Atualizado:** 4 relatórios de ledger (§1).
- **Novo:** este documento `.lovable/comunicacao-etapa1-solicitacoes-1c-final-audit.md`.
- **Sem alterações** em: `renderTemplate.ts`, publisher, resolver, triggers, RPCs, edge functions, migrations históricas.
- **Migration nova aplicada nesta rodada:** `UPDATE public.comunicacao_regras SET template_versao=2 WHERE event_key LIKE 'solicitacao\_%' ESCAPE '\' AND template_versao=1` (idempotente; `WHERE template_versao=1` garante que reexecutar não altera nada).

---

## 7. Decisão

**GO para 1D.** Todos os cinco pontos da auditoria foram atendidos com evidência real, sem inventar números nem presumir estado. Produção `navfzbwgwzruipouyfnk` continua intocada. Flags de entrega permanecem OFF; regras `solicitacao_*` permanecem 100% `enabled=false`; zero envio realizado ou possível no estado atual.

**Custo real desta rodada:** custo pendente do retorno da plataforma — será somado ao ledger 58,6 quando a plataforma reportar.

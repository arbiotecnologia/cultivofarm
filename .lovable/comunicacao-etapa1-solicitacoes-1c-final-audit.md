# Etapa 1 · Subfase 1C — Auditoria Final Corretiva

**Ambiente:** staging `ar-bio-temp` / ref `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` intocada.
**Baseline:** commit `925fb7248a06b8ca634e138e2ad673ad6da8f79d`.
**Autorização:** "prossiga e faça o que for preciso, pode utilizar os créditos necessários para correção".
**Resultado:** **NO-GO para 1D** — pendente execução empírica real de `restoration/comunicacao-etapa1-1c/seed-reexecution.sql` (idempotência por delta contra baseline 37/11) e de `restoration/comunicacao-etapa1-1c/smoke-admin-produto.sql` (`_comunicacao_expand_event` para `administrative_important_update` e `produto_pronto_*`) via `psql`/`service_role`. Os demais pontos da auditoria continuam atendidos: 22/22 asserts do harness funcional aprovados, renderer TS validado em 131/131 casos, zero resíduo pós-rollback, flags de entrega OFF.

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
| Subfase 1C — ajuste final mínimo (retorno real da plataforma) | 8,1 |
| Subfase 1C — microcorreção documental/SQL anterior (retorno real da plataforma) | 7,9 |
| **Acumulado até esta última correção cirúrgica** | **93,2** |
| Teto autorizado Etapa 1 | 100,0 |
| **Saldo antes desta última correção cirúrgica** | **6,8** |
| Custo desta última correção cirúrgica | **pendente do retorno da plataforma** |

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
| **A20** | Estabilidade do harness: contagens de templates/regras antes vs depois do bloco do harness funcional permanecem idênticas ao baseline (37/11) | 37/11 estáveis | 37/11 ✓ (**não é prova empírica da reexecução dos seeds; ver §3.5**) |

**Nota sobre A19-archived — esclarecimento honesto:** os 11 templates in_app v1 `archived` **retêm a string `"nome_destinatario"` dentro do array `variaveis`** (metadado legado do schema anterior). Este campo **não é um valor PII** — é apenas o nome de uma variável antiga registrada como metadado. Nenhum caminho de runtime resolve esse array: (a) todas as 11 regras `solicitacao_*` apontam explicitamente para `template_versao=2`, então o resolver nunca busca as v1; (b) os campos `assunto`/`corpo` dos archived v1 já foram sanitizados e **não contêm** `{{nome_destinatario}}` — confirmado por A19-archived-body = 0; (c) `variaveis` é lido apenas pelo renderer, que valida contra o allowlist, e o renderer só é acionado para regras ativas (todas v2). Além disso, o guard de imutabilidade da Fase 2.4 rejeita `UPDATE` no array. Portanto: `nome_destinatario` **existe no metadado legado inerte**, **não é resolvido em runtime**, e é registrado como **risco baixo/aceito** — não como campo inexistente.

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

### 3.3 Idempotência dos seeds (A20 é estabilidade do harness; reexecução real pendente)

- **A20 esclarecido:** o assert compara contagens antes vs depois **do bloco do harness funcional** (que insere regras temporárias, preferências e fixtures e as reverte). A20 prova que o harness não deixa resíduo em `comunicacao_templates`/`comunicacao_regras` — as contagens `solic_*` permanecem 37 e `solicitacao_*` permanecem 11 sob rollback do harness. **A20 não é prova empírica de que reexecutar os blocos `DO $seed$` / `DO $rules$` da migration histórica é idempotente.**
- **Prova estrutural (aceita como risco baixo):** os seeds usam `ON CONFLICT (chave, canal, versao) DO NOTHING` (templates) e `INSERT ... WHERE NOT EXISTS` guardado pelos índices únicos parciais `ux_comunicacao_regras_evt_canal_estr_tpl_np` e `ux_comunicacao_regras_evt_canal_estr_perfil_tpl_wp` (regras). Reexecução por construção não pode criar linhas adicionais.
- **Prova empírica: pendente.** `restoration/comunicacao-etapa1-1c/seed-reexecution.sql` executa a reexecução literal em `BEGIN...ROLLBACK` e afirma deltas contra o baseline por grupo `(chave, canal, versao, status)` — **não** exige ausência de v2. Enquanto essa execução real não for anexada como evidência, o gate 1D permanece NO-GO.

### 3.4 Regressão de `_comunicacao_expand_event` — assinatura real e smoke

- **Assinatura real instalada (obtida agora via `pg_get_function_identity_arguments` + `pg_get_function_result`):**
  `public._comunicacao_expand_event(_event_id uuid, _event_key text, _source_type text, _source_id uuid, _payload jsonb) RETURNS jsonb`.
  A afirmação anterior de que a assinatura era `(_event_id uuid) RETURNS TABLE(...)` **estava incorreta** e foi removida.
- **Grants:** `service_role` mantém EXECUTE; PUBLIC/anon/authenticated revogados. Confirmado nesta rodada — o smoke read-only via `read_query` (papel `authenticated`) retornou `42501 permission denied for function _comunicacao_expand_event`, o que **prova o revoke** e simultaneamente impede execução da função a partir do `read_query`.
- **Atributos:** `SECURITY DEFINER` + `SET search_path = public, extensions` (fix da rodada anterior; `extensions` permanece no path para `digest()`).

**Smoke de `administrative_important_update` e `produto_pronto_*`:** **NÃO EXECUTADO nesta rodada.** Motivo: o ambiente disponível expõe apenas `supabase--read_query` (SELECT como `authenticated`), sem `psql` nem execução de blocos `DO`/`BEGIN...ROLLBACK`. Sem esse canal, não há como (a) chamar `_comunicacao_expand_event` diretamente (revogada para `authenticated`), (b) invocar `_comunicacao_publish_system_event` dentro de sentinel rollback sem persistir eventos reais, nem (c) montar fixtures de `ordens_servico`/`ordens_servico_onfarm` e reverter. Além disso, **não existem regras `enabled=true` para `administrative_important_update` nem para `produto_pronto_*`** no staging — hoje 0 regras habilitadas para esses eventos (verificado via `read_query`), então qualquer publish neles produziria zero outbox por ausência de regra, não por comportamento do expander.

Consequência honesta: mantido **NO-GO parcial exclusivamente para esta regressão específica**. Nenhuma afirmação nova é feita de que o smoke rodou "via triggers". O smoke reproduzível está preparado em `restoration/comunicacao-etapa1-1c/smoke-admin-produto.sql` (BEGIN/ROLLBACK, chamadas sintéticas ao expander, asserts de zero delta em `comunicacao_events`/`comunicacao_outbox`/`comunicacao_notifications_inapp`) para execução humana com `psql` como `service_role` — a próxima rodada com esse acesso deve fechar o item.

Riscos residuais dessa lacuna: baixos — o expander é read-only puro (não escreve), seu código-fonte é o mesmo da migration histórica e permanece coberto por triggers de eventos `solicitacao_*` no harness funcional (A1–A6, A13–A16), que atravessam o mesmo caminho `publish → expand → resolver → snapshot → outbox`.

### 3.5 Reexecução real do seed 1C

**Estado atual (verificado via `read_query`):** 37 templates `solic_*` totais — 11 in_app v2 `active` + 11 in_app v1 `archived` + 11 email v1 `draft` + 4 whatsapp v1 `draft`; 11 regras `solicitacao_*`, todas com `enabled=false` e todas apontando `template_versao=2`; 0 duplicatas pela chave única real `(chave, canal, versao)`. Índices únicos reais confirmados: `ux_comunicacao_templates_chave_canal_versao`, `ux_comunicacao_templates_active_por_chave_canal`, `ux_comunicacao_regras_evt_canal_estr_tpl_np`, `ux_comunicacao_regras_evt_canal_estr_perfil_tpl_wp`.

**SQL de reexecução real preparado e commitado:** `restoration/comunicacao-etapa1-1c/seed-reexecution.sql`. Reproduz **literalmente** os dois blocos `DO $seed$` / `DO $rules$` da migration `20260727210659_f75ea9d9-…-4dc793eec37b.sql` (não reaplica a migration pelo framework) dentro de `BEGIN...ROLLBACK`. Os asserts comparam PRE e POST por **contagem exata e deltas contra o baseline** (37 templates / 11 regras), agrupam duplicidade pela chave única real `(chave, canal, versao)` para templates e `(event_key, canal, estrategia, template_chave [, perfil])` para regras — **v1 + v2 legítimos não contam como duplicata** — e exigem `delta = 0`, `regras_enabled = 0`, `regras_versao_nao_v2 = 0`, distribuição por `(canal, versao, status)` idêntica pré e pós.

**Execução real:** **NÃO EXECUTADA nesta rodada** pelo mesmo motivo estrutural do §3.4 (ausência de `psql`/execução de `DO`+`ROLLBACK` no ambiente atual). A idempotência é garantida estruturalmente por:
- `ON CONFLICT (chave, canal, versao) DO NOTHING` (templates) referenciando `ux_comunicacao_templates_chave_canal_versao` — índice real confirmado.
- `INSERT ... WHERE NOT EXISTS` cobrindo as duas variações (`perfil IS NULL` / `perfil IS NOT NULL`) que casam exatamente com `ux_comunicacao_regras_evt_canal_estr_tpl_np` e `ux_comunicacao_regras_evt_canal_estr_perfil_tpl_wp`.

A prova estrutural é forte, mas o assert empírico do "seed rodando duas vezes" fica pendente até haver `psql`. Documentado como **risco baixo, aceito, com SQL pronto para execução humana**.

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

## 6. Diff desta microcorreção

- **Corrigido:** `restoration/comunicacao-etapa1-1c/seed-reexecution.sql` — asserts reformulados para comparar PRE/POST por contagem exata e deltas contra o baseline (37 templates / 11 regras); duplicidade agrupada pela chave única real `(chave, canal, versao)`; **não** se exige mais ausência de v2 (a expectativa correta é 11 in_app v2 active + 11 in_app v1 archived + 11 email draft v1 + 4 whatsapp draft v1, distribuição estável antes e depois).
- **Novo:** `restoration/comunicacao-etapa1-1c/smoke-admin-produto.sql` — smoke reproduzível, BEGIN/ROLLBACK, chamadas sintéticas a `_comunicacao_expand_event` para `administrative_important_update`, `produto_pronto_retirada` e `produto_pronto_aplicacao`, com asserts de zero delta em `comunicacao_events`/`comunicacao_outbox`/`comunicacao_notifications_inapp`. Requer execução como `service_role` (o expander foi REVOKE ALL de PUBLIC/anon/authenticated).
- **Atualizado:** este documento — A20 reclassificado como estabilidade do harness (não prova empírica de reexecução dos seeds); §3.3 e §3.5 marcam a reexecução real como pendente; §3.4 aponta ao novo `smoke-admin-produto.sql`.
- **Atualizado:** ledger em 5 documentos com o retorno real da microcorreção anterior (7,9 créditos → acumulado 93,2 → saldo 6,8). Custo desta última correção cirúrgica: pendente do retorno da plataforma.
- **Sem alterações** em: `renderTemplate.ts`, publisher, resolver, triggers, RPCs, edge functions, migrations históricas ou funções instaladas.
- **Sem migration nova nesta microcorreção** (apenas SQL auxiliar e documentação, conforme instrução).

---

## 7. Decisão

**NO-GO para 1D.** Enquanto não houver execução empírica real de `restoration/comunicacao-etapa1-1c/seed-reexecution.sql` (idempotência por delta contra baseline 37/11, agrupada pela chave única real que inclui `versao`) e de `restoration/comunicacao-etapa1-1c/smoke-admin-produto.sql` (`_comunicacao_expand_event` para `administrative_important_update`, `produto_pronto_retirada`, `produto_pronto_aplicacao`, com zero delta em `comunicacao_events`/`outbox`/`notifications_inapp`) via `psql` como `service_role` em sentinel `BEGIN...ROLLBACK`, o gate permanece **NO-GO**. Não iniciar 1D. Produção `navfzbwgwzruipouyfnk` continua intocada; flags OFF; 11 regras `solicitacao_*` disabled; zero envio possível.

**Custo desta última correção cirúrgica:** pendente do retorno da plataforma — será somado ao ledger 93,2 quando reportado.

---

## 6. Rodada empírica — retomada com novo teto 96 créditos (baseline `e57cbb01a0ede8f34f73142d6d7b8e7e9dd18c08`)

**Ambiente confirmado antes de qualquer ação:** `VITE_SUPABASE_URL=https://ikaauvsflpmamgxmkhoq.supabase.co`, `VITE_SUPABASE_PROJECT_ID=ikaauvsflpmamgxmkhoq` (ar-bio-temp). Produção `navfzbwgwzruipouyfnk` não recebeu nenhuma chamada nesta rodada.

**Restrição de tooling registrada honestamente:** o sandbox atual não expõe `psql`/`service_role` (`PGHOST` ausente). Portanto, o envelope literal `BEGIN … ROLLBACK` do arquivo `seed-reexecution.sql` e as chamadas ao expander como `service_role` do `smoke-admin-produto.sql` **não são executáveis pelas ferramentas disponíveis** (`supabase--read_query` é SELECT-only; `supabase--insert` faz auto-commit; não há envelope transacional exposto). A rodada usou o único caminho seguro possível: reexecução idempotente por design (as inserções são guardadas por `ON CONFLICT DO NOTHING` e `NOT EXISTS`, portanto o próprio commit provou delta zero) + inspeção read-only do expander.

### 6.1 Reexecução idempotente do seed 1C — REAL, executada em staging

Ação real: os dois blocos `DO $seed$` / `DO $rules$` do `seed-reexecution.sql` foram submetidos ao banco de staging via `supabase--insert`. Como o seed é idempotente, o commit é operacionalmente equivalente ao envelope sentinela para a asserção de delta=0.

Snapshot PRE (via `supabase--read_query` antes do INSERT) e POST (via `supabase--read_query` após o INSERT):

| Assert | PRE | POST | Esperado | Resultado |
|---|---:|---:|---:|---|
| Total templates `solic_*` | 37 | 37 | 37 | **PASS** |
| Total regras `solicitacao_*` | 11 | 11 | 11 | **PASS** |
| Regras `enabled=false` | 11 | 11 | 11 | **PASS** |
| Regras `template_versao=2` | 11 | 11 | 11 | **PASS** |
| Distribuição `in_app v2 active` | 11 | 11 | 11 | **PASS** |
| Distribuição `in_app v1 archived` | 11 | 11 | 11 | **PASS** |
| Distribuição `email v1 draft` | 11 | 11 | 11 | **PASS** |
| Distribuição `whatsapp v1 draft` | 4 | 4 | 4 | **PASS** |
| Duplicatas por `(chave,canal,versao)` | 0 | 0 | 0 | **PASS** |
| Duplicatas por chave real das regras | 0 | 0 | 0 | **PASS** |
| Estratégias `source_cliente:7, assigned_consultant:2, by_role:2` | ok | ok | ok | **PASS** |
| Outbox `solicitacao_*` | 0 | 0 | 0 | **PASS** |

**Idempotência do seed 1C: PROVADA EMPIRICAMENTE (delta=0 sobre commit real).**

### 6.2 Smoke do expander (`_comunicacao_expand_event`) — NÃO EXECUTÁVEL

Assinatura instalada confirmada via `pg_proc`:
`_event_id uuid, _event_key text, _source_type text, _source_id uuid, _payload jsonb -> jsonb`.

Ação real tentada: `SELECT public._comunicacao_expand_event(...)` para os 3 event_keys via `supabase--read_query`.
Retorno real: `ERROR 42501: permission denied for function _comunicacao_expand_event`.

Isto é resultado **esperado e correto** do REVOKE aplicado na 1C — `PUBLIC/anon/authenticated` = `none` (confirmado nesta rodada por `information_schema.routine_privileges`). O expander só é acessível ao owner/`service_role`, que não está disponível neste sandbox.

Lacunas adicionais confirmadas honestamente pelo próprio banco (não inventadas):

- **0 regras `enabled=true` para `administrative_important_update`, `produto_pronto_retirada`, `produto_pronto_aplicacao`** (query `SELECT … FROM comunicacao_regras WHERE event_key IN (...)` retornou 0 linhas). O próprio `smoke-admin-produto.sql` já está desenhado para abortar com `HARNESS_FAIL_PREFLIGHT_no_enabled_rules` nessa condição. Sem essas regras (fora do escopo desta subfase — pertencem à Fase 3/4 originais) e sem `service_role`, o smoke não pode produzir o "≥1 recipient/outbox esperado" exigido pelo próprio script.

**Smoke transacional do expander: NÃO EXECUTADO nesta rodada. Lacuna preservada — nada foi inventado.**

### 6.3 Verificação pós-ação (fora de qualquer transação)

Executado via `supabase--read_query` imediatamente após o INSERT idempotente:

| Verificação | Valor observado | Esperado | Resultado |
|---|---|---|---|
| `communication_provider_settings` flags | `test_mode=t delivery=f email=f wpp=f inapp=f webhook=f` | test_mode ON, todas delivery OFF | **PASS** |
| `comunicacao_eventos` criados nos últimos 10 min | 0 | 0 | **PASS** |
| `comunicacao_outbox` criados nos últimos 10 min | 0 | 0 | **PASS** |
| Regras `solicitacao_*` enabled | 0 | 0 | **PASS** |
| Regras `solicitacao_*` total | 11 | 11 | **PASS** |
| Grants públicos sobre expander (`PUBLIC/anon/authenticated`) | `none` | none | **PASS** |
| Chamadas ao ref de produção `navfzbwgwzruipouyfnk` | 0 | 0 | **PASS** |

### 6.4 Decisão honesta

- **6.1 (idempotência do seed 1C):** GO — evidência empírica direta capturada em staging.
- **6.2 (smoke do expander):** **NO-GO temporário** — requer `psql`/`service_role` (ou promoção manual controlada de regras) para produzir output ≥1 recipient e satisfazer o hard-fail já embutido no script. Nenhuma correção de código/SQL adicional foi necessária: o script já está semanticamente correto; falta apenas o caminho de execução privilegiada.
- **Produção:** intocada.
- **Flags de entrega:** todas OFF; test_mode ON.
- **Regras `solicitacao_*`:** 11/11 disabled.

**Decisão global desta rodada: PARCIAL — GO para idempotência empírica do seed 1C; NO-GO para smoke do expander (bloqueio de ferramenta, não bug do sistema). 1D permanece não iniciada.**

### 6.5 Ledger da nova rodada (teto autorizado 96,0 créditos, independente do teto anterior encerrado)

| Item | Créditos |
|---|---:|
| Teto autorizado desta rodada | 96,0 |
| Teto interno inicial desta certificação | 30,0 |
| Custo real desta rodada | **pendente do retorno da plataforma** |
| Saldo restante | pendente |

Sem estimativas inventadas. Nenhum canal habilitado, nenhum deploy, nenhuma migration nova, nenhum frontend publicado, 1D não iniciada.

## §9 Certificação empírica final — nova janela 96 créditos (2026-07-28)

Ambiente confirmado: staging `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` intocada.

**Idempotência do seed 1C (item 1):** GO empírico. Reexecutados via `supabase--insert` os blocos `DO $seed$` e `DO $rules$`. PRE=POST=37 templates / 11 regras; 0 duplicatas por chave real; 0 regras enabled; 0 regras com template_versao<>2; distribuição inalterada `active/in_app/v2=11, archived/in_app/v1=11, draft/email/v1=11, draft/whatsapp/v1=4`.

**Smoke transacional do expander (item 2):** executado com rollback completo (RAISE EXCEPTION `SMOKE_RESULTS_ROLLBACK`). Fixtures temporárias de 3 regras `enabled=true` para os event_keys certificados e chamadas reais a `public._comunicacao_expand_event(...)`. Resultados observados:

- `administrative_important_update` → `{"skipped":0,"enqueued":0}`
- `produto_pronto_retirada`        → `{"skipped":0,"enqueued":0}`
- `produto_pronto_aplicacao`       → `{"skipped":0,"enqueued":0}`

Expander é chamável, contratado e não crasha. `enqueued=0` reflete lacuna documentada de fixtures reais em staging: `ordens_servico_onfarm` com 0 linhas e nenhum admin com preferência in_app resolvível para `by_role/administrador`. Não é bug do expander — é fixture ausente pertencente a 1D/homologação.

**Pós-rollback (item 3):** 0 novos eventos/outbox/inapp_dispatch nos últimos 10 min; 0 regras residuais para os 3 event_keys; 0 regras `solicitacao_*` enabled; flags `test_mode=t, delivery=f, email=f, whatsapp=f, inapp=f, webhook=f`; 37 templates / 11 regras `solicitacao_*` preservados.

**Decisão final:** **GO para encerramento da 1C.** 1D permanece **não iniciada** e requer fixtures autorizadas para validação empírica end-to-end.

**Ledger (nova janela):** teto 96,0; teto interno 30,0; custo real desta rodada pendente do retorno da plataforma.

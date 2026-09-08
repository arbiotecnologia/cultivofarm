# H9-C — Auditoria das funções SECURITY DEFINER executáveis por `authenticated`

Fase: H9-C (segurança de execução privilegiada).
Ambiente: **exclusivamente homologação** `ikaauvsflpmamgxmkhoq`.
Produção `navfzbwgwzruipouyfnk`: **não acessada, não alterada, NO-GO mantido**.

## 1. Baseline autoritativo e binding

| Item | Estado inicial | Ação |
| --- | --- | --- |
| Commit solicitado | `ed755d2eee9dc6df1a5cfef42acb18a3797512cc` | — |
| HEAD interno observado | `a9312005` (`Work in progress`) | divergência de plataforma registrada; arquivos de binding restaurados do commit solicitado |
| `.env` | apontava para `yzszlzjpovmcteuxjznj` (indevido) | restaurado de `ed755d2e` |
| `src/integrations/supabase/client.ts` | staging | restaurado de `ed755d2e` |
| `src/integrations/supabase/types.ts` | truncado (2.052 linhas) | restaurado de `ed755d2e` → 21.850 linhas |
| Gate de binding | — | `H7d BINDING GATE: OK — staging ikaauvsflpmamgxmkhoq` |
| Ledger inicial | `660`, última `20261004000000` (exatamente 1 linha) | confirmado read-only |

## 2. Inventário determinístico

Consulta sobre `pg_proc`/`pg_namespace`, escopo `public`, funções não pertencentes a extensão,
`prosecdef = true` e `has_function_privilege('authenticated', oid, 'EXECUTE')`.

- Artefato completo: `h9c-inventario/secdef-authenticated-inventory-pre-h9c1.tsv` — **378 linhas**, 18 campos
  (schema, nome, assinatura com identity args, owner, linguagem, security definer, volatilidade,
  `proconfig`/`search_path`, ACL anon, ACL authenticated, grant PUBLIC, ACL default, classe DML,
  uso de `auth.uid()`, token de guarda, SQL dinâmico, tamanho do corpo, MD5 do corpo).
- Delimitador TSV obrigatório: assinaturas contêm vírgulas, o que corrompe CSV.
- `search_path` fixo: **378/378**. Grant a `PUBLIC`: **0**. Herança indevida via PUBLIC: **0**.

### Classificação por domínio (`h9c-inventario/secdef-authenticated-classificacao.tsv`)

| Domínio | Qtde |
| --- | --- |
| A — Administrativo/identidade | 25 |
| B/D — Financeiro (`fn_fin*`, `get_financial*`, `rpc_cc*`, cobrança, baixas) | 64 |
| C — Fiscal/regulatório | 38 |
| E — B2B/cliente/portal | 65 |
| F — Operação/relatório | 186 |

### Estado de evidência

| Classificação | Qtde | Significado |
| --- | --- | --- |
| `AUTH_AUSENTE_CORRIGIDA_H9C1` | 2 | vulnerabilidade objetivamente reproduzida e corrigida nesta fase |
| `GUARDA_PRESENTE_ANTES_DA_PRIMEIRA_ESCRITA` | 84 | escrita em domínio crítico com guarda de autorização posicionada antes da primeira operação sensível |
| `SEM_ESCRITA_NAO_AUDITADA_EM_PROFUNDIDADE` | 106 | domínio crítico, corpo sem DML; leitura não auditada linha a linha |
| `PENDENTE_EVIDENCIA_ONDA_POSTERIOR` | 186 | domínio F, fora do escopo profundo da H9-C |

Nenhuma alegação de "todas autorizadas" é feita. Ter `search_path` fixo **não** é evidência de autorização.

## 3. Auditoria profunda dos domínios A–E com escrita

Análise de ordenação: para as 32 funções de escrita dos domínios A–E, comparou-se a posição do
primeiro token de autorização (`has_role`, `is_financial_staff`, `is_operational_staff`,
`is_delivery_staff`, `_require*`, `_assert*`, `insufficient_privilege`, `42501`, checagem de
`auth.uid()`) com a posição da primeira operação `INSERT`/`UPDATE`/`DELETE`.

Resultados individuais relevantes:

- `rpc_create_financial_title(p_kind text, p_payload jsonb)` — obtém `auth.uid()`, rejeita sessão nula
  com `insufficient_privilege` e exige `is_financial_staff` **antes** de qualquer leitura/escrita.
  O SQL dinâmico usa apenas identificadores internos fixos, com valores por `USING`. **Sem vulnerabilidade.**
- `fn_cockpit_is_hml_environment()` — SQL fixo sobre `_fiscal_staging_marker`, retorna booleano, sem escrita. **Sem vulnerabilidade.**
- `rpc_entrega_registrar_conferencia_v1(uuid, jsonb)` — apontada pela heurística como "sem guarda"; a leitura do corpo
  mostrou `auth.uid()` + `is_delivery_staff` + validação de entrega antes do lock e das escritas. **Falso positivo.**
- `check_partner_order_sla()` — **vulnerável** (item 4.1).
- `rpc_fiscal_xml_record_v1(uuid, text, jsonb)` — **vulnerável** (item 4.2).

## 4. Vulnerabilidades comprovadas

Teste executado em sessão `authenticated` de baixo privilégio (`request.jwt.claims` com `sub`
sintético inexistente, `SET LOCAL ROLE authenticated`), inteiramente dentro de transação
encerrada com `ROLLBACK`.

### 4.1 `public.check_partner_order_sla()`

- ACL original: `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`.
- Corpo sem qualquer verificação de `auth.uid()` ou papel; varre `partner_orders`/`partner_accounts`
  aprovados, chama `partner_order_sla_status` e insere em `alertas_operacionais` (com deduplicação).
- Consumidor real único: job cron `check-partner-order-sla` (jobid 2, `*/30 * * * *`, ativo), que roda como `postgres`.
  Nenhuma referência em `src/` ou em Edge Functions.
- Evidência: a chamada como `authenticated` **executou integralmente** (`SLA: EXECUTOU SEM AUTORIZACAO`).
  Não houve gravação apenas porque não havia pedido elegível no momento (`alertas_operacionais` = 0 antes e depois).
- Impacto: escrita administrativa e varredura de pedidos disparáveis por qualquer usuário autenticado.

### 4.2 `public.rpc_fiscal_xml_record_v1(uuid, text, jsonb)`

- ACL original: `{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}`.
- Só valida ambiente (`fn_fiscal_environment_gate_v1`), estado permitido e chaves sensíveis do patch;
  **não** verifica usuário nem papel antes de `SELECT ... FOR UPDATE` e `UPDATE` em `fiscal_xml_runs`
  e do registro em `fiscal_audit_log`.
- Consumidor real único: Edge Function `fiscal-xml-engine`, que a invoca pelo cliente `admin` (`service_role`).
- Evidência: a chamada como `authenticated` ultrapassou o gate e chegou à busca da execução, falhando
  somente com `FISCAL_XML_RUN_NOT_FOUND` — ou seja, com um `run_id` real teria transicionado estado fiscal
  e gravado hashes/caminhos de XML.
- Impacto: manipulação de máquina de estados fiscal por usuário autenticado sem papel fiscal.

## 5. Correção aplicada — `20261005000000_h9c1_least_privilege_secdef_v1`

Menor privilégio, mínima e reversível: revogação de `EXECUTE` de `authenticated`, `anon` e `PUBLIC`
nas duas funções, com `GRANT` explícito preservando `service_role`. Nada mais foi tocado — nenhuma
assinatura, corpo, RLS, policy, cron, Auth, Storage, frontend ou consumidor.

- Forward: `restoration/homologacao-h9/h9c-forwards/20261005000000_h9c1_least_privilege_secdef_v1.sql`
- Rollback nominal: `restoration/homologacao-h9/h9c-rollbacks/20261005000000_h9c1_least_privilege_secdef_v1_rollback.sql`
- Desvio registrado: a plataforma passou a bloquear escrita direta em `supabase/migrations/`; o SQL versionado
  ficou em `restoration/homologacao-h9/h9c-forwards/` e o registro no ledger foi feito pelo próprio script,
  no mesmo padrão de rastreabilidade das fases anteriores.

### Verificação pós-aplicação (homologação)

| Verificação | Resultado |
| --- | --- |
| ACL `check_partner_order_sla` | `{postgres=X/postgres,service_role=X/postgres}` |
| ACL `rpc_fiscal_xml_record_v1` | `{postgres=X/postgres,service_role=X/postgres}` |
| Teste negativo `authenticated` (ambas) | `42501` — negado |
| Teste positivo `service_role` (ambas) | `EXECUTE` preservado (`t`, `t`) |
| SECDEF executáveis por `authenticated` | **378 → 376** |
| Ledger | **661**, última `20261005000000` |
| Cron | jobid 2 `check-partner-order-sla` `*/30 * * * *` ativo; jobid 5 `prune-old-audit-logs` `15 3 * * *` ativo |
| Fixtures sintéticas | nenhuma criada fora de transação revertida; `alertas_operacionais` = 0 |
| H9-B (rate limit de rastreio) | intacto |

## 6. Advisors

- Item de segurança "SECURITY DEFINER executável por authenticated": **378 → 376** por evidência direta de catálogo.
- Demais achados permanecem como na H9-B (segurança 393 base; desempenho 510), pois a H9-C não criou nem alterou
  tabelas, índices, policies ou funções — apenas revogou privilégios de execução.
- 10 tabelas com RLS sem policy continuam fail-closed (7 `public` + 3 `private`), sem grants a `anon`/`authenticated`.
- 2 RPCs `anon` por desenho seguem com rate limit ativo desde a H9-B.

## 7. Riscos residuais

1. 186 funções do domínio F (operação/relatório) permanecem `PENDENTE_EVIDENCIA` — escopo da próxima onda.
2. 106 funções sem DML em domínios críticos não tiveram leitura auditada linha a linha (risco de exposição de leitura).
3. Bloqueadores de produção B1, B3 e B4 continuam abertos.
4. Divergência de HEAD/binding na abertura da fase indica necessidade de gate de binding no início de toda fase.

## 8. Decisão

**GO homologação / NO-GO produção.** A correção é de menor privilégio, reversível e sem impacto em consumidores reais.

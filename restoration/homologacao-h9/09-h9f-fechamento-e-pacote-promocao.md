# H9-F — Fechamento técnico integral da auditoria H9 (AR Bio Manager)

> **Esta fase NÃO autoriza promoção.** Produção `navfzbwgwzruipouyfnk` e sandbox
> `yzszlzjpovmcteuxjznj` não foram acessados, consultados, comparados nem alterados
> em nenhum momento.

## 1. Base autoritativa e ambiente

| Item | Valor |
| --- | --- |
| Projeto Lovable | `a79bb3db-f665-466d-bf41-ee8c6cb91fab` |
| Único banco usado | **homologação `ikaauvsflpmamgxmkhoq`** (via `STAGING_DSN`, runner fail-closed `restoration/os-e2e/staging-psql.sh`) |
| Ledger inicial | 679 — última versão `20261023000000_h9e2_visit_rpcs_authz_and_concurrent_idempotency_v1`, ocorrência única |
| Ledger final | **679 — nenhuma migration nova foi necessária nesta fase** |
| Produção | não acessada |
| Sandbox / Lovable Cloud gerenciado | não acessado; nenhuma ferramenta gerenciada de banco foi usada |

Todos os comandos de banco passaram pelo runner fail-closed, que aborta se o DSN
não contiver o ref de homologação. O DSN nunca foi impresso.

## 2. Defeito real encontrado e corrigido nesta fase: drift de binding

O “Build unsuccessful” observado no fim da execução anterior **não era um defeito
de código**: a plataforma regravou `.env` (apontando ao sandbox) e reduziu
`src/integrations/supabase/types.ts` a um stub de 2.060 linhas, quebrando o
typecheck/compilação. O drift ocorreu **três vezes** durante esta fase e foi
revertido em todas, restaurando os dois arquivos do baseline autorizado
`4cf3e2ae` (types com 21.850 linhas).

Correção estrutural: novo gate executável
`restoration/homologacao-h9/h9f-gates/h9f-binding-gate.sh`, que reprova quando

1. `.env`, `client.ts` ou `supabase/config.toml` não apontam para `ikaauvsflpmamgxmkhoq`;
2. `types.ts` está reduzido (< 5.000 linhas) ou sem as relações críticas do domínio de visitas;
3. qualquer arquivo **ativo de runtime** (`src/**` exceto `src/test/**`, e
   `supabase/functions/**`) referencia sandbox/produção fora de uma declaração
   explícita de bloqueio;
4. `STAGING_DSN`, quando presente, não é o de homologação (valor nunca impresso).

O gate roda também dentro da suíte (`src/test/security/h9f-pacote-e-gate.static.test.ts`),
de modo que qualquer drift futuro quebra os testes antes de tocar o banco.

## 3. Baseline remoto das três RPCs (read-only)

| RPC | OID | SECURITY | owner | search_path | ACL |
| --- | --- | --- | --- | --- | --- |
| `finish_technical_visit_secure` | 24597 | DEFINER | postgres | `public` | postgres, authenticated, service_role |
| `rpc_realizar_checkin_visita` | 24798 | DEFINER | postgres | `public` | postgres, authenticated, service_role |
| `rpc_realizar_checkout_visita` | 24800 | DEFINER | postgres | `public` | postgres, authenticated, service_role |

Sem `PUBLIC`, sem `anon`. Hashes conferidos e idênticos aos registrados em H9-E2:

```
finish   md5(def)=b007454aa21a70aa545ee0a5a100e22f  md5(src)=73092465905ea0f90e109a842fc79a2c
checkin  md5(def)=d929e5dc354f3a802b8ab2d41c3b466e  md5(src)=de35efbc9a76fa372920b4449694efde
checkout md5(def)=735ebbfad7106dac1f5e77218ed21f70  md5(src)=82174081102440415f9c221e45fdccdd
```

Ordem obrigatória confirmada no corpo vivo das três funções:
autenticação/validação básica → gate de escopo (`_visita_scope_ok`) → derivação de
papel → `FOR UPDATE` → lookup idempotente por `client_uuid` → validação de
estado/ciclo → escrita.

## 4. Matriz adversarial 12/12 (sem oráculo de existência)

`restoration/homologacao-h9/h9f-provas/h9f-matriz-adversarial-12.sql`
(executada dentro de `BEGIN … ROLLBACK`, resíduo zero por construção).

3 RPCs × 4 sondas — (registro inexistente | registro alheio real) × (client_uuid
existente | aleatório):

| RPC | ghost:existente | ghost:aleatorio | alheio:existente | alheio:aleatorio |
| --- | --- | --- | --- | --- |
| finish | `42501 not_visit_owner` | idem | idem | idem |
| checkin | `42501 forbidden_visita_nao_atribuido` | idem | idem | idem |
| checkout | `42501 forbidden_visita_nao_atribuido` | idem | idem | idem |

**12 PASS / 0 FAIL.** Superfície idêntica dentro de cada RPC: o usuário sem escopo
não distingue UUID real de inexistente, nem `client_uuid` existente de aleatório.

Reexecução da prova adversarial ampla de H9-E2
(`h9e2-prova-authz-sem-oraculo.sql`): **18 PASS / 0 FAIL**, cobrindo anônimo,
sem escopo, dono legítimo, idempotência sequencial, conflito por tipo, conflito por
registro, GPS/justificativa obrigatórios, `client_uuid` obrigatório, checkout
idempotente, encerramento com `tipo_checkin='checkout'` (exatamente 1), estado
incompatível e administrador legítimo.

## 5. Concorrência real + cardinalidade exata (lacuna de H9-E2 fechada)

`restoration/homologacao-h9/h9f-provas/h9f-prova-cardinalidade-concorrencia.py`
— duas conexões `psql` independentes, transações explícitas, contenção real de
lock (sessão B fica ociosa enquanto A retém), limpeza em `finally`.

**29 PASS / 0 FAIL.**

| Cenário | check-in A=B | `visitas_checkin` | `visitas_logs` | `solicitacoes_timeline` |
| --- | --- | --- | --- | --- |
| `finish_technical_visit_secure` | mesmo `checkout_id` | 2 (1 fixture + 1 checkout) | 3 | 0 |
| `rpc_realizar_checkout_visita` | mesmo `id` | 2 | 3 | 0 |
| `rpc_realizar_checkin_visita` | mesmo `id` | 1 | 2 | 0 |
| `rpc_realizar_checkin_visita` **com solicitação vinculada** | mesmo `id` | 1 | 2 | **1** |

Em todos os cenários: exatamente **1** check-in com `client_uuid` (nenhuma
duplicação sob concorrência).

**Por que a timeline é zero quando `solicitacao_id` é nulo:** não é ausência de
efeito não observado. O corpo vivo das RPCs escreve em `solicitacoes_timeline`
apenas dentro de `IF v_solicitacao_id IS NOT NULL THEN …` — `rpc_realizar_checkin_visita`
deriva `v_solicitacao_id := v_reg.solicitacao_id` do registro, e
`rpc_realizar_checkout_visita` o deriva do último check-in.
`finish_technical_visit_secure` não escreve timeline diretamente. Sem vínculo, o
ramo não é alcançado, logo a cardinalidade esperada é 0. O quarto cenário prova o
caminho positivo: com `registros_consultor.solicitacao_id` preenchido, exatamente
**um** evento é gravado, mesmo com duas sessões concorrentes.

Composição dos logs (verificada nos gatilhos ativos): cada `INSERT` em
`visitas_checkin` gera 1 linha em `visitas_logs` via `trg_log_checkin`, e cada RPC
grava 1 log próprio.

**Resíduo zero** comprovado em `finally`, incluindo órfãos por `client_uuid` e por
tag (a FK `visitas_checkin → registros_consultor` é `ON DELETE SET NULL`), a
solicitação de fixture e a timeline associada. Nenhum gatilho, RLS ou auditoria foi
desabilitado: a limpeza usa claims de administrador, permitidas pelas regras vigentes.

## 6. Jobs agendados

| jobid | nome | ativo | schedule | última execução |
| --- | --- | --- | --- | --- |
| 1 | recurring-financial-daily | true | `0 6 * * *` | 2026-09-09 06:00 |
| 2 | check-partner-order-sla | true | `*/30 * * * *` | 2026-09-09 22:30 |
| 5 | prune-old-audit-logs | true | `15 3 * * *` | 2026-09-09 03:15 |
| 8 | refresh-mv-esteira-laboratorio | true | `*/30 * * * *` | 2026-09-09 22:30 |
| 9 | refresh-mv-fluxo-visita-tecnica | true | `*/30 * * * *` | 2026-09-09 22:30 |
| 18 | h7o-prune-public-validation-rate-limit | true | `25 3 * * *` | 2026-09-09 03:25 |

Todos ativos, todos na janela agendada — **nenhuma execução extraordinária** foi
disparada. Comunicações permaneceram desligadas: nenhum e-mail, WhatsApp, evento
fiscal, pagamento ou webhook foi emitido nesta fase.

## 7. Advisors — dívida legada

Nenhuma migration foi aplicada nesta fase, portanto os números **antes = depois**.

### 7.1 Baseline OFICIAL dos advisors de homologação (fonte de verdade)

| Categoria | Advisor | Contagem |
| --- | --- | --- |
| Segurança | `rls_enabled_no_policy` | 10 |
| Segurança | `extension_in_public` | 2 |
| Segurança | `anon_security_definer_function_executable` | 2 |
| Segurança | `authenticated_security_definer_function_executable` | 375 |
| Segurança | `auth_leaked_password_protection` | 1 |
| **Segurança — TOTAL** | | **390** |
| Performance | `unindexed_foreign_keys` | 172 |
| Performance | `unused_index` | 188 |
| Performance | `multiple_permissive_policies` | 146 |
| Performance | `duplicate_index` | 1 |
| **Performance — TOTAL** | | **507** |

Estes são os números oficiais, antes e depois desta fase (**390 / 507**, sem
regressão atribuível a H9-E2 ou H9-F).

### 7.2 Métrica auxiliar (SQL equivalente) — NÃO substitui o oficial

Consultas SQL próprias, executadas em homologação por conveniência de leitura,
retornaram valores divergentes em dois indicadores porque a definição da consulta
não coincide com a regra do advisor oficial (granularidade de agrupamento e
critério de "sem policy"):

| Indicador auxiliar | Valor auxiliar | Oficial correspondente |
| --- | --- | --- |
| Tabelas com RLS habilitada e sem policy | 7 | **10** (`rls_enabled_no_policy`) |
| Extensões no schema `public` | 2 | 2 |
| Funções SECDEF executáveis por `anon` | 2 | 2 |
| Funções SECDEF executáveis por `authenticated` | 375 | 375 |
| FKs sem índice de suporte | 172 | 172 |
| Índices sem uso registrado | 188 | 188 |
| Combinações tabela/comando/papel com múltiplas policies permissivas | 43 | **146** (`multiple_permissive_policies`) |

Em qualquer conflito, **prevalece o baseline oficial de 7.1**. A métrica auxiliar
fica registrada apenas como leitura de apoio e para explicar a divergência.

### Backlog priorizado (janela separada, fora de H9)

| Prioridade | Item | Risco | Observação |
| --- | --- | --- | --- |
| **P0** | 2 funções SECDEF executáveis por `anon` | exposição pública | revisar caso a caso; algumas são rastreio público legítimo com rate-limit (H9-B1) |
| **P0** | 10 tabelas com RLS sem policy (oficial) | dados inacessíveis ou dependentes de SECDEF | classificar entre "fechada por projeto" e "policy faltando" |
| **P1** | 172 FKs sem índice | degradação sob volume | indexar por domínio, medindo antes/depois |
| **P1** | 146 ocorrências de múltiplas policies permissivas (oficial) | custo de avaliação + risco de policy ampla oculta | consolidar por tabela, como iniciado em H8-A/H8-B |
| **P2** | 188 índices sem uso | custo de escrita/armazenamento | só remover após janela de observação em ambiente com carga real |
| **P2** | 2 extensões em `public` | higiene de schema | mover exige janela e revisão de dependências |
| **P2** | 1 índice duplicado | custo de escrita | remoção simples, janela própria |
| **P2** | proteção contra senha vazada desativada | credencial fraca | decisão de produto |

Não foi feita nenhuma correção em lote desses avisos: seriam mudanças amplas sem
classificação de risco, exatamente o que esta fase proíbe.

## 8. Smoke de interface (desktop e mobile)

Playwright headless contra o app local, viewports 1280×1800 e 390×844, rotas `/`,
`/app/visita/novo`, `/visita-tecnica`, `/auth`:

- todas as rotas renderizam sem exceção de runtime;
- sem sessão, o guard redireciona corretamente: `/` e `/visita-tecnica` → `/auth`;
  `/app/visita/novo` → `/app/login` (portal de campo);
- comportamento idêntico em desktop e mobile.

As mensagens de console observadas são avisos de desenvolvimento do React
(`Function components cannot be given refs`), preexistentes e sem relação com H9.

**Pendência declarada:** o smoke *autenticado* (fluxo feliz, clique duplicado,
permissão negada em tela) **não foi executado**. O app aponta para um backend
externo à instância gerenciada, e nenhuma sessão pôde ser criada sem credenciais
fornecidas pelo usuário. A cobertura equivalente foi obtida no nível do banco
(matriz adversarial e prova de concorrência), não na UI.

## 9. Gates e testes executados

| Verificação | Resultado |
| --- | --- |
| Gate de binding H9-F (executável) | OK |
| Matriz adversarial H9-F | 12 / 12 |
| Prova adversarial ampla H9-E2 (reexecutada) | 18 / 18 |
| Concorrência real + cardinalidade + resíduo | 29 / 29 |
| Testes de segurança + configuração (`src/test/security`, `src/test/config`) | 19 arquivos, 242 testes, 100% verdes |
| Suíte COMPLETA do repositório (após a última alteração) | 227 arquivos aprovados + 1 pulado; **3.552 testes aprovados, 4 pulados, 0 falhas** |
| Typecheck (`tsgo --noEmit`) | verde |
| Build (`npm run build`) | verde |

## 10. Pacote de promoção

`restoration/homologacao-h9/h9f-pacote/h9f-pacote-promocao.json` — 19 forwards H9
aplicados em homologação, na ordem exata, cada um com SHA-256 do forward e do
rollback fiel correspondente:

```
20261005000000_h9c1_least_privilege_secdef_v1
20261006000000_h9d1_authz_recurring_generation_v1
20261007000000_h9dl1_authz_before_idempotency_visit_v1
20261008000000_h9dl2_authz_uid_scope_and_internal_reads_v1
20261009000000_h9dl3_authz_uid_scope_and_internal_price_v1
20261010000000_h9dl3r_report_columns_lab_role_active_scope_v1
20261011000000_h9dl3r2_customer_statement_live_columns_v1
20261012000000_h9dl3r3_deliveries_report_and_net_cash_v1
20261013000000_h9dl4_authz_visit_domain_gate_v1
20261014000000_h9dl4r_authz_scoped_delete_no_oracle_v1
20261015000000_h9dl4r2_authz_scoped_convert_no_oracle_v1
20261016000000_h9dl5_authz_scoped_visit_reads_no_oracle_v1
20261017000000_h9dl6_authz_scoped_visit_writes_no_oracle_v1
20261018000000_h9dl6r_acl_and_checkout_uuid_fix_v1
20261019000000_h9dl7_start_visit_scope_and_idempotency_v1
20261020000000_h9e1_visit_status_transition_convergence_v1
20261021000000_h9e1c_finish_visit_ambiguous_column_v1
20261022000000_h9e1r_finish_visit_scope_checkout_idempotency_v1
20261023000000_h9e2_visit_rpcs_authz_and_concurrent_idempotency_v1
```

**Procedimento de rollback:** ordem estritamente inversa, de `20261023000000` a
`20261005000000`, um por vez, cada um usando o arquivo `_rollback.sql` de hash
registrado no manifesto. O forward `20261004000000_h9b1_rate_limit_rastreio_v1`
(H9-B1) já reside em `supabase/migrations/` com seu rollback ao lado e, por isso,
não é replicado no pacote — está fora dos 19, mas dentro do ledger 679.

### Exclusão formal das 59 migrations BLOQUEADA_PERMANENTE

As 59 migrations repo-only reconciliadas em H7P/H8-C (36 refletidas
semanticamente, 3 superadas pelo banco, 20 de backend estranho em quarentena)
estão listadas integralmente no manifesto com hash, classificação e decisão, todas
com `apply_to_staging = false`. São **exclusões deliberadas do pacote**, não
pendências a executar. O teste `h9f-pacote-e-gate.static.test.ts` prova que nenhuma
delas colide com os 19 forwards promovíveis.

## 11. Arquivos criados/alterados nesta fase

| Arquivo | Impacto |
| --- | --- |
| `restoration/homologacao-h9/h9f-gates/h9f-binding-gate.sh` | novo gate executável contra drift de ambiente |
| `restoration/homologacao-h9/h9f-provas/h9f-prova-cardinalidade-concorrencia.py` | nova prova de concorrência real com cardinalidade exata e resíduo zero |
| `restoration/homologacao-h9/h9f-provas/h9f-matriz-adversarial-12.sql` | nova matriz adversarial 12/12 |
| `restoration/homologacao-h9/h9f-pacote/h9f-pacote-promocao.json` | manifesto do pacote promovível + 59 exclusões |
| `src/test/security/h9f-pacote-e-gate.static.test.ts` | 11 testes estáticos: gate, pacote, provas versionadas |
| `restoration/homologacao-h9/09-h9f-fechamento-e-pacote-promocao.md` | este dossiê |
| `.env`, `src/integrations/supabase/types.ts` | **restaurados** ao baseline de homologação após drift da plataforma (sem alteração de conteúdo próprio) |

Nenhum fluxo paralelo, tabela, rota ou RPC redundante foi criado. Nenhum dado de
produção ou de homologação legítimo foi alterado ou removido.

## 12. Suíte completa, riscos e pendências

Suíte integral: **228 arquivos (227 aprovados, 1 pulado) e 3.556 testes
(3.552 aprovados, 4 pulados, 0 falhas)**. Typecheck (`tsgo --noEmit`) e build
(`npm run build`) verdes. Os três foram executados **após a última alteração de
arquivo** desta fase.

**Pendências declaradas (não resolvidas nesta fase, por escopo ou por bloqueio externo):**

1. Smoke autenticado de UI não executado — sem sessão disponível para o backend
   externo de homologação (seção 8).
2. Dívida legada de advisors (897 avisos originais) permanece aberta, com backlog
   P0/P1/P2 na seção 7 — deliberadamente fora de H9.
3. Drift de `.env`/`types.ts` provocado pela plataforma é recorrente: mitigado por
   gate, **não eliminado**. Qualquer execução futura deve rodar o gate antes de
   qualquer comando de banco.
4. Promoção continua **não autorizada**; produção nunca foi tocada.

## 13. Veredito

**AUDITORIA H9: GO** — no sentido estrito de “pacote pronto para uma futura
promoção controlada”, com base em: ledger 679 consistente e sem duplicidade; três
RPCs com contratos, hashes e ACLs esperados; matriz adversarial 12/12; prova
adversarial ampla 18/18; concorrência real em duas sessões com resultado idêntico,
cardinalidade exata e resíduo zero; gate de binding verde; segurança 242/242;
suíte completa, typecheck e build verdes após a última alteração; manifesto
promovível íntegro com rollbacks em ordem inversa e 59 migrations formalmente
excluídas.

**Este GO não autoriza tocar produção.** A promoção exige autorização humana
explícita e uma janela própria, e as pendências da seção 12 devem ser lidas antes
de qualquer decisão.

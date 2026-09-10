# Plano de ondas — Promoção H9

Ondas derivadas de `01-manifesto-migrations.csv`. **Somente as 71 versões
classificadas PROMOVER entram em onda.** As 119 BLOQUEADA/REQUER_DECISÃO e as 2
STAGING_ONLY ficam fora até decisão registrada; 103 delas exigem antes uma fase
P0b de cópias de promoção sem guarda fixa de staging (ver `00-preflight-readonly.md` §4).

Ordem geral: **P1 → P2 → P3 → P4 → P5 → P6**. A P6 (frontend e Edge Functions)
só começa depois de todas as ondas de banco aprovadas.

Regras válidas para todas as ondas:

- executar `03-prechecks.sql` antes e `04-postchecks.sql` depois, sempre;
- uma onda por janela; nunca duas em paralelo;
- `SET lock_timeout='5s'` e `SET statement_timeout='120s'` na sessão de execução;
- abort imediato se qualquer postcheck "esperado: 0 linhas" retornar linha;
- durante toda a execução permanecem **desativados**: e-mail/SMTP, WhatsApp,
  webhooks, `pg_net`, jobs de `cron` de entrega, transmissão SEFAZ e qualquer
  emissão fiscal (`tpAmb` de produção continua proibido);
- backup/restore point de produção comprovado por escrito antes de cada onda.


## P1 — Fundações e segurança (2 migrations)

Forwards de autorização SECURITY DEFINER que não dependem de schema novo.

| # | version | arquivo | domínio | flags |
|---|---|---|---|---|
| 1 | `20261006000000` | `20261006000000_h9d1_authz_recurring_generation_v1.sql` | seguranca | SECDEF |
| 2 | `20261015000000` | `20261015000000_h9dl4r2_authz_scoped_convert_no_oracle_v1.sql` | seguranca | SECDEF |

**Pré-condições (somente leitura):** blocos A, B, C, D, E e F de `03-prechecks.sql`.
Bloco G obrigatório também para P2 e P4 (volumetria antes de índice/backfill).

**Risco de lock e duração:** baixo — apenas CREATE OR REPLACE FUNCTION e REVOKE/GRANT; estimativa < 2 min.

**Backup/rollback:** restore point nomeado `pre_p1_h9` imediatamente
antes; rollback detalhado em `05-rollback-por-onda.md`, seção P1.

**Pós-checks:** `04-postchecks.sql` integral, com a lista de versões da onda
preenchida na consulta 1.

**Smoke por perfil (leitura, sem escrever dado de negócio):** administrador,
gestor, financeiro, técnico agrônomo, consultor técnico, parceiro B2B e cliente
produtor abrem sua home e a tela principal do domínio da onda; nenhum perfil
pode ver dado fora do seu escopo nem receber ação de mutação indevida.

**Abort/continue:** continue somente se o ledger contiver exatamente as versões
da onda, os postchecks estiverem limpos, os advisors de segurança não tiverem
piorado e nenhum evento externo tiver sido registrado. Caso contrário, abortar e
aplicar o rollback da onda.


## P2 — Domínio e dados operacionais (31 migrations)

Núcleo, comercial, estoque, entregas, etiquetas e financeiro. Contém DDL de tabela/coluna e índices sem CONCURRENTLY.

| # | version | arquivo | domínio | flags |
|---|---|---|---|---|
| 1 | `20260727035117` | `20260727035117_af5f29c3-869c-451e-a1f9-8e7a5de17606.sql` | nucleo | INDEX_NAO_CONCURRENTLY SECDEF |
| 2 | `20260727184714` | `20260727184714_1800bec4-6fb2-44ea-b983-486849eb80db.sql` | comercial | SECDEF |
| 3 | `20260729112758` | `20260729112758_74d408cc-5241-4a1a-9661-203c43a43d2b.sql` | nucleo | SECDEF |
| 4 | `20260729193425` | `20260729193425_6bb576f0-afd2-42bd-9432-62947e0c6574.sql` | comercial | SECDEF |
| 5 | `20260729201118` | `20260729201118_ebf77872-12e0-4fda-b46d-39126d054563.sql` | comercial | SECDEF |
| 6 | `20260729202644` | `20260729202644_ea66238b-c7b6-473b-81c0-59a4efa693af.sql` | comercial | SECDEF |
| 7 | `20260730031821` | `20260730031821_7fec38f4-af41-43c6-86f9-1765cd508292.sql` | comercial | — |
| 8 | `20260730032921` | `20260730032921_4834c360-9df6-4c14-9e78-51ae42c038a8.sql` | comercial | — |
| 9 | `20260730034130` | `20260730034130_0e732228-c200-4923-92c5-8c3907e01879.sql` | nucleo | SECDEF |
| 10 | `20260730034936` | `20260730034936_3fd8c89d-3e32-485c-bc81-89c70db1c853.sql` | comercial | SECDEF |
| 11 | `20260730035515` | `20260730035515_5e3b16e2-8168-4c28-98a2-472908f8ecae.sql` | comercial | SECDEF |
| 12 | `20260731021937` | `20260731021937_d3d5fc10-af4e-40f1-ac05-2e77cd961351.sql` | comercial | — |
| 13 | `20260801221902` | `20260801221902_42bb540d-4ce7-426a-8839-4854ffa897d4.sql` | estoque | SECDEF |
| 14 | `20260801221955` | `20260801221955_de53ae38-ce24-4fbf-b9c4-6794adbe2b32.sql` | entregas | — |
| 15 | `20260802025921` | `20260802025921_1858db22-ba31-4d45-81a1-7a0b218bf7a9.sql` | comercial | INDEX_NAO_CONCURRENTLY SECDEF |
| 16 | `20260802025959` | `20260802025959_6a6e9ac0-2e24-47cc-8e03-2e6156cac708.sql` | nucleo | — |
| 17 | `20260802030026` | `20260802030026_cd4ca058-8c00-4124-b9e8-bf94358cb04a.sql` | nucleo | — |
| 18 | `20260802030246` | `20260802030246_3db67800-dc1c-480e-8d3e-7019949f8d54.sql` | comercial | — |
| 19 | `20260803202756` | `20260803202756_5b515d84-f151-4c0e-99cc-289d196ef4ac.sql` | nucleo | — |
| 20 | `20260803214744` | `20260803214744_133d882b-9308-4811-956a-510bc53fb0bd.sql` | entregas | SECDEF |
| 21 | `20260803215616` | `20260803215616_b3b148de-fede-4968-a0b6-912838601768.sql` | entregas | — |
| 22 | `20260803215824` | `20260803215824_ae148bec-cb96-462f-9462-9d854831eee1.sql` | estoque | SECDEF |
| 23 | `20260804024029` | `20260804024029_a40f4e87-e068-4b73-9a25-c76434118391.sql` | comercial | FIXTURE_STMT(2) INDEX_NAO_CONCURRENTLY SECDEF |
| 24 | `20260804024341` | `20260804024341_a99905a6-5dbb-4cdc-8b98-c9180a2a1bb1.sql` | estoque | SECDEF |
| 25 | `20260804024430` | `20260804024430_224535ad-1919-4773-a194-33cbe7bc6e60.sql` | estoque | — |
| 26 | `20260804024451` | `20260804024451_fda77bc2-2df9-430b-9328-4528d7f6b0cd.sql` | estoque | SECDEF |
| 27 | `20260804030825` | `20260804030825_697c7b3a-24e8-4fd7-b1f6-d501ea89e321.sql` | estoque | SECDEF |
| 28 | `20260804031015` | `20260804031015_9d2e36df-7982-48d0-8a36-7590a4d7344b.sql` | estoque | SECDEF |
| 29 | `20260805042628` | `20260805042628_6341cd36-10ea-4a79-9415-54ee9277d142.sql` | nucleo | SECDEF |
| 30 | `20260904130941` | `20260904130941_h7n_p1_rpc_guards.sql` | comercial | SECDEF |
| 31 | `20260904131341` | `20260904131341_h7n_p2_search_path.sql` | nucleo | — |

**Pré-condições (somente leitura):** blocos A, B, C, D, E e F de `03-prechecks.sql`.
Bloco G obrigatório também para P2 e P4 (volumetria antes de índice/backfill).

**Risco de lock e duração:** médio — ACCESS EXCLUSIVE curto por CREATE INDEX e ALTER TABLE; estimativa 5–15 min.

**Backup/rollback:** restore point nomeado `pre_p2_h9` imediatamente
antes; rollback detalhado em `05-rollback-por-onda.md`, seção P2.

**Pós-checks:** `04-postchecks.sql` integral, com a lista de versões da onda
preenchida na consulta 1.

**Smoke por perfil (leitura, sem escrever dado de negócio):** administrador,
gestor, financeiro, técnico agrônomo, consultor técnico, parceiro B2B e cliente
produtor abrem sua home e a tela principal do domínio da onda; nenhum perfil
pode ver dado fora do seu escopo nem receber ação de mutação indevida.

**Abort/continue:** continue somente se o ledger contiver exatamente as versões
da onda, os postchecks estiverem limpos, os advisors de segurança não tiverem
piorado e nenhum evento externo tiver sido registrado. Caso contrário, abortar e
aplicar o rollback da onda.


## P3 — Comunicação (desativada / fail-closed) (13 migrations)

Estruturas de templates, regras e eventos. Todas as flags de entrega permanecem OFF.

| # | version | arquivo | domínio | flags |
|---|---|---|---|---|
| 1 | `20260727035656` | `20260727035656_a798991d-480d-42a1-be84-e61b2d868f82.sql` | comunicacao | CREATE_EXTENSION INDEX_NAO_CONCURRENTLY SECDEF |
| 2 | `20260727035947` | `20260727035947_d356297c-e8b8-45bf-a777-deb2f80532a4.sql` | comunicacao | SECDEF |
| 3 | `20260727040035` | `20260727040035_fa4f2df9-9bfb-4f33-aab4-7790ed0b8382.sql` | comunicacao | INDEX_NAO_CONCURRENTLY SECDEF |
| 4 | `20260727165330` | `20260727165330_625744a5-f7b3-4cf8-b74e-3a8f09b1fcac.sql` | comunicacao | — |
| 5 | `20260727202201` | `20260727202201_fe347166-78e9-476f-8ef3-291282fd509a.sql` | comunicacao | SECDEF |
| 6 | `20260727202306` | `20260727202306_11fccf33-16a2-47f7-b9de-0ec24edf7366.sql` | comunicacao | SECDEF |
| 7 | `20260727202421` | `20260727202421_72b9af4d-675b-44d5-98c4-a0e2ff9b1521.sql` | comunicacao | SECDEF |
| 8 | `20260727213029` | `20260727213029_884cb5a2-5450-4cff-8657-3a85ed0b975e.sql` | comunicacao | SECDEF |
| 9 | `20260727213409` | `20260727213409_e26d9d8d-9f98-4851-a533-61a1a80eba1c.sql` | comunicacao | SECDEF |
| 10 | `20260727214136` | `20260727214136_be7ca817-3551-4cf2-95f6-6abd05b7863f.sql` | comunicacao | — |
| 11 | `20260728014711` | `20260728014711_d127c7e5-3149-47da-9e13-20f691ae482f.sql` | comunicacao | SECDEF |
| 12 | `20260728022247` | `20260728022247_6f2e1c77-53e2-45a8-83ef-bb94858c1ce3.sql` | comunicacao | SECDEF |
| 13 | `20260728022355` | `20260728022355_bcde982a-45f1-41dc-80cf-c1169f862946.sql` | comunicacao | SECDEF |

**Pré-condições (somente leitura):** blocos A, B, C, D, E e F de `03-prechecks.sql`.
Bloco G obrigatório também para P2 e P4 (volumetria antes de índice/backfill).

**Risco de lock e duração:** baixo a médio; estimativa 5 min.

**Backup/rollback:** restore point nomeado `pre_p3_h9` imediatamente
antes; rollback detalhado em `05-rollback-por-onda.md`, seção P3.

**Pós-checks:** `04-postchecks.sql` integral, com a lista de versões da onda
preenchida na consulta 1.

**Smoke por perfil (leitura, sem escrever dado de negócio):** administrador,
gestor, financeiro, técnico agrônomo, consultor técnico, parceiro B2B e cliente
produtor abrem sua home e a tela principal do domínio da onda; nenhum perfil
pode ver dado fora do seu escopo nem receber ação de mutação indevida.

**Abort/continue:** continue somente se o ledger contiver exatamente as versões
da onda, os postchecks estiverem limpos, os advisors de segurança não tiverem
piorado e nenhum evento externo tiver sido registrado. Caso contrário, abortar e
aplicar o rollback da onda.


## P4 — Fiscal em homologação / fail-closed (15 migrations)

Perfis fiscais, SINIEF, readiness. tpAmb permanece 2; emissão em produção continua bloqueada por gate próprio.

| # | version | arquivo | domínio | flags |
|---|---|---|---|---|
| 1 | `20260725000000` | `20260725000000_fiscal_fase3_17_homologation_readiness.sql` | fiscal | SECDEF |
| 2 | `20260726000000` | `20260726000000_fiscal_fase3_18_draft_status_check.sql` | fiscal | — |
| 3 | `20260727000000` | `20260727000000_fiscal_fase3_19_rtc_2026.sql` | fiscal | SECDEF |
| 4 | `20260728000000` | `20260728000000_fiscal_rls_perfis_split_write.sql` | fiscal | — |
| 5 | `20260729000000` | `20260729000000_fiscal_financial_documents_no_hard_delete.sql` | fiscal | — |
| 6 | `20260731022650` | `20260731022650_ae406d75-2e05-4f17-bbe1-680bc4841fc1.sql` | fiscal | — |
| 7 | `20260731175024` | `20260731175024_1338d200-4042-4d53-818f-92f9d8f9172f.sql` | fiscal | INDEX_NAO_CONCURRENTLY |
| 8 | `20260731180007` | `20260731180007_2635c4df-ea38-41bb-a830-9495e9f5e63e.sql` | fiscal | — |
| 9 | `20260802000000` | `20260802000000_fiscal_invoice_items_state_guard.sql` | fiscal | — |
| 10 | `20260805000000` | `20260805000000_fiscal_rpc_associate_microorganism.sql` | fiscal | SECDEF |
| 11 | `20260806000000` | `20260806000000_fiscal_microorganism_profiles.sql` | fiscal | INDEX_NAO_CONCURRENTLY |
| 12 | `20260807000000` | `20260807000000_fiscal_sinief_49_scaffolding.sql` | fiscal | INDEX_NAO_CONCURRENTLY |
| 13 | `20260808000000` | `20260808000000_fiscal_sinief_20_2026.sql` | fiscal | — |
| 14 | `20260904130758` | `20260904130758_h7n_p1_trigger_execute.sql` | fiscal | — |
| 15 | `20260904131239` | `20260904131239_h7n_p1_internal_helpers.sql` | fiscal | — |

**Pré-condições (somente leitura):** blocos A, B, C, D, E e F de `03-prechecks.sql`.
Bloco G obrigatório também para P2 e P4 (volumetria antes de índice/backfill).

**Risco de lock e duração:** médio; estimativa 5–10 min.

**Backup/rollback:** restore point nomeado `pre_p4_h9` imediatamente
antes; rollback detalhado em `05-rollback-por-onda.md`, seção P4.

**Pós-checks:** `04-postchecks.sql` integral, com a lista de versões da onda
preenchida na consulta 1.

**Smoke por perfil (leitura, sem escrever dado de negócio):** administrador,
gestor, financeiro, técnico agrônomo, consultor técnico, parceiro B2B e cliente
produtor abrem sua home e a tela principal do domínio da onda; nenhum perfil
pode ver dado fora do seu escopo nem receber ação de mutação indevida.

**Abort/continue:** continue somente se o ledger contiver exatamente as versões
da onda, os postchecks estiverem limpos, os advisors de segurança não tiverem
piorado e nenhum evento externo tiver sido registrado. Caso contrário, abortar e
aplicar o rollback da onda.


## P5 — Visita técnica H9 (10 migrations)

Convergência de autorização, idempotência concorrente e retorno técnico.

| # | version | arquivo | domínio | flags |
|---|---|---|---|---|
| 1 | `20260731030538` | `20260731030538_7a3913dc-7a33-4e93-832d-8a3ac84abccc.sql` | visita | INDEX_NAO_CONCURRENTLY SECDEF |
| 2 | `20260803222456` | `20260803222456_bb9ff98a-d74b-44ad-8257-32e2713531f8.sql` | visita | SECDEF |
| 3 | `20260803224424` | `20260803224424_28a781e5-98a7-450f-af7f-949e7948a3a6.sql` | visita | SECDEF |
| 4 | `20260805022514` | `20260805022514_dcb3ee17-4bf4-4ad5-bae7-480af1fdc065.sql` | visita | SECDEF |
| 5 | `20260805022640` | `20260805022640_898112f6-972c-4a70-aef6-143be6a9f556.sql` | visita | SECDEF |
| 6 | `20260805023801` | `20260805023801_4d26b943-9304-489d-8162-589c0541228d.sql` | visita | SECDEF |
| 7 | `20260805023934` | `20260805023934_9b57467c-4cbc-4066-9d63-00c5e224e457.sql` | visita | SECDEF |
| 8 | `20260805034743` | `20260805034743_40669e02-a875-488c-97e5-0ff7681c27ff.sql` | visita | SECDEF |
| 9 | `20261025000000` | `20261025000000_h9g_retorno_tecnico_duracao_estimada_v1.sql` | visita | SECDEF |
| 10 | `20261026000000` | `20261026000000_h9g_retorno_tecnico_tipo_demanda_v1.sql` | visita | SECDEF |

**Pré-condições (somente leitura):** blocos A, B, C, D, E e F de `03-prechecks.sql`.
Bloco G obrigatório também para P2 e P4 (volumetria antes de índice/backfill).

**Risco de lock e duração:** baixo; estimativa < 5 min.

**Backup/rollback:** restore point nomeado `pre_p5_h9` imediatamente
antes; rollback detalhado em `05-rollback-por-onda.md`, seção P5.

**Pós-checks:** `04-postchecks.sql` integral, com a lista de versões da onda
preenchida na consulta 1.

**Smoke por perfil (leitura, sem escrever dado de negócio):** administrador,
gestor, financeiro, técnico agrônomo, consultor técnico, parceiro B2B e cliente
produtor abrem sua home e a tela principal do domínio da onda; nenhum perfil
pode ver dado fora do seu escopo nem receber ação de mutação indevida.

**Abort/continue:** continue somente se o ledger contiver exatamente as versões
da onda, os postchecks estiverem limpos, os advisors de segurança não tiverem
piorado e nenhum evento externo tiver sido registrado. Caso contrário, abortar e
aplicar o rollback da onda.


## P6 — Frontend e Edge Functions

Só após P1–P5 aprovadas.

1. Deploy das Edge Functions em produção com todas as flags de entrega OFF.
2. Publicação do frontend apontando para produção.
3. Smoke autenticado por perfil, incluindo o fluxo de visita técnica coberto no
   H9-G (leitura, edição justificada, finalização, acesso negado neutro e troca
   de portal multipapel).
4. Abort se qualquer perfil receber ação de persistência indevida, se houver
   spinner infinito em rota protegida ou se algum evento externo for disparado.

## Fora de onda

- **119 BLOQUEADA/REQUER_DECISÃO** — ver coluna `motivo` do manifesto.
- **2 STAGING_ONLY** — `20260729004107`, `20260731162508`; nunca promover.
- **59 repo-only em quarentena** — BLOQUEADA_PERMANENTE, fora do pacote.

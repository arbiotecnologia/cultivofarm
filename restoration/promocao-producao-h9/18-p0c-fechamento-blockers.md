# P0c — Fechamento dos blockers técnicos

Nenhum SQL executado. Nenhum banco acessado. Nenhuma migration histórica editada.
Nenhuma publicação, deploy de Edge Function ou disparo externo.

## 1. Evidência de produção usada (leitura autorizada, somente leitura)

| Item | Valor |
|---|---|
| Ledger | produção 490 / `20260723000000`; homologação 682 / `20261026000000` |
| Cron `prune-old-audit-logs` | `jobid=5`, `15 3 * * *`, `active=true`, `md5(command)=e14782b8984dd461684fdbdc2c4008ff` |
| Catálogo | `financial_audit_log.performed_at` (sem `created_at`); `clientes_audit_log.changed_at` (sem `created_at`) |
| Vault | schema e `vault.decrypted_secrets` existem; executor tem USAGE+SELECT; nenhum segredo externo cadastrado (esperado) |
| Destrutivas | `monitoramento_avisos.data_referencia` ausente; `_motor_b2b_fase7_proofs` ausente; órfãos de `estoque_movimentacoes` = 0 |
| Advisor | 2 ERROR `security_definer_view`: `vw_esteira_laboratorio`, `vw_fluxo_visita_tecnica` |

## 2. Decisões por item exigido

### A. `20260729004013` — reclassificada
Leitura integral: é um **drill de rollback**. Captura a definição de
`rpc_b2b_partner_credit`, troca temporariamente **apenas o comentário**, restaura
a definição original na mesma migration e confere o hash. Não entrega capacidade
de negócio. Classificação final: **STAGING_ONLY / NÃO PROMOVER**. Sem reescrita
manual e **removida da lista de blockers de produção**.

### B. `20260903182144` — artefato derivado emitido
`promotion-sql/20260903182144__promocao.sql`. Preserva byte a byte o hardening
real: `security_invoker` nas 3 views fiscais, REVOKE/GRANT e `search_path` das 22
funções. Substituída **somente** a guarda de homologação por:
guarda canônica `promocao.target_ref` + precheck fail-closed de existência das 3
views e de RLS habilitada em `company_fiscal_settings`,
`customer_fiscal_profiles` e `fiscal_tax_rules`. Pós-check confirma
`security_invoker` efetivo e ausência de exposição a PUBLIC/anon.
Sem ref de homologação, sandbox, marcador, UUID de fixture ou segredo.

### C. `20261023000000` — artefato derivado emitido
`promotion-sql/20261023000000__promocao.sql`. Preservados os 3
`CREATE OR REPLACE FUNCTION`, ACL, `SECURITY DEFINER`, `search_path` e os
pós-checks, **sem relaxar authz nem idempotência**. Removidas as dependências
inválidas de promoção: marcador/ref de homologação, `ledger_count = 678`,
`md5(prosrc)` medido em homologação e os três OIDs literais (24597, 24798,
24800), que passaram a **assinatura `::regprocedure`**.
Baseline agora é semântico e determinístico: existência por assinatura,
`prosecdef`, owner `postgres`, `search_path=public`, ACL sem anon/PUBLIC,
presença do helper `_visita_scope_ok(uuid,uuid)` e do índice único
`visitas_checkin_client_uuid_uq`; o pós-check original mantém a ordem textual
gate → `FOR UPDATE` → lookup. Falha em qualquer ponto aborta (fail-closed).
`md5(prosrc)` **não** é importado de outro ambiente porque em produção o corpo
anterior resulta das ondas prévias desta mesma promoção; fixá-lo seria um
baseline falso.

### D. Cron `20261003000000` — artefato específico e imutável
`promotion-sql/20261003000000__promocao_cron.sql` +
`rollback-sql/20261003000000__promocao_cron_rollback.sql`. O artefato:
valida `jobid`, `jobname`, `schedule`, `database`, `username`, `active` e o
`md5` **de produção**; valida as colunas corretas no catálogo e a ausência das
erradas; grava o `command` anterior em `promocao_rollback_baseline` **dentro da
transação**; troca apenas `financial_audit_log.created_at → performed_at` e
`clientes_audit_log.created_at → changed_at`; prova **exatamente 2 linhas
alteradas**, delta de comprimento +2 e contagem de `DELETE` inalterada;
pós-checa o resultado. Não executa `DELETE`, não agenda job novo, não altera
metadados.

### E. Vault / `20260727161408` — decisão corrigida, promovível
O bloqueio não era `auth`: a migration apenas referencia `auth.users` por FK. O
Vault existe e é legível em produção, e **nenhum segredo externo é necessário**:
os 4 slots `secret_*` nascem `NULL` e todas as flags de entrega nascem `false`.
Artefato `promotion-sql/20260727161408__promocao.sql` com precheck de
Vault/auth e pós-check de flags `false`, `secret_* IS NULL`, ausência de policy,
ACL sem anon/authenticated/PUBLIC e RPC executável somente por `service_role`.
Nenhum segredo é criado ou copiado. Integrações seguem desligadas.

### F. Três destrutivas — blocker técnico retirado
| Version | Prova de produção | Classe final |
|---|---|---|
| `20260727035330` | `data_referencia` ausente → caminho `DROP COLUMN` não executa | PROMOVIVEL_CONDICIONADO, precheck fail-closed mantido |
| `20260730030920` | `_motor_b2b_fase7_proofs` ausente → `DROP` é no-op | PROMOVIVEL_CONDICIONADO, aborta se existir |
| `20260804022556` | órfãos = 0 | PROMOVIVEL_CONDICIONADO, aborta antes de qualquer DELETE se aparecer 1+ |
`lock_timeout='5s'`, `statement_timeout='60s'` e backup obrigatório permanecem.

### G. Migration de convergência — criada, não executada
`promotion-sql/20261101000000_promocao_convergencia_ledger_v1.sql` (version maior
que `20261026000000`). Cria `public.promocao_execucao_registro` e
`public.promocao_rollback_baseline` com RLS habilitada, **zero policies**,
`REVOKE` de PUBLIC/anon/authenticated e acesso somente `service_role`/`postgres`.
Idempotente. Registra origem → artefato → SHA-256 → status → onda → executor →
timestamp. Documenta o fluxo suportado: execução SQL bem-sucedida → postcheck →
`supabase migration repair --status applied <version>`; **nunca** escrita direta
em `supabase_migrations.schema_migrations`. Inclui apenas o próprio registro; não
falsifica migrations não executadas. Rollback em
`rollback-sql/20261101000000_..._rollback.sql`, que recusa remover se já houver
histórico. Fica fora de `supabase/migrations/` durante a P0c justamente porque
nesta fase é proibido executar SQL; é promovida a migration no início da onda P1
e aplicada **também em homologação**.

## 3. Contagens finais

| Exigência | Resultado |
|---|---|
| 192/192 versões únicas classificadas | 135 PROMOVER, 47 PROMOVIVEL_COM_ARTEFATO, 3 PROMOVIVEL_CONDICIONADO, 7 STAGING_ONLY, **0 BLOQUEADA** |
| 59/59 repo-only em quarentena, fora do pacote | sim |
| Censo de guards com destino final | **106** (censo revisado na P0c): 53 G0 original + 46 artefato derivado + 7 STAGING_ONLY |
| 15/15 destrutivas decididas | 3 condicionadas com precheck, 2 ACL, 9 runtime, 1 falso positivo |
| Cron baseline de produção exato | sim, `e14782b8984dd461684fdbdc2c4008ff` |
| Vault resolvido sem segredos | sim |
| 2/2 views do advisor mapeadas | sim (`13-security-definer-views.md`); `_src_vw_esteira_laboratorio` fica como verificação de precheck |
| Migration de convergência criada e não executada | sim |
| SHA-256 de origem e artefato | `10-manifesto-artefatos-promocao.csv`, 49 linhas |
| SQL executado / publicação | zero |
| Binding final | homologação `ikaauvsflpmamgxmkhoq`; sandbox ausente |

## 4. Riscos residuais

1. O `command` de produção do cron é lido em transação; se ele mudar entre a
   leitura de evidência e a onda, o artefato **aborta** — comportamento desejado.
2. O baseline semântico do H9-E2 não fixa `md5(prosrc)`; a garantia vem das
   asserções de contrato e da ordem textual gate→lock→lookup no pós-check.
3. `_src_vw_esteira_laboratorio` não tem correção estática conhecida; se existir
   em produção e for `SECURITY DEFINER`, decidir antes da onda P5.
4. Organização Free: **backup diário não comprovado**.

## 5. Veredito

**NO-GO para a onda P1** — mas por **um único blocker, e ele é humano**: a prova
de backup/restore point recente. Todos os blockers técnicos da P0/P0b estão
fechados. Assim que o operador comprovar backup/PITR imediatamente antes da
onda, o veredito vira **GO PARA ONDA P1**. Produção não foi acessada nesta fase.

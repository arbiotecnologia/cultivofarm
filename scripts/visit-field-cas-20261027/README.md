# rpc_salvar_campo_visita + visitas_campo_guard

## Estado (revisão 92683a)
- Backend **aplicado pelo auditor** em produção como migration `visit_field_cas_gate_20261027`; postflight 15/15; dados originais preservados. **Não reaplicar** `candidate.sql.review` (permanece como registro histórico).
- Sessões reais A/B relatadas pelo auditor (não reproduzidas aqui): negação cruzada 403, criação 200, replay idempotente 200, concorrência com expected 1 → exatamente um 200 v2 e um 409 por tenant.
- Frontend ainda não publicado. Correção desta etapa: `finishPendingCampo(..., {remove:true})` ou `discardPendingCampo` retornando `false` (outra aba gravou revisão nova) **nunca** anuncia "Salvo" nem chama `onDone`; a revisão nova fica na fila e aparece aviso revisável com "Reconsultar dados atuais" sem recarregar. `useOfflineSync` não conta como sincronizado e registra `superseded_local_revision`. A revisão nova mantém o CAS antigo e, ao sincronizar, receberá PT409 → conflito preservado (sem replay cego).

## Baseline LIVE (reconfirmado read-only, 2026-10-27 ~14:50 UTC, ref swzpzcwiasxmjutrmvkm)
- `rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)` OID 42803, md5 `dc1ff655ba3bf156d38817fbf0c073dd`, SECURITY DEFINER postgres, `search_path=public`, ACL `{postgres=X,service_role=X,authenticated=X}`.
- `visitas_campo_guard()` OID 42826, md5 `55177f9db09a4d749c200a1801888249`; trigger só BEFORE UPDATE.
- 3 gatilhos não internos em `visitas_campo` (fingerprint `13dadaca…`), policies fingerprint `644e3004…`. 4 linhas, todas `versao>1`.

## Defeitos do baseline (reproduzidos no PG descartável, bloco PRE)
1. Administrador global em cache: admin de outra empresa grava visita alheia (SECURITY DEFINER sem tenant).
2. CAS `COALESCE(p_versao,0) < versao`: aceita versão futura e NULL→0 no insert; sem lock → lost update.
3. Sem gate de revogação; trigger aceita saltos de versão.

## Candidato (`candidate.sql.review`, migration sugerida `visit_field_cas_gate_20261027`)
- Ordem: `can_manage_technical_visit` rápido → gate `cf_user_guards_v1.state FOR UPDATE` → reautoriza → pai `registros_consultor FOR UPDATE` (predicado original) → reautoriza sem cache, `COALESCE(...,false)` → status editável → filho `visitas_campo FOR UPDATE`. `lock_timeout=3s`.
- Permissão escolhida (fe6fc410 item 6): predicado original (admin / `created_by` / vínculo cliente `execute|manage`) **interseccionado** com `can_manage_technical_visit` estrito. Isso **não é idêntico** ao escopo original: é um subconjunto. Admin de outra empresa passa a ser negado, e participantes que a RLS de `visitas_campo` permite (ex.: equipe/`consultor_responsavel` sem vínculo, gestor sem vínculo/criação) continuam negados nesta RPC. Nenhum papel é ampliado; provado nos checks `gestor without creator/link`, `responsavel-only`, `NULL created_by`. Se o produto exigir esses participantes, é decisão separada.
- CAS estrito: `0` = sem linha (contrato atual do `WizardCampoStep`, `versionRef=0`, e da fila offline); `N` = linha na versão N → N+1. NULL/negativo/futuro/stale → PT409. `p_versao>0` sem linha → PT409 (não inventa insert).
- Idempotência: `p_versao=0` com linha existente só retorna `replayed=true` se mesmo ator, mesmo `client_uuid`, ainda v1 e conteúdo idêntico. Só depois da autorização na própria visita — nada atravessa empresas.
- Revalidação (fe6fc410 item 4): após o gate, após o lock do pai **e após o lock do filho** (relendo o pai): predicado original + `can_manage_technical_visit` + status editável. Empresa do ator resolvida do perfil ativo (`profiles.ativo`, mesma regra de `platform_private.current_user_organization_id`) depois das esperas; `clientes.organization_id` da visita deve ser igual.
- Referências: talhão exige `t.organization_id = f.organization_id = empresa do ator` e fazenda do cliente da visita; nova escolha exige talhão **e** fazenda ativos. Cultura nova: ativa e **não oculta** para a empresa em `public.catalog_tenant_visibility` (mesma fonte de `catalog_tenant_selection_core`). Referência antiga inativa/oculta só é mantida se for exatamente a já gravada e continuar válida em empresa/cliente.
- Área/estande: NaN, Infinity e -Infinity rejeitados (22023).
- Payload validado (uuid, numérico ≥0, estande inteiro, uniformidade) → 22023.
- Guard: INSERT exige `versao=1`; UPDATE exige `versao = OLD+1` (NULL/salto/repetição/regressão → PT409); imutáveis preservados (42501).
- Mudança de código: `visita_locked` 42501→PT409 e `stale_version` 40001→`version_conflict` PT409 (conflito negocial).

## Limites reais
- Escrita direta na tabela por policies `visitas_campo_insert/update` (authenticated) continua existindo; o guard estrito limita versão, mas não impõe gate/tenant canônico. Fechar exige pacote separado (policies RESTRICTIVE), não feito aqui.
- C4: operação que já passou o gate confirma antes de uma revogação enfileirada atrás dela; isso **não** é revogação vencedora.
- Hash do RPC no `postflight.sql` (`b13df1fe…`) foi calculado em PG descartável; se divergir no hospedado, comparar corpo antes de aceitar.
- `other_triggers_exact_pin` (postflight e `DO $post$` na transação) fixa OID do gatilho, OID da função, md5 do `triggerdef`, md5 do corpo, `proconfig`, ACL, owner e `prosecdef` dos 2 gatilhos não alterados (valor LIVE confirmado read-only = true); também `other_triggers_fp_legacy` `429799ac…` e OIDs 42803/42826 preservados.
- Preflight LIVE read-only executado nesta etapa: 23/23 `true`.
- Pendências locais antigas sem `revision` (anteriores a este pacote) ficam retidas, sem reenvio automático (fail-closed).
- Testes são sintéticos (PG descartável, Auth por GUC do harness, helpers stub). Não substituem JWT/RLS real.

## Cliente — correções fe6fc410 (versionado separado do SQL)
- `WizardCampoStep` usa `useStorageAccessScope` (ator/empresa/roles/época/monitor) capturado por tentativa e revalidado após **cada** await (IDB, claim, RPC, cleanup, invalidations) e antes de `onDone`; `finally` antigo não altera UI de outro contexto.
- Hidratação por `useQuery` com chave escopada, `gcTime 0`, sem retry; linha validada (`registro_consultor_id`, `id`, versão inteira ≥1) **antes** de preencher o formulário. Erro (ex. 403) ou sessão em verificação: formulário/ações ocultos, sem cair para rascunho/versão 0; botão **Reconsultar** refaz a consulta sem recarregar a aba.
- `parseCampoResult` exige envelope completo: `id` uuid, `registro_consultor_id`, `client_uuid` (igual ao enviado em insert/replay; igual ou NULL legado em update), `replayed` booleano (só com esperado 0), versão exata; esperado inteiro seguro ≥0. `{}` e `{versao:1}` rejeitados.
- Fila IndexedDB com CAS: cada gravação gera `revision` nova; `claimPendingCampo` (revisão+dono+não conflito+não retida) e `finishPendingCampo` (revisão+attemptId) em transação única; cleanup/marcação de conflito nunca atingem rascunho substituído por outra aba. `discardPendingCampo` só remove a revisão observada pelo usuário.
- PT409: rascunho mantido, sem reenfileirar no debounce; ações **Reconsultar dados atuais** → **Salvar meu rascunho sobre a versão N** (confirmação explícita) ou **Descartar rascunho e usar dados atuais**.
- `useOfflineSync`: claim/finish CAS e recheck após mapping, claim, log, RPC e cleanup.

## Cliente anterior (`delta-frontend.diff`)
- `WizardCampoStep`: cerca de identidade (empresa|ator|visita|geração); resposta tardia não é adotada; troca de ator zera formulário/versão/fila; versão só do servidor (`parseCampoResult`, nunca `versao+1` inventado); PT409 → estado `conflict` com rascunho preservado; rascunho local alheio/legado sem dono não é hidratado; dono gravado na pendência.
- `useOfflineSync`: só reenvia pendências do mesmo ator+empresa; para ao trocar sessão; PT409 → `conflict` (excluído de `getPendingCampos`, sem replay cego); valida envelope antes de remover.
- Pendências antigas sem dono ficam retidas localmente (fail-closed), não reenviadas.

## Rollback
`rollback-containment.sql.review`: deny-only, revoga EXECUTE de authenticated/anon/PUBLIC; mantém guard estrito e policies. Não restaura o corpo vulnerável.

## Evidências
- `results-sql.txt`: 86 checks sintéticos PASS (PRE reproduz defeitos; positivos; CAS; A/B; admin de outra empresa; NULL; talhão de outra empresa/fazenda inativa; cultura oculta para A e visível para B; cultura oculta já gravada mantida; perfil de outra empresa/inativo; NaN/Infinity; guard; concorrência C1–C7 com duas conexões, incluindo revogação durante espera do filho; lock_timeout ~3s; contenção).
- `results-frontend.txt`: vitest.
- Rodar: `python3 test-local.py` (requer initdb/pg_ctl/psql locais).

Pendentes: aplicação/homologação real pelo auditor, fechamento de escrita direta, contabilidade real e SU-518022.

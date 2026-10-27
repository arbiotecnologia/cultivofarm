# rpc_salvar_campo_visita + visitas_campo_guard — candidato revisável (INATIVO)

Nada foi aplicado no banco hospedado nem publicado. O auditor faz revisão independente, aplicação e homologação real.

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
- Escopo original preservado: admin / `created_by` / vínculo cliente `execute|manage`, **interseccionado** com `can_manage_technical_visit` (tenant). Nenhum papel novo; `consultor_responsavel` sem vínculo continua fora (como antes). Efeito: admin de outra empresa passa a ser negado.
- CAS estrito: `0` = sem linha (contrato atual do `WizardCampoStep`, `versionRef=0`, e da fila offline); `N` = linha na versão N → N+1. NULL/negativo/futuro/stale → PT409. `p_versao>0` sem linha → PT409 (não inventa insert).
- Idempotência: `p_versao=0` com linha existente só retorna `replayed=true` se mesmo ator, mesmo `client_uuid`, ainda v1 e conteúdo idêntico. Só depois da autorização na própria visita — nada atravessa empresas.
- Referências: talhão deve ser de fazenda do cliente da visita; talhão/cultura novos devem estar ativos; o já gravado pode ser mantido. Visibilidade de cultura por empresa (seletor) **não** é reverificada no servidor — limite documentado.
- Payload validado (uuid, numérico ≥0, estande inteiro, uniformidade) → 22023.
- Guard: INSERT exige `versao=1`; UPDATE exige `versao = OLD+1` (NULL/salto/repetição/regressão → PT409); imutáveis preservados (42501).
- Mudança de código: `visita_locked` 42501→PT409 e `stale_version` 40001→`version_conflict` PT409 (conflito negocial).

## Limites reais
- Escrita direta na tabela por policies `visitas_campo_insert/update` (authenticated) continua existindo; o guard estrito limita versão, mas não impõe gate/tenant canônico. Fechar exige pacote separado (policies RESTRICTIVE), não feito aqui.
- C4: operação que já passou o gate confirma antes de uma revogação enfileirada atrás dela; isso **não** é revogação vencedora.
- Hashes de `postflight.sql` foram calculados em PG descartável; se divergirem no hospedado, comparar corpo antes de aceitar.
- Testes são sintéticos (PG descartável, Auth por GUC do harness, helpers stub). Não substituem JWT/RLS real.

## Cliente (`delta-frontend.diff`, versionado separado do SQL)
- `WizardCampoStep`: cerca de identidade (empresa|ator|visita|geração); resposta tardia não é adotada; troca de ator zera formulário/versão/fila; versão só do servidor (`parseCampoResult`, nunca `versao+1` inventado); PT409 → estado `conflict` com rascunho preservado; rascunho local alheio/legado sem dono não é hidratado; dono gravado na pendência.
- `useOfflineSync`: só reenvia pendências do mesmo ator+empresa; para ao trocar sessão; PT409 → `conflict` (excluído de `getPendingCampos`, sem replay cego); valida envelope antes de remover.
- Pendências antigas sem dono ficam retidas localmente (fail-closed), não reenviadas.

## Rollback
`rollback-containment.sql.review`: deny-only, revoga EXECUTE de authenticated/anon/PUBLIC; mantém guard estrito e policies. Não restaura o corpo vulnerável.

## Evidências
- `results-sql.txt`: 70 checks sintéticos PASS (PRE reproduz defeitos; positivos; CAS; A/B; admin de outra empresa; NULL; refs; guard; concorrência C1–C6 com duas conexões; lock_timeout ~3s; contenção).
- `results-frontend.txt`: vitest.
- Rodar: `python3 test-local.py` (requer initdb/pg_ctl/psql locais).

Pendentes: aplicação/homologação real pelo auditor, fechamento de escrita direta, contabilidade real e SU-518022.

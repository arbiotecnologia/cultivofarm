# Pacote inativo — rpc_enviar_visita_aprovacao(uuid,integer) (auditoria 40001)

Estado: **SQL INSTALADO pelo auditor** (ver seção "Instalado" ao fim); candidato aqui é histórico/inativo. Nenhum SQL hospedado executado; nada publicado. Aplicação e revisão: auditor independente via Supabase (ref `swzpzcwiasxmjutrmvkm`).

## Baseline LIVE (leitura read-only nesta tarefa)
- MD5 `d875e3ef00382bfcaa47fb23d0b9022c`, SECURITY DEFINER, owner postgres, `search_path=public`,
  ACL `{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}` (texto em `baseline.sql`).
- Defeitos: `v_is_admin` cacheado antes do lock; nenhuma revalidação após espera; sem gate; conflito de versão `40001`; `transicao_invalida` como `42501`; NULL CAS virava -1 (rejeitado, mas sem código de negócio).

## Candidato (`candidate.sql.review`)
- Mesma assinatura (CREATE OR REPLACE preserva OID/ACL/owner), SECURITY DEFINER, `search_path=public`, + `lock_timeout=3s`.
- Ordem: auth → CAS de entrada (NULL/≤0 → PT409) → guard rápido → **gate `cf_user_guards_v1.state FOR UPDATE`** → reautorização → **lock da visita** → reautorização + `can_manage_technical_visit` (tenant) + restrição original (admin/created_by/consultor_responsavel/vínculo cliente) recalculada, nunca cacheada.
- Negócio: `transicao_invalida` e `version_conflict` (antigo/futuro) → **PT409**. Inexistente/alheio → mesmo `42501 sem_permissao` (sem oráculo).
- UPDATE escopado (`id`, `version`, `status=finalizado`, `cliente_id`) com `ROW_COUNT=1`; exatamente 1 `visitas_logs`.
- Não altera fiscal, flags, gatilhos, permissões, dependências; não habilita novo acesso (interseção de predicados preservada).

## Arquivos
`preflight.sql` (pins hash/ACL/config/dependências/gatilhos, read-only) · `candidate.sql.review` (com DO $pre$/$post$ fail-closed) · `postflight.sql` · `rollback-containment.sql.review` (deny-only: revoga EXECUTE de authenticated; **não** restaura 40001) · `test-local.py` · `results.txt` · `delta-sql.diff` (SQL, implantável independente) · `delta-frontend.diff` (versionável separado) · `SHA256SUMS`.

## Testes — SINTÉTICOS (PostgreSQL descartável, Auth sintética, helpers stub)
38 checks: PRE reproduz 40001 e aprovação após revogação durante espera de linha; positivos (responsável, admin, tenant B); negativos (CAS nulo/0/antigo/futuro, já enviado, rascunho, cross-tenant A↔B, inexistente, gestor sem vínculo, sem auth, anon, vínculo revogado, ator inativo) atômicos e sem log; concorrência com conexões reais:
- C1 revogação commita primeiro segurando o gate → operação negada após espera.
- C2 revogação (escrita sem gate) commita durante espera da linha → negada pela reautorização pós-lock.
- C3 operação já detém o gate e espera a linha; revogação que usa o gate fica **atrás** → operação commita antes. **A revogação NÃO venceu**; somente chamadas posteriores são negadas.
- C4 double submit → 1 sucesso, 1 PT409, 1 log. C5 gate retido >3s → `55P03` em ~3s, sem alteração.
Isto **não** é homologação JWT/RLS hospedada nem sessão A/B real.

## Cliente
`useFluxoVisitaTecnica` já lê versão do workspace, fence de ator e não faz retry. `WizardRevisaoStep`: removido fallback `version ?? 1` (sem versão não despacha) e adicionada fence de geração (resposta tardia após troca de visita/desmontagem é descartada). Mensagem PT409 `transicao_invalida` mapeada. Sem retry automático; erro mantém diálogo.

## Ensaio real sugerido (bounded, pelo auditor)
preflight → aplicar → postflight → A/B: próprio 200; cruzado 42501; CAS nulo/antigo PT409; replay PT409 com 1 log. Sem espera global longa.

## Achado separado — NÃO corrigido neste lote
`rpc_salvar_campo_visita`: admin global cacheado; SELECT por ID sem escopo antecipado; CAS por `<` sem lock. Registrado para lote próprio.

Pendentes: contabilidade real; suporte SU-518022 adiado. Monitoramento bfcfdbcd não reaberto.

## Revisão 6ee91fb4 (NO-GO) — correções
1. Preflight/candidato/postflight: contagem fabricada (10) substituída pelo fingerprint real dos **9** gatilhos não internos (nome + def + corpo da função) `312a766a023f2d86e06d5641a7593f93`, lido LIVE read-only.
2. Lógica de três valores: todo predicado de autorização usa `COALESCE(...,false) IS NOT TRUE`; `created_by`/`consultor_responsavel` NULL nunca autorizam. O predicado original (admin fresco/created_by/responsável/vínculo) voltou ao `SELECT ... FOR UPDATE`, então ator fora do escopo não trava a linha. Testes: gestor sem vínculo com created NULL, responsável NULL e ambos NULL → 42501; gestor fora do escopo negado sem esperar lock de linha. Total 43 checks SINTÉTICOS.
3. Wizard: `useStorageAccessScope` (ator/tenant/roles/época/visita/montagem) capturado por requisição e revalidado após RPC e após invalidações, antes de toast/navigate; catch e finally pertencem à tentativa (ticket próprio). Leituras de registro/contagens com chave escopada e habilitadas só com sessão pronta. CAS exige `Number.isSafeInteger > 0`; sucesso exige envelope com id, status alvo e `version = esperado + 1` exatos (validado contra `rpc_finalizar_visita_v2` LIVE, que retorna o mesmo formato).
Hash POST esperado do corpo: `b053b1432864f30409b2043cd345e96c` (banco descartável). Baseline LIVE continua `d875e3ef...`. Fixtures A `700add6c...`/B `c4c5c4db...` não foram tocadas.

## Instalado em produção (e7743f2) — registro, NÃO reaplicar
- Aplicação independente do auditor: migration `visit_approval_submit_cas_gate_20261027`; OID 42716; MD5 LIVE `90f33a1e55d44fbbd8fa9ebc565ba052`; prosrc `bfec4ebd4e4681e782a428b70bed0c64`; ACL original; `search_path=public,lock_timeout=3s`; fingerprint 9 gatilhos (newline, nome:triggerdef:md5(functiondef)) `94c2571b241a974606d64c14449e2843`.
- Corpo capturado read-only em `installed.sql.review` (md5 local do texto confere 90f33a1e…). `postflight-installed.sql` executado read-only agora: 8/8 ok. Hash `b053…` do candidato **nunca foi implantado**; `candidate.sql.review`/`postflight.sql` ficam históricos.
- Diferenças do instalado: pós-lock `OR NOT COALESCE((predicado original), false)`; `SELECT FOR UPDATE` exige `can_manage` E predicado original.
- Provas REAIS relatadas pelo auditor (não reproduzidas aqui): CAS null/2/4 → PT409; cruzado 403; gestor B sem vínculo 403; 2 envios simultâneos → 1×200 v4 + 1×PT409, 1 log. Fixtures A `700add6c…`/B `c4c5c4db…` arquivadas canonicamente v5; não alteradas.

## Frontend (NO-GO e7743f2) — correções
- Hide-error-cache: registro/contagens só aparecem com sessão pronta, sucesso buscado nesta montagem/chave, sem erro e id correspondente; cache + 403 em refetch, erro de qualquer uma das 5 contagens ou contagem não numérica escondem dados/ações e mostram "Consultar novamente" (refetch, sem recarregar aba).
- queryFns capturam o escopo e lançam `fenced_scope` após await com escopo trocado.
- Troca de ator/tenant/roles/visita reseta a UI; `finally` antigo só libera o próprio ticket e só mexe em `pending` se o contexto é o mesmo.
- Testes com QueryClient real (transporte simulado): 36/36. Suíte visita: as 7 falhas restantes (etapasVisita, pdfVisitaAuthenticated, visitaTecnicaSalvamento) são idênticas em `git archive 6ee91fb4`.

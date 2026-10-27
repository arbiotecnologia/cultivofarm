# Pacote inativo — rpc_enviar_visita_aprovacao(uuid,integer) (auditoria 40001)

Estado: **INATIVO**. Nenhum SQL hospedado executado; nada publicado. Aplicação e revisão: auditor independente via Supabase (ref `swzpzcwiasxmjutrmvkm`).

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
`preflight.sql` (pins hash/ACL/config/dependências/gatilhos, read-only) · `candidate.sql.review` (com DO $pre$/$post$ fail-closed) · `postflight.sql` · `rollback-containment.sql.review` (deny-only: revoga EXECUTE de authenticated; **não** restaura 40001) · `test-local.py` · `results.txt` · `delta.diff` · `SHA256SUMS`.

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

# Revogação técnica efetiva — candidata frontend

Baseline publicada fixa: `db1eee7c826ff7c43da756047cadac744767bd84`, bundle informado `index-Di6vk5UB/App-CdRLoTLp`. Sem SQL, roles, dados, cliente, monitor, lease ou publicação pelo agente.

## Evidência real e correção
- Auditor informou retirada de consultor B mantendo gestor: pausa ineligible às 22:11:49.822 UTC, RTT 293 ms; Retry resolveu gestor, mas `/app/perfil` manteve menus técnicos. Papel restaurado com ID original externamente; nenhum dado alterado aqui.
- A revisão anterior de 82 testes + tsc PASS **não representou a semântica real da RPC**, logo não equivaleu a revogação parcial homologada. Revogação parcial real continua **NÃO PASS**; candidata exige nova revisão/publicação/homologação externa.
- Na RPC real informada, management torna `has_technical_access`, `is_admin` e `has_b2b_access` verdadeiros, mas gestor sozinho só recebe `available_contexts: ['admin']`. Essas flags não provam acesso técnico.
- Delta runtime mínimo: AppPortalGuard, TechnicalFeatureGuard, TechnicalRouteGuard e MobileLayout exigem `available_contexts.includes('technical')`. Bypass administrativo somente `roles.includes('administrador')`; produtor mantém seu acesso compartilhado existente, sem liberar features técnicas. Não normalizar flags globalmente nem alterar outros portais.
- Hook mantém payload, validação, freshness herdada, deadline, scope/epoch/fences, refetch e descarte de cache; pendência/refetch/erro continuam ocultando conteúdo antes de decidir. Nenhum grant inventado, logout forçado ou portal novo.
- Auditoria dos leitores: busca completa em components/pages/hooks não deixa decisões técnicas por flags legadas. MobilePerfil, UserMenu e seleção já usam a lista; `useAvailableContexts` mantém flags apenas como transporte/compatibilidade. Comentários de permissões não são autoridade.

## Provas locais e limites
- Harness real AuthProvider/query/guard/MobileLayout/MobilePerfil, transporte fake com semântica real: antes da correção **5/15 falharam**, incluindo gestor indevidamente permitido, Retry pós-revogação e retorno tardio. Não JWT/RLS ou banco real.
- Matriz gestor `{available_contexts:['admin'],has_technical_access:true,is_admin:true,has_b2b_access:true}` nega Técnico; dupla com admin+technical e consultor com technical permitem; administrador explícito preservado.
- Testes de cada guarda e MobileLayout independente do AppPortalGuard, Perfil real após perda de cada papel, timeout/erro/invalidação/epoch/resposta antiga e não-loop de leitores aninhados: **343/343 em 12 arquivos**, build automático OK. Typechecks independentes não executados manualmente neste ambiente.
- Typechecks app/node independentes deste delta dependem de recibo do auditor/harness; não confundir build automático com types. Estabilidade do gateway e renovação natural permanecem pendentes e não são corrigidas por esta mudança.

## Revisão e rollback
- `manifest.json` registra hashes pré/pós; `frontend.patch` contém somente runtime/testes/regras deste delta contra db1eee. Baselines são bytes Git fixos.
- `python3 scripts/technical-context-revocation/rollback.py` verifica hashes sem escrever; `--apply` restaura todos os alvos somente após validação integral. Nada executa SQL ou publica.
- **Aviso:** rollback restaura a vulnerabilidade frontend de db1eee; exige decisão explícita, não é recomendado como recuperação segura da revogação.
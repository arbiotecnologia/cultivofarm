# Validação candidata
-24/24 Vitest PASS:3 agregação,11 UI candidata usando hook real e Auth/RPC sintéticos,10 regressões sessão reader runtime.
- Casos: contagens status exatas incluindo desconhecido, limite100 versus99, vazio, RPC única, técnico/produtor/interno negados, erro refetch stale +Retry controlado, logout/tenant/revogação, cross-parceiro, resposta tardia ator anterior.
- Build automático preview OK. Typecheck específico candidato pendente de execução independente; nenhum build/typecheck manual foi executado pelo agente.
- Backend vínculo futuro/inativo/revogado/entitlement: NÃO certificado por testes UI. Guard existente não foi alterado; preflight somente leitura entregue, não executado hosted. UI real não verificada porque candidato permanece inativo.
- Promoção local C2-CAT95738f51 preservada; publicação/UI C2-CAT aguardam auditor. C2.1 writers inativos.
- Rollback frontend: restaurar somente CommercialOwnOrders baseline e retirar helper se sem consumidores; manter SQL/RLS/filtros/lease atuais. Sem rollback de schema pois este recorte não modifica banco.
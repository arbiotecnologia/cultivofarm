# Validação candidata
-29/29 Vitest PASS:3 agregação,11 UI candidata usando hook real e Auth/RPC sintéticos,15 regressões sessão reader runtime, incluindo ausência dos campos obrigatórios sem defaults. C2-CAT 30/30 regressões PASS.
- Casos: contagens status exatas incluindo desconhecido, limite100 versus99, vazio, RPC única, técnico/produtor/interno negados, erro refetch stale +Retry controlado, logout/tenant/revogação, cross-parceiro, resposta tardia ator anterior.
- Build automático preview OK. Types específico candidato passou com tsgo; sem build manual do projeto.
- Backend vínculo futuro/inativo/revogado/entitlement: NÃO certificado por testes UI. Guard existente não alterado; UI dashboard local ainda não homologada em sessão real.
- Publicação/UI catálogo C2-CAT confirmadas pelo auditor em318957a2/deploymentafa325c5; famílias químicos/adubos vazias não são prova positiva. Dashboard promovido só localmente; C2.1 writers inativos.
- Rollback frontend: restaurar somente CommercialOwnOrders baseline e retirar helper se sem consumidores; manter SQL/RLS/filtros/lease atuais. Sem rollback de schema pois este recorte não modifica banco.
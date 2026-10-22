# Validação local — candidata INATIVA
- PostgreSQL descartável:33/33. Captura scope/validator LIVE, Auth/entitlements e schema reduzidos sintéticos; inclui projeção financeira positiva, sem entitlement e rollback incapaz de anunciar acesso. Não prova hosted JWT/RLS/triggers completos.
- Negativos: técnico, cross-parceiro, perfilB/vínculoA, vínculo futuro/revogado/ausente, owner/perfil/parceiro inativos, status owner, sem entitlement, multipapel, modelo explícito incompatível, título/parcela foreign/null, origem divergente, NaN e links ambíguos.
- Valores positivos concretos: título100, pagamento registrado25, página50/next2; sem saldo global/documentos. Wrapper INVOKER/anon negado/rollback deny.
- Vitest32/32: parser8 + hook scoped13 + capability/menu/entitlements11; canonical RPC com parceiro explícito, roles proibidas, cache stale/refetch falho, logout/tenant/epoch/lease/revogação e resposta tardia. Types candidato tsgo PASS.
- Nenhum DDL/DML hosted, grant real, publicação ou acesso financeiro ativado. Backend entitlement/capability, REST overload/HTTP e UI nonempty reais permanecem NO-GO até revisão independente.
- Falha inicial do harness corrigida: BEGIN/mutação/assert/ROLLBACK agora na mesma conexão psql; testes negativos não usam transações descartadas entre processos.

## Rodada 02:22
- Driftcheck SHA256 sobre HEAD corrigido: PASS; filtros preservados sem promoção runtime.
- Layout candidato financeiro + regressões filtros:19/19; suíte financeira atual35 testes (32anteriores+capacidade cumulativa/negativa+hook sem capability+revogação residual).
- Variante conjunta multiperfil gerada com guard de instalação fechado; não certificada por harness SQL integral. Teste SQL33 anterior refere-se exclusivamente à variante singleton e não é evidência da conjunta.
- Preflight scope/projection original NÃO vale após migration C2; exigida captura fresca + guard revisado, sem reaproveitar MD5 incompatível. Modelo explícito continua não homologado.
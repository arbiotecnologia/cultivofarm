# Validação local — candidata INATIVA
- PostgreSQL descartável:30/30. Captura scope/validator LIVE, Auth/entitlements e schema reduzidos sintéticos; não prova hosted JWT/RLS/triggers completos.
- Negativos: técnico, cross-parceiro, perfilB/vínculoA, vínculo futuro/revogado/ausente, owner/perfil/parceiro inativos, status owner, sem entitlement, multipapel, modelo explícito incompatível, título/parcela foreign/null, origem divergente, NaN e links ambíguos.
- Valores positivos concretos: título100, pagamento registrado25, página50/next2; sem saldo global/documentos. Wrapper INVOKER/anon negado/rollback deny.
- Vitest21/21: parser8 + hook scoped13; canonical RPC com parceiro explícito, roles proibidas, cache stale/refetch falho, logout/tenant/epoch/lease/revogação e resposta tardia. Types candidato tsgo PASS.
- Nenhum DDL/DML hosted, grant real, publicação ou acesso financeiro ativado. Backend entitlement/capability, REST overload/HTTP e UI nonempty reais permanecem NO-GO até revisão independente.
- Falha inicial do harness corrigida: BEGIN/mutação/assert/ROLLBACK agora na mesma conexão psql; testes negativos não usam transações descartadas entre processos.
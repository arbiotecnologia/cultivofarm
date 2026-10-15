# Validação local do recorte Cockpit

Resultado executado nesta rodada: `bun run test -- src/test/cockpit-laboratorio/tenantFencePostgres.test.ts src/test/cockpit-laboratorio/auditoria.test.ts src/test/cockpit-laboratorio/refinamentos.test.tsx`.

- **17/17 Vitest PASS**, 3 arquivos: candidato PostgreSQL 1 (14 verificações internas), auditoria existente 9 e refinamentos existentes 7.
- Script Python isolado também executado diretamente: **14/14 PASS**. Corpos candidatos extraídos; helpers Auth/RBAC/tenant/plano simulados, schema reduzido.
- `git diff --check` PASS. Nenhuma execução manual de build/typecheck: validação automática do ambiente; nenhuma mudança no aplicativo.
- Avisos existentes React Router v7, sem falha de teste. Sem alegação de lint global limpo.
- Não executados preflight completo, ACL completa, RLS/Auth reais, browser autenticado ou concorrência hospedada. SQL candidato **não foi aplicado nem publicado**.

Relatório principal: `docs/auditorias/cockpit-leitura-recorte-20261015.md`. Manifesto: `scripts/rbac-audit/cockpit-read-candidate-manifest.json`.
**NO-GO aplicar o candidato até revisão da cópia materializada/descendentes e demais bloqueadores registrados.** Não abrir o RPC isoladamente. Fabricação e diagnóstico continuam NO-GO; ownership OFF.
## Revisão P1 17:41 — candidato substituído
- **17/17 Vitest PASS** (3 arquivos), PostgreSQL **14/14 verificações PASS**, executados novamente em 17:44 UTC.
- O teste agora executa SOMENTE corpo h7n candidato, sob ROLE authenticated; anon negado por ACL. AR/FSF, SA exclusivo/sem tenant, ator inativo/UID ausente, vínculo ativo/revogado/alheio, SQL NULL readiness/link e Onfarm não ampliado.
- Readiness, organização, papéis e vínculos permanecem simulados; não é prova Auth/JWT/RLS hospedada. Não executa preflight completo ou DDL remoto.
- Candidato anterior que reabria RPC foi substituído. RPC/view/ACL/owner/MV não são alterados no novo candidato.
- Metadados próprios atuais: authenticated sem EXECUTE h7n e sem SELECT view; corpo antigo ainda existe. Evidência externa FSF 2 linhas permanece histórica e atribuída a Renato.
- Pós-aplicação somente leitura preparado, **não executado**: ACL fechada impede controle positivo AR/filtro FSF; negação de ACL não vale PASS de isolamento tenant. Revisor deve registrar essa limitação sem regrant.
- `git diff --check` PASS; nenhum código de UI alterado. Build/typecheck automático sem resultado novo disponível; não executados manualmente. Revisão independente/aplicação hospedada bloqueadas por autorização; freshness/descendentes não certificados.

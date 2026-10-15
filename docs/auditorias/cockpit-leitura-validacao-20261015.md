# Validação local do recorte Cockpit

Resultado executado nesta rodada: `bun run test -- src/test/cockpit-laboratorio/tenantFencePostgres.test.ts src/test/cockpit-laboratorio/auditoria.test.ts src/test/cockpit-laboratorio/refinamentos.test.tsx`.

- **17/17 Vitest PASS**, 3 arquivos: candidato PostgreSQL 1 (14 verificações internas), auditoria existente 9 e refinamentos existentes 7.
- Script Python isolado também executado diretamente: **14/14 PASS**. Corpos candidatos extraídos; helpers Auth/RBAC/tenant/plano simulados, schema reduzido.
- `git diff --check` PASS. Nenhuma execução manual de build/typecheck: validação automática do ambiente; nenhuma mudança no aplicativo.
- Avisos existentes React Router v7, sem falha de teste. Sem alegação de lint global limpo.
- Não executados preflight completo, ACL completa, RLS/Auth reais, browser autenticado ou concorrência hospedada. SQL candidato **não foi aplicado nem publicado**.

Relatório principal: `docs/auditorias/cockpit-leitura-recorte-20261015.md`. Manifesto: `scripts/rbac-audit/cockpit-read-candidate-manifest.json`.
**NO-GO aplicar o candidato até revisão da cópia materializada/descendentes e demais bloqueadores registrados.** Não abrir o RPC isoladamente. Fabricação e diagnóstico continuam NO-GO; ownership OFF.
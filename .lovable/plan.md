## Auditoria Vitest — estado atual

`bunx vitest run` executado agora (somente leitura, nenhum arquivo alterado):

**Test Files** 30 passed (30)
**Tests** 264 passed (264)
**Duração** 16.93s

### Diagnóstico por arquivo investigado
- `src/test/migration_integration.test.tsx` — **3/3 passam** (198ms). As 3 asserções (`DashboardAgronomico`, `PrevisaoInteligente`, `MonitoramentoProblemas`) resolvem sem timeout; o mock atual do `supabase.from` cobre a cadeia usada pelos componentes após as migrations aplicadas.
- `src/test/portalParceiroSolicitacoes.test.tsx` — **9/9 passam**. Os contratos de `viewerScope` (gestor vs. técnico), filtros por `partner_id`/`created_by` e o mapa de permissões (`canAccess`/`getAccessLevel` em `/portal-parceiro/solicitacoes`) estão consistentes.

### Falhas
Nenhuma. Suíte 100% verde.

### Avisos não bloqueantes (informativos)
- `React Router Future Flag Warning: v7_startTransition` e `v7_relativeSplatPath` em stderr durante os testes que montam `BrowserRouter` (portalAcompanhamentoProdutor, integration/*). São warnings do React Router v6 sobre flags opt-in para v7; não afetam resultado dos testes. **Classificação:** ruído de dependência, não é defeito nem fragilidade. **Correção opcional (fora do escopo desta auditoria):** habilitar `future: { v7_startTransition: true, v7_relativeSplatPath: true }` no `BrowserRouter` do `src/App.tsx` e nos wrappers de teste.

### Conclusão
Não há teste falho para corrigir. Nenhuma ação recomendada — a suíte está estável no estado atual do repositório (pós-correções mínimas em `src/lib/permissions.ts` e `src/test/migration_integration.test.tsx` aprovadas anteriormente).

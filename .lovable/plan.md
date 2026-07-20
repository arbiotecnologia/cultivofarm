## Auditoria Vitest — estado atual

`bunx vitest run` (auditoria somente-leitura executada agora): **260 passaram, 4 falharam, 30 arquivos (3 com falha)**. Nenhum arquivo foi editado.

---

### Falha 1 — `src/test/b2bTecnicoCampo.permissions.test.ts`
**Teste:** `permite ao técnico B2B gerenciar seus produtores vinculados` (linha 36)
**Mensagem:** `AssertionError: expected false to be true`
**Causa raiz:** `ACCESS_MAP["/portal-parceiro/meus-produtores"]` em `src/lib/permissions.ts:181` não inclui `parceiro_b2b_tecnico`. Só `administrador` e `gestor_comercial` têm `rw`. O teste assume que o técnico deve gerenciar seus produtores vinculados, mas a permissão atual restringe a rota a perfis internos.
**Classificação:** defeito de produção (regressão de permissão introduzida em alguma migration do portal parceiro — a rota `meus-produtores` foi originalmente desenhada para o técnico B2B conforme docs `reformulacao-portais-b2b-fase-7-tecnico.md`).
**Correção mínima recomendada:** adicionar `parceiro_b2b_tecnico: "rw"` em `/portal-parceiro/meus-produtores` e `/portal-parceiro/meus-produtores/:clienteId`. (Não aplicada — auditoria read-only.)

---

### Falha 2 — `src/test/b2bTecnicoCampo.permissions.test.ts`
**Teste:** `permite ao gestor B2B gerenciar vínculos entre técnicos e produtores` (linha 75)
**Mensagem:** `AssertionError: expected false to be true`
**Causa raiz:** `/portal-parceiro/tecnicos-produtores` (permissions.ts:183) não concede `rw` a `parceiro_b2b`; só `administrador`/`gestor_comercial`.
**Classificação:** defeito de produção — o gestor B2B, dono da equipe de técnicos do parceiro, deveria administrar esses vínculos.
**Correção mínima recomendada:** adicionar `parceiro_b2b: "rw"` em `/portal-parceiro/tecnicos-produtores`.

---

### Falha 3 — `src/test/portalParceiroSolicitacoes.test.tsx`
**Teste:** `Portal Parceiro — Gestor B2B > gestor tem acesso rw a /portal-parceiro/solicitacoes` (linha 52)
**Mensagem:** `AssertionError: expected false to be true`
**Causa raiz:** `/portal-parceiro/solicitacoes` (permissions.ts:167) só permite `administrador` e `gestor_comercial`. O gestor B2B (`parceiro_b2b`) foi omitido do mapa apesar de a suíte tratar essa rota como área de gestão do parceiro.
**Classificação:** defeito de produção (mesma família das falhas 1 e 2: `parceiro_b2b` foi indevidamente removido/omite em rotas de gestão do próprio portal). Os demais testes do arquivo (`viewerScope`, filtros por `partner_id`, técnico) passam — o contrato de dados está correto; só o mapa de permissões diverge.
**Correção mínima recomendada:** adicionar `parceiro_b2b: "rw"` em `/portal-parceiro/solicitacoes`.

---

### Falha 4 — `src/test/migration_integration.test.tsx`
**Teste:** `Data Migration Integration Tests > DashboardAgronomico should load data from registros_consultor` (linha 51)
**Mensagem:** `expect(element).toHaveTextContent("1")` — timeout 3000ms; o card "Ocorrências Registradas" renderiza `0` em vez de `1`.
**Causa raiz:** fragilidade do teste no mock do `supabase.from`. O `queryBuilder` implementa `.then()` inline, mas `DashboardAgronomico` chama, para `registros_consultor`, uma cadeia que provavelmente inclui `.in(...)` (filtro por fazendas/talhões) ou outro método encadeado não coberto pelo stub — a promise resolve com `data: []` no caminho de ocorrências (`0`), enquanto os cards "Fazendas Monitoradas" e "Talhões Monitorados" mostram `1` (esses caminhos batem no stub). Os demais dois testes do arquivo (`PrevisaoInteligente`, `MonitoramentoProblemas`) passam — só a cadeia usada em `DashboardAgronomico` para `registros_consultor` diverge do mock.
**Classificação:** fragilidade do teste (o componente evoluiu para uma consulta mais rica após as migrations de junho/julho; o mock ficou defasado). O runtime real (`/`, painel admin) funciona nos smoke tests.
**Correção mínima recomendada:** estender o `queryBuilder` mock para incluir `in`, `filter`, `not`, `limit` (todos retornando `queryBuilder`) — sem alterar `DashboardAgronomico`. Alternativamente, migrar o teste para o helper compartilhado `src/test/helpers/supabaseMock.ts`.

---

### Consolidado

| # | Arquivo | Tipo | Escopo do fix |
|---|---------|------|---------------|
| 1 | b2bTecnicoCampo.permissions.test.ts (meus-produtores) | Produção | `src/lib/permissions.ts` — 2 linhas |
| 2 | b2bTecnicoCampo.permissions.test.ts (tecnicos-produtores) | Produção | `src/lib/permissions.ts` — 1 linha |
| 3 | portalParceiroSolicitacoes.test.tsx | Produção | `src/lib/permissions.ts` — 1 linha |
| 4 | migration_integration.test.tsx (DashboardAgronomico) | Teste frágil | `src/test/migration_integration.test.tsx` — estender mock |

**Nada foi editado nesta auditoria.** Falhas 1–3 são a mesma classe de defeito (mapa de permissões do portal parceiro perdeu papéis `parceiro_b2b`/`parceiro_b2b_tecnico` em rotas de gestão) e podem ser corrigidas em um único bloco de 4 linhas em `src/lib/permissions.ts`. Falha 4 é isolada ao arquivo de teste e não afeta produção.

Autorize para que eu aplique as correções mínimas (marque quais dos 4 itens deseja corrigir) — nenhuma regra de negócio muda, apenas o mapa declarativo de rotas e o mock de teste.

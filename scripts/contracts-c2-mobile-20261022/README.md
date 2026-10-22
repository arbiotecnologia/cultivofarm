# C2 — MobileLayout por contextos canônicos (INATIVO)

Baseline `src/pages/app/MobileLayout.tsx` SHA256 `1fba03f9…`; candidata `runtime-copies/…/MobileLayout.tsx` `49dea967…`; `frontend.patch` `42fceac2…`.

- Problema: `isProdutor = roles.includes("cliente_produtor")` e `isAdmin` contornavam erro/indisponibilidade da projeção (`!isProdutor && !isAdmin && (isError || !contexts)`).
- Candidata: produtor/técnico apenas de `available_contexts` frescos (`"producer"` do contrato C2_MULTIPROFILE_V1); erro ou projeção ausente → `PortalContextUnavailable` para todos; administrador continua bypass explícito único só após projeção válida e nunca ganha modo produtor; escolha visual "producer" obsoleta cai no contexto técnico remanescente.
- Dependência: requer o leitor coordenado `scripts/contracts-c2-20261022/coordinated/frontend/runtime-copies/src/hooks/useAvailableContexts.ts` (aceita "producer") e a SQL C2 dos readers. Promover isoladamente quebraria produtores.
- Teste `mobileLayout.integration.test.tsx` (AuthProvider/monitor reais, transporte falso, não JWT/RLS): 6/6 na candidata — produtor+técnico escolhido; papel produtor sem contexto nunca vira produtor; revogação parcial do produtor mantém técnico; erro fecha produtor e administrador; consumidor admin lê só projeção e não ganha menus de produtor; gestor interno sem contexto barrado. Contra o runtime atual (`vitest.baseline.config.ts`) 2 falham (fallback por papéis), comprovando o defeito.
- Sem SQL, publicação, sessões ou roles alterados.

## Cadeia candidata completa (INATIVA)
- `vitest.config.ts` antigo não substituía `@/hooks/useAuth`; criado `vitest.chain.config.ts` com TODOS os runtime-copies do manifesto coordenado (AuthProvider, useAvailableContexts, useMyPartner, portalContext, guards, SelecionarPortal, contrato) + MobileLayout candidato.
- `mobileLayout.chain.integration.test.tsx`: parceiro_b2b_tecnico+cliente_produtor com payload C2: ambos contextos, revogação parcial de produtor, vínculo produtor invalidado, payload malformado, pausa/falha pós-montagem, revogação total.
- Cadeia: 12/12 PASS. Config antiga (sem useAuth candidato): 3 falham. Baseline runtime: 5 falham — os testes discriminam.
- Sintético; não é evidência JWT/RLS. Sem SQL/publicação; promover só junto com SQL/readers C2.

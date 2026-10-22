# C2 + financeiro próprio — pacote integral instalável (INATIVO, 2026-10-22)

Nada aqui foi aplicado em produção, implantado ou publicado. Nenhuma cópia foi promovida para `src`.

## Conteúdo
- `install.sql.review` — uma única transação (exatamente um `COMMIT`): guard estrutural C2 → provisioning/readers C2 → variante financeira multiperfil → guard pós-C2 (hashes de 3 funções calculados na réplica, `post-c2-baseline.json`).
- `rollback.sql.review` — deny-only, reexecutável; não apaga dados/histórico nem restaura grants inseguros.
- `frontend/manifest.json` + `frontend/runtime-copies/` — manifesto ÚNICO de 18 arquivos: cadeia C2 (AuthProvider, contextos, parceiro, guards, seletor, contrato), MobileLayout, financeiro próprio e ciclo administrativo em Configurações (`PartnerLifecycleFields`). `useMyPartner` usa a versão financeira, verificada como superconjunto exato da C2. Baselines conferidos com `src` atual: sem drift.
- `hosted-capture*.json`, `hosted-schema-acl.txt`, `hosted-fingerprints-named.txt` — captura estrutural read-only do ref `swzpzcwiasxmjutrmvkm` (PostgreSQL 17.6), sem dados nem credenciais.
- `build_replica.py`, `fidelity.py`, `assemble.py`, `run_integral.py` — réplica descartável (PostgreSQL 17.9 local), montagem e cenários.

## Resultados (sintéticos)
- Fidelidade: 197 funções com md5/ACL/owner idênticos ao hosted; 16 relações protegidas com fingerprint idêntico (roles por nome).
- `run_integral.py`: **PASS 49** — instalação, reinstalação fail-closed, atribuições cumulativas B2B/técnico/produtor, portais, isolamento tenant/parceiro, CAS, replay idêntico e conflito de payload, **corrida real entre duas sessões** (uma vence, outra recebe `version_conflict`, um só efeito), revogação parcial preservando o restante, unlink/reativação sem ressuscitar perfis, produtor sem fazenda ativa negado, perfil inativo bloqueia tudo, financeiro próprio do gestor permitido e técnico/produtor/cross-tenant negados, capability de catálogo preservada, `acquire_gate` intacto (`b0dd9a14…`), rollback deny-only reexecutável.
- Frontend integral (`frontend/vitest.config.ts`): 13 arquivos, 113/113. Tipos das 18 cópias (`tsgo -p frontend/tsconfig.json`): sem erros.
- Edge `create-user` candidata: Deno 9/9, `deno check` ok.
- Regressão de filtros: o caso "troca de papel" da suíte de `src` falha contra a cadeia candidata porque o guard candidato tira o técnico-only do portal B2B. Variante `frontend/ownerCatalogFilters.c2.session.test.tsx` mantém a invariante (sem linhas protegidas; filtros limpos ao voltar). A suíte de `src` continua 17/17 contra o runtime atual.

## Correções feitas no preparo
- `coordinated/build.py`: removia `COMMIT` errado e gerava dois; agora regex + assert de um único `COMMIT`.
- Guard estrutural C2 usava OIDs de roles (diferem entre bancos); agora nomes de roles.
- Guard fiscal aplicado foi preservado byte-idêntico (não reescrito).

## Limites — o que NÃO está provado
- Auth é sintética (`request.jwt.claims`); não é prova de JWT/RLS/REST hosted nem de navegador.
- Relações contextuais foram replicadas só estruturalmente (colunas/PK/RLS); policies/triggers/ACL próprios delas não.
- Semeadura de catálogo/plano e bootstrap de admins sintéticos usaram `session_replication_role=replica`; todos os cenários rodaram com triggers ativos.
- O ciclo administrativo só monta para usuário com vínculo de parceiro existente; criação cumulativa nova depende da Edge `create-user` candidata (não implantada).
- `revoke_roles` recebe o conjunto FINAL de perfis (subconjunto dos atuais).
- 5 falhas XML/Edge (desde `6271e981`) seguem sem decisão: não foi comprovada regressão real, nada corrigido.

## Instalação (somente pelo auditor, após revisão)
preflight read-only → `install.sql.review` → postflight → deploy Edge → promover exatamente o manifesto → homologação JWT/RLS real A/B. Rollback: `rollback.sql.review` + reverter as 18 cópias.

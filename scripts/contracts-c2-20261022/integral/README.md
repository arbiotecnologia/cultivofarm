# C2 + financeiro próprio — pacote integral instalável (INATIVO, 2026-10-22)

Nada aqui foi aplicado em produção, implantado ou publicado. Nenhuma cópia foi promovida para `src`.

## Conteúdo
- `install.sql.review` — uma única transação (exatamente um `COMMIT`): guard estrutural C2 → provisioning/readers C2 → variante financeira multiperfil → guard pós-C2 (hashes de 3 funções calculados na réplica, `post-c2-baseline.json`).
- `rollback.sql.review` — deny-only, reexecutável; não apaga dados/histórico nem restaura grants inseguros.
- `frontend/manifest.json` + `frontend/runtime-copies/` — manifesto ÚNICO de 20 arquivos: cadeia C2 (AuthProvider, contextos, parceiro, guards, seletor, contrato), MobileLayout, financeiro próprio e cadastro/ciclo administrativo no formulário canônico Configurações. Inclui `externalUserDraft` cumulativo e `ExternalRegistrationFields`; fontes integrais não regeneram o formulário exclusivo antigo. `useMyPartner` permanece o superconjunto C2/financeiro. Baseline de Configurações fixado; drift aborta montagem.
- `hosted-capture*.json`, `hosted-schema-acl.txt`, `hosted-fingerprints-named.txt` — captura estrutural read-only do ref `swzpzcwiasxmjutrmvkm` (PostgreSQL 17.6), sem dados nem credenciais.
- `build_replica.py`, `fidelity.py`, `assemble.py`, `run_integral.py` — réplica descartável (PostgreSQL 17.9 local), montagem e cenários.

## Resultados (sintéticos)
- Fidelidade: 197 funções com md5/ACL/owner idênticos ao hosted; 16 relações protegidas com fingerprint idêntico (roles por nome).
- `run_integral.py`: **PASS 49** — instalação, reinstalação fail-closed, atribuições cumulativas B2B/técnico/produtor, portais, isolamento tenant/parceiro, CAS, replay idêntico e conflito de payload, **corrida real entre duas sessões** (uma vence, outra recebe `version_conflict`, um só efeito), revogação parcial preservando o restante, unlink/reativação sem ressuscitar perfis, produtor sem fazenda ativa negado, perfil inativo bloqueia tudo, financeiro próprio do gestor permitido e técnico/produtor/cross-tenant negados, capability de catálogo preservada, `acquire_gate` intacto (`b0dd9a14…`), rollback deny-only reexecutável.
- Frontend integral atualizado em 23/10 (`frontend/vitest.config.ts`): 14 arquivos, **128/128**; **15** casos montam a página candidata Configurações real (não dummy), componentes e payload reais com transporte/Auth sintéticos. Tipos das 20 cópias (`tsgo -p frontend/tsconfig.json`): sem erros.
- Edge `create-user` candidata: Deno **13/13**, `deno check` ok; alias `external_roles` opcional deve ser idêntico a `roles`, nunca fonte independente de concessão.
- Regressão de filtros: o caso "troca de papel" da suíte de `src` falha contra a cadeia candidata porque o guard candidato tira o técnico-only do portal B2B. Variante `frontend/ownerCatalogFilters.c2.session.test.tsx` mantém a invariante (sem linhas protegidas; filtros limpos ao voltar). A suíte de `src` continua 17/17 contra o runtime atual.

## Correções feitas no preparo
- `coordinated/build.py`: removia `COMMIT` errado e gerava dois; agora regex + assert de um único `COMMIT`.
- Guard estrutural C2 usava OIDs de roles (diferem entre bancos); agora nomes de roles.
- Guard fiscal aplicado foi preservado byte-idêntico (não reescrito).

## Limites — o que NÃO está provado
- Auth é sintética (`request.jwt.claims`); não é prova de JWT/RLS/REST hosted nem de navegador.
- Relações contextuais foram replicadas só estruturalmente (colunas/PK/RLS); policies/triggers/ACL próprios delas não.
- Semeadura de catálogo/plano e bootstrap de admins sintéticos usaram `session_replication_role=replica`; todos os cenários rodaram com triggers ativos.
- Cadastro novo agora admite Gestor B2B + Técnico B2B + Cliente/Produtor cumulativos; produtor exclusivo continua sem parceiro. Cliente/fazenda são lidos por RLS no tenant e revalidados pelo claim/finish servidor. Não cria fazendas nem atribuições técnicas de atendimento; estes vínculos continuam no fluxo canônico separado.
- Na edição, produtor existente sem parceiro pode selecionar parceiro da própria empresa antes de atribuir B2B. Atribuir produtor exige `user_clientes` já ativo/vigente e fazenda ativa (RPC); o lifecycle não cria esses vínculos. Sem parceiro escolhido, não existe contrato lifecycle para editar apenas produtor independente. Dados comuns de técnico exclusivo/multiperfil continuam indisponíveis pelo contrato legado de edição comum; não ampliado neste recorte.
- Uma confirmação envia o conjunto FINAL: `assign` quando adiciona algum perfil; `revoke_roles` quando só mantém/remove. Desvincular/reativar são comandos separados de vínculo; vínculo revogado impede confirmação de perfis até reativação explícita. CAS conflitante exige releitura. Tentativa incerta preserva mesma chave/payload; mudar tipo é bloqueado até confirmação, sem retry automático.
- Não houve navegador/JWT/RLS/Auth hosted nesta rodada; integração da página usa jsdom e transportes sintéticos. Layout visual e criação/edição A/B reais ainda exigem homologação após preflight/instalação coordenada. O build automático do runtime não certifica bundle das cópias inativas.
- XML/Edge: diagnóstico histórico preservado; seis testes textuais e a verificação vazia já foram atualizados em rodada anterior, sem alterar função fiscal. Fora desta correção C2.

## Instalação (somente pelo auditor, após revisão)
preflight read-only → `install.sql.review` → postflight → deploy Edge → promover exatamente o manifesto → homologação JWT/RLS real A/B. Rollback: `rollback.sql.review` + reverter as 20 cópias. Autorização do proprietário já registrada; este turno mantém tudo INATIVO durante revisão/preflight independente, sem solicitar novamente.

## Provas da correção de 23/10
`registration-review-20261023.md`, `frontend/registration-review.patch`, manifesto e `SHA256SUMS` atualizados. SQL de instalação e rollback byte-idênticos à revisão anterior; 49 checks PostgreSQL são evidência anterior, não reexecutados nesta rodada sem mudança SQL. Nenhuma operação hosted, deploy Edge, promoção `src` ou publicação.

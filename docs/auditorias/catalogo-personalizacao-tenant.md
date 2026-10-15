# Personalização do catálogo por empresa — Fase 1 (visibilidade de globais)

Base `bc427039`. Candidato local. **SQL NÃO aplicado, nada publicado.** Ownership e cadastro próprio da empresa ficam fora desta rodada.

## 1. Funcionalidade
Cada empresa pode ocultar e voltar a exibir produtos, microrganismos e culturas **globais** na sua gestão e nas novas seleções integradas.

## 2. Objetivo
Permitir que cada empresa controle o que aparece para ela, sem mudar o catálogo global nem afetar outra empresa.

## 3. Diagnóstico confirmado
- As tabelas `produtos`, `microrganismos`, `culturas`, `formulacoes` e `catalogo_volumes` não têm ownership.
- `authenticated` tem somente SELECT nessas tabelas (evidência independente do usuário). O preflight do SQL falha fechado se isso mudar.
- As policies antigas de escrita são dívida de clareza (P2), não escrita aberta.
- Não existia nenhuma preferência de visibilidade por empresa.
- `formulacoes` não tem `updated_at`.
- Achado paralelo, não alterado: `WizardRecomendacaoStep` consulta `nome_comum`/`nome_comercial`, colunas não confirmadas no schema (P2 UNVERIFIED).

## 4. Estrutura de dados (candidata)
**`catalog_tenant_visibility`:**
- Campos: `organization_id`, `entity_type`, `hidden`, `version`, `reason`, `updated_by`.
- Uma FK real por tipo (`produto_id`, `microrganismo_id` ou `cultura_id`), com CHECK exatamente-uma escrito como `IS TRUE`.
- Índice único por empresa+item.

**`catalog_tenant_visibility_ledger`:**
- Imutável: triggers bloqueiam UPDATE, DELETE e TRUNCATE.
- Unicidade ator+empresa+chave de idempotência; guarda o hash do payload, o estado antes/depois, o motivo e o resultado.

As duas tabelas têm RLS habilitada, nenhuma policy e nenhum grant para anon/authenticated.

## 5. Regras de negócio
- Ocultar não muda ativo, B2B, fórmula, composição ou preço global.
- Exibir um item inativo é recusado (`catalog_visibility_item_inactive`), e o seletor nunca devolve item inativo.
- A ocultação não é sigilo: a RLS SELECT global fica intacta e históricos, snapshots e vínculos continuam legíveis.
- A primeira gravação usa `expected_version=0`.
- Pedir o estado que já está gravado é recusado (`no_change`).

## 6. Fluxo do usuário
- Na Base técnica, as abas Produtos, Microrganismos e Culturas ganham a barra "Mostrar ocultos nesta empresa", o selo "Oculto nesta empresa" e o botão Ocultar/Exibir. O botão só aparece para administrador ou gestor e pede confirmação com motivo.
- O texto do diálogo diz exatamente onde a preferência vale e onde ainda não vale.
- No celular, o seletor de cultura do wizard de visita usa o seletor do servidor. A cultura já gravada aparece, mas fica desativada para nova seleção.

## 7. Permissões
| Ator | Ocultar/Exibir | Ler seletor/preferências |
|---|---|---|
| Superadmin da plataforma | negado | negado (fora da operação da empresa) |
| administrador/gestor + `catalogo_precos` | permitido na própria empresa | permitido |
| financeiro, consultor, técnico | negado | produtos/micros: só com `can_view_catalog_internal`; culturas: qualquer ator ativo da empresa com o entitlement |
| anônimo | sem EXECUTE | sem EXECUTE |

Regras do servidor:
- A empresa é sempre derivada no servidor (`h15_actor_organization` + organização `ativa`).
- As RPCs não têm parâmetro de empresa.
- O JWT é validado: `role`, `sub`, `exp` futuro e `iat` não futuro.

## 8. Consumidores
**Alterados:**
- `ProdutosTab` (gestão)
- `MicrorganismosTab` (gestão)
- `CulturasTab` em `Protocolos.tsx` (gestão)
- `WizardCampoStep` (nova seleção de cultura no celular)

**Pendentes, de propósito, com motivo:**
- `VisitaTecnica` desktop (culturas): o nome da cultura alimenta a fase fenológica do registro existente; precisa migrar com `include`.
- `WizardRecomendacaoStep`: depende do achado de colunas da seção 3.
- `OrdensServico`, `EnvasePage`, `PainelOperacional` (produção): o histórico é misturado com a seleção.
- `ParceiroNovoPedido`/`usePartnerPrices` (B2B): é preciso derivar a empresa fornecedora pelo vínculo comercial validado; não há leitor seguro nesta fase.
- `MobileCatalogoTecnico`, `RevisaoTecnicaPanel`, `useCatalogoUnificado`, `SimuladorComercial`, `Talhoes`/`SafrasTalhaoDialog`, `ObjetivosVisita`, `EncerramentoCard`: consulta ou edição de vínculo existente.
- BI, PDF/fichas, fiscal, portal: leitura histórica ou de vínculos. **Não devem** filtrar.

O diálogo informa essas limitações, para não prometer uma ocultação mais ampla do que a real.

## 9. Performance
- O seletor é paginado e filtrado no servidor (limite 100, offset, busca escapada).
- `include` aceita até 50 IDs.
- A gestão lê preferências em lotes de 500 IDs.
- Índices parciais por empresa+item e por ocultos.

## 10. Auditoria
- O ledger imutável grava motivo, ator, empresa, antes/depois, versão e hash do payload.
- O replay devolve o resultado gravado com `replayed=true`; um payload diferente com a mesma chave é recusado.
- Um advisory lock por empresa+item serializa a primeira gravação.

## 11. UI/UX e cache
- Chaves `["tenant-catalog", org, user, ...]`.
- Na troca de identidade ou empresa: `cancelQueries` + `removeQueries` da raiz, e a mutação é recusada se o escopo mudou desde que começou.
- A invalidação atinge só o escopo de origem.
- Respostas usam `abortSignal`.
- Sem fallback: um erro do RPC aparece como alerta e a gestão então mostra todos os itens, avisando.
- Resposta vazia ou incoerente na mutação nunca conta como sucesso.

## 12. Integrações
- B2B, fichas, preço canônico e gates ficam inalterados.
- O entitlement `catalogo_precos` já existente é exigido e não amplia o RBAC.

## 13. Riscos
- **P1 potencial:** ao aplicar o SQL antes de publicar a UI, nada quebra. Ao publicar a UI sem o SQL, o seletor de cultura do celular mostra erro. **A ordem obrigatória é aplicar e depois publicar.**
- **P1 potencial (fase futura):** ownership sem conter leitores DEFINER e descendentes.
- **P2:** policies antigas, achado do wizard de recomendação, consumidores pendentes.

## 14. Aceite (a comprovar após a aplicação)
- O que a empresa A oculta não afeta a B.
- Exibir restaura apenas na A.
- Item inativo não é reexibido.
- O histórico continua legível.
- Bombarbio, fórmulas, apresentações e preços continuam intactos.

## 15. Testes executados nesta rodada (local)
- Novos: 22/22 (lib 12, SQL estático 6, componente 4).
- `src/test/catalogo`: 23 arquivos, 586/586 PASS.
- Rodada ampla `catalogo`+`visita`+`saas` (antes do teste de componente): 1554 PASS, 2 skipped, 3 FAIL em `src/test/visita/etapasVisita.test.ts`. As três falhas leem `VisitaTecnica.tsx`, que **não** foi alterado nesta rodada: são pré-existentes e não foram corrigidas aqui.
- Typecheck app e node: PASS.
- Lint dos arquivos novos: 0 erros (2 warnings de fast-refresh). Os arquivos grandes já tinham erros `any`.
- Scanner de segredos: OK.
- Build: 30,10 s, PASS.

**Não executados:** o runtime SQL (`runtime-test-tenant-catalog-visibility.sql`, AR/FSF, rollback), JWT e browser reais, e produção. Os mocks não equivalem a login real.

## 16. Fases
1. **(esta)** Candidato de visibilidade, cache e consumidores de gestão + celular/cultura. Você revisa, aplica, roda o runtime e publica.
2. Integrar os consumidores pendentes (B2B pelo vínculo do fornecedor, desktop, produção) só quando houver um leitor seguro.
3. Ownership e CRUD próprio, depois da contenção dos leitores DEFINER e descendentes.
4. Matriz de evidências por canal e perfil.

## 17. Arquivos e rollback
**SQL:**
- `scripts/rbac-audit/proposed-tenant-catalog-visibility.sql` (NÃO APLICADO)
- `rollback-tenant-catalog-visibility.sql`: só revoga EXECUTE das 6 funções novas. Preserva preferências e ledger, sem DROP ou DELETE, e nunca concede escrita global. A UI volta ao commit anterior.
- `runtime-test-tenant-catalog-visibility.sql`

**App:**
- `src/lib/catalogo/tenantCatalogVisibility.ts`
- `src/hooks/useTenantCatalogVisibility.ts`
- `src/components/protocolos/TenantVisibilityControls.tsx`
- Alterados: `ProdutosTab.tsx`, `MicrorganismosTab.tsx`, `Protocolos.tsx`, `WizardCampoStep.tsx`

**Testes:** `src/test/catalogo/tenant-*.test.ts(x)`

AGENTS não foi alterado.

---

## Revisão independente de 6c0a1bc5 — correções (15/10/2026, SQL NÃO aplicado, NÃO publicado)

Afeta as seções 3 (diagnóstico), 6 (fluxo), 7 (permissões), 8 (impactos), 10 (auditoria), 11 (UI), 13 (riscos), 15 (testes) e 16 (fases).

1. **Diálogo (seção 11).** `TenantVisibilityToggle` congela na ABERTURA a intenção (empresa, usuário, item, versão, estado alvo). Mudança de empresa/usuário/item/versão/estado com o diálogo aberto fecha o diálogo e invalida a intenção (aviso). Geração (`gen`) muda ao abrir/fechar/mudar contexto/desmontar; sucesso ou erro tardio de geração antiga não dispara toast nem altera estado. Teste React com `rerender` + promessa pendente para troca de empresa, de usuário, de item e de versão.
2. **Idempotência (seção 10).** Chave por tentativa com payload congelado: retry do mesmo payload reusa a chave; alterar o motivo gera chave nova. SQL: lock `ator+empresa+chave` ANTES do lock `empresa+item` (ordem fixa), tornando replay/conflito da mesma chave em itens distintos consistente. Runtime novo `neg.mesma_chave_outro_item`.
3. **Seletor (seções 6, 9).** Chave de cache inclui `limit` e todos os inputs. Etapa Campo da visita no celular: busca no servidor (debounce 300 ms) e páginas de 50 (Anteriores/Próximas), sem baixar tudo. `include` devolve o item já vinculado mesmo fora da página/busca, sem duplicar a página (`in_page`), e mantém selecionável o item ativo/visível (não rebaixa). Carregando/erro desabilita o seletor; nova escolha só aceita linha selecionável de resposta válida.
4. **Culturas na visita (seção 7).** Base: a visita lia `culturas` direto, e a RLS `Portal: Ler culturas` é `true` para authenticated (consulta read-only). O candidato anterior exigia `catalogo_precos` também no seletor — regressão. Agora: modo `read_selection_cultura` sem gate comercial (exige empresa ativa, nega SA; é mais estreito que a RLS atual, não mais amplo). Gestão de culturas (`read_management`) e mutação continuam com `catalogo_precos`; mutação continua admin/gestor. Runtime `pos.cultura_sem_gate_comercial` (SKIP honesto se o consultor real tiver o recurso).
5. **Catálogos novos (seção 8).** Novo RPC `tenant_catalog_hidden_ids` (somente UUIDs da própria empresa, máx. 300; acima disso erro explícito). Exclusão aplicada NO SERVIDOR (`not id in (...)`) em:
   - `useCatalogoUnificado` escopos `admin` (Catálogo técnico da Base técnica) e `interno` (Simulador comercial) — produtos e microrganismos;
   - `MobileCatalogoTecnico` — produtos e microrganismos; respostas tardias descartadas.
   Sessão sem empresa (plataforma) = catálogo global sem filtro. Erro/indisponível = fail-closed com mensagem, sem lista sem filtro. Detalhes de registros vinculados/históricos usam outras consultas e não são filtrados.
   - `useCulturas`: único consumidor é a gestão em `Protocolos.tsx`, já com sobreposição e "Mostrar ocultos".
   - **Pendentes explícitos:** portal B2B (`scope b2b`, empresa fornecedora exige vínculo comercial validado), pedidos/produção/recomendações/composição; culturas em `MobileVisitaWizard`, `VisitaTecnica`, `Talhoes`, `SafrasTalhaoDialog`, `ObjetivosVisita`, `BIFiltrosGlobais`, `useCatalogTargetsCrops`. Texto do diálogo agora é por entidade e lista exatamente onde vale.
6. **Diagnóstico (seção 3).** `useAuth` já executa `queryClient.clear()` na troca de identidade, `TOKEN_REFRESHED`, `USER_UPDATED` e saída; o fence de escopo do catálogo é complementar. O baseline do Dashboard Admin com vários cards "indisponível" segue sem causa determinada e não é atribuído a esta fase.
7. **Evidência local (seção 15).** Catálogo 602/602 (inclui 20 unit + 9 React do recorte); catálogo+SaaS+multiportal 1473/1473 (base 6c0a1bc5: 1457/1457); visita/fluxo técnico 255 PASS/2 SKIP/3 FAIL — as mesmas 3 falhas de `etapasVisita.test.ts` reproduzidas na base extraída de 6c0a1bc5 (pré-existentes). Typecheck app/node PASS. Lint dos arquivos alterados: novos arquivos 0 erros; arquivos legados com o mesmo número de erros da base (useCatalogoUnificado 21, MobileCatalogoTecnico 11, WizardCampoStep 3). Scanner de segredos OK. Build PASS (30,39 s).

**Limitações honestas.** SQL candidato, rollback e runtime NÃO foram aplicados nem executados no banco; não há PASS de runtime nem login real nesta rodada. Enquanto o SQL não estiver aplicado, catálogo técnico/simulador/catálogo do celular e o seletor de cultura da visita mostram erro explícito para usuários com empresa (fail-closed) — por isso o candidato NÃO deve ser publicado antes da aplicação. Testes React usam mocks e não provam sessão real. Ownership/CRUD próprio fora do escopo.

## Correção pontual — etapa Recomendação do assistente de visita (celular)
- `WizardRecomendacaoStep.tsx` (montado em `MobileVisitaWizard`) consultava colunas inexistentes `microrganismos.nome_comum` e `produtos.nome_comercial` (confirmado pelo usuário no information_schema canônico). Corrigido para `microrganismos(nome, nome_cientifico)` e `produtos(nome)` em consulta, ordenação e rótulos (`src/lib/visita/recomendacaoCatalogo.ts`).
- Nova seleção: somente itens ativos; erro de consulta/schema aparece explícito e desativa o seletor. Visualização de recomendações vinculadas: nomes lidos pelos IDs referenciados, sem filtro de ativo; valor atual fora dos ativos aparece "indisponível para nova seleção". A ocultação por empresa NÃO é aplicada neste seletor (pendente) e a tela não promete isso.
- SQL do candidato 05c21b13 inalterado; nada aplicado nem publicado.

## Legado confirmado — etapasVisita.test.ts
Revisão independente reproduziu 24 PASS / 3 FAIL em `src/test/visita/etapasVisita.test.ts` na base anterior ao candidato; localmente as mesmas 3 falhas aparecem na base extraída de 6c0a1bc5. Classificado como dívida legada, não regressão desta fase.

## Pendência — testes independentes do diálogo
Dois testes independentes de rerender/resposta tardia falharam contra 6c0a1bc5 (antes das correções do diálogo). Reexecução contra 05c21b13 está em curso pelo revisor; resultado ainda não registrado aqui.

## Dívida P2 — escalabilidade da ocultação
`tenant_catalog_hidden_ids` + filtro `NOT IN` funciona até 300 ocultos por entidade; acima disso o catálogo fica indisponível com erro explícito. Isso NÃO é paginação do catálogo completo nem solução sem limite. Próxima fase: leitor completo no servidor com anti-join (`NOT EXISTS`) e paginação, substituindo a lista de IDs no cliente.

## FAIL real pós-publicação de7d5cc5 — cache após reexibir (15/10/2026)
**Evidência externa (usuário/revisor):** migração `20261015035122` tenant_catalog_visibility APLICADA (05c21b13) — NÃO REAPLICAR. Runtime independente 49 PASS/0 FAIL/2 SKIP (fixture inativo em rollback); frontend 604 PASS incl. 2 race; mobile 25 PASS; types/build; scanner 3930 arquivos sem achados. Publicação confirmada ("Seu site foi atualizado"). UI real Admin AR: ocultou Bombarbio (hidden=true v1) → Catálogo Técnico 9 produtos sem Bombarbio; reexibiu via Mostrar ocultos/Exibir (hidden=false v2 confirmado por SQL; ledger 2 eventos Admin AR). **FAIL:** de volta ao Catálogo Técnico, seguia 9 produtos e busca "Bomb" vazia até recarregar a página (10 produtos). Estado atual: Bombarbio visível em AR; global ativo/B2B/R$180 L/updated_at intacto; receita 334/333/333; FSF 0 preferências e seletor FSF com Bombarbio=1 enquanto AR ocultava (isolamento OK). Mobile 390 sem overflow.

**Causa reproduzida (QueryClient real):** ao voltar à aba, a lista de ocultos em cache (antiga) era entregue enquanto era relida, e o catálogo era montado/servido com a chave do estado anterior; a invalidação só refazia leituras ativas e não descartava a lista anterior.

**Correção local (sem SQL/DDL):** após cada mutação, no escopo empresa+usuário de origem: cancel + reset das listas de ocultos (descarta dado anterior e respostas em voo); invalidação com refetch de todas as leituras `tenant-catalog` do escopo e de todos os `catalogo-unificado` (admin/interno), inclusive inativos. Leitor de ocultos com `staleTime 0`, `refetchOnMount "always"` e estado "carregando" enquanto relê — nenhum catálogo (Base técnica, Simulador, celular) é montado com a lista antiga. Outras empresas não são tocadas (chaves por empresa+usuário). Texto do diálogo conforme a ação: ocultar "deixa de aparecer", exibir "volta a aparecer".

**Teste:** `tenant-visibility-cache.integration.test.tsx` com QueryClient real alternando abas (desmontagem), ocultar/exibir, ocultos relidos com atraso e resposta em voo anterior à mutação — 3/3 (o caso "lista antiga durante releitura" falhava antes da correção). Catálogo 606/606; typecheck PASS; lint 0 erros nos arquivos alterados; build e scanner OK.

**Status:** FAIL real até nova prova em navegador real após revisão/publicação pelo agente revisor. Fase NÃO concluída. Pendentes: B2B, pedidos/produção, demais seletores (cultura e etapa Recomendação), dívida P2 de escalabilidade (hidden_ids ≤300), ownership/CRUD próprio.

### Revisão a78b6919 (NÃO publicada) — ajustes do patch de cache
1. **Sem refetch forçado por observer.** Removidos `staleTime 0`, `refetchOnMount "always"` e "carregando enquanto relê" do leitor de ocultos (risco de loop pai+filho: CatalogoTecnicoTab só monta CatalogoCardsGrid quando não carrega, e ambos usam o mesmo hook). Dado obsoleto pós-mutação resolvido apenas por cancel+reset dos ocultos do escopo e invalidação aguardada no `onSettled`. Teste com árvore pai+filho e dois observers: após estabilizar, 2 leituras de ocultos (produto+micro) e 1 do catálogo, sem novas chamadas em 200 ms.
2. **Invalidação restrita.** `catalogo-unificado` só é invalidado/relido para chaves `admin`/`interno` cuja parte de ocultos começa exatamente com `empresa|usuário|` do escopo de origem. Teste com cache semeado de outro usuário da mesma empresa, outra empresa, B2B e global: nenhuma queryFn chamada e nenhuma chave invalidada.
Integração 6/6 (inclui ocultar/exibir com troca de aba, releitura atrasada e resposta em voo). Status permanece FAIL real até prova em navegador após publicação pelo revisor.

---

## FECHAMENTO PARCIAL — prova externa final (15/10/2026, 04:18 UTC)

**Migração e publicação (externas, não deste agente):**
- Migração `20261015035122` tenant_catalog_visibility APLICADA no canônico `swzpzcwiasxmjutrmvkm` (candidato 05c21b13). **NÃO REAPLICAR.**
- `a78b6919` NÃO publicado: teste independente reproduziu 13 RPCs em 12 ciclos (risco de loop pai+filho); corrigido em `5f9a38bc`.
- `5f9a38bc0265d0cd0f16bb9151ae40f8f2b91bc6` PUBLICADO pelo agente revisor com confirmação "Seu site foi atualizado".

**Runtime e checks independentes (evidência externa, não reexecução própria):**
- Runtime SQL: 49 PASS / 0 FAIL / 2 SKIP; fixture inativo em rollback separada. SKIP honestos: ator real sem `catalogo_precos` e produto inativo real (cenário coberto pela fixture). Concorrência com 2 conexões: UNVERIFIED.
- Frontend independente: 612 testes em 26 arquivos PASS, incluindo os 2 de race e 1 de loop criados por este agente. Os 613 remotos são evidência separada — não somar.
- Scanner final: 3932 arquivos, zero achados. Typecheck app/node PASS. Build 35,05 s PASS.
- Lint dos arquivos novos: 0 erros (warnings de fast-refresh). Lint ampliado da versão anterior: 82 erros/8 warnings, mantido como dívida. As 3 falhas legadas de `etapasVisita.test.ts` permanecem como dívida legada confirmada na base.

**UI real Admin AR (segundo ciclo, sem reload entre ações):**
- Ocultar Bombarbio (v3) → Catálogo Técnico com 9 produtos sem o item → Mostrar ocultos/Exibir (v4) → Catálogo Técnico com 10 produtos com Bombarbio, **sem recarregar a página**.
- O FAIL real de cache da publicação `de7d5cc5` está **corrigido e PASS** neste cenário.
- Diálogo de Exibir diz "volta a aparecer": PASS.
- Mobile 390: documento 390 / diálogo 390 / scroll 388, sem overflow; override removido.
- Isolamento: FSF via SQL manteve Bombarbio selecionável enquanto AR ocultava e segue com 0 preferências; UI FSF UNVERIFIED.
- Invariantes globais intactas: Bombarbio ativo/B2B R$180/L, `updated_at 2026-10-14T22:02:40.521334Z`, receita 334/333/333.
- Ledger: 4 eventos reais dos dois ciclos; produto VISÍVEL restaurado.
- Advisors: 19 INFO RLS sem policies (+2 novas tabelas intencionalmente sem grant direto), 2 anon DEFINER / 341 authenticated DEFINER / 1 aviso de senha — legados inalterados.

**Fechamento PARCIAL do recorte:** visibilidade de produto comprovada em UI real Admin AR; micro/cultura e demais roles comprovados por SQL. NÃO é auditoria integral.

**Pendentes (não iniciar nova fase sem autorização):**
- B2B (empresa fornecedora via vínculo comercial), pedidos/produção e demais seletores (cultura desktop, etapa Recomendação).
- Dívida P2 de escalabilidade: `hidden_ids` + `NOT IN` até 300 ocultos; acima disso indisponibilidade explícita. Próxima fase precisa de anti-join no servidor e paginação no leitor completo.
- Testes de UI com outros roles, fluxo mobile integral e concorrência real.
- Ownership/CRUD próprio (fase futura, após contenção de leitores DEFINER e descendentes).

---

## FASE 3 — Ownership e CRUD próprio: CANDIDATO (base 66c0f449, 15/10/2026)

**Estado: fundação segura DESABILITADA. Nada aplicado, nada publicado.** O fechamento abrangente de leitores não coube neste recorte; por isso o CRUD só existe atrás de um gate de servidor que nasce OFF e exige `readers_certified_at`.

Arquivos: `scripts/rbac-audit/proposed-tenant-catalog-ownership.sql`, `rollback-tenant-catalog-ownership.sql`, `runtime-test-tenant-catalog-ownership.sql`; frontend `src/lib/catalogo/tenantCatalogOwnership.ts` (`TENANT_OWNED_CATALOG_ENABLED=false`) + `src/test/catalogo/tenant-catalog-ownership.test.ts`.

### Inventário (leitura SQL própria no canônico, read-only)
- Schema: nenhuma das 5 tabelas tem dono; grants anon/authenticated = SELECT apenas (preservado).
- Policies SELECT permissivas por papel SEM filtro de dono (ex.: `culturas` "Portal: Ler culturas" `USING true`; produtos/micros internos e B2B; volumes cliente_produtor/B2B/staff). Policies de escrita legadas existem (Staff manage culturas/volumes, formulações por `can_manage_catalog_tecnico`), inertes por falta de grant.
- Descendentes por FK: produtos 29 tabelas, microrganismos 22, culturas 8, catalogo_volumes 1 (dossiês regulatórios). Inclui pedidos/simulações/itens B2B, preços (`commercial_*`, `partner_product_prices`), fiscal (`product_fiscal_profiles`, `microorganism_fiscal_profiles`), produção (OS, on-farm, lotes, programação, estoque, embalagens, etiquetas), entregas, visitas/recomendações, talhões/safras.
- SECURITY DEFINER que leem as tabelas: ~70 (lista abaixo).

### Mapa de leitores DEFINER (precisam filtrar dono ANTES de abrir o gate)
| Grupo | Funções | Exigência | Status |
|---|---|---|---|
| SA/plataforma globais | `platform_private.read_global_*`, `platform_read_global_product_catalog_core`, `read_global_product_composition_core`, `read_global_b2b_state_core`, `set_global_*`, `create_global_*`, `update_global_*`, `catalog_volume_*`, `change_global_volume`, `platform_wipe_global_product_catalog` | `owner_organization_id IS NULL` em leitura e alvo de escrita | UNVERIFIED (não alterado) |
| Visibilidade Fase 1 | `catalog_tenant_selection_core`, `catalog_tenant_set_visibility_core` | só global (ocultar/exibir) + próprios na seleção | UNVERIFIED |
| B2B/portal | `get_partner_catalog_secure`, `get_partner_catalog_tecnico_secure`, `b2b_save_technical_simulation`, `get_portal_cliente_b2b_*_detail_secure`, `generate_production_orders_from_partner`, `rpc_b2b_*` | global + privados do FORNECEDOR do vínculo comercial | UNVERIFIED |
| Preço | `fn_catalogo_preco_canonico`, `fn_catalogo_litro_canonico`, `fn_b2b_resolve_base_unit_price`, `fn_catalogo_sync_mestre_preco`, `rpc_commercial_simulator`, `rpc_cc_validate_matrix`, `trg_mestre_guard_preco_canonico` | escopo de dono do ator/fornecedor | UNVERIFIED |
| Fiscal | `rpc_fiscal_draft_save`, `rpc_fiscal_nfe_readiness_v1`, `fn_fiscal_scenario_coverage`, `rpc_associate_microorganism_fiscal_product` | itens do emitente | UNVERIFIED |
| Produção/entrega | `get_production_planning_detail`, `rpc_criar_embalagens_pos_envase`, `rpc_gerar_etiqueta_produto`, `fn_entrega_build_snapshot_v1`, `fn_comprovante_entrega_montar_v1`, `rpc_get_comprovante_entrega_data`, `_entrega_seed_checklist`, `fn_notify_lab_on_programacao` | escopo do tenant da OS | UNVERIFIED |
| Visita/cultura | `rpc_criar_visita_idempotente`, `rpc_get_visita_workspace`, `rpc_listar_atendimentos_tecnicos_v1` | cultura global ou própria do tenant | UNVERIFIED |
| Regulatório/fichas | `approve_*_profile_with_audit`, `update_*_b2b_description`, `rpc_microorganism_regulatory_overview`, `rpc_regulatory_dossier_ensure_draft` | só global | UNVERIFIED |
| Códigos | `proximo_codigo`, `set_codigo_produto`, `set_codigo_microrganismo` | sem vazamento de sequência entre empresas | UNVERIFIED |

Como nenhum privado pode existir com gate OFF, nenhum leitor acima vaza hoje — contenção por ausência de dados, não por filtro.

### O que o candidato faz
- Coluna `owner_organization_id` (NULL=global, sem backfill) nas 5 tabelas; `archived_at` em produtos/micros.
- Trigger raiz: dono imutável; dono não-NULL só com gate aberto e vindo do núcleo (impede SA/service_role/DML lateral).
- Trigger descendente: formulação/volume herdam dono do pai; componente privado de outra empresa → `catalog_cross_owner_reference`.
- Policies RESTRICTIVE de SELECT: global + empresa do ator; SA/anon só global.
- Núcleo `catalog_owned_mutate_core` (DEFINER, `search_path=''`) atrás de fachada INVOKER `tenant_catalog_owned_mutate` (sem parâmetro de empresa, sem anon): admin/gestor + `catalogo_precos` (reusa `catalog_tenant_actor('mutate')`, SA negado); create/update/archive lógico/composição; CAS `updated_at`; idempotência ator+empresa+chave com hash; motivo 10–500; ledger imutável antes/depois.
- Duplicata no servidor: normalização case/acentos/espaços/pontuação, advisory lock por nome, índice único parcial por empresa; global ativo → `duplicate_global_active` (UI orienta localizar e Exibir); global inativo → `duplicate_global_inactive` (orienta solicitar ativação); outra empresa nunca consultada. Identificadores além de nome (código/registro) NÃO conferidos: `codigo` é gerado e não há campo de registro confiável — pendente.
- Invariantes pré/pós: Bombarbio ativo/B2B, receita 334/333/333, zero privados, gate OFF.

### Rollback
Fecha gate e revoga EXECUTE; se houver privados, preserva coluna/policies/triggers (não expõe); sem privados, remove estrutura. Ledger e Fase 1 nunca tocados; sem GRANT.

### Evidências
| Item | Resultado |
|---|---|
| Testes novos (9) + catálogo completo 619/619 | PASS local |
| typecheck app/node | PASS local |
| lint arquivos novos | 0 erros/0 warnings; baseline ampliado 82 erros/8 warnings mantido como dívida |
| scanner de segredos | PASS local |
| build | PASS local (27.93s) |
| SQL candidato aplicado / runtime | **UNVERIFIED** — não executado; exige revisão e aplicação independentes |
| Concorrência 2 conexões | UNVERIFIED |
| UI CRUD / selo Global/Próprio nas telas | NÃO implementado (gate fechado; tipos sem coluna) |

### Pendente (bloqueia abrir o gate)
1. Filtrar dono em cada leitor do mapa; B2B pelo fornecedor do vínculo comercial existente.
2. Apresentações (`catalogo_volumes`) próprias: RPC não incluída.
3. Triggers nos descendentes de pedidos/preço/fiscal/produção rejeitando privado de outra empresa.
4. UI em `/base-tecnica` (editores atuais, selo, confirmação de arquivamento) após tipos regenerados.
5. Identificadores além de nome para duplicata; escala NOT IN 300 (P2) herdada.

---

## FASE 3 — Revisão 2 (após revisão independente de 0fe35743, 15/10/2026)

**Estado: candidato 01 (fundação) + 02 (leitores SA/visibilidade/h7n/preço). NÃO aplicado, NÃO publicado, gate OFF.** Nada abaixo é PASS de banco: runtime não executado.

### Correção dos achados
| # | Achado | Correção no candidato | Prova |
|---|---|---|---|
| 1 | RESTRICTIVE FOR ALL em culturas bloqueava SELECT próprio | policies separadas INSERT/UPDATE/DELETE nas 5 tabelas; SELECT só por `catalog_owner_scope` | teste estrutural; runtime `ar_le_propria` UNVERIFIED |
| 2 | `translate` desalinhado (ú→o, ç→u, ñ→c) | `normalize(lower(x),NFD)` + remoção U+0300–036F + autoteste no DDL | **SQL read-only real no canônico (PG 17.6/UTF8)**: Ácido Úmido→acido umido, ação→acao, Ñandu→nandu, CAFÉ e cafe+U+0301→cafe, Pão/Ç→pao c, ÿü→yu |
| 3 | runtime sem `iat`, temporárias sem grant | claims com sub/role/iat/exp; GRANT em `_r/_ctx`/helpers; gate aberto só dentro da transação; termina em ROLLBACK; coluna real do ledger (`entity_type/entity_id`) corrigida após leitura do schema | estrutural; execução UNVERIFIED |
| 4 | `canManageOwnedItem` sem comparar empresa | assinatura `(row, actorOrganizationId, canManage, enabled)`; teste negativo FSF×AR | PASS local |
| 5 | campos desconhecidos/NULL/composição vazia | whitelist por entidade/operação (`catalog_owned_allowed_keys`), tipos jsonb, `IS NOT TRUE`, composição exige 1–50 itens únicos e válidos, arquivado só aceita `restore`, no-op rejeitado | estrutural; runtime UNVERIFIED |
| 6 | concorrência com SA e índices legados | lock consultivo por nome normalizado tomado no **trigger raiz** (vale para SA e tenant); `microrganismos_nome_unique`/`culturas_nome_ci_uidx` substituídos por equivalentes `WHERE owner IS NULL` (criados antes de remover); códigos seguem globais e não aceitos do cliente | estrutural; concorrência 2 conexões UNVERIFIED |
| 7 | reatribuição via pai, GUC como autorização | sem GUC; trigger exige `catalog_tenant_actor('mutate') = dono` (rejeita SA, service_role, anon, outra empresa); pai/dono imutáveis em descendentes; exclusão física de privado proibida; visibilidade rejeita item privado | estrutural; runtime UNVERIFIED |
| 8 | famílias/composição química | família/classe opcionais com coerência explícita (NULL=pendente); composição química/fertilizante (`produto_composicao_declaracoes`), doses, preços e apresentações próprias **não implementadas** — não é cadastro completo; quatro abas preservadas | — |

### Matriz leitor → escopo → teste (recorte desta rodada)
"Antes" = md5 de `pg_get_functiondef` lido no canônico (fixado no preflight do 02; divergência aborta). "Depois" = corpo completo no 02, diferença marcada `-- [OWNER]`.
| Função | md5 antes | Escopo depois | Teste |
|---|---|---|---|
| platform_read_global_product_catalog_core | 473a0996… | só global | estrutural PASS; runtime UNVERIFIED |
| read_global_product_metadata_core | 5d5fc5ea… | só global | idem |
| read_global_microorganisms_core | 9f63a20b… | só global | idem |
| read_global_microorganism_detail_core | 6178944c… | só global | idem |
| read_global_cultures_core | 3db0904a… | só global | idem |
| read_global_culture_detail_core | b0902a00… | só global | runtime `sa_core_privado` UNVERIFIED |
| read_global_item_volumes_core | 6e2f7bfc… | pai e volumes globais | estrutural |
| read_global_volume_detail_core | 382661e5… | volume global | estrutural |
| read_global_b2b_state_core | 9f514955… | só global | estrutural |
| read_global_product_catalog_by_family_core | 799a9655… | só global | estrutural |
| read_global_product_composition_core | 25422d89… | produto e receita globais | estrutural |
| catalog_tenant_selection_core | 4bde8390… | global + próprio ativo não arquivado da empresa | estrutural |
| catalog_tenant_hidden_ids_core / read_visibility_core | — | inalterados (só preferências) | — |
| catalog_tenant_set_visibility_core | — | inalterado; trigger rejeita item privado | runtime `visibility_private_rejected` UNVERIFIED |
| private.h7n_catalogo_ficha_produtos (vw_catalogo_ficha_produtos) | 8c335e3c… | global + próprio do ator | estrutural |
| private.h7n_catalogo_ficha_microrganismos (vw_catalogo_ficha_microrganismos) | 959d28c6… | global + próprio do ator | estrutural |
| fn_catalogo_preco_canonico | fa5e890d… | NULL fora do escopo do ator | runtime `fsf_preco_privado_null` UNVERIFIED |
| fn_catalogo_litro_canonico | 96242cde… | vazio fora do escopo | estrutural |

Writers SA (`set_/update_/create_global_*`, volumes, família, composição, B2B, wipe): não reescritos; linhas privadas barradas estruturalmente pelos triggers do 01 (SA não passa em `catalog_tenant_actor`). Edge functions com service_role (`ai-refresh-fichas`, `ai-generate-ficha-campo`, `ai-sugerir-alvos`, `admin-audit-produtos-orfaos`): sem `auth.uid`, `catalog_reader_org()` = NULL ⇒ só global nos leitores filtrados; leitura direta com service_role ignora RLS — **precisam de filtro explícito `owner IS NULL` (pendente, próxima rodada)**. `resolverMicroorganismItem` é puro; o loader que o alimenta não foi auditado.

### Próxima rodada (bloqueia abrir o gate)
B2B (`get_partner_catalog_*`, simulação, pedidos, `fn_b2b_resolve_base_unit_price`, `rpc_commercial_simulator`, `rpc_cc_validate_matrix`) pelo fornecedor do vínculo; fiscal; produção/entrega/etiquetas; visita/cultura; regulatório; `proximo_codigo`; 7 views; Edge service_role; triggers em descendentes comerciais/fiscais; apresentações próprias; UI em `/base-tecnica`.

### Rollback
Fecha gate, limpa certificação e revoga as quatro funções. Se houver privados OU o 02 estiver aplicado, preserva colunas/policies/triggers/filtros (não expõe). Caso contrário recria unicidade legada antes de remover índices reescopados e remove a estrutura. Ledger e Fase 1 nunca tocados; sem GRANT.

### Evidências desta rodada
| Item | Resultado |
|---|---|
| Normalização NFD (SQL read-only real) | PASS (valores acima) |
| Bombarbio 1000mL/R$180 ativo, ledger visibilidade 4 eventos (read-only) | confirmado |
| Testes ownership 17 + catálogo completo 627/627 | PASS local |
| typecheck app/node, lint arquivos novos (0/0), scanner, build 26.11s | PASS local |
| Aplicação 01/02, runtime 40+ casos, concorrência | **UNVERIFIED** |

---

## FASE 3 — Revisão 3 (após 110c9c41, 15/10/2026) — candidatos 01+02 corrigidos, 03 novo. NÃO aplicado, gate OFF.

| Achado | Correção | Prova |
|---|---|---|
| A `normalize(...,NFD)` qualificado → 42703 | literal `'NFD'`; autoteste no DDL ampliado | erro reproduzido e expressão EXATA testada read-only no canônico: Açúcar→acucar, Único/U+0301→unico, 26 maiúsculas e 28 minúsculas acentuadas OK, '   '→NULL |
| B proporção invertida | `(x BETWEEN 0.000001 AND 100) IS FALSE`; NULL aceito; escala ≤6 | SELECT real: 50/100/0.000001 aceitos; 101/-1/0 rejeitados |
| C trigger compartilhado | dois triggers separados (formulações/volumes) sem campo alheio + autoteste UPDATE em linha global no DDL | estrutural; runtime `global_child_update` UNVERIFIED |
| D pós varrendo pg_proc | pós confere só as funções do manifesto (02: 16, 03: 6) | estrutural |
| E SA writers/preview | 03: `catalog_volume_parent/row/assert_row/preview_token` só globais → `change_global_volume`, `create_global_volume_core` e leitores de volume ficam indisponíveis para privado antes de qualquer leitura/token/replay | md5 fixado; runtime UNVERIFIED |
| F runtime | casos de autorização exigem SQLSTATE/mensagem específicos; normalização, limites de proporção e nomes iguais AR/FSF adicionados | estrutural |

**03 B2B:** `get_partner_catalog_secure` e `get_partner_catalog_tecnico_secure` filtram global + itens do fornecedor (`partner_accounts.commercial_owner_organization_id` do parceiro já autorizado, conferido contra `b2b_commercial_context()`); interno só se a empresa do ator for o fornecedor; SA só global. ACL das funções de preço (`fn_b2b_resolve_base_unit_price`, `fn_resolve_commercial_price`, `rpc_commercial_simulator`) preservada e conferida no pós. Item próprio nasce `b2b_enabled=false` e não há caminho tenant para ligar — B2B privado fica inerte por desenho.

**Edge:** filtros preparados em `scripts/rbac-audit/edge-global-filter-ownership.patch.md`, propositalmente NÃO aplicados em `supabase/functions` (implantação automática quebraria antes do DDL).

**Ainda pendente antes de abrir o gate (bloqueia):** SA writers não-volume (`set_global_product_composition_core`, `set_global_product_family/status_core`, `set_global_b2b_enabled_core`, `update_global_*_core`, `set_global_*_status_core`) — leitura prévia/replay a filtrar; simulação/pedidos B2B (`b2b_save_technical_simulation`, `get_portal_cliente_b2b_*`, `generate_production_orders_from_partner`); fiscal; produção/entrega/etiquetas; visita; regulatório; `proximo_codigo`; 7 views (incl. `v_microorganism_fiscal_readiness`, `vw_bi_*`); RLS de descendentes; UI própria em `/base-tecnica` (desligada); composição química/fertilizantes, apresentações, doses e preços próprios.

| Evidência | Resultado |
|---|---|
| Expressões SQL A/B (read-only real) | PASS |
| Testes catálogo 632/632, typecheck app/node, lint novos 0/0, scanner, build 28.84s | PASS local |
| Aplicação 01–03, runtime, concorrência | UNVERIFIED |

---

## FASE 3 — Recorte 04 candidato (base dada2410, 15/10/2026 13:07 UTC)

**Estado: 01–04 locais, NÃO aplicados, NÃO publicados, gate OFF.**

### Delta confirmado
- Correção exata integrada: `char_length(v_val #>> '{}') > (CASE WHEN v_key='nome' THEN 500 ELSE 10000 END) THEN`.
- PGlite 0.5.10 externo reproduziu as quatro falhas anteriores e, após essa correção, compilou a fundação com 8 checks PASS. PGlite usou colunas reais e stubs de identidade: é evidência de sintaxe/comportamento isolado, não prova de Auth real, PostgreSQL remoto, RLS ou gate.
- Schema canônico read-only confirmou `formulacoes.microrganismo_id NOT NULL`. O candidato não relaxa a constraint nem cria micro fictício: biológicos usam `formulacoes`; químicos/fertilizantes usam `produto_composicao_conjuntos` e `produto_composicao_declaracoes` já existentes.

### Candidato 04 — referências operacionais
O arquivo `proposed-tenant-catalog-ownership-04-operational-containment.sql` fixa um manifesto de FKs e instala triggers fail-closed para **novas/alteradas** referências privadas em tabelas ainda sem resolução de owner certificada. O erro público é único (`catalog_private_reference_module_unavailable`) e não revela outro tenant. Não altera linhas históricas, snapshots, grants ou fluxos globais.

| Família | Tabelas contidas | Escopo nesta rodada | Resultado |
|---|---|---|---|
| B2B/preço | partner_order_items, partner_product_prices, partner_simulation_items, commercial_* | privados bloqueados até fornecedor/owner completo | estrutural local; runtime UNVERIFIED |
| Fiscal/regulatório | product_fiscal_profiles, microorganism_fiscal_profiles/dossiers/snapshots/presentations indiretas | privados bloqueados | estrutural local; runtime UNVERIFIED |
| Produção/estoque/entrega | ordens_servico*, programacao_producao, lotes, estoque_*, entregas, cq_parametros | privados bloqueados | estrutural local; runtime UNVERIFIED |
| Visita/agronomia | registros_consultor*, talhoes/safras, visitas_campo, recomendações/alvos | privados bloqueados | estrutural local; runtime UNVERIFIED |
| Fichas/conformidade | *_technical_profiles, produto_conformidade_perfis, produto_etiquetas | privados bloqueados | estrutural local; runtime UNVERIFIED |

`get_partner_catalog_secure` ainda mantém o guard legado `b2b_actor_scope.org_partner`; o filtro candidato usa `commercial_owner_organization_id` validado contra `b2b_commercial_context`. Isso preserva compatibilidade para parceiro-cliente comercial AR sem inferir organização SaaS independente, mas runtime com ator real continua UNVERIFIED. Funções de preço sem EXECUTE cliente continuam fechadas.

### UI preparada, desligada
- Mesma rota `/base-tecnica`; nenhum menu, rota ou módulo paralelo.
- Selo `Global`/`Próprio` nas listas existentes de produtos, microrganismos e culturas.
- Componente focal de editar/arquivar/restaurar próprio existe, mas retorna `null` com `TENANT_OWNED_CATALOG_ENABLED=false`; nenhuma mutação é alcançável.
- Mensagens de duplicata global permanecem: ativa orienta localizar e **Exibir**; inativa orienta solicitar ativação à plataforma.

### Limites reais / NO-GO
1. O recorte 04 **contém** referências privadas nos módulos não certificados; não implementa sua integração operacional completa.
2. Writers SA não-volume, replay/preview, todas as funções DEFINER e sete views/BI ainda exigem definições completas com md5 antes/depois e negativos runtime; não basta marcador textual.
3. Apresentações/preços/doses próprios e editores completos das quatro famílias continuam desligados. A composição química/fertilizante é SQL candidata, sem prova runtime.
4. Auth real, concorrência de duas conexões, aplicação 01–04, migration remota, browser e produção continuam **UNVERIFIED/NO-GO**.
5. Bombarbio, visibilidade AR v4/ledger 4 e receita/preço são invariantes do candidato; nenhuma escrita remota ocorreu nesta rodada.

---

## FASE 3 — Candidato 05 backend (15/10/2026 13:17 UTC)

**Estado: NÃO aplicado, NÃO publicado, gate OFF.** A evidência PGlite 26 checks dos candidatos 01–03 é externa e usa stubs Auth; não certifica PostgreSQL/Auth/RLS real.

### Fechado no arquivo 05
- Manifesto de 12 writers SA com hashes live antes e definições completas depois. Locks, alvos e referências de composição foram limitados a `owner_organization_id IS NULL`; ACLs existentes não foram ampliadas.
- `microrganismos.product_id` passou a exigir produto do mesmo owner; global não aponta para privado e privado não cruza empresa.
- `produto_composicao_conjuntos/declaracoes` receberam guard de pai/crossref e leitura hereditária global+empresa do ator, sem grant de escrita ao cliente.
- RPC própria de apresentações/preços/doses: empresa derivada no servidor, admin/gestor+`catalogo_precos`, CAS, idempotência, auditoria no ledger, cálculo pelos triggers existentes e nenhuma compensação best-effort.
- O trigger 04 agora ignora UPDATE que não altera a coluna de referência, preservando manutenção de históricos; rollback dos bloqueios só é seguro antes de privados persistirem e permanece parcial/fail-closed depois disso.

### Matriz de fechamento desta rodada
| Superfície | Status 05 | Evidência/limite |
|---|---|---|
| 12 writers SA listados | FECHADO estrutural | hash antes + corpo completo global-only; runtime real UNVERIFIED |
| `microrganismos.product_id` | FECHADO estrutural | trigger mesmo-owner; runtime UNVERIFIED |
| composição conjuntos/declarações | FECHADO estrutural | RLS herdada + crossref; runtime UNVERIFIED |
| apresentação/preço/dose próprio | FECHADO candidato | RPC atômica/auditada; runtime real UNVERIFIED |
| `platform_wipe_global_product_catalog` | FECHADO estrutural no 05 | hash live + corpo completo; roots filtradas e descendentes por join ao pai global; runtime real UNVERIFIED |
| fiscal/regulatório (`rpc_*`, `fn_fiscal_scenario_coverage`) | **ABERTO/NO-GO** | definições live inventariadas; ainda sem corpos 05 global-only |
| 7 views/BI e demais funções do inventário total | **ABERTO/NO-GO** | não há certificação total nesta rodada; 04 bloqueia novas refs, não filtra leitura |

Não há alegação de fechamento integral: enquanto wipe, leitores e views acima estiverem abertos, o gate não pode ser aberto e nenhuma UI funcional deve ser publicada.

---

## FASE 3 — Candidato 06 parcial de leitores operacionais (15/10/2026 13:55 UTC)

**Estado: NÃO aplicado, NÃO publicado, gate OFF.** A execução PGlite 26 PASS/1 FAIL foi evidência externa isolada; o FAIL 23514 revelou literais incompatíveis e foi corrigido no candidato 01, sem transformar stubs em prova de Auth/RLS real.

### Correção do contrato de composição própria
- O payload agora exige `status: rascunho|completo` e itens estruturados com as oito chaves do writer global.
- Tipos aceitos: `microrganismo|ingrediente_ativo|nutriente|outro`; unidades: `mL/L|g/L|g/kg|%m/m|%m/v|%v/v|UFC/mL|UFC/g`; bases: `por_volume_produto|por_massa_produto`; naturezas: `teor_garantido|concentracao_declarada`.
- Família×tipo, identidade, medida conjunta, limites, UUID, duplicidade e microrganismo global/próprio permitido são validados no servidor. Nada é inferido do nome.
- `formulacoes` não é apagada nem recebe químicos/fertilizantes; `microrganismo_id NOT NULL` permanece intacto. Declarações usam exclusivamente `produto_composicao_conjuntos/declaracoes`.

### Matriz individual SQL06
| Superfície | Hash live | Escopo candidato | Prova |
|---|---|---|---|
| `fn_fiscal_scenario_coverage()` | `962230c7…` | microrganismos globais | três filtros explícitos de root |
| `rpc_fiscal_nfe_readiness_v1()` | `75487176…` | herda cobertura global | corpo live completo preservado, inclusive certificado |
| `rpc_microorganism_regulatory_overview()` | `a5763623…` | microrganismos globais | filtro explícito de root |
| `v_product_fiscal_readiness` | `af802dc9…` | perfis cujo produto é global | join explícito ao pai global |
| `v_microorganism_fiscal_readiness` | `be3f247c…` | microrganismos globais | filtro explícito de root |
| `vw_bi_commercial_campaigns` | `23b08739…` | contagem só de produto global | join explícito ao pai global |
| `vw_bi_estoque_produto` | `054a615a…` | nomes apenas de roots globais | joins explícitos; histórico preservado |
| `vw_bi_movimentacoes` | `4530d450…` | movimento com root global ou sem root | joins e predicado explícitos |
| `vw_bi_commercial_revenue` | `297b9932…` | sem root de catálogo | parent autorizado pelas RLS comerciais, definição preservada |
| `vw_bi_commercial_engagement` | `48392cff…` | sem root de catálogo | parent autorizado pelas RLS comerciais, definição preservada |

As duas views públicas `vw_catalogo_ficha_*` não entram nas sete: são wrappers das funções `private.h7n_*` já fechadas no candidato 02 com hashes live. Nenhum grant foi ampliado.

### Limites reais
- SQL06 possui definições completas e preflight de hash, mas não foi aplicado nem executado contra Auth real. Hash antes não prova hash depois nem semântica de RLS.
- O parser gramatical e os testes estáticos não substituem compilação PL/pgSQL/PGlite completa; esta permanece pendente para o SQL06.
- O inventário live por referência textual aos cinco roots ainda enumera leitores operacionais fora do SQL06, incluindo B2B/pedidos/simulações, produção, entrega, visita, fiscal e regulatório. Logo, esta matriz não é TOTAL e não autoriza rows privadas.
- Gate, UI mutável e publicação permanecem desligados até revisão independente, aplicação controlada, runtime negativo/positivo e concorrência.

## Correções das falhas PGlite reportadas (15/10/2026)
| Falha externa | Correção candidata | Estado |
|---|---|---|
| Conjunto acessava `NEW.microrganismo_id` | guard de conjunto e guard de declaração separados | UNVERIFIED até nova execução |
| RLS chamava helper sem EXECUTE | helper booleano `catalog_composition_parent_visible`, sem retornar owner, EXECUTE só authenticated | UNVERIFIED |
| Ledger rejeitava `presentation` | CHECK explicitamente recriado com `presentation` | UNVERIFIED |
| Wrapper sem nomes/payload frouxo | argumentos nomeados, pai arquivado bloqueado, tipos estritos, no-op e derivados excluídos do diff | UNVERIFIED |

Os testes estáticos não certificam o SQL. Evidência externa informada: laboratório 20 PASS/4 FAIL antes destas correções.

## Regra separada: laboratório somente biológico
Candidato `proposed-lab-biological-only-07.sql`: elegibilidade por `familia_catalogo='biologico'` ou microrganismo; triggers protegem novas programações/lotes e não bloqueiam updates históricos irrelevantes. Ainda NO-GO: faltam corpos completos com hash após alteração das cinco entradas e prova de pedido misto.


## FASE 3 — Fechamento local de ownership e integração UI (15/10/2026 13:49 UTC)

**Estado: candidato local; sem DDL remoto, sem publicação, gate OFF.**

### Evidência independente incorporada
- SQL01 de `0add`: **27/27 PASS no PostgreSQL PGlite independente**, com CHECKs reais e stubs de Auth explicitamente não equivalentes ao Auth/RLS canônico. Cobriu composição biológica/química e preservação da receita.
- SQL05 e SQL07 ainda aguardam a execução independente anunciada. Nenhum resultado está antecipado como PASS.

### Inventário live reconciliado (somente leitura)
- Consulta canônica nesta rodada encontrou **83 funções nominais** em `public|platform_private|private` que referenciam os cinco roots, sendo 32 `platform_private`, 2 `private` (`h7n`) e 49 `public`, além de **60 FKs**. Uma busca mais estrita por nomes qualificados encontrou 68; as outras 15 usam nomes não qualificados. O total live diverge em uma função das 84 informadas no snapshot independente e a diferença permanece explicitamente UNVERIFIED, sem inventar a 84ª entrada.
- As 60 FKs live substituem a contagem anterior de 59: a diferença inclui relações criadas após o snapshot original, especialmente declarações/apresentações. O manifesto 04 continua fail-closed para novas referências privadas; cada relação não listada deve ser adicionada antes de qualquer row privada.
- Artefatos read-only desta rodada registraram nome, assinatura, ACL, SECURITY DEFINER e hash das 83 funções, além da lista nominal das 60 FKs. Classificação permitida: pura; sem EXECUTE autenticado; trigger; pai bloqueado pelo 04; registro autorizado; ou leitor que requer filtro explícito. ACL sem `authenticated` não foi tratada automaticamente como prova: chamadores foram considerados.

### Sete views originais
| View original | Estado candidato | Prova/limite |
|---|---|---|
| `vw_os_integridade_esteira` | preservada | projeta histórico de OS/lote; novas refs privadas permanecem bloqueadas no 04; não é catálogo de seleção |
| `_src_vw_fluxo_visita_tecnica` | preservada | projeta registro autorizado e histórico; 04 bloqueia nova referência privada ainda não certificada |
| `v_microorganism_fiscal_readiness` | corrigida no 06 | filtro explícito `owner IS NULL` |
| `vw_bi_commercial_campaigns` | corrigida no 06 | contagem só de produto global |
| `vw_bi_estoque_produto` | corrigida no 06 | roots globais; histórico prévio preservado |
| `vw_catalogo_ficha_microrganismos` | fechada no 02 | wrapper de `private.h7n_catalogo_ficha_microrganismos` com filtro global |
| `vw_catalogo_ficha_produtos` | fechada no 02 | wrapper de `private.h7n_catalogo_ficha_produtos` com filtro global |

O SQL06 anterior continha sete views, mas três (`vw_bi_commercial_revenue`, `vw_bi_commercial_engagement`, `vw_bi_movimentacoes`) não pertenciam ao conjunto original pedido. Permanecem como hardening adicional candidato; não substituem a prova das duas primeiras views acima.

### UI CRUD próprio ligada ao contrato
- `/base-tecnica` agora tem handlers e formulários próprios para produto, microrganismo e cultura: criar, editar, arquivar e restaurar chamam exclusivamente `tenant_catalog_owned_mutate`; globais continuam sem edição/exclusão tenant.
- Produto próprio suporta família/classe explícitas e composição declarativa estruturada; nenhuma receita é inferida nem `formulacoes` é substituída. Microrganismo global ativo pode ser referenciado; o servidor continua responsável pela negação cross-tenant.
- Apresentações próprias usam exclusivamente `tenant_catalog_owned_presentation_mutate`, com CAS, motivo, idempotência e invalidação de cache; o caminho global direto não foi reutilizado.
- Duplicata global ativa oferece “Localizar”; se oculto, a lista abre ocultos para permitir “Exibir”. Global inativo orienta solicitar ativação à plataforma.
- Escopo de mutação é congelado por empresa+usuário; troca de identidade/empresa rejeita a tentativa e invalida caches por org+usuário. UI é dica: autorização permanece integralmente no servidor.
- O gate client/server permanece OFF; os handlers estão integrados e testáveis, mas não montam controles mutáveis no ambiente atual.

### Laboratório — fase 07 separada
- Live informado: 10 produtos (1 biológico, 9 `familia_catalogo NULL`) e 1 OS/1 programação/1 lote históricos ligados a produto sem família. Não há backfill nem reclassificação automática.
- Guardas candidatos preservam updates históricos que não trocam produto/microrganismo; novas entradas exigem família explícita e somente `biologico`/microrganismo.
- Conversões de pedido misto/solicitação e mensagens continuam pendentes. SQL07 permanece NO-GO e separado da migração ownership.

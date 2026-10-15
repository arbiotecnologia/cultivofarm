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

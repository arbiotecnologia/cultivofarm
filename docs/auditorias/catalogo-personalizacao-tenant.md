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

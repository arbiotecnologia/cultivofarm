# Personalização do catálogo por empresa: auditoria e plano

Base: `638fd28a`. Composição `20261015030146` está aplicada (não reaplicar). UI `5049477d` está publicada. Esta etapa não altera código, DDL, dados nem publicação.

## 1. O que a auditoria confirmou (leitura no Supabase `swzpzcwiasxmjutrmvkm` e no código)

**Quem é dono de cada tabela.** `produtos`, `microrganismos`, `culturas`, `formulacoes` e `catalogo_volumes` **não têm `organization_id`**. Todo o catálogo atual é global. Nada indica a qual empresa um item antigo pertence, então não vamos atribuir dono a item antigo.

**Personalização que já existe.** Não há tabela de visibilidade nem de preferência de catálogo por empresa. As tabelas existentes não servem para isso:
- `organization_feature_overrides` controla planos e recursos.
- `user_access_preferences`, `bi_user_preferences` e `executivo_user_preferences` guardam preferências do usuário, não da empresa.

Por isso não há fluxo paralelo a evitar: a visibilidade precisa de estrutura nova, aditiva.

**Regras de acesso atuais (RLS):**
- `produtos` e `microrganismos`: inserir, alterar e excluir só para o Superadmin da plataforma. A leitura é separada para equipe interna e para B2B (`*_select_internal`, `*_b2b_read`).
- `formulacoes`: inserir, alterar e excluir liberado por `can_manage_catalog_tecnico`, que inclui administrador, gestor, consultor técnico e técnico agrônomo **de empresa**, numa tabela global.
- `catalogo_volumes`: tem a regra antiga "Admin gestor manage" (ALL), que convive com as regras novas `catalog_volumes_sa_*`.
- `culturas`: tem a regra "Staff manage global catalog" (ALL para administrador/gestor) e a regra "Portal: Ler culturas" com leitura `true`.

**Cache no app.** As chaves `["catalogo-unificado", scope]`, `CULTURAS_QUERY_KEY` e `["product-profile", id]` não incluem empresa nem identidade.

**Onde o catálogo é consumido (37 arquivos, fora testes):**
- Base técnica: `ProdutosTab`, `MicrorganismosTab`, `RevisaoTecnicaPanel`.
- Celular: `MobileCatalogoTecnico`, `MobileVisitaWizard`, `WizardCampoStep`, `WizardRecomendacaoStep`.
- B2B: `usePartnerPrices`, `FichasTecnicas`, `ParceiroNovoPedido`.
- Produção: `OrdensServico`, `EnvasePage`, `PainelOperacional`.
- Fichas e PDF: `fichaTecnicaProdutoPdf`, `fichaTecnicaMicrorganismoPdf`, `dossieMicrorganismosPdf`.
- Visitas e talhões: `VisitaTecnica`, `EncerramentoCard`, `Talhoes`, `SafrasTalhaoDialog`.
- BI: `BIFiltrosGlobais`, `EficienciaBioinsumos`.
- Portal: `PortalFazendas`, `PortalFazendaDetalhe`.
- Fiscal: `useProductFiscalProfiles`, `useMicroorganismFiscalAssociation`, `useFiscalMicrorganismosLite`.
- Hooks: `useCatalogoUnificado`, `useCulturas`, `useProductProfile`, `useCatalogTargetsCrops`.

As quatro abas globais ficam em `/plataforma` (`PlatformCatalogReadTab`, entidades e diálogos). A base técnica fica em `/base-tecnica?tab=catalogo-tecnico`.

## 2. Riscos

**Diagnóstico corrigido (evidência do usuário):** `authenticated` tem somente SELECT em `produtos`, `microrganismos`, `culturas`, `formulacoes` e `catalogo_volumes`. As policies antigas de escrita (`formulacoes` via `can_manage_catalog_tecnico`, "Admin gestor manage" em volumes, "Staff manage global catalog" em culturas) não abrem escrita sem grant. Não há P1 de escrita global; a contenção atual não será refeita nem as permissões restauradas em rollback. Policies antigas ficam registradas como P2 (limpeza futura, sem efeito). `formulacoes` não tem `updated_at`: CAS ali não pode usar essa coluna.

**P1 de leitura a proteger antes de ownership:** funções DEFINER e views descendentes (`vw_catalogo_ficha_*`, leitores B2B/PDF/fiscal) ignoram RLS; antes de existir item próprio por empresa, todas precisam filtrar por empresa, senão vazam itens de outra empresa.

**P1 no app.**
- **P1-d:** as chaves de cache sem empresa e identidade podem mostrar dados antigos depois de trocar de conta ou de empresa. Isso já é obrigatório para a personalização.

**P2:**
- `culturas` com leitura `true` para todos (decidir se é intencional para o portal).
- Inconsistência entre `has_role` e `platform_private.has_role`.
- O seed client-side (`seedCatalogoARBioV13`) grava no catálogo.

Os P1 com evidência são corrigidos na Fase 1, antes da personalização, porque esta não pode depender de escrita global aberta.

## 3. Matriz de permissões (alvo)

| Ação | Superadmin | admin/gestor da empresa | técnico/consultor | B2B / produtor | anônimo |
|---|---|---|---|---|---|
| Criar/editar/arquivar item global | sim, por RPC | não | não | não | não |
| Ocultar/exibir item global na empresa | não (fora da operação da empresa) | sim | não | não | não |
| Criar/editar item próprio da empresa | não | sim | sim (produtos, composição, volumes) | não | não |
| Arquivar item próprio | não | sim | não | não | não |
| Ler global ativo e não oculto | sim | sim | sim | conforme as regras B2B atuais | não |
| Ler item próprio | não | sim (mesma empresa) | sim (mesma empresa) | não, nesta fase | não |
| Ler item já vinculado (histórico) | sim | sim | sim | conforme as regras atuais | não |

Regras que valem para todas as linhas:
- Ocultar não muda ativo, B2B ou status global e não libera item global inativo.
- Nada aqui amplia papel nem plano: vale a interseção plano×papel já existente.

## 4. Modelo proposto (mínimo e só aditivo)

**Visibilidade.** Nova tabela `catalog_tenant_visibility`:
- Campos: `organization_id`, `entity_type` (produto, microrganismo ou cultura), `entity_id`, `hidden`, `version`, `reason`, `updated_by`, `updated_at`.
- Chave única: empresa + tipo + item.
- Não aceita escrita direta. Só RPC do tipo INVOKER (`tenant_catalog_set_visibility`) com núcleo privado DEFINER, que:
  - deriva a empresa de `auth.uid()` → `profiles.organization_id`, com organização ativa, e rejeita empresa enviada pelo cliente;
  - nega o Superadmin;
  - exige que o item seja global e ativo;
  - usa CAS por `version`, chave de idempotência, ledger imutável e motivo.

**Itens próprios.** Coluna nova, que pode ficar vazia, `owner_organization_id` em `produtos`, `microrganismos` e `culturas`:
- vazia = item global ou antigo; nunca é preenchida para itens antigos;
- só é gravada na criação e não muda depois (trigger);
- regra de leitura nova: só a mesma empresa.

Escrita somente pelas RPCs `tenant_catalog_*` (criar, alterar e arquivar com `ativo=false` quando o item é referenciado; excluir de fato só se não houver referência). As regras de escrita global continuam exclusivas do Superadmin, e os itens próprios nunca passam por elas.

**Leitura unificada.** RPC `tenant_catalog_list(entity, family, page)` que devolve:
- itens globais ativos não ocultos;
- itens próprios da empresa;
- origem `global` ou `proprio`.

Itens já vinculados (pedidos, OS, visitas, snapshots) continuam lidos pelas consultas atuais, sem filtro de ocultação.

## 5. Fases (pequenas e reversíveis)

**Fase 0 — diagnóstico somente leitura**
- Rodar o SQL do anexo.
- Listar grants, regras e RPCs/Edge que gravam nas cinco tabelas, e confirmar P1-a/b/c.
- Saída: seção de evidências no relatório.

**Fase 1 — fechar escrita global (P1)**
- Migration candidata que:
  - restringe `formulacoes` (inserir, alterar, excluir) a Superadmin, mantendo a leitura;
  - remove o ALL antigo de `catalogo_volumes` e de `culturas`, mantendo leitura equivalente.
- O rollback recria as regras anteriores a partir de um snapshot textual, sem apagar dados.
- Risco operacional: o editor de receita da base técnica (`composicaoSync`, `ProdutosTab`) para de gravar para técnicos. A UI mostra "somente plataforma". **Decisão sem evidência:** confirmar se técnicos editam receitas hoje em produção (há consulta no anexo).
- Critério para fechar: tentativas negadas com login real de técnico e de gestor; Superadmin continua gravando; Bombarbio intacto.

**Fase 2 — visibilidade por empresa**
- Tabela, RPCs e ledger da visibilidade.
- Integração nas leituras: `useCatalogoUnificado`, `useCulturas`, os seletores dos wizards, `ParceiroNovoPedido` e `usePartnerPrices` (só para novas seleções).
- Ação "Ocultar/Exibir na minha empresa" em `ProdutosTab`, `MicrorganismosTab` e na aba de culturas, para admin/gestor.
- Critério para fechar: duas empresas com ocultações independentes; histórico e PDF continuam mostrando o item oculto já vinculado.

**Fase 3 — itens próprios**
- `owner_organization_id`, trigger de imutabilidade e RPCs de CRUD.
- Editor reaproveitado da base técnica, com selo "Próprio".
- Composição de item próprio reaproveita `formulacoes` ou as declarações, com dono derivado do produto.
- Critério para fechar: a empresa A não vê nem edita itens da B; dono forjado é rejeitado; arquivar item referenciado preserva o histórico.

**Fase 4 — cache e celular**
- Chaves `[..., organizationId, userId]` e descarte de respostas atrasadas (epoch/AbortSignal).
- Celular e B2B com o mesmo leitor.

As quatro abas do Superadmin continuam como estão, mostrando só o global. Itens próprios não aparecem nelas.

## 6. Testes para fechar o recorte

- Runtime SQL com ROLLBACK, duas empresas e atores reais parametrizados:
  - papéis permitidos e negados;
  - empresa forjada e dono forjado;
  - Superadmin negado na operação da empresa;
  - item global inativo;
  - CAS e replay;
  - anônimo e JWT inválido;
  - preservação de Bombarbio, preços, apresentações e snapshots.
  SKIP fica separado de PASS.
- Vitest: leitor, seletores com ocultação, chaves de cache por empresa e usuário, resposta atrasada e controles desativados durante a gravação.
- Typecheck app/node, lint focal, scanner de segredos e build.
- Teste de mock não conta como login real. O PASS com navegador e JWT exige sessões reais das duas empresas, a cargo do usuário ou com autorização para usar contas já existentes.

## 7. Arquivos

**Novos:**
- `scripts/rbac-audit/diagnostic-tenant-catalog.sql`
- `proposed-global-catalog-write-closure.sql` + rollback + runtime
- `proposed-tenant-catalog-visibility.sql` + rollback + runtime
- `proposed-tenant-catalog-own-items.sql` + rollback + runtime
- `src/lib/catalogo/tenantCatalog.ts`
- `src/hooks/useTenantCatalog.ts`
- `src/components/protocolos/TenantVisibilityAction.tsx`
- testes em `src/test/catalogo/tenant-*.test.ts(x)`
- `docs/auditorias/catalogo-personalizacao-tenant.md`

**Alterados:**
- `useCatalogoUnificado.ts`, `useCulturas.ts`, `useProductProfile.ts`
- `ProdutosTab.tsx`, `MicrorganismosTab.tsx`
- `MobileCatalogoTecnico.tsx`, `WizardRecomendacaoStep.tsx`
- `ParceiroNovoPedido` (somente o filtro de nova seleção)
- `roadmap.md`

AGENTS não será alterado.

## Anexo — SQL de diagnóstico (somente leitura)

```sql
-- grants
select table_name, grantee, string_agg(privilege_type, ',') from information_schema.role_table_grants
 where table_schema='public' and table_name in ('produtos','microrganismos','culturas','formulacoes','catalogo_volumes')
 group by 1,2 order by 1,2;
-- regras completas
select tablename, policyname, permissive, cmd, roles, qual, with_check from pg_policies
 where tablename in ('formulacoes','catalogo_volumes','culturas') order by 1,4;
-- quem gravou receitas recentemente (há edição por técnico?)
select date_trunc('day', updated_at), count(*) from formulacoes group by 1 order by 1 desc limit 30;
-- funções que gravam no catálogo
select proname, prosecdef from pg_proc where pronamespace='public'::regnamespace
 and pg_get_functiondef(oid) ~* '(insert into|update|delete from)\s+(public\.)?(produtos|microrganismos|culturas|formulacoes|catalogo_volumes)\b';
```

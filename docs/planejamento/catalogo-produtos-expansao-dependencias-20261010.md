# Expansão do catálogo de produtos — auditoria de dependências e plano técnico

## 1. Mandato, escopo e decisão desta rodada

Solicitação recebida em 2026-10-10 02:42 UTC: adicionar ao catálogo existente **Químicos (Herbicidas/Fungicidas/Inseticidas), Fertilizantes/Adubos e Sementes/Tratamento de sementes**, preservando biológicos. Esta entrega é **somente auditoria local de dependências e planejamento**; não implementa abas, schema, RPCs, dados, doses ou recomendações. Sem banco, publicação, alteração funcional, dependências ou AGENTS. O fechamento financeiro externo `4717ff86` está no H6/roadmap, separado deste plano.

**Decisão:** GO para revisão do plano; **NO-GO para implementação ampla e operação das novas famílias** até aprovação das pequenas fases. Tratamento de sementes é finalidade de produto/aplicação, não sinônimo de semente; não deslocar biologicamente ou quimicamente um produto para outra família por esse uso.

## 2. Proveniência e limites da evidência

Auditoria própria **estática/read-only**, com investigação paralela de frontend, comercial/estoque e fiscal. Caminhos e trechos citados são do checkout observado, não catálogo vivo do PostgREST. Não executados SQL, Auth/JWT/browser, testes de dados ou chamadas remotas. Migrations antigas são evidência histórica, **não prova da última definição implantada ou dos grants atuais**.

Contrato usado pelo cliente: `src/integrations/supabase/client.ts:3` importa **`./cultivofarm.types`**, localizado em `src/integrations/supabase/cultivofarm.types.ts`. `restoration/cultivofarm-binding/README.md` documenta o contrato, mas o caminho de cópia mencionado ali não foi encontrado naquela pasta nesta auditoria; não tratar README como localização atual. `src/integrations/supabase/types.ts` é contrato gerenciado e não pode substituir silenciosamente o canônico. Divergência temporal entre tipos e migrations permanece **UNVERIFIED** sem leitura autorizada do servidor.

Supabase exclusivo `swzpzcwiasxmjutrmvkm`; não usar Cloud/outro ref. A auditoria não acionou ferramenta de banco. Quando houver autorização posterior, comprovar ref antes de qualquer leitura/migration.

## 3. Inventário das entradas existentes

| Entrada/arquivo exato | Função atual e impacto previsto |
|---|---|
| `src/pages/Protocolos.tsx` | Importa `ProdutosTab`/`CatalogoTecnicoTab` (20–21); mantém outras abas como culturas/problemas. Acrescentar filtros dentro da experiência existente, sem refazer essas abas ou criar módulo paralelo. |
| `src/components/protocolos/ProdutosTab.tsx` | Gestão produto/composição, preços, volumes, PDFs e ficha técnica; 1.204 linhas. `Produto` (64–81), snapshots (86–89), save compensatório (104–179), loader de quatro consultas (184–199). |
| `src/components/protocolos/CatalogoTecnicoTab.tsx` | Catálogo unificado técnico; deve receber família/finalidade sem campos comerciais novos. |
| `src/hooks/useCatalogoUnificado.ts` | `PRODUTOS_SELECT` (34–35) sem preços: `id,nome,codigo,tipo,descricao,modo_acao,funcao_completa,ativo,b2b_enabled`; normaliza produtos e microrganismos, scope interno/B2B (112–172). |
| `src/pages/app/MobileCatalogoTecnico.tsx` | Leitura móvel e normalização técnica; não herdar automaticamente formulário desktop ou cálculos financeiros. |
| `src/hooks/usePartnerCatalog.ts` | `get_partner_catalog_secure(p_partner_id)` (61–69); catálogo comercial com preço resolvido. |
| `src/hooks/usePartnerCatalogTecnico.ts` | `get_partner_catalog_tecnico_secure()` (16–25), sem argumento de parceiro; mapper ainda contém campos de preço (36–67), embora null possa sinalizar bloqueio. Exige prova negativa de payload, não apenas ocultar rótulo. |
| `src/components/protocolos/ProductTechnicalProfileDialog.tsx` | Reutilizar ficha técnica, sem fabricar indicações de uso. |
| `src/lib/pdf/catalogoProdutosPdf.ts`, `src/lib/pdf/fichaTecnicaProdutoPdf.ts` | Saídas dependem de valores/doses/unidades; inclusão de família não autoriza exportação sensível. |

Abas propostas: **Biológicos**, **Químicos** com filtro Herbicidas/Fungicidas/Inseticidas, **Fertilizantes/Adubos**, **Sementes/Tratamento de sementes**. Na última, separar claramente produto semente de produto para tratamento. Manter acesso ao legado não classificado, sem classificar todos os registros existentes como biológicos por padrão.

## 4. Taxonomia: não confundir `tipo` com família

`produtos.tipo` no contrato canônico (14681–14702) usa `tipo_produto` (21551–21556): **`inseticida`, `fungicida`, `solo`, `inoculante`, `solubilizador`**. Esses valores descrevem aplicação/função; `fungicida`/`inseticida` não provam química versus biologia. `e_insumo`, `b2b_enabled` e `ativo` também não classificam família.

**Proposta de nomes novos, ainda inexistentes/pendentes de aprovação:**

| Campo em `public.produtos` | Contrato proposto |
|---|---|
| `familia_catalogo` | texto nullable, sem default; domínio validado `biologico`, `quimico`, `fertilizante_adubo`, `semente`. NULL significa não classificado, não biológico implícito. |
| `classe_quimica` | texto nullable; `herbicida`, `fungicida`, `inseticida`; somente quando família química e comprovada. |
| `finalidades_catalogo` | text[] nullable, inicialmente finalidade `tratamento_sementes` quando documentada; demais valores só após revisão. |
| `classificacao_fonte_id` | UUID nullable apontando fonte técnica canônica comprovada; verificar compatibilidade do catálogo de fontes antes de FK. |
| `classificacao_revisada_em`, `classificacao_revisada_por` | metadados da revisão, servidor; não autorizar via payload nem user metadata. |

Não alterar enum para incluir `quimico`/`semente`, não mapear herbicida para `solo`. **Gargalo real:** `tipo` é obrigatório no contrato atual. Se nova família não possui aplicação expressável, a primeira fase de cadastro deve parar: não preencher valor falso. Alternativa a revisar é permitir `tipo` NULL exclusivamente para novos registros classificados, após inventariar NOT NULL, triggers, leitores e validações; isso é mudança de compatibilidade, não simples coluna aditiva, e requer autorização separada. Manter valor de todo histórico intacto.

## 5. Identidade de produto, histórico e código

Reutilizar `produtos.id`, sem nova tabela concorrente de produtos e sem duplicar referências de pedidos, lote ou fiscal. `codigo`, `nome`, `descricao`, `modo_acao`, `modo_aplicacao`, `funcao_completa`, `versao_catalogo` permanecem.

`src/lib/protocolos/autoCodigo.ts` contém `PREFIXOS_PRODUTO` e `gerarProximoCodigoProduto` ligados ao tipo (15–21,47–55). Classificação nova não deve renumerar códigos existentes nem reexecutar sequências. Antes de admitir novo item sem tipo, decidir como o gerador existente recebe namespace próprio de família, mantendo algoritmo legado e proteção de unicidade/concorrência no servidor. Prefixos novos **não definidos nesta rodada**.

`PRODUTO_SNAPSHOT_COLUMNS`/`FORMULACAO_SNAPSHOT_COLUMNS` precisam incorporar apenas campos novos efetivamente escritos; rollback não pode apagar classificação legítima posterior. Pedidos, simulações, preços e notas históricas conservam snapshots e unidades originais. Nenhum backfill automático por nome, função ou descrição; reconciliação futura individual com fonte e autoria.

## 6. Cadastro técnico, composição e fontes

`formulacoes` usa `produto_id`, `microrganismo_id`, `component_insumo_id`, `volume_ml`, `proporcao`, `e_volume_fixo` (`ProdutosTab.tsx:51–61,88–89`). Não inserir concentração de fertilizante ou ingrediente químico como microrganismo, nem peso como `volume_ml`. Preservar composição biológica e suas compensações. Cadastro mínimo das famílias novas pode reutilizar produto/ficha **sem composição incompatível**; composição específica exige contrato posterior.

`product_technical_profiles` (canônico13901–13921): `produto_id`, `resumo_curto`, `explicacao_tecnica`, `explicacao_produtor`, `explicacao_b2b`, `indicacoes_uso`, `janela_aplicacao`, `cuidados_aplicacao`, `beneficio_combinado`, `compatibilidade`, `observacoes_regulatorias`, `status_validacao`, `validado_por`, `validado_em`. Compatibilidade é texto, não motor aprovado de mistura.

`src/hooks/useEffectiveCatalogSources.ts` liga `catalog_technical_sources.entidade_tipo/entidade_id` a produto/ficha (`produto`, `ficha_produto`); `src/hooks/useCatalogSources.ts` é dependência de fontes. Exigir procedência da classificação e instruções oficiais; não gerar doses/receitas pela IA nem marcar `VALIDATED` por preencher formulário. Campos novos de ingrediente ativo, formulação, garantias, cultivar/lote e registros oficiais dependem de requisitos regulatórios documentados antes de schema; **não inventados como obrigatórios universais**.

## 7. Unidades físicas, apresentação e dose

Base atual é líquida: `dose_ml_ha`, `valor_litro_brl`, `valor_dose_brl`; `catalogo_volumes.volume_ml`; `formulacoes.volume_ml`. `src/lib/catalogo/pricing.ts:3–15` fixa **100 mL/dose e 10 doses/L**. `src/hooks/useCatalogoVolumes.ts:27–41` divide por 1.000 e por 100. `src/lib/catalogo/unidades.ts` aceita `hectare`, `litro`, `dose_100ml`, `volume_comercial`, `sob_consulta`; não há preço/kg/semente canônico.

**Proposta aditiva de campos nullable sem defaults físicos:** `unidade_base` (ex.: `L`, `kg`, `un`; domínio fechado aprovado), `quantidade_apresentacao`, `unidade_apresentacao`, `dose_quantidade`, `dose_unidade`, `dose_base_quantidade`, `dose_base_unidade`. Esses nomes são **propostos**, não existentes. Relação comercial como saco não define peso: requer quantidade/unidade documentadas. Semente pode ter contagem, massa ou embalagem, nunca conversão automática entre essas dimensões.

NULL/unidade desconhecida impede cálculo e operação dimensional, não fallback para L. Não defaultar produtos antigos para L sem prova. Campos legados continuam para contratos líquidos já existentes; novos campos coexistem com revisão dimensional explícita. Nenhuma dose numérica agrícola exemplificada. Validações de quantidade finita positiva e dimensão compatível no servidor; não criar fator mágico para kg→L, semente→kg ou hectare→dose sem documentação.

## 8. Preços e motor comercial canônico

`src/lib/protocolos/pricingRecalc.ts` e `src/lib/catalogo/pricing.ts` sincronizam litro/dose/ha; migration histórica `20260619152712_c1d8b591-274f-47ff-8e5a-17defaab6d5e.sql` define `calculate_valor_litro_from_dose`, `calculate_valor_dose_from_litro`, `calculate_valor_ha_from_dose`, `sync_product_pricing`/`sync_microorganism_pricing`. Inventariar definição atual antes de condicionar trigger a dimensão líquida; mudar somente labels produz preço incorreto.

RPCs existentes no contrato:
- `fn_resolve_commercial_price(p_buyer_scope,p_customer_id,p_microrganismo_id,p_partner_id,p_plan_id,p_product_id,p_quantity,p_ref_date,p_unit_type,p_volume_ml)` (18470–18483).
- `fn_resolve_b2b_cart(p_items,p_partner_id,p_plan_id,p_ref_date)` (18461–18468).
- `get_partner_catalog_secure(p_partner_id)` e `get_partner_catalog_tecnico_secure()` nos hooks citados.

Migration `20261006190720_e2db3d80-7c5c-4117-9ff4-e632456202ca.sql` restringe resolvedores com parceiro arbitrário a service_role; **não reabrir grants nem usá-los como caller elevado**. Preço de sólidos/sementes só após resolver unidade no core autorizado existente, com elegibilidade, vigência, mínimos, descontos e snapshots. **Não adicionar `valor_unidade_brl` como segundo motor/preço vencedor no frontend**. Revisar contrato de preço por unidade e apresentação em `commercial_price_rules`/`commercial_condition_item_prices` antes de campos novos. Sem novo preço numérico ou plano inventado; NO-GO comercial enquanto resolução dimensional não provada.

## 9. Pedidos e simulações: contratos e snapshots

`partner_order_items` (11922–11947): `product_id`, `microrganismo_id`, `quantidade`, `unidade_medida`, `volume_ml`, `preco_unitario`, `subtotal`, `unit_type_snapshot`, `volume_ml_snapshot`, `produto_codigo_snapshot`, `produto_nome_snapshot`, `base_price_snapshot`, `condition_price_snapshot`, `price_source_snapshot`, `price_rule_id_snapshot`, `pricing_mode_snapshot`, `preco_unitario_final_snapshot`. `partner_simulation_items` (12876 em diante) também usa quantidade/unidade/volume e valores; confirmar snapshot final no servidor antes de adicionar campo.

`src/hooks/usePartnerSimulations.ts`: `b2b_read_simulations(p_partner_id)`/`(p_simulation_id,p_items)`; `b2b_save_technical_simulation({p_simulation_id,p_partner_id,p_header,p_items})` (138–143). Não converter simulação técnica em pedido, nem devolver preços ao papel técnico. `src/hooks/usePartnerOrderActions.ts` chama `approve_partner_order`, `request_partner_order_items`, `reject_partner_order`, `set_partner_order_delivery_date`, `update_partner_order_notes`; mudanças de família não mudam alçada/status.

Proposta: novos snapshots de **família, unidade base, quantidade/apresentação e finalidade** apenas em itens novos após aceite; históricos intactos. `volume_ml` NULL em sólidos/sementes, nunca peso codificado como volume. Pedidos de nova dimensão devem falhar explicitamente no fluxo existente até adaptação completa; não gravar título/OS fiscal por catálogo novo. Contratos de headers/items técnicos price-free e owner/partner/client server-side permanecem obrigatórios.

## 10. Estoque, produção, OS e entrega

`estoque_produto` (6694–6718): `lote_id`, `produto_id`, `microrganismo_id`, `envase_id`, `quantidade`, `quantidade_reservada`, `volume_total`, `validade`, reservas OS/partner/order. `lote_id` obrigatório: venda de semente/químico comprado não deve fabricar lote de produção biológica só para satisfazer vínculo.

`src/lib/estoque/motorEstoque.ts:94–101` chama **`rpc_estoque_operar_v1(p_acao,p_item_id,p_quantidade,p_idempotency_key,p_payload)`**. Contrato batch documentado em `scripts/rbac-audit/stock-endpoints-safe-rollback.sql`: **`rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb)`**, núcleo idempotente/tenant. Não confundir com RPC inexistente `rpc_estoque_movimentar_v1`.

Inventariar `estoque_movimentacoes`, `envase`, `lotes`, `ordens_servico`, `ordens_servico_onfarm`, `entregas` e cálculos `volume_total_ml`/`area_hectares` antes de entrada/reserva/saída. Caminhos atuais assumem produção/envase/volume: **NO-GO operacional para sólidos/sementes**. Propor unidade dimensional no ledger/estoque e snapshot por movimento, condicionando o motor existente; decidir recebimento de item comprado e rastreabilidade sem nova tabela paralela de produto. Não alterar tenant por expedido_por, inferir ownership ou abrir helpers/23 ACL históricos. Histórico append-only, replay/conflito/locks ordenados e compensação preservados.

## 11. Fiscal e regulatório: sem classificação automática

`product_fiscal_profiles` (13746–13776): `product_id`, `ncm`, `cest`, `cfop_in_state`, `cfop_interstate`, `origin_code`, `icms_cst`, `icms_csosn`, `ipi_cst`, `pis_cst`, `cofins_cst`, `commercial_unit`, `taxable_unit`, `gtin`, `taxable_gtin`, `profile_status`, `ibs_cbs_configuration`, validação contábil. Família não determina NCM/tributação, tampouco registro obrigatório universal.

`src/hooks/useFiscalProdutosLite.ts` lê produto/perfil; `src/hooks/useFiscalCatalog.ts` usa **`rpc_fiscal_catalog_search_v1({p_catalog_type,p_query,p_parent_code,p_preferred_codes,p_limit})`** e **`rpc_fiscal_catalog_resolve_v1({p_catalog_type,p_codes})`**. Preservar fonte oficial/versionamento. `src/components/fiscal/documentos/RascunhoWizard.tsx`/`src/lib/fiscal/rascunhoWizardValidation.ts` são dependências do wizard. `rpc_fiscal_tax_preview_v1(p_invoice_id,p_items)` e `rpc_fiscal_calculate_invoice_v1(p_invoice_id,p_idempotency_key)` não devem aceitar unidade incompatível pela presença de família.

Migration `20260721000000_fiscal_fase2_fundacao.sql` mantém `fiscal_invoice_items.fiscal_profile_snapshot`/`tax_snapshot`; documentos históricos imutáveis. `microorganism_regulatory_dossiers`/`microorganism_fiscal_profiles` são específicos de microrganismos; **não reutilizar como dossiê químico/semente**. Fontes como rótulo/bula/registro e exigências oficiais devem ser conferidas por família, operação e responsável técnico, sem afirmar revisão jurídica/regulatória executada. Emissão/transmissão/cobrança reais permanecem NO-GO.

## 12. Segurança global, tenants e entitlements

Escrita compartilhada **somente Platform Superadmin comprovado no servidor** via `is_platform_superadmin(auth.uid())`, não flags UI/localStorage e não administrador tenant. Guards locais `src/components/guards/PlataformaGuard.tsx`, `src/hooks/useEntitlements.ts`, `src/lib/saas/featureRouteMap.ts` são camadas de navegação; não substituem RLS/ACL. Preservar `catalogo_precos`/demais chaves existentes e gates fiscais; nova aba não concede feature ou papel.

`ProdutosTab.saveProdutoComCompensacao` ainda usa múltiplas writes diretas de produtos/formulacoes; não confundir sua compensação com transação atômica ou permissão global demonstrada. Migrations locais com policies antigas permissivas não provam vazamento atual. Antes da fase de escrita, enumerar policies/GRANTs/triggers atuais e writers DEFINER, inclusive composição, volumes, perfis/fontes e wipe. Backend que rejeite role errada é obrigatório mesmo com botão oculto.

Matriz futura: Superadmin write global apenas endpoint existente autorizado; Admin/Gestor/Financeiro/Consultor/produção/cliente/B2B técnico/comercial apenas leitura compatível com plano e vínculos; sem permissão inferida. Partner P nunca vira tenant A, catálogo global não abre estoque/pedidos de terceiros. Cache/prévia por identidade/tenant/papel/escopo: `useCatalogoUnificado` tem key `[catalogo-unificado,scope]`, `usePartnerCatalog` `[partner-catalog-secure,partnerId]`; verificar limpeza central ao logout e respostas tardias. Sem padrão global alterado nesta auditoria.

## 13. Plano das mudanças de schema — somente candidatos

Nenhum SQL executável ou migration criado nesta rodada. Candidatos para fases autorizadas:

| Candidato lógico futuro | Mudança e gate |
|---|---|
| `catalog_product_classification_additive` | Colunas classificatórias nullable da seção4 + índice parcial de família/classe/ativo se plano de consulta justificar. Zero UPDATE de históricos/default biológico. Trigger de validação de família/classe/finalidade e escrita global. |
| `catalog_product_dimensions_additive` | Colunas dimensionais nullable da seção7; sem default L/ml. Validação de finitude/dimensão antes de cálculo. Revisão de `tipo` obrigatório separada, não aplicada por tabela de mapeamento falsa. |
| `catalog_commercial_dimension_compatibility` | Extensão do resolver autorizado e snapshots de itens novos, sem reabrir ACL. Triggers líquidos só para contratos líquidos comprovados, sem repricing histórico. |
| `catalog_stock_dimension_compatibility` | Unidade/snapshot de estoque/movimento novos e adaptação batch/motor após decidir linhagem de compra/lote. Sem backfill ou reinterpretar volume_total. |

Se nova relação auxiliar realmente indispensável, não criar catálogo concorrente: CREATE→GRANT mínimo→RLS→policies com predicado, mesma migration; sem anon por padrão. DEFINER com search_path fixo, auth/role e EXECUTE revogado de PUBLIC/anon, mantendo menor ACL atual. Novos contratos gerados **somente do ref canônico comprovado**, sem tocar tipos gerenciados manualmente. Nome lógico não é ID de migration aplicado. Revisão real de dependências/compatibilidade deve preceder cada alteração.

## 14. Fases pequenas e gates de avanço

| Fase | Escopo focal | Critério para avançar |
|---|---|---|
| P0 — esta rodada | Inventário e plano | 17 seções, contratos e lacunas documentados; revisão do proprietário. Não implementação. |
| P1 | Paridade read-only e matriz server-side | Ref exato, definições/grants/RLS atuais, identidade/tenant/role e consumidores enumerados; nenhum writer global tenant permitido. |
| P2 | Classificação aditiva e leitura | Colunas nullable; antigos intactos; teste de classificação inválida negado; abas no fluxo existente só após autorização. Nenhum pedido/preço novo. |
| P3 | Cadastro técnico global focal | Superadmin real confirmado; atomicidade/versionamento/fonte e `tipo` não representável resolvidos. Tenant admins negados; sem agricultura fictícia. |
| P4 | Dimensões e apresentação | Sólido/semente não usa L/100mL, dimensão desconhecida bloqueada; legado líquido invariável. |
| P5 | Comercial/simulação/pedido | Resolver canônico validado, price-free técnico, snapshots novos, negativos e replay; gates preexistentes mantidos. |
| P6 | Estoque/recebimento/OS/entrega | Linhagem determinística, unidade e replay/concorrência tenant comprovados; nenhuma OS biológica artificial. |
| P7 | Fiscal/regulatório | Fonte e validação por operação; unidades comercial/tributável coerentes, mock primeiro. Sem emissão real autorizada por este plano. |
| P8 | Browser desktop/mobile e aceite focal | Matriz papéis/planos/tenant, loading/erro/vazio e acessibilidade; revisão autoriza rollout parcial, nunca global presumido. |

Cada fase exige **pedido específico**; NO-GO da operação não impede auditoria posterior read-only. Não executar P1 automaticamente após entregar P0. Distinguir implantação de schema, frontend e habilitação de fluxo.

## 15. Testes e provas obrigatórias por camada

Reaproveitar suites existentes, não snapshots de texto como prova de autorização:
- `src/test/protocolos/produtos-tab-cat05.test.ts`, `produtos-tab-cat06-cat07.test.ts`, `src/test/integration/produtoComposicao.flow.test.ts`: save/compensação/loader, identidade e resultados antigos; incluir novo campo no snapshot sem reescrever o legado.
- `src/test/catalogo/formatUnidades.test.ts`, `formatUnidades.guard.test.ts`, `h3c-fonte-canonica-preco.test.ts`, `h3b-preco-canonico-fichas.test.ts`, `catalogo-fase27b-useCatalogoUnificado.test.ts`, `catalogo-item-drawer.test.tsx`: projeção real, família independente de tipo, produto com última coluna/campo, técnico sem preço, NULL/unidade não compatível sem conversão.
- `src/test/config/connection-binding.static.test.ts`, `binding-gate.integration.test.ts`, `adminCatalogEdgeSecurity.test.ts` e `src/test/saas/catalog-global-consolidation.test.ts`: binding, role server-side, não reabrir grants; migração local testada não prova ACL viva.
- `src/test/estoque/stock-motor-hardening.test.ts`, `stock-batch-hardening.test.ts`, `stock-context-hardening.test.ts`, `stock-numeric-hardening.test.ts`, `stock-caller-compatibility.test.ts`: finitude/negação/replay/conflito/tenant/contexto; fixtures só após autorização específica e cleanup preciso.
- SQL ROLLBACK futuro: roles reais com claims forjadas e fontes conhecidas, update categoria global negado para tenants, produto/composição/volumes idem; compare histórico antes/depois. **Não equivalente a JWT/HTTP**.
- Browser/JWT futuro: Superadmin autorizado e técnicos/comercial/cliente existentes, troca A→B→A, tenant, perda readiness e remount; desktop/mobile, nenhum dado sensível em RPC/network/exports. Não criar contas nem dados agrícolas fictícios neste plano.
- Doses/recomendações somente fonte validada; testes dimensionais podem usar quantidades abstratas sem prescrição agrícola. Typecheck app/node, lint focal, scanners e build disponíveis, com resultado por executor; no ambiente Lovable build/typecheck automáticos não autorizam comando manual. Nenhum teste novo executado na rodada documental.

## 16. Rollback, compatibilidade e rollout

P2/P4: desligar apenas leitura/abas novas por configuração existente aprovada, reverter callers e manter colunas nullable com dados; **não DROP de colunas com dado novo**, não mudar tipo/código/histórico. Se validação impedir criação legítima, manter write fechado até forward-fix; nunca flexibilizar permissão global para resolver UX.

P5/P6: gate por família e dimensão no endpoint canônico, revogar apenas ACL nova explicitamente autorizada se houver; préserver resolver/estoque legado e receipts/idempotency keys. Rollback não apaga ledger/snapshots nem converte kg/semente para volume. P7: não alterar snapshot fiscal publicado e nenhuma emissão real para teste. Migrations versionadas idempotentes e reversíveis quando viável; testar rollback substitutivo com contenção, nunca restaurar acesso tenant global ou vazamento.

Rollout futuro pode liberar **somente leitura classificatória** antes de cadastro/comercial/estoque/fiscal, desde que negative guards comprovados. Deploy/publicação exigem autorização explícita separada; este documento não a concede.

## 17. Gargalos, UNVERIFIED e aceite final para revisão

| Gargalo | Estado/evidência | Condição de desbloqueio |
|---|---|---|
| `tipo` obrigatório sem herbicida/semente | Estrutural confirmado no tipo local | Revisar NOT NULL/consumidores server-side; permitir ausência sem semântica falsa somente após aprovação. |
| Dose100mL/preçoL/conversões automáticas | Estrutural confirmado pricing/volumes/triggers históricos | Dimensões explícitas e resolver único, sem default universal. |
| Composição `volume_ml` + microrganismo | Estrutural confirmado | Cadastro novo não utiliza composição biológica artificial; contrato específico revisado. |
| Estoque depende lote/envase/volume | Estrutural confirmado | Recebimento/rastreabilidade e unidade testados sem inventar lote. |
| Permissões/ACL/entitlements implantados | **UNVERIFIED vivo** | Inventário canônico autorizado e negativos JWT/HTTP, não policy antiga selecionada. |
| Portais técnicos mapeiam campos financeiros | Risco estrutural, vazamento vivo **UNVERIFIED** | Payload server-side price-free e teste negativo de todos os caminhos/exportações. |
| Classificação oficial/registros/NCM/compatibilidade | **UNVERIFIED** | Fontes oficiais + revisão técnica/contábil por produto/operação, sem inferência por família. |
| Gestão plataforma das categorias financeiras | **UNVERIFIED/NO-GO**; separado de produtos | Não usar fechamento FinanceiroAR como aceite Superadmin; não desenvolver esse fluxo nesta expansão. |
| Contrato canônico vs gerenciado desatualizados | **UNVERIFIED paridade DB** | Confirmar atual no ref exato e atualizar contrato por fluxo autorizado, sem troca de cliente. |
| Volume>1000, cache/HTTP/mobile/concorrência | **UNVERIFIED** | Paginação de queries e testes por identidade/dimensão/tenant antes de rollout. |

**Aceite deste documento:** fechamento externo financeiro registrado; entradas, campos e RPCs exatos inventariados; proposta própria nullable diferenciada do enum aplicação; fases pequenas, migrations candidatas, testes, rollback e critérios descritos. **Não aceite de operação agrícola, catálogo global completo ou produção.** Biológicos/histórico/tenant e gates atuais preservados. Nenhum dado agrícola, preço, dose ou recomendação foi criado. Implementação aguarda revisão deste plano e autorização focal posterior.

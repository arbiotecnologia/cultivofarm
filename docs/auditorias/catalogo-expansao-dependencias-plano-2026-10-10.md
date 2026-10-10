# Expansão do catálogo agrícola — auditoria de dependências e plano técnico

Data de referência: 2026-10-10 02:42 UTC. Estado: **PLANEJAMENTO PARA REVISÃO; IMPLEMENTAÇÃO NÃO INICIADA**.

## 1. Mandato, escopo e gates

Ampliar o catálogo existente para **Químicos (Herbicidas/Fungicidas/Inseticidas), Fertilizantes/Adubos, Sementes/Tratamento de sementes**, mantendo biológicos. Nesta rodada somente investigação local, scanners read-only e documentação: nenhum código funcional, dependência/lock, AGENTS, banco/migration/grant/RLS, Edge, frontend publicado ou dado alterado. Nenhum produto, dose ou recomendação agrícola fictícia criado.

`produtos.tipo` tem semântica de aplicação/função; família comercial não deve substituí-la. Manter IDs, códigos, vínculos e snapshots históricos. Reutilizar `produtos`, fichas e superfícies existentes, não construir catálogo/checkout/emissor paralelo. Escrita global exclusivamente Platform Superadmin validado no servidor; leitura conforme papéis, vínculos, tenant e entitlements existentes. Menu/aba não autoriza operação.

Financeiro global, exportação, B2B/OS/fiscal/Faturamento continuam NO-GO conforme gates anteriores. O plano NÃO autoriza liberar ACL nem operações reais. Cada fase futura necessita prompt específico após revisão.

## 2. Proveniência, evidências e limitações

| Camada | Evidência desta rodada | Limite |
|---|---|---|
| Código/schema gerado | Leitura de React/hooks/helpers/types e SQL versionado local | Estrutural, não banco vivo |
| Segurança | `security.get_scan_results` consultado; `security.dependency_scan` executado read-only | Resumo de scanner, não revisão própria de segurança |
| Financeiro4717ff86 | Codex externo: diff5arquivos/SQL exato;4/4tests,typecheckapp/node,lint2,scanner3862zero,build30.86sPASS; publicação/UI real | Não reexecução Lovable |
| UI externa FinanceiroAR | Após reload `/financeiro/categorias`:2categorias,aviso consulta,sem mutações;histórico9eventos | PASS focal financeiro; não catálogo agrícola |
| Catálogo agrícola runtime | Sem login/browser/HTTP, RPC/Storage, SQL ou testes de negócio executados nesta rodada | **UNVERIFIED** |

O fechamento financeiro está em `docs/auditorias/homologacao-h6-financeiro.md` e roadmap; não libera gestão plataforma. Documentos antigos `catalogo-fase27e-certificacao-final.md` e `fase-s2-catalogo-entitlements-2026-10-01.md` são checkpoints históricos. O primeiro menciona binding antigo/proibido e aceite anterior: **não usar como destino nem como homologação atual**. Único destino admissível para futura prova remota, após autorização, é `swzpzcwiasxmjutrmvkm`; nesta rodada nenhuma ferramenta de banco foi acionada.

## 3. Superfícies existentes e proposta de abas

| Arquivo existente | Papel observado / ponto de extensão |
|---|---|
| `src/pages/Protocolos.tsx:485–525` | MAIN_TABS produtos/microrganismos/catalogo-tecnico/culturas/problemas; `useTabParam`; composição principal |
| `src/components/protocolos/ProdutosTab.tsx` | Cadastro/listagem/formulações, filtros e preços; evoluir dentro da aba Produtos |
| `src/components/protocolos/CatalogoTecnicoTab.tsx` | Catálogo unificado e detalhes técnicos/comerciais internos |
| `src/components/catalogo/CatalogoCardsGrid.tsx` | Busca/filtros/ordenação, ação/ficha e limite de renderização |
| `src/components/catalogo/CatalogoItemDrawer.tsx` | Detalhe interno; não reutilizar indiscriminadamente em portais |
| `src/components/catalogo/FichaProdutorDrawer.tsx` | Conteúdo permitido ao produtor |
| `src/components/protocolos/ProductTechnicalProfileDialog.tsx` | Ficha, culturas/alvos/fontes/validação; adaptar campos condicionais |
| `src/pages/app/MobileCatalogoTecnico.tsx` | Catálogo mobile; não promover visão interna a portal |
| `src/pages/portal-parceiro/NovoPedido.tsx`, `FichasTecnicas.tsx` | Catálogo parceiro por fontes específicas, não pelo leitor interno |
| `src/config/navigation.ts:121–131`, `src/App.tsx:537–538,601` | `/base-tecnica`, alias `/protocolos`, alias comercial; preservar |

Proposta para revisão: navegação por famílias **dentro da experiência Produtos/Catálogo já existente**, preservando abas de microrganismos, culturas e problemas. Famílias: Biológicos, Químicos, Fertilizantes/Adubos, Sementes/Tratamento de sementes; Químicos tem filtros Herbicidas/Fungicidas/Inseticidas. Não acrescentar tudo ao grid de cinco abas principais: largura desktop/mobile é restrição comprovada em `Protocolos.tsx:513`. Usar filtro/abas internas roláveis com dimensão estável e estado local inicialmente; não alterar rota ou aliases sem autorização específica.

Legados sem classificação permanecem visíveis no catálogo atual/“não classificados”, sem serem automaticamente declarados biológicos. Subclasses não equivalem a licença de uso ou validação técnica.

## 4. Modelo atual: nomes exatos e semânticas que não podem mudar

Fonte: `src/integrations/supabase/types.ts:16393+`.

**`produtos`**: `id`, `nome`, `codigo`, `tipo`, `descricao`, `dose_ml_ha`, `modo_acao`, `modo_aplicacao`, `funcao_completa`, `valor_ha_brl`, `valor_dose_brl`, `valor_litro_brl`, `versao_catalogo`, `ativo`, `b2b_enabled`, `e_insumo`, `estoque_minimo`, `created_at`, `updated_at`.

**`tipo_produto`** (`types.ts:25579+`): `inseticida | fungicida | solo | inoculante | solubilizador`. Não contém família química/fertilizante/semente; `fungicida` e `inseticida` não distinguem biológico/químico. Nem `solo` nem `e_insumo` provam família. `CatalogoUnificadoRow.tipo` em `useCatalogoUnificado.ts:7` é OUTRA união (`produto | microrganismo`); não misturar os dois tipos.

`produtos.tipo` aparece obrigatório em Row/Insert gerado. **Gargalo de cadastro novo:** sementes sem função atual não podem receber valor falso `solo` apenas para satisfazer enum. Antes de habilitar cadastro, comprovar no banco a nulabilidade e triggers atuais. Proposta mínima, sob aprovação: tornar a aplicação opcional para registros novos de famílias compatíveis, preservando enum e todos valores antigos; ajustar somente validadores/consumidores que exigem aplicação. Isso é alteração de restrição, não automática nem autorizada agora. Alternativa de “adicionar semente ao enum aplicação” está rejeitada; se a nulabilidade não for aprovada, novas famílias permanecem consulta/rascunho indisponível, sem coerção silenciosa.

## 5. Classificação própria compatível: desenho aditivo proposto

**Nomes PROPOSTOS, ainda inexistentes no schema inspecionado:** adicionar a `produtos` campos nullable `catalogo_familia`, `catalogo_subclasse`, `forma_fisica`, `unidade_base`, `classificacao_validada_em`, `classificacao_validada_por`. Não adicionar `organization_id` ao catálogo global para contornar a fronteira de plataforma. Manter ID e fluxo existentes.

Domínios candidatos para revisão: família `biologico | quimico | fertilizante_adubo | semente`; subclasses químicas `herbicida | fungicida | inseticida`; tratamento de sementes como **finalidade** independente da família (pode ser químico ou biológico), não reclassificar todo produto de tratamento como semente. Proposta de campo independente `uso_tratamento_sementes` nullable, sem inferência por `modo_aplicacao` legado. Labels agrupam Sementes/Tratamento de sementes como pedido, mas filtro combina família/finalidade explícitas.

Usar inicialmente colunas tipadas/domínio textual validado no servidor, não JSON livre para quantidade/unidade/classe. Avaliar cardinalidade antes de escolher subclasse única: produto multifunção pode precisar coleção validada; não forçar exclusividade sem dados reais revisados. Não criar tabela `produtos_quimicos`, `produtos_sementes`, enum substituto ou duplicação de cadastro.

Migração aditiva não deve preencher registros existentes. Revisão humana/plataforma de cada classificação com fonte e motivo; nenhuma rotina `UPDATE ... WHERE tipo=...` global. Índice de classificação/ativo apenas após estimar volume e plano de consulta. Dados NULL não significam biológico nem aprovado.

## 6. Unidades: três dimensões distintas e conversões proibidas

Separar **quantidade física base**, **unidade de comercialização/apresentação**, **base da recomendação técnica**. `KG`, pacote, contagem de sementes e dose por massa de sementes não são litros ou hectares intercambiáveis. Não presumir peso de saca, sementes por pacote, densidade, concentração ou relação mL/kg sem dado validado específico da apresentação.

Premissas reais que exigem gate por unidade:
- `src/lib/catalogo/pricing.ts:3–4,12–32,48–82`: dose100mL,10doses/L,conversão volume/1000, custo dose/ha e fallback micro100mL/ha.
- `src/lib/catalogo/unidades.ts:11–24,79–98`: somente hectare/litro/dose_100ml/volume_comercial/sob_consulta; precedência automática de preço.
- `src/lib/catalogo/formatUnidades.ts:27,79–87,100–105`: referência líquida, dose mL/ha, volume L.
- `src/components/protocolos/ProdutosTab.tsx:323`: dose ausente pode ser substituída pelo total de composição volumétrica; não transportar para sólidos/sementes.
- `src/lib/aplicacoes/unidades.ts`: unidade de aplicação é domínio distinto do preço; preservar seus testes.

Proposta futura: adicionar ramos dimensionais a esses helpers existentes, sem motor paralelo. `unidade_base` desconhecida ⇒ sem conversão nem preço/dose derivado. Manter ramo líquido legado explicitamente identificado. Conversão kg↔g pode ser dimensional; saca/pacote↔massa/contagem exige fator validado por apresentação. Nenhuma dose padrão para famílias novas. Recomendações sem base provada aparecem ausentes, não zero nem “Sob consulta” como substituto de permissão.

## 7. Fichas, composição, taxonomias e fontes

**Existente** `product_technical_profiles` (`types.ts:15593+`): `produto_id`, `resumo_curto`, `beneficio_combinado`, `explicacao_tecnica`, `explicacao_produtor`, `explicacao_b2b`, `indicacoes_uso`, `janela_aplicacao`, `cuidados_aplicacao`, `compatibilidade`, `observacoes_regulatorias`, `status_validacao`, `validado_em`, `validado_por`, `created_by`, `updated_by` e timestamps.

`useProductProfile.ts:23–42` define `product_target_recommendations` com `alvo_nome`, `alvo_tipo`, `descricao`, `prioridade`, `ativo` e `product_crop_recommendations` com `cultura_id`, `cultura_nome`, `fase_recomendada`, `objetivo_uso`, `dose_recomendada` **texto**, `observacao`, `ativo`. `Protocolos.tsx:174–183` já tem `plantas_daninhas`, não exige inventar alvo para herbicidas. Dose textual não deve ser parseada automaticamente para cálculo.

`formulacoes` (`types.ts:10155+`): `produto_id`, `microrganismo_id`, `component_insumo_id`, `volume_ml`, `proporcao`, `e_volume_fixo`, `concentracao`, `unidade`. Hook `fetchProductProfileBundle` embute microrganismos e insumo. Não representar ingrediente químico/NPK/genética como microorganismo falso, nem volume_ml=0 para massa. Primeiro liberar fichas de produto pronto sem composição operacional obrigatória; evolução dimensional de formulação é fase própria. Divergência schema gerado (microrganismo_id obrigatório) versus hook nullable precisa paridade viva autorizada, não cast novo.

Campos especializados futuros apenas com fonte revisada: composição/ingrediente ativo e concentração com unidade para químicos; garantias/composição com unidade para fertilizantes; cultivar/identidade/qualidade e apresentação para sementes. Nomes candidatos de metadados em ficha: `composicao_declarada`, `registro_regulatorio`, `documentacao_referencia`; nenhum campo/agronomia preenchido nesta rodada. `catalog_technical_sources` permanece fonte documentada, não verdade automática da IA. `src/lib/catalogo/seedSources.ts` não deve semear recomendações dessas famílias.

## 8. Persistência, aprovação, códigos e histórico técnico

`saveProdutoComCompensacao` em `ProdutosTab.tsx:104–178` faz **várias requisições** e compensação best-effort; **não é atomicidade transacional**. Snapshot cobre `PRODUTO_SNAPSHOT_COLUMNS` e `FORMULACAO_SNAPSHOT_COLUMNS`; qualquer extensão precisa incluir campos novos para reversão não perdê-los. Não confiar que lock local evita dois operadores concorrentes. Cadastro sem composição não deve acionar exclusão/recriação de composição histórica sem motivo.

`useUpsertProductProfile` (`useProductProfile.ts:109+`) faz upsert/select/maybeSingle; `ProductTechnicalProfileDialog.tsx:145` chama `update_product_b2b_description`. Há validação cliente de campos para aprovação e leitor de audit com `.limit(50)` sem erro explícito (`:112–124`); nova classificação não pode herdar falso sucesso ou auditoria incompleta como certificação.

**Cuidado com SQL antigo:** `validate_product_profile_approval` é criada em `20260618235836_97a9e179-b1d8-4280-ab59-4ad7b4a48904.sql`, mas `trg_validate_product_profile_approval` é removida em `20260619013133_ed9c4710-bcd7-4fdf-8ff5-12c6fe5ac85b.sql`, que manda manter `enforce_*`. Não tratar trigger antiga como ativa. Função `approve_product_profile_with_audit` existe no schema gerado/catálogo informado; contrato vivo/uso exclusivo no fluxo ainda UNVERIFIED. Inventário futuro deve resolver definição final/ACL antes de alterar aprovação.

`src/lib/protocolos/autoCodigo.ts:1–21`: prefixos SOLO/INS/FUNG/INO/SOLB são preview por aplicação; código definitivo via `set_codigo_produto`. Preservar códigos existentes e sequence. Novas famílias precisam decisão de código neutro/apresentação independente de aplicação, validada no servidor; não adicionar quimico/semente em PREFIXOS_PRODUTO fingindo que tipo mudou. Sem regenerar códigos/históricos.

## 9. Fontes de consulta, paginação, cache e tipagem

`useCatalogoUnificado.ts:119–127` agrega **8 consultas**: produtos, microrganismos, fichas produto/micro, formulacoes, catalog_technical_sources, microorganism_targets, product_target_recommendations. Projeções explícitas atuais não contêm classificação nova; estender só campos necessários e counts autorizados. `consultarCatalogo` (`src/lib/catalogoQueries.ts`) usa allSettled e recusa resultado parcial; manter erro de fonte distinto de lista vazia.

**Gargalo comprovado:** leitor unificado sem paginação de servidor; `CatalogoCardsGrid` usa CATALOGO_PAGE_SIZE60 e “Mostrar mais” sobre array local (checkpoint27E), o que **não recupera linhas cortadas pelo limite PostgREST padrão1000**. `carregarCatalogoProdutos` ainda select* e quatro queries; `useProductProfile` select* em entidades auxiliares. Novas famílias aumentam volume antes de filtros locais. `useFiscalProdutosLite.ts:47` limita20 intencionalmente na busca; não confundir sugestão limitada com catálogo integral.

Fase de leitura deve introduzir paginação estável/busca de servidor no leitor existente, cursors/order com ID desempate e contagem correta; não múltiplos fetchers divergentes. Counts não devem depender de carregar todas fontes. Contratos de cache: CATALOGO_UNIFICADO_STALE_TIME120000/gc600000, `product-profile`, `catalogo-tecnico`, `partner-catalog-secure`, chave técnica existente. Incluir filtros/página/ator-tenant onde necessário e descarte de respostas tardias com mecanismo de escopo existente, sem defaults globais. `raw:any`, casts do cliente/RPC e nulabilidade gerada divergente são dívida de tipagem **nos arquivos tocados**, não justificam refactor global nesta fase.

## 10. Fronteiras de acesso e resultado do scanner de segurança

Inventário estrutural, **não revisão própria de segurança**: AGENTS exige Platform Superadmin; helper `is_platform_superadmin(auth.uid())`; política `d51_5_catalog_global_mutation` aparece em `20261005200923_a9898565-995b-4066-a99b-e138442af842.sql:118–120` como RESTRICTIVE ALL, e é referenciada em alterações posteriores. Não inferir ACL viva de uma versão isolada. Famílias novas devem atravessar o mesmo guard servidor; não ampliar tenant-admin a catálogo global nem usar service_role como caller.

`src/lib/saas/featureRouteMap.ts:17,43` mapeia `/base-tecnica` e `/portal-parceiro/catalogo` a `catalogo_precos`. Não inventar nova feature/plano/preço ou tornar catálogo técnico sinônimo de acesso financeiro. Inventariar os irmãos mobile/portal e guard por URL; extensão visual mantém interseção entitlement×papel×vínculo×estado. DRAFT nunca se torna aprovado porque família foi preenchida.

**Resumo de `security.get_scan_results` desta rodada:** app_mcp recente (02:39:32UTC) sem findings; lov_pgscan recente tem findings informativos, incluindo escrita autenticada em `catalog_technical_audit_logs` e leituras compartilhadas de `catalogo_alvos`, `catalogo_problemas`, `culturas`, além de proteção de senha vazada desativada e outras tabelas globais/branding. Supply_chain anterior sem findings mas `up_to_date=false`; connector scan antigo incompleto. Resultado recebido **não identifica deep scan agent_security_v2 recente nem comprova o ref do scanner**; não substituir prova canônica ACL/RLS nem chamar app seguro/limpo. Solicitar scan pela aba **Security** antes de homologação; não executar migrações corretivas com base em finding isolado ou leitura global intencional.

## 11. Portais, mobile e projeções sem preço indevido

`usePartnerCatalog.ts:66` → **`get_partner_catalog_secure(p_partner_id)`**; `usePartnerCatalogTecnico.ts:22` → **`get_partner_catalog_tecnico_secure()`**. `NovoPedido` adapta resultado desses hooks, não importar `useCatalogoUnificado` como fonte de dados comercial. Técnico sem preço permanece com valores ausentes **no payload**, não apenas CSS oculto; rascunhos/textos internos/audit nunca via `CatalogoItemDrawer` ao produtor/parceiro.

A interface técnica compartilhada `CatalogItem` ainda possui campos `valor_dose_brl`, `preco_tabela_dose`, `unidade_preco_principal`; um tipo de TS não prova retorno autorizado. Futuras projeções devem acrescentar família/unidades autorizadas, não preços/custo interno por conveniência. Preservar filtros ativo/b2b_enabled e ficha aprovada em superfícies públicas ao vínculo. Mobile consultor e produtor real precisam prova separada; nenhum browser agrícola nesta rodada.

Critérios futuros: contexto técnico recebe zero campos financeiros na resposta; troca ator/tenant durante query/abertura de ficha não mantém dados anteriores; famílias não criam permissão por classificação. Testar desktop/mobile, loading/erro/vazio e filtro A→B→A com requests adiadas; reaproveitar hook de scope existente após verificar contrato de cada portal.

## 12. Motor comercial, simulador, carrinho e pedidos

Contratos exatos existentes: **`fn_resolve_commercial_price(p_buyer_scope,p_partner_id,p_customer_id,p_plan_id,p_product_id,p_microrganismo_id,p_unit_type,p_volume_ml,p_ref_date)`**, **`fn_resolve_b2b_cart(p_partner_id,p_payment_plan_id,p_items,p_ref_date)`**, **`create_partner_order_secure`** e `useCreatePartnerOrder.ts:77+` com expected_cart_hash/idempotency_key. Definição histórica em `20260729023718_2f545695-8315-4416-b6a0-1f167380021b.sql:20+` aceita hectare/litro/dose/unidade; unidade exige volume_ml positivo. Definições posteriores/cores privados/ACL precisam paridade autorizada; não regrant a partir dessa versão.

`useCreatePartnerOrder.ts:6,52–56,73–74`: UnidadePedido hectare/dose_100ml/litro/volume_comercial, mapeia dose/unidade e manda volume_ml. `AddToCartDialog.tsx` assume vasilhame/volume e relação ha↔L. `src/pages/comercial/SimuladorComercial.tsx`, `useCommercialConditions.ts`, `useCommercialPriceRules.ts` são pontos de validação de elegibilidade e unidades, não criar calculadora paralela.

`partner_order_items` (`types.ts:13318+`): `product_id`, `quantidade`, `unidade_medida`, `volume_ml`, `unit_type_snapshot`, `volume_ml_snapshot`, `produto_nome_snapshot`, `produto_codigo_snapshot`, `base_price_snapshot`, `condition_price_snapshot`, `price_source_snapshot`, `price_rule_id_snapshot`, `pricing_mode_snapshot`, `preco_unitario_final_snapshot`. Preço/condição/vigência/minimum/eligibilidade resolvidos exclusivamente no motor canônico. Proposta futura de snapshots aditivos `catalogo_familia_snapshot`, `unidade_base_snapshot`, `apresentacao_snapshot`, sem modificar linhas antigas.

**Gate:** famílias novas não entram em simulação/carrinho/pedido enquanto unidade e apresentação não forem provadas servidor-side. “unidade” não pode mascarar kg/semente com volume fake. Cadastros/fichas podem avançar separadamente, mantendo B2B OFF. Alterar allowlist isolada sem preço, hashes/replay/snapshots/tenant é insuficiente. Consulta quote-only não habilita cobrança/faturamento.

## 13. Produção, lotes, envase, estoque e embalagens

`ordens_servico_onfarm` (`types.ts:11542+`) usa `dose_ml_ha`, `area_hectares`, `volume_total_ml`, `produto_id`, `microrganismo_id`; `formulacoes` e produção associada são volumétricas/biológicas. **Cadastro de semente ou químico de terceiro não autoriza multiplicação biológica, geração de OS de plantio ou envase automático**. Definir capacidade operacional antes de incluir novo item em seletores de produção.

`estoque_produto` (`types.ts:6700+`) contém `quantidade`, `quantidade_reservada`, `volume_total`, `lote_id`, `produto_id`, referências reserva OS/parceiro/pedido e status. Há quantidade genérica, mas ausência de dimensão no contrato inspecionado impede concluir que kg/contagem já é suportado. `catalogo_volumes` (`types.ts:2312+`): `volume_ml` obrigatório, `doses_por_volume`, `preco_litro_brl`, `valor_dose_100ml_brl`, `preco_brl`, `rotulo`, IDs e ativo. Não armazenar pacote de sementes como bombona com volume inventado.

Motor/reserva existentes **`rpc_estoque_motor`** (nome/assinatura final a confirmar em inventário vivo) e **`rpc_estoque_reservar_v1`** (caller `useEsteiraLaboratorio.ts:541`) mantêm contenções privadas/tenant/idem e ACL individual; não liberar helpers antigos. Proposta: metadados dimensionais/apresentação aditivos no estoque existente após contrato revisado; reserva/baixa/reversão devem conservar unidade e fator snapshot. Ramo líquido e órfãos históricos intactos; sem backfill por expedido_por.

Aceite de estoque só após SQL autorizado rollback, Auth HTTP, concorrência, replay/conflito e reconciliação por unidade; catálogo consulta não é estoque operacional PASS. Embalagens/regras validade/lotes exigem fontes reais revisadas, não defaults agrícolas novos.

## 14. Fiscal, financeiro e regulação

Reutilizar **`product_fiscal_profiles`** (`types.ts:15438+`): `product_id`, `commercial_unit`, `taxable_unit`, `ncm`, `cest`, `origin_code`, `cfop_in_state`, `cfop_interstate`, `icms_cst`, `icms_csosn`, `ipi_cst`, `pis_cst`, `cofins_cst`, `gtin`, `taxable_gtin`, `tax_benefit_code`, `profile_status`, `accounting_validated_at`, `accounting_validated_by`, `ibs_cbs_configuration`, `fiscal_description`. Hooks `useProductFiscalProfiles.ts` e `useFiscalProdutosLite.ts` existentes, sem novo cadastro fiscal paralelo.

`fiscal_invoice_items` (`types.ts:8365+`) já tem `quantity`, `commercial_unit`, `taxable_quantity`, `taxable_unit`, `fiscal_profile_snapshot`, `tax_input_snapshot`, `tax_snapshot`, `ncm_snapshot`, `cfop_snapshot`, vínculos lote/entrega/itempedido. Unidade fiscal textual **não valida dimensão nem fator da operação**; não derivar taxable_quantity do peso de saca inexistente. Valores fiscais/documentos/contas históricos não devem ser recalculados ao mudar família.

Registro regulatório, uso legal, classificação toxicológica/ambiental, garantias de fertilizante, requisitos de sementes/RENASEM, recomendações e enquadramento tributário dependem produto/operação/fonte oficial vigente e validação profissional. **Nenhuma regra fiscal, dose, NCM/CFOP, isenção, marca ou ingrediente inventado**. Não marcar VALIDATED a partir de seleção de aba ou conteúdo IA. Documentação e aprovação técnica/contábil são gates distintos.

Financeiro deve continuar consumidor de snapshot do pedido/operação autorizada; nova família não redefine credor/tenant ou parcela histórica. Sem emissão/SEFAZ/cobrança/cancelamento ou novo recebível neste plano. Fiscal e faturamento permanecem NO-GO até recorte específico.

## 15. Dependências de pacotes e gargalos confirmados

**Scanner de produção read-only desta rodada:** `security.dependency_scan` leu bun.lock,60pacotes. Retornou **16 advisories:2 high/14 moderate**; não atualização realizada.

| Dependência direta instalada | Transitiva / resultado scanner | Próximo passo sob autorização |
|---|---|---|
| react-router-dom6.30.1 | @remix-run/router/react-router:1high +5moderate (redirect/XSS e hydration) | Verificar versão transitiva, alcançabilidade SPA e correção compatível; não migrar major sem revisão |
| recharts2.15.4 | lodash:1high+2moderate (template/prototype) | Confirmar código alcançável antes de priorização e pin compatível aprovado |
| jspdf4.2.1 | dompurify6moderate + fflate1moderate | Validar caminhos PDF/HTML/ZIP; regressão bytes/visual antes de atualização |
| xlsx0.20.2 por URL | **Não verificado pelo scanner** (sem versão registry) | Revisão separada de advisory/origem/integridade, não concluir ausência de risco |

Advisory instalado não prova exploração em CultivoFarm; scan omite devDependencies. A ausência de findings no supply_chain antigo não supersede o scan atual. Nenhuma nova biblioteca é necessária para classificação/abas/unidades; preservar React/Vite/TanStack e lock.

Gargalos estruturais locais, agrupados uma vez:
1. **Produto+formulação multi-request/compensação** e snapshot explícito ⇒ extensão pode perder metadados em compensação; transação/versão a revisar no mesmo fluxo.
2. **Unidades líquidas em helpers/DTO/RPC/embalagem/OS** ⇒ cálculos inválidos para sólidos/sementes; gate dimensão antes da disponibilização operacional.
3. **Múltiplos leitores, casts e agregação completa** ⇒ classificação pode divergir ou catálogo >1000 ficar incompleto; tipar/paginar fonte existente, sem novo leitor paralelo.
4. **Ficha/UI/RPC/SQL com versões históricas diferentes** ⇒ aprovação e guard atuais não provados por trecho antigo; inventário final canônico é pré-requisito.
5. **Documentos históricos de “certificação integral”** ⇒ não transportar aceite antigo a família nova/ref proibido; matriz por camada/versão.

Sem refactor cosmético nem revisão global de aplicação. Ordem proposta: eliminar duplicação de taxonomia nos arquivos tocados, completar contrato dimensional, depois separar responsabilidade somente onde a fase precisar. Não propor rewrite.

## 16. Fases pequenas, migrations futuras e rollback substitutivo

**Todos os nomes de migration abaixo são candidatos documentais, não criados nem aplicados.** Arquivos sob supabase/migrations são exclusivos da ferramenta oficial; futura operação só após validar ref canônico e autorização.

| Fase | Entrega focal futura | Migration candidata / dependência | Aceite antes de próxima fase |
|---|---|---|---|
| C0 | Revisar este plano e paridade de schema/triggers/ACL/RPC definitivos; decidir subclasse, aplicação opcional, apresentações reais | Sem DDL; leitura remota só autorizada | Inventário com nomes/assinaturas/owner/ACL e fontes reais; divergências resolvidas |
| C1 | Classificação própria nullable no cadastro existente, sem backfill | `catalog_product_classification_additive`; relaxar NOT NULL aplicação somente se aprovado e acompanhado de guard | Legados byte-equivalentes/códigos inalterados; tipos novos sem solo falso; matriz writes plataforma/negações |
| C2 | Listagem/filtros internos e paginação, preservando abas/aliases | Índices/projeções somente se necessários e autorizados | >1000itens em mock controlado completo, ordenação/erro/cache; desktop/mobile não cortados |
| C3 | Unidades técnicas/apresentação de catálogo e ficha condicional | `catalog_product_units_additive`; campos de quantidade/unidade/fator nas estruturas existentes após desenho | kg/g/contagem não passa por100mL; ausência não calcula; ramo biológico regressão |
| C4 | Cadastro e revisão individual por plataforma com fonte | Evolução de validação/audit existente, contrato único; sem aprovação automática | Motivo/versão/concorrência/erro preservados e aprovação técnica distinta de classificação |
| C5 | Leituras sanitizadas portais/mobile, sem preços indevidos | Extensão mínima RPC canônica/projeção; ACL/gates fechados mantidos | Payload técnico sem finanças, Auth real autorizado e troca de escopo; não só CSS/mock |
| C6 | Comercial: preço/simulador/pedido dimensional e snapshots | `commercial_product_units_snapshots_additive`; só motor canônico | Valor servidor, replay/hash/volume inválido, histórico preservado e contrato tenant; B2B permanece fechado sem gate independente |
| C7 | Estoque/apresentações e capacidades produção | `stock_product_units_additive`; sem liberar helpers/OS | Unidade em saldo/reserva/ledger, concorrência/rollback; novos itens não entram em fermentação/OS indevida |
| C8 | Fiscal/regulatório/financeiro e homologação autorizada | `fiscal_product_units_compatibility` se lacuna confirmada | Contador/fontes/tenant e unidade tributável provados; nenhuma emissão/cobrança real por padrão |

Nomes de colunas e shapes finais sujeitos ao C0; não prometer assinatura nova antes de checar consumidor. Preferir ADD COLUMN nullable e validação triggers compatíveis, não DROP/reclassificação/dados obrigatórios por default. Se nova tabela satélite for comprovadamente necessária, mesma migration deve ter **CREATE→GRANT mínimo→RLS→POLICY** por ator/tenant e service_role apenas interno quando necessário; nenhuma leitura anon por conveniência. SECURITY DEFINER exige search_path fixo/ator/perfil/tenant/feature e revoga PUBLIC/anon. Não criar função privilegiada com flags cliente como autorização.

**Rollback:** desativar disponibilidade das famílias novas no fluxo consumidor sem ocultar legados legítimos; manter dados/aditivos/snapshots e restrições, não apagar catálogo ou enum. Se bug de unidade, bloquear cálculo/operação nova e forward-fix. Se bug de autorização, conter/revogar endpoint específico antes de substituir, nunca restaurar policy permissiva. Uma migration aditiva aplicada com dados não deve ser revertida com DROP COLUMN sem export/decisão expressa. Histórico não reescrito, logs não excluídos.

## 17. Matriz de testes, critérios finais e decisão de avanço

**Testes existentes a preservar/estender nas fases, não executados agora:**
- `src/test/protocolos/produtos-tab-cat06-cat07.test.ts` (compensação/carregamento), `produtos-tab-cat05.test.ts`, `fichas-cat09-cat10.test.ts`, `base-tecnica.redirect.test.tsx`.
- `src/test/catalogo/catalogo-fase27b-useCatalogoUnificado.test.ts`, `catalogo-fase27c-listagem-kpis.test.ts`, `catalogo-fase27d-renderizacao.test.ts`, `catalogo-fase27e-certificacao-final.test.ts`, `formatUnidades.test.ts`, `formatUnidades.guard.test.ts`, `h3c-fonte-canonica-preco.test.ts`, `catalogo-errors.test.tsx`.
- `src/test/aplicacoes/unidades.test.ts`, `src/test/portalParceiroSimulador.contract.test.ts`.
- `src/test/estoque/stock-p1-containment.test.ts`, `stock-motor-hardening.test.ts`, `stock-batch-hardening.test.ts`, `stock-numeric-hardening.test.ts`, `stock-context-hardening.test.ts`, `catalogo-volumes-fase28c.test.ts`.

**Casos futuros obrigatórios:** cada regra em teste concreto que pode falhar; mocks sintéticos neutros para quantidades/tipos, sem nomes agrícolas/doses fictícios. Verificar: tipo legado/código/ID imutáveis; classificação ausente não inferida; produto multifunção/uso tratamento independente; falsos campos/registros inválidos; dimensão/preço físico correto e nenhum100mL para massa/contagem; fontes falhas não dão sucesso/vazio; snapshot/compensação retêm metadados; paginação1001+ completa e counts; A→B→A/readiness/resultados tardios; perfis reais×planos×tenant×vínculos, writes somente plataforma e payload técnico sem preço; hash/replay/conflito/concurrency; Stock ledger/saldo unidades; fiscal somente mock até autorização.

Cada fase reporta separadamente **static/mock, SQL rollback, JWT/HTTP, browser desktop/mobile, Storage/bytes, prévia, produção**. Typecheckapp/node, lint focal, Vitest, scanners e build em cada implementação conforme ferramentas disponíveis; restrição de execução manual do ambiente deve ser declarada NOT RUN, não compensada com PASS inventado. Browser real após publicação autorizada é gate separado; screenshot/lista não prova RLS de escrita.

**Decisão atual:** GO **somente para revisão do plano documental/C0 autorizado**, NO-GO para implementação ampla e comercialização/operação de novas famílias. Leitura canônica viva de contratos, decisão de aplicação opcional/subclasses/apresentações e fontes agronômicas/regulatórias reais são bloqueadores de implementação; preço/estoque/fiscal/portais demandam seus gates próprios. Nenhuma fase C1–C8 começou. Segurança integral, catálogo produção expandido, mobile/HTTP/RPC/Storage novos continuam UNVERIFIED; publicação externa Financeiro4717ff86 não os certifica.

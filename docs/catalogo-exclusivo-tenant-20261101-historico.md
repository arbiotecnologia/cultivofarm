> **HISTÓRICO** (v1–v2.5, congelado em 02/11/2026). Estado vigente: `docs/catalogo-exclusivo-tenant-20261101.md`.

# Catálogo EXCLUSIVO por empresa — plano atualizado e candidato (NO_GO)

Decisão do proprietário de 01/11/2026. Ela **substitui** o modelo global + próprio e a fundação opcional de 12 arquivos (que tinha 3 pins divergentes; a análise dela fica em `docs/reconciliacao-fiscal-catalogo-20261101.md` só como histórico).
Nada foi aplicado em banco remoto nem publicado. Evidência: PG_DISPOSABLE_SYNTHETIC_AUTH (PostgreSQL 17 local com esquema sintético) e Vitest. **HOSTED/JWT real: NÃO EXECUTADO.**

## 1. Regras
- Todo produto pertence a exatamente uma empresa (`produtos.owner_organization_id NOT NULL`, imutável).
- Produto antigo usado por várias empresas vira **uma cópia independente por empresa**. Cada referência aponta para a cópia da empresa do próprio registro. Nada é atribuído à AR Bio por padrão.
- Pedido, simulação, preço e condição B2B do parceiro usam o catálogo do **vendedor**: `partner_accounts.commercial_owner_organization_id`. Assim, o parceiro FSF dentro da AR Bio usa produtos da AR Bio, e o tenant FSF tem um catálogo separado.
- Produto antigo sem nenhum uso é removido, com cópia integral registrada no ledger. Usuários e empresas não são tocados.
- Superadmin: sem catálogo global e sem bypass. Os 10 escritores/leitores `platform_*global_product*` perdem EXECUTE para todos os papéis do cliente e do serviço.

## 2. Arquivos do candidato (`scripts/tenant-exclusive-catalog-20261101/`)
- `build.py`: gera tudo a partir do mapa de referências.
- `reference-map.json`: inventário de 29 referências (17 com tenant próprio, 10 atributos copiados, 1 anulada, 1 com componente de formulação).
- `00-pre-global.sql.review`: READ ONLY e sem escrita. Confere se toda FK real em `pg_constraint` para `produtos` está mapeada (FK desconhecida aborta), se colunas e tabelas existem, se não há instalação parcial, as dependências canônicas (`catalog_tenant_actor`, `partner_accounts.commercial_owner_organization_id`) e se não há índices únicos por expressão ou parciais.
- `01-migrate.sql.review`: **uma transação**, com o PRE de novo dentro dela, `LOCK ACCESS EXCLUSIVE` e os passos abaixo.
  1. Levanta o uso (produto, tenant). Qualquer registro sem tenant determinável aborta tudo.
  2. Monta o mapa `platform_private.tenant_catalog_product_map` (antigo + tenant → novo). Componentes de formulação herdam os tenants do produto pai.
  3. Desliga **por nome** só os triggers que estavam ligados e depois religa com o estado exato (A/R/O). O POST confere.
  4. Índices únicos simples de `produtos` (ex.: `codigo`) passam a valer por tenant.
  5. Cria as cópias de produtos e dos 10 atributos (perfil fiscal, técnico, conformidade, composição, recomendações, CQ, volumes, formulação).
  6. Reaponta as 17 referências pelo tenant do registro. Sobra sem cópia aborta.
  7. Anula `microrganismos.product_id` (tabela global sem tenant), com registro no ledger.
  8. Remove os originais, aplica `NOT NULL`, unicidade `(owner, lower(btrim(nome)))` e o trigger de dono imutável.
  9. RLS em `produtos`: as políticas antigas são registradas e substituídas por leitura do próprio tenant. Escrita direta revogada; anon sem acesso. Nos atributos: política restritiva mais leitura pelo produto visível.
  10. RPCs `tenant_product_list/save/set_archived`:
      - tenant derivado no servidor via `catalog_tenant_actor`;
      - lista fechada de campos permitidos;
      - nome com 2 a 200 caracteres e números finitos ≥ 0;
      - recibo idempotente por ator + empresa + chave;
      - reautorização depois de lock ou espera;
      - CAS por `updated_at` com PT409;
      - auditoria imutável.
  11. Fecha o catálogo global. 12. POST: ACL, dono, triggers e funções globais.
- Não há rollback de dados (transformação autorizada sobre dados de teste). A volta exige backup prévio. O mapa e o ledger ficam para auditoria.

## 3. Mapa de tenant por referência
| Tabela.coluna | Tenant |
|---|---|
| entregas, lotes, ordens_servico, programacao_producao, catalog_tenant_visibility | `organization_id` |
| commercial_condition_item_prices, commercial_price_rules, partner_product_prices | dono comercial do parceiro |
| partner_order_items / partner_simulation_items | pedido/simulação → parceiro → dono comercial |
| estoque_produto | lote → org; senão o parceiro reservado → dono comercial |
| estoque_embalagens, produto_etiquetas | lote → entrega → cliente |
| os_faturamento_base | OS → org; senão cliente |
| ordens_servico_onfarm | cliente → org |
| registros_consultor_recomendacoes | registro → cliente → org |
| formulacoes.component_insumo_id | dono da cópia do produto pai |
| commercial_campaign_products | **sem tenant**: linhas existentes abortam (lacuna) |
| microrganismos.product_id | anulado e registrado (lacuna de decisão) |

## 4. Matriz de testes e resultados (PG descartável: 49 PASS / 0 FAIL na rodada final)
REDs encontrados e corrigidos na própria rodada (preservados):
- **run1**: `DISTINCT` com `gen_random_uuid()` duplicava o mapa (defeito real do gerador), corrigido com um DISTINCT interno.
- **run3**: ligar RLS num atributo sem política permissiva escondia o perfil fiscal do próprio tenant (defeito real), corrigido com uma política de leitura explícita.

| Área | Positivos | Negativos |
|---|---|---|
| PRE | PRE-1 estado coerente, só leitura | PRE-2 FK desconhecida; PRE-3 parcial; PRE-4 índice por expressão; PRE-5 dependência ausente; MIG-15 reexecução |
| Transação | MIG-1 completa | MIG-0/0b referência sem tenant aborta sem deixar coluna ou mapa |
| Referências | MIG-2 cópias 5 sem global; MIG-4 pedido do parceiro FSF → cópia AR Bio; MIG-5 lote/estoque FSF → cópia FSF; MIG-6 cópias distintas; MIG-7 perfil fiscal por cópia; MIG-8 componente no mesmo tenant; MIG-12 código por tenant | MIG-3 sem uso não ganha dono; MIG-9 microrganismo anulado |
| Triggers | MIG-10 estado exato restaurado | MIG-11 item selado continua imutável |
| Acesso | ACL-1 admin A vê só A; ACL-7 atributo do próprio tenant | ACL-2 comprador/usuário FSF não lê AR Bio; ACL-3 Superadmin 0 linhas; ACL-4 anon; ACL-5 escrita direta; ACL-6 escritor global fechado |
| Cadastro | RPC-1 criar; RPC-2 mesmo nome em outro tenant; RPC-4 replay; RPC-11 editar com CAS; RPC-12 arquivar; RPC-13/14 listagem | RPC-3 duplicado normalizado; RPC-5 chave reutilizada; RPC-6 outro tenant; RPC-7/8 CAS velho ou ausente; RPC-9 tenant no payload; RPC-10 negativo; RPC-15 Superadmin; RPC-16 membro sem gestão; RPC-17 anon; RPC-18 dono imutável; RPC-19 auditoria imutável |
| Frontend (Vitest) | tela por empresa; ACK do produto pedido | payload com dono; nome inválido; valor negativo; ACK de outro produto; Superadmin/B2B sem a tela; painel sem catálogo global |

Ainda **não executados** (planejados para o banco real copiado): fluxo completo pedido → OS → lote → estoque → entrega → rascunho fiscal com triggers e RPCs reais capturados; concorrência de revogação durante a espera; JWT/RLS/Storage hospedados por A/B/gestor/SA.

## 5. Lacunas explícitas (bloqueiam a aplicação)
1. **Esquema real**: o inventário vem de `types.ts`, e os testes usam esquema sintético. É preciso capturar READ ONLY `pg_constraint`, triggers, policies, ACL, colunas geradas/identity e corpos de RPC. O PRE aborta se houver FK fora do mapa, mas colunas geradas fariam a cópia genérica falhar.
2. **Referências sem FK** (JSON ou texto em snapshots de pedidos, documentos fiscais, recomendações, `catalogo_alvo`, `seedCatalogoARBioV13`): não são reapontadas. Os snapshots mantêm o ID antigo. Falta inventariar os corpos das RPCs que fazem join com `produtos` sem filtro de tenant.
3. **commercial_campaign_products**: campanhas não têm tenant. Decidir entre dono da campanha e exclusão.
4. **Microrganismos e culturas** continuam globais. Decidir se também passam a ser por tenant; hoje a referência a produto é anulada.
5. **Escritores diretos no app** que vão parar após a revogação: `ProdutosTab` (base técnica, 6 chamadas), `seedCatalogoARBioV13`, `autoCodigo`, perfis fiscais de produto (`useProductFiscalProfiles`). Precisam migrar para a RPC ou ganhar RPCs próprias.
6. **Leitores definer** (projeção do parceiro, resolvedor de preços, simulador, carrinho B2B): continuam lendo como definer. É preciso confirmar se filtram pelo vendedor; se não filtrarem, cruzariam tenants.
7. `catalog_tenant_actor('mutate')`: confirmar quais papéis do tenant ele autoriza. O candidato não cria papel novo.
8. Orquestração: rodar o PRE e a migração com backup prévio e na janela autorizada. NO_GO até revisão.

## 6. Frontend modificado
- `src/lib/catalogo/tenantProducts.ts`, `src/hooks/useTenantProducts.ts`, `src/pages/configuracoes/ProdutosEmpresa.tsx`: novos.
- `src/App.tsx`: rota `/configuracoes/produtos` (autorizada pelo proprietário).
- `src/lib/permissions.ts`: administrador edita; gestor, gestor comercial e financeiro só leem; Superadmin e B2B não têm acesso.
- `src/config/navigation.ts`: menu "Produtos da empresa".
- `src/pages/plataforma/PlataformaHome.tsx`: saem as abas "Catálogo" e "Perfis fiscais de produtos" (globais) e o parâmetro `?catalogo=`.
- `src/test/catalogo/tenantExclusiveCatalog.test.ts`: novo.

No modo de preparação homolog, as escritas continuam bloqueadas pela contenção. As RPCs não existem no banco, então a tela mostra "ainda não está disponível neste ambiente".

## 7. Comandos e evidências
```
python3 scripts/tenant-exclusive-catalog-20261101/build.py
python3 scripts/tenant-exclusive-catalog-20261101/test/harness.py <dir>
```
Evidências: `docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/` (run1 RED, run3 RED, run5 GREEN final 49/0, JSON Vitest, SHA256SUMS).

## 8. Regressão frontend (Vitest, maxWorkers=2)
- catálogo/saas/config/navegação: 2926 testes, 19 falhas. Duas foram causadas por esta rodada e já corrigidas: ícone repetido em Administração e inventário de menu sem o item novo. O restante é anterior, confirmado na base `d38bedc` (`vitest-baseline-d38bedc.json`): 11 do monitor do catálogo do parceiro e do NovoPedido, o inventário de rotas datado de 07/10 (já divergia: 180 contra 178), `/portal-parceiro/financeiro` e `'/plataforma'` em comentário do ACCESS_MAP. Somam-se o binding da homolog em `ficha-ia-client` e os 3 casos de outlet.
- Nova rodada das suítes afetadas: 284 testes, 3 falhas, todas anteriores.
- fiscal/financeiro/pedidos/comercial/homolog: 3380 testes, 2 falhas, ambas anteriores (exigem o ref de produção, e esta cópia aponta para a homolog).
- Typecheck/build manual: não executados (o ambiente cuida disso).

---

## 9. Revisão v2 — reconciliação com o inventário READ ONLY real (01/11/2026)

**Fonte:** metadados reais autorizados pelo proprietário, materializados em
`docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/live-readonly-20261101/` (`fks.tsv` = 151 FKs com
nome e definição exatos; `orgs.json` = 5 organizações e contagens). Hashes em `SHA256SUMS-v2`. A v1 foi preservada
integralmente em `scripts/tenant-exclusive-catalog-20261101/v1-superseded/` (SUPERSEDED, não aplicar).

### O que mudou em relação à v1
| Ponto | v1 (inventário de types.ts) | v2 (inventário real) |
|---|---|---|
| Raízes | só `produtos` | `produtos`, `microrganismos`, `culturas` (todas com dono obrigatório) |
| `microrganismos.product_id` | anulado | microrganismo vira catálogo do tenant; `product_id` remapeado para a cópia do **mesmo** tenant |
| Tenant | `organization_id` direto em várias tabelas | direto só em `ordens_servico`, `catalog_tenant_visibility`, `talhoes`, `entregas`, `lotes`, `programacao_producao`; demais por pais reais (pedido→parceiro→dono comercial, lote, entrega, embalagem→lote, talhão, registro do consultor, cliente, fazenda). Nenhum UPDATE genérico por `organization_id` |
| Dependências | componente de formulação | ponto fixo: formulação (produto/microrganismo/componente), composição (inclui FK de 2º nível `declaracoes→conjuntos(produto_id)`), microrganismo→produto, dossiê→snapshot/apresentação→volume, recomendações com cultura |
| Sem tenant derivável | abortava tudo | configuração descartável (campanha, regras, preços, visibilidade, simulação) removida com snapshot — **bloqueada** se a regra estiver referenciada por snapshot de pedido; vínculo operacional anulável anulado com registro; NOT NULL aborta. Sem tenant padrão |
| Empresa nova | — | catálogo vazio (testado: CultivoFarm, Homolog, REFIL = 0) |
| PRE | só FKs → produtos | FKs → 3 raízes iguais ao inventário (sobra e falta), FKs de 2º nível, colunas de pais usadas na derivação, instalação parcial em qualquer raiz, únicos por expressão |
| POST | owner/ACL | integridade cruzada: cada vínculo aponta para a cópia do tenant derivado do registro; descendentes e raiz→raiz no mesmo tenant |

Microrganismos/culturas: escritores existentes continuam funcionando, mas **restritos ao próprio tenant** (política
restritiva + dono derivado no servidor por padrão; tenant alheio negado). Produtos: só RPC (v1).

### Resultado (PG descartável com as 151 FKs reais carregadas): **67 PASS / 0 FAIL**
Evidência: `run6-v2-real-fks-GREEN/` (checks.json, harness.log). RED reais encontrados e corrigidos nesta rodada,
registrados em harness.log: (1) PRE exigia FK direta `declaracoes.produto_id→produtos`, inexistente no banco real
(é `→produto_composicao_conjuntos(produto_id)`); (2) seção RPC referenciava função renomeada.
Classe: `PG_DISPOSABLE_REAL_FK_DEFS` para a carga do esquema; demais `PG_DISPOSABLE_SYNTHETIC_AUTH`
(colunas não-FK sintéticas, auth stub). **Hosted: NÃO EXECUTADO.**

Hashes v2: `00-pre-global.sql.review` 3913dae4…dc66 · `01-migrate.sql.review` 96e11f1b…7d3b.

### Lacunas v2 (aplicação continua NO_GO)
1. A captura tem **39** tabelas de origem distintas apontando para as raízes (o resumo cita 40); o PRE compara com
   `pg_constraint` real e aborta em qualquer diferença — confirmar a 40ª no PRE READ ONLY antes da aplicação.
2. Colunas não-FK, NOT NULL, triggers e políticas reais das 59 tabelas não foram capturadas; o harness usa sintéticas.
   Necessário capturar READ ONLY definições/triggers/policies das tabelas tocadas e rodar o harness com elas.
3. `microorganism_ncm_candidates` (pai do dossiê) fica compartilhado; cópia do dossiê mantém o candidato publicado.
   Decidir se candidatos também viram por tenant.
4. Escritores/leitores existentes de microrganismos/culturas e telas que assumiam catálogo global precisam de
   auditoria de consumidores (somente produtos tem UI própria nova).
5. Prova JWT/RLS real e navegador: não executadas.

---

## 10. Revisão v2.1 — anexo LIVE definitivo (104 funções, 340 colunas de pais, 151 FKs) — 01/11/2026 15:16

**Materialização imutável:** `docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/live-input-20261101-1516/`
(anexo original sha256 `ef0b7ece458ef63670ef1989bb74b28e8a6897f641369a9177f0d1eccdba4106`, ref `swzpzcwiasxmjutrmvkm`,
104 corpos separados em `functions/`, `SHA256SUMS`). MD5 dos 104 corpos conferido: 0 divergências. As 151 FKs do
anexo são idênticas a `live-readonly-20261101/fks.tsv` (diferença vazia). O SQL capturado é dado de revisão, não
autorização para executar.

### Correções no candidato
| ID | Achado | Correção |
|---|---|---|
| V21-1 (RED real) | O `catalog_tenant_actor` LIVE só aceita os modos `mutate/read_catalog/read_management/read_selection_cultura/read_prefs`; o candidato chamava `'read'` → leitura por RLS e `tenant_product_list` devolveriam **zero** para todos. Reproduzido: `run7-RED-live-actor-mode` (ACL-1 `0|0`, ACL-7 `0`). | `'read_catalog'` em `tenant_catalog_read_org` e na listagem. GREEN em run8. |
| V21-2 | Estoque derivava dono por cliente/parceiro reservado. | `estoque_produto`, `estoque_embalagens`: dono do **lote** (`lote_id` é NOT NULL no real); `produto_etiquetas`: lote ou lote da embalagem. Teste MIG-6b: lote ARB reservado a cliente FSF → cópia ARB. |
| V21-3 | Perfil fiscal | Continua descendente do produto (dono = dono do produto); `created_by` nunca é usado. |
| V21-4 | Drift de funções | PRE pina md5 de `pg_get_functiondef` das 104 funções; qualquer corpo diferente ou ausente aborta (PRE-8). |
| V21-5 | Fechamento global | Todas as funções capturadas com "global" no nome (34, incluindo os `*_core` privados) entram no fechamento; POST verifica EXECUTE fechado. |

O ator LIVE também nega Superadmin (`catalog_visibility_platform_actor_denied`) e exige organização `ativa`: Homologação
(`onboarding`) e REFIL (`rascunho`) não usam o catálogo até serem ativadas — comportamento LIVE preservado, não alterado.

`partner_accounts.commercial_owner_organization_id` confirmado no anexo: pedido do comprador teste4/FSF resolve para o
catálogo da AR Bio (dono comercial), separado do tenant FSF (MIG-5).

### Resultado: **70 PASS / 0 FAIL** (`run8-v2.1-live-functions-GREEN/`)
O harness agora carrega os **104 corpos LIVE byte-exatos** (`check_function_bodies=off`, 0 falhas de carga) e usa o
`catalog_tenant_actor` real; só as dependências dele (`h15_actor_organization`, `is_platform_superadmin`, `has_role`,
`_saas_user_has_feature`, `can_view_catalog_internal`) são stubs. Os outros 103 corpos são carregados e pinados,
**não executados**. Hosted: NÃO EXECUTADO.

Hashes v2.1: `00-pre-global.sql.review` 19b68447…1dd3 · `01-migrate.sql.review` 9ddb2953…1787.

### Inventário de consumidores (`consumer-inventory-104.json/.csv`) — 84 DEFINER (todos com search_path fixo)
| Classe | Qtde | Destino no plano |
|---|---|---|
| CLOSE_GLOBAL | 34 | EXECUTE fechado neste candidato. **Atenção:** `global_product_fiscal_before_write` é função de trigger e continua disparando; com todos os produtos pertencendo a tenants, ela bloqueia gravação fiscal pelo tenant → precisa ser reescrita junto do salvamento fiscal por tenant (próxima etapa, gate fiscal continua OFF). |
| REWRITE_TENANT_WRITER | 2 | `fn_catalogo_sync_mestre_preco`, `rpc_associate_microorganism_fiscal_product`: reescrever com dono = tenant do ator e alvo do mesmo dono. |
| REVIEW_DEFINER_READ_NO_TENANT_FILTER | 28 | Ignoram RLS e não citam tenant: precisam de filtro por dono (lista na seção abaixo). Até lá, ficam como lacuna bloqueante. |
| REVIEW_DEFINER_TENANT_PRESENT | 20 | Citam tenant; revisar se o filtro alcança o dono do item. |
| INVOKER_RLS_INHERITS | 9 | Herdam a nova RLS. |
| INDIRECT_DESCENDANT_ONLY | 11 | Só descendentes; revisar por tabela. |

As 28 sem filtro: b2b_save_technical_simulation, catalog_volume_parent, lab_assert_manufacturable,
lab_item_is_manufacturable, _entrega_seed_checklist, approve_microorganism_profile_with_audit,
approve_product_profile_with_audit, fn_b2b_resolve_base_unit_price, fn_catalogo_preco_canonico,
fn_entrega_build_snapshot_v1, get_production_planning_detail, platform_set_catalog_label_active, proximo_codigo,
rpc_b2b_executive_dashboard, rpc_b2b_integrity_check, rpc_cc_validate_matrix, rpc_commercial_simulator,
rpc_criar_embalagens_pos_envase, rpc_fiscal_draft_save, rpc_gerar_etiqueta_produto, rpc_get_comprovante_entrega_data,
rpc_microorganism_regulatory_overview, rpc_regulatory_dossier_ensure_draft, set_codigo_microrganismo,
set_codigo_produto, trg_mestre_guard_preco_canonico, update_microorganism_b2b_description, update_product_b2b_description.
A classificação é **estática** (regex sobre o corpo): indica onde revisar, não prova vulnerabilidade nem segurança.

### Lacunas (aplicação continua NO_GO)
1. Reescrita das 2 escritoras + revisão das 28/20 DEFINER e do trigger fiscal global — ainda não feita.
2. `clientes`/`fazendas`/`talhoes`/`envase` não estão nas colunas de pais capturadas; derivações por cliente/fazenda
   (onfarm, registros, visitas, regras por cliente) dependem do PRE real (`dep_column_missing` aborta).
3. NOT NULL/triggers/policies reais das tabelas de referência não capturados; candidatos NCM de microrganismo compartilhados.
4. Prova JWT/RLS e navegador reais não executadas.

---

## 11. Revisão v2.2 — itens fiscais sem FK, trava de recebível e 25 wrappers globais (01/11/2026 15:20)

| ID | Achado | Tratamento no candidato |
|---|---|---|
| V22-1 | `fiscal_invoice_items.source_item_id` não tem FK. No motor fiscal do repositório (`20261031000000_h10a…apportion_engine_v1.sql`, l.362/397/453) o id é **produto só em NF-e** e **serviço em NFS-e**. | Novo vínculo sem FK: considerado só se a nota for `invoice_type='NFE'` e o id existir em `produtos`; empresa = `fiscal_invoices.organization_id` (emitente). Itens de NFS-e não são tocados. Os snapshots JSON aceitam só chaves fiscais (ncm/cest/cfop/…), sem id de catálogo, então ficam inalterados. A trava de imutabilidade dos itens é desligada e religada no mesmo estado. |
| V22-2 | 3 de 4 configurações da AR Bio com `auto_generate_receivable=true`; os 7 pedidos estão barrados por `internal_origin_snapshot` ou pelo contrato `C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1`. | PRE aborta se algum `company_fiscal_settings` tiver NF-e/NFS-e/produção ligados ou se não existir corpo `generate_b2b_receivable_secure%` contendo as duas barreiras. Uma foto antes/depois compara: recebíveis, pedidos com recebível gerado, notas, fiscal ligado, configurações automáticas, md5 dos snapshots de origem de todos os pedidos e corpos do guard. Qualquer diferença aborta no POST. Origens e guards nunca são alterados. |
| V22-3 | 25 wrappers/núcleos globais (culturas, microrganismos, volumes, estado B2B) fora da captura de 104. | md5 LIVE pinado no PRE (total de 129 pinos); nomes incluídos no fechamento: todas as sobrecargas perdem EXECUTE e o POST verifica. Corpos LIVE não estão no anexo: no harness são stubs com assinatura exata, e o PRE os acusa como drift (PRE-9) antes da troca sintética de pinos feita **só no harness**. |

**Resultado: 82 PASS / 0 FAIL** (`run9-v2.2-fiscal-receivable-global25-GREEN/`). Novos testes: PRE-9/10/11 (pinos dos 25, fiscal ligado, guard ausente),
POST-1 (falha injetada: recebível marcado durante a migração aborta), MIG-25..30 (NF-e AR Bio/FSF remapeadas, NFS-e intacta,
snapshot JSON igual, 0 recebíveis/0 gerados/7 origens/3 automáticas preservados, guard bloqueia pedido após a migração),
ACL-12/13 (nenhuma sobrecarga global executável por authenticated/anon).
RED da rodada: o primeiro POST-1 falhou porque a injeção caía depois da foto final (erro do harness, corrigido).
O stub do guard de recebível é sintético; o corpo LIVE não veio neste anexo.

Hashes v2.2: `00-pre-global.sql.review` 2335180f…ee5a · `01-migrate.sql.review` f8e94c8f…cd90.

**Pendente de decisão do proprietário:** destino da cadeia sem tenant. O candidato hoje descarta configurações e anula
vínculos anuláveis, com registro; NOT NULL aborta. Essa política só vale para aplicação após a resposta.
Nenhuma mutação remota foi feita ou autorizada.

## 12. v2.3 — descarte da cadeia de teste sem empresa (decisão do proprietário, 01/11/2026 15:24)

Decisão: "Descartar essa cadeia de testes sem empresa." Nada é atribuído à AR Bio nem à FSF.

- IDs fixos (ordem de exclusão, filhos primeiro): entrega `20d66f88…`, estoque `000cd77c…`, envase `bca8a46a…`, lote `cd49ce12…`, programação `8896d700…`, OS `4a5af44d…`.
- PRE (somente leitura, antes de qualquer DDL): cada ID existe exatamente 1 vez; entrega/lote/programação/OS sem `organization_id`; entrega sem `receivable_id`; para cada FK real (via `pg_constraint`) que aponta para essas 6 tabelas, zero linhas fora da própria cadeia referenciando esses IDs. Qualquer desvio aborta.
- Migração: `DELETE … WHERE id = <fixo>` um por um, sem CASCADE, **antes** de desativar gatilhos (proteções existentes continuam ativas; se alguma bloquear, a migração aborta e exige exceção revisada). Cada linha removida fica registrada em snapshot no registro da migração.
- Executa antes da coleta de uso, então a cadeia não gera cópias de produto.
- POST: os 6 IDs ausentes e exatamente 6 registros `chain_purged`.

Testes PG descartável (sintético; JWT/RLS reais não executados): CHN-1 dependente externo aborta; CHN-2 elo com empresa aborta; CHN-3 ID ausente aborta; CHN-4 recebível aborta; CHN-5 gatilho de proteção continua ativo; CHN-6 descarte + 6 snapshots; CHN-7 sem cópias geradas. Total v2.3: **89 PASS / 0 FAIL**. Evidência: `docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/run9-v2.3-chain-purge/`.

Limite: o harness não reproduz dependências live que você está auditando; o PRE dinâmico vai detectá-las na aplicação real. Aplicação remota continua NO_GO até sua revisão; fiscal, automações e cobrança seguem bloqueados.

## 13. v2.4 — manutenção atômica específica para a cadeia sem empresa (substitui o descarte da v2.3)

Captura READ ONLY de 15:26 (31 FKs, 22 gatilhos) mostrou que o DELETE comum é bloqueado por proteções reais. O descarte saiu da migração 01 e virou o script separado `02-chain-purge-maintenance.sql.review` (NÃO executado hospedado). O PRE de 00/01 agora **exige a cadeia ausente** (`chain_not_purged_run_maintenance_02`), então a ordem obrigatória é 02 → 00 → 01.

Escopo exato: 19 linhas = 6 raízes + 9 checklist + 1 comprovante `cee1b253…` + 2 movimentações + 1 CQ `51cf7c0c…`.

Desenho:
- uma transação; LOCK ACCESS EXCLUSIVE nas 11 tabelas antes de validar; `lock_timeout` 5s;
- recusa `session_replication_role` ≠ origin e papéis de API; sem CASCADE, sem DISABLE TRIGGER ALL, sem GUC/JWT falso;
- conjunto de gatilhos das 11 tabelas precisa ser exatamente os 22 capturados, todos habilitados, sem regras; definição dos suspensos conferida por `pg_get_triggerdef` exato;
- revalida vínculos (OS→programação→lote→envase/estoque/CQ/movimentações/entrega), entrega sem empresa/recebível/pedido/reentrega e não cancelada/confirmada, comprovante `gerado` sem snapshot nem arquivo, conjuntos exatos de movimentações e CQ;
- varre todas as FKs reais que apontam para as 11 tabelas: qualquer linha externa referenciando o escopo aborta (inclui `movimentacao_origem_id` RESTRICT e `entrega_termos.comprovante_id`);
- grava snapshot integral das 19 linhas + catálogo de gatilhos + event triggers no registro privado;
- suspende só 8 gatilhos nominais (CQ fence/imutável, append-only, entrega fechada, envase imutável, 2 guards de estoque, lote manual); **mantém ativos** os gates de estoque (singleton NOWAIT), refresh da esteira, checklist e comprovante;
- exclui por ID com conferência de ROW_COUNT, filhos primeiro; reabilita, compara o catálogo de gatilhos completo com o snapshot inicial e confere 0 linhas restantes antes do COMMIT;
- repetição: registro `committed` + cadeia ausente = no-op; registro com linhas presentes aborta.

PG descartável com os corpos capturados (`chain-purge-input-20261101-1526/guards.json`; ramo não-DELETE de `stock_p1_guard` encurtado): **39 PASS / 0 FAIL** — baseline com 6 DELETEs comuns bloqueados; falha intermediária real (gate NOWAIT travado por outra sessão depois de checklist/comprovante/entrega/movimentações excluídos) com rollback integral, 0 gatilhos desabilitados e registro vazio; sucesso com dados de fora intactos e proteções reativas; repetição sem nova exclusão; 15 negativos (registro extra, dependentes externos, empresa no lote, comprovante congelado/com arquivo, callback novo, definição divergente, gatilho já desabilitado, regra, recebível); replication_role e papel de API recusados; checagem estática. Migração principal reexecutada: **83 PASS / 0 FAIL**.

Limites: auth/JWT reais não executados; colunas não capturadas são sintéticas (ex.: nomes de colunas de arquivo do comprovante — a checagem usa chaves `%path%`/`%arquivo%`); o script cria apenas `platform_private.chain_purge_maintenance_ledger` (sem acesso para PUBLIC/anon/authenticated). Aplicação remota: NO_GO até sua revisão. Evidência: `run10-v2.4-chain-maintenance/`.

## 14. v2.5 — pacote consolidado (01/11/2026 15:34)

Anexo materializado: `consolidado-20261101-1534/consolidado-catalogo-20261101.json`, SHA-256 `6443ad83…8314` (confere). Nada aplicado hospedado; NO_GO mantido.

### Revisão independente f588e1d8
1. `catalog_tenant_actor('read')` → já corrigido para `read_catalog` (run7); o ator LIVE real segue carregado no harness.
2. **enum `tipo_produto`**: INSERT/UPDATE agora usam `v_in := jsonb_populate_record(NULL::public.produtos, payload)` (valor tipado pela linha). Criação exige `tipo` string; enum inválido continua recusado (22P02). Harness passou a modelar o tipo real (`tipo public.tipo_produto NOT NULL`) — o modelo anterior (`tipo text`) escondia o defeito.
3. **`b2b_enabled`**: coluna LIVE é `NOT NULL DEFAULT true`; omitido agora grava **false** explicitamente; `null` recusado antes do INSERT.
4. **Cadeias divergentes**: todos os `COALESCE` de tenant (inclusive `registros_consultor`) foram trocados por `platform_private.tc_agree(...)`, que aborta com `tenant_catalog_chain_divergence` se houver mais de um tenant não nulo; auxiliar transitório, removido antes do COMMIT. Estoque/embalagens continuam só por lote (reserva nunca transfere propriedade).
5. **Cinco raízes**: `formulacoes` e `catalogo_volumes` ganham `owner_organization_id` NOT NULL (tenant da cópia), índice e gatilho de consistência (dono imutável; produto/micro/insumo do mesmo dono). `microrganismos.product_id` é remapeado para a cópia do mesmo tenant (OWN-4), não anulado.
6. **25 wrappers globais**: corpos LIVE completos carregados no harness (md5 capturado reproduzido 25/25, sem stub); alteração de corpo detectada pelo PRE (PRE-9b).
Campanhas: zero `commercial_campaign_products` LIVE; nada bloqueia por vínculo inexistente e campanhas não são tocadas.

### Manutenção 02 (descarte das 19 linhas)
- Agora gerada por `build.py` de `maint_template.sql` + pins LIVE: **82 gatilhos** (md5 de `pg_get_triggerdef`/`pg_get_functiondef` — fórmula confirmada contra os 22 corpos capturados) e **19 impressões digitais de linha**. Checklist com os 9 IDs exatos do manifesto.
- Comprovante e entrega excluídos no **mesmo comando** (CTE): a ação `SET NULL` de `entregas.comprovante_id` roda depois da entrega já removida, sem disparar gatilhos de UPDATE de entregas. A ordem v2.4 disparava esses gatilhos (RED CP-41).
- Checagem de arquivos do comprovante inclui `assinatura_digital%`.

### Resultados (PostgreSQL 17.11 descartável)
- Manutenção: **45 PASS / 0 FAIL**. Os 22 gatilhos de DELETE usam corpos LIVE md5-idênticos sem substituição (CP-0b); os outros 60 são stubs que **abortam se disparados** (comprova que o descarte não aciona nenhum gatilho não-DELETE); só os pins desses 60 e das impressões digitais (dados sintéticos) são localizados no harness. Novos: impressão digital alterada aborta (CP-39); função de proteção enfraquecida aborta (CP-40); comprovante congelado/com arquivo aborta mesmo com pins recapturados (CP-29b/30b).
- Migração: **96 PASS / 0 FAIL** (novos DIV-1, OWN-1..4, TYP-1..7, PRE-9/9b; RPC-13/14 passaram a 6/7 porque TYP cria dois produtos a mais).
- Frontend: formulário "Produtos da empresa" ganhou campo Tipo (enum do gerador de tipos); cliente exige tipo na criação e recusa `b2b_enabled` nulo. Vitest `src/test/catalogo` (2 workers): **795 PASS / 14 FAIL** — 14 falhas em `partnerCatalogMonitor` (10), `partnerOutletNovoPedido` (3) e `ficha-ia-client` (1, binding homolog deliberado); nenhuma importa os arquivos alterados. Não foram corrigidas nesta rodada.

### Limites honestos
- Fórmula da impressão digital de linha assumida como `md5(to_jsonb(linha)::text)`; se divergir da captura, o script aborta (fail-closed) — confirmar antes da aplicação.
- Eventos dos 8 gatilhos sem definição capturada (CQ/movimentação) assumidos não-DELETE por não constarem na lista dos 22 de DELETE.
- Auth/JWT/RLS reais não executados; stubs nunca são GO.
- Ordem de aplicação: 02 → 00 → 01, somente após sua revisão.

---

## Estado v2.6 (02/11, base 8c6ea7f) — substituído pela v2.7

## 1. Ordem candidata
`02-chain-purge-maintenance` → `00-pre-global` → `01-migrate` (todos `.sql.review`, gerados por `build.py`).

SHA-256 atuais (`scripts/tenant-exclusive-catalog-20261101/SHA256SUMS.json`) — recalculados a cada `build.py`.

## 2. Manutenção 02 (descarte das 19 linhas) — achados 02/11 corrigidos

Captura READ ONLY materializada: `docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/captura-manutencao-20261102/`
(SHA-256 `b5d257c50f9a3055879e9f25876ac4f7cb5e73def68ae565c69a9e5256702a39`, conferido pelo `build.py`, que aborta se divergir).
Fórmula `md5(to_jsonb(t)::text)` confirmada; as 19 impressões LIVE são idênticas ao manifesto (verificado no build).

| Achado | Correção |
|---|---|
| 83 gatilhos, não 82 (`entrega_termos.trg_entrega_termos_immutability`) | Pins vêm da captura: 83 gatilhos com **tgtype + definição + corpo** (md5). PRE confere os três. |
| (1) Varredura FK aceitava UUID de outra tabela | Manifesto `(tabela,id)`; o valor referenciado precisa estar no manifesto **da tabela-alvo da FK**, e a linha filha só é interna se seu par `(tabela_filha,id)` estiver no manifesto. |
| (2) FK composta ignorada | FK composta → `composite_fk_unsupported`; FK cujo alvo não é `id` → `fk_target_not_id_unsupported`. |
| (3) ACL do ledger | REVOKE de PUBLIC/anon/authenticated/**service_role** (tabela e sequência), revogação de qualquer outro beneficiário, verificação "só o dono", dono do ledger na allowlist; default ACL registrado no ledger. Executor: `current_user` e `session_user` em allowlist (`postgres`/`supabase_admin`), sem claims JWT e com `auth.uid()` nulo. |
| (4) POST só comparava gatilhos | Antes do COMMIT: impressão digital das linhas **fora do manifesto** nas 11 tabelas e em todas as filhas por FK; digest de corpos+ACL de todas as funções de `public/platform_private/cf_user_guards_v1/auth`; ACL/RLS/policies das 11 tabelas. Auxiliares temporários são removidos antes do COMMIT. |
| (5) Event triggers só registrados | Pré-voo **antes de qualquer DDL**: todo event trigger habilitado precisa estar pinado (nome, evento, md5); lista vazia hoje ⇒ qualquer um aborta. |
| (6) Ordem de locks com o gate | Singleton `cf_user_guards_v1.state FOR UPDATE` (lock_timeout 5s) antes das 11 tabelas — mesma ordem do gate; o gate permanece ativo (NOWAIT). |

### Resultado: PostgreSQL 17 descartável — **74 PASS / 0 FAIL** (`run-v2.6-maint-83-real/`)
- **Corpos executados de verdade**: os 83 gatilhos e suas 55 funções foram instalados **verbatim** da captura; nenhum stub
  (CP-0/0b/0c: 83 instalados, 0 substituições de pin, 0 stubs). Corpos efetivamente disparados no sucesso: gatilhos de
  DELETE não suspensos (gate de estoque `stock_envase_mutation_gate_v1` com NOWAIT real, `fn_entrega_evidencia_estado_editavel_v1`,
  `fn_entrega_comprovante_preservar_encerrado_v1`, `_refresh_esteira_laboratorio_after_change` → `refresh_esteira_laboratorio`).
  Os 8 suspensos executaram nos baselines (CP-1..6 bloqueiam o DELETE comum). Gatilhos de INSERT/UPDATE foram **carregados**,
  mas só disparam onde o cenário provoca (ex.: CP-41 SET NULL).
- RED do candidato 8c6ea7f: aborta `trigger_set_drift:unexpected` com 83 gatilhos (CP-50); não acusa UUID colidente
  (CP-51) e, em FK `SET NULL`, conclui e **muta** a linha externa (CP-51b). GREEN: CP-52/52c/53.
- FK composta / alvo não-id: CP-54/55. ACL/allowlist/JWT/auth.uid/default ACL: CP-56..61 e CP-12c. Event triggers: CP-62/63.
- Lock: CP-8 (singleton ocupado ⇒ lock_timeout antes de ledger/tabelas), CP-8c (manutenção segurando o singleton ⇒ DML
  concorrente recebe NOWAIT do gate real, sem deadlock). Falha intermediária real: CP-8b (REFRESH real após DELETE de entregas)
  com rollback integral. Invariância fora do escopo em falha/sucesso/repetição: CP-11, CP-9b, CP-12b, CP-19b, CP-52b, CP-65;
  funções idênticas pelo lado do teste: CP-64.

## 3. Migração 01 — itens da seção 10 tratados nesta rodada
- **Policies**: nenhuma `FOR ALL` restante. Leitura: `read_catalog`. Escrita (INSERT/UPDATE/DELETE, restritiva e permissiva)
  em raízes: `catalog_tenant_actor('mutate')` (perfis atuais administrador/gestor + feature). Descendentes: pai visível **e**
  ator de escrita do mesmo tenant. Default do dono passa a vir do ator de escrita.
- **Escritoras reescritas**: `rpc_associate_microorganism_fiscal_product` (ator 'mutate', micro e produto do mesmo tenant,
  lock + reautorização; o papel `financeiro` do corpo LIVE deixa de alterar catálogo — consequência a revisar pelo proprietário)
  e `fn_catalogo_sync_mestre_preco` (lógica LIVE preservada; volume de outro tenant ligado ao alvo aborta; UPDATE filtrado pelo dono).

### Resultado: PostgreSQL descartável — **122 PASS / 0 FAIL** (`run-v2.6-migrate-GREEN/`)
RED (mesmos testes no pacote 8c6ea7f): **108 PASS / 14 FAIL** (`run-v2.6-policies-RED/`) — leitor inseria/alterava/excluía
culturas e microrganismos; 22 policies `FOR ALL`; escritora aceitava produto de outro tenant, papel não-gestor e anon.
Autenticação é sintética (`PG_DISPOSABLE_SYNTHETIC_AUTH`): não é prova JWT/RLS hospedada.

## 4. Frontend
`src/test/catalogo` (dois workers): **809 PASS / 0 FAIL** (antes 795/14).
- 13 falhas `partnerCatalogMonitor`/`partnerOutletNovoPedido`: a sonda **somente leitura** `partner_payment_condition_capability_v1`
  (criada no trabalho B2B) não existia nas simulações e caía no espião de escrita. Resposta adicionada: "função ausente"
  (PGRST202, estado real) no outlet e envelope exato com o mesmo ator/tenant/parceiro no monitor (que exige zero erro de
  consulta). O espião de escrita e todas as asserções foram mantidos.
- 1 falha `ficha-ia-client`: exigia o ref de produção; esta cópia é vinculada só à homologação. A asserção agora exige o host
  exato do ref canônico do `bindingGuard` e proíbe produção e os refs vedados.

## 5. Pendências que continuam bloqueando (NO_GO)
1. **48 DEFINER** (28 sem filtro de tenant + 20 com tenant a revisar) — não reescritas nesta rodada; lista no histórico, seção 10.
2. **Trigger fiscal global** `global_product_fiscal_before_write` e salvamento fiscal por tenant — não reescritos; gate fiscal OFF.
3. **Escritas diretas na UI** fora do CRUD próprio (`ProdutosEmpresa`) — inventário/migração para RPCs por tenant não concluídos.
4. CRUD por tenant completo de microrganismos/culturas/formulações/volumes via RPC (hoje: RLS por tenant com escrita 'mutate').
5. **NCM**: dados técnicos (NCM/classificação) permanecem referência técnica, não catálogo empresarial; a modelagem das
   dependências (candidatos NCM de microrganismo) ainda não foi formalizada no candidato.
6. **Event triggers do ambiente hospedado não capturados**: com a lista de pins vazia a manutenção abortará se houver
   qualquer event trigger habilitado — necessário capturar nome/evento/md5 e revisar.
7. Colunas sintéticas nas fixtures: as impressões digitais das 19 linhas são recapturadas localmente (as LIVE só são
   comparadas ao manifesto no build).
8. Prova JWT/RLS/navegador em ambiente real não executada.

---

# Arquivo — documento vigente até v2.10 (movido em 02/11/2026, rodada v2.11)

> Conteúdo histórico, substituído pelo estado atual em docs/catalogo-exclusivo-tenant-20261101.md. Não usar como estado vigente.

# Catálogo EXCLUSIVO por empresa — estado VIGENTE do candidato (v2.10, 02/11/2026) — **NO_GO**

> Documento vigente. Histórico (v1–v2.7) em `docs/catalogo-exclusivo-tenant-20261101-historico.md` e nas seções
> abaixo. Decisões resolvidas não são reabertas: catálogo exclusivo por empresa, sem catálogo global nem bypass de
> Superadmin; cadeia sem empresa DESCARTADA (19 IDs); dados atuais são de teste; **Financeiro associa produto
> fiscal↔microrganismo somente na própria empresa, sem CRUD de catálogo (decisão implementada, FIN-1..17)**.
> Produção autorizada pelo usuário SOMENTE após revisão independente; nada foi aplicado aqui.

Base: `ca43dc6`. Nada aplicado em banco hospedado, publicado, implantado, emitido ou cobrado. Fiscal AR Bio continua
DRAFT/NOT_READY com flags desligadas; os 7 pedidos seguem bloqueados por origem; automações desligadas; binding de
homologação e contenção preservados.

## 0. Rodada v2.10 — achado independente A/E (02/11) — corrigido e reproduzido
**Achado confirmado (RED):** a classificação v2.7 A/E estava errada. Contra o pacote anterior (`049696e`), no
PostgreSQL descartável: técnico do parceiro FSF gravou **2 itens FSF** numa simulação da AR Bio (AE-2b = 2); a seleção
da AR Bio listou 4 produtos, 2 microrganismos e 3 culturas de outras empresas, devolveu `include_ids` alheios e contou
11 em vez de 7 (AE-4/5/6); o gestor AR Bio gravou preferência de visibilidade sobre produto FSF (AE-7b = 1).
Evidência: `run-v2.10-ae-RED-049696e/`.

**Correção (`ae_section.py`, gerada no `01-migrate`):**
- **13 deltas pinados** (md5 do corpo LIVE conferido, cada trecho substituído exatamente N vezes, senão aborta):
  simulação técnica (dono = vendedor do parceiro), seleção e visibilidade (dono = ator), catálogo do parceiro e do
  técnico (dono = vendedor; Superadmin = nenhum), seleção e conversão da visita e a guarda de referência da visita
  (antes aceitavam só itens "globais" — quebrariam após a migração), embalagem/etiqueta (dono = empresa do lote),
  rascunho fiscal (dono = empresa do ator), aplicação e anexo de aplicação (dono = empresa da aplicação).
- **Guarda persistente** `a000_*_catalog_tenant_guard` em 21 tabelas-pai (OS, programação, lote, estoque, embalagem,
  etiqueta, entrega, itens B2B, simulação, preços, visita, NF-e...): todo id de catálogo precisa pertencer à empresa
  derivada dos pais reais; cadeias divergentes abortam; vale também para escritores DEFINER/dono e Superadmin.
  É a prova executável das leituras "via pai" das 11 funções classe A restantes.
- Classificação nova: `definer-48-classificacao-v2.10.json` (13 corrigidas por delta, 11 com guarda de pai, 1 sem leitura
  de catálogo; nenhuma "UNRESOLVED").

**GREEN (`run-v2.10-ae-GREEN/`): 295 PASS / 11 FAIL.** Todos os AE de segurança passam (simulação forjada recusada sem
gravar, seleção sem itens alheios, visibilidade sem oráculo, guardas em 9 tabelas com dados de teste, Superadmin sem
bypass). Simulações só em **rascunho**; envio ao gestor e avisos externos não foram exercitados.
FAIL restantes, todos honestos: 7 tabelas-pai sem dado de teste com produto (guarda instalada, **não exercitada**:
ordens_servico, programacao_producao, produto_etiquetas, estoque_embalagens, os_faturamento_base,
commercial_condition_item_prices, registros_consultor_recomendacoes) e as 4 agregadoras que dependem de objetos
ausentes de todas as capturas.
**Apenas estático** (dependências h15/estoque/aplicação não capturadas): deltas de embalagem, etiqueta, rascunho fiscal,
aplicação, anexo de aplicação e conversão de visita — instalados exatamente, execução positiva não comprovada.
Stubs declarados nesta rodada: visibilidade do parceiro (restaurada byte-exata depois, AE-3c), perfil do técnico e a
tabela de histórico de visibilidade (não capturada).

Plano de atualização de produção: `docs/plano-atualizacao-producao-catalogo-20261102.md` (nada hospedado executado).

## 0a. Rodada v2.9 — relações extras reais (captura 02/11, SHA-256 `68d98b22…42c4`)
Captura materializada (somente leitura) em `captura-extras-20261102/`; evidência bruta em
`run-v2.9-extras-20261102/` (com `SHA256SUMS`). Código: `test/extras_schema.py` + integração em `test/harness_real.py`.

**PostgreSQL descartável: 237 PASS / 4 FAIL** (v2.8: 235/6).
- **68 relações extras com colunas reais** (944: tipo, default, identity, generated, NOT NULL) substituem as tabelas
  sintéticas dos tipos gerados e os stubs mínimos; 4 PKs de stub conferidas idênticas às reais; nenhuma coluna de stub
  divergente; NOT NULL/PK/UNIQUE com fail-fast (0 falhas).
- **Funções reais: 300/300 carregadas** (antes 299; `tenant_smtp_lane_log` agora tem sua relação), 0 MD5 divergente.
- **Constraints extras: 280/302 ativas**; **policies extras: 141/160**; 158/158 CHECKs das 59 tabelas mantidas.
- Enums: 7 tipos das extras sem captura própria usam os rótulos dos **tipos gerados do banco real** (mesma ordem);
  `saas_subscription_status` não tem rótulos em nenhuma fonte → `organization_subscriptions` fica FORA (não vira text)
  com suas 12 constraints e as policies dependentes declaradas como não instaladas.
- Identidades/papéis/sessões seguem **sintéticos explícitos**: atores de fixture são inseridos em `auth.users` só com
  id para satisfazer a FK real `user_roles_user_id_fkey`; papéis/feature continuam stubs.
- Configurações financeiras: a UNIQUE(partner_id) real exigiu 4 parceiros distintos (3 sintéticos da AR Bio sem pedidos)
  para as 4 configurações (3 auto=true); os 7 pedidos e seus bloqueios não mudaram.
- **Efeitos colaterais:** nenhum dos 300 corpos usa `net.*`/HTTP/`NOTIFY`/dblink; gatilhos das extras não foram
  capturados nem instalados; nenhuma notificação/rede foi exercitada.

**Fechado nesta rodada:** `MIG-30` (guard real de recebível agora encontra `partner_users` real e bloqueia) e
`rpc_cc_validate_matrix` executa. Funções privilegiadas: 344 chamadas — DENIED 164, ERROR 60, BLOCKED_DEP 90, OK_NOOP 24, OK 6; zero vazamento.

**4 FAIL verdadeiros — objetos ausentes de TODAS as capturas (não inventados):**
`public.h15_require_staff()` (bloqueia `fn_fiscal_scenario_coverage` e `rpc_fiscal_nfe_readiness_v1`),
`rpc_b2b_carteira_kpis(...)` (bloqueia `rpc_b2b_executive_dashboard`) e a view `public.v_microorganism_fiscal_readiness`
(bloqueia `rpc_microorganism_regulatory_overview`).

**Ainda não instalados, com causa:** 22 constraints extras (FKs para tabelas ainda sintéticas sem UNIQUE —
`financial_cost_centers`, `recurring_financial_templates`, `comunicacao_regras`, `comunicacao_templates`, `bank_accounts`,
`saas_plans`; CHECKs com `fiscal_json_has_sensitive_key`, `fn_fiscal_uf_ibge_code`; as de `organization_subscriptions`);
19 policies (funções ausentes como `tenant_email_actor_org`, `can_user_access_aplicacao`,
`can_user_access_registro_consultor`, `notification_p1_visible`, `stock_p1_movement_owned`, `fn_fiscal_can_read_internal`,
`h15_fiscal_audit_access`, `c2p1_rule_log_allowed`); matview `mv_esteira_laboratorio` (depende de
`_src_vw_esteira_laboratorio`). Próxima captura útil: esses corpos/relações e os rótulos de `saas_subscription_status`.
Prova JWT/navegador real continua não executada.

## 0b. Rodada v2.8 (captura de helpers 02/11, SHA-256 `4a9f93d5…83ba`)
Evidência bruta: `docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/run-v2.8-20261102/` (com `SHA256SUMS`).
Captura materializada em `captura-helpers-20261102/` (somente leitura; 300/300 MD5 de corpo conferidos).

**PostgreSQL descartável (`test/harness_real.py`): 235 PASS / 6 FAIL.** Instalação: 299/300 funções reais carregadas
verbatim (0 MD5 divergente; falha: `platform_private.tenant_smtp_lane_log`, tipo de relação não capturado);
**158/158 CHECKs ativas** (fail-fast: a bateria aborta se faltar uma; as 22 fixtures incompatíveis foram corrigidas na
semente, sem afrouxar regra; os 3 helpers de CHECK vieram da captura); 232 policies e 255 gatilhos instalados (0 falhas
de instalação; nenhum gatilho removido; 5 com dependência ausente declarada). Auth/papéis/feature e as 68 relações
extras continuam **sintéticos** (tipos aproximados) até a captura dessas relações e a prova JWT real.

Famílias executadas (não apenas carregadas):
- **CRUD por RPC (novo, CRUD-1..13b, todos PASS):** `tenant_catalog_root_save/delete` para microrganismos, culturas,
  volumes e fichas técnicas; `tenant_catalog_formulacoes_replace` (substituição atômica do conjunto com CAS do produto).
  Empresa do servidor, reautorização após lock, CAS por `updated_at`, recibo idempotente, referências da mesma empresa,
  status/validação nunca pelo payload; INSERT/UPDATE/DELETE direto de cliente revogado nessas tabelas.
- **Códigos por empresa (COD-1..9 PASS):** contador privado por (empresa, tabela, prefixo); gerador global fechado;
  unicidade por empresa; 2×15 inserções concorrentes sem duplicidade.
- **48 DEFINER (DEF-0..4 PASS):** 344 chamadas — DENIED 158, ERROR 60, BLOCKED_DEP 96, OK_NOOP 24, OK 6. Nenhum LEAK
  (id de outra empresa), anon só OK_NOOP sem dado, Superadmin sem catálogo, ids alheios negados em B2B/preço/laboratório.
  BLOCKED_DEP não é aprovação: 15 assinaturas dependem de objetos fora da captura.
- **Financeiro (FIN-1..17 PASS)**, papéis ainda sintéticos.

**6 FAIL verdadeiros (não mascarados), todos por dependência externa ausente:**
- `MIG-30`: guard real de recebível usa `partner_users.revoked_at` (relação extra ainda sem metadados).
- 5 agregadoras não executam: `fn_fiscal_scenario_coverage`, `rpc_b2b_executive_dashboard`, `rpc_cc_validate_matrix`,
  `rpc_fiscal_nfe_readiness_v1`, `rpc_microorganism_regulatory_overview` (BLOCKED_DEP/DENIED). `rpc_b2b_integrity_check`
  executa sem vazamento. Objetos ausentes concretos para a próxima captura: `public.h15_require_staff()`,
  `platform_private.c1b_catalog_visibility_scope(uuid)`, `platform_private.producer_commercial_client_scope(uuid)`,
  `rpc_b2b_carteira_kpis`, `public.fn_regulatory_can_prepare()`, `public.v_microorganism_fiscal_readiness`,
  `public.platform_org_admin_invites`, `public.catalog_tenant_visibility_ledger`,
  `platform_private.application_save_preparations`, `platform_private.tenant_smtp_dispatch_jobs` e colunas reais das 68
  relações extras.

**Telas migradas para escrita só por RPC:** microrganismos (`MicrorganismosTab`), produto + composição (`ProdutosTab`:
`tenant_product_save` + substituição atômica; a compensação no cliente com escrita direta foi removida e falha de
composição após produto confirmado é “parcial”, nunca sucesso), fichas técnicas (`useProductProfile`/
`useMicroorganismProfile`: versão observada na leitura montada; mudança de status pela ficha recusada com mensagem, pois
aprovação segue o fluxo auditado). Cargas fixas `importCatalogoARBioV13`/`importarMicrosARBio2026` desativadas (sem
chamador na interface). `ativo`/`versao_catalogo` do produto não são mais enviados pela ficha de produto (arquivamento
segue `tenant_product_set_archived`).

**Pendente, com motivo:** perfil fiscal de produto (`useProductFiscalProfiles`) ainda grava direto no cliente; no
candidato a escrita direta já é revogada (falha fechada após aplicação) e o caminho é `tenant_owned_product_fiscal_save`,
que exige motivo e permanece desligado porque o fiscal segue pendente — migração da tela fica para a liberação fiscal.
Prova JWT/navegador real em homologação compatível ainda não executada.

**Regressões de tela (Vitest, 2 workers):** catálogo/protocolos/fiscal 2.927 PASS após correções (4 falhas da rodada
corrigidas: 2 de contenção — o teste agora reconhece o gravador por RPC — e os 2 testes de vínculo, que passaram a exigir
o host exato da homologação e nenhum outro projeto); pedidos/comercial/financeiro/config 2.518 PASS + 2 corrigidos
(`tenantProducts.ts` importava os tipos legados; agora usa a fonte canônica).

Migração `01-migrate.sql.review` atual: `e30a4c1f…5a24` (00 e 02 inalterados).

## 1. Ordem candidata e hashes
`02-chain-purge-maintenance` → `00-pre-global` → `01-migrate` (gerados por `build.py`; `SHA256SUMS.json`):
- 02 `ded870f8…6242` · 00 `5117003d…9af1` · 01 `e30a4c1f…5a24`

## 2. Event triggers (captura 02/11, SHA-256 `1ece8214…f6c1e`)
Materializada em `docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/captura-event-triggers-20261102/`.
Composição revisada no build (aborta se mudar): 4 limitados a `CREATE/DROP EXTENSION` (não disparam no descarte);
`pgrst_ddl_watch`/`pgrst_drop_watch` sem filtro de tag fazem só `NOTIFY pgrst 'reload schema'` (sem INSERT/UPDATE/DELETE/
rede). O pré-voo da manutenção compara, para todo event trigger não desabilitado: nome, evento, **evtenabled**,
**evttags** (ordenadas/NULL), assinatura e md5 do corpo; qualquer divergência aborta antes de DDL. Nenhum event trigger é
desativado. PG descartável com os 6 corpos LIVE instalados verbatim: **81 PASS / 0 FAIL**
(`run-v2.7-maint-evt.stdout`): CP-E1 conclui com os 6 reais; CP-E2..E6 abortam com tag/tag ampliada/corpo/
ENABLE ALWAYS/ENABLE REPLICA divergentes sem remover nada; CP-E7 desabilitado não bloqueia.

## 3. Esquema REAL no PostgreSQL descartável (substitui colunas sintéticas)
`test/harness_real.py` monta as 59 tabelas da captura (1.339 colunas com tipo/NOT NULL/default, 379 índices + PKs
reais, 151 FKs, grants), enums com rótulos do arquivo de tipos gerado do ref canônico, carrega os 104 + 25 corpos LIVE
e instala policies/gatilhos reais cujas funções existem. Resultado: **180 PASS / 0 FAIL**
(`run-v2.7-migrate-real-schema/`). Mesma bateria contra `98df195`: PRE aborta (`unique_expr_or_partial`) e a execução
quebra (`run-v2.7-migrate-real-schema-RED-98df195/`).

Defeitos reais que só o esquema real revelou (corrigidos):
1. Índices únicos reais por expressão/parciais (`culturas_nome_ci_uidx`, `microrganismos_codigo_uniq`) faziam o PRE
   abortar sempre. Agora o PRE pina o conjunto exato de unicidades não-PK e a migração antepõe o dono preservando
   expressão e predicado (UQ-1..4).
2. Policies de `product_fiscal_profiles` chamam `global_product_fiscal_read/write_ready` (Superadmin); fechar o global
   sem substituí-las deixava TODA leitura fiscal em `permission denied` (FIS-1).
3. RESTRICTIVE `d51_5_*_global_mutation_*` (Superadmin) em produtos/microrganismos e `catalog_volumes_sa_*` bloqueavam
   o CRUD por empresa e mantinham escrita global; agora toda policy com ramo Superadmin/global é removida e registrada,
   e as raízes sempre recebem escrita permissiva 'mutate' (SA-1, SA-2).
4. Candidatos NCM (`microorganism_ncm_candidates`) eram lidos por `fn_regulatory_can_read()` sem tenant; agora seguem o
   dossiê da empresa, com remapeamento do ciclo dossiê→candidato publicado (NCM-1..5).

Limites (em `real-schema-info.json`): 90/232 policies e 242/255 gatilhos não instalados porque o corpo das funções
auxiliares não foi capturado (fora das 129 funções do catálogo); 7 gatilhos instalados chamam funções ausentes
(`prefixo_para_*`, notificações) e foram removidos e declarados; stubs SINTÉTICOS: membership/papéis, `has_role`
público, `can_manage_catalog_tecnico`, `fn_regulatory_can_read`, guard de recebível, tabelas fiscais fora da captura e o
singleton `cf_user_guards_v1.state`. Defaults temporários só na semeadura (removidos antes dos testes).

## 4. Fiscal por empresa (5.2)
- Gatilho `global_product_fiscal_before_write` reescrito (mesmo nome/gatilho): dono = `owner_organization_id` do
  produto, ator 'mutate' do mesmo tenant, sem ramo Superadmin; status só DRAFT/BLOCKED; carimbo contábil imutável;
  histórico/identidade imutáveis; token CAS do servidor preservado.
- Writer `tenant_owned_product_fiscal_save` com o contrato já existente em `src/lib/fiscal/ownedProductFiscal.ts`
  (DEFINER, lock do produto, reautorização após lock, CAS, recibo idempotente privado, códigos 42501/PT409/22023).
- Leitura: produto do tenant E papel administrador/gestor/financeiro do mesmo tenant. Escrita direta de cliente fechada.
- Testes FIS-1..25 (incl. escritor DEFINER indireto na sessão autenticada: FIS-18..21c). Emissão/gate/flags intocados
  (FIS-25). Nenhuma aprovação fiscal fabricada; NCM nunca é inferido.

## 5. Auditoria das 48 DEFINER (5.1)
`definer-48-classificacao-v2.7.json` (por comportamento real):
| Classe | Qtde | Decisão |
|---|---|---|
| A — entrada é pai do tenant | 17 | Mantidas; catálogo só via FK repontada (POST de integridade) |
| B — id de catálogo direto | 10 | **Cercadas**: original vira núcleo privado; invólucro com mesma assinatura valida dono ('mutate'/'read_catalog') — FEN-0..15 (ex.: `update_product_b2b_description` gravava perfil de outra empresa) |
| Writer global de plataforma | 1 | Fechado (`platform_set_catalog_label_active`) |
| E — tenant/vendedor no corpo | 7 | Mantidas |
| C — gatilhos de linha | 6 | Mantidos; `proximo_codigo` global e `prefixo_para_*` não capturado |
| D — agregados/listas sem dono | 6 | **PENDENTE (NO_GO)**: reescrita de corpo |
| Auxiliar interno | 1 | Mantido |

## 6. NCM (5.5)
Taxonomia normativa (tabela NCM/fontes) pode ser referência compartilhada somente leitura — não há tabela normativa entre
as 59 capturadas. Cadastros e candidatos/dossiês/perfis da empresa (`microorganism_ncm_candidates`, dossiês,
apresentações, snapshots, perfis fiscais) são do tenant do microrganismo/produto e não vazam (NCM-4).

## 7. Testes de tela (repetidos)
- `src/test/catalogo` + `src/test/fiscal`: **2.856 PASS / 2 FAIL** — os 2 são os FAILs de binding de homologação já
  conhecidos e preservados (h7i, h7j).
- `src/test/pedidos` + `comercial` + `financeiro`: **1.327 PASS / 0 FAIL**.

## 8. Pendências que mantêm NO_GO
1. Classe D (6 funções agregadoras) sem filtro de dono — reescrita de corpo.
2. Telas com gravação direta que falharão fechadas após a migração (permissão negada) e precisam ir para RPC:
   `ProdutosTab`, `MicrorganismosTab`, `useProductFiscalProfiles` (→ `tenant_owned_product_fiscal_save`),
   `useProductProfile`/`useMicroorganismProfile` (upsert de perfis técnicos), seeds `seedCatalogoARBioV13`/
   `seedMicrorganismosARBio2026`, `composicaoSync`.
3. CRUD via RPC dedicada para microrganismos/culturas/formulações/volumes: hoje por RLS 'mutate' por empresa (testado),
   sem RPC com CAS/recibo.
4. `proximo_codigo`/`set_codigo_*`: geração de código global e dependência `prefixo_para_*` não capturada.
5. Prova JWT/RLS/navegador real (abaixo).

## 9. Caminho para prova JWT/navegador sem tocar produção
Ambiente: cópia de homologação `vrlcdwmlytukrjezrrnf` (binding exclusivo desta cópia; preview de produção não alterado).
Mínimo necessário, após aprovação do auditor: (1) restaurar lá o esquema/funções do catálogo equivalentes à captura;
(2) aplicar 02 → 00 → 01; (3) fixtures mínimas: AR Bio (gestor), FSF tenant (gestor + leitor), parceiro FSF dentro da
AR Bio, 1 produto/micro/cultura por empresa, 1 perfil fiscal DRAFT, 1 dossiê com candidato NCM; (4) contas Auth de
teste A/B; (5) cenários: CRUD próprio, leitura cruzada negada, Superadmin sem bypass, writer fiscal CAS/replay,
cercas FEN, B2B vendedor×tenant FSF. Contenção geral, automações, cobrança e emissão continuam desligadas.

## Integração da captura de enums/constraints (02/11/2026)
- Captura READ ONLY materializada em `docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/captura-constraints-enums-20261102/` (SHA-256 `aa64a310…caed8`); o harness aborta se o hash divergir.
- Enums: 58 tipos/316 rótulos reais em `enumsortorder` substituem a reconstrução por literais; nenhuma coluna USER-DEFINED cai para text (0 enums sem rótulos).
- PK/UNIQUE/EXCLUSION (59/19/1): criadas como CONSTRAINT pela definição capturada (todas validadas, não deferíveis), não mais como índices soltos.
- CHECK: 133/158 aplicadas. 25 recusadas: 22 porque a semente sintética viola a regra real (catálogo de visibilidade, volumes, regras de preço, NCM/dossiês, OS, composição) e 3 por dependerem de funções não capturadas (`fn_fiscal_official_url_allowlisted`, `fn_gtin_is_valid`, `fiscal_rtc_has_sensitive_key`).
- Resultado: 180 PASS/0 FAIL com tipos reais. Lacuna honesta: as 25 CHECKs ainda não estão ativas no harness; a próxima etapa é tornar as sementes conformes e obter o corpo dessas 3 funções. Sessão de manutenção confirmada: postgres/postgres, UTC, auth.uid NULL. NO_GO; nada hospedado alterado.

## Financeiro: associação produto fiscal ↔ microrganismo (decisão humana 02/11/2026)
- Decisão resolvida: preserva a permissão EXISTENTE do Financeiro só para associar produto fiscal a microrganismo, só na própria empresa; nenhum CRUD geral de catálogo.
- Autorização específica `platform_private.catalog_fiscal_association_actor()` (privada, sem EXECUTE de clientes): mesma identidade/tenant/feature canônicos (`catalog_tenant_actor('read_management')`: JWT, Superadmin negado, empresa ativa, `catalogo_precos`) + papel administrador/gestor/financeiro. Demais mutações continuam exigindo `mutate` (administrador/gestor).
- RPC: micro (FOR UPDATE) e produto (FOR SHARE) do mesmo tenant do ator; reautorização após as esperas; troca de tenant → 40001 `catalog_actor_changed`; revogação → 42501.
- PostgreSQL descartável com esquema real: 199 PASS/0 FAIL, incluindo FIN-1..17 (próprio permitido, desassociação, par misto/alheio/inexistente negados sem oráculo, cliente/SA/anon negados, Financeiro sem `mutate`/CRUD/escrita direta, revogação e troca de empresa durante espera real de lock em sessão concorrente negadas, controle positivo após restauração). WR-4 passou a esperar o novo código de recusa específico (continua recusa).
- Limite: papéis/h15/feature são stubs sintéticos; não é prova JWT/RLS hospedada. NO_GO até revisão independente.


# v2.11 (02/11/2026) — movido do relatório vigente

## 2. O que mudou nesta rodada (v2.11)
1. **Captura das 48 funções extras** (`captura-agregadoras-20261102/`, SHA-256 `c0ae497b…9fba`, verificada pelo harness):
   carregadas verbatim junto dos 300 helpers — 348 corpos, 0 falhas, 0 divergências de md5. A view
   `v_microorganism_fiscal_readiness` foi instalada pela definição real.
2. **`saas_subscription_status`**: o carregador das relações extras passou a usar primeiro os rótulos da captura de
   enums (6 rótulos, ordem real). `organization_subscriptions` agora é instalada com o tipo real, sem fallback para text;
   11 de suas 12 constraints (a FK para `saas_plans` continua sem alvo) e as 5 policies entraram.
3. **Achado novo (reproduzido e corrigido): três painéis B2B sem separação por empresa.**
   `rpc_b2b_executive_dashboard`, `rpc_b2b_carteira_kpis` e `rpc_b2b_revenue_forecast` somam pedidos, recebíveis e
   produtos de TODAS as empresas para qualquer administrador/gestor/financeiro. Com o EXECUTE aberto, o gestor da FSF
   recebeu produtos da AR Bio (RED: `run-v2.11-RED-exec-aberto-20261102/`, DEF-1 = 2 vazamentos). Em produção eles já
   estão sem EXECUTE de cliente (migração d51_5 de 05/10). Correção no pacote: o corpo LIVE é conferido por md5, o
   EXECUTE é revogado de PUBLIC/anon/authenticated (só estreita), a verificação é imediata e fica no ledger. O corpo não
   foi reescrito: não há decisão nem prova para um painel financeiro por empresa. GREEN: AGG-CLOSED ×3, DEF-1 = 0.
   Consequência conhecida: `useB2BFinanceiro` chama `rpc_b2b_revenue_forecast`, que já falha em produção hoje.
4. **Guarda de tenant provada em todas as tabelas-pai** (antes 9 de 16): fixtures sintéticas por transação, com pais
   reais da AR Bio, para `commercial_condition_item_prices`, `estoque_embalagens`, `ordens_servico`,
   `os_faturamento_base`, `produto_etiquetas`, `programacao_producao` e `registros_consultor_recomendacoes`.
   Para cada uma: escritor DEFINER da AR Bio recusado com produto alheio, contexto sem ator recusado e produto próprio
   aceito (AE-11/13/14; AE-12c confirma que não sobrou tabela sem prova).
5. **Execução positiva real dos deltas A/E** (antes só conferidos no texto): `rpc_criar_embalagens_pos_envase` e
   `rpc_gerar_etiqueta_produto` executam com sucesso para produto da própria empresa e recusam produto de outra
   empresa (AE-POS-1..4). Detalhe e stubs usados em `ae-positive-detail.json`.
6. **Ficha fiscal de produto só pelo gravador canônico.** `useSaveProductFiscalProfile` deixou de gravar direto na
   tabela e usa `tenant_owned_product_fiscal_save` (CAS por `updated_at`, motivo obrigatório de 10 a 500 caracteres,
   chave de idempotência por tentativa, reaproveitada só após resposta incerta, sem nova tentativa automática). Quem
   pode gravar: administrador/gestor da própria empresa; Superadmin não. A tela continua somente leitura enquanto a
   trava `OWNED_PRODUCT_FISCAL_ENABLED` estiver desligada. Com o único gravador migrado, o pacote revoga INSERT/UPDATE/
   DELETE de cliente em `product_fiscal_profiles` (FIS-REV, FIS-REV-b).


## 3. PostgreSQL descartável (esquema real) — `run-v2.11-20261102/`
**327 PASS / 3 FAIL.** Tipo de prova: `PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH`, ou seja, banco descartável com
esquema e corpos reais e autenticação sintética. Não é prova JWT/RLS hospedada.

- 59 tabelas da captura: 158/158 CHECKs ativas, 232/232 policies e 255/255 gatilhos instalados, 151 FKs, 320 índices.
- 68 relações extras: 294/302 constraints e 150/160 policies ativas. As 18 restantes estão em §6, cada uma com a causa.
- DEFINER (48 auditadas × 5 atores = 344 chamadas): 206 DENIED, 74 ERROR (regra de negócio com argumento neutro),
  29 OK_NOOP, 10 OK, **25 BLOCKED_DEP** (eram 83), **0 LEAK**.
- Agregadoras: `rpc_b2b_integrity_check` e `rpc_cc_validate_matrix` passam. `rpc_b2b_executive_dashboard` passa
  por estar fechada. As outras 3 estão bloqueadas por dependência (§6).
- Achados anteriores continuam corrigidos e retestados: simulação técnica (vendedor do parceiro), seleção/visibilidade
  por empresa, catálogo do parceiro, visita→OS, CRUD por RPC (CAS/idempotência/tenant), códigos por empresa com
  concorrência, Financeiro restrito à associação, fiscal DRAFT/BLOCKED, 7 pedidos bloqueados, flags fiscais desligadas.

O que é sintético, e está declarado no `real-schema-info.json`:
- membership/papéis, entitlements, `has_role`, `is_platform_superadmin`, `h15_actor_organization`;
- 116 tabelas montadas a partir dos tipos gerados (sem captura real);
- fixtures por transação com os demais gatilhos da tabela suspensos nominalmente;
- sequências `estoque_embalagem_seq` e `produto_etiqueta_seq`;
- uma linha de `etiqueta_templates`.
A extensão pgcrypto no schema `extensions` é ambiente real da plataforma.


## 6. Dependências ausentes — lista exata (nada inventado)
Cada item abaixo só fica completo quando chegar a captura READ ONLY real correspondente.
- **Colunas reais** (hoje vindas de tipos gerados desatualizados):
  - `customer_fiscal_profiles`: falta `nfe_readiness_status`. Bloqueia `fn_fiscal_scenario_coverage` (gestor AR Bio)
    e `rpc_fiscal_nfe_readiness_v1`.
  - `microorganism_regulatory_documents`: `valid_until` real como date. Bloqueia
    `rpc_microorganism_regulatory_overview`, via `fn_microorganism_regulatory_facts`.
  - `microorganism_regulatory_checklist`, `fiscal_tax_rules`, `etiqueta_templates`, `catalog_platform_admin_audit`.
  - `accounts_receivable.organization_id` e `accounts_payable`: necessários à policy
    `financial_audit_source_tenant_scope`.
- **Relação**: `platform_private.application_save_preparations`. Bloqueia `rpc_salvar_aplicacao_v1` e
  `platform_private.storage1_application_allowed`. Correção de registro: ela NÃO estava na captura das extras.
- **PK/UNIQUE de alvos de FK** (5 FKs):
  - `financial_cost_centers`, `recurring_financial_templates`, `comunicacao_regras`, `comunicacao_templates`,
    `bank_accounts`;
  - tabela `saas_plans`, alvo de 2 FKs: `organization_subscriptions_plan_id_fkey` e `saas_plan_versions_plan_id_fkey`.
- **Funções**:
  - `fn_fiscal_uf_ibge_code(text)`: CHECK `fop_ufs_domain`;
  - `platform_private.tenant_email_actor_org()`: 2 policies;
  - `platform_private.c2p1_rule_log_allowed(text,uuid,jsonb,jsonb)`;
  - `stock_p1_movement_owned(uuid,uuid)`;
  - `h15_fiscal_audit_access(text,uuid)`;
  - `platform_private.notification_p1_visible`, nas versões de 3 e de 4 argumentos;
  - `can_user_access_registro_consultor(uuid)`: 2 policies;
  - `private.assert_os_approval_scope`: 4 gatilhos de OS.
- **View**: `_src_vw_esteira_laboratorio`, fonte da matview `mv_esteira_laboratorio`.
- **Sequências**: `estoque_embalagem_seq` e `produto_etiqueta_seq`. Hoje são stubs nos testes positivos.


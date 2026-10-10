# Fase A — inventário e contrato agrícola implementável

Base: `eee9fcdfbb4ffcbf0dff7abfed0d0d550abac575`. Autorização: 10/10/2026 03:08 UTC. Deriva exclusivamente do plano vigente de 17 seções `catalogo-agricola-plano-implantacao.md`; não o substitui por um plano concorrente.

## 1. Resultado e evidência

**Fase A concluída no recorte local:** inspeção de código, SQL histórico, writers Edge, referências, contrato proposto e harness SQL de revisão. **Fase B NÃO aplicada / NO-GO para promoção automática.** Nenhuma leitura/escrita remota, DDL, grant aplicado, Auth, seed, frontend, publicação, dependência ou AGENTS alterado. Financeiro intocado. Não foram executados testes SQL/runtime/browser/JWT; inventário local não comprova implantação das Edges nem definições vivas.

**Banco relatado pelo Codex, não consultado pelo Lovable:** `produtos` tem 19 colunas, sem família/classificação/unidade genérica; `tipo public.tipo_produto NOT NULL`; `b2b_enabled NOT NULL DEFAULT true`. Triggers informados: `set_codigo_produto`, `sync_product_pricing`, `trg_mestre_guard_preco_canonico`, `update_updated_at_column`. Policy `d51_5_catalog_global_mutation` **RESTRICTIVE FOR ALL** exige `is_platform_superadmin(auth.uid())` inclusive SELECT. A mesma semântica aparece em `supabase/migrations/20261005200923_a9898565-995b-4066-a99b-e138442af842.sql:118–120`. Não alterar para SELECT permissivo ou dividir a cerca para viabilizar abas.

**Destino:** somente `swzpzcwiasxmjutrmvkm`, confirmado em `supabase/config.toml` nesta inspeção local. Config local não prova destino de ferramenta administrativa; nenhuma foi usada. Codex deve provar ref exato antes de qualquer execução futura. Sem Cloud/outros refs.

## 2. Cadastro global único — achado, não rota inventada

Busca literal em `src`/Edges não encontrou rota, arquivo ou RPC com nome **admin-catalogo**. Esse nome é tratado como designação funcional do cadastro global existente, **não endpoint a criar**.

Caminho real: `src/App.tsx:537` `/base-tecnica` → `RoleGuard` → `src/pages/Protocolos.tsx:495–524` → `?tab=produtos` → `src/components/protocolos/ProdutosTab.tsx`. `/protocolos` redireciona preservando query/hash; `/comercial/catalogo` aponta a `?tab=catalogo-tecnico` (App538/601). Mobile real: `/app/catalogo` (App446), não `/app/MobileCatalogoTecnico` sugerido em inventário secundário.

Writer real: `handleSave` (309–371) → **`saveProdutoComCompensacao` (104–179)** → client canônico em `produtos`/`formulacoes`. Não existe RPC upsert de catálogo global comprovada nesta busca. Reusar este caminho em C; não inventar `admin_catalog_save` ou tabela concorrente. RLS/trigger autoriza no servidor; RoleGuard/menu sozinho não basta.

**Fragilidades concretas:** compensação é best-effort, não transação; UPDATE sem `.select()` pode retornar zero linhas sem erro (149–150); INSERT lê primeiro ID sem guard (165–169); motivo/revisão ainda inexistentes; `resetForm` usa **tipo='solo'** (379), vedado para novos herbicidas/adubos; dose pode derivar de `totalVolume` (323). Corrigir somente em recorte posterior autorizado, sem declarar corrigido agora. Classificação B não deve ser incorporada no snapshot compensatório sem versão/CAS, pois rollback antigo poderia sobrescrever revisão concorrente.

## 3. Mapa de dependências verificadas

| Arquivo/função/tabela | Contrato observado | Efeito e delta mínimo futuro |
|---|---|---|
| ProdutosTab `carregarCatalogoProdutos`184–199 | produtos.select('*'), formulacoes, microrganismos com preço, product_technical_profiles | Carga inteira global só plataforma; não reutilizar payload para técnico. Paginador/projeção em C. |
| `src/lib/protocolos/autoCodigo.ts` e SQL `20260624025738_...:19–29,91–109` | prefixo_para_produto(tipo), set_codigo_produto() → proximo_codigo(prefixo,'produtos') | Sem prefixo para herbicida/adubo; código manual existente permite NULL tipo após B2; não renumerar legado. |
| SQL `20260619152712_...:77–132` sync_product_pricing | preço100mL↔L↔ha e dose_ml_ha | Unidade nova não condiciona trigger antigo; guard final recusa campos líquidos no sólido, revisão do motor separada. |
| `trg_mestre_guard_preco_canonico()` | Nome confirmado por Codex e REVOKE em `20260904130758_h7n_p1_trigger_execute.sql:28` | Corpo completo atual não encontrado nesta investigação; **UNVERIFIED**, obter definição antes de promover B. |
| `src/hooks/useCatalogoUnificado.ts:112–128` | oito consultas diretas; key ['catalogo-unificado',scope]; PRODUTOS_SELECT sem preço | SELECT produto pode ser negado/zero pelo RESTRICTIVE ALL para interno tenant; não fallback elevado. Fonte interna precisa prova atual. |
| `src/hooks/usePartnerCatalog.ts:61–69` | get_partner_catalog_secure(p_partner_id) | Fonte comercial autorizada, não fonte técnica universal. |
| `src/hooks/usePartnerCatalogTecnico.ts:7–73` | get_partner_catalog_tecnico_secure(); key global partner-catalog-tecnico; mapper financeiro | Comentário13–14 fala preços de tabela, mas SQL revisado devolve NULL ao técnico. Comentário não prova vazamento; null não deve virar 0/preço derivado. Fence identidade/cache precisa verificação posterior. |
| SQL `20261006191816_...:46–193` | duas RPCs acima; v_show_fin=false para técnico; chamadas de resolver condicionadas | Historicamente price-free técnico; guards usam b2b_actor_scope antigo org.partner. **NÃO reutilizar esse corpo literal**: contradiz contrato B2B owner A/partner P atual; obter última definição no servidor. |
| `src/hooks/useEffectiveCatalogSources.ts:23–44`/useCatalogSources | catalog_technical_sources por produto/ficha | Fonte classificação pertence ao MESMO produto/ficha; auditoria geral não é fonte agronômica. |
| `ProductTechnicalProfileDialog.tsx:115` | lê catalog_technical_audit_logs; product_technical_profiles | Não colocar preço/classificação duplicada no perfil; classificação vive no produto. |
| `src/pages/portal-parceiro/NovoPedido.tsx:57–105,217–238,290–305` | precoPrincipalFor, doseLitroHaFor; volumeMl/1000; L=10doses; unidades hectare/dose/litro/unidade | 'unidade' hoje significa volume comercial, não autorização para kg/saco. Novo sólido não pode entrar silenciosamente. |
| `src/hooks/useCreatePartnerOrder.ts:51–97` | create_partner_order_secure(p_partner_id,p_observacoes,p_items,p_requested_delivery_date,p_payment_plan_id,p_first_due_date,p_installment_count,p_expected_cart_hash,p_idempotency_key) | Reusar RPC, motor/hashes/receipts; payload preço-free entrada não prova autorização dimensão. Guard família/unidade no core existente em E. |
| `src/hooks/usePartnerSimulations.ts` | b2b_read_simulations e b2b_save_technical_simulation(p_simulation_id,p_partner_id,p_header,p_items) | Simulação técnica sem preço, não grava pedido; guard dimensão igualmente necessário. |
| `src/hooks/useCommercialConditions.ts:345` | rpc_cc_simulate_price | RPC real, não Edge; não unificar fontes técnico/comercial por sugestão genérica. |
| `src/lib/estoque/motorEstoque.ts:94–101` | rpc_estoque_operar_v1(p_acao,p_item_id,p_quantidade,p_idempotency_key,p_payload) | Unidade estoque/linhagem lote obrigatória; gate continua, não inferir tenant. |
| `catalogo_volumes`/useCatalogoVolumes | volume_ml/preçoL/dose100mL | Não armazenar kg em volume_ml. Nenhuma nova tabela de apresentações em B; extensão posterior da própria tabela após inventário. |
| `partner_order_items` | unit_type_snapshot, volume_ml_snapshot, preços históricos | Snapshots novos apenas itens futuros; não recalcular históricos por classificação. |
| `estoque_produto`, `lotes`, `envase`, `estoque_movimentacoes`, `entregas` | quantidade/volume_total/lote e produção | Produto comprado não recebe lote biológico falso; rastreabilidade e unidade homologadas antes E. |
| `src/hooks/useFiscalProdutosLite.ts`/useFiscalCatalog | product_fiscal_profiles; rpc_fiscal_catalog_search_v1 e resolve_v1 | NCM/CFOP/commercial_unit/taxable_unit não inferidos pela família. |

**Edge reais inspecionadas, não executadas:**
- `supabase/functions/admin-audit-produtos-orfaos/index.ts:9–32,50–80`: JWT getClaims → is_platform_superadmin → leitura elevada interna de referências; não cadastro, não usar como API de consulta tenant. Lista 23 referências incluindo `produtos_biologico_sugerido_id` canônico aqui chamado `registros_consultor_recomendacoes.produto_biologico_sugerido_id`.
- `supabase/functions/admin-wipe-produtos-catalog/index.ts:35–71`: claims e validação superadmin, confirmação/motivo/correlation, `platform_wipe_global_product_catalog(p_actor_id,p_reason,p_correlation_id)`. Somente wipe, nunca upsert; service_role presente no código não autoriza bypass nesta fase.
- `supabase/functions/hml-b2b-runtime-harness/index.ts` localizado como harness, não canal de cadastro. Não executado e não homologação das famílias.

## 4. Fonte canônica por perfil — sem ampliar leitura

| Perfil/superfície | Fonte a reutilizar | Condição de integração |
|---|---|---|
| Plataforma/cadastro global | ProdutosTab e SELECT direto sob is_platform_superadmin | Mantém RESTRICTIVE ALL; página/guard plataforma precisa confirmação JWT. |
| B2B comercial | get_partner_catalog_secure | Última definição deve provar actor/partner/client/tenant+feature e motor canônico; preservar ABI/preços. |
| B2B técnico | get_partner_catalog_tecnico_secure | Última definição, papel exclusivo, ficha aprovado/ativo/canal; colunas financeiras NULL (e nenhuma derivação local), nenhuma consulta de preço. |
| Interno técnico/consultor | useCatalogoUnificado tem projeção price-free mas SELECT direto cercado | **Bloqueio real de contrato:** não há fonte interna alternativa segura comprovada no inventário. Não mudar policy nem reutilizar RPC comercial/B2B para role inexistente; Codex deve identificar projeção/RPC atual antes de C/D. |
| Produtor/mobile | MobileCatalogoTecnico e caminhos autorizados existentes | Vínculo/entitlement/cache e payload só técnico ainda **UNVERIFIED HTTP**. Não criar fonte universal. |

Proposta de ABI sem nova RPC: preservar campos de cada fonte existente e adicionar metadados **sem preço** (familia_catalogo, classes_catalogo, finalidades_catalogo, unidade_comercial, conteudo_apresentacao, unidade_conteudo) na própria projeção autorizada. RETURNS TABLE exigirá plano de compatibilidade/consumidores/dependências antes de substituir função; não executar DROP agora. Não remover rows do legado por família NULL; classificacao_estado NULL = pendente na leitura, não classificação inferida. Técnicos nunca recebem motivo interno/autor/revisão financeira.

## 5. Contrato de classificação B revisável

Sem nova tabela de produtos, relacionamento ou catálogo paralelo. Reutilizar **public.produtos**, **product_technical_profiles**, **catalog_technical_sources**, **catalog_technical_audit_logs**. Arrays controlados armazenam associações pequenas e evitam JOIN duplicar SKU/saldo. Campos concretos propostos:

| Campo | Tipo/cardinalidade/semântica |
|---|---|
| familia_catalogo | text NULL legado; exatamente 1 família por produto classificado: biologico/quimico/fertilizante_adubo |
| classes_catalogo | text[] NULL legado, único vetor1D sem NULL/duplicados; 1..4 biológico,1..3 químico,0 fertilizante até taxonomia comprovada |
| finalidades_catalogo | text[] NULL legado; 0..N futuras finalidades controladas; **[] apenas em B inicial** porque não há vocabulário de finalidade inventariado/aprovado; não confundir modo_aplicacao livre com enum finalidade |
| classificacao_estado | text NULL legado → pendente lógico; classificado exige pendente/revisado |
| classificacao_motivo | text10..500, revisão explícita; valores regra candidatados, não regra já implantada |
| classificacao_fonte_id | uuid de catalog_technical_sources; entidade produto ou ficha_produto do mesmo produto; fonte não garante verdade por existência, revisão técnica necessária |
| classificacao_revisada_por/em | uuid/timestamptz servidor auth.uid()/now; nunca payload privilegiado |
| unidade_comercial | text L/mL/kg/g/un explícito; embalagem vendida por un é apresentação, não preço/L |
| conteudo_apresentacao | numeric(18,6) finito>0; quantidade de conteúdo por unidade/apresentação, não dose/receita |
| unidade_conteudo | L/mL/kg/g/un; contagem integral se un; precisão6 proposta, tolerância/arredondamento de preço separados |

Classes exatas: biológico `[biofungicida,bioinseticida,inoculante,solubilizador]`; químico `[herbicida,fungicida,inseticida]`. Dupla função é array com mais de um membro do vocabulário da mesma família, **um ID, um SKU, um saldo**. Não forçar classe única nem criar um produto por subaba. Fertilizante/adubo é família, [] classe por ora, sem taxonomia fabricada. Formas/formulações posteriores usam ficha/fonte existente, não microrganismo fictício.

Conversões apenas L↔mL fator1000 e kg↔g fator1000, precisão decimal. `un` com conteúdo kg/L documenta embalagem, mas **não autoriza conversão comercial** até resolver existente suportar apresentação; quantidade em un não vira volume_ml. Não novo campo de preço/dose genérica em B; todos os campos agrícolas líquidos permanecem legado e não são reinterpretados.

### Resolver tipo NOT NULL sem solo falso

É impossível inserir herbicida sem função representável mantendo NOT NULL do enum atual e sem inventar valor. Família separada sozinha não resolve. **Delta explícito B2 escolhido para revisão:** manter `tipo_produto` inalterado, remover NOT NULL físico de `produtos.tipo` e reinstalar obrigação condicional em trigger: produto sem classificação continua exigindo tipo; novo classificado com tipo NULL só com ativo=false/b2b_enabled=false, código manual não vazio/único e unidades válidas. Tipo NULL = não representável no enum legado, não 'solo'. Update classificatório não muda tipo/código legado. Não colocar famílias no enum nem acrescentar categoria genérica que altere significado de tipo.

`set_codigo_produto` histórico admite código manual (106–108); com tipo NULL e código automático ausente recusa por prefixo NULL. Logo **cadastro manual no mesmo formulário**, sem novo gerador/RPC. Promover B2 exige índice de unicidade codigo e corpo real do trigger comprovados; casos de corrida e conflito testados. Prefixos novos/automação de código ficam fora desse delta. Interface atual usa tipo='solo'/preçoL: **não pode cadastrar NULL até C corrigir campos condicionais e leitores nullable**. B1 opcional só instala metadados e mantém NOT NULL; B2 é alteração de compatibilidade claramente marcada, não vendida como apenas coluna aditiva.

## 6. Auditoria e guards do candidato

SQL proposto: `scripts/rbac-audit/proposed-catalog-classification.sql`, **fora de supabase/migrations**, termina **ROLLBACK**, nunca aplicado. Colunas nullable sem defaults/backfill; triggers internos (não RPC caller) `catalog_classification_guard_candidate()` e `catalog_classification_audit_candidate()` com search_path vazio, auth.uid e is_platform_superadmin, EXECUTE revogado de PUBLIC/anon/authenticated. Nenhuma tabela pública nova; portanto nenhum novo GRANT necessário. Não abre grants/RLS existentes.

Ledger escolhido: `catalog_technical_audit_logs(entidade_tipo,entidade_id,acao,dados_anteriores,dados_novos,usuario_id,created_at)`, action `classificacao_catalogo`, produto original, snapshots **apenas campos classificatórios sem preço**. Helper interno insere no ledger na mesma transação; falha audit aborta UPDATE. Não reusar `catalog_audit_log` genérico diretamente: esse captura linha inteira e poderia armazenar preços em ledger com leitores técnicos/tenant. Não duplicar tabela audit.

`catalog_platform_admin_audit` NÃO escolhido: SQL histórico `20261005210852_...:12` limita operation='wipe_global_products', status completed, correlation_id unique e counts, incompatível com revisão de produto. Não relaxar constraint para simular compatibilidade. Ledger técnico atual ACL/policies, validação de action e imutabilidade devem ser confirmados pelo Codex; políticas históricas de INSERT amplo não significam que hoje estejam abertas. Se origin/amendments não contidos, **B bloqueada**, não abrir grant para passar teste.

Guard candidato classificado exige ativo=false/b2b_enabled=false. Isto é **mais restritivo** e impede revisão em produto ativo nessa pequena B: não desativar legado automaticamente. Revisão de legados ativos exige recorte específico de preservação de canal/CAS após prova; manter pendentes por ora. Classificação não é homologação comercial. Nenhum novo produto sólido/calculado pode usar dose_ml_ha/preçoL/dose/ha, guard posterior ao sync; nome zz depende da ordem real BEFORE confirmada. Se outro trigger posterior criar preço, promoção bloqueada. Formulacoes/volumes/estoque ainda NÃO têm novos guards dimensionais: B não libera esses canais; E precisa guard dentro cores existentes, não apenas na UI.

## 7. Plano concreto de teste SQL com rollback (Codex, não executado)

Executar SOMENTE após autorização específica e ref exato comprovado, sem escolher usuário por acaso/service_role como caller. `BEGIN;` instalar candidato sem seu encerramento; SAVEPOINT por caso; `SET LOCAL ROLE authenticated` com claims de atores existentes + iat atual, actor/tenant server-derived; restaurar role entre setup/asserts; **ROLLBACK final** de DDL, dados e logs. Classificação usa produto inativo existente autorizado ou registro abstrato explicitamente autorizado; nada de produto/dose/recomendação inventados ou tocar fixture financeira. Contagem do produto/audit/pedidos/estoque antes/depois.

| ID | Assert concreta que pode falhar |
|---|---|
| A01 | NOT NULL físico removido somente B2; legacy INSERT tipo NULL sem família rejeitado, enum labels inalterados. |
| A02 | Insert químico/herbicida com tipo NULL/código manual único/pendente, ativo=false/b2b=false e kg passa; sem tipo='solo'. |
| A03 | biologico+classes biofungicida,bioinseticida no mesmo ID passa; consulta por qualquer classe devolve mesmo ID, estoque/saldo sem novo registro. |
| A04 | biologico+fungicida ou quimico+biofungicida rejeitados; fertilizante com classe não inventariada rejeitado. |
| A05 | classes NULL/multidimensional/null-member/duplicada ou vazia para biológico/químico rejeitadas; fertilizante [] passa. |
| A06 | finalidade arbitrária rejeitada; [] passa; nenhuma integração específica adiada. |
| A07 | unidade kg com conteúdo L rejeitada; L/mL e kg/g aceitas; un com conteúdo kg é apresentação e canal fica false. |
| A08 | conteúdo0/negativo/NaN/Infinity rejeitados; un fracionário rejeitado; limites numeric18,6 verificados sem arredondamento oculto acima da precisão contratada. |
| A09 | sólido com dose_ml_ha/valor_litro_brl/valor_dose_brl/valor_ha_brl rejeitado inclusive valor criado por sync. |
| A10 | classificado ativo=true ou b2b_enabled=true (inclui default omitido true) rejeitado, nenhum pedido/recebível/OS criado. |
| A11 | autoria/data forjadas substituídas pelo ator/tempo servidor; pendente tem revisão NULL. |
| A12 | fonte de outro produto/ficha rejeitada; revisado sem fonte rejeitado; fonte mesma entidade aceita após procedência revisada. |
| A13 | UPDATE classificação sem mudança não duplica audit; com mudança cria1 action/snapshot sem preço; falha audit aborta produto. |
| A14 | tentativa de apagar classificação previamente atribuída rejeitada; tipo/código legado não mudam durante revisão. |
| A15 | AdminAR/AdminFSF/FinanceiroAR/Consultor/B2B/Produtor não escrevem; superadmin ativo autorizado passa; forja claims de tenant não concede papel; RLS ALL preservada. |
| A16 | has_function_privilege anon/authenticated nas2helpers false; chamadas diretas sem trigger negadas. Sem novo GRANT/policy. |
| A17 | preflight verifica codigo unique e todos os triggers; dois códigos manuais iguais/concorrentes negados pela unicidade, snapshots antes/depois iguais após rollback. |
| A18 | SELECT direto tenant continua baseline restrito; RPC técnico mantém preços NULL; RPC comercial passa só ator elegível, não broaden por família. |
| A19 | fonte excluída após revisão não pode continuar promovendo conteúdo aprovado: definir imutabilidade/versionamento ou bloquear release em D; candidato não implanta fence de exclusão fonte. |
| A20 | rollback integral devolve coluna/schema/dados/policies/grants/histórico exatos ao baseline; no rollout real rollback é substitutivo, nunca DROP de classificação persistida. |

Concorrência real A17 requer duas sessões e alvo autorizado: rollback SQL de uma sessão não prova lock/CAS distribuído. A18/negações HTTP/JWT precisam login/browser separados, não inferir de claims. Projeções técnicas/AR/FSF e troca A→B→A/cache, testes do formulário, typechecks/lint/scanner/build futuros em C/D; testes SQL ainda NOT RUN.

## 8. Bloqueios, próxima mudança pequena e decisão

**B1 próxima proposta:** revisar colunas e ledger, manter policy ALL, preparar classificação inativa em produto existente com tipos já representáveis; sem consumidor público/pedido/preço novo. **B2 separada:** compatibilidade tipo NULL + código manual único + leitores/formulário nullable; sem desativar/renumerar históricos, sem ampliar enum. C/D só após descobrir source interna realmente autorizada, não redefinir RLS para ocultar lacuna.

Bloqueios para aplicação: definições atuais trigger de preço mestre/código, unicidade real de codigo, policies/ACL ledger técnico/imutabilidade, últimas RPCs com actor/partner corretos, fonte interna/produção/mobile e leitura das19colunas atuais. Corpo de RPC histórico usa org.partner e não prova modelo atual; não reaplicar. Não recomendar hook universal técnico/comercial, view nova readiness ou RPC paralelo sugeridos na investigação secundária: não necessários ao delta e poderiam ampliar acesso.

**PASS local documental/estrutural:** inventário com caminhos, contrato multiclasse, solução explícita para NOT NULL, candidato rollback e matriz de assertions entregues. **UNVERIFIED:** compilação/execução SQL, RLS runtime/JWT, Edge implantada, UI real, banco paridade e performance. **NO-GO:** aplicação B sem revisão/autorização, cadastro novo frontend, comercial/estoque/produção/entrega/fiscal novos e qualquer alteração Financeiro. Sementes/tratamento fora do contrato/SQL/testes específicos desta implantação.

# Fase A — inventário e contrato agrícola revisável

Base inicial: `eee9fcdfbb4ffcbf0dff7abfed0d0d550abac575`. Revisão Codex solicitada 10/10/2026 03:17 UTC a partir de `eebdab69ba03ee0eb30fab7ee26936fbde0b0ece`. Autorização: 10/10/2026 03:08 UTC. Deriva exclusivamente do plano vigente de 17 seções `catalogo-agricola-plano-implantacao.md`; não o substitui por um plano concorrente.

## 1. Resultado e evidência

**Fase A concluída no recorte local:** inspeção de código, SQL histórico, writers Edge, referências, contrato proposto e harness SQL de revisão. **Fase B NÃO aplicada / NO-GO para promoção automática.** Nenhuma leitura/escrita remota, DDL, grant aplicado, Auth, seed, frontend, publicação, dependência ou AGENTS alterado. Financeiro intocado. Não foram executados testes SQL/runtime/browser/JWT; inventário local não comprova implantação das Edges nem definições vivas.

**Banco relatado pelo Codex, não consultado pelo Lovable:** `produtos` tem 19 colunas, sem família/classificação/unidade genérica; `tipo public.tipo_produto NOT NULL`; `b2b_enabled NOT NULL DEFAULT true`. Triggers informados: `set_codigo_produto`, `sync_product_pricing`, `trg_mestre_guard_preco_canonico`, `update_updated_at_column`. Policy `d51_5_catalog_global_mutation` **RESTRICTIVE FOR ALL** exige `is_platform_superadmin(auth.uid())` inclusive SELECT. A mesma semântica aparece em `supabase/migrations/20261005200923_a9898565-995b-4066-a99b-e138442af842.sql:118–120`. Não alterar para SELECT permissivo ou dividir a cerca para viabilizar abas.

**Destino:** somente `swzpzcwiasxmjutrmvkm`, confirmado em `supabase/config.toml` nesta inspeção local. Config local não prova destino de ferramenta administrativa; nenhuma foi usada. Codex deve provar ref exato antes de qualquer execução futura. Sem Cloud/outros refs.

## 2. Cadastro global único — achado, não rota inventada

Busca literal em `src`/Edges não encontrou rota, arquivo ou RPC com nome **admin-catalogo**. **Não existe endpoint admin-catalogo**; não usar esse nome como cadastro/RPC real.

Caminho real: `src/App.tsx:537` `/base-tecnica` → `RoleGuard` → `src/pages/Protocolos.tsx:495–524` → `?tab=produtos` → `src/components/protocolos/ProdutosTab.tsx`. `/protocolos` redireciona preservando query/hash; `/comercial/catalogo` aponta a `?tab=catalogo-tecnico` (App538/601). Mobile real: `/app/catalogo` (App446), não `/app/MobileCatalogoTecnico` sugerido em inventário secundário.

Writer real: `handleSave` (309–371) → **`saveProdutoComCompensacao` (104–179)** → client canônico em `produtos`/`formulacoes`. Não existe RPC upsert de catálogo global comprovada nesta busca. Reusar este caminho em C; não inventar `admin_catalog_save` ou tabela concorrente. RLS/trigger autoriza no servidor; RoleGuard/menu sozinho não basta.

**Fragilidades concretas:** compensação é best-effort, não transação; UPDATE sem `.select()` pode retornar zero linhas sem erro (149–150); INSERT lê primeiro ID sem guard (165–169); motivo/revisão ainda inexistentes; `resetForm` usa **tipo='solo'** (379), vedado para novos herbicidas/adubos; dose pode derivar de `totalVolume` (323). Corrigir somente em recorte posterior autorizado, sem declarar corrigido agora. Classificação B não deve ser incorporada no snapshot compensatório sem versão/CAS, pois rollback antigo poderia sobrescrever revisão concorrente.

## 3. Mapa de dependências verificadas

| Arquivo/função/tabela | Contrato observado | Efeito e delta mínimo futuro |
|---|---|---|
| ProdutosTab `carregarCatalogoProdutos`184–199 | produtos.select('*'), formulacoes, microrganismos com preço, product_technical_profiles | Carga inteira global só plataforma; não reutilizar payload para técnico. Paginador/projeção em C. |
| `src/lib/protocolos/autoCodigo.ts` e SQL `20260624025738_...:19–29,91–109` | prefixo_para_produto(tipo), set_codigo_produto() → proximo_codigo(prefixo,'produtos') | Sem prefixo para herbicida/adubo; hipótese código manual/NULL depende de B2 e auditoria integral, não cadastro seguro comprovado; não renumerar legado. |
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

Proposta de ABI sem nova RPC: preservar campos de cada fonte existente e adicionar metadados **sem preço** (familia_catalogo, classes_catalogo, unidade_comercial, conteudo_apresentacao, unidade_conteudo) na própria projeção autorizada. RETURNS TABLE exigirá plano de compatibilidade/consumidores/dependências antes de substituir função; não executar DROP agora. Não remover rows do legado por família NULL; classificacao_estado NULL = pendente na leitura, não classificação inferida. Técnicos nunca recebem motivo interno/autor/revisão financeira.

## 5. Contrato de classificação B revisável

Sem nova tabela de produtos, relacionamento ou catálogo paralelo. Reutilizar **public.produtos**, **product_technical_profiles**, **catalog_technical_sources**, **catalog_technical_audit_logs**. Arrays controlados armazenam associações pequenas e evitam JOIN duplicar SKU/saldo. Campos concretos propostos:

| Campo | Tipo/cardinalidade/semântica |
|---|---|
| familia_catalogo | text NULL legado; exatamente 1 família por produto classificado: biologico/quimico/fertilizante_adubo |
| classes_catalogo | text[] NULL legado, único vetor1D sem NULL/duplicados; 1..4 biológico,1..3 químico,0 fertilizante até taxonomia comprovada |
| classificacao_estado | text NULL legado → pendente lógico; classificado exige pendente/revisado |
| classificacao_motivo | text10..500, revisão explícita; valores regra candidatados, não regra já implantada |
| classificacao_fonte_id | uuid de catalog_technical_sources; entidade produto ou ficha_produto do mesmo produto; fonte não garante verdade por existência, revisão técnica necessária |
| classificacao_revisada_por/em | uuid/timestamptz servidor auth.uid()/now; nunca payload privilegiado |
| unidade_comercial | text L/mL/kg/g/un explícito; embalagem vendida por un é apresentação, não preço/L |
| conteudo_apresentacao | numeric(18,6) finito>0; quantidade de conteúdo por unidade/apresentação, não dose/receita |
| unidade_conteudo | L/mL/kg/g/un; contagem integral se un; escala de armazenamento 6: numeric(18,6) arredonda antes do trigger; não rejeita entrada >6 casas. Rejeição estrita exigiria numeric sem typmod + scale validado ou payload textual/numérico validado antes do cast, em revisão separada |

Classes exatas: biológico `[biofungicida,bioinseticida,inoculante,solubilizador]`; químico `[herbicida,fungicida,inseticida]`. Dupla função é array com mais de um membro do vocabulário da mesma família, **um ID, um SKU, um saldo**. Não forçar classe única nem criar um produto por subaba. Fertilizante/adubo é família, [] classe por ora, sem taxonomia fabricada. Formas/formulações posteriores usam ficha/fonte existente, não microrganismo fictício.

Conversões apenas L↔mL fator1000 e kg↔g fator1000, precisão decimal. `un` com conteúdo kg/L documenta embalagem, mas **não autoriza conversão comercial** até resolver existente suportar apresentação; quantidade em un não vira volume_ml. Não novo campo de preço/dose genérica em B; todos os campos agrícolas líquidos permanecem legado e não são reinterpretados.

### Resolver tipo NOT NULL sem solo falso

É impossível inserir produto sem função representável mantendo NOT NULL e sem inventar tipo. **B1** mantém NOT NULL e valores/enum legados; só classifica produtos com tipo semanticamente fiel, sem solo falso. **B2** está fisicamente em `scripts/rbac-audit/proposed-catalog-classification-b2-not-executable.sql`: BEGIN/ROLLBACK e DDL apenas comentado, **não executável/não promovido**. Remover NOT NULL é alternativa futura condicionada a guard legado e auditoria integral; nenhuma aprovação implícita.

Consumidores nullable pendentes: `ProdutosTab.tsx` (resetForm solo, writer/snapshot compensatório, formulacoes/volume), `src/lib/protocolos/autoCodigo.ts` e `set_codigo_produto` (prefixo/code unique/corrida), `src/hooks/useCatalogoUnificado.ts` (tipo/subtítulo/filtros), `src/lib/pdf/fichaTecnicaProdutoPdf.ts` (tipo exibido), `usePartnerCatalog.ts`, `usePartnerCatalogTecnico.ts` e RPCs/RETURNS TABLE, catálogo técnico/mobile e mapas de rótulos, tipos canônicos gerados `cultivofarm.types.ts`. Inventário não integral: todos devem tratar NULL como não representável, nunca solo/0. Não editar tipos gerenciados nesta fase. Migração histórica de e_insumo por tipo não deve ser reaplicada como classificação. Código manual histórico não é prova suficiente de cadastro NULL seguro; trigger/unique/consumidores vivos ainda UNVERIFIED.

## 6. Auditoria e guards do candidato

SQL proposto: `scripts/rbac-audit/proposed-catalog-classification.sql`, **fora de supabase/migrations**, termina **ROLLBACK**, nunca aplicado. Colunas nullable sem defaults/backfill; triggers internos (não RPC caller) `catalog_classification_guard_candidate()` e `catalog_classification_audit_candidate()` com search_path vazio, auth.uid, has_role(auth.uid(),superadmin) e is_platform_superadmin, EXECUTE revogado de PUBLIC/anon/authenticated. Nenhuma tabela pública nova; portanto nenhum novo GRANT necessário. Não abre grants/RLS existentes.

Ledger escolhido: `catalog_technical_audit_logs(entidade_tipo,entidade_id,acao,dados_anteriores,dados_novos,usuario_id,created_at)`, action `classificacao_catalogo`, produto original, snapshots **apenas campos classificatórios sem preço**. Helper interno insere no ledger na mesma transação; falha audit aborta UPDATE. Não reusar `catalog_audit_log` genérico diretamente: esse captura linha inteira e poderia armazenar preços em ledger com leitores técnicos/tenant. Não duplicar tabela audit.

`catalog_platform_admin_audit` NÃO escolhido: SQL histórico `20261005210852_...:12` limita operation='wipe_global_products', status completed, correlation_id unique e counts, incompatível com revisão de produto. Não relaxar constraint para simular compatibilidade. P1 de INSERT amplo confirmado EXTERNAMENTE e já contido pelo Codex (delta abaixo). Não reabrir ACL para passar teste; SELECT preservado não certifica escopo de leitores nem imutabilidade contra owner. Action/trigger owner/ACL atuais continuam gate B.

**Ator ativo:** `is_platform_superadmin` isolado não verifica atividade. B1 combina `auth.uid()`, `public.has_role(auth.uid(),'superadmin'::public.app_role) IS TRUE` e `is_platform_superadmin IS TRUE`, sem fallback. SQL local `20261007155703_7e6f0323-4d33-488f-8cdd-e091c104108d.sql:19–38` mostra has_role → platform_private.has_role → profiles.ativo/readiness/senha/fencing; definição/ACL viva precisam comprovação. Helper dedicado superadmin em `20260922160736_29af83f9-2f0d-4770-91d4-264de788ccc5.sql:11–28` intencionalmente ignora ativo.

**Preservação do legado:** UPDATE classificatório mantém ativo/b2b_enabled originais, inclusive true, sem exigir desativar produto. INSERT classificado exige ambos false explícitos (default b2b true falha fechado). Não libera nova família/unidade em canal; compatibilidade de família/unidade com canal ativo precisa prova antes da classificação, ainda sem resolver instalado. Guard não homologa motores. Autoria/data são calculadas só na alteração de família/classes/estado/motivo/fonte/unidades/conteúdo; mudança de nome/preço/updated_at preserva revisão e não gera log classificatório. Payload forjado é substituído/restaurado pelo servidor.

**Fonte vinculada/exclusão:** proposta usa `classificacao_fonte_id` → `catalog_technical_sources.id` com produto direto ou ficha do mesmo produto. Fonte polimórfica não tem FK física para alvo no SQL histórico; ficha tem produto_id ON DELETE CASCADE. Fonte existente não prova validade/procedência. Com 0 fichas/0 fontes no inventário externo, revisado não pode ser fabricado; pendente admite fonte NULL. Antes de B: confirmar enum/colunas atuais; decidir FK da classificação→fonte ON DELETE RESTRICT e bloquear revínculo/deleção/alteração relevante da fonte/ficha revisada, ou versionar snapshot e invalidar revisão via fluxo autorizado/auditado. Candidato só verifica vínculo no write de produto; **não implementa fence de DELETE/revínculo**, nem CAS/release; promoção bloqueada. Não usar SET NULL/cascade para apagar evidência silenciosamente. Legado/snapshots preservados.

Sólidos com dose/preço líquido continuam rejeitados; não limpar valores históricos para passar. Ordem real sync/preço/guard e formulacoes/volumes/estoque ainda pendentes. Precisão: numeric(18,6) arredonda antes do trigger; 1.1234567 pode virar 1.123457, e un fracionário próximo de inteiro pode arredondar. Não prometer rejeição da entrada original; contrato atual valida valor armazenado. Rejeição estrita antes de cast é decisão pendente.

### Delta externo P1 — contenção já aplicada, não reaplicada
Codex relatou no canônico `swzpzcwiasxmjutrmvkm`: Consultor conseguia INSERT em `catalog_technical_audit_logs` com usuario_id de Admin. Migration **20261010031113 catalog_technical_audit_server_writes_only JÁ APLICADA**. SQL exato arquivado, não executado aqui, em `scripts/rbac-audit/applied-20261010031113-catalog-technical-audit-server-writes-only.sql`. Revoga INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER de PUBLIC/anon/authenticated; não remove histórico, preserva SELECT. Não adicionar BEGIN/ROLLBACK ao arquivo literal aplicado.

**Teste SQL externo transacional com claims reais:** AdminAR, AdminFSF, ConsultorAR e Superadmin: 4 INSERT diretos negados; produtor servidor via trigger de ficha continuou gerando log. Positivo owner/servidor, **não sessão UI/HTTP**. Primeiro positivo falhou por ausência de ficha; segundo usou rascunho vazio transacional. Tudo rollback; 0 fichas/0 logs de teste depois. Não inferir login/Auth HTTP. Inventário externo: **9 produtos, 26 FKs, 19 colunas, 0 fichas, 0 fontes**. Não consulta própria.

Advisors externos: **15 INFO RLS sem política; 2 WARN definer anon; 366 WARN definer authenticated; 1 WARN proteção senha**. Não PASS global; cada ocorrência exige triagem própria sem ampliar este job. Contenção P1 não certifica origem de todos os logs, SELECT, writers ou catálogo.

## 7. Plano concreto de teste SQL com rollback (Codex, não executado)

Executar SOMENTE após autorização específica e ref exato comprovado, sem escolher usuário por acaso/service_role como caller. `BEGIN;` testar B1 somente; não executar nem descomentar B2; instalar candidato sem seu encerramento; SAVEPOINT por caso; `SET LOCAL ROLE authenticated` com claims de atores existentes + iat atual, actor/tenant server-derived; restaurar role entre setup/asserts; **ROLLBACK final** de DDL, dados e logs. Classificação usa produto existente explicitamente autorizado, preservando ativo/canais ou registro abstrato explicitamente autorizado; nada de produto/dose/recomendação inventados ou tocar fixture financeira. Contagem do produto/audit/pedidos/estoque antes/depois.

| ID | Assert concreta que pode falhar |
|---|---|
| A01 | B1 preserva NOT NULL físico/enum/9 legados; INSERT tipo NULL rejeitado. B2 não executado. |
| A02 | B1 não permite novo produto sem tipo fiel; nenhuma inserção com solo falso. Cenário NULL aguarda B2 autorizado. |
| A03 | biologico+classes biofungicida,bioinseticida no mesmo ID passa; consulta por qualquer classe devolve mesmo ID, estoque/saldo sem novo registro. |
| A04 | biologico+fungicida ou quimico+biofungicida rejeitados; fertilizante com classe não inventariada rejeitado. |
| A05 | classes NULL/multidimensional/null-member/duplicada ou vazia para biológico/químico rejeitadas; fertilizante [] passa. |
| A06 | B1 não cria coluna finalidade; nenhuma finalidade/taxonomia futura exigida. |
| A07 | unidade kg com conteúdo L rejeitada; L/mL e kg/g aceitas; un com conteúdo kg é apresentação e canal fica false. |
| A08 | conteúdo armazenado0/negativo/NaN/Infinity rejeitados; un armazenado fracionário rejeitado; limites numeric18,6 e arredondamento pré-trigger explicitamente observados, sem promessa de rejeição >6 casas ou da fração original arredondada. |
| A09 | sólido com dose_ml_ha/valor_litro_brl/valor_dose_brl/valor_ha_brl rejeitado inclusive valor criado por sync. |
| A10 | UPDATE legado ativo/b2b true preserva flags e classifica sem desativação; alteração de flags rejeitada. INSERT true/default true rejeitado; nenhum pedido/recebível/OS criado. |
| A11 | revisão mudada usa ator/tempo servidor; alteração só nome/preço/updated_at mantém autoria/data e não gera audit; payload forjado restaurado; pendente revisão NULL. |
| A12 | fonte de outro produto/ficha rejeitada; revisado sem fonte rejeitado; fonte mesma entidade aceita após procedência revisada. |
| A13 | UPDATE classificação sem mudança não duplica audit; com mudança cria1 action/snapshot sem preço; falha audit aborta produto. |
| A14 | tentativa de apagar classificação previamente atribuída rejeitada; tipo/código legado não mudam durante revisão. |
| A15 | AdminAR/AdminFSF/FinanceiroAR/Consultor/B2B/Produtor não escrevem; superadmin ativo/ready autorizado passa, inativo/provisório/JWT anterior ao fence negados; forja claims de tenant não concede papel; RLS ALL preservada. |
| A16 | has_function_privilege anon/authenticated nas2helpers false; chamadas diretas sem trigger negadas. Sem novo GRANT/policy. |
| A17 | preflight verifica codigo unique e todos os triggers; dois códigos manuais iguais/concorrentes negados pela unicidade, snapshots antes/depois iguais após rollback. |
| A18 | SELECT direto tenant continua baseline restrito; RPC técnico mantém preços NULL; RPC comercial passa só ator elegível, não broaden por família. |
| A19 | fonte excluída após revisão não pode continuar promovendo conteúdo aprovado: definir imutabilidade/versionamento ou bloquear release em D; candidato não implanta fence de exclusão fonte. |
| A20 | rollback B1 devolve schema/dados ao baseline JÁ CONTIDO 20261010031113; quatro INSERT diretos continuam negados, SELECT preservado, sem restaurar escrita livre; no rollout real rollback é substitutivo, nunca DROP de classificação persistida. |

Concorrência real A17 requer duas sessões e alvo autorizado: rollback SQL de uma sessão não prova lock/CAS distribuído. A18/negações HTTP/JWT precisam login/browser separados, não inferir de claims. Projeções técnicas/AR/FSF e troca A→B→A/cache, testes do formulário, typechecks/lint/scanner/build futuros em C/D; testes SQL ainda NOT RUN.

## 8. Bloqueios, próxima mudança pequena e decisão

**B1 próxima proposta:** revisar colunas e ledger, manter policy ALL, classificar legado com tipo fiel e flags preservadas; sem desativação obrigatória; sem consumidor público/pedido/preço novo. **B2 separada NÃO EXECUTÁVEL/NÃO PROMOVIDA:** alternativa tipo NULL + código manual único + leitores/formulário nullable; sem desativar/renumerar históricos, sem ampliar enum. C/D só após descobrir source interna realmente autorizada, não redefinir RLS para ocultar lacuna.

Bloqueios para aplicação: definições atuais trigger de preço mestre/código, unicidade real de codigo, paridade pós-contenção/owner/imutabilidade do ledger técnico, fence fonte/exclusão e readiness do ator, últimas RPCs com actor/partner corretos, fonte interna/produção/mobile e leitura das19colunas atuais. Corpo de RPC histórico usa org.partner e não prova modelo atual; não reaplicar. Não recomendar hook universal técnico/comercial, view nova readiness ou RPC paralelo sugeridos na investigação secundária: não necessários ao delta e poderiam ampliar acesso.

**PASS local documental/estrutural:** inventário com caminhos, contrato multiclasse, separação B1 NOT NULL/B2 alternativa bloqueada, candidato rollback e matriz de assertions entregues. **UNVERIFIED:** compilação/execução SQL, RLS runtime/JWT, Edge implantada, UI real, banco paridade e performance. **NO-GO:** aplicação B sem revisão/autorização, cadastro novo frontend, comercial/estoque/produção/entrega/fiscal novos e qualquer alteração Financeiro. Sementes/tratamento fora do contrato/SQL/testes específicos desta implantação.

### Classificação de riscos da revisão
- **P1 externo contido:** forja de INSERT direto audit; não reabrir grants, preservar SQL aplicado/histórico.
- **P1 potencial de promoção:** ator inativo, fonte removida/revinculada, abertura de canais incompatíveis/preços; candidatos não promovidos até provas.
- **Compatibilidade alta/B2 NO-GO:** nullable, prefixos/unique/CAS, ABI/tipos e consumidores ainda sem auditoria integral.
- **Integridade média:** precisão pré-cast e autoria incidental corrigida no desenho, execução SQL NOT RUN.
- **Rollback seguro:** testes futuros partem do baseline pós-contenção; ROLLBACK não desfaz migration externa já aplicada. Em implantação real, desativar exposição nova/usar forward-fix, não DROP de histórico, não GRANT de escrita livre, não SET NOT NULL com NULL existentes.

## 9. Recorte focal de salvamento — 10/10/2026 03:24 UTC
Base `f224d01b5de0b40b82755ae4973dcf2ef6aa66b3`. Autorizado somente ProdutosTab/saveProdutoComCompensacao, testes e documentação; B1/B2 intactos/não aplicados. Sem banco remoto, grants/RLS, endpoint, dependências ou publicação.

UPDATE/compensação de produto pedem projeção mínima id, exatamente uma linha e ID esperado; falha de confirmação do primeiro UPDATE interrompe antes de build/DELETE/INSERT composição, mensagem segura. INSERT produto pede id apenas, uma linha/ID não vazio (igual ao payload.id se presente); sem alvo confiável retorna critical e não tenta compensação por ID inferido.

Composição: snapshot inclui id/produto_id; DELETE confere cardinalidade, IDs únicos e conjunto exato do snapshot (zero legítimo só com snapshot vazio). INSERT confere número esperado, IDs únicos/não vazios e produto_id correto. Compensação lê IDs atuais, confirma DELETE e reinsere IDs anteriores, confirma conjunto exato; resultado inconclusivo/exceção vira critical e não reporta sucesso. UPDATE compensatório não confirmado impede nova alteração da composição. Produto novo com composição não confirmada tenta DELETE produto com id exato; FK histórica formulacoes.produto_id ON DELETE CASCADE em 20260314022647:198–200, paridade remota não verificada.

**Não é atomicidade:** chamadas independentes, compensação best-effort, sem CAS/lock distribuído. SELECT pode omitir linhas por RLS; contagens/IDs retornados não provam escrita invisível nem valores restaurados apesar de triggers, nem estado estável entre chamadas. Falha/rede após INSERT sem ID é inconclusiva e critical. Snapshots/compensação não certificam concorrência ou auditoria global. Próxima transição canônica precisa writer autorizado no servidor, proteção de versão e revisão dos triggers sem abrir acesso.

**Evidência externa atual, não consulta própria:** public.has_role delega platform_private.has_role, exigindo profiles.ativo + platform_actor_access_ready; is_platform_superadmin isolado só user_roles. Produtos possui SELECT permissivos e ALL restritivo, **nenhuma policy permissiva de escrita**: writer runtime NÃO COMPROVADO e grants/RLS não serão ampliados para resolver. Fonte técnica polimórfica sem FK de entidade; ficha produto ON DELETE CASCADE.

**Pendência do guard B1 proposto:** a trava de alteração ativo/b2b_enabled roda em qualquer UPDATE de produto já classificado, inclusive quando a alteração não é classificatória; pode bloquear transições legítimas futuras de canal. Não corrigido/aplicado neste recorte. Separar classificação e transição canônica autorizada em desenho futuro; não desativar legados nem liberar canal como contorno.

**Validação própria focal:** Vitest comportamental mockado, sem HTTP/JWT/banco. Lint normal tem erros legados no-explicit-any (baseline 41 erros nos dois arquivos, atual 42), não PASS estrito; execução com essa única regra desligada via linha de comando tem 0 erros e 2 avisos legacy Fast Refresh. Não alterar configuração/dependências nem mascarar baseline. Typechecks app/node manuais NOT RUN: ambiente exige validação automática e proíbe executá-los manualmente; não declarar PASS separado. Vitest25/25 PASS; build automático03:27:10UTC OK; scanner de padrões focal5arquivos0achados e diff-check PASS. Não auditoria global nem HTTP.

# FASE H3 — Base Técnica, Dados Mestres e Catálogo

- Projeto: AR Bio Manager
- Data da auditoria: 2026-08-18
- Ambiente auditado/corrigido: staging `ikaauvsflpmamgxmkhoq` (exclusivo)
- Produção `navfzbwgwzruipouyfnk`: **não tocada**, nenhum comando executado
- Entrada: H2 — APROVADA COM RESSALVAS, sem P0/P1 aberto
- Observação de convenção: nomes de migration `202609xx` são convenção do repositório (pendência H1-015), não datas reais

## 1. Arquitetura real e fonte canônica

| Domínio | Fonte canônica (staging) | Duplicidade? |
|---|---|---|
| Produtos | `public.produtos` | Não |
| Microrganismos | `public.microrganismos` | Não |
| Culturas | `public.culturas` | Não |
| Alvos/problemas | `catalogo_alvos`, `catalogo_problemas`, `microorganism_targets`, `product_target_recommendations` | Não (N:N normalizado preservado) |
| Composição produto×microrganismo | `formulacoes` (unique `produto_id, microrganismo_id`) | Não |
| Fichas técnicas | `product_technical_profiles`, `microorganism_technical_profiles`, versões em `ficha_tecnica_versoes` | Não |
| Fontes técnicas | `catalog_technical_sources` | Não |
| Volumes/embalagens e preço comercial | `catalogo_volumes` (+ derivados) | Não |
| Preço B2B/condições | `partner_product_prices`, `commercial_price_rules`, `commercial_condition_item_prices` | Não |
| Agregação de tela | hook `useCatalogoUnificado` (leitura, sem persistência) | Não cria fonte paralela |

Nenhuma fonte nova foi criada. As duas views adicionadas nesta fase são **projeções de colunas seguras** sobre as tabelas canônicas, não novas fontes de verdade.

## 2. Rotas e descobribilidade

- Rota canônica única: `/base-tecnica?tab=catalogo-tecnico` (item de menu "Catálogo Técnico" dentro de "Catálogo AR Bio").
- Legado: `/comercial/catalogo` → `PreservedNavigate` para a aba canônica (sem loop/404); `legacyRoutes: ["/protocolos", "/comercial/catalogo"]` mantém realce de menu e busca.
- `src/lib/permissions.ts` mantém a rota legada mapeada, preservando bookmarks de administrador/gestor/gestor_comercial.
- Mobile: `MobileCatalogoTecnico` continua como superfície do app técnico; nenhuma segunda tela de catálogo desktop foi reintroduzida.

## 3. Modelo de dados e relacionamentos

- FKs e uniqueness verificadas: `microrganismos.nome` único, `produtos.codigo`/`microrganismos.codigo` únicos, `formulacoes` com unique composta, `catalog_technical_sources` com `source_key` único.
- Duplicidade textual por nome normalizado: **0** em `produtos`, `microrganismos` e `culturas`.
- `catalogo_volumes` referencia `produto_id`/`microrganismo_id` (item canônico), com `item_tipo` NOT NULL.
- Ciclo de vida: `ativo` (produtos, microrganismos, culturas, alvos, volumes) + `status_validacao` das fichas (`rascunho/em_revisao/aprovado`) + versões históricas em `ficha_tecnica_versoes`. Soft-delete/inativação é o padrão vigente; nenhum hard delete foi introduzido. Histórico comercial permanece legível por snapshots em `partner_order_items` / `partner_simulation_items`.

## 4. Regras de dose/unidade/preço

- `DOSE_PADRAO_ML = 100`, `DOSES_POR_LITRO = 10` em `src/lib/catalogo/pricing.ts` (fonte única no frontend).
- No banco, `catalogo_volumes` deriva `preco_litro_brl`, `valor_dose_100ml_brl` e `doses_por_volume` via trigger `sync_catalogo_volumes_calc` — cálculo crítico **não depende do browser**.
- Achado corrigido nesta fase: o trigger não arredondava, gerando valores como `216.6660000000000000` (2 linhas ativas de 5 L e 20 L). Agora arredonda a 2 casas (moeda) e 4 casas (doses), com backfill de 64 linhas.
- Carrinho/simulador/pedido consomem os mesmos campos derivados e gravam snapshots (`preco_tabela_snapshot`, `preco_unitario_final_snapshot`, `volume_ml_snapshot`). Contrato validado nesta H3; aprovação/condições completas ficam para H4.

## 5. Matriz de visibilidade por papel (após correção)

| Dado | interno (admin/gestor/técnico/comercial/produção) | parceiro_b2b(_tecnico) | cliente_produtor | anon |
|---|---|---|---|---|
| `produtos` / `microrganismos` (todas as colunas, inclui `fornecedor`, `meio_cultivo`, `observacoes`, `preco_tabela`) | leitura | leitura via policies B2B próprias | **negado** | negado |
| `vw_catalogo_ficha_produtos` / `vw_catalogo_ficha_microrganismos` (colunas seguras) | leitura | leitura | leitura | negado |
| Fichas técnicas | leitura completa | somente `aprovado` | somente `aprovado` | negado |
| `catalogo_volumes` | gestão admin/gestor | leitura conforme portal | somente ativos com ficha aprovada | negado |
| `partner_product_prices`, `commercial_price_rules`, `commercial_condition_item_prices` | admin/gestor_comercial/financeiro | apenas o próprio `partner_id` (prices) | negado | negado |

## 6. Fichas/arquivos/storage

- Buckets confirmados na H2 permanecem: `visit-pdfs` e `visitas-pdf` privados; `logos` é o único público. Nenhum material técnico não publicado em bucket público.
- Fichas técnicas do catálogo são conteúdo relacional (perfis + versões), não arquivos públicos; PDFs são gerados sob demanda no cliente a partir de dados já autorizados.

## 7. Achados e correções

| ID | Sev. | Achado | Status |
|---|---|---|---|
| H3-001 | P1 | `sync_catalogo_volumes_calc` sem arredondamento monetário determinístico (preço/litro e preço/dose com dízimas persistidas) | **Corrigido** (trigger + backfill 64 linhas) |
| H3-002 | P1 | `produtos` e `microrganismos` com SELECT `USING(true)` para todo `authenticated`, expondo `fornecedor`, `meio_cultivo`, `observacoes` e `preco_tabela` a `cliente_produtor` | **Corrigido** (policies por papel interno + views de ficha com colunas seguras) |
| H3-003 | P2 | `FichaProdutorDrawer` lia as tabelas mestres diretamente | **Corrigido** (passa a ler as views) |
| H3-004 | P2 | Testes de congelamento de migration (fases 28A/28B/28C) travavam o baseline em `20260905`, impedindo evolução das fases de homologação | **Corrigido** (asserção agora exige baseline presente + posteriores apenas da série H) |
| H3-005 | P3 | `produtos` sem unique em `nome` (existe em `microrganismos`) | Aberto — 8 linhas, sem duplicidade real; correção proposta para fase de dados mestres |
| H3-006 | P3 | Ausência de índices por `ativo`/`b2b_enabled` em `produtos`/`microrganismos` | Aberto — tabelas com 8 e 25 linhas; otimização prematura, reavaliar quando o volume crescer |
| H3-007 | P3 | `formulacoes` com policies genéricas `auth.uid() IS NOT NULL` para escrita | Aberto — conteúdo é composição técnica, sem dado sensível; endurecer junto do RBAC de escrita em H4+ |

### 7.1 Reabertura H3 (auditoria independente pós-gate, 2026-08-18)

Uma auditoria independente executada **após** o gate original encontrou dois P1 ainda abertos e uma afirmação incorreta neste relatório. O gate anterior ("Nenhum P0/P1 aberto") **não era factualmente correto** e foi revogado até o reteste do H3b.

Evidência independente que reabriu a fase:

| ID | Sev. | Achado | Evidência direta em staging | Status |
|---|---|---|---|---|
| H3-008 | P1 | Divergência entre mestre e catálogo nos caminhos comerciais. `BioInseticida 02`: `produtos.valor_litro_brl = 169,80` / `valor_dose_brl = 16,98` versus `catalogo_volumes` ativo `216,67/L` e `21,67/100 mL`. A correção H3 tratou apenas o arredondamento interno de `catalogo_volumes`; os resolvedores comerciais continuavam lendo o mestre | `fn_b2b_resolve_base_unit_price` e `fn_resolve_commercial_price` liam `produtos`/`microrganismos` logo após `partner_product_prices` | **Corrigido em H3b** |
| H3-009 | P1 | B2B lia fichas técnicas não aprovadas. Harness com conta `parceiro_b2b` real mostrou em `microorganism_technical_profiles`: aprovado 4, em_revisão 12, rascunho 1 visíveis. Causa: policy permissiva `micro_tech_profiles_b2b_read` (e a paralela `product_tech_profiles_b2b_read`) sem filtro de `status_validacao` — como policies SELECT são OR, ela neutralizava a policy restritiva | `pg_policies`: `USING (has_role(...'parceiro_b2b') OR has_role(...'parceiro_b2b_tecnico'))` | **Corrigido em H3b** |
| H3-010 | P1 | As views `vw_catalogo_ficha_*` eram projeções simples (owner-context) sem respeitar publicação: entregavam itens inativos e itens com ficha não aprovada | `pg_get_viewdef` sem cláusula `WHERE` | **Corrigido em H3b** |

Nota metodológica sobre a evidência do H3-009: o harness H3 original selecionava o primeiro usuário com o papel `parceiro_b2b`, e esse fixture acumula também `consultor_tecnico` (papel interno) — por isso via tudo por direito. O harness H3b passou a exigir fixtures externos "puros" (`NOT can_view_catalog_internal(user_id)`), o que expõe a falha real e mede o papel pretendido.

### 7.2 Correções aplicadas em H3b

Migration incremental e reversível `20260909000000_h3b_preco_canonico_fichas_v1.sql` (cópia no kit: `restoration/homologacao-h3/30-h3b-preco-canonico-fichas.sql`). A migration H3 anterior foi preservada; nada de history aplicada foi reescrito.

1. **Fonte canônica de preço comercial** — nova função `public.fn_catalogo_preco_canonico(produto, microrganismo, unidade, volume_ml)` (STABLE, SECURITY DEFINER, `search_path` fixo, sem EXECUTE para `anon`). Deriva `litro`, `dose`, `hectare` e `unidade` a partir das apresentações **ativas** de `catalogo_volumes`. Retorna `NULL` quando não há apresentação ativa **ou** quando o preço/litro entre apresentações não é único — ambiguidade nunca é resolvida por palpite.
2. **Precedência explícita nos dois resolvedores comerciais** (`fn_b2b_resolve_base_unit_price`, `fn_resolve_commercial_price`), únicos caminhos de preço do catálogo, simulador, carrinho e pedido B2B:
   `partner_product_prices` (preço negociado) → **`catalogo_volumes` (canônico, `price_source = catalog_volume_price`)** → mestre `produtos`/`microrganismos` (`catalog_base_price`, fallback legado documentado).
3. **Fichas técnicas** — `micro_tech_profiles_b2b_read` e `product_tech_profiles_b2b_read` removidas. As policies restritivas passaram a cobrir `parceiro_b2b` **e** `parceiro_b2b_tecnico`, sempre exigindo `status_validacao = 'aprovado'`, item `ativo` e `b2b_enabled = true` no caminho B2B. Produtor: somente aprovado + ativo. Internos autorizados (`can_view_catalog_internal`) mantêm visão completa.
4. **Projeções publicadas** — `vw_catalogo_ficha_produtos` e `vw_catalogo_ficha_microrganismos` recriadas como **interface publicada segura**, não bypass: somente `ativo = true`; quando existe ficha técnica, exige `aprovado` para papéis externos; caminho B2B respeita `b2b_enabled`; preço exposto é o canônico com a coluna `preco_fonte` (`catalogo_volumes` | `legado_mestre`); sem `fornecedor`, `meio_cultivo`, observações internas, `preco_tabela` ou campos regulatórios internos; `anon` sem GRANT. A arquitetura owner-context foi mantida deliberadamente (converter para `security_invoker` faria o produtor perder toda a ficha) e está documentada em `COMMENT ON VIEW`.
5. **Dados legados** — nenhum preço histórico, snapshot de pedido ou simulação foi alterado. Os campos `produtos.valor_*` / `microrganismos.valor_*` **não** foram sobrescritos: onde há dúvida de regra comercial, a decisão foi eliminar seu uso do caminho comercial e marcá-los como legado via `COMMENT ON COLUMN` ("LEGADO NAO-CANONICO"), em vez de sincronizar e destruir a futura diferenciação por volume.

### 7.3 Política de fonte de preço (sem ambiguidade)

- **Canônico**: `catalogo_volumes` com apresentação ativa. Preço/litro único por item entre apresentações (confirmado hoje: 64 volumes ativos, 5 L e 20 L com o mesmo preço/litro por item).
- **Prevalece sobre**: `produtos.valor_*` e `microrganismos.valor_*`, que são **fallback legado não-canônico**, usados apenas quando não há apresentação ativa (ou quando o preço/litro é ambíguo).
- **Acima de ambos**: `partner_product_prices` (preço negociado por parceiro) e `commercial_price_rules` / `commercial_condition_item_prices` (condição comercial publicada), que continuam com a precedência anterior.
- **Divergências legadas ainda presentes** (inventário completo, sem impacto comercial após H3b — o payload usa o canônico):

| Item | Legado `valor_litro_brl` | Canônico `catalogo_volumes` |
|---|---|---|
| BioInseticida 02 | 169,80 | 216,67 |
| E.M - Microrganismos Eficientes | 150,00 | 100,00 |
| Pantoea agglomerans | (nulo) | 250,00 |

Estas três linhas ficam registradas como H3-011 (P3, dado mestre legado divergente) e serão conciliadas na frente de dados mestres com decisão comercial explícita — não são sobrescritas silenciosamente.

| ID | Sev. | Achado | Status |
|---|---|---|---|
| H3-011 | P3 | 3 itens com mestre legado divergente do catálogo canônico | Aberto — sem efeito nos fluxos comerciais (payload usa o canônico); requer decisão comercial |

Após H3b, **nenhum P0/P1 permanece aberto**.


## 8. Arquivos, migrations e policies alterados

- `supabase/migrations/20260908000000_h3_base_tecnica_catalogo_v1.sql` (cópia versionada do kit: `restoration/homologacao-h3/10-h3-base-tecnica-catalogo.sql`)
  - `CREATE OR REPLACE FUNCTION public.sync_catalogo_volumes_calc` com `round(...)` e `search_path`
  - backfill `UPDATE public.catalogo_volumes`
  - `DROP POLICY` das leituras amplas; `CREATE POLICY produtos_select_internal`, `microrganismos_select_internal`
  - `CREATE OR REPLACE VIEW public.vw_catalogo_ficha_produtos` / `..._microrganismos` + `REVOKE` de `anon`/`PUBLIC` e `GRANT SELECT` a `authenticated`/`service_role`
- `restoration/homologacao-h3/20-postcheck.sql` (harness transacional, `BEGIN`/`ROLLBACK`)
- `src/components/catalogo/FichaProdutorDrawer.tsx` (views seguras)
- `src/test/catalogo/h3-base-tecnica-catalogo.test.ts` (novo)
- `src/test/catalogo/catalogo-fase28a-pos-certificacao.test.ts`, `src/test/estoque/estoque-fase28b-auditoria.test.ts`, `src/test/estoque/estoque-contratos-fase28c.test.ts` (asserção de baseline)
- Baseline de conexão `c75bb87f` (`.env`, `src/integrations/supabase/types.ts`) restaurado após drift detectado durante a fase.

H3b (correção incremental):

- `supabase/migrations/20260909000000_h3b_preco_canonico_fichas_v1.sql` + cópia idêntica em `restoration/homologacao-h3/30-h3b-preco-canonico-fichas.sql`
  - `CREATE OR REPLACE FUNCTION public.fn_catalogo_preco_canonico` (+ `REVOKE` de `anon`/`PUBLIC`)
  - `CREATE OR REPLACE FUNCTION public.fn_b2b_resolve_base_unit_price` e `public.fn_resolve_commercial_price` com a fonte canônica antes do mestre legado
  - `DROP POLICY micro_tech_profiles_b2b_read` / `product_tech_profiles_b2b_read`; recriação de `micro_tp_read_internal` e `prod_tp_read_internal`
  - Recriação endurecida de `vw_catalogo_ficha_produtos` / `vw_catalogo_ficha_microrganismos` + `COMMENT ON VIEW`/`COMMENT ON COLUMN`
- `restoration/homologacao-h3/31-h3b-rollback.sql` (rollback separado e reversível)
- `restoration/homologacao-h3/32-h3b-postcheck.sql` (harness transacional com `ROLLBACK`)
- `src/test/catalogo/h3b-preco-canonico-fichas.test.ts` (novo)

Nenhuma alteração de frontend foi necessária em H3b: o catálogo B2B, o simulador e o carrinho já consomem exclusivamente `get_partner_catalog_secure` / `fn_resolve_commercial_price`, que passaram a devolver o preço canônico; a ficha do produtor já lia as views, agora endurecidas.

## 9. Performance/índices

- Índices existentes cobrem os caminhos quentes: `catalogo_volumes` por `produto_id`/`microrganismo_id`/`ativo`, alvos por entidade e `ativo`, perfis técnicos com unique por entidade, `catalog_technical_sources` por entidade.
- `useCatalogoUnificado` mantém colunas explícitas (sem `SELECT *`), cache de 120 s e agregação por mapas (sem N+1); a grade renderiza incrementalmente (`PAGE_SIZE = 60`).
- Volumes atuais (8 produtos, 25 microrganismos, 64 volumes) não justificam paginação server-side; recomendação registrada para reavaliação quando o catálogo ultrapassar ~1.000 itens.

## 10. Testes e evidências

Postcheck H3 em staging (`restoration/homologacao-h3/20-postcheck.sql`, transacional com `ROLLBACK`):

- `PASS_H3_ROUNDING`
- `PASS_H3_DOSE_RULE` (1 L = 10 doses, dose 100 mL, derivação de preço)
- `PASS_H3_MESTRES_PRECO` (litro = dose × 10 em produtos e microrganismos)
- `PASS_H3_NO_BROAD_SELECT`
- `PASS_H3_VIEW_SAFE_COLUMNS`
- `PASS_H3_VIEW_NO_ANON`
- `PASS_H3_BEHAVIOR` — com claims JWT reais: `cliente_produtor` lê 0 linhas de `produtos` e 8 linhas da view; `administrador` lê 8 linhas da tabela.

Postcheck H3b em staging (`restoration/homologacao-h3/32-h3b-postcheck.sql`, transacional com `ROLLBACK`, fixtures externos sem papel interno acumulado) — **15/15 PASS**:

- `PASS_H3B_NO_PERMISSIVE_B2B_POLICY` — nenhuma policy SELECT de ficha sem exigência de `aprovado`
- `PASS_H3B_FN_CANONICA` / `PASS_H3B_FN_NO_ANON`
- `PASS_H3B_RESOLVERS_CANONICOS` — as duas funções comerciais consultam a fonte canônica
- `PASS_H3B_BIOINSETICIDA02` — payload comercial canônico = **216,67/L e 21,67/100 mL** (não cai em 169,80/16,98)
- `PASS_H3B_PARIDADE_CATALOGO_PAYLOAD` — paridade catálogo → payload em todos os itens com volume ativo, sem fallback silencioso para o mestre
- `PASS_H3B_PRECO_VOLUMES` — arredondamento e regra 1 L = 10 doses corretos nos 64 volumes ativos
- `PASS_H3B_VIEW_SAFE_COLUMNS` / `PASS_H3B_VIEW_NO_ANON` / `PASS_H3B_VIEW_SOMENTE_ATIVOS`
- `PASS_H3B_B2B_NON_APPROVED_ZERO` — `parceiro_b2b`: 0 fichas não aprovadas (antes: 12 em revisão + 1 rascunho); 4 aprovadas visíveis
- `PASS_H3B_B2B_TECNICO_NON_APPROVED_ZERO` — `parceiro_b2b_tecnico`: 0 não aprovadas
- `PASS_H3B_PRODUTOR_NON_APPROVED_ZERO` — `cliente_produtor`: 0 não aprovadas; 8 produtos na view
- `PASS_H3B_INTERNO_LEITURA` — `administrador`: 17 perfis e 8 produtos, leitura legítima preservada
- `PASS_H3B_VIEW_PUBLICACAO` — produtor enxerga 12 de 25 microrganismos ativos; os 13 com ficha não aprovada ficam ocultos
- `INFO_H3B_DIVERGENCIA_LEGADO` — inventário completo dos 3 mestres divergentes (H3-011)

Zero resíduo: todos os harnesses rodam em transação com `ROLLBACK`.

Frontend (pós-H3b):

- `tsgo --noEmit`: 0 erros
- `vitest run`: **3095 passed | 4 skipped**, 0 falhas
- `vite build`: SUCESSO

## 11. Riscos residuais e rollback

- Risco: algum papel interno não listado nas novas policies perderia leitura das tabelas mestres. Mitigado listando os 10 papéis internos do enum; `cliente_produtor` e parceiros seguem cobertos por views/policies próprias.
- Risco H3b: item com apresentações ativas de preço/litro divergente cairia no fallback legado em vez de erro. Decisão consciente — a função canônica retorna `NULL` em ambiguidade e o `price_source` do payload (`catalog_volume_price` vs. `catalog_base_price`) permite auditar quando isso ocorre.
- Rollback H3b: `restoration/homologacao-h3/31-h3b-rollback.sql` repõe as funções, policies e views exatamente no estado H3 e remove `fn_catalogo_preco_canonico`. Não toca dados.
- Rollback H3: reexecutar as policies antigas e restaurar `sync_catalogo_volumes_calc` sem `round`; as views podem ser removidas com `DROP VIEW`. O backfill é idempotente e não destrutivo.
- Pendências herdadas: H1-013, H1-015 (proveniência de migrations pelo kit `restoration/`), H2-002 (RoleGuard por `primaryRole`).

## Gate final

**H3 — APROVADA COM RESSALVAS** (reemitida após H3b; o gate anterior foi revogado pela auditoria independente)

Zero P0/P1 aberto após o reteste comportamental do H3b. Ressalvas: H3-005, H3-006, H3-007, H3-011 (P3) e pendências herdadas H1-013/H1-015/H2-002. Produção intocada. **H4 não iniciada.**


---

# H3c — Correção focada pós-H3 (2026-08-18, staging `ikaauvsflpmamgxmkhoq`)

Auditoria independente apontou que a H3b resolveu o *consumo* (resolvedores preferem `catalogo_volumes`), mas manteve **duas fontes editáveis** de preço vivo e policies B2B frouxas nas tabelas mestres. Corrigido nesta rodada. Produção `navfzbwgwzruipouyfnk` intocada.

## Evidência da fonte viva (decisão)

| Item | Mestre (antes) | `catalogo_volumes` | Decisão |
| --- | --- | --- | --- |
| BioInseticida 02 | 169,80/L | 216,67/L (5 L e 20 L, mesmo R$/L) | catálogo canônico → mestre alinhado |
| E.M — Microrganismos Eficientes | 150,00/L | 100,00/L | catálogo canônico |
| Pantoea agglomerans | NULL | 250,00/L | catálogo canônico |
| Bioinseticida 03 | 190,00/L | sem apresentação ativa | cache legado preservado (fallback) |

Critério: `catalogo_volumes` é a única entidade com apresentação comercial real (volume, rótulo, preço/L, dose/100 mL), é a base das telas de catálogo e já era a fonte dos resolvedores após H3b; os campos mestres viraram cache derivado.

## H3-012 (P1) — Fonte canônica única de preço

Kit: `restoration/homologacao-h3/40-h3c-fonte-canonica-preco.sql` (rollback `41-`, postcheck `42-`).

- `fn_catalogo_litro_canonico(produto, micro)` → `(litro, tiers)` sobre apresentações ativas.
- `fn_catalogo_sync_mestre_preco` + trigger `trg_zz_catalogo_volumes_sync_mestre` (AFTER I/U/D em `catalogo_volumes`): sincronização **direção única** catálogo → mestre.
- Guarda `trg_zz_produtos_guard_preco` / `trg_zz_microrganismos_guard_preco` (BEFORE I/U): edição direta dos campos legados é sobrescrita pelo canônico — não existe mais segunda fonte editável.
- Tiers por volume (preço/L diferente entre apresentações): cache legado é **anulado**, impedindo que campos mestres finjam fonte única; caminho comercial usa `catalogo_volumes` por volume.
- Sem apresentação ativa: cache legado preservado como fallback explícito (Bioinseticida 03).
- Backfill único alinhou os 3 divergentes. Histórico de pedidos/simulações **não** recalculado (snapshot próprio).
- `COMMENT` em `produtos.valor_litro_brl/valor_dose_brl/valor_ha_brl` e `microrganismos.valor_litro_brl/valor_dose_brl`: “LEGADO NAO-CANONICO / CACHE DERIVADO”.

## H3-013 (P1) — Policies B2B do mestre

`produtos_b2b_read` e `micros_b2b_read` passaram a exigir papel **e** `ativo = true` **e** `COALESCE(b2b_enabled,false) = true` (antes: apenas papel).

## Reteste comportamental — `42-h3c-postcheck.sql` (transacional, termina em ROLLBACK)

`PASS_H3C_ZERO_DIVERGENCIA` (8 produtos / 25 microrganismos ativos, zero divergência) · `PASS_H3C_BIOINSETICIDA02` (mestre = canônico = resolvedor B2B = 216,67, `price_source=catalog_volume_price`) · `PASS_H3C_GUARD_MESTRE` · `PASS_H3C_SYNC_VOLUME` · `PASS_H3C_TIERS_SEM_FONTE_DUPLA` · `PASS_H3C_POLICY_B2B` · `PASS_H3C_ANON_SEM_EXEC` — **7/7 PASS**.

Frontend: `tsgo --noEmit` 0 erros; `vitest run` **3105 passed | 4 skipped**. Binding restaurado ao baseline de staging `c75bb87f` (`.env`, `types.ts`) após drift detectado do sandbox.

## Gate

**H3 — APROVADA** (reemitida após H3c). H3-011 encerrado pelo alinhamento canônico; H3-012 e H3-013 corrigidos e retestados. Ressalvas remanescentes: H3-005, H3-006, H3-007 (P3) e herdadas H1-013/H1-015/H2-002. **H4 não iniciada.**

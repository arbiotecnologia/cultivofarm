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

Nenhum P0/P1 permanece aberto.

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

## 9. Performance/índices

- Índices existentes cobrem os caminhos quentes: `catalogo_volumes` por `produto_id`/`microrganismo_id`/`ativo`, alvos por entidade e `ativo`, perfis técnicos com unique por entidade, `catalog_technical_sources` por entidade.
- `useCatalogoUnificado` mantém colunas explícitas (sem `SELECT *`), cache de 120 s e agregação por mapas (sem N+1); a grade renderiza incrementalmente (`PAGE_SIZE = 60`).
- Volumes atuais (8 produtos, 25 microrganismos, 64 volumes) não justificam paginação server-side; recomendação registrada para reavaliação quando o catálogo ultrapassar ~1.000 itens.

## 10. Testes e evidências

Postcheck em staging (`restoration/homologacao-h3/20-postcheck.sql`, transacional com `ROLLBACK`):

- `PASS_H3_ROUNDING`
- `PASS_H3_DOSE_RULE` (1 L = 10 doses, dose 100 mL, derivação de preço)
- `PASS_H3_MESTRES_PRECO` (litro = dose × 10 em produtos e microrganismos)
- `PASS_H3_NO_BROAD_SELECT`
- `PASS_H3_VIEW_SAFE_COLUMNS`
- `PASS_H3_VIEW_NO_ANON`
- `PASS_H3_BEHAVIOR` — com claims JWT reais: `cliente_produtor` lê 0 linhas de `produtos` (tampering por ID/UUID direto também retorna vazio) e 8 linhas da view; `administrador` lê 8 linhas da tabela. Zero resíduo (rollback).

Frontend:

- `tsgo --noEmit`: 0 erros
- `vitest run`: **3082 passed | 4 skipped**, 0 falhas
- `vite build`: SUCESSO

## 11. Riscos residuais e rollback

- Risco: algum papel interno não listado nas novas policies perderia leitura das tabelas mestres. Mitigado listando os 10 papéis internos do enum; `cliente_produtor` e parceiros seguem cobertos por views/policies próprias.
- Rollback: reexecutar as policies antigas (`CREATE POLICY ... USING (true)`) e restaurar a versão anterior de `sync_catalogo_volumes_calc` (sem `round`); as views podem ser removidas com `DROP VIEW`. O backfill é idempotente e não destrutivo (recalcula a partir de `preco_brl`, que não foi alterado).
- Pendências herdadas: H1-013, H1-015 (proveniência de migrations pelo kit `restoration/`), H2-002 (RoleGuard por `primaryRole`).

## Gate final

**H3 — APROVADA COM RESSALVAS**

Nenhum P0/P1 aberto após reteste. Ressalvas: H3-005, H3-006, H3-007 (P3) e pendências herdadas H1-013/H1-015/H2-002. H4 não iniciada.

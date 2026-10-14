# Composição de produtos globais — todas as famílias (candidato local, 2026-10-14)

## 1. Escopo e autorização
Recorte autorizado: composição em todas as famílias do catálogo GLOBAL, apenas Platform Superadmin. Entrega: SQL CANDIDATO (NÃO APLICAR), runtime em rollback, rollback que preserva dados, painel local e testes. Nenhuma DDL aplicada, nenhuma publicação, nenhuma mutação de dados. Não entram: tenant CRUD/exibição, fiscal, liberação transacional, sementes.

## 2. Estado de partida (evidência externa do usuário)
Classificação fechada: `5a8a2f76` publicado; UI SA real mostra 4 abas; químicos e fertilizantes vazios; 20 micros na primeira página; 8 culturas preservadas; reload pela URL mantém biológicos. Bombarbio classificado pela UI às 22:02:40 UTC (audit `45a81c86-…`), biológico/biofungicida, ativo/B2B true, R$180/L, composição 334/333/333 intacta. Mobile 390 sem overflow; build independente 36,49 s PASS.

## 3. Auditoria de estruturas existentes (read-only no canônico, nesta rodada)
- `formulacoes`: 10 colunas, `microrganismo_id` NOT NULL, `UNIQUE(produto_id, microrganismo_id)`, FK micro ON DELETE CASCADE, FK `component_insumo_id`→produtos; 26 linhas, 0 com insumo, 23 com `concentracao`, unidades usadas `mL` e `UFC/mL`. Policies: leitura interna e escrita para gestores técnicos.
- Bombarbio em `formulacoes`: 3 linhas de 334/333/333 mL.
- Não existe tabela de ingrediente ativo, nutriente, substância ou teor garantido. `microrganismos.concentracao_ufc_ml` é atributo do micro, não do produto. `product_technical_profiles` e `product_fiscal_profiles` não têm composição.
- Não existe RPC de composição em `public`/`platform_private`.

## 4. Decisão de arquitetura
`formulacoes` continua sendo a fonte canônica da receita biológica existente, com editor e criação atuais preservados. Tabelas aditivas guardam apenas o que a receita não representa: ingrediente ativo, nutriente, outro componente e teor garantido UFC de microrganismo. Não há cópia das 26 linhas nem recadastro do Bombarbio. Um único painel "Composição" e um leitor unificado mostram as duas origens.

## 5. Justificativa das tabelas aditivas
`formulacoes` não aceita componente sem microrganismo (NOT NULL). `component_insumo_id` aponta para outro produto, não para uma substância, e o UNIQUE impede repetir micro. Mudar isso afetaria produção, planejamento, pedidos e PDF. Já o teor UFC garantido é outro atributo, diferente do volume de receita.

## 6. Modelo
- `produto_composicao_conjuntos` (por produto): `status` `rascunho|completo`, `updated_at` monotônico, `updated_by`.
- `produto_composicao_declaracoes`: `ordem` 1..50, `tipo_componente` (`microrganismo|ingrediente_ativo|nutriente|outro`), `microrganismo_id` (FK RESTRICT, por ID, sem cópia) ou `componente_nome` (2..160), `quantidade numeric(24,6)`, `unidade`, `base`, `natureza` (`teor_garantido|concentracao_declarada`).
- Família → tipos: biológico = microrganismo/outro; químico = ingrediente ativo/outro; fertilizante/adubo = nutriente/outro.

## 7. Unidades, base e limites
Unidades: mL/L, g/L, g/kg, %m/m, %m/v, %v/v, UFC/mL, UFC/g. Matriz validada no servidor: volume do produto (mL/L, g/L, %m/v, %v/v, UFC/mL) e massa do produto (g/kg, %m/m, UFC/g). A base é sempre escolhida explicitamente. Valores: > 0, sem NaN, no máximo 6 casas, percentuais ≤ 100, UFC ≤ 1e15, demais ≤ 1000. UFC só para microrganismo e microrganismo só em UFC. Quantidade, unidade e base vão juntas. Não há conversão automática nem densidade.

## 8. Não duplicação
- A declaração de microrganismo é negada quando a receita já informa concentração para o mesmo micro (`catalog_composition_duplicate_measure`).
- mL/L é proibido para micro, porque volume pertence à receita.
- UNIQUE por micro, por (tipo, nome sem distinção de maiúsculas) e por ordem.
- O leitor marca a origem de cada linha: "Receita de produção (origem: formulação existente)" ou "Declarações (origem: declaração)".

## 9. Rascunho e completo
A situação vale por conjunto. "Completo" exige pelo menos um item, todos com quantidade, unidade e base; "rascunho" aceita medidas vazias e aparece como "Rascunho (incompleto)". "Completo" não significa ficha técnica nem registro regulatório aprovados. Não há bloqueio retroativo: produtos sem declarações continuam ativos, com B2B e vendáveis.

## 10. Família e reclassificação
Produto sem família: escrita negada (`catalog_composition_requires_family`) e painel só leitura. A família é revalidada depois do lock do produto. Um trigger em `produtos` (`BEFORE UPDATE OF familia_catalogo`) nega reclassificação incompatível com declarações já existentes (23514); a UI da família mostra mensagem orientando. Componentes do tipo `outro` não bloqueiam. Há ainda um guard por linha nas declarações, que vale inclusive para o owner.

## 11. Microrganismos
Novas associações exigem micro ativo. Um micro já declarado e depois arquivado continua válido no conjunto e aparece como "(arquivado)". O FK com RESTRICT impede apagar um micro referenciado. O seletor reutiliza o leitor atual de micros ativos (`platform_read_global_microorganisms`).

## 12. Segurança
RLS habilitada nas duas tabelas, sem policies e sem grants para anon/authenticated. Leitor e writer são wrappers INVOKER com núcleo privado DEFINER, `search_path` fixo, ator SA ativo/readiness/JWT (`catalog_metadata_require_actor`), motivo 10..500, replay no ledger, CAS sobre `produtos.updated_at` (finito), `FOR UPDATE` no produto e no conjunto, formato JSON estrito (chaves exatas, ordem sequencial). Ledger `set_global_product_composition` imutável, com leitura restrita a SA ativo.

## 13. Invariantes de escrita
Uma escrita incrementa só `produtos.updated_at`, pelo trigger `catalog_touch_version`, e confere que as demais colunas do produto, as `formulacoes` e as apresentações do produto não mudaram (`confirmation_failed` se mudarem). Recibo validado no cliente.

## 14. Frontend (local)
- Botão "Composição" em cada linha das abas de produtos.
- `PlatformCatalogCompositionDialog`: receita somente leitura, declarações editáveis, situação, motivo e confirmação.
- Fence por produto, versão lida, escopo e sessão ativa. Respostas tardias de leitura ou escrita são descartadas; mudar motivo ou itens limpa a confirmação.
- Salvar fecha o painel e invalida a lista.
- Layout em uma coluna no mobile.
- `familyError` mapeia 23514.

## 15. Fora do escopo / lacunas honestas
- Motores de produção, planejamento, pedidos, PDF, ficha e B2B continuam lendo apenas `formulacoes`. As declarações ainda não aparecem no PDF nem no portal B2B.
- O cadastro novo de químicos e fertilizantes continua pendente: tipo e unidade próprios ainda não existem.
- Não há catálogo de ingredientes ativos ou nutrientes (o nome é livre e controlado).
- `composicaoSync` admite insumo sem micro, o que diverge do NOT NULL: segue como bug P2 separado e não foi alterado.
- Tenant não foi iniciado.

## 16. Rollback
Arquivo `rollback-platform-global-product-composition.sql`. O padrão revoga o EXECUTE das 4 funções e preserva tabelas, dados, ledger e guards, sem DROP, DELETE ou TRUNCATE. Para reverter a UI, volta-se o commit do painel. A remoção destrutiva fica comentada e exige autorização mais exportação. Depois da aplicação, `produtos` passa a ter 6 triggers, e o runtime da família que exige 5 falha fechado (não reaplicar).

## 17. Evidências e matriz
| Camada | Resultado |
|---|---|
| Testes focados (composição 17, SQL estático 7) e suíte saas | 768/768 PASS (68 arquivos) depois da correção do regex estático |
| Typecheck app/node | PASS |
| Lint dos 6 arquivos alterados | PASS |
| Scanner de integração fiscal | OK |
| Build local | 27,02 s PASS |
| SQL candidato / runtime rollback | NÃO executados (UNVERIFIED) |
| JWT, navegador real, mobile real, produção | UNVERIFIED |

Limitações do runtime: em 3 casos de CHECK direto com tipo `microrganismo` sobre um produto fertilizante, o guard de linha (23514) dispara antes do CHECK; ambos dão `check_violation`, mas a prova isolada do CHECK nesses casos fica pendente. O teste de medida duplicada depende de existir um par real biológico com concentração; sem esse par, é registrado como SKIP (não é prova).

# C1 — catálogo existente, recorte revisável

## Prioridade e limites
Prioridade expressa substitui gate anterior. Backlog em `backlog-prioridade-catalogo-20261021.md` permanece aberto; recuperação fictícia foi executada pelo auditor Codex e relatada pelo proprietário. C2 contratos funcionais/multiatribuições/portais segue fase separada, sem implementação neste diff.

## Inventário: existente versus faltante
| Consumidor / rota atual | Fonte / autoridade existente | Existia | Recorte / lacuna |
|---|---|---|---|
| Base técnica `/base-tecnica?tab=catalogo-tecnico`, alias `/comercial/catalogo` | `CatalogoTecnicoTab` → `useCatalogoUnificado('admin')`; produtos/microrganismos/fichas/composição/fontes/alvos, RLS e `tenant_catalog_hidden_ids` | Lista unificada + ocultos tenant, fichas/drawers | Seleção explícita de familia/classe, filtros das 3 famílias e identificação, sem inferência do tipo legado |
| Catálogo técnico/agrônomo `/app/catalogo` | `MobileCatalogoTecnico`; mesmas fontes diretas, RLS, ocultos tenant | Lista ativa, tipo, fichas | Família/classe na leitura; filtros biológicos/químicos/fertilizantes-adubos, legado no conjunto sem filtro |
| Simulador comercial | `useCatalogoUnificado('interno')` + motor server-side | Ativo+B2B, ficha aprovada para seleção e motor preço | Identifica família na seleção; sem mudar preço, pedido ou eligibility |
| Recomendação de visita | `tenant_catalog_visit_selection_page` | LIVE retorna família e filtra ativos/ocultos por tenant do ator com prova da visita; histórico só IDs já vinculados | Já atende famílias autorizadas; não reescrito. `recCanForwardToLab` só produto biologico explícito ou microrganismo; químicos/adubos/NULL negados |
| Portal parceiro `/portal-parceiro/catalogo` / NovoPedido | Grade `scope=b2b` e slots/carrinho via `usePartnerCatalog` / `usePartnerCatalogTecnico`; RPCs `get_partner_catalog_secure` e `get_partner_catalog_tecnico_secure` | Itens ativos+B2B; preço/ficha/vínculos e negativas técnicos | RPCs não retornam família nem aplicam ocultação tenant. Expansão B2B NÃO ativada; candidata separada em scripts/catalog-c1-b2b-review-20261021 |
| `/portal-parceiro/fichas-tecnicas` | Leitura direta produtos/microrganismos com RLS e ficha aprovada | PDF/listagem atuais | Sem metadado familiar/visibilidade comercial comprovada; não alterado neste recorte |
| OS/laboratório | Seleção biologico explícita; gates/RPCs canônicos | Fabricação biológica contida | Nenhuma mudança; catálogo não concede fabricação, contratação ou criação OS |

## Evidência LIVE somente leitura
Ref canônico validado no cliente/config. `produtos.familia_catalogo` e `classe_catalogo` são text reais. Contagem global atual: **2 produtos biologico (2 ativos, 1 ativo+B2B); 9 com família NULL (9 ativos+B2B); nenhum quimico/fertilizante_adubo explicitamente cadastrado**. Não classificar esses nove pelo nome/tipo nem fabricar itens: filtros novos podem ficar vazios até conteúdo real ser classificado pelo fluxo global autorizado.

RPC seleção visita MD5 `13a76147ec7fc9be058ba3cda551cf08`: search_path vazio, authenticated/service_role, autorização `can_view_technical_visit`, tenant derivado, ativos+NOT hidden, inclusão histórica limitada a recomendação vinculada. Esta consulta não é prova de sessão de cada perfil.

B2B MD5 gestor `4c8798e1567434a25b3fa9c9052f8759`, técnico `f1b68ffa8664b2655225eb298140860b`; lacuna de família/ocultação confirmada na definição, não hipótese por resposta vazia. Preflight/rollback separados; nada aplicado.

## Diff local
- Novos helpers/componentes de filtro sobre linhas já autorizadas; não são nova fonte de catálogo.
- Somente colunas família/classe adicionadas às consultas existentes, identificação e filtros nos consumidores internos; B2B permanece como estava.
- Preservados `tipo`, legado sem família, ocultação servidor, cache ator/tenant, ficha/preço, histórico, recomendações, OS.
- Sem monitor/Auth/Storage/sessões, reload/polling, subagentes, SQL, DDL/DML, Edge, deploy, publicação ou dados de catálogo.

## Validação
- 104/104 testes locais em 10 arquivos: 92/92 catálogo/cache + 12/12 seleção/encaminhamento da recomendação. Famílias explícitas, NULL/legado, microrganismo, tenant/ator e negativo de preferências, encaminhamento negado para químicos/adubos; regressões de grade/cache/consultas. Fixtures são exclusivamente mocks locais.
- Sinal automático do ambiente: types/build **OK 21:30:18 UTC** após correção do teste isolado. Sem build/typecheck manual (harness automático).
- Homologação real do novo filtro por consultor/agrônomo/comercial e B2B/JWT/RLS **não realizada** nesta rodada; nenhuma sessão/role foi alterada para obtê-la. C1 é candidata revisável, não certificação integral de todos perfis.
- Homologação imediata do sync anterior, origin-deny técnico, CDN SU-518022 e demais pendências continuam abertas conforme backlog.

Manifesto SHA256: `docs/catalogo-c1-20261021.sha256`. Commits automáticos do ambiente, sem git add/commit manual; informar o HEAD após registro deste pacote. Rollback frontend: retirar exclusivamente metadados/filtros deste recorte, mantendo autoridade/legado dos leitores; nenhum rollback de backend necessário.
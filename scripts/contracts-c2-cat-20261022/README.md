# C2-CAT — candidata separada para catálogo do parceiro fornecedor

**SQL aplicado externamente pelo auditor; runtime C2-CAT promovido localmente sob autorização22/10 01:22, sem publicação automática. C2.1 continua fechada.**

## Evidência independente9743dd58 (auditor, não proprietário executor)
- Auditor repetiu30/30Vitest PASS; typecheck original FALHOU por alias `useMyPartner` apontar runtime antigo e ausência de `vite/client`. Correção do auditor incorporada em `tsconfig.json`; somente a configuração corrigida recebeu PASS.
- Preflight LIVE: seis hashes/ACL/owner conferidos pelo auditor. Migration `b2b_owner_catalog_capabilities_20261022` APLICADA pelo auditor em `swzpzcwiasxmjutrmvkm`, sem DML; não reaplicada pelo agente.
- Sessão real teste4 `beb25695…`: wrapper `get_my_commercial_partner_projection` HTTP200, `mode=commercial_owner`, capabilities `{contract:C2_CAT_V1,catalog_read:true,sheets_read:true}`. Evidência produzida pelo auditor, sem token exposto/recarga.
- **Não é homologação UI**: monitor “verificando acesso” e fluxo UI real catálogo/fichas/revogação ainda pendentes. Não mudar lease, proteção ou sessão para obter PASS.

## Correção concreta
O catálogo gestor já retorna 35 itens em REST do teste4, conforme prova do auditor. O bloqueio visual vem de `PortalParceiroLayout`: `commercial_owner` substitui todo Outlet por Cliente comercial. Essa evidência não prova outros canais.

A candidata acrescenta `capabilities:{contract:C2_CAT_V1,catalog_read,sheets_read}` somente à **projeção privada canônica existente**, chamada pelo mesmo wrapper `get_my_commercial_partner_projection()`. Contexto, scope aplicado `c3f2997746f24bc2efd15db5c0ccc862`, validator exclusivo, assinaturas/OIDs/ACL, preços, visibilidade C1B e entitlements existentes permanecem inalterados. Não cria fonte paralela, RPC de sondagem ou polling. Capacidade não substitui autorização das RPCs de catálogo/fichas.

`catalog_read` exige parceiro B2B gestor validado pela cadeia atual, vínculo vigente/não revogado, perfil/tenant fornecedor/owner coerentes e ativos e `catalogo_precos`. `sheets_read` exige a mesma cadeia e `fichas_tecnicas`; técnico não recebe catálogo gestor. Sem vínculo: nenhuma capacidade, mesmo cliente comercial. Modelo de organização parceira explícita **não homologado**: capacidades novas não ampliam esse modelo; comportamento legado fora de commercial_owner não é alterado.

Frontend proposto:
- `useMyPartner` usa as mesmas duas chamadas; valida versão das capacidades e nega payload antigo/malformado. Erro de refetch não reaproveita capacidade stale. Fence de lease/ator/tenant vigente permanece.
- Menu e montagem owner aceitam **somente caminhos exatos** `/portal-parceiro/catalogo` e `/portal-parceiro/fichas`, cada um com capacidade e entitlement próprios.
- Catálogo owner monta `OwnerCatalog`, um adaptador somente leitura do **mesmo** `usePartnerCatalog` e `CatalogoCardsGrid`. Não monta `NovoPedido`, que contém leitores de pagamento, templates/carrinho, simulação e mutations. Sem actionSlot, hidratação de carrinho ou subscription adicional. Fonte e cálculos de preço não são alterados; grid/ficha usa projeção autorizada já existente.
- Fichas montam apenas o componente canônico atual; não inventa ficha aprovada nem permite enriquecer via tabela interna.
- `commercialOwner` não é removido. Outlets simulador/financeiro/arquivos/escrita/pedidos continuam não montados. Pedidos próprios já existentes permanecem **somente no dashboard owner**. Alias `/novo` continua redirecionando ao catálogo, sem montar carrinho.
- Não altera monitor/Auth/roles/perfis/sessões/Storage/rotas registradas. Nenhum reload.

## Arquivos / promoção independente
1. Executor confirma destino exato obrigatório **`swzpzcwiasxmjutrmvkm`** e executa apenas o preflight de leitura. O SQL não consegue provar sozinho o ref de infraestrutura.
2. `preflight.sql` captura definições/hashes/ACL/owner. `candidate.sql.review` transacional verifica baselines e substitui só a projeção privada; não executar automaticamente.
3. Após revisão/aplicação externa, conferir `postflight.sql` e REST real do wrapper na sessão autorizada: payload C2_CAT_V1, negativas A/B/sem vínculo/futuro/revogado/sem entitlement, dados catálogo35 e fichas somente se aprovadas existentes. Nada disso foi executado pelo agente.
4. `drift.json` guarda SHA256 dos dois arquivos runtime-base; `frontend.patch` passou **dry-run**, não foi aplicado. Arquivos finais propostos estão neste diretório. Aplicar a integração somente após backend homologado; payload antigo nega seguro.
5. `rollback.sql.review` devolve projeção anterior byte-equivalente com guard da nova MD5/ACL/owner/scope. Remove capacidade, sem reabrir filtros/roles/writers. Rollback frontend retira apenas patch C2-CAT, mantendo catálogo/rótulos C1B publicados e SQL servidor.

## Testes e limites
- **30/30 Vitest**: layout real + OwnerCatalog real com grid/source simulados; catálogo montado sem NovoPedido, irmãos não montados, técnico, ausência de vínculo/capacidade/entitlement, lease pause e erro de refetch no mesmo layout, respostas tardias e troca A→B, nenhuma chamada extra.
- **16/16 PostgreSQL descartável**: corpo real da projeção candidata + contexto/validator capturados do LIVE, scope/Auth/entitlements sintéticos. A/B, perfil movido, inativo, owner inativo, parceiro inativo, vínculo futuro/revogado, técnico sem catálogo gestor, cliente comercial sem vínculo e rollback com MD5 original exato. **Não são JWT/RLS reais** nem certificação do modelo explícito.
- **39/39 regressões** C1B/fichas/myPartner/entitlements/guards; recibos em `validation-results.txt`.
- MD5 da nova projeção normalizada pelo PostgreSQL local: `06a858c55328b45f205ccb5ebb02607d`; conferir independente antes de aplicar rollback.
- Typecheck independente da **candidata isolada**: UNVERIFIED; configuração fornecida. Build automático runtime OK não prova a candidata inativa. Nenhuma homologação real C2-CAT nesta rodada.

## Próxima continuação C2 (separada deste commit publicável)
C2.1 writers não instalar: readers exclusivos/provisioner ainda incompatíveis. O recorte seguinte deve coordenar folha/contexto/capacidades por operação, RPC seletor/preferência, producer com vínculo real e receipts/finish/compensação do create-user. Não basta remover `roles.length===1`/`pu.papel` ou combinar papéis internos. Esta implementação não declara esses contratos concluídos; o inventário está em `../contracts-c2-20261022/README.md`.

Publicação C1B/rótulos anterior foi **observada pelo auditor**, não pelo proprietário. Pendências SU518022/anexos/monitor/XML/OS/CQ/termos/conteúdo técnico não vazio/CRUD rótulos reais continuam adiadas, não resolvidas.
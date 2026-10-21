# C1B — candidata concreta, não instalada

## Entrega e limites

Continuação de `c70ca574`, revisão independente C1B25374fc5. Nenhum arquivo de runtime foi substituído. `frontend/src/` contém consumidores testáveis; `frontend.patch` permite revisão/promoção posterior. Não houve DDL/DML hosted, Edge, mudança de sessões ou publicação C1B. Histórico: a ferramenta anteriormente apenas agendou C1; em21/10 21:50 o proprietário confirmou C1 publicado no domínio, bundle `index-D0RgMmH6.js`, consultor A filtros/reset e administrador B catálogo/simulador reais PASS restritos aos dados atuais. Não republicamos C1.

## Inventário: existente versus lacuna

| Caminho | Já existia | Candidata |
|---|---|---|
| `get_partner_catalog_secure(uuid)` | autorização B2B, termos/preços canônicos, metadados de ficha | preserva OID/assinatura/ACL/cálculos; restringe ocultação |
| `get_partner_catalog_tecnico_secure()` | papéis/vínculos/feature e finanças nulas para técnico, inclusive cumulativo | preserva essas regras; restringe ocultação |
| Mesmos nomes, overload com `p_catalog_v2=true` | inexistente | delega integralmente à assinatura anterior, acrescenta família explícita do produto e marcador de contrato |
| NovoPedido/grid | preço vinha da RPC, grade fazia outra leitura interna | mesma resposta RPC alimenta preço, ação, grade e ficha de leitura; não monta leitura interna |
| FichasTecnicas | duas consultas diretas com chaves fixas | lista pela RPC técnica existente; famílias e fence; confirma elegibilidade antes/depois do PDF |
| Hook técnico | chave global e `useQuery` | wrapper canônico de escopo, sem retry; invalidação realtime limitada ao ator vigente |
| Técnico/agrônomo/comercial interno e recomendações | C1 e seleção de visita já usam metadados/visibilidade próprios | intocados; químicos/adubos continuam sem fabricação por fallback |

Callers preservados: NovoPedido (`/catalogo`, `/novo-pedido`, `/simulador` conforme guards atuais), DashboardTecnico, FichasTecnicas e demais consumidores da assinatura antiga. Não alteramos rotas, preços, pedidos, simulador, fabricação, RLS ou o contrato multipapel.

## Achado factual e ambiguidade de autoridade

LIVE read-only no ref `swzpzcwiasxmjutrmvkm`: as duas RPCs não aplicavam `catalog_tenant_visibility`, nem retornavam família. A preferência interna usa a organização ativa do ator por `catalog_tenant_actor`/h15. A tabela possui `organization_id`, não um campo de proprietário comercial. `partner_accounts.commercial_owner_organization_id` é uma cadeia comercial distinta da organização do parceiro.

Na matriz lida havia três parceiros ativos: dois com proprietário comercial preenchido, um NULL; o JOIN de organizações parceiras não trouxe organização e as contagens de ocultação desses recortes eram zero. **Isso não determina qual empresa deve prevalecer.** Nenhuma permissão foi deduzida dessas contagens ou de UUID.

A regra conservadora foi uma **escolha técnica do auditor independente, feita sob a autorização vigente** — não foi declaração expressa do proprietário: item oculto na empresa parceira/ator **ou** na fornecedora comercial não é retornado; proprietário ausente/inativo nega, sem backfill. Não depende de nova autorização humana para a semântica. A autorização canônica de parceiro/papel/feature permanece antes do filtro. Superadmin sem tenant/parceiro comprovado também não recebe fallback global. A variável `v_visibility_scope uuid[]` é resolvida uma única vez por chamada de cada RPC antiga, nunca dentro dos filtros por linha.

Família de produto vem exclusivamente de `produtos.familia_catalogo`; NULL/valor desconhecido não vira biológico. Legado fica em Todos/sem família. Microrganismos são a entidade biológica canônica já existente; não usamos nome nem `tipo` de produto para classificação.

## SQL e compatibilidade

- `preflight.sql`: somente leitura; assinaturas, corpos, ACL, owner, `search_path`, dependências, policies/grants, colunas, assinaturas/overrides e matriz proprietário/parceiro. Deve rodar com operador aprovado, no destino previamente comprovado; variável de ref fornecida pelo operador **não** prova o destino.
- `live-snapshot.json`: corpos/ACL originais obtidos por leitura; hashes MD5 gestor `4c8798e1567434a25b3fa9c9052f8759`, técnico `f1b68ffa8664b2655225eb298140860b`. Ausência de dependências em `pg_depend` não prova ausência de callers dinâmicos/PostgREST.
- `candidate.sql.review`: transacional, lock timeout, recusa drift de baseline/ACL e instalação repetida; `CREATE OR REPLACE` das assinaturas antigas mantém OIDs, sem alterar TABLE return. Overloads sem defaults preservam a resolução pelo conjunto de argumentos PostgREST. Helper privado não é executável por authenticated/anon/service_role; novas RPCs só authenticated/service_role, sem grant público/anon. Não cria tabela ou fonte paralela.
- `postflight.sql`: leitura das assinaturas/ACL/corpos e chamada em sessão já autenticada; não cria JWT ou troca sessão.
- `frontend-safe-reversal.patch`: reversão exclusivamente frontend, mantendo filtro/helper/overloads no servidor. `rollback.sql.review` foi removido porque reabria a visibilidade antiga. Reversão estrutural é somente documentada em `STRUCTURAL-ROLLBACK.md`; baseline histórica preservada em `live-snapshot.json`, nunca restauração automática.
- `local-post-snapshot.json`: hashes de execução PostgreSQL local; comparar com postflight antes da promoção, não rotular como evidência LIVE.

## Validação reproduzível

```sh
python3 scripts/catalog-c1b-20261021/test_sql.py
bun run test -- --config scripts/catalog-c1b-20261021/vitest.config.ts
bunx --package @typescript/native-preview tsgo -p scripts/catalog-c1b-20261021/tsconfig.json --noEmit
```

PostgreSQL local executa os corpos originais byte-equivalentes e a candidata/rollback completos. Autorização h15/B2B e preços são helpers sintéticos, não JWT/RLS LIVE. Casos: A/B, ocultação owner/ator, inativo/não aprovado, legado NULL, preço preservado, técnico/cumulativo sem finanças, cross-parceiro, vínculo revogado, perfil inativo, owner ausente, ACL anon real local, chamadas authenticated locais, drift/rollback e restauração exata.

Vitest usa hooks candidatos com o wrapper/fence de runtime, fixtures somente em memória e SDK simulado: três famílias, legado, papéis/finanças, actor/tenant/epoch tardios, logout, invalidação, contrato antigo/negativa sem fallback e fabricação negada para químicos/adubos. Não equivale à homologação browser com sessão real.

Revisão final: **26/26 verificações PostgreSQL sintéticas, 21/21 testes da candidata e21/21 regressões**. Tipos isolados `tsgo` exit0; build automático observado OK21:53:44Z. Testes montam a ficha real (não mock do drawer), conferem uso/indicação/cuidados/mecanismo/alvos e descarte por ator. Cinco testes PDF cobrem erro com data stale no primeiro refetch (zero geradores), tipos divergentes nos dois checks, troca de aba durante await e troca de ator. Histórico anterior23/16/54 preservado como resultado da versão anterior, não certificado para esta revisão.

## Conteúdo real das fichas e limites de autoridade

O consumidor antigo `FichaProdutorDrawer` fazia leituras paralelas de views/perfis, `envase/lotes` e `catalogo_volumes`, até quando fechado. Não é seguro reutilizar essas leituras como enriquecimento B2B. `PartnerFichaDrawer` preserva os textos aprovados produtor/B2B, benefício, indicação, cuidados, função/subtítulo, mecanismo de microrganismo, dose, preços já resolvidos pela RPC e contagem de alvos. Ambos os botões da grade abrem essa ficha real sobre os mesmos dados autorizados. JSON `ficha_conteudo` é whitelist somente de perfis aprovados, sem SELECT *.

`explicacao_tecnica` interna e conteúdo de fontes/auditoria **já eram negados no escopo B2B** por `useCatalogoUnificado`/`CatalogoItemDrawer`; não ampliar por trocar nome de drawer. Preservamos essa negativa e contagens de fontes/alvos (fontes não exibidas no B2B). Formatos de entrega provenientes de `envase/lotes` e preços de volumes provenientes de `catalogo_volumes` não têm contrato B2B server-side comprovado neste recorte: permanecem bloqueados, não são fabricados nem substituídos pelo motor financeiro. Esta capacidade antiga não é declarada integralmente preservada. Preflight ampliado inclui colunas/policies dessas dependências para revisão; nenhum backfill/permissão novo.

## Gate REST e promoção

`rest_postflight.py` faz POST real em todos os quatro conjuntos de argumentos das overloads, recusa PGRST202/203, confirma TABLE/marcador/conteúdo e casos reais A/B visível/oculto e financeiro técnico nulo; sem retries, redirects, tokens em saída ou troca de sessão. Executar **após** migration independente no ref canônico usando sessões existentes via ambiente e arquivo de casos reais. Variável URL não substitui atestado independente do destino. SQL local NÃO prova resolução REST.

Nesta rodada migration não aplicada pelo agente e entradas de sessões REST A/B ausentes. Portanto REST LIVE **não executado/não validado**, promoção runtime **não feita** conforme o gate expresso. Candidata testável está entregue, não fingimos contrato validado. Build runtime C1 não certifica bundle C1B. Nenhuma sessão foi criada/trocada e nenhuma aba foi recarregada.

### Atualização 21/10 22:06 UTC (SHA4bf75596) — evidências produzidas pelo auditor independente

- Auditor repetiu **21/21 testes candidatos e tsc PASS**.
- Migration `catalog_c1b_scoped_families_20261021` **APLICADA em produção pelo auditor**, sem DML. Não reaplicar.
- REST com sessão real: consultor A — overload técnico antigo e v2 retornam **403 forbidden_role**; administrador B — ambos **200 []** (sem fichas aprovadas). **Não há homologação positiva não vazia**; aguarda login real test4 B2B.
- Promoção de runtime C1B e publicação seguem **bloqueadas** até essa homologação. Pendências antigas adiadas permanecem abertas.

## Pendências preservadas e próxima fase

- Homologar contratos REST PostgREST e visibilidade A/B após aplicação independente, antes de promover; regra conservadora já aceita, não pedir nova autorização da semântica.
- PDF ainda reutiliza geradores existentes e suas leituras subordinadas; confirmações/fences não substituem RLS. Não certificamos revogação universal de bytes já entregues.
- URLs antigas/CDN SU-518022, origin-deny técnico, matriz anexos/perfis, monitorB RTT10041ms/lease0/auto_retry, XML/OS/CQ/termos reais e sync imediato real permanecem abertos/adiados, não resolvidos.
- C2 permanece separado: atribuir/desvincular/reativar/histórico, perfis cumulativos e seletor/cadastro canônicos; não implementado aqui.
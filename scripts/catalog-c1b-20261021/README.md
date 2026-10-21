# C1B — candidata concreta, não instalada

## Entrega e limites

Continuação de `c70ca574`. Nenhum arquivo de runtime foi substituído. `frontend/src/` contém as versões candidatas dos cinco consumidores e a projeção da grade; `frontend.patch` permite revisão/promoção posterior. Não houve DDL/DML hosted, Edge, mudança de sessões ou publicação C1B. A publicação **C1** foi solicitada pela ferramenta antes das alterações desta candidata; o retorno apenas agendou a publicação, não comprovou conclusão nem bundle publicado.

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

A SQL propõe uma restrição conservadora: item oculto na organização atual do ator **ou** na proprietária comercial não é retornado; proprietário ausente/inativo nega o catálogo desse parceiro, sem backfill. A autorização de parceiro/papel/feature continua na RPC canônica antes dessa restrição. Não se trata de uma autoridade comercial homologada. A revisão deve aprovar essa semântica ou escolher uma autoridade comprovada; a candidata não pode ser instalada por mera passagem dos testes. Superadmin sem tenant/parceiro comprovado também não recebe fallback global.

Família de produto vem exclusivamente de `produtos.familia_catalogo`; NULL/valor desconhecido não vira biológico. Legado fica em Todos/sem família. Microrganismos são a entidade biológica canônica já existente; não usamos nome nem `tipo` de produto para classificação.

## SQL e compatibilidade

- `preflight.sql`: somente leitura; assinaturas, corpos, ACL, owner, `search_path`, dependências, policies/grants, colunas, assinaturas/overrides e matriz proprietário/parceiro. Deve rodar com operador aprovado, no destino previamente comprovado; variável de ref fornecida pelo operador **não** prova o destino.
- `live-snapshot.json`: corpos/ACL originais obtidos por leitura; hashes MD5 gestor `4c8798e1567434a25b3fa9c9052f8759`, técnico `f1b68ffa8664b2655225eb298140860b`. Ausência de dependências em `pg_depend` não prova ausência de callers dinâmicos/PostgREST.
- `candidate.sql.review`: transacional, lock timeout, recusa drift de baseline/ACL e instalação repetida; `CREATE OR REPLACE` das assinaturas antigas mantém OIDs, sem alterar TABLE return. Overloads sem defaults preservam a resolução pelo conjunto de argumentos PostgREST. Helper privado não é executável por authenticated/anon/service_role; novas RPCs só authenticated/service_role, sem grant público/anon. Não cria tabela ou fonte paralela.
- `postflight.sql`: leitura das assinaturas/ACL/corpos e chamada em sessão já autenticada; não cria JWT ou troca sessão.
- `rollback.sql.review`: transacional, verifica hashes/ACL POST antes de restaurar baseline exata e remover somente os objetos C1B. **Restaura também a visibilidade antiga mais fraca:** não é recuperação automática segura e precisa autorização/revisão explícita. Sem CASCADE, sem dados alterados.
- `local-post-snapshot.json`: hashes de execução PostgreSQL local; comparar com postflight antes da promoção, não rotular como evidência LIVE.

## Validação reproduzível

```sh
python3 scripts/catalog-c1b-20261021/test_sql.py
bun run test -- --config scripts/catalog-c1b-20261021/vitest.config.ts
bunx --package @typescript/native-preview tsgo -p scripts/catalog-c1b-20261021/tsconfig.json --noEmit
```

PostgreSQL local executa os corpos originais byte-equivalentes e a candidata/rollback completos. Autorização h15/B2B e preços são helpers sintéticos, não JWT/RLS LIVE. Casos: A/B, ocultação owner/ator, inativo/não aprovado, legado NULL, preço preservado, técnico/cumulativo sem finanças, cross-parceiro, vínculo revogado, perfil inativo, owner ausente, ACL anon real local, chamadas authenticated locais, drift/rollback e restauração exata.

Vitest usa hooks candidatos com o wrapper/fence de runtime, fixtures somente em memória e SDK simulado: três famílias, legado, papéis/finanças, actor/tenant/epoch tardios, logout, invalidação, contrato antigo/negativa sem fallback e fabricação negada para químicos/adubos. Não equivale à homologação browser com sessão real.

Tipos da cópia isolada passaram. Build do aplicativo é responsabilidade do harness automático; a candidata não está importada pelo aplicativo, portanto build runtime OK não certifica o bundle C1B. Uma tentativa inicial mesclou o include de testes e iniciou a suíte global; foi interrompida em 60s, sem resultado global. A configuração foi corrigida e a suíte candidata foi repetida isoladamente.

## Pendências preservadas e próxima fase

- Resolver/confirmar autoridade comercial e homologar contratos PostgREST/visibilidade A/B com JWT/RLS reais antes de aplicar/promover.
- PDF ainda reutiliza geradores existentes e suas leituras subordinadas; confirmações/fences não substituem RLS. Não certificamos revogação universal de bytes já entregues.
- URLs antigas/CDN SU-518022, origin-deny técnico, matriz anexos/perfis, monitorB RTT10041ms/lease0/auto_retry, XML/OS/CQ/termos reais e sync imediato real permanecem abertos/adiados, não resolvidos.
- C2 permanece separado: atribuir/desvincular/reativar/histórico, perfis cumulativos e seletor/cadastro canônicos; não implementado aqui.
# Carteira da empresa — correção focal, sem publicação

## Causa comprovada

`src/pages/comercial/PedidosB2B.tsx` monta `CommercialOwnerOrdersSection`, que usa
`src/hooks/useCommercialOwnerOrders.ts` e a RPC
`public.c2_commercial_owner_orders_projection(text,uuid,timestamptz,timestamptz)`.
O wrapper chama `platform_private.c2_commercial_owner_orders_core`.
A lista administrativa usa `usePartnerOrdersAdmin` e SELECT direto sujeito à RLS.

A seção recebia `excludeIds={orderIds}` e removia todos os IDs já presentes na
lista administrativa. Após os SELECT-only implantados externamente, os mesmos
pedidos passaram a aparecer acima: a carteira podia ter sete linhas válidas e
a apresentação reduzi-las a zero, exibindo uma falsa carteira vazia. A deduplicação
deve permanecer: o erro comprovado é classificar sobreposição como ausência de pedidos.

## Verificação canônica somente leitura

Antes das duas consultas, o cliente e `supabase/config.toml` confirmaram
`swzpzcwiasxmjutrmvkm`. Nenhuma função de negócio foi executada com privilégio
de operador, nenhuma sessão foi coletada, e nenhum dado foi alterado.

Catálogo LIVE capturado nesta rodada:

| Objeto | MD5 de `pg_get_functiondef` | ACL |
| --- | --- | --- |
| wrapper público | `8b327775c3edce7f9f7e937c7016ba44` | postgres/authenticated/service_role EXECUTE |
| core privado DEFINER, search_path vazio | `4dba9a98d14367ece8fb1a9e07b91829` | postgres/authenticated/service_role EXECUTE |

O corpo real seleciona parceiro ativo, não deletado, cujo
`commercial_owner_organization_id` corresponde à organização ativa do perfil.
Autoriza administrador ou gestor_comercial; papéis mistos são resolvidos pela
organização do perfil conforme contrato atual. Aplica filtros e LIMIT 200.
Não exige snapshot/origem externa e não restringe a um parceiro chamado FSF.

A consulta pontual encontrou **7 pedidos elegíveis**, PB-001029 a PB-001035,
todos `em_analise_comercial`, do parceiro auditoria
`7e52de9a-4bed-4d1e-8200-3255a805465c`, owner AR Bio
`007bb519-cba0-4704-be2c-cb93ad010048`, ativo e não deletado.
O parceiro comercial FSF `4a7e37e0-632a-41d5-8ccb-c627185ad5b3`
tem o mesmo owner, mas **zero pedidos** nesta leitura.
Tenant FSF `8f57c7dd-0557-4041-b401-7a00f7244626` não é esse parceiro.

Evidência independente adicional informada pelo proprietário em 30/10:
GET autenticado como arbiotecnologia@gmail.com à RPC retornou envelope correto
da organização AR Bio `007bb519-cba0-4704-be2c-cb93ad010048` e os sete pedidos
PB-001029–35, com os mesmos IDs da lista administrativa. Isso confirma que a
causa é o estado pós-deduplicação, não backend. API real, sete pedidos administrativos,
dois itens PB-001029 e negações FSF são evidências externas atribuídas ao proprietário;
não representam execução autenticada realizada pelo assistente nesta rodada.

## Diff mínimo

- `src/components/comercial/CommercialOwnerOrdersSection.tsx`: mantém exclusão
  por IDs administrativos; todos sobrepostos informa "Todos os pedidos da carteira
  neste filtro já estão exibidos na lista acima." Retorno autorizado sem pedidos
  informa "Nenhum pedido da carteira encontrado neste filtro."
- `src/pages/comercial/PedidosB2B.tsx`: restaura a prop `excludeIds={orderIds}`.
- `src/lib/comercial/commercialOwnerOrders.ts`: classifica apresentação após
  autorização do envelope como `rows`, `already_listed` ou `empty_filter`.
- `src/test/pedidos/commercialOwnerOrders.test.tsx`: regressões da sobreposição,
  papéis e resposta estrangeira. Lista mista mantém somente IDs não apresentados
  acima; a carteira continua somente leitura, sem ações novas.

RPC, hook, parser, filtros, escopos, RLS, papéis, detalhe e escritores intactos.
Nenhum SQL candidato é necessário para esta causa.

## Validação isolada

Comando limitado a 180 segundos:

```text
bun run test -- src/test/pedidos/commercialOwnerOrders.test.tsx src/test/pedidos/partnerOrdersAdminScope.test.tsx src/test/pedidos/pedidosB2BStatusFilter.test.tsx
```

Resultado do complemento: **37/37 PASS** (18 carteira, 13 escopo administrativo,
6 filtros), execução às 00:45:46 UTC de 30/10/2026.
Inclui sete registros sobrepostos deduplicados e classificados `already_listed`,
zero resultados classificados `empty_filter`, lista mista, IDs administrativos
alheios, atualização manual revelando novo pedido, erro sem falso vazio, negação 42501, RPC ausente,
gestor comercial permitido, parceiro/financeiro sem nova tentativa autorizada,
resposta de organização estrangeira rejeitada, papéis mistos negados pelo servidor,
perfil inativo sem leitura, revogação e isolamento de cache.
Transporte/Auth sintéticos: **não são homologação JWT/RLS**.

Build/typecheck são executados pelo harness da plataforma, não manualmente.
Último sinal observado após a edição: `build OK` às 00:45:33 UTC de 30/10/2026.
Não houve saída separada de typecheck disponível; não certificamos essa etapa
independentemente do build automático.

## Limites e conferência posterior

Sem publicação frontend, DDL hosted, mudança de cadastro/identidade, cobrança,
automação ou fiscal. Crédito/Price e decisão superadmin permanecem separados.
Não transferir teste4/teste2; ambos exclusivos AR Bio conforme proprietário.

Depois de revisão e publicação independente, conferir com a sessão AR Bio:
filtro Todos ou Em análise comercial, sete pedidos acima e aviso de todos já
exibidos, sem tabela duplicada; Atualizar mantém classificação fiel e eventual
pedido novo não exibido acima aparece na carteira. Filtro sem resultado não
afirma carteira global vazia; indisponibilidade não vira vazio. FSF deve repetir negativos
com sua própria sessão. Nesta rodada não houve acesso autenticado real ao fluxo.
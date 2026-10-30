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
a apresentação reduzi-las a zero, exibindo uma falsa carteira vazia.

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

Essas leituras comprovam elegibilidade pelos predicados reais; não comprovam
execução JWT da RPC nesta rodada. A visibilidade real administrativa de sete
pedidos e dois itens PB-001029, e negações FSF, foram informadas pelo proprietário.

## Diff mínimo

- `src/components/comercial/CommercialOwnerOrdersSection.tsx`: remove exclusão
  por IDs administrativos; vazio agora corresponde a `state.orders.length === 0`.
- `src/pages/comercial/PedidosB2B.tsx`: remove somente a prop `excludeIds`.
- `src/test/pedidos/commercialOwnerOrders.test.tsx`: regressões da sobreposição,
  papéis e resposta estrangeira. Os pedidos aparecem nas duas listas por serem
  duas visões legítimas; a carteira continua somente leitura, sem ações novas.

RPC, hook, parser, filtros, escopos, RLS, papéis, detalhe e escritores intactos.
Nenhum SQL candidato é necessário para esta causa.

## Validação isolada

Comando limitado a 180 segundos:

```text
bun run test -- src/test/pedidos/commercialOwnerOrders.test.tsx src/test/pedidos/partnerOrdersAdminScope.test.tsx src/test/pedidos/pedidosB2BStatusFilter.test.tsx
```

Resultado: **34/34 PASS** (15 carteira, 13 escopo administrativo, 6 filtros).
Inclui sete registros sobrepostos preservados na carteira, carteira realmente
vazia, atualização manual, erro sem falso vazio, negação 42501, RPC ausente,
gestor comercial permitido, parceiro/financeiro sem nova tentativa autorizada,
resposta de organização estrangeira rejeitada, revogação e isolamento de cache.
Transporte/Auth sintéticos: **não são homologação JWT/RLS**.

Build/typecheck são executados pelo harness da plataforma, não manualmente.
O resultado observado será registrado no relatório de validação final.

## Limites e conferência posterior

Sem publicação frontend, DDL hosted, mudança de cadastro/identidade, cobrança,
automação ou fiscal. Crédito/Price e decisão superadmin permanecem separados.
Não transferir teste4/teste2; ambos exclusivos AR Bio conforme proprietário.

Depois de revisão e publicação independente, conferir com a sessão AR Bio:
filtro Todos ou Em análise comercial, sete linhas também na carteira; Atualizar
mantém as linhas, indisponibilidade não vira vazio. FSF deve repetir negativos
com sua própria sessão. Nesta rodada não houve acesso autenticado real ao fluxo.
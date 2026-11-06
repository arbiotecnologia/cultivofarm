# Leitor escopado de volumes do comprador B2B — `B2B_PARTNER_VOLUMES_V1` (candidato, NÃO aplicado)

## Sintoma real (relato do proprietário, sessão teste4 em produção, tenant vendedor AR Bio)
O catálogo lista o produto `bd0eca62-…` (TESTE AUDITORIA QUIMICO 20261021). Ao clicar em "Adicionar ao pedido", aparece "Nenhum volume comercial cadastrado". A leitura administrativa mostra o volume ativo `b86f2fe8-…` de 1 L.

## Evidência capturada (somente leitura de metadados, ref `swzpzcwiasxmjutrmvkm`, 06/11 14:24 UTC)
- O catálogo do comprador vem de `get_partner_catalog_secure`, uma função que roda com privilégio do dono e passa pelo guard `platform_private.b2b_partner_catalog_reader`. Ela não depende do RLS de `produtos`.
- Os volumes vêm por leitura direta de `catalogo_volumes` (`useCatalogoVolumes`). A policy RESTRICTIVE `tenant_catalog_owner_restrictive` exige `EXISTS (SELECT 1 FROM produtos …)`, e esse `EXISTS` está sujeito ao RLS de `produtos`. A única policy de leitura de `produtos` é `owner_organization_id = platform_private.tenant_catalog_read_org()`.
- **Hipótese compatível, não provada:** se `tenant_catalog_read_org()` do comprador for diferente do dono do produto, o produto fica invisível dentro da policy. Nesse caso o volume é filtrado, mesmo com a policy permissiva "Partner B2B read enabled". Não executei sessão nem JWT do comprador, e o valor de `tenant_catalog_read_org()` para teste4 não foi observado.
- Prova que confirma ou refuta a hipótese: na sessão real, `select platform_private.tenant_catalog_read_org()` não tem EXECUTE para clientes. A alternativa é instalar este leitor e comparar, na mesma sessão, a leitura direta (0 volumes) com a leitura pelo RPC (1 volume).

## Contrato
`get_partner_catalog_volumes_secure(p_partner_id uuid) → jsonb`, com `SECURITY DEFINER`, `search_path=''` e EXECUTE só para `authenticated`.
1. Reusa `b2b_partner_catalog_reader(p_partner_id)`, sem alteração. Esse guard nega técnico, Superadmin, parceiro diferente, empresa vendedora inativa e ramo interno sem carteira.
2. Só lista volumes ativos, com `volume_ml > 0`, do dono = vendedor. Os volumes precisam pertencer a itens que o próprio `get_partner_catalog_secure(p_partner_id)` devolve (ativo, `b2b_enabled`, não oculto).
3. **Sem preço:** o preço continua vindo só do motor canônico; volume sem preço canônico fica inválido no carrinho (fail-closed).
4. `seller.name` é `nome_fantasia`, depois `nome`, depois `razao_social` da organização do vendedor resolvida pelo guard, ou `null`. Nunca vem do tenant do comprador.

Este pacote não amplia RLS, não cria tabela e não duplica volumes. A leitura direta continua igual para os demais perfis.

## Arquivos
`01-pre.sql.readonly`, `02-install.sql.review` (aborta se houver drift nos pinos md5 ou se o alvo já existir), `03-post.sql.readonly`, `04-rollback-deny.sql.review`.

## Negativas a provar após instalar (sessões JWT reais; NOT RUN)
| Caso | Esperado |
|---|---|
| teste4 → parceiro `7e52de9a…` | `B2B_PARTNER_VOLUMES_V1`; contém `b86f2fe8…`; `seller.name` da AR Bio |
| teste4 → outro `partner_id` | 42501 `forbidden_partner` |
| parceiro_b2b_tecnico | 42501 `forbidden_financial_terms` |
| admin FSF (`rh@`) → parceiro AR Bio | 42501 |
| anon | sem EXECUTE |
| Superadmin | 42501 `b2b_catalog_platform_actor_denied` |
| volume inativo, `volume_ml = 0` ou de produto oculto/não B2B | ausente |

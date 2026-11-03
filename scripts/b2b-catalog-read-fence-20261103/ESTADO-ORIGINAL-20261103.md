# Estado no projeto original — 03/11/2026

## STATUS: REPROVADO — NÃO APLICAR

Este pacote (`efb5d95`) foi REPROVADO pelo auditor e não deve ser aplicado em nenhum ambiente. Também não deve ser chamado de "revisado" nem de "aprovado". Os arquivos ficam aqui só como evidência histórica, sem alteração.

- Motivo da reprovação, segundo o auditor: o usuário rh@FSF, com JWT real em homolog, leu 5 itens ARBio. O `partner_account_id` da organização FSF coincide com o do parceiro ARBio, e a guarda antiga aceitava admin por `org_partner`. Isso é vazamento entre empresas.
- Homolog `vrlcdwmlytukrjezrrnf`: o auditor reverteu com `04-rollback-deny-safe`. No reteste, a FSF voltou a receber 403.
- Produção `swzpzcwiasxmjutrmvkm`: nunca recebeu este SQL.
- App em produção: continua em `7a80`, com catálogo admin aprovado (PASS). O acesso B2B do comprador continua bloqueado.
- Próximo passo: a V2 será preparada no projeto isolado. Ela separa o comprador com papel `parceiro_b2b` de vínculo canônico do admin, que só verá a empresa vendedora pelo escopo interno, sem nunca relaxar papéis ou fence. A V2 vai exigir pacote, revisão e homologação próprios.

## Registro original (preservado)

Arquivo fora de `SHA256SUMS` de propósito: os 16 arquivos do pacote foram copiados byte a byte e não foram modificados.

- Origem: projeto isolado `aec6d152-e409-44bf-9cb3-10da72365572`, diretório `scripts/b2b-catalog-read-fence-20261103/`. O commit informado é `efb5d95af2a729e6d68c78ebc2da653edf704902`, mas o snapshot de checkout cruzado veio como `e457df51` e não tinha histórico git. Por isso a correspondência com `efb5d95` não foi provada por git; foi provada só pelos `SHA256SUMS` do pacote (16/16 OK) e por `diff -r` sem diferenças.
- Runtime do original continua no publicado `7a80`; este pacote não altera frontend, bindings, financeiro nem o `AGENTS.md` da raiz.
- Escopo do pacote: só o helper privado de leitura do catálogo, 1 chamada no núcleo de preço e 3 chamadas no catálogo; wrappers, fence global e CRUD ficam intactos.
- (Superado acima) Homolog: aplicado pelo auditor, PRE/POST PASS; JWT teste4 retornou 200 com 5 itens ARBio. Depois foi revertido pela reprovação.
- 12 helpers de papéis/escopo canônico capturados: iguais em produção e em homolog, conforme relatado.
- Continuam fechados: G3/G4 financeiro, carrinho, simulação, pedidos, fiscal e envios.

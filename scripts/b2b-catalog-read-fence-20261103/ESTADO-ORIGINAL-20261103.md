# Estado no projeto original — 03/11/2026

Arquivo fora de `SHA256SUMS` de propósito: os 16 arquivos revisados foram copiados byte a byte e não foram modificados.

- Origem: projeto isolado `aec6d152-e409-44bf-9cb3-10da72365572`, diretório `scripts/b2b-catalog-read-fence-20261103/`. O commit informado é `efb5d95af2a729e6d68c78ebc2da653edf704902`, mas o snapshot de checkout cruzado veio como `e457df51` e não tinha histórico git. Por isso a correspondência com `efb5d95` não foi provada por git; foi provada só pelos `SHA256SUMS` do pacote (16/16 OK) e por `diff -r` sem diferenças.
- Runtime do original continua no publicado `7a80`; este pacote não altera frontend, bindings, financeiro nem o `AGENTS.md` da raiz.
- Escopo do pacote: só o helper privado de leitura do catálogo, 1 chamada no núcleo de preço e 3 chamadas no catálogo; wrappers, fence global e CRUD ficam intactos.
- HOMOLOG `vrlcdwmlytukrjezrrnf`: aplicado pelo auditor (migration `b2b_catalog_read_fence_reviewed_20261103`), PRE/POST PASS e pins confirmados, conforme relatado pelo auditor. Também conforme o auditor: JWT real do teste4 retornou 200 com 5 itens ARBio e preços de teste 100, b2b false e nenhum produto FSF.
- 12 helpers de papéis/escopo canônico capturados: iguais em produção e em homolog, conforme relatado.
- AGUARDANDO: teste negativo FSF (depende do login do usuário). PRODUÇÃO `swzpzcwiasxmjutrmvkm`: SQL NÃO APLICADO.
- Continuam fechados: G3/G4 financeiro, carrinho, simulação, pedidos, fiscal e envios.

# UI de compra para revenda — evidência local

**Status: candidato local INATIVO / NÃO APROVADO.** Nenhum SQL hosted, publicação, NF, recebível, cobrança ou envio externo.

## Escopo entregue localmente

- Nova Entrada mantém o envase biológico e só apresenta **Compra para revenda** após capability `FINISHED_PRODUCT_PURCHASE_V1` positiva.
- O formulário usa produtos e apresentações já cadastrados por empresa; não cria cadastro paralelo nem envia tenant, unidade, conteúdo ou versão.
- Lote do fornecedor, validade, fornecedor, referência e quantidade inteira são validados; a mesma tentativa ambígua conserva a chave e o payload.
- Listagem, reservas, resumo do Cockpit e preview de entrega separam kg/g/L/ml. Disponibilidade de produção continua restrita a lotes com programação.
- A API candidata tem somente dois wrappers `authenticated`; o writer privado segue sem EXECUTE de cliente e reautoriza a operação.

## Resultados independentes

| Bateria | Resultado |
|---|---:|
| UI/unidades/capability/idempotência/resumo | 71/71, exit 0 |
| Regressões Cockpit/estoque | 214/214, exit 0 |
| Diálogo e contratos de entrega | 22/22, exit 0 |
| Físico/API/rollback em PostgreSQL descartável | 58/58, exit 0 |
| Nulidade gate ligado/desligado | 51/51, exit 0 |
| Instalação em camadas | 16/16, exit 0 |
| Legado biológico | 6/6, exit 0 |
| Revisão estática | 39/39, exit 0 |

Prévia local: **build OK** após as alterações. As baterias não são somadas e não constituem E2E real.

## Tentativas preservadas

- `attempts/public-wrapper-first.stdout.txt`: a fixture pública tinha somente `request.jwt.claim.sub`; o guard real negou com `MANUAL_LOT_WRITE_REQUIRES_REVIEWED_RPC`, sem criar estoque. A fixture passou a usar os mesmos claims sintéticos da rota interna, sem relaxar guards.
- `attempts/stale-post-pin.stdout.txt`: o POST reutilizou MD5 da versão anterior do writer privado. O gerador passou a vincular a captura ao SHA exato do candidato.
- `attempts/post-recapture.stdout.txt`: recaptura descartável antes do reteste final com pins.

## Limites

Não houve sessão ARBio real, JWT/RLS/Storage/PostgREST ou browser autenticado. A capability e o writer não estão instalados em produção; portanto a aba não foi homologada em uma sessão real. Revisão independente, implantação coordenada e homologação continuam obrigatórias.

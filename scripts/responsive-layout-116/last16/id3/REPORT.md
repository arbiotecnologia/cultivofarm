# #3 — fechamento entrada comercial/vendedor

Revisão observada: `7fe09b1efe6fe11f2a66fc975392399b3843d948`. Fontes exatas em SOURCE-PINS.json. Nenhuma publicação, SQL, concessão de papel, autenticação hospedada ou gravação em produção.

## Cobertura
36/36 cenários novos: três papéis × duas larguras × seis estados. Administrador e gestor_comercial: `/comercial/pedidos-b2b/novo` → seletor da carteira → parceiro autorizado → catálogo → Adicionar ao pedido. Vendedor: `/comercial/minha-carteira` → Lançar pedido do parceiro atribuído → `/comercial/minha-carteira/pedido` → catálogo. RoleGuard extraído byte-a-byte do corpo original e transpilado localmente; pais, filho NovoPedido, hooks e diálogos são módulos originais atuais, não cópias instrumentadas. Sessão e respostas Supabase são fixtures no limite de transporte do teste; egress externo bloqueado.

Cada papel: 390×844 e 1440×900; registros `administrador.json, gestor_comercial.json, vendedor.json`.
- Positivo líquido: SKU-QA-3, apresentações 5 L/20 L, seleção 5 L, quantidade 3, R$150; confirmação só no estado local do carrinho. Desktop confirma input quantidade 3; celular abre resumo original e lê `3 × Recipiente 5 L` e nome completo.
- Capacidade negada: operação/ação ausente antes do catálogo; não concede acesso.
- Target não atribuído: alerta original e filho não montado; ID de URL não autoriza.
- Sem apresentação: mensagem original e Adicionar ao carrinho desabilitado.
- Contrato de embalagem inválido: estado fechado original; não cai no diálogo líquido.
- Embalagem inteira com oferta explícita: NovoPedido monta AddPackagingToCartDialog, não AddToCartDialog. Teste seleciona oferta SKU-QA-3, quantidade 3 e lê R$150/embalagem no carrinho. Não classificado como montagem de #3; prova o consumidor alternativo.

Os canais parceiro/técnico/simulador e #116 conservam classificação/evidência anterior; não houve nova autorização. Este aceite fecha apenas a lacuna da entrada comercial/vendedor. Não é prova JWT/RLS/Storage nem envio de pedido real.

## Defeito corrigido
Descrição do produto em AddToCartDialog usava truncate: box 23px mobile com scrollWidth excedente. Agora nome/SKU quebram linha: 63px mobile, 43px desktop, sem clipping nos seis positivos. Nome também quebrava/cortava na leitura desktop/resumo móvel do carrinho; removido truncate só nesses nomes. before-administrador.json preserva box antes; positivos atuais trazem description_box e summary_name_box e capturas `*-dialog.png`/`*-summary.png`.

## Segurança/limites
As fixtures validam tenant do ator, carteira/target e schema estrito dos leitores. Só leituras e estado local de carrinho; chamadas de operação ficam fechadas e contadas. Continuidade e pagamento indisponíveis aparecem honestamente no resumo; não foram liberados nem simulados como sucesso. Zero writes tentadas nos cenários concluídos. Sem alterar permissões/rotas/preços/regras comerciais.

## Testes e build
86/86 testes em 5 arquivos, tests.log e tests.exit=0, após as correções. Build automático novo `2026-11-14T15:44:55Z: build OK`, capturado em build-current.log, posterior às duas correções de produto. Não foi executado build manual redundante: harness realiza build/typecheck automaticamente. Timestamp anterior com I/O não foi reaproveitado.

## Reprodução
Servidor Vite local 8080; scripts do projeto fornecem fixtures/harness. O script transforma o corpo original de RoleGuard via esbuild instalado, sem alterar App.tsx:
```sh
for role in administrador gestor_comercial vendedor; do
 python3 scripts/responsive-layout-116/last16/id3/run.py "$role"
done
bun run test -- src/test/comercial/internalOrderEntry.test.tsx src/test/comercial/sellerWriters.test.tsx src/test/comercial/sellerRole.test.ts src/test/comercial/packagingOrder.test.tsx src/test/catalogo/packagingNovoPedidoModes.test.tsx --maxWorkers=2
```
Imports de módulos Vite usam hashes da prévia; se otimizador mudar, alinhar hashes pela resposta de import do Vite. Checkpoints e capturas ficam apenas em scripts. Nenhum artefato em public.

## Fechamento 116
103 completos locais + 1 seletor staff no único contexto já documentado + 12 N/A comprovados = 116. Zero IDs com lacuna restante nesta matriz local. Não equivale a certificação de autorização/produção integral.

# Etiqueta avulsa — implementação local, 16/11/2026

## Entrada e auditoria
- A ação está no Cockpit Operacional existente (`/cockpit-laboratorio`), integrante do Fluxo de Produção; não há nova rota ou módulo.
- A página efetivamente montada é `CockpitConsulta`, não o antigo `CockpitWorkspace`. O workspace e operações de fabricação continuam contidos.
- A emissão oficial por `EtiquetaProdutoActions` exige lote/envase e aprovação técnica. Esse contrato não pode atender uma etiqueta sem produção, portanto foi preservado integralmente.
- A etiqueta avulsa usa um discriminador provisório explícito e reutiliza `LabelScene`, `labelLayout` e `createRecipientLabelsPdf`, sem token, UUID operacional ou QR fictício. Ambos os modos utilizam a mesma cena provisória; as etiquetas oficiais mantêm `recipiente-v2` e seus gates.

## Arquivos
- `src/components/etiquetas/GerarEtiquetaAvulsa.tsx`: ação, formulário único Manual/Produção, exemplos/ajuda, seleção paginada, prévia, impressão e PDF.
- `src/components/cockpit/CockpitConsulta.tsx`: ponto de entrada no cabeçalho existente.
- `src/lib/etiquetaAvulsa.ts`: schema Zod, datas civis/máscara, sequência e snapshot exclusivamente em memória.
- `src/lib/etiquetasLayout.tsx`: variante provisória no renderizador/exportador compartilhados; nenhuma alteração da aprovação oficial.
- `src/components/etiquetas/etiquetas.css`: prévia adaptável e isolamento da saída física, autorizado somente pelo botão validado.
- `src/test/etiquetas/avulsa.test.tsx`: regras de quantidade, volume, datas, autorização e origem.

## Segurança e limites
- Somente Administrador, Gestor e Produção, sessão/perfil ativos e empresa resolvida; guard de rota e controles existentes permanecem intactos.
- Empresa por `tenant_display_name_v1`, conferida pelo hook canônico contra o tenant da sessão. Não usa marca global como empresa nem perfil fiscal desnecessário.
- Produções por `rpc_cockpit_listar_esteira_v1`, via `useCockpitQuery`, com cancelamento/fences; sem consulta direta de tabelas, sem fallback de leitor bloqueado. A autoridade tenant continua no servidor existente.
- Somente produções com estágio conhecido em andamento/concluído; referências do envelope validadas. Produto/lote/cliente/fazenda/microrganismo retornados ficam somente leitura. Fonte alterada/removida bloqueia a saída até nova seleção.
- O leitor permitido não devolve datas efetivas de fabricação/envase, composição integral aprovada, validade, volume individual ou pedido. Esses campos são complementados explicitamente; data programada e volume solicitado total nunca substituem esses dados.
- Manual não exige ID de produção/lote/pedido/estoque; lote é referência textual obrigatória, não registro. Nenhum POST de escrita, RPC de mutação, upload, estoque, financeiro ou fiscalização foi introduzido.
- Validade opcional nesta **etiqueta provisória**, mostrada como não informada se ausente; não é presumida. As etiquetas oficiais continuam exigindo validade/toxicidade aprovadas.
- Composição/conservação/alertas exigem confirmação humana de informação já aprovada; isso não representa aprovação regulatória ou validação server-side de documentos.
- Snapshot é transitório em memória, sem persistência ou histórico/reimpressão. Uma eventual trilha auditável precisa de migração separada em homologação, RLS/RBAC/tenant e idempotência próprios, antes de qualquer instalação em produção.
- Limite local 1–500 etiquetas; numeração inicial + quantidade não excede total; lock síncrono contra cliques concorrentes, fences de sessão antes/depois da conversão. Nova impressão deliberada não é proibida nem alegada como auditada.
- Modelos 100×150, 100×100 e 80×50 mm selecionáveis nesta variante; texto que excede o modelo bloqueia a emissão, sem truncamento. PDF conserva dimensões por página. QR omitido porque esta emissão não possui URI canônica real.

## Verificação
- 117/117 testes em nove arquivos: avulsa, recipiente-v2, recipientes/RPC, revisão canônica, cadastro técnico, rastreio, cancelamento contido, geração por lote e consulta-only.
- Typecheck/build automáticos: `build OK` em 16/11 11:41:24 UTC (checagem final será registrada no fechamento).
- Chromium, formulário e cena originais, com **Auth e transporte exclusivamente sintéticos interceptados no navegador** e egress externo bloqueado: 390×844, 464×522, 1440×900; modos Manual/Produção, fonte imutável, validade vazia, botão/fechamento, PDF e print autorizados. Nenhum erro de página; apenas leitores nome/lista.
- Três PDFs com três recipientes cada: 100×150 mm exatos. Print CSS Chromium: três páginas por viewport, aproximadamente 99,82×149,94 mm (arredondamento CSS do Chromium).
- Evidências temporárias: `/tmp/browser/loose-label/result.json`, script/capturas/PDFs; stdout Vitest `/tmp/loose-label-tests.log`.
- Não houve operação SQL, migração, escrita em dados reais, deploy ou publicação. Autenticação real/JWT/RLS/Storage e impressora física não foram homologados; Supabase externo sem sessão gerenciável.

## Riscos e rollback
- PDF/print são provisórios e locais; não oferecem histórico, revogação física ou certificação legal. Confirmar em impressora real com escala 100%, margens/cabeçalhos desativados.
- Busca depende da disponibilidade/isolamento do RPC instalado; esta implementação não certifica suas políticas por teste sintético.
- Rollback frontend: remover o import/ação de `GerarEtiquetaAvulsa` em `CockpitConsulta`, retirar o ramo provisório/import de `etiquetasLayout` e os estilos `loose-label-*`, então retirar os novos arquivos/testes. Não há rollback de dados/banco necessário. Preservar o fluxo oficial e seus gates.
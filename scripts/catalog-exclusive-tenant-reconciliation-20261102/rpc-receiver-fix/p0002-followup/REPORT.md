# Complemento local P0002 e isolamento

19/19 testes focados PASS (11 SDK real + 8 contratos); separação financeira 5/5 PASS; build automático OK, diff-check sem erros. Typecheck separado e JWT/browser reais não executados. Provas HOMOLOG recebidas são externas e limitadas; identificação visual ainda bloqueia publicação.

Patch completo contra 16f60b95b7a43a026baf53d3bfb931bba203308b: catalog-products-receiver-p0002.patch. Inclui somente hook scoped/bind, contrato P0002 e testes; não modifica runtime financeiro, branding global, SQL ou ACL.

Os logs e hashes anteriores permanecem históricos; README principal recebeu complemento e tem novo hash neste manifesto.

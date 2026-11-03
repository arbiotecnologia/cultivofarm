# Estado no projeto original — V2 (2026-11-03)

- Origem: isolado aec6d152-e409-44bf-9cb3-10da72365572, checkout cruzado no commit 1ebd039ae15bbd5ae34cc9df6597af876852a220.
- Cópia byte a byte (`diff -r` sem diferenças); `SHA256SUMS` 30/30 OK. Esta nota fica fora das somas.

## Produção (relato do auditor, não reexecutado aqui)
- V2 APLICADA no banco de produção `swzpzcwiasxmjutrmvkm` pela migration `b2b_catalog_read_fence_v2_reviewed_20261103`; PRE e POST PASS.
- JWT real teste4: 200 com 11 itens permitidos (4 produtos e 7 microrganismos); famílias biologico, quimico e fertilizante_adubo.
- Tela de produção recarregada exibe BioInseticida01, Bombarbio e referências sintéticas químico/fertilizante, sem erro do catálogo.
- Controle negativo FSF em PRODUÇÃO concluído com sessão real (rh@refilinformatica.com.br):
  - ambos os overloads de get_partner_catalog_secure para o parceiro 7e52de9a-4bed-4d1e-8200-3255a805465c: 403, SQLSTATE 42501, forbidden_partner;
  - tenant_product_list(false): 200 somente com os 2 próprios (dcb36a32-1139-449a-83a6-bede2a57bb5f e 44eb9f58-cd77-4635-8dbb-9cc4e1e16998); UI do catálogo mostra os 2;
  - nenhuma escrita de negócio nesse reteste.
- Conclusão: leitura B2B V2 FINALIZADA, com positivos do comprador e negativos FSF em homolog e produção.
- Inalterados: faturas 5 e recebíveis 10; fiscal nfe/nfse/production 0; dispatch/test/f4 false; crons 4/5/6/8 false e 1/2/7 true.
- Advisors agregados inalterados (não significa projeto sem achados).

## Homolog (relato do auditor)
- rh@FSF: 403 forbidden_partner nos dois overloads; catálogo próprio 2 itens 200.
- teste4: 200, 5 itens.

## Situação
- Runtime publicado permanece 7a80. Corrigida somente a leitura do catálogo B2B; fluxo completo de pedidos continua NÃO aprovado (carrinho/simulação/pedidos/fiscal/envios seguem fechados).
- V1 (scripts/b2b-catalog-read-fence-20261103, efb5) continua REPROVADA — NÃO APLICAR.
- Nesta cópia nenhum SQL, deploy, publicação, binding, financeiro ou outro arquivo foi alterado pelo agente.

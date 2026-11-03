# Estado no projeto original — V2 (2026-11-03)

- Origem: isolado aec6d152-e409-44bf-9cb3-10da72365572, checkout cruzado no commit 1ebd039ae15bbd5ae34cc9df6597af876852a220.
- Cópia byte a byte (`diff -r` sem diferenças); `SHA256SUMS` 30/30 OK. Esta nota fica fora das somas.
- Status V2 (relato do auditor, não reexecutado aqui): PRE produção e homolog PASS; aplicado SOMENTE em homolog; POST PASS.
  - JWT real rh@FSF: 403 forbidden_partner nos dois overloads; próprio catálogo 2 itens 200.
  - JWT real teste4 (homolog): 200, 5 itens ARBio, preços 100; contrato C1B_DUAL_TENANT_V1.
- Produção: SQL V2 NÃO aplicado; aguarda aplicação pelo auditor. Runtime original segue 7a80; B2B em produção permanece bloqueado até lá.
- V1 (scripts/b2b-catalog-read-fence-20261103, efb5) continua REPROVADO — NÃO APLICAR.
- Nenhum SQL, deploy, publicação, binding, financeiro ou AGENTS raiz alterado nesta cópia.

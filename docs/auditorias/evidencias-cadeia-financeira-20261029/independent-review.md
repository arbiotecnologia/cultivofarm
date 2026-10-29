# Revisão independente — 29/10/2026

Agentes read-only: sub_zktxh9cw (17 consumidores/BI), sub_y8ashtar (revisão inicial), sub_31tcmxjr (revisão final e reexecução PG).

Revisão inicial indicou ausência de dependências de views/policies: complemento SELECT pg_rewrite/pg_policy capturado e incluído nas arestas estáticas. Overloads lexicais, SQL dinâmico e cadeias externas continuam não resolvidos, explicitamente BLOCKED.

Revisão final reexecutou o runner:37PASS/0FAIL inesperados,18RED/19GREEN. Confirmou duas violações contratuais esperadas no RED, hashes dos corpos, snapshot/ledger/replay/estorno e ausência de autorização positiva do wrapper. Parecer: prova sintética válida e limitada; NO-GO operacional/semântico mantido.

Ressalva: ADD CONSTRAINT do runner não é idempotente em schema arbitrário. O runner sempre cria schemas novos de PostgreSQL descartável e reinicia os schemas entre modos; não é instalador nem suporta reaproveitar schema existente. FKs cobrem somente alvos monetários declarados, não o grafo completo. Sem erro demonstrado que invalide37assertions.

Hashes dos scripts conferidos independentemente:
- audit-receivable-recursive.py:9dd44ec34fe729a07db6ee0ed58f7f05d5ae83d3b601b7c245dd193aa56f2570
- test-receivable-red-green.py:e7e5abfcbe30e0d3af9373cce149c29315bfc5a46ad605484df2bfaf259dd83c

Não somar reexecução independente ao total37. Revisão não homologa JWT/RLS, frontend completo, contabilidade ou implantação.
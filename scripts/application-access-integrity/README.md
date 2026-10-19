# Acesso a aplicações — revisão restrita

Pacote SQL local e revisável. Não aplica produção, não abre RPC de salvamento, não cria fixtures hospedadas nem modifica PDF/monitor/RLS. Destino externo obrigatório: `swzpzcwiasxmjutrmvkm`, comprovado pelo auditor antes de qualquer aplicação. Sem GUC de autorização ou resolver paralelo.

Os resultados locais não são login real ou homologação JWT/HTTP. Detalhes finais em relatório e manifesto deste diretório.

- `candidate.sql.review` / `rollback.sql.review`: aplicar somente por auditor após revisão/destino provado; rollback restaura falha conhecida, nunca automático.
- `preflight-readonly.sql` / `postflight.sql.review`: inventário e checks; não executar candidata como preflight.
- `test-local.py`: laboratório PostgreSQL17 descartável em /tmp; executar com Python3. `--capture` só mostra canonicalização local, não atualiza goldens.
- `SHA256.json`, `contracts.json`, `manifest.json`, `SHA256SUMS`: fingerprints estáticos e fontes PDF protegidas.
- `typecheck-independent.md` / `independent-inputs.json`: prova de build ≠ tipos e entradas para checker independente no checkout completo.
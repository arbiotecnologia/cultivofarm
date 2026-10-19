# Recibo — exportação compacta atual

- Fonte HEAD no instante da coleta: `776d6b50bd32297bd4227ebc20d9d6379d9d926c`. Fonte: arquivos locais atuais, não GitHub main antigo. SHA por arquivo comprova os inputs sem depender de HEAD posterior de documentação.
- Caminho inicial para `read_file`: `scripts/typecheck-compact/snapshot/manifest.json`.
- Partes: `scripts/typecheck-compact/snapshot/part-001.utf8.txt` até `part-026.utf8.txt`, ordem numérica. 25 partes200.000 bytes; última121.692 bytes. Nomes/SHA256 no manifesto.
- Manifesto SHA256: `a44fe574cc7893540b5449c2d6b0a9cca749101f3398e89048e23b0dff5dbbd8`.
- 1668 arquivos verificados após materialização completa em destino limpo; cada byte comparado também à fonte atual. Inclui todos src, configs/lock e imports relativos transitivos externos necessários ao checker.
- 7/7 testes Python PASS (UTF-8/CRLF/assets, corrupção sem writes parciais, exclusões, symlink/destino, placeholders sintéticos e imports transitivos).
- Nenhuma alteração runtime, SQL/DDL/DML, publicação ou checker manual. **Typecheck app NÃO CERTIFICADO**. Instruções de instalar sem scripts e executar TypeScript do lock com `-p tsconfig.app.json` em README; app/node logs/exit codes separados.
- Recuperação canônica e pacotes SQL/PDF preservados; este complemento só transporta inputs para auditoria externa.
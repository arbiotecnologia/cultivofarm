# Checkout atual compacto para auditor independente

Fonte: checkout atual do sandbox, HEAD registrado no manifesto. **Não usa GitHub main fd9e2129 de12/09**. Nenhum runtime/SQL/PDF foi alterado para ocultar erro de tipos. Checker manual continua proibido no ambiente; app **NÃO CERTIFICADO** até recibo efetivo externo.

`snapshot/part-NNN.utf8.txt` são partes ASCII/UTF-8 de até200.000 bytes. Concatenar em ordem → base64 decode → gzip decompress → JSON UTF-8 **mapa path→conteúdo**. Texto preserva acentos/LF/CRLF byte-exatos. Assets binários de `src/**` também estão no mapa, com valores base64; seus paths constam em `binary_assets_base64` no manifesto. Inclui ponteiros `.asset.json` referenciados; não baixa mídia externa nem precisa dela para typecheck.

Inclui todo `src/**` textual/asset, `tsconfig*.json`, `package.json`, `bun.lock`, configs Vite/Vitest/Tailwind/PostCSS, `index.html` e `components.json`, além dos imports relativos transitivos fora de `src` exigidos pelos testes (módulos puros existentes). Exclui `.env*`, Git, dependências e output. Nenhuma variável de ambiente/session/secret é lida. Somente chaves publicáveis existentes na fonte canônica permanecem na fonte, sem credenciais privadas adicionadas. Placeholders PEM inválidos QUJD/MIIEvQIBADAN dos testes são preservados, sem chaves privadas reais. Manifesto contém SHA256 de cada parte, JSON, gzip, base64 e cada arquivo original.

Auditor pode ler manifesto e as poucas partes por `read_file`, salvando o conteúdo integral, sem cercas markdown ou truncamento. Usar `materialize.py` para verificar **todas** as hashes antes de criar arquivos:

```sh
python3 materialize.py snapshot/manifest.json /tmp/cultivofarm-checkout
cd /tmp/cultivofarm-checkout
bun install --frozen-lockfile --ignore-scripts
./node_modules/.bin/tsc --version > checker-version.log 2>&1
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit > typecheck-app.log 2>&1
app_exit=$?
printf '%s\n' "$app_exit" > typecheck-app.exit
./node_modules/.bin/tsc -p tsconfig.node.json --noEmit > typecheck-node.log 2>&1
node_exit=$?
printf '%s\n' "$node_exit" > typecheck-node.exit
```

Não usar `bun run typecheck` raiz como prova de app: `files:[]` com references não comprova `src`. App/node são recibos separados, registrar versão/comando/config/log/exit code e hash manifesto. Não executar build, instalar scripts ou trocar compiler silenciosamente. TypeScript do lock e `tsgo` externo não têm resultados intercambiáveis.

Exportação usa somente bibliotecas padrão Python. `python3 test_export.py` valida roundtrip acentos/CRLF/binário, exclusões, destino não vazio, corrupção e symlinks. ZIP entregue é apenas transporte dessas partes/manifesto/instruções/scripts, não dependências/Git/output do app.
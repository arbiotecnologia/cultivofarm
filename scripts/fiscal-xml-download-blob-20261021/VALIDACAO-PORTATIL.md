# Montagem externa da candidata — não implantação

Executar no checkout revisado com Python 3: `python3 scripts/fiscal-xml-download-blob-20261021/prepare-validation.py /tmp/fiscal-xml-review`.
O script recusa destino existente/fora de /tmp, exclui credenciais, dependências e build,
preserva runtime e monta os dois arquivos UI + Edge candidata e rollback numa árvore isolada.
`SOURCE.SHA256SUMS` registra todos os fontes; `supabase/config.LOCAL.toml` não é
config exportada LIVE. Config v94 foi verificada externamente pelo auditor
(verify_jwt=true/import_map=false); conferir novamente no predeploy.

## Comandos na árvore externa (não no app ativo)

1. `sha256sum -c SOURCE.SHA256SUMS`
2. `bun install --frozen-lockfile`
3. `bun run test src/test/fiscal/fiscalXmlEngine.downloadCandidate.test.ts src/test/fiscal/fiscalXmlAuthenticatedDownload.test.tsx`
4. `bun run typecheck -- -p tsconfig.app.json` e `bun run typecheck -- -p tsconfig.node.json`
5. `bun run build` (Vite produção; sem chaves reais, sem deploy).
6. `deno check --config deno.json supabase/functions/fiscal-xml-engine/index.ts supabase/functions/fiscal-xml-engine/rollback-deny.ts`
7. `deno bundle --config deno.json supabase/functions/fiscal-xml-engine/index.ts -o /tmp/fiscal-xml-review.bundle.js`

Registrar versões, exit codes, logs, hashes do bundle/artefatos e deno.lock resolvido.
O bundle local não reproduz limites/config do bundler Supabase; comparar fonte,
config e dependências LIVE v94, já comprovadas externamente, exige reconfirmação
de ausência de drift antes de implantação.

## Escopo do corpo e memória

Corpo comum às três ações: JSON de identificadores limitado a **16 KiB** e **5 s
desde entrada**; timeout/abort 504, excesso 413, JSON inválido 400. `generate` mantém
ação padrão, parâmetros e tail fiscal byte-exatos; nenhuma fase fiscal ganha
watchdog novo. O ingresso é a única alteração comum; clientes válidos existentes
cabem no teto (UUIDs, idempotency key até 200 caracteres). Rollback conserva essa proteção.

XML usa `.download(...).asStream()` do SDK, sem Blob antecipado/HEAD adicional.
Metadados de bytes da execução são validados antes de I/O; Length ausente/falso
nunca substitui contagem real. Ao exceder **10 MiB**, cancelar reader e sinal sem
esperar transporte; timeout/cancelamento também cancelam reader, inclusive pendurado.
Só após leitura completa, bytes/hash e prova fresca existe resposta binária.
Buffer acumulado até 10 MiB + cópia final até 10 MiB; chunk corrente/filas do
transporte são externos ao controle da aplicação: não prometer teto RSS exato.
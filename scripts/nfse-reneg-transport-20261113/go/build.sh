#!/usr/bin/env bash
# Reprodutível: gera o módulo de produção (sem tag de teste) e o artefato TS embutido.
set -euo pipefail
cd "$(dirname "$0")"
OUT=../../../supabase/functions/_shared/nfse/tlsreneg
mkdir -p "$OUT"
GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w -buildid=" -o /tmp/reneg.wasm .
GOOS=js GOARCH=wasm go build -tags nfsetest -trimpath -ldflags="-s -w -buildid=" -o /tmp/reneg_test.wasm .
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" "$OUT/wasm_exec.js"
python3 - "$OUT" <<'PY'
import base64,gzip,hashlib,sys
raw=open('/tmp/reneg.wasm','rb').read()
gz=gzip.compress(raw,9,mtime=0)
open(sys.argv[1]+'/renegWasm.generated.ts','w').write(
 '// GERADO por scripts/nfse-reneg-transport-20261113/go/build.sh — não editar.\n'
 f'export const RENEG_WASM_SHA256 = "{hashlib.sha256(raw).hexdigest()}";\n'
 f'export const RENEG_WASM_GZ_B64 = "{base64.b64encode(gz).decode()}";\n')
print(hashlib.sha256(raw).hexdigest(), len(raw), len(gz))
PY

#!/usr/bin/env bash
set -euo pipefail
H=$(dirname "$(realpath "$0")"); D=$(mktemp -d /tmp/pg-product-fiscal-XXXXXX)
PG=$(printf '%s\n' /nix/store/*-postgresql-17.11/bin | head -1)
export PATH="$PG:$PATH"
python3 - "$H" <<'PY'
from pathlib import Path
import sys
h=Path(sys.argv[1]); root=h.parents[1]
s=(root/'supabase/migrations/20260814000000_fase_f2_regulatorio_microrganismos.sql').read_text()
a=s.index('CREATE OR REPLACE FUNCTION public.fn_fiscal_item_profile_gate_eval('); b=s.index('REVOKE ALL ON FUNCTION public.fn_fiscal_item_profile_gate_eval',a)
Path('/tmp/product-dossier-gate-test.sql').write_text(s[a:b])
s=(h/'profile-foundation.sql').read_text(); a=s.index(' IF md5('); b=s.index(' IF EXISTS(SELECT 1 FROM public.produtos',a)
Path('/tmp/product-profile-foundation-test.sql').write_text(s[:a]+s[b:])
PY
chown lovable "$D"
RUN=(setpriv --reuid="$(id -u lovable)" --regid="$(id -g lovable)" --init-groups --)
"${RUN[@]}" initdb -D "$D/data" -U postgres -A trust >/dev/null
"${RUN[@]}" pg_ctl -D "$D/data" -o "-k $D -p 55439 -c listen_addresses=''" -l "$D/log" start >/dev/null
trap '"${RUN[@]}" pg_ctl -D "$D/data" stop -m fast >/dev/null; rm -rf "$D"' EXIT
psql -h "$D" -p 55439 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$H/local-tests.sql"
psql -h "$D" -p 55439 -U postgres -d postgres -v ON_ERROR_STOP=1 -f "$H/document-tests.sql"
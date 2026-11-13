#!/usr/bin/env bash
# Cluster PostgreSQL local descartável em /tmp; nunca conecta a produção.
set -euo pipefail
H=$(cd "$(dirname "$0")" && pwd); D=/tmp/pg-dps-$$; mkdir -p $D; chown lovable $D; RUN="setpriv --reuid=$(id -u lovable) --regid=$(id -g lovable) --init-groups --"
$RUN initdb -D $D/data -U postgres -A trust >/dev/null
$RUN pg_ctl -D $D/data -o "-k $D -p 55433 -c listen_addresses=''" -l $D/log start >/dev/null
trap '$RUN pg_ctl -D $D/data stop -m fast >/dev/null; rm -rf $D' EXIT
P="psql -h $D -p 55433 -U postgres -d postgres -q -v ON_ERROR_STOP=1"
$P -f $H/pg_stub_scaffold.sql
python3 - "$H" > /tmp/billing_v0_$$.sql <<'P'
import sys,pathlib
s=pathlib.Path(sys.argv[1],'../../supabase/migrations/20261113154235_39f65997-aa0a-417f-afe1-8b7ce572ac60.sql').read_text()
i=s.index('create or replace function public.rpc_service_billing_create_draft_v1'); j=s.index('$$;',i)+3
print(s[i:j])
P
$P -f /tmp/billing_v0_$$.sql
$P -f $H/migration/20261113190000_service_nfse_dps_profile.sql
$P -f $H/pg_cases.sql

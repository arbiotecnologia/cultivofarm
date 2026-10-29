#!/usr/bin/env bash
# READ-ONLY preflight. No network writes, no DB access, no secrets printed. Exit != 0 = NO-GO.
set -u; cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"; fail=0
ok(){ echo "PASS $1"; }; ko(){ echo "FAIL $1"; fail=1; }
CANON=swzpzcwiasxmjutrmvkm
grep -q "VITE_SUPABASE_PROJECT_ID=\"\?$CANON" .env 2>/dev/null && ok "ref .env = $CANON" || ko "ref .env ausente/divergente"
grep -q "$CANON" src/integrations/supabase/client.ts && ok "cliente canônico aponta $CANON" || ko "cliente canônico divergente"
for r in yzszlzjpovmcteuxjznj chkgpuawcswhefiabwsm navfzbwgwzruipouyfnk ikaauvsflpmamgxmkhoq; do
  rg -q "$r" src supabase/config.toml 2>/dev/null && ko "ref proibido $r presente" || ok "ref proibido $r ausente"; done
rg -q "service_role" src --glob '!**/types.ts' && ko "service_role citado no frontend" || ok "sem service_role no frontend"
n=$(ls supabase/migrations | rg -c "\.review$" || true); [ "${n:-0}" = 0 ] && ok "nenhum .review em migrations" || ko ".review em migrations"
echo "INFO commit=$(git rev-parse HEAD 2>/dev/null) data=$(date -u +%FT%TZ)"
echo "MANUAL confirmar no painel (sem copiar valores): COMMUNICATION/EMAIL/WHATSAPP_DELIVERY_ENABLED=false, INAPP_ADAPTER=false, WHATSAPP_WEBHOOK=false"
echo "MANUAL confirmar versão publicada (meta ID) == commit acima; rollback = republicar versão anterior registrada"
exit $fail

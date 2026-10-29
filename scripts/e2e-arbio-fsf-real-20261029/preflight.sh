#!/usr/bin/env bash
# Wrapper. VALIDADOR DE EVIDÊNCIA FORNECIDA — não verifica runtime, rede ou credenciais. Ver preflight.py.
command -v python3 >/dev/null || { echo "DENY python3 ausente"; echo "PREFLIGHT_RESULT READONLY=DENY WRITE_SCENARIOS=DENY"; exit 1; }
exec python3 "$(dirname "$0")/preflight.py"

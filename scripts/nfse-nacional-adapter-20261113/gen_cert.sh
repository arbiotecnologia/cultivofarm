#!/usr/bin/env bash
# Gera A1 SINTÉTICO efêmero (nunca ICP-Brasil real) com OtherName CNPJ
# (OID 2.16.76.1.3.3) no subjectAltName. Uso: gen_cert.sh <dir> <cnpj> [dias]
set -euo pipefail
d="$1"; cnpj="$2"; days="${3:-30}"; mkdir -p "$d"
cat > "$d/ext.cnf" <<CNF
[req]
distinguished_name=dn
prompt=no
[dn]
CN=QA SINTETICO LTDA:${cnpj}
O=ICP-Brasil SINTETICO
[ext]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,nonRepudiation,keyEncipherment
extendedKeyUsage=clientAuth,emailProtection
subjectAltName=otherName:2.16.76.1.3.3;PRINTABLESTRING:${cnpj},otherName:2.16.76.1.3.4;PRINTABLESTRING:000000000000000000000000000000
CNF
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$d/key.pem" -out "$d/cert.pem" -days "$days" -config "$d/ext.cnf" -extensions ext -set_serial 0x$(openssl rand -hex 8) 2>/dev/null

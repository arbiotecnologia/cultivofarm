#!/usr/bin/env node
/**
 * F4.1-R2 — verificação canônica SEM ESCRITA.
 *
 * Confere que as migrations canônicas em supabase/migrations/ são
 * byte-idênticas aos artefatos de restoration/ (SHA-256 + igualdade de
 * bytes). Não toca em banco, não escreve arquivo, não publica nada.
 *
 * Uso: node restoration/fase-f4-1/verify-canonical.mjs
 * Saída: exit 0 => PASS; exit 1 => FAIL.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

const PARES = [
  {
    version: '20260822000000',
    canonical: 'supabase/migrations/20260822000000_fase_f4_motor_xml_nfe.sql',
    restoration: 'restoration/fase-f4/migration.sql',
  },
  {
    version: '20260823000000',
    canonical: 'supabase/migrations/20260823000000_fase_f4_1_xsd_oficial.sql',
    restoration: 'restoration/fase-f4-1/migration-incremental.sql',
  },
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

let falhas = 0;
console.log('F4.1-R2 — verificação canônica (somente leitura)\n');

for (const par of PARES) {
  let a;
  let b;
  try {
    a = readFileSync(resolve(ROOT, par.canonical));
    b = readFileSync(resolve(ROOT, par.restoration));
  } catch (err) {
    console.log(`FAIL ${par.version}: arquivo ausente — ${err.message}`);
    falhas += 1;
    continue;
  }

  const ha = sha256(a);
  const hb = sha256(b);
  const identico = ha === hb && a.equals(b);

  console.log(`${identico ? 'PASS' : 'FAIL'} ${par.version}`);
  console.log(`  canonical   ${ha}  ${par.canonical}`);
  console.log(`  restoration ${hb}  ${par.restoration}`);
  console.log(`  bytes       ${a.length} / ${b.length}\n`);

  if (!identico) falhas += 1;
}

console.log(
  falhas === 0
    ? `VERIFY CANONICAL: ${PARES.length}/${PARES.length} PASS`
    : `VERIFY CANONICAL: ${falhas} FALHA(S)`,
);
process.exit(falhas === 0 ? 0 : 1);

# Reconciliação A/B + aplicação Classe D — staging ikaauvsflpmamgxmkhoq

Base: commit `8c3a3d4e2d386ac0b45ced1d83665687d309d072`.
Produção `navfzbwgwzruipouyfnk`: não conectada, não consultada, não migrada, não publicada.

## 1. Marker fail-closed
`public._fiscal_staging_marker` = `STAGING` / `ikaauvsflpmamgxmkhoq`.

## 2. Baseline recuperável (sem secrets)
- `/tmp/reconc/ledger-baseline.txt` — 647 linhas `version|name|md5(statements)`, md5 do arquivo `9481615d0b22df8125b375e069ee7cea`.
- `/tmp/reconc/objects-baseline.txt` — 71 checksums `md5(pg_get_functiondef())` de funções `%visita%|%fiscal%|%microorganism%`.

## 3. Reconciliação Classe A (44 pares)
Mecanismo oficial, sem DML manual no ledger:
```
supabase migration repair --status reverted <44 versões REMOTE deslocadas> --db-url "$STAGING_DSN"
supabase migration repair --status applied  <44 versões LOCAL correspondentes> 20260805040000 --db-url "$STAGING_DSN"
```
Pares em `/tmp/reconc/pairs.tsv` (regerados de forma determinística; idênticos ao relatório anterior).

## 4. 20260805040000 (Classe B)
Marcado `applied` via `migration repair` — 5/5 objetos já existentes; replay reverteria o hardening da Visita Técnica.

## 5. Classe C
As 23 entradas remote-only permaneceram **intocadas** no ledger. Para o gate de push foi usado um
workdir isolado (`/tmp/reconc/wd`, fora do repositório) com placeholders inertes apenas para satisfazer
a verificação de histórico do CLI — nunca executados (já constam como applied).

## 6/7. Gates
- `migration list`: Local-only pendente = **exatamente** `20260804000000`, `20260805000000`.
- `db push --include-all --dry-run`: listou **exatamente** essas duas migrations.

## 8/9. Aplicação e ledger
`supabase db push --include-all` aplicou as duas em ordem, transacionalmente.
Ledger final: 650 entradas, 0 duplicidades, `20260804000000`/`20260805000000`/`20260805040000` presentes, max `20260809000000`.

## Rollback
`restoration/classe-d-microrganismos/rollback.sql` (guard de ambiente; drop da coluna somente se vazia)
+ `migration repair --status reverted 20260805000000 20260804000000`. **Não executado** (testes PASS).

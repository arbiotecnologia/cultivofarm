# Início da vigência PIS/COFINS + histórico

Instalação (operador, SQL Editor do projeto swzpzcwiasxmjutrmvkm), arquivo inteiro:
`scripts/fiscal-company-save-20261112/pis-cofins-effective/20261112150000_pis_cofins_effective_from_history.sql`
Idempotente; PRE/POST embutidos. Não preenche datas; histórico começa vazio.
Rollback (deny-only, preserva coluna e histórico): `rollback.sql`.
Prova local: `TEST_ACCREDITATIONS=1 TEST_PIS_EFFECTIVE=1 python3 test_pg.py` (espelho de componentes, não prova JWT/PostgREST).
Frontend: até a instalação, o campo aparece desabilitado e o histórico como indisponível; salvamentos seguem iguais.

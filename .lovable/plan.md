# Evidência somente leitura: 08b381e7 -> b5e4acbf

Este documento é só um relatório. Nenhum arquivo do projeto foi alterado, nenhum SQL hosted foi executado, nada foi publicado e o writer não foi reaberto. Usei apenas `git cat-file`, `git show`, `git diff` e `sha256sum` sobre os commits locais. Ao aprovar, nenhuma implementação será feita.

Base: `scripts/owner-orders-20261023/credit-numeric-20261024/final-integrated-manual-20261024/`

## SHA256 de origin/candidate.sql.review

- 08b381e7f94597521354bca28f6fe1d65ef09e3a: `29197da86bfa0fe4495e4d01acb5383d0ab56829a6cdbc18ebfdf42a247e5863`
- b5e4acbf51576db1a9a0e1489138f45c9b619f8e: `0d69b27b43066fc6f57526177f9338d820ea5ac4608faadce078c57dbfb057aa`

## Arquivos alterados (7 arquivos, 112 inserções, 12 remoções)

- `.../final-integrated-manual-20261024/AGENTS.md` (+1)
- `.../final-integrated-manual-20261024/README.md` (8)
- `.../final-integrated-manual-20261024/SHA256SUMS` (10)
- `.../final-integrated-manual-20261024/origin/assemble.py` (26)
- `.../final-integrated-manual-20261024/origin/candidate.sql.review` (+20)
- `.../final-integrated-manual-20261024/origin/test-local.py` (48)
- `src/test/saas/c2-final-integrated-manual-postgres.test.ts` (11)

## Diff unificado completo de origin/candidate.sql.review

```diff
diff --git a/scripts/owner-orders-20261023/credit-numeric-20261024/final-integrated-manual-20261024/origin/candidate.sql.review b/scripts/owner-orders-20261023/credit-numeric-20261024/final-integrated-manual-20261024/origin/candidate.sql.review
index 4314825e..96c9e406 100644
--- a/scripts/owner-orders-20261023/credit-numeric-20261024/final-integrated-manual-20261024/origin/candidate.sql.review
+++ b/scripts/owner-orders-20261023/credit-numeric-20261024/final-integrated-manual-20261024/origin/candidate.sql.review
@@ -2,7 +2,27 @@ BEGIN;
 -- INACTIVE REVIEW ONLY. Does not reopen writer; no internal-origin bypass or RLS change.
 -- Reconciled: preserves LIVE manual initial-installments correction (private context, exact .34/.33/.33 split,
 -- custom dates inserted first) and adds the B2B contractual schedule branch on top of it.
+-- Owner A accounting gate runs FIRST in this same transaction, locking only A settings rows FOR SHARE until COMMIT;
+-- preflight-accounting.sql remains a separate READ ONLY diagnostic. Never validates/fabricates attestation.
 SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
+DO $accounting_gate$
+DECLARE n integer; ready boolean;
+BEGIN
+ IF NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='public.company_fiscal_settings'::regclass AND c.relname='ux_company_fiscal_settings_active_organization' AND i.indisunique AND i.indisvalid AND pg_get_indexdef(i.indexrelid)='CREATE UNIQUE INDEX ux_company_fiscal_settings_active_organization ON public.company_fiscal_settings USING btree (organization_id) WHERE (is_active IS TRUE)') THEN
+   RAISE EXCEPTION 'C2_ACCOUNTING_GATE_INDEX_DRIFT' USING ERRCODE='42501';
+ END IF;
+ PERFORM 1 FROM public.company_fiscal_settings c WHERE c.organization_id='007bb519-cba0-4704-be2c-cb93ad010048' ORDER BY c.id FOR SHARE;
+ SELECT count(*),coalesce(bool_and(c.configuration_status='VALIDATED'
+   AND c.accounting_validated_at IS NOT NULL
+   AND nullif(btrim(c.legal_name),'') IS NOT NULL
+   AND nullif(btrim(c.cnpj),'') IS NOT NULL),false)
+ INTO n,ready FROM public.company_fiscal_settings c
+ WHERE c.organization_id='007bb519-cba0-4704-be2c-cb93ad010048' AND c.is_active IS TRUE;
+ IF n<>1 OR NOT ready THEN
+   RAISE EXCEPTION 'C2_ACCOUNTING_PREREQUISITE_BLOCKED: owner A requires one genuinely accounting-validated active fiscal configuration; human review required, writer must stay false'
+   USING ERRCODE='42501';
+ END IF;
+END $accounting_gate$;
 DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.audit_partner_order_payment_terms()'::regprocedure AND md5(pg_get_functiondef(oid))='96b68bec5b11f2a414f333c68a00d765' AND pg_get_userbyid(proowner)='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}') THEN RAISE EXCEPTION 'origin_dependency_drift:public.audit_partner_order_payment_terms'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.fn_b2b_guard_credit_approval_fields()'::regprocedure AND md5(pg_get_functiondef(oid))='8902498ed09c4c5804b1749ee0c31cd7' AND pg_get_userbyid(proowner)='postgres' AND proacl::text IS NOT DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}') THEN RAISE EXCEPTION 'origin_dependency_drift:public.fn_b2b_guard_credit_approval_fields'; END IF;
```

## Trecho relevante de origin/test-local.py (diff)

Tudo abaixo é um **teste local sintético**: roda em PostgreSQL descartável, com Auth sintética e o UUID do owner A trocado pelo A sintético na cópia temporária `candidate.synthetic-owner.sql`, apagada ao final. Isso **não** é validação hosted, não certifica JWT/RLS e não simula a validação contábil real de A, que continua pendente.

```diff
@@ -106,8 +106,51 @@
 exec(compile((H.parent/'atomicity.py').read_text(),str(H.parent/'atomicity.py'),'exec'))
-command('preflight.sql');command('candidate.sql.review',True)
-pg.sql((H/'candidate.sql.review').read_text());ok('inactive candidate parsed/applied only in disposable PG')
+# In-transaction accounting gate: run the COMPLETE candidate directly (owner A UUID mapped to synthetic A).
+OWNER_A='007bb519-cba0-4704-be2c-cb93ad010048'
+production_candidate=(H/'candidate.sql.review').read_text()
+ok('candidate starts with owner A accounting gate before any guard/DDL',production_candidate.index('DO $accounting_gate$')<production_candidate.index('DO $guard$')<production_candidate.index('ALTER TABLE public.partner_orders ADD COLUMN'))
+SYN=H/'candidate.synthetic-owner.sql'
+SYN.write_text(production_candidate.replace(OWNER_A,A))
+def settings(sql):pg.sql(f"SET session_replication_role=replica; {sql}; SET session_replication_role=origin;")
+def gate_rejects(label):
+    before=catalog_state()
+    err=pg.sql(SYN.read_text(),ok=False)
+    assert 'C2_ACCOUNTING_PREREQUISITE_BLOCKED' in err,err[-1500:]
+    assert catalog_state()==before,'gate failure left DDL'
+    assert pg.sql("SELECT count(*) FROM pg_attribute WHERE attrelid='public.partner_orders'::regclass AND attname='c2_external_origin_snapshot' AND NOT attisdropped")=='0'
+    ok('direct candidate rejected atomically before DDL: '+label)
+gate_rejects('owner A configuration absent')
+settings(f"INSERT INTO public.company_fiscal_settings(...) VALUES('{SETTINGS}','{A}',true,'DRAFT',NULL,'Synthetic issuer','00000000000000'),('{U(10)}','{B}',true,'VALIDATED',now(),'Synthetic issuer B','11111111111111')")
+gate_rejects('owner A DRAFT with NULL attestation')
+settings(f"UPDATE ... SET configuration_status='VALIDATED' WHERE id='{SETTINGS}'")
+gate_rejects('owner A VALIDATED status but NULL accounting_validated_at')
+settings(f"UPDATE ... SET accounting_validated_at=now(),cnpj=NULL WHERE id='{SETTINGS}'")
+gate_rejects('owner A NULL CNPJ')
+settings(f"UPDATE ... SET cnpj='00000000000000',is_active=false WHERE id='{SETTINGS}'")
+gate_rejects('owner A only inactive configuration')
+settings(f"UPDATE ... SET is_active=true WHERE id='{SETTINGS}'")
+ok('owner B validation never satisfies owner A gate (checked above with B VALIDATED)')
+# Lock scope: hold the gate inside an open transaction; A row changes wait/fail, B is unaffected.
+gate_block=...  # exact DO $accounting_gate$ block sliced from the synthetic candidate
+holder=pg.popen('');holder.stdin.write("SET application_name='c2_accounting_gate_holder'; BEGIN; "+gate_block+" SELECT pg_sleep(8); ROLLBACK;\n")
+... wait until holder is active in pg_stat_activity ...
+err=pg.sql("SET lock_timeout='500ms'; ... UPDATE ... SET accounting_validated_at=NULL WHERE id='{SETTINGS}';",ok=False)
+ok('A attestation cannot change while gate transaction is open','lock timeout' in err)
+err=pg.sql("... UPDATE ... SET is_active=false WHERE id='{SETTINGS}';",ok=False)
+ok('A deactivation cannot happen while gate transaction is open','lock timeout' in err)
+err=pg.sql("... INSERT second active A row ...",ok=False)
+ok('second active A configuration conflicts on partial unique index','ux_company_fiscal_settings_active_organization' in err)
+pg.sql("... BEGIN; UPDATE ... SET legal_name=legal_name WHERE id='{U(10)}'; ROLLBACK;")
+ok('owner B settings are not locked by A gate')
+holder.wait(timeout=30)
+ok('A settings unchanged after lock probes', ...=='VALIDATEDtruetrue')
+command('preflight.sql');command(SYN.name,True)
+pg.sql(SYN.read_text());ok('inactive candidate applied directly with validated synthetic owner (disposable PG only)')
+SYN.unlink()
@@ -133,7 +176,6 @@
-INSERT INTO public.company_fiscal_settings(id,organization_id,is_active,configuration_status,accounting_validated_at,legal_name,cnpj) VALUES('{SETTINGS}','{A}',true,'VALIDATED',now(),'Synthetic issuer','00000000000000'),('{U(10)}','{B}',true,'VALIDATED',now(),'Synthetic issuer B','11111111111111');
```

Observação: neste trecho do relatório, abreviei com `...` apenas literais SQL repetidos do teste. O diff completo e exato só foi exigido para o `candidate.sql.review`, e ele está completo acima.

## O que é sintético e o que é hosted

- Sintético local, nos commits: rejeição atômica antes de qualquer DDL em 5 casos de A; B validado não libera A; com o gate aberto, A não pode ter a atestação alterada nem ser desativado, e uma segunda configuração ativa é bloqueada pelo índice único; B não fica bloqueado; aplicação com owner sintético validado. A asserção da suíte Vitest é `TOTAL 127 PASS`.
- Concorrência: o único teste de concorrência adicionado neste intervalo é o de bloqueio do gate, feito com uma segunda sessão que segura o gate. As provas anteriores de deadlock e da ordem row-before-receipt já existiam em 08b381e7.
- Hosted: o único dado disponível é o seu relato, ou seja, PRE estrutural PASS e PRE contábil `42501 C2_ACCOUNTING_PREREQUISITE_BLOCKED`. Nada foi executado no hosted nesta leitura.
- A validação contábil real de A continua pendente e não foi simulada no ambiente hospedado.

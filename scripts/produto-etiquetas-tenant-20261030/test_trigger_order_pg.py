"""Focused disposable PG test for trigger-array canonical ordering in PRE/POST guards (serialization only)."""
import json, re, sys
from pathlib import Path
H = Path(__file__).resolve().parent
sys.path.insert(0, str(H.parent / 'delivery-atomic-hardening-20261030'))
import restore  # noqa: F401  (installs bounded pg helpers)
from restore import pg
pg.start()
src = (H / 'preflight.sql.review').read_text()
TQ = re.search(r"\(SELECT jsonb_agg\(jsonb_build_array\(tgrelid.*?\)\)\)", src, re.S)
TQ = re.search(r"'triggers',(\(SELECT jsonb_agg.*?regclass\)\))", src, re.S).group(1)
def rel(t): return t
q = TQ.replace("'public.produto_etiquetas'::regclass,'public.lotes'::regclass,'public.entrega_checklist'::regclass,'public.entrega_ocorrencias'::regclass", "'public.a'::regclass,'public.b'::regclass")
def setup(order):
    pg.sql("DROP TABLE IF EXISTS public.a, public.b; CREATE TABLE public.a(x int); CREATE TABLE public.b(x int);"
           "CREATE OR REPLACE FUNCTION public.f() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$;")
    for t, n in order: pg.sql(f"CREATE TRIGGER {n} BEFORE INSERT ON public.{t} FOR EACH ROW EXECUTE FUNCTION public.f();")
def live(): return json.loads(pg.sql(f"SELECT {q}::text;").splitlines()[-1])
def check(exp): return pg.sql(f"DO $c$ BEGIN IF ({q}) IS DISTINCT FROM '{json.dumps(exp)}'::jsonb THEN RAISE EXCEPTION 'DRIFT'; END IF; END $c$;", False)
T = [('b', 'trg_Z'), ('a', 'trg_b'), ('a', 'trg_A'), ('b', 'trg_a'), ('a', 'trg_9')]
setup(T); base = live()
assert base == sorted(base, key=lambda t: tuple(x.encode() for x in t)), base
for perm in (T[::-1], T[2:] + T[:2], [T[3], T[0], T[4], T[1], T[2]]):
    setup(perm); assert live() == base, perm
print('PASS permutations of creation order -> identical canonical array (C collation, tuple columns)')
pg.sql(f"DO $c$ BEGIN IF ({q}) IS DISTINCT FROM '{json.dumps(base)}'::jsonb THEN RAISE EXCEPTION 'DRIFT'; END IF; END $c$;")
print('PASS exact expected accepted')
assert 'DRIFT' in check(base[:-1]); print('PASS missing trigger in expected rejected')
assert 'DRIFT' in check(base + [['public.a', 'zz', 'O']]); print('PASS extra expected rejected')
assert 'DRIFT' in check(base[::-1]); print('PASS non-canonical expected order rejected (order still significant)')
pg.sql("CREATE TRIGGER trg_new BEFORE INSERT ON public.a FOR EACH ROW EXECUTE FUNCTION public.f();"); assert 'DRIFT' in check(base); print('PASS added live trigger rejected')
pg.sql("DROP TRIGGER trg_new ON public.a; ALTER TABLE public.a DISABLE TRIGGER trg_b;"); assert 'DRIFT' in check(base); print('PASS changed tgenabled rejected')
pg.sql("ALTER TABLE public.a ENABLE TRIGGER trg_b; DROP TRIGGER trg_9 ON public.a;"); assert 'DRIFT' in check(base); print('PASS dropped live trigger rejected')
for d in ('produto-etiquetas-tenant-20261030', 'delivery-checklist-occurrence-authz-20261030', 'delivery-waiver-closure-20261030'):
    for f in ('preflight', 'postflight', 'install'):
        s = (H.parent / d / f'{f}.sql.review').read_text(); assert 'ORDER BY 1,2' not in s and s.count('tgenabled::text COLLATE "C")') == (2 if f == 'install' else 1), (d, f)
print('PASS all 9 artifacts use the deterministic tuple ORDER BY; RESULT 9 PASS 0 FAIL')

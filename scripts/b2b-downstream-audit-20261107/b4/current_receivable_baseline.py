"""Reported metadata; exact canonical guard only restored in disposable tests."""
import hashlib
import re
from pathlib import Path
H = Path(__file__).resolve().parent
ROOT = H.parents[2]
SOURCE = ROOT / 'scripts/delivery-atomic-hardening-20261030/candidate.sql.review'
FUNCTION_MD5 = '95e0e5a84ef511cd72d7807351f61cf4'
ACL_MD5 = '93490607307bc83e36605d2c0e7dc4ec'
TRIGGERS_MD5 = '7c65f3e7fed5e102fd6c8b96bc9fe8e0'
ACL = '{anon=arwdm/postgres,authenticated=arwdm/postgres,postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}'
SIGNATURE = 'platform_private.delivery_no_downstream_20261030()'
TRIGGER = {'name':'a00_delivery_no_downstream','definition':'CREATE TRIGGER a00_delivery_no_downstream BEFORE INSERT OR DELETE OR UPDATE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION platform_private.delivery_no_downstream_20261030()','enabled':'O'}

def table_metadata(historical):
    triggers = sorted(historical['triggers'] + [TRIGGER], key=lambda x:x['name'])
    digest = hashlib.md5('^'.join(f"{x['name']}|{x['definition']}|{x['enabled']}" for x in triggers).encode()).hexdigest()
    assert len(triggers)==10 and digest==TRIGGERS_MD5, 'TEN_TRIGGER_BASELINE_DRIFT'
    return {**historical,'acl':ACL,'triggers':triggers}

def restore(sql):
    text=SOURCE.read_text()
    function=re.search(r'CREATE FUNCTION platform_private\.delivery_no_downstream_20261030\(\).*?END \$\$;',text,re.S)
    context=re.search(r'CREATE TABLE platform_private\.delivery_context_20261030 \(.*?ALTER TABLE platform_private\.delivery_context_20261030 ENABLE ROW LEVEL SECURITY;',text,re.S)
    assert function is not None and context is not None, 'CANONICAL_SOURCE_MISSING'
    sql(context.group().replace('CREATE TABLE platform_private.delivery_context_20261030', 'CREATE TABLE IF NOT EXISTS platform_private.delivery_context_20261030'))
    sql(function.group()+'\nREVOKE ALL ON FUNCTION '+SIGNATURE+' FROM PUBLIC,anon,authenticated,service_role;')
    sql(TRIGGER['definition']+';')
    sql('REVOKE ALL ON public.accounts_receivable FROM anon,authenticated,service_role; GRANT DELETE,INSERT,MAINTAIN,SELECT,UPDATE ON public.accounts_receivable TO anon,authenticated; GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE ON public.accounts_receivable TO postgres,service_role;')
"""Static review checks for F4 candidate. No network/SQL."""
from pathlib import Path
import re
R=Path(__file__).parent; E=R.parent/'f2f3/deploy/supabase/functions/tenant-email-settings'
sql=(R/'20261016_smtp_f4_sender_activation.sql').read_text()
ts={n:(R/n).read_text() for n in ['contract.ts','challenge-code.ts','sender-executor.ts','dispatch.ts','handler.ts']}
idx=(E/'index.ts').read_text()
ui=Path('src/lib/configuracoes/tenantSmtp.ts').read_text()
worker=Path('supabase/functions/process-communication-outbox/index.ts').read_text()
checks={
 'gate inserted false':"VALUES(true,false) ON CONFLICT DO NOTHING" in sql,
 'no gate opened in SQL':not re.search(r"tenant_smtp_f4_gate SET approved=true",sql),
 'no plaintext code column':'code_plain' not in sql and 'code text' not in sql.replace('p_code text',''),
 'no platform_private USAGE grant':'GRANT USAGE ON SCHEMA platform_private' not in sql,
 'definer search_path fixed':sql.count('SECURITY DEFINER')==sql.count("SECURITY DEFINER SET search_path=''"),
 'dispatch literal false':"'dispatch_enabled',false" in sql and 'dispatch_enabled:z.literal(false)' in ts['contract.ts'],
 'no outbox write in F4 SQL':'INSERT INTO public.comunicacao_outbox' not in sql and 'UPDATE public.comunicacao_outbox' not in sql,
 'no console logging':all('console.' not in v for v in ts.values()),
 'edge F4a reviewed':'TENANT_SMTP_F4_REVIEWED=true' in idx,
 'UI F4a promoted':'TENANT_SMTP_F4_PHASE = true' in ui,
 'route only op=sender':"url.search!=='?op=sender'" in ts['handler.ts'],
 'global worker still contained':'const deliveryContractAvailable = false;' in worker,
 'mirror equal':all((E/'f4'/n).read_text()==v.replace('../../../supabase/functions/_shared/','../../_shared/') for n,v in ts.items()),
 'harness never disables triggers':'DISABLE TRIGGER' not in (R/'test_sql.py').read_text(),
 'operational activation refused':"IF p_active THEN RAISE EXCEPTION 'SMTP_OPERATIONAL_NOT_READY'" in sql,
 'dispatch_ready constant false':"$$ SELECT false $$" in sql,
 'invalidation covers executing':"state IN ('claimed','executing','sent','ambiguous')" in sql,
 'confirm checks gates':sql.count('Closed gate blocks confirmation')==1,
 'UI has no activate action':'Ativar email' not in Path('src/pages/configuracoes/TenantSenderVerification.tsx').read_text(),
 'not deployed':not Path('supabase/functions/tenant-email-settings/f4').exists(),
}
for k,v in checks.items():print(('PASS ' if v else 'FAIL ')+k)
assert all(checks.values())
print(f'F4 scanner {len(checks)}/{len(checks)}')

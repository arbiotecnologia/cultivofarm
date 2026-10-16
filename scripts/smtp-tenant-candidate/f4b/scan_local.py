"""Static review checks for F4b candidate. No network/SQL."""
from pathlib import Path
import re
R=Path(__file__).parent; D=R.parent/'f2f3/deploy/supabase/functions'
sql='\n'.join(l for l in (R/'20261016_smtp_f4b_tenant_dispatch.sql').read_text().splitlines() if not l.lstrip().startswith('--')); rb=(R/'rollback.sql').read_text()
lane=(R/'lane.ts').read_text(); worker=(R/'worker-index.ts.review').read_text()
live=Path('supabase/functions/process-communication-outbox/index.ts').read_text()
ui=Path('src/pages/configuracoes/TenantSenderVerification.tsx').read_text(); lib=Path('src/lib/configuracoes/tenantSmtp.ts').read_text()
checks={
 'dispatch gate inserted false':"tenant_smtp_dispatch_gate VALUES(true,false) ON CONFLICT DO NOTHING" in sql,
 'no gate opened in SQL':not re.search(r"dispatch_gate SET approved=true",sql),
 'definer search_path empty':sql.count('SECURITY DEFINER')==sql.count("SECURITY DEFINER SET search_path=''"),
 'public wrappers INVOKER':all('SECURITY INVOKER' in l for l in sql.splitlines() if l.startswith('CREATE OR REPLACE FUNCTION public.')),
 'no platform_private USAGE grant':'GRANT USAGE ON SCHEMA platform_private' not in sql,
 'global publisher untouched':'_comunicacao_publish_system_event' not in sql,
 'global claim untouched':'rpc_claim_communication_outbox' not in sql,
 'restrictive containment untouched':'notif3_global_client_containment' not in sql and 'DROP POLICY' not in sql,
 'diagnostic branch kept verbatim':"e.event_key='tenant.smtp.diagnostic' AND e.status='processed') THEN RETURN NEW; END IF;" in sql,
 'lane rows invisible to global claim':"'processing',0,1,'tenant_smtp_lane'" in sql,
 'no retry state':"'pending'" not in sql.split('tenant_smtp_lane_finish',1)[1],
 'single allowed contract':sql.count("CHECK(contract IN ('solicitacao_atribuida_consultor_v1'))")==1,
 'recipient re-proven at claim':'v_email:=platform_private.tenant_smtp_lane_recipient(j.organization_id,j.recipient_user_id)' in sql,
 'rollback non-destructive':'DROP TABLE' not in rb and 'DELETE' not in rb and 'TRUNCATE' not in rb,
 'lane no console':'console.' not in lane,
 'lane flag false':'export const TENANT_SMTP_LANE_REVIEWED = false;' in worker,
 'worker NOTIF3 kept':'const deliveryContractAvailable = false;' in worker and 'const deliveryContractAvailable = false;' in live,
 'live worker unchanged':'tenant_smtp' not in live,
 'edge F4b flag false':'TENANT_SMTP_F4B_REVIEWED=false' in (D/'tenant-email-settings/index.ts').read_text(),
 'UI F4b phase false':'export const TENANT_SMTP_F4B_PHASE = false;' in lib,
 'UI activate gated':'activationEnabled && status?.sender_verified && !status.active' in ui,
 'mirror lane equal':(D/'process-communication-outbox/tenant-lane/lane.ts').read_text()==lane.replace('../../../supabase/functions/_shared/','../../_shared/'),
 'mirror worker equal':(D/'process-communication-outbox/index.ts').read_text()==worker,
 'not deployed':not Path('supabase/functions/process-communication-outbox/tenant-lane').exists() and not Path('supabase/functions/tenant-email-settings/f4b').exists(),
}
for k,v in checks.items():print(('PASS ' if v else 'FAIL ')+k)
assert all(checks.values())
print(f'F4b scanner {len(checks)}/{len(checks)}')

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
 'source re-proven at claim':"v_reason:=platform_private.tenant_smtp_lane_source_reason(j.source_id,j.cliente_id,j.organization_id,j.recipient_user_id);" in sql,
 'authorize re-proves before envelope':sql.count('tenant_smtp_lane_source_reason(j.source_id,j.cliente_id,j.organization_id,j.recipient_user_id)')>=2 and 'lane_authorize' in lane,
 'NULL outcome refused':"p_outcome IS NULL OR p_outcome NOT IN" in sql,
 'enqueue quota serialized per tenant':"pg_advisory_xact_lock(hashtextextended('tenant_smtp_lane_enqueue:'||v_org::text,0))" in sql,
 'no zero actor':'00000000-0000-0000-0000-000000000000' not in sql,
 'claim fairness per tenant':'GROUP BY q.organization_id ORDER BY min(q.created_at) LIMIT 25 LOOP' in sql and 'state=\'queued\' ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED' in sql,
 'recipient hash bound at claim and compared at authorize':sql.count('tenant_smtp_lane_recipient_hash(j.outbox_id,v_email)')==2 and "v_reason:='recipient_changed'" in sql,
 'portfolio canonical link required':'uc.is_active IS TRUE AND uc.revoked_at IS NULL' in sql and "'recipient_portfolio_revoked'" in sql,
 'MIME fallback escaped core+mirror':all('escapeHtmlText(opts.content)' in x.read_text() for x in (Path('supabase/functions/_shared/comunicacao/native-smtp-client.ts'),D/'_shared/comunicacao/native-smtp-client.ts')),
 'lane batch bounded below HTTP timeout':'LANE_MAX_JOBS=3' in lane and 'LANE_BUDGET_MS=50000' in lane and 'timeout_milliseconds:=55000' in (R/'cron_option.sql.review').read_text(),
 'invoker reconciles/heartbeat and avoids overlap':all(x in (R/'cron_option.sql.review').read_text() for x in ("lease_expires_at<=clock_timestamp()","interval '5 minutes'","lease_expires_at>clock_timestamp()) THEN RETURN","pg_try_advisory_xact_lock")),
 'UI readiness needs lane heartbeat':'tenant_smtp_lane_heartbeat WHERE id AND seen_at' in sql,
 'invoker not in candidate SQL':'cron.schedule' not in sql and 'net.http_post' not in sql,
 'lane audit no payload columns':all(c not in sql.split('tenant_smtp_lane_audit(',1)[1].split(');',1)[0] for c in ('payload','email','subject','password')),
 'lane invoker dedicated secret only':'authorizeLaneInvoker(req, LANE_INVOKER_SECRET)' in worker and "'x-tenant-smtp-secret',v_secret" in (R/'cron_option.sql.review').read_text() and 'x-internal-secret' not in (R/'cron_option.sql.review').read_text(),
 'mirror invoker auth equal':(D/'process-communication-outbox/tenant-lane/invoker-auth.ts').read_text()==(R/'invoker-auth.ts').read_text(),
 'invoker auth no console/logging':'console.' not in (R/'invoker-auth.ts').read_text(),
 'not deployed':not Path('supabase/functions/process-communication-outbox/tenant-lane').exists() and not Path('supabase/functions/tenant-email-settings/f4b').exists(),
}
for k,v in checks.items():print(('PASS ' if v else 'FAIL ')+k)
assert all(checks.values())
print(f'F4b scanner {len(checks)}/{len(checks)}')

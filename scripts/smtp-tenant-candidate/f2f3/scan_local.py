"""Focused scanner; tests use synthetic sockets, never hosted certification."""
from pathlib import Path
import re
r=Path(__file__).parent
sources='\n'.join(p.read_text() for p in r.glob('*.ts'))
sql=(r/'20261016_smtp_f2f3.sql').read_text()
checks={
'no logs/cache in executor':not re.search(r'console\.|logger\.|localStorage|sessionStorage',sources),
'no arbitrary request targets':'.strict()' in (r/'contract.ts').read_text() and not re.search(r'\b(host|password|recipient|tenant|organization_id)\s*:',(r/'contract.ts').read_text()),
'no parallel outbox':not any('outbox' in name for name in re.findall(r'CREATE TABLE(?: IF NOT EXISTS)?\s+([\w.]+)',sql)),
'no global setting/Auth write':not re.search(r'(UPDATE|INSERT INTO|DELETE FROM)\s+(?:public\.)?(auth\.|communication_provider_settings)',sql,re.I),
'private gate false':'approved boolean NOT NULL DEFAULT false' in sql,
'executor client deny':'public.tenant_smtp_test_prepare(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated' in sql,
'all addresses validate':'addresses.every(publicAddress)' in (r/'pinned-transport.ts').read_text(),
'IP literal TCP only':'runtime.tcp(addresses[0],465)' in (r/'pinned-transport.ts').read_text(),
'TLS original hostname':'runtime.tls(socket,host)' in (r/'pinned-transport.ts').read_text(),
'controlled pinning promoted after auditor proof':'TENANT_PINNING_PROVEN = true' in (r/'deno-runtime.ts.review').read_text(),
'no TLS downgrade':not re.search(r'unsafelyDisable|rejectUnauthorized|NODE_TLS_REJECT',sources+(r/'deno-runtime.ts.review').read_text()),
'no raw SQL exception output':'SQLERRM' not in sql and 'GET STACKED' not in sql,
'no operational delivery enabling':'DELIVERY_ENABLED:true' not in sources and 'dispatch_enabled=true' not in sql,
'no plaintext secret persistence':not re.search(r'INSERT INTO[^;]*(?:password|decrypted_secret)',sql,re.I),
'job one attempt':'1,1,\'tenant-smtp-test\'' in sql,
'no silent reset/reclaim':"state<>'complete'" in sql and 'smtp_send_ambiguous' in sql,
'no deployed candidate':not Path('supabase/functions/tenant-email-settings/f2f3').exists(),
'proof fixed target and AR only':all(v in (r/'hosted-proof.ts').read_text() for v in ['007bb519-cba0-4704-be2c-cb93ad010048','smtpi.kinghost.net',"req.body!==null"]),
'proof no SMTP or credential RPC':not re.search(r'prepare|Vault|AUTH PLAIN|sendEmail|writeSmtp', (r/'hosted-proof.ts').read_text()),
'mirror controlled pinning promoted': 'TENANT_PINNING_PROVEN = true' in (r/'deploy/supabase/functions/tenant-email-settings/f2f3/deno-runtime.ts').read_text(),
'mirror JWT preserved':'verify_jwt = true' in (r/'deploy/supabase/config.toml').read_text(),
'executor dedicated schema only':'GRANT USAGE ON SCHEMA tenant_smtp_executor TO service_role' in (r/'20261016_smtp_executor_schema_acl.sql').read_text() and not re.search(r'GRANT\s+USAGE\s+ON\s+SCHEMA\s+platform_private', (r/'20261016_smtp_executor_schema_acl.sql').read_text(),re.I),
'real service role SQL coverage':'SET ROLE service_role' in (r/'test_sql.py').read_text() and 'REVOKE USAGE ON SCHEMA platform_private FROM service_role' in (r/'test_sql.py').read_text(),
'UI proof uses existing canonical transport':"supabase.functions.invoke('tenant-email-settings?proof=pinning'" in Path('src/lib/configuracoes/tenantSmtp.ts').read_text() and "body:{mode:'runtime_proof'}" in Path('src/lib/configuracoes/tenantSmtp.ts').read_text(),
'temporary UI and server proof closed': 'TENANT_SMTP_PROOF_PHASE = false' in Path('src/lib/configuracoes/tenantSmtp.ts').read_text() and all('HOSTED_PROOF_ENABLED=false' in (r/p).read_text() for p in ['entry-integration.ts.review','deploy/supabase/functions/tenant-email-settings/index.ts']),
}
for label,value in checks.items():print(('PASS ' if value else 'FAIL ')+label)
assert all(checks.values())

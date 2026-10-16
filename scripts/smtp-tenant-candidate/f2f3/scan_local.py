"""Focused scanner; tests use synthetic sockets, never hosted certification."""
from pathlib import Path
import re
r=Path(__file__).parent
sources='\n'.join(p.read_text() for p in r.glob('*.ts'))
sql=(r/'20261016_smtp_f2f3.sql').read_text()
checks={
'no logs/cache in executor':not re.search(r'console\.|logger\.|localStorage|sessionStorage',sources),
'no arbitrary request targets':'.strict()' in (r/'contract.ts').read_text() and not re.search(r'\b(host|password|recipient|tenant|organization_id)\s*:',(r/'contract.ts').read_text()),
'no parallel outbox':not re.search(r'CREATE TABLE[^;]*outbox',sql),
'no global setting/Auth write':not re.search(r'(UPDATE|INSERT INTO|DELETE FROM)\s+(?:public\.)?(auth\.|communication_provider_settings)',sql,re.I),
'private gate false':'approved boolean NOT NULL DEFAULT false' in sql,
'executor client deny':'public.tenant_smtp_test_prepare(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated' in sql,
'all addresses validate':'addresses.every(publicAddress)' in (r/'pinned-transport.ts').read_text(),
'IP literal TCP only':'runtime.tcp(addresses[0],465)' in (r/'pinned-transport.ts').read_text(),
'TLS original hostname':'runtime.tls(socket,host)' in (r/'pinned-transport.ts').read_text(),
'hosted proof remains closed':'TENANT_PINNING_PROVEN = false' in (r/'deno-runtime.ts.review').read_text(),
'no TLS downgrade':not re.search(r'unsafelyDisable|rejectUnauthorized|NODE_TLS_REJECT',sources+(r/'deno-runtime.ts.review').read_text()),
'no raw SQL exception output':'SQLERRM' not in sql and 'GET STACKED' not in sql,
'no operational delivery enabling':'DELIVERY_ENABLED:true' not in sources and 'dispatch_enabled=true' not in sql,
'no plaintext secret persistence':not re.search(r'INSERT INTO[^;]*(?:password|decrypted_secret)',sql,re.I),
'job one attempt':'1,1,\'tenant-smtp-test\'' in sql,
'no silent reset/reclaim':"state<>'complete'" in sql and 'smtp_send_ambiguous' in sql,
'no deployed candidate':not Path('supabase/functions/tenant-email-settings/f2f3').exists(),
}
for label,value in checks.items():print(('PASS ' if value else 'FAIL ')+label)
assert all(checks.values())

"""Focused fail-closed scanner for this candidate; not a global security certification."""
from pathlib import Path
import re
root=Path(__file__).parent
handler=(root/'handler.ts').read_text();sql=(root/'20261016_smtp_t1.sql').read_text();entry=(root/'index.ts.review').read_text()
ui=Path('src/pages/configuracoes/TenantEmailSettings.tsx').read_text();preflight=(root/'preflight.sql').read_text()
checks={
 'no automatic deployed candidate':not Path('supabase/functions/tenant-email-settings').exists(),
 'no SMTP network primitives':not re.search(r'\b(fetch|connect|connectTls|startTls|sendEmail|loadRuntimeConfig)\s*\(',handler),
 'no handler logging':not re.search(r'console\.|logger\.',handler),
 # A wrapper passes p_password as a write argument; that is not a stored-secret
 # read. Reject actual credential-column reads and all decrypted Vault sources.
 'no Vault reader in SQL':not re.search(r'decrypted_secrets|SELECT\s+(?:\w+\.)?password\b',sql,re.I),
 'no reserved schema DDL':not re.search(r'(CREATE|ALTER|DROP)\s+(TABLE|FUNCTION|TRIGGER|POLICY)\s+(vault|auth|storage)\.',sql,re.I),
 'no service key in entry': 'SERVICE_ROLE' not in entry,
 'entry draft promotable': 'reviewed: true' in entry,
 'frontend draft promotable': 'TENANT_SMTP_REVIEWED = true' in Path('src/lib/configuracoes/tenantSmtp.ts').read_text(),
 'independent handler and SQL gates preserved': '!deps.reviewed' in handler and 'approved boolean NOT NULL DEFAULT false' in sql and sql.count('PERFORM platform_private.tenant_email_require_review();')>=2,
 'canonical only':not any(v in handler+sql+entry for v in ['yzszlzjpovmcteuxjznj','chkgpuawcswhefiabwsm','navfzbwgwzruipouyfnk','ikaauvsflpmamgxmkhoq']),
 'public wrappers INVOKER':len(re.findall(r'CREATE OR REPLACE FUNCTION public\.tenant_email_settings_\w+\([^;]*?SECURITY INVOKER',sql,re.I))==3,
 'no wildcard settings read':not re.search(r'SELECT\s+\*',sql,re.I),
 'no application credential cache or logging':not re.search(r'console\.|logger\.|localStorage|sessionStorage|setQueryData|useMutation',ui+handler),
 'scope render and IO fence':all(v in ui for v in ['currentContext','generation.current!==epoch','setPassword("")','lock.current=true']),
 'preflight strictly read only': 'BEGIN READ ONLY' in preflight and not re.search(r'^\s*(UPDATE|INSERT|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE)\b',preflight,re.M|re.I),
 'metadata no-store': '"Cache-Control":"no-store"' in handler,
}
for name,ok in checks.items():print(('PASS ' if ok else 'FAIL ')+name)
assert all(checks.values())

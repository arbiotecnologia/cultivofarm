"""Focused fail-closed scanner for this candidate; not a global security certification."""
from pathlib import Path
import re
root=Path(__file__).parent
handler=(root/'handler.ts').read_text();sql=(root/'20261016_smtp_t1.sql').read_text();entry=(root/'index.ts.review').read_text()
checks={
 'no automatic deployed candidate':not Path('supabase/functions/tenant-email-settings').exists(),
 'no SMTP network primitives':not re.search(r'\b(fetch|connect|connectTls|startTls|sendEmail|loadRuntimeConfig)\s*\(',handler),
 'no handler logging':not re.search(r'console\.|logger\.',handler),
 'no Vault reader in SQL':not re.search(r'decrypted_secrets|SELECT\s+.*password',sql,re.I),
 'no reserved schema DDL':not re.search(r'(CREATE|ALTER|DROP)\s+(TABLE|FUNCTION|TRIGGER|POLICY)\s+(vault|auth|storage)\.',sql,re.I),
 'no service key in entry': 'SERVICE_ROLE' not in entry,
 'entry reviewed OFF': 'reviewed: false' in entry,
 'frontend reviewed OFF': 'TENANT_SMTP_REVIEWED = false' in Path('src/lib/configuracoes/tenantSmtp.ts').read_text(),
 'canonical only':not any(v in handler+sql+entry for v in ['yzszlzjpovmcteuxjznj','chkgpuawcswhefiabwsm','navfzbwgwzruipouyfnk','ikaauvsflpmamgxmkhoq']),
}
for name,ok in checks.items():print(('PASS ' if ok else 'FAIL ')+name)
assert all(checks.values())

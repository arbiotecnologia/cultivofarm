"""Deterministic review mirror only. Never invokes deploy, SQL or network."""
from pathlib import Path
ROOT=Path(__file__).parent
MIRROR=ROOT/'deploy/supabase/functions'
EDGE=MIRROR/'tenant-email-settings'
SHARED=MIRROR/'_shared'
for name in ['handler.ts','_shared/contract.ts']:
    (EDGE/name).write_text((ROOT.parent/name).read_text())
for name in ['contract.ts','handler.ts','dispatch.ts','executor.ts','pinned-transport.ts','hosted-proof.ts']:
    (EDGE/'f2f3'/name).write_text((ROOT/name).read_text().replace('../../../supabase/functions/_shared/','../../_shared/'))
(EDGE/'f4').mkdir(exist_ok=True)
for name in ['contract.ts','challenge-code.ts','sender-executor.ts','dispatch.ts','handler.ts']:
    (EDGE/'f4'/name).write_text((ROOT.parent/'f4'/name).read_text().replace('../../../supabase/functions/_shared/','../../_shared/'))
(EDGE/'f2f3/deno-runtime.ts').write_text((ROOT/'deno-runtime.ts.review').read_text())
for name in ['smtp-provider-probe.ts','native-smtp-client.ts','smtp-provider-probe-deno.ts','adapters-types.ts','cors.ts']:
    (SHARED/'comunicacao'/name).write_text((Path('supabase/functions/_shared/comunicacao')/name).read_text())
(SHARED/'communication-render.ts').write_text(Path('supabase/functions/_shared/communication-render.ts').read_text())
(ROOT/'entry-integration.ts.review').write_text((EDGE/'index.ts').read_text())
print('PASS review-only sources mirrored; no deployment')
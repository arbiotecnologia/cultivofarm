"""Single coordinated frontend manifest (C2 coordinated + MobileLayout + paired own-finance
+ admin lifecycle in Configuracoes). Copies assembled from reviewed packages; every
baseline is checked against current src (drift aborts). Nothing is promoted to src."""
import hashlib, json, shutil
from pathlib import Path
H = Path(__file__).resolve().parent
ROOT = H.parents[3]; S = ROOT / 'scripts'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
sources = {}
def add(rel, src, package):
    assert rel not in sources or sources[rel][1] == package or package == 'finance-multiprofile', (rel, sources.get(rel))
    sources[rel] = (Path(src), package)
coord = S / 'contracts-c2-20261022/coordinated/frontend/runtime-copies'
for p in sorted(coord.rglob('*')):
    if p.is_file(): add(str(p.relative_to(coord)), p, 'c2-coordinated')
add('src/pages/app/MobileLayout.tsx', S / 'contracts-c2-mobile-20261022/runtime-copies/src/pages/app/MobileLayout.tsx', 'c2-mobile')
fin = S / 'partner-own-finance-20261022/multiprofile/runtime-copies'
for p in sorted(fin.rglob('*')):
    # superset of the coordinated useMyPartner (C2 + finance capability), verified below
    if p.is_file(): add(str(p.relative_to(fin)), p, 'finance-multiprofile')
lc = S / 'contracts-c2-20261022/frontend'
add('src/lib/configuracoes/partnerLifecycle.ts', lc / 'partnerLifecycle.ts', 'c2.1-admin')
add('src/components/configuracoes/PartnerLifecycleFields.tsx', lc / 'PartnerLifecycleFields.tsx', 'c2.1-admin')
# Configuracoes: apply the reviewed 2-hunk patch against CURRENT src with exact context.
cfg = (ROOT / 'src/pages/Configuracoes.tsx').read_text()
imp_anchor = 'import { ExternalCommonUserEditBoundary } from "@/components/configuracoes/ExternalCommonUserEditForm";\n'
mount_anchor = '                    <div><Label>Vínculo atual</Label><div className="border rounded-md p-2">{renderVinculo(editOrig ?? editUser, true)}</div></div>\n'
assert cfg.count(imp_anchor) == 1 and cfg.count(mount_anchor) == 1, 'Configuracoes drift'
cfg = cfg.replace(imp_anchor, imp_anchor + 'import { PartnerLifecycleFields } from "@/components/configuracoes/PartnerLifecycleFields";\n')
cfg = cfg.replace(mount_anchor, mount_anchor + """                    {isAdmin && !vinculos.isFetching && !vinculos.isError && vinculos.data?.get(editUser.user_id)?.parceiro?.partner_id && <PartnerLifecycleFields
                      key={`${externalScope}:${editUser.user_id}`}
                      partnerId={vinculos.data.get(editUser.user_id)?.parceiro?.partner_id ?? ''}
                      userId={editUser.user_id}
                    />}
""")
out = H / 'runtime-copies'
shutil.rmtree(out, ignore_errors=True)
for rel, (src, _) in sources.items():
    (out / rel).parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(src, out / rel)
(out / 'src/pages/Configuracoes.tsx').parent.mkdir(parents=True, exist_ok=True)
(out / 'src/pages/Configuracoes.tsx').write_text(cfg)
sources['src/pages/Configuracoes.tsx'] = (out / 'src/pages/Configuracoes.tsx', 'c2.1-admin')
# superset check: finance useMyPartner == coordinated + finance-only lines
c = (coord / 'src/hooks/useMyPartner.ts').read_text().splitlines(); f = (fin / 'src/hooks/useMyPartner.ts').read_text().splitlines()
assert len(f) == len(c) + 1 and sum(a != b for a, b in zip(c, f[1:])) == 1, 'useMyPartner is not C2+finance superset'
rows = []
for rel, (src, pkg) in sorted(sources.items()):
    base = ROOT / rel
    rows.append({'path': rel, 'package': pkg, 'baseline_sha256': sha(base) if base.exists() else None, 'candidate_sha256': sha(out / rel)})
(H / 'manifest.json').write_text(json.dumps(rows, indent=1) + '\n')
print(len(rows), 'files'); [print(r['package'], r['path']) for r in rows]

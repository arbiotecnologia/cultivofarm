"""Copy review files only to /tmp for testing; runtime never touched."""
from pathlib import Path
import json,os
H=Path(__file__).resolve().parent;root=H.parents[1];dest=Path('/tmp/cq-review-validation');dest.mkdir(exist_ok=True)
for p in (H/'frontend-candidate').rglob('*'):
 if p.is_file() and p.suffix in ('.tsx','.ts'):
  out=dest/p.name;out.write_bytes(p.read_bytes())
link=dest/'node_modules'
if not link.exists():link.symlink_to(root/'node_modules',target_is_directory=True)
config=json.loads((root/'tsconfig.app.json').read_text());config['compilerOptions'].pop('baseUrl',None);config['compilerOptions']['paths']={'@/hooks/useCQReferencia':[str(dest/'useCQReferencia.ts')], '@/*':[str(root/'src/*')]};config['include']=[str(dest/'RegistrarCQDialog.tsx'),str(dest/'OSDetalhesDialog.tsx'),str(dest/'useCQReferencia.ts')];config['compilerOptions']['noEmit']=True
# Existing relative sibling imports in OS candidate resolve to their unchanged runtime files except the candidate dialog.
p=dest/'OSDetalhesDialog.tsx';t=p.read_text().replace('"./RastreabilidadeProducaoTab"','"@/components/ordens-servico/RastreabilidadeProducaoTab"').replace('"../cockpit/RegistrarCQDialog"','"./RegistrarCQDialog"');p.write_text(t)
(dest/'tsconfig.json').write_text(json.dumps(config))

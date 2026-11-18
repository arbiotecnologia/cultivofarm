"""Build additive product-only Edge restrictions; original microorganism source remains unchanged."""
import argparse,subprocess,json,hashlib
from pathlib import Path
H=Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--ref',required=True,choices=['swzpzcwiasxmjutrmvkm','vrlcdwmlytukrjezrrnf']);p.add_argument('--out',required=True);a=p.parse_args();out=Path(a.out)
subprocess.run(['python3',str(H.parent/'microorganism-ficha-20261118/build-edge.py'),'--ref',a.ref,'--service','documentary','--out',str(out)],check=True)
f=out/'index.ts';s=f.read_text(encoding='utf-8');anchor='    const id = body.identity;';assert s.count(anchor)==1
s=s.replace(anchor,anchor+'''
    if (id.entity === "produto") {
      const productFields = ["resumo_curto", "explicacao_tecnica", "explicacao_produtor", "explicacao_b2b", "indicacoes_uso", "janela_aplicacao", "cuidados_aplicacao", "compatibilidade", "beneficio_combinado"];
      if (!id.id || id.researchScope === "species" || body.fields.some(f => !productFields.includes(f))) return json({error:"product_documentary_field_denied"},400);
    }
''');f.write_text(s,encoding='utf-8',newline='\n')
(out/'manifest.json').write_text(json.dumps({'ref':a.ref,'files':{str(f.relative_to(out)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(out.rglob('*.ts'))}},indent=2)+'\n',encoding='utf-8',newline='\n')

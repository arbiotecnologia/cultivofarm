"""Build-only nullable product-only document request delta; no deploy or environment default."""
import argparse
from pathlib import Path
H=Path(__file__).resolve().parent
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--ref',required=True,choices=['swzpzcwiasxmjutrmvkm','vrlcdwmlytukrjezrrnf']);p.add_argument('--output',required=True);a=p.parse_args()
 source=(H.parent.parent/'supabase/functions/product-regulatory-document/index.ts').read_text()
 anchor="if(![input.product_id,input.microorganism_id,input.document_id].every(x=>typeof x==='string'&&uuid.test(x)))"
 if source.count(anchor)!=1:raise ValueError('canonical request validation drift')
 source=source.replace(anchor,"if(![input.product_id,input.document_id].every(x=>typeof x==='string'&&uuid.test(x)) || !(input.microorganism_id===null || (typeof input.microorganism_id==='string'&&uuid.test(input.microorganism_id))))")
 source=source.replace('https://swzpzcwiasxmjutrmvkm.supabase.co','https://'+a.ref+'.supabase.co')
 out=Path(a.output);out.mkdir(parents=True,exist_ok=True);(out/'index.ts').write_text(source,encoding='utf-8',newline='\n');(out/'core.ts').write_bytes((H.parent.parent/'supabase/functions/product-regulatory-document/core.ts').read_bytes())

"""Disposable PG only; captured actor/root, synthetic Auth/feature/storage dependencies."""
from pathlib import Path
import json,subprocess,shutil
H=Path(__file__).resolve().parent
base=H.parent
prefix=(base/'test_pg.py').read_text(encoding='utf-8').split(' pins=json.loads')[0].replace('H=Path(__file__).resolve().parent','H=Path(__file__).resolve().parent.parent')+'\nfinally:\n pass\n'
exec(compile(prefix,str(H/'test_pg.py'),'exec'))
H=Path(__file__).resolve().parent
try:
 sql((H/'01-pre.sql.review').read_text(encoding='utf-8'))
 sql((H/'02-install.sql.review').read_text(encoding='utf-8'))
 pins=json.loads(sql("SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))) FROM pg_proc p WHERE proname IN ('tenant_microorganism_ficha_read_v1','tenant_microorganism_ficha_save_v1','micro_ficha_source_https_v1')"))
 assert pins==json.loads((H/'post-pins.json').read_text(encoding='utf-8')),'POST_PIN_DRIFT'
 subprocess.run(['python3',str(H/'build.py')],check=True)
 sql((H/'02-install.sql.review').read_text(encoding='utf-8'));sql((H/'03-post.sql.review').read_text(encoding='utf-8'))
 sql((H.parent/'05-release.sql.review').read_text(encoding='utf-8'))
 ack=json.loads(sql(actor(f"SELECT public.tenant_microorganism_ficha_save_v1(NULL,NULL,NULL,'{{\"root\":{{\"nome\":\"URL QA\",\"tipo\":\"bacteria\"}}}}','[]','{U(220)}')")))
 micro=ack['id'];version=ack['updated_at']
 check('reader feature allowed',actor(f"SELECT public.tenant_microorganism_ficha_read_v1('{micro}')->'extra'",2),'{}')
 sql('CREATE TABLE platform_private.test_features(enabled boolean);INSERT INTO platform_private.test_features VALUES(true);CREATE OR REPLACE FUNCTION public._saas_user_has_feature(uuid,text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$SELECT enabled FROM platform_private.test_features$$;')
 sql('UPDATE platform_private.test_features SET enabled=false')
 check('reader feature revoked denied',actor(f"SELECT public.tenant_microorganism_ficha_read_v1('{micro}')",2),error='feature_unavailable')
 sql('UPDATE platform_private.test_features SET enabled=true')
 check('reader feature restored allowed',actor(f"SELECT public.tenant_microorganism_ficha_read_v1('{micro}')->'extra'",2),'{}')
 invalid=['javascript:alert(1)','data:text/html,test','http://example.org/a','https://u:p@example.org/a','https://example.org/\nattack','https://example.org/%0aattack','https://example.org\\evil','https://localhost/test','https://site.local/test']
 for i,url in enumerate(invalid):
  payload={'root':{'nome':'MUST_NOT_SAVE'},'children':[{'kind':'source','id':None,'updated_at':None,'fields':{'fonte_titulo':'URL QA','fonte_url':url,'fonte_tipo':'outro','nivel_confianca':'baixo'}}]}
  check('URL denied '+str(i),actor(f"SELECT public.tenant_microorganism_ficha_save_v1('{micro}','{version}',NULL,'{json.dumps(payload)}','[]','{U(230+i)}')"),error='source_url_invalid')
 check('bad URL atomic root unchanged',f"SELECT nome FROM microrganismos WHERE id='{micro}'",'URL QA')
 check('bad URL no source','SELECT count(*) FROM catalog_technical_sources','0')
 payload={'root':{},'children':[{'kind':'source','id':None,'updated_at':None,'fields':{'fonte_titulo':'Embrapa QA','fonte_url':'https://www.embrapa.br/documento','fonte_tipo':'embrapa','nivel_confianca':'medio'}}]}
 check('HTTPS source accepted',actor(f"SELECT public.tenant_microorganism_ficha_save_v1('{micro}','{version}',NULL,'{json.dumps(payload)}','[]','{U(250)}')"))
 check('HTTPS persisted','SELECT fonte_url FROM catalog_technical_sources','https://www.embrapa.br/documento')
 sql((H/'04-rollback.sql.review').read_text(encoding='utf-8'));check('rollback denies reader',actor(f"SELECT public.tenant_microorganism_ficha_read_v1('{micro}')",2),error='permission denied')
 (H/'pg-result.json').write_text(json.dumps({'count':len(results),'checks':results,'limits':'synthetic Auth/feature/schema, captured actor/root. NOT hosted'},indent=2)+'\n',encoding='utf-8',newline='\n')
 print(json.dumps({'count':len(results),'pass':True,'post_pins':pins}))
finally:
 subprocess.run(priv+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(tmp,ignore_errors=True)

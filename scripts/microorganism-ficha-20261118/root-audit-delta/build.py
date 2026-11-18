#!/usr/bin/env python3
"""Additive pinned corrections only; baseline installer remains byte-exact. Always UTF-8 LF."""
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent
BASE=H.parent
text=(BASE/'02-install.sql.review').read_text()
functions={}
for name in ['tenant_microorganism_ficha_read_v1','tenant_microorganism_ficha_save_v1']:
 start=text.index('CREATE FUNCTION public.'+name+'(')
 end=text.index('END $f$;',start)+len('END $f$;')
 functions[name]=text[start:end]
old=json.loads((BASE/'evidence/local-post-function-pins.json').read_text())
read=functions['tenant_microorganism_ficha_read_v1'].replace("catalog_tenant_actor('read_prefs')","catalog_tenant_actor('read_catalog')")
anchor="  FOR k IN SELECT jsonb_object_keys(child->'fields') LOOP"
validation="""  IF kind='source' AND child->'fields' ? 'fonte_url' AND jsonb_typeof(child->'fields'->'fonte_url')<>'null' THEN
   IF jsonb_typeof(child->'fields'->'fonte_url') IS DISTINCT FROM 'string' OR NOT platform_private.micro_ficha_source_https_v1(child->'fields'->>'fonte_url') THEN RAISE EXCEPTION 'source_url_invalid' USING ERRCODE='22023'; END IF;
  END IF;
"""
save=functions['tenant_microorganism_ficha_save_v1'].replace(anchor,validation+anchor)
helper="""CREATE FUNCTION platform_private.micro_ficha_source_https_v1(p_url text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $f$
 SELECT p_url IS NOT NULL AND length(p_url)<=2048 AND p_url ~ '^https://[A-Za-z0-9.-]+(:443)?([/?#]|$)' AND p_url !~ '[[:space:][:cntrl:]\\\\]' AND p_url !~* '%(0[0-9a-f]|1[0-9a-f]|7f)' AND p_url !~ '^https://[^/?#]*@' AND p_url !~* '^https://(localhost|[^/?#]*\\.local)(:443)?([/?#]|$)'
$f$;
REVOKE ALL ON FUNCTION platform_private.micro_ficha_source_https_v1(text) FROM PUBLIC,anon,authenticated,service_role;
"""
checks='\n'.join(f"IF md5(pg_get_functiondef(to_regprocedure('public.{sig}'))) IS DISTINCT FROM '{pin}' THEN RAISE EXCEPTION 'ROOT_AUDIT_PRE_DRIFT:{sig}'; END IF;" for sig,pin in old.items() if sig.startswith(('tenant_microorganism_ficha_read_v1','tenant_microorganism_ficha_save_v1')))
body=helper+'\n'+read.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1)+'\n'+save.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1)
def write(path,s):path.write_text(s,encoding='utf-8',newline='\n')
write(H/'01-pre.sql.review', 'DO $pre$ BEGIN\n'+checks+'\nEND $pre$;\n')
# Test captures pg_get_functiondef normalized POST once in disposable PG; fixed checked artifact then verifies exact values.
post=H/'post-pins.json'
if post.exists():
 pins=json.loads(post.read_text());postchecks='\n'.join(f"IF md5(pg_get_functiondef(to_regprocedure('{sig}'))) IS DISTINCT FROM '{pin}' THEN RAISE EXCEPTION 'ROOT_AUDIT_POST_DRIFT:{sig}'; END IF;" for sig,pin in pins.items())
else:raise SystemExit('POST_PINS_REQUIRED: run disposable test to establish exact post definitions before assembly')
write(H/'02-install.sql.review','BEGIN;\nDO $install$ BEGIN\nIF to_regprocedure(\'platform_private.micro_ficha_source_https_v1(text)\') IS NULL THEN\n'+checks+'\nEXECUTE $delta$'+body+'$delta$;\nEND IF;\n'+postchecks+'\nEND $install$;\nCOMMIT;\n')
write(H/'03-post.sql.review','DO $post$ BEGIN\n'+postchecks+"\nIF has_function_privilege('authenticated','platform_private.micro_ficha_source_https_v1(text)','EXECUTE') OR has_function_privilege('service_role','platform_private.micro_ficha_source_https_v1(text)','EXECUTE') THEN RAISE EXCEPTION 'ROOT_AUDIT_PRIVATE_ACL_DRIFT'; END IF;\nEND $post$;\n")
write(H/'04-rollback.sql.review',"BEGIN;\nREVOKE EXECUTE ON FUNCTION public.tenant_microorganism_ficha_read_v1(uuid),public.tenant_microorganism_ficha_save_v1(uuid,timestamptz,timestamptz,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;\nCOMMIT;\n-- Deny-only: never restore read_prefs bypass or unsafe URL writer; retain all rows/history.\n")
write(H/'source.sql.review',body)
print(json.dumps({'generated':True,'post_pins_defined':bool(postchecks),'baseline_unchanged':True}))

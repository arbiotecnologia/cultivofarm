#!/usr/bin/env python3
"""HML-only JWT QA. Root supplies private credentials/manifest; no business service-role.
Creates only the manifest's synthetic microorganism via the canonical reviewed writer.
Does not provision Auth, change roles, invoke fiscal/approval/delivery, or clean up history.
Root cleans exact synthetic IDs after the separate cleanup review.
"""
import json
import os
from pathlib import Path
import urllib.error
import urllib.request
import uuid

REF = "vrlcdwmlytukrjezrrnf"
URL = f"https://{REF}.supabase.co"
manifest = json.loads(Path(os.environ["MICRO_QA_MANIFEST"]).read_text(encoding='utf-8'))
if manifest.get("ref") != REF or manifest.get("synthetic") is not True or manifest.get("release_reviewed") is not True:
    raise SystemExit("MANIFEST_DENIED")
key = os.environ["HML_ANON_KEY"]
tokens = {name: os.environ[name] for name in ("QA_MICRO_EDITOR_A", "QA_MICRO_READER_A", "QA_MICRO_EDITOR_B")}
for token in tokens.values():
    import base64
    claims = json.loads(base64.urlsafe_b64decode(token.split('.')[1] + '==='))
    if claims.get('role') != 'authenticated' or claims.get('iss') != URL + '/auth/v1':
        raise SystemExit('JWT_BINDING_DENIED')
results = []
def call(token, endpoint, body):
    request = urllib.request.Request(URL + endpoint, data=json.dumps(body).encode(), headers={
        "apikey":key, "Authorization":"Bearer " + token, "Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(request, timeout=100) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        try: data=json.loads(error.read())
        except Exception: data={}
        return error.code,data
def rpc(actor, name, payload):return call(tokens[actor], '/rest/v1/rpc/' + name, payload)
def check(name, valid):
    results.append({"name":name,"status":"PASS" if valid else "FAIL"})
    print(results[-1]['status'],name)
    if not valid: raise SystemExit('QA_FAILED: no payload/JWT printed; root reviews fixture')
evidence=[{"field":"resumo_curto","value":"Conteúdo sintético para QA de persistência, não recomendação agronômica.",
 "identity":{"name":manifest['micro_name'],"manufacturer":"QA","registration":"","entity":"microrganismo"},
 "sources":[{"url":"https://example.org/qa","title":"Documento sintético QA","excerpt":"Somente teste de transporte/persistência."}]}]
intent={"p_id":None,"p_expected_updated_at":None,"p_expected_profile_updated_at":None,
 "p_payload":{"root":{"nome":manifest['micro_name'],"tipo":"bacteria","codigo":manifest['micro_code']},
 "extra":{"cepa":"QA sem uso operacional"},"content":{"resumo_curto":evidence[0]['value']}},
 "p_evidence":evidence,"p_key":manifest['create_key']}
status,ack=rpc('QA_MICRO_EDITOR_A','tenant_microorganism_ficha_save_v1',intent)
check('create_auth_rpc',status==200 and ack.get('ok') is True and ack.get('organization_id')==manifest['org_a'])
micro_id=str(uuid.UUID(ack['id']))
state=Path(os.environ['MICRO_QA_STATE'])
state.write_text(json.dumps({'ref':REF,'synthetic':True,'micro_id':micro_id,'create_key':manifest['create_key']},indent=2),encoding='utf-8',newline='\n')
status,replay=rpc('QA_MICRO_EDITOR_A','tenant_microorganism_ficha_save_v1',intent)
check('exact_replay',status==200 and replay.get('id')==micro_id and replay.get('replayed') is True)
for actor in ('QA_MICRO_EDITOR_A','QA_MICRO_READER_A'):
    status,data=rpc(actor,'tenant_microorganism_ficha_read_v1',{'p_id':micro_id})
    check('sources_reopen_'+actor,status==200 and data.get('extra',{}).get('cepa')=='QA sem uso operacional' and data.get('evidence')==evidence)
status,data=rpc('QA_MICRO_EDITOR_B','tenant_microorganism_ficha_read_v1',{'p_id':micro_id})
check('foreign_read_denied',status in (401,403) and data.get('code')=='42501')
status,data=rpc('QA_MICRO_READER_A','tenant_microorganism_ficha_save_v1',{**intent,'p_key':str(uuid.uuid4())})
check('reader_write_denied',status in (401,403) and data.get('code')=='42501')
status,data=rpc('QA_MICRO_EDITOR_B','tenant_microorganism_ficha_save_v1',{**intent,'p_id':micro_id,'p_expected_updated_at':ack['updated_at'],'p_key':str(uuid.uuid4())})
check('foreign_write_denied',status in (401,403) and data.get('code')=='42501')
if os.environ.get('RUN_REAL_DOCUMENTARY')=='yes':
    status,data=call(tokens['QA_MICRO_EDITOR_A'],'/functions/v1/catalog-documentary-suggestions',{
      'identity':{'entity':'microrganismo','id':micro_id,'name':manifest['micro_name'],'scientificName':'Bacillus subtilis',
      'manufacturer':'QA','registration':'','researchScope':'species'},'fields':['resumo_curto']})
    check('real_documentary_edge',status==200 and isinstance(data.get('candidates'),list) and isinstance(data.get('suggestions'),list))
    check('real_documentary_sourced',all(s.get('sources') and all(source.get('url','').startswith('https://') for source in s['sources']) for s in data['suggestions']))
    if not data['suggestions']:print('BLOCKED_NO_SUGGESTIONS: valid empty search, not evidence of content generation')
print(json.dumps({'ref':REF,'results':results,'pending':['revocation_old_JWT','direct_RLS','concurrent_lock_sessions','Storage','browser_desktop_mobile','exact_cleanup']},indent=2))
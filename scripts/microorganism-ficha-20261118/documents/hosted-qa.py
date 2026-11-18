#!/usr/bin/env python3
"""Root-run HML-only proof; real JWT inputs from env, no service-role business calls.
Uses ONLY root-designated synthetic micro fixture; never creates/deletes fixture or production data.
"""
import os,json,hashlib,urllib.request,urllib.error
from pathlib import Path
REF='vrlcdwmlytukrjezrrnf'
if os.environ.get('QA_MICRO_DOCUMENTS_REF')!=REF:raise SystemExit('HML_REF_REQUIRED')
base=f'https://{REF}.supabase.co'
key=os.environ['QA_MICRO_ANON_KEY']
tokens={name:os.environ['QA_MICRO_'+name+'_JWT'] for name in ('EDITOR_A','READER_A','EDITOR_B')}
micro=os.environ['QA_MICRO_SYNTHETIC_ID'];root_version=os.environ['QA_MICRO_EXPECTED_ROOT']
if os.environ.get('QA_MICRO_SYNTHETIC_CONFIRMED')!='true':raise SystemExit('EXPLICIT_SYNTHETIC_FIXTURE_REQUIRED')
results=[]
def call(actor,path,body,headers=None):
 payload=json.dumps(body).encode() if not isinstance(body,bytes) else body
 request=urllib.request.Request(base+path,data=payload,method='POST',headers={'apikey':key,'Authorization':'Bearer '+tokens[actor],'Content-Type':'application/json',**(headers or {})})
 try:
  with urllib.request.urlopen(request,timeout=65) as response:return response.status,response.read(),response.headers
 except urllib.error.HTTPError as error:return error.code,error.read(),error.headers

def rpc(actor,name,body):
 status,data,headers=call(actor,'/rest/v1/rpc/'+name,body)
 return status,json.loads(data or b'null')
def check(name,condition):
 if not condition:raise AssertionError(name)
 results.append(name)
# A harmless synthetic PNG/PDF corpus supplied by root. Never include genuine records.
file=Path(os.environ['QA_MICRO_DOCUMENT_FILE']).read_bytes();mime=os.environ['QA_MICRO_DOCUMENT_MIME']
sha=hashlib.sha256(file).hexdigest();import uuid
key_id=str(uuid.uuid4())
args={'p_micro':micro,'p_expected_root':root_version,'p_document':None,'p_previous_version':0,'p_metadata':{'title':'QA anexo exclusivo — sem aprovação','file_name':'qa-material.pdf' if mime=='application/pdf' else 'qa-material.png','mime':mime,'size_bytes':len(file),'sha256':sha},'p_key':key_id}
for name in ('READER_A','EDITOR_B'):
 status,data=rpc(name,'tenant_micro_document_prepare_v1',args);check(name+'_prepare_denied',status>=400)
status,p=rpc('EDITOR_A','tenant_micro_document_prepare_v1',args);check('prepare_A',status==200 and p.get('micro_id')==micro)
status,replay=rpc('EDITOR_A','tenant_micro_document_prepare_v1',args);check('prepare_same_reservation',status==200 and replay['upload_id']==p['upload_id'])
status,data,headers=call('EDITOR_A','/functions/v1/microorganism-documents',file,{'Content-Type':mime,'x-micro-id':micro,'x-document-id':p['upload_id'],'x-document-action':'upload'})
check('real_private_upload',status==200 and json.loads(data).get('verified') is True)
status,a=rpc('EDITOR_A','tenant_micro_document_commit_v1',{'p_micro':micro,'p_upload':p['upload_id']});check('commit_A',status==200 and a.get('micro_id')==micro)
status,replay=rpc('EDITOR_A','tenant_micro_document_commit_v1',{'p_micro':micro,'p_upload':p['upload_id']});check('commit_same_version',status==200 and replay.get('version_id')==a['version_id'])
status,docs=rpc('READER_A','tenant_micro_document_list_v1',{'p_micro':micro});check('reader_A_reopen',status==200 and any(d['id']==a['version_id'] and d['sha256']==sha for d in docs))
for actor in ('EDITOR_A','READER_A','EDITOR_B'):
 status,data,headers=call(actor,'/functions/v1/microorganism-documents',{}, {'x-micro-id':micro,'x-document-id':a['version_id'],'x-document-action':'open'})
 check(actor+'_bytes',status==200 and hashlib.sha256(data).hexdigest()==sha and headers.get('Cache-Control')=='private, no-store' if actor!='EDITOR_B' else status>=400)
# Metadata writer/table/Storage origin negatives: no signed URL is created.
status,data,headers=call('EDITOR_B','/rest/v1/rpc/tenant_micro_document_list_v1',{'p_micro':micro});check('tenant_B_list_denied',status>=400)
output={'ref':REF,'proof':'HOSTED_REAL_JWT_ONLY_IF_THIS_SCRIPT_COMPLETED','checks':results,'fixture_micro_id':micro,'version_id':a['version_id'],'updated_at':a['updated_at'],'sha256':sha,'cleanup':'History intentionally retained; root controls exact synthetic fixture cleanup. No destructive cleanup here.','pending':['revocation during actual bytes/locks with root-controlled fixture','direct Storage origin GET/list/upload denials','desktop/mobile real HML session','new-version real hosted CAS']}
Path(os.environ.get('QA_MICRO_DOCUMENTS_RESULT','/tmp/micro-documents-hosted-result.json')).write_text(json.dumps(output,indent=2),encoding='utf-8',newline='\n')
print(json.dumps({'count':len(results),'pass':True,'ref':REF,'remaining':output['pending']}))

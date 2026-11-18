import {useEffect,useRef,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useStorageAccessScope} from './useStorageAccessScope';
import {structuredAckSchema,structuredDossierSchema,StructuredDossierRefusal,type StructuredDossier} from '@/lib/productStructuredDossier';
/** Same canonical writer; unknown transport retains the exact intent and key. */
export async function saveStructuredDossier(args:{p_product_id:string;p_dossier_id:string;p_expected_updated_at:string;p_patch:{structured_data:StructuredDossier;request_id:string}}){
 structuredDossierSchema.parse(args.p_patch.structured_data);
 const {data,error}=await (supabase as unknown as {rpc:(name:string,args:unknown)=>PromiseLike<{data:unknown;error:{code?:string}|null}>}).rpc('tenant_product_dossier_management_save',args);
 if(error){if(['PT409','22023','42501','55006'].includes(error.code??''))throw new StructuredDossierRefusal(error.code??'');throw new Error('Tentativa não confirmada. Reenvie somente os mesmos dados.');}
 const ack=structuredAckSchema.parse(data);
 if(ack.product_id!==args.p_product_id||ack.dossier_id!==args.p_dossier_id||ack.request_id!==args.p_patch.request_id)throw new Error('Confirmação divergente. Preserve a tentativa.');
 return ack;
}
export function useStructuredDossierSave(productId:string){
 const access=useStorageAccessScope(`structured-dossier:${productId}`);const lock=useRef(false);const attempt=useRef<Parameters<typeof saveStructuredDossier>[0]|null>(null);
 const [busy,setBusy]=useState(false);const [uncertain,setUncertain]=useState(false);const [refused,setRefused]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{attempt.current=null;lock.current=false;setBusy(false);setUncertain(false);setRefused(false);setError('');},[access.scope]);
 async function save(dossierId:string,revision:string,value:StructuredDossier){
  if(lock.current||!access.ready||refused)return null;
  const valid=access.capture();const data=structuredDossierSchema.parse(value);
  if(attempt.current&&JSON.stringify(attempt.current.p_patch.structured_data)!==JSON.stringify(data)){setError('A tentativa pendente deve ser consultada ou reenviada sem alterações.');return null;}
  const args=attempt.current??{p_product_id:productId,p_dossier_id:dossierId,p_expected_updated_at:revision,p_patch:{structured_data:data,request_id:crypto.randomUUID()}};
  attempt.current=args;lock.current=true;setBusy(true);setError('');
  try{const ack=await saveStructuredDossier(args);if(!valid())return null;attempt.current=null;setUncertain(false);return ack;}
  catch(e){if(valid()){if(e instanceof StructuredDossierRefusal){attempt.current=null;setRefused(true);setUncertain(false);}else setUncertain(true);setError(e instanceof Error?e.message:'Salvamento não confirmado.');}return null;}
  finally{if(valid()){lock.current=false;setBusy(false);}}
 }
 return {save,busy,uncertain,refused,error,ready:access.ready,capture:access.capture,reconciled:()=>{setRefused(false);setError('');}};
}
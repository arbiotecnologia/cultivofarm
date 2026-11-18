import {z} from 'zod';
const text=(max:number)=>z.string().max(max);
export const structuredOriginSchema=z.object({title:text(300).min(1),url:text(2048).refine(v=>{if(v==='')return true;try{return ['http:','https:'].includes(new URL(v).protocol);}catch{return false;}},'Informe uma fonte HTTP(S).'),document_id:z.string().uuid().nullable(),excerpt:text(4000)}).strict().refine(o=>o.url!==''||o.document_id!==null,{message:'Informe uma URL HTTP(S) ou vincule um documento privado do dossiê.',path:['url']});
const registrationSchema=z.object({holder:text(200),manufacturer:text(200),number:text(120),agency:text(120),documentary_status:z.enum(['PENDING','DOCUMENTED']),origin:structuredOriginSchema.nullable()}).strict().superRefine((r,c)=>{
 if(!r.origin&&(r.holder||r.manufacturer||r.number||r.agency||r.documentary_status!=='PENDING'))c.addIssue({code:'custom',message:'Vincule uma fonte documental antes de informar o registro.'});
});
export const guaranteeLineSchema=z.object({id:z.string().uuid(),kind:z.enum(['SUBSTANCE','NUTRIENT']),name:text(200).min(1),value:z.string().regex(/^\d{1,9}(?:\.\d{1,9})?$/),unit:z.enum(['g/kg','g/L','mg/kg','mg/L','kg/kg','kg/L','%','g/100g','g/100mL']),base:z.enum(['PRODUCT','DRY_MATTER','MASS_MASS','MASS_VOLUME']),form:text(200),origin:structuredOriginSchema}).strict();
export const structuredDossierSchema=z.object({schema_version:z.literal(1),registration:registrationSchema,lines:z.array(guaranteeLineSchema).max(100)}).strict().superRefine((d,c)=>{
 if(new Set(d.lines.map(l=>l.id)).size!==d.lines.length)c.addIssue({code:'custom',message:'Identificadores de linhas repetidos.'});
 if(d.lines.some(l=>['%','g/100g'].includes(l.unit)&&Number(l.value)>100))c.addIssue({code:'custom',message:'Garantia percentual não pode exceder 100.'});
});
export type StructuredDossier=z.infer<typeof structuredDossierSchema>;
export type StructuredOrigin=z.infer<typeof structuredOriginSchema>;
export const emptyStructuredDossier=():StructuredDossier=>({schema_version:1,registration:{holder:'',manufacturer:'',number:'',agency:'',documentary_status:'PENDING',origin:null},lines:[]});
export const structuredAckSchema=z.object({product_id:z.string().uuid(),dossier_id:z.string().uuid(),updated_at:z.string().min(1),request_id:z.string().uuid()});
export class StructuredDossierRefusal extends Error {constructor(public code:string){super(code==='PT409'?'O registro mudou. Consulte a revisão atual antes de retomar.':'Não foi possível salvar os dados documentais.');}}
import {z} from 'zod';
const text=(max:number,label:string)=>z.string({invalid_type_error:`${label}: informe um texto.`}).max(max,`${label}: máximo de ${max} caracteres.`);
export const structuredOriginSchema=z.object({title:text(300,'Título da fonte').min(1,'Título da fonte é obrigatório.'),url:text(2048,'URL da fonte').refine(v=>{if(v==='')return true;try{return ['http:','https:'].includes(new URL(v).protocol);}catch{return false;}},'Informe uma fonte HTTP(S).'),document_id:z.string().uuid().nullable(),excerpt:text(4000,'Trecho documental')}).strict().refine(o=>o.url!==''||o.document_id!==null,{message:'Informe uma URL HTTP(S) ou vincule um documento privado do dossiê.',path:['url']});
const registrationSchema=z.object({holder:text(200,'Titular'),manufacturer:text(200,'Fabricante'),number:text(120,'Número do registro'),agency:text(120,'Órgão do registro'),documentary_status:z.enum(['PENDING','DOCUMENTED']),origin:structuredOriginSchema.nullable()}).strict().superRefine((r,c)=>{
 if(!r.origin&&(r.holder||r.manufacturer||r.number||r.agency||r.documentary_status!=='PENDING'))c.addIssue({code:'custom',message:'Vincule uma fonte documental antes de informar o registro.'});
});
export const guaranteeLineSchema=z.object({id:z.string().uuid(),kind:z.enum(['SUBSTANCE','NUTRIENT']),name:text(200,'Nome da linha').min(1,'Nome da substância ou nutriente é obrigatório.'),value:z.string({invalid_type_error:'Valor documental: informe um número em texto.'}).regex(/^\d{1,9}(?:\.\d{1,9})?$/,'Valor documental inválido: use número decimal com ponto, até 9 dígitos por parte.'),unit:z.enum(['g/kg','g/L','mg/kg','mg/L','kg/kg','kg/L','%','g/100g','g/100mL']),base:z.enum(['PRODUCT','DRY_MATTER','MASS_MASS','MASS_VOLUME']),form:text(200,'Forma documentada'),origin:structuredOriginSchema}).strict();
export const structuredDossierSchema=z.object({schema_version:z.literal(1),registration:registrationSchema,lines:z.array(guaranteeLineSchema).max(100,'Máximo de 100 linhas de substâncias e nutrientes.')}).strict().superRefine((d,c)=>{
 if(new Set(d.lines.map(l=>l.id)).size!==d.lines.length)c.addIssue({code:'custom',message:'Identificadores de linhas repetidos.'});
 if(d.lines.some(l=>['%','g/100g'].includes(l.unit)&&Number(l.value)>100))c.addIssue({code:'custom',message:'Garantia percentual não pode exceder 100.'});
});
const lineFieldLabels:Record<string,string>={name:'nome',value:'valor documental',form:'forma documentada',origin:'fonte documental',kind:'tipo',unit:'unidade',base:'base'};
const registrationFieldLabels:Record<string,string>={holder:'titular',manufacturer:'fabricante',number:'número do registro',agency:'órgão do registro',origin:'fonte documental',documentary_status:'situação documental'};
export function formatStructuredIssue(issue:import('zod').ZodIssue):string{
 const path=issue.path;
 let where='';
 if(path[0]==='lines'&&typeof path[1]==='number')where=`Linha ${path[1]+1}${typeof path[2]==='string'?` — ${lineFieldLabels[path[2]]??path[2]}`:''}: `;
 else if(path[0]==='registration')where=`Registro${typeof path[1]==='string'?` — ${registrationFieldLabels[path[1]]??path[1]}`:''}: `;
 return where+issue.message;
}
export type StructuredDossier=z.infer<typeof structuredDossierSchema>;
export type StructuredOrigin=z.infer<typeof structuredOriginSchema>;
export const emptyStructuredDossier=():StructuredDossier=>({schema_version:1,registration:{holder:'',manufacturer:'',number:'',agency:'',documentary_status:'PENDING',origin:null},lines:[]});
export const structuredAckSchema=z.object({product_id:z.string().uuid(),dossier_id:z.string().uuid(),updated_at:z.string().min(1),request_id:z.string().uuid()});
export class StructuredDossierRefusal extends Error {constructor(public code:string){super(code==='PT409'?'O registro mudou. Consulte a revisão atual antes de retomar.':'Não foi possível salvar os dados documentais.');}}
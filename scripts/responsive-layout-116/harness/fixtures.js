export const SUPABASE_URL='https://swzpzcwiasxmjutrmvkm.supabase.co';export const SUPABASE_PUBLISHABLE_KEY='synthetic-not-a-key';
const actor='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',stamp='2026-11-14T00:00:00Z';
window.reviewCalls=[];window.reviewWrites=[];
const row={id,nome:'Homologação sintética com nome representativo muito extenso para revisão de conteúdo completo',razao_social:'Empresa de homologação sintética',codigo:'QA-RESP',ativo:true,organization_id:org,owner_organization_id:org,updated_at:stamp,created_at:stamp,status:'ativo',tipo:'solo',b2b_enabled:false,familia_catalogo:'biologico',classe_catalogo:null,cliente_id:id,fazenda_id:id,talhao_id:id,produto_id:id,area_ha:12,uf:'MG',cidade:'Paracatu',email:'qa@example.invalid',cnpj:'00000000000000',data: '2026-11-14'};
function data(name,args,one){const role=window.reviewRole;
 if(name==='get_my_entitlement_context')return role==='superadmin'?'platform_superadmin':'legacy_unversioned';
 if(name==='get_my_available_portal_contexts')return {schema_version:1,user_id:actor,organization_id:org,roles:[role],available_contexts:role==='parceiro_b2b'?['b2b']:role==='cliente_produtor'?['producer']:role==='administrador'?['admin','technical','producer']:['technical'],default_context:role==='parceiro_b2b'?'b2b':'technical',must_select_context:false,has_b2b_access:role==='parceiro_b2b',has_technical_access:!['superadmin','financeiro','cliente_produtor'].includes(role),is_admin:role==='administrador'};
 if(name==='has_technical_access'||name==='has_feature'||name==='has_role'||name==='is_platform_superadmin')return true;
 if(name==='tenant_admin_list_users')return {items:[{...row,user_id:id,roles:['consultor_tecnico'],perfil:'consultor_tecnico',senha_provisoria:false}],total:1};
 if(name==='org_onboarding_state')return {nome:row.nome,organization_id:org,status:'active'};
 if(name==='tenant_display_name_v1')return row.nome;
 if(name==='get_my_commercial_partner_context')return null;
 if(/capability|availability|context_probe/.test(name))return null;
 if(/platform_list_catalog_products/.test(name))return {items:[row],has_more:false};
 if(/tenant_product_list/.test(name))return {items:[row],has_more:false};
 if(/catalog.*labels/.test(name))return {items:[],has_more:false};
 if(name==='profiles')return one?{...row,id:actor,user_id:actor,senha_provisoria:false}:[];
 if(/system|configuracoes_sistema/.test(name))return one?null:[];
 if(/organizations/.test(name))return one?{...row,id:org,status:'active'}:[{...row,id:org,status:'active'}];
 if(['clientes','fazendas','talhoes','produtos','partner_accounts','organizations'].includes(name))return one?row:[row];
 return one?null:[];
}
function query(name,args,base=false){let one=false,write=false;const proxy=new Proxy({}, {get:(_,k)=>{if(k==='then')return (resolve,reject)=>{window.reviewCalls.push({name,args,one,write});if(write){window.reviewWrites.push(name);return Promise.resolve({data:null,error:{code:'42501',message:'Visual fixture forbids writes'}}).then(resolve,reject)}return Promise.resolve({data:data(name,args,one),error:null,count:1}).then(resolve,reject)};if(k==='catch')return cb=>Promise.resolve({data:data(name,args,one),error:null}).catch(cb);return (...a)=>{if(['insert','update','delete','upsert'].includes(k))write=true;if(['single','maybeSingle'].includes(k))one=true;return proxy}}});return proxy;}
export const supabase={from:name=>query(name,null,true),rpc:(name,args)=>query(name,args),auth:{getSession:async()=>({data:{session:{user:{id:actor},access_token:'synthetic'}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})},channel:()=>{const c={on:()=>c,subscribe:()=>c,unsubscribe:()=>{}};return c},removeChannel:()=>{},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}}),createSignedUrl:async()=>({data:null,error:{message:'Fixture has no storage'}})})},functions:{invoke:async name=>{window.reviewWrites.push(name);return {data:null,error:{message:'Visual fixture forbids invocation'}}}}};

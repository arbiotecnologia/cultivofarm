import {supabase as base} from '/__base-reads.js';
const actor='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222',partner='33333333-3333-4333-8333-333333333333',product='55555555-5555-4555-8555-555555555555',v1='66666666-6666-4666-8666-666666666666',v2='77777777-7777-4777-8777-777777777777';
const mode=new URLSearchParams(location.search).get('fixture')||'positive';window.reviewReads=[];window.reviewWrites=[];
const catalog=[{catalog_contract:'C1B_DUAL_TENANT_V1',item_id:product,item_tipo:'produto',product_id:product,produto_nome:'Bioinsumo sintético de catálogo com nome extenso para seleção de recipientes e leitura integral',produto_codigo:'SKU-QA-3',familia_catalogo:'biologico',preco_tabela:10,preco_parceiro:10,valor_litro_brl:10,valor_ha_brl:10,desconto_percentual:0,unidade_preco_principal:'litro',ficha_aprovada:true,ficha_status:'aprovado',ficha_conteudo:{}}];
function read(n,a){
 if(n==='c2_internal_order_entry_capability_v1')return {contract:'C2_INTERNAL_ORDER_ENTRY_V1',organization_id:org,order_create:mode!=='capability-denied',profile_ok:true,reason:mode==='capability-denied'?'actor_not_allowed':null,partners:[{partner_id:partner,commercial_owner_organization_id:org,razao_social:'Parceiro sintético da carteira com nome extenso e vínculo de empresa confirmado'}]};
 if(n==='seller_portfolio_capability_v1')return {contract:'seller_portfolio_capability_v1',version:2,ready:true,order_create:mode!=='capability-denied',quote_respond:false,fiscal_block:null,partners:[{partner_id:partner,razao_social:'Parceiro sintético da carteira com nome extenso e vínculo de empresa confirmado',order_create:mode!=='capability-denied'}]};
 if(n==='seller_portfolio_orders_v1')return {contract:'seller_portfolio_orders_v1',orders:[]};
 if(n==='internal_actor_context_v1')return {v:1,user_id:actor,organization_id:org,roles:[window.reviewRole],roles_confirmed:true,profile:{user_id:actor,organization_id:org,ativo:true,senha_provisoria:false}};
 if(n==='get_partner_catalog_secure')return catalog;
 if(n==='get_partner_catalog_volumes_secure')return {contract:'B2B_PARTNER_VOLUMES_V1',partner_id:a.p_partner_id,seller:{name:'Empresa vendedora sintética'},volumes:mode==='no-volumes'?[]:[{id:v1,item_tipo:'produto',produto_id:product,microrganismo_id:null,volume_ml:5000,rotulo:'Recipiente 5 L',ordem:1},{id:v2,item_tipo:'produto',produto_id:product,microrganismo_id:null,volume_ml:20000,rotulo:'Recipiente 20 L',ordem:2}]};
 if(n==='get_partner_packaging_offers_secure')return mode==='packaging-invalid'?{contract:'invalid'}:{contract:'B2B_PARTNER_PACKAGING_ORDER_V1',partner_id:a.p_partner_id,offers:[],solid_products:[]};
 if(n==='get_my_entitlement_context')return 'active';
 if(n==='get_my_entitlements')return ['pedidos_b2b','catalogo_precos','fichas_tecnicas'].map(feature_key=>({feature_key}));
 return undefined;
}
export const SUPABASE_URL='https://swzpzcwiasxmjutrmvkm.supabase.co';export const SUPABASE_PUBLISHABLE_KEY='synthetic-local';
export const supabase={...base,rpc:(n,a)=>{const d=read(n,a);window.reviewReads.push({name:n,args:a});if(d!==undefined){const q={then:(yes,no)=>Promise.resolve({data:d,error:null}).then(yes,no),abortSignal:()=>q};return q;} if(n.startsWith('get_')||n.includes('capability')||n.includes('context')||n.startsWith('tenant_')||n.startsWith('seller_portfolio'))return base.rpc(n,a);window.reviewWrites.push(n);const q={then:(yes,no)=>Promise.resolve({data:null,error:{code:'42501',message:'Offline operation closed'}}).then(yes,no),abortSignal:()=>q};return q;}};

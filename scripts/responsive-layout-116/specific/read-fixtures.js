export const SUPABASE_URL='https://swzpzcwiasxmjutrmvkm.supabase.co';export const SUPABASE_PUBLISHABLE_KEY='local-synthetic';
const id='33333333-3333-4333-8333-333333333333',org='22222222-2222-4222-8222-222222222222',actor='11111111-1111-4111-8111-111111111111';
window.reviewCalls=[];window.reviewWrites=[];
const base={id,organization_id:org,ativo:true,created_at:'2026-11-14T00:00:00Z',updated_at:'2026-11-14T00:00:00Z',cliente_id:id,fazenda_id:id,status:'ativo',nome:'Responsável sintético com nome extenso para leitura integral'};
const client={...base,nome:'Produtor sintético vinculado',status_cliente:'ativo',codigo_cliente:'QA-116',tipo_pessoa:'pf'};
const farm={...base,nome:'Fazenda sintética com vínculo ativo',area_total:20,area_hectares:20};
const plot={...base,nome:'Talhão sintético com cultura e safra',area_hectares:12,tipo_manejo_agua:'sequeiro',historico_pragas:'Monitoramento representativo',fazendas:{nome:farm.nome,cliente_id:id},culturas:{nome:'Milho'},cultura_id:id};
const order={...base,numero_os:'QA-116',origem:'manual',status:'programada',prioridade:'alta',data_programada:'2026-11-20',volume_total_ml:20000,produtos:{nome:'Produto sintético',dose_ml_ha:100},fazendas:{nome:farm.nome},talhoes:{nome:plot.nome}};
const receipt={...base,receipt_year:2026,receipt_number:'QA-116-2026',payment_date:'2026-11-14',amount:1234.56,status:'ISSUED',customer_id:id,storage_bucket:null,storage_path:null,authenticity_code:'SYNTHETIC',issued_at:'2026-11-14T00:00:00Z',payment_id:id,receivable_id:id,cancel_reason:null,customer:{nome:client.nome},method:{name:'Transferência'}};
const fiscal={code:'5101',description:'Operação sintética de venda com descrição extensa para leitura do código e finalidade completos',parent_code:null,metadata:{},is_active:true,is_preferred:true,catalog_version:'synthetic'};
function read(name,args,one){
 if(name==='produtos')return one?{...base,nome:'Produto sintético contextualizado',codigo:'QA-116',tipo:'biologico',dose_ml_ha:100,b2b_enabled:true}:[];
 if(name==='product_technical_profiles')return one?{...base,produto_id:id,status_validacao:'aprovado',resumo_curto:'Perfil sintético contextualizado',indicacoes_uso:'Cultura representativa'}:[];
 if(name==='get_partner_catalog_tecnico_secure')return [{catalog_contract:'C1B_DUAL_TENANT_V1',item_id:id,item_tipo:'produto',nome:'Produto sintético contextualizado',codigo:'QA-116',familia_catalogo:'biologico',ficha_aprovada:true,ficha_status:'aprovado',ficha_conteudo:{nome:'Produto sintético',modo_acao:'Leitura técnica sintética'},descricao_curta:'Descrição representativa',unidade_preco_principal:'L',valor_litro_brl:null}];
 if(name==='rpc_cockpit_listar_esteira_v1')return {items:[{os_id:id,origem_os:'manual',numero_os:'QA-116',produto_nome:'Produto sintético',cliente_nome:client.nome,status_os:'programada',volume_solicitado_l:20}],total_count:1};
 if(name==='platform_read_global_cultures')return {items:[{id,nome:'Cultura sintética',ativo:true}],has_more:false};
 if(name==='platform_read_global_culture_detail')return {id,nome:'Cultura sintética',descricao:'Descrição contextualizada',ativo:true,updated_at:'2026-11-14T00:00:00Z',desativada_em:null};
 if(name==='envase')return [{...base,lote_id:id,data_envase:'2026-11-14'}];
 if(name==='registros_consultor')return {...base,status:'rascunho',version:7,cultura_id:id,clientes:{nome:client.nome},fazendas:{nome:farm.nome},talhoes:{nome:plot.nome},culturas:{nome:'Milho'}};
 if(name==='get_cliente_ids_for_user')return [id];
 if(name==='user_clientes')return [{cliente_id:id,principal:true,is_active:true,revoked_at:null,valid_from:null,valid_until:null}];
 if(name==='clientes')return one?client:[client];if(name==='fazendas')return one?farm:[farm];if(name==='talhoes')return one?plot:[plot];if(name==='culturas')return [{id,nome:'Milho'}];
 if(name==='rpc_get_visita_workspace')return {audience:'interna',version:7,status:'rascunho',registro:{...base,observacoes_tecnicas:null,data_proxima_visita:'2026-11-20'},permissions:{can_view:true,can_edit:true,can_manage:true,is_participant:true,is_editable_status:true},cliente:client,fazenda:farm,talhao:plot,monitoramento:[],evidencias:[],equipe:[]};
 if(name==='rpc_fiscal_catalog_search_v1'||name==='rpc_fiscal_catalog_resolve_v1')return [fiscal];
 if(name==='audit_senha_log')return Array.from({length:18},(_,i)=>({id:String(i),created_at:'2026-11-14T00:00:00Z',executor:{nome:'Administrador sintético',email:'admin@example.invalid'},target:{nome:'Responsável sintético '+i,email:'alvo@example.invalid'}}));
 if(name==='ordens_servico')return one?order:[order];
 if(name==='financial_receipts')return [receipt];
 if(name==='get_financial_cashflow')return [{period_label:'14/11/2026',period_start:'2026-11-14',expected_inflows:1234.56,expected_outflows:0,realized_inflows:500,realized_outflows:0,projected_balance:1234.56,realized_balance:500,accumulated_projected_balance:1234.56,accumulated_realized_balance:500}];
 if(name==='accounts_receivable_installments')return [{...base,amount:1234.56,due_date:'2026-11-14',status:'OPEN',accounts_receivable:{id,description:'Título sintético com condição e vencimento',customers:{nome:client.nome}}}];
 if(name==='estoque_produto')return [{...base,status:'reservado',quantidade:4,volume_total:20000,lote_id:id,produto_id:id,lotes:{codigo_lote:'QA-116'},produtos:{nome:'Produto acabado sintético'},reservado_para_cliente_id:id,reservado_para_os_id:id,reservado_para_os_tipo:'TRADICIONAL'}];
 if(name==='controle_qualidade')return [{...base,lote_id:id,status:'aprovado',resultado:'aprovado',data_analise:'2026-11-14',ph:7,concentracao:1000000000,responsavel:'Responsável sintético',lotes:{codigo_lote:'QA-116',status:'aprovado',produto_id:id,produtos:{nome:'Produto biológico sintético'}}}];
 if(name==='lotes')return [{...base,codigo_lote:'QA-116',status:'aprovado',produto_id:id,volume_total_ml:20000,validade:'2027-01-01',produtos:{nome:'Produto biológico sintético'}}];
 if(name==='has_technical_access'||name==='has_feature')return true;
 return one?null:[];
}
function query(name,args){let one=false,write=false;const p=new Proxy({}, {get(_,k){if(k==='then')return (yes,no)=>{window.reviewCalls.push({name,args,one,write});if(write){window.reviewWrites.push(name);return Promise.resolve({data:null,error:{code:'42501',message:'Offline write denied'}}).then(yes,no)}return Promise.resolve({data:read(name,args,one),error:null,count:1}).then(yes,no)};return (...a)=>{if(['single','maybeSingle'].includes(k))one=true;if(['insert','update','delete','upsert'].includes(k))write=true;return p}}});return p}
export const supabase={from:n=>query(n),rpc:(n,a)=>query(n,a),auth:{getSession:async()=>({data:{session:{user:{id:actor},access_token:'synthetic'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},functions:{invoke:async n=>{window.reviewWrites.push(n);return {data:null,error:{message:'offline denied'}}}},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}})})},channel:()=>{const c={on:()=>c,subscribe:()=>c};return c},removeChannel(){}};

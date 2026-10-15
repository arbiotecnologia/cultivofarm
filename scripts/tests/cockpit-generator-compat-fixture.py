"""Exact generator and INSERT/recalc bodies; reduced Auth/schema, never hosted proof."""
from pathlib import Path
import re
import hashlib
ROOT=Path(__file__).resolve().parents[2]

def body(path,name):
    text=(ROOT/path).read_text()
    m=re.search(r'CREATE OR REPLACE FUNCTION public\.'+name+r'\(.*?AS \$\$(.*?)\$\$;',text,re.S)
    if not m: raise ValueError(name)
    return m.group(0)

def extend(q):
    candidate=(ROOT/'scripts/rbac-audit/proposed-cockpit-os-approval-closed.sql').read_text()
    gen=re.search(r'CREATE OR REPLACE FUNCTION public.generate_production_orders_from_partner.*?\$function\$;',candidate,re.S).group()
    assert hashlib.md5((gen[:-1]+'\n').encode()).hexdigest()=='2c75352712438df1558a3f5453e67da0'
    sql='''
ALTER TABLE ordens_servico ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE programacao_producao ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE ordens_servico ADD COLUMN area_hectares numeric, ADD COLUMN prioridade text, ADD COLUMN tipo_item text, ADD COLUMN numero_os text;
ALTER TABLE partner_orders ADD COLUMN status text DEFAULT 'aprovado', ADD COLUMN ready_for_production boolean DEFAULT true, ADD COLUMN internal_origin_snapshot jsonb, ADD COLUMN requires_financial_approval boolean DEFAULT false, ADD COLUMN financial_approval_status text;
ALTER TABLE partner_accounts ADD COLUMN nome_fantasia text, ADD COLUMN razao_social text;
ALTER TABLE partner_order_items ADD COLUMN quantidade numeric, ADD COLUMN unidade_medida text, ADD COLUMN preco_tabela_snapshot numeric, ADD COLUMN preco_unitario numeric, ADD COLUMN produto_nome_snapshot text, ADD COLUMN produto_codigo_snapshot text, ADD COLUMN created_at timestamptz DEFAULT now();
ALTER TABLE production_order_link ADD COLUMN partner_order_id uuid, ADD COLUMN partner_order_item_id uuid UNIQUE, ADD COLUMN planning_id uuid, ADD COLUMN created_by uuid;
CREATE UNIQUE INDEX ordens_servico_partner_order_item_unique ON ordens_servico(partner_order_item_id);
CREATE TYPE production_planning_status AS ENUM('aguardando_planejamento','planejado','em_producao','produzido','entregue','replanejar');
CREATE TABLE production_planning(id uuid PRIMARY KEY,partner_order_id uuid UNIQUE,partner_id uuid,status production_planning_status DEFAULT 'aguardando_planejamento',updated_at timestamptz);
CREATE TABLE production_timeline_events(partner_order_id uuid,event_type text,actor_id uuid,meta jsonb);
CREATE TABLE partner_order_audit_logs(order_id uuid,partner_id uuid,usuario_id uuid,acao text,dados_novos jsonb);
CREATE TABLE catalogo_volumes(item_tipo text,produto_id uuid,volume_ml numeric,preco_brl numeric,ativo boolean);
CREATE TABLE notificacoes_operacionais(usuario_id uuid,tipo text,titulo text,mensagem text,link text);
CREATE TABLE partner_users(user_id uuid,partner_id uuid);
CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql AS $$SELECT platform_private.h15_actor_organization()$$;
CREATE FUNCTION platform_private.lab_partner_order_authorized(p_order_id uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid:=auth.uid(); v_org uuid;
BEGIN
 IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'producao') OR public.has_role(v_uid,'gestor')) THEN RETURN false; END IF;
 v_org:=public.h15_actor_organization();
 IF v_org IS NULL THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM public.partner_orders o JOIN public.partner_accounts p ON p.id=o.partner_id
 WHERE o.id=p_order_id AND p.commercial_owner_organization_id=v_org AND p.ativo IS TRUE AND p.deleted_at IS NULL
 AND (p.client_id IS NULL OR EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=p.client_id AND c.organization_id=v_org)));
END $function$;
'''
    sql+=body('supabase/migrations/20260607172213_02d33e11-034d-49be-8b4a-dacd3317f614.sql','fn_create_programacao_on_os_classica_insert')
    for name in ['recalc_partner_order_production','tg_recalc_planning_from_link']:
        sql+=body('supabase/migrations/20260628212900_b86a0bf8-e32a-4dc8-b068-c4ddf9973e87.sql',name)
    sql+='''CREATE TRIGGER trg_create_programacao_on_os_insert AFTER INSERT ON ordens_servico FOR EACH ROW EXECUTE FUNCTION fn_create_programacao_on_os_classica_insert();
CREATE TRIGGER trg_recalc_planning_from_link AFTER INSERT ON production_order_link FOR EACH ROW EXECUTE FUNCTION tg_recalc_planning_from_link();
'''+gen
    A,B,U,C,P,M,PA,PO,PL=[q(i) for i in [1,2,41,11,21,22,180,181,182]]
    sql+=f'''SELECT set_config('t.org',{A},false),set_config('t.uid',{U},false),set_config('t.role','administrador',false);
INSERT INTO partner_accounts(id,commercial_owner_organization_id,ativo) VALUES({PA},{A},true);
INSERT INTO partner_orders(id,partner_id) VALUES({PO},{PA});
INSERT INTO production_planning(id,partner_order_id,partner_id) VALUES({PL},{PO},{PA});
INSERT INTO produtos(id,nome,familia_catalogo) VALUES({q(23)},'Chemical','quimico');
INSERT INTO partner_order_items(id,order_id,product_id,microrganismo_id,quantidade,unidade_medida,preco_unitario,produto_nome_snapshot) VALUES
({q(183)},{PO},{P},NULL,2,'litro',180,'Snapshot Bio'),
({q(184)},{PO},{P},NULL,1,'litro',180,'Snapshot Bio'),
({q(185)},{PO},NULL,{M},3,'hectare',NULL,'Snapshot Micro'),
({q(186)},{PO},{q(23)},NULL,5,'litro',90,'Snapshot Chemical');
'''
    labels=[]
    def check(label,expr,action=''):
        nonlocal sql
        labels.append(label);sql+=action+f"DO $t$ BEGIN IF NOT (({expr}) IS TRUE) THEN RAISE EXCEPTION 'FAIL {label}'; END IF; RAISE NOTICE 'PASS {label}'; END $t$;\n"
    def denied(label,change,undo):
        action=change+f"DO $t$ BEGIN BEGIN PERFORM generate_production_orders_from_partner({PO}); RAISE EXCEPTION 'FAIL denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $t$;"+undo
        check(label,f'NOT EXISTS(SELECT 1 FROM ordens_servico WHERE partner_order_id={PO})',action)
    denied('generator cross tenant before writes',f"SELECT set_config('t.org',{B},false);",f"SELECT set_config('t.org',{A},false);")
    denied('generator inactive before writes',f'UPDATE partner_accounts SET ativo=false WHERE id={PA};',f'UPDATE partner_accounts SET ativo=true WHERE id={PA};')
    check('generator creates two open only',f"(SELECT count(*) FROM ordens_servico WHERE partner_order_id={PO})=2 AND NOT EXISTS(SELECT 1 FROM ordens_servico WHERE partner_order_id={PO} AND status<>'aberta')",f'SELECT generate_production_orders_from_partner({PO});')
    check('generator NULL client preserved',f'NOT EXISTS(SELECT 1 FROM ordens_servico WHERE partner_order_id={PO} AND cliente_id IS NOT NULL)')
    check('generator one pending program per OS',f"(SELECT count(*) FROM programacao_producao pp JOIN ordens_servico o ON o.id=pp.ordem_servico_id WHERE o.partner_order_id={PO})=2 AND NOT EXISTS(SELECT 1 FROM programacao_producao pp JOIN ordens_servico o ON o.id=pp.ordem_servico_id WHERE o.partner_order_id={PO} AND pp.status<>'aguardando')")
    check('generator no approval audit',f"NOT EXISTS(SELECT 1 FROM laboratorio_esteira_eventos e JOIN ordens_servico o ON o.id=e.os_id WHERE o.partner_order_id={PO} AND e.acao='aprovar_os')")
    check('generator volumes existing exact',f"EXISTS(SELECT 1 FROM ordens_servico WHERE partner_order_id={PO} AND produto_id={P} AND volume_total_ml=3000) AND EXISTS(SELECT 1 FROM ordens_servico WHERE partner_order_id={PO} AND microrganismo_id={M} AND volume_total_ml IS NULL AND area_hectares=3)")
    check('generator mixed commercial untouched',f"(SELECT count(*) FROM partner_order_items WHERE order_id={PO})=4 AND (SELECT status FROM partner_orders WHERE id={PO})='aprovado' AND (SELECT status FROM production_planning WHERE id={PL})='planejado' AND NOT EXISTS(SELECT 1 FROM notificacoes_operacionais)")
    check('generator snapshots unchanged',f"(SELECT produto_nome_snapshot FROM partner_order_items WHERE id={q(183)})='Snapshot Bio' AND (SELECT preco_unitario FROM partner_order_items WHERE id={q(183)})=180")
    check('generator replay no OS programs links audit',f"(SELECT count(*) FROM ordens_servico WHERE partner_order_id={PO})=2 AND (SELECT count(*) FROM production_order_link WHERE partner_order_id={PO})=3 AND (SELECT count(*) FROM partner_order_audit_logs WHERE order_id={PO})=1",f'SELECT generate_production_orders_from_partner({PO});')
    check('B2B approval mapping denied',f"NOT EXISTS(SELECT 1 FROM ordens_servico WHERE partner_order_id={PO} AND status<>'aberta')",f"DO $t$ DECLARE v uuid; BEGIN SELECT id INTO v FROM ordens_servico WHERE partner_order_id={PO} LIMIT 1; BEGIN PERFORM rpc_aprovar_os_v1(v,'b2b'); RAISE EXCEPTION 'FAIL mapping'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $t$;")
    return sql,labels

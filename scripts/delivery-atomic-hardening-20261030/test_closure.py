"""Real PostgreSQL mutation closure tests over assembled installer; no hosted writes."""
import test_pg as t

def run():
    sql,deny,check=t.sql,t.deny,t.check
    ent=sql("SELECT id FROM public.entregas WHERE status='separado' LIMIT 1;")
    for role in ['anon','authenticated','service_role']:
        prefix=f"SET ROLE {role}; SET request.jwt.claim.sub='{t.U}';"
        for action,statement in [('INSERT',f"INSERT INTO public.entregas(id) VALUES('{t.u(900)}');"),('UPDATE',f"UPDATE public.entregas SET motorista='spoof' WHERE id='{ent}';"),('DELETE',f"DELETE FROM public.entregas WHERE id='{ent}';")]:
            deny(role+' direct '+action,prefix+statement,'permission denied' if role!='service_role' else 'DELIVERY_MUTATION_CLOSED')
        deny(role+' legacy cancellation ACL',prefix+f"SELECT public.rpc_entrega_cancelar_v1('{ent}','local');",'permission denied')
    # Deliberate local grants prove trigger independently from table ACL/RLS.
    sql('GRANT INSERT,UPDATE,DELETE ON public.entregas TO authenticated;')
    deny('authenticated spoof GUC cannot update with local DML grant',t.actor()+f"SET app.entrega_cancelamento_id='{ent}';UPDATE public.entregas SET motorista='spoof' WHERE id='{ent}';",'DELIVERY_MUTATION_CLOSED')
    deny('privileged direct writer lacks private permit',f"UPDATE public.entregas SET motorista='spoof' WHERE id='{ent}';",'DELIVERY_MUTATION_CLOSED')
    sql('REVOKE INSERT,UPDATE,DELETE ON public.entregas FROM authenticated;')
    sql('GRANT EXECUTE ON FUNCTION public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb) TO authenticated;')
    item=sql(f"SELECT estoque_produto_id FROM public.entregas WHERE id='{ent}';")
    # Existing-record replay in legacy creation can read, never mutates; fresh
    # direct creation cannot obtain a delivery permit (canonical group alone issues it).
    deny('legacy creator direct INSERT denied without group permit',t.actor()+f"SELECT public.rpc_cockpit_criar_entrega_v1('{t.O}','manual','{t.S}',1,'{{}}');",'COCKPIT_ENTREGA_STATUS_ESTOQUE_INVALIDO')
    sql('REVOKE EXECUTE ON FUNCTION public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb) FROM authenticated;')
    check('closure retains authenticated SELECT',t.actor()+f"SELECT count(*)>0 FROM public.entregas WHERE organization_id='{t.A}';")
    check('closure no context residue',"SELECT count(*)=0 FROM platform_private.delivery_context_20261030;")

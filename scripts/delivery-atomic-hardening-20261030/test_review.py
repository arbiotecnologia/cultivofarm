"""Dedicated real locks/guards; no replaced authorities or disabled triggers during commands."""
import json,time
def run(t):
    sql,actor,check,deny=t.sql,t.actor,t.check,t.deny
    # Reject accepted-but-lost fields, including programmatic payload.
    for field in ['endereco_entrega','observacoes_entrega']:
        deny('unsupported field rejected '+field,actor()+t.call('field-'+field).replace("'{}'::jsonb", "'{\""+field+'\":\"value\"}'+"'::jsonb"),'DELIVERY_DATA_INVALID')
    # Fresh independent manufactured stock; actual group/merge writers retain all real triggers.
    def fresh(n,reserved='NULL',volume='10'):
        lote,item=t.u(n),t.u(n+1)
        sql('SET session_replication_role=replica;'+f"INSERT INTO public.lotes(id,organization_id,produto_id,status,codigo_lote,volume_produzido) VALUES('{lote}','{t.A}','{t.PROD}','aprovado','REVIEW-{n}',100); INSERT INTO public.estoque_produto(id,lote_id,produto_id,quantidade,volume_total,status,quantidade_reservada) VALUES('{item}','{lote}','{t.PROD}',10,{volume},'disponivel',{reserved}); SET session_replication_role=origin;")
        result=json.loads(sql(actor()+t.call('review-'+str(n),[{'item_id':item,'quantidade':2}])))
        return result['itens'][0]['entrega_id'],item
    ent,main=fresh(60)
    # Set zero through real unchanged stock motor adjustment is not a reservation mutation;
    # baseline correction is fixture manufacture, not evidence for a direct writer.
    sql('SET session_replication_role=replica;'+f"UPDATE public.estoque_produto SET quantidade_reservada=0 WHERE id='{main}';SET session_replication_role=origin;")
    sql(actor()+t.cancel(ent))
    check('merge accepts available zero reservation with preserved unique index',f"SELECT quantidade=10 AND volume_total=10 AND quantidade_reservada=0 FROM public.estoque_produto WHERE id='{main}';")
    for n,value in [(70,'0'),(80,'-1'),(90,"'NaN'::numeric"),(100,"'Infinity'::numeric")]:
        ent,main=fresh(n)
        sql('SET session_replication_role=replica;'+f"UPDATE public.estoque_produto SET volume_total={value} WHERE id='{main}';SET session_replication_role=origin;")
        deny('merge rejects nonpositive/nonfinite main volume '+value,actor()+t.cancel(ent),'DELIVERY_MERGE_BALANCE_DENIED')
        check('bad merge retains expedition and no cancel receipt '+str(n),f"SELECT status='separado' AND NOT EXISTS(SELECT 1 FROM platform_private.delivery_requests_20261030 WHERE request_key='cancel:{ent}') FROM public.entregas WHERE id='{ent}';")
    ent,main=fresh(110)
    sql('SET session_replication_role=replica;'+f"UPDATE public.estoque_produto SET validade='2031-01-01' WHERE id='{main}';SET session_replication_role=origin;")
    deny('merge incompatible expiry rejected explicitly',actor()+t.cancel(ent),'DELIVERY_MERGE_INCOMPATIBLE')
    # Same tenant different active internal identity, same client key.
    w=t.u(120)
    sql('SET session_replication_role=replica;'+f"INSERT INTO auth.users(id) VALUES('{w}');INSERT INTO public.profiles(user_id,organization_id,nome,ativo,senha_provisoria) VALUES('{w}','{t.A}','REVIEW OTHER',true,false);INSERT INTO public.user_roles(user_id,role) VALUES('{w}','administrador');SET session_replication_role=origin;")
    ent,main=fresh(130)
    t.observed.pop('review-130')
    sql(actor(w)+t.call('review-130',[{'item_id':main,'quantidade':2}]))
    check('same tenant distinct actors same key separate receipts',"SELECT count(*)=2 AND count(DISTINCT actor)=2 FROM platform_private.delivery_requests_20261030 WHERE request_key='review-130';")
    deny('legacy cancel remains contained',f"SELECT public.rpc_entrega_cancelar_v1('{ent}','local');",'DELIVERY_LEGACY_CLOSED')
    deny('cancel NULL observed denied',actor()+f"SELECT public.rpc_entrega_cancelar_v1('{ent}','local',NULL);",'DELIVERY_CANCEL_INVALID')
    deny('cancel stale observed denied',actor()+f"SELECT public.rpc_entrega_cancelar_v1('{ent}','local','2001-01-01'::timestamptz);",'DELIVERY_OBSERVED_CONFLICT')
    # Advisory/gate revocation commits before delivery may take its gate.
    for n,kind in [(140,'advisory'),(150,'gate')]:
        ent,main=fresh(n);command=actor()+t.cancel(ent)
        lock=(f"SELECT pg_advisory_xact_lock(hashtext('entrega_cancelar:{ent}'));" if kind=='advisory' else 'SELECT 1 FROM cf_user_guards_v1.state FOR UPDATE;')
        holder=t.session('BEGIN;'+lock);time.sleep(.1);worker=t.session(command);t.wait()
        if kind=='advisory':sql(f"UPDATE public.profiles SET ativo=false WHERE user_id='{t.U}';")
        t.finish(holder,(f"UPDATE public.profiles SET ativo=false WHERE user_id='{t.U}';" if kind=='gate' else '')+'COMMIT;');out,err=t.finish(worker)
        assert 'DELIVERY_ACTOR_DENIED' in err or 'DELIVERY_SCOPE_CHANGED' in err,err+out
        t.checks.append({'test':'cancel committed revocation while awaiting '+kind,'status':'PASS','observed':err})
        sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{t.U}';")
        check('cancel revoked no effects '+kind,f"SELECT status='separado' AND NOT EXISTS(SELECT 1 FROM platform_private.delivery_requests_20261030 WHERE request_key='cancel:{ent}') FROM public.entregas WHERE id='{ent}';")
    # After the gate, real revocation writers must wait (not bypass the guard).
    # Row and merge waits prove serialization, then post-revocation replay must deny.
    for n,kind in [(160,'row'),(170,'merge')]:
        ent,main=fresh(n);command=actor()+t.cancel(ent)
        lock=(f"SELECT 1 FROM public.entregas WHERE id='{ent}' FOR UPDATE;" if kind=='row' else f"SELECT 1 FROM public.estoque_produto WHERE id='{main}' FOR UPDATE;")
        holder=t.session('BEGIN;'+lock);time.sleep(.1);worker=t.session(command);t.wait()
        revoker=t.session(f"UPDATE public.profiles SET ativo=false WHERE user_id='{t.U}';")
        time.sleep(.1)
        check('real revoker waits gate during cancel '+kind,"SELECT count(*)>=2 FROM pg_stat_activity WHERE wait_event_type='Lock' AND pid<>pg_backend_pid();")
        t.finish(holder,'COMMIT;');out,err=t.finish(worker);out2,err2=t.finish(revoker)
        assert '"success": true' in out and not err and not err2,err+err2+out
        t.checks.append({'test':'cancel '+kind+' wait serializes effective revocation after commit','status':'PASS','observed':out})
        deny('cancel replay denied after effective revocation '+kind,command,'DELIVERY_ACTOR_DENIED')
        sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{t.U}';")
    # OS changes made by holder before request's advisory release: deny before effects/replay.
    for n,field,value,expected in [(180,'origem',"'b2b'",'DELIVERY_SCOPE_DENIED'),(190,'cliente_id',f"'{t.D}'",'DELIVERY_SCOPE_DENIED')]:
        ent,main=fresh(n);cmd=t.call('review-'+str(n),[{'item_id':main,'quantidade':2}])
        holder=t.session('BEGIN;'+f"SELECT pg_advisory_xact_lock(hashtextextended('delivery_request:'||jsonb_build_array('{t.A}'::uuid,'{t.U}'::uuid,'group','review-{n}')::text,0));")
        time.sleep(.1);worker=t.session(actor()+cmd);t.wait()
        out,err=t.finish(holder,f"UPDATE public.ordens_servico SET {field}={value} WHERE id='{t.O}';COMMIT;")
        if err:
            assert 'não podem ser alterados' in err or 'OS' in err,err
            out,worker_err=t.finish(worker)
            assert '"replay": true' in out and not worker_err,worker_err+out
            t.checks.append({'test':'LIVE structural guard prevents OS '+field+' alteration during wait; unchanged replay permitted','status':'PASS','observed':err})
        else:
            out,err=t.finish(worker);assert expected in err or 'DELIVERY_OBSERVED_CONFLICT' in err,err+out
            t.checks.append({'test':'OS '+field+' changed while waiting denies replay','status':'PASS','observed':err})
        sql(f"UPDATE public.ordens_servico SET origem='agronomica',cliente_id='{t.C}' WHERE id='{t.O}';")
    check('dedicated tests zero finance/outbox',"SELECT NOT EXISTS(SELECT 1 FROM public.accounts_receivable) AND NOT EXISTS(SELECT 1 FROM public.comunicacao_outbox);")
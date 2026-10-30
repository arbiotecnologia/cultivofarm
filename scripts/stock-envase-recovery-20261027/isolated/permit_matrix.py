"""Exact per-row permit negatives on restored tables; no hosted IO."""
import json

def run(X):
    T=X.T
    o,p,l=[T.u(2800+i) for i in range(3)]
    X.sql('SET session_replication_role=replica;'+T.manufactured(o,p,l,vol=1000))
    X.last(T.actor(T.W)+T.envase(o,p,l,[{'tipo_embalagem':'frasco_1L','quantidade':3}],'permit-source01'))
    row=json.loads(X.last(f"SELECT (to_jsonb(e)-'created_at')::text FROM public.envase e WHERE lote_id='{l}';"))
    row['id']=T.u(2804)
    payload=json.dumps(row).replace("'","''")
    insert=f"INSERT INTO public.envase SELECT * FROM jsonb_populate_record(NULL::public.envase,'{payload}'::jsonb||jsonb_build_object('created_at',now()));"
    permit=f"INSERT INTO platform_private.envase_insert_permits_v1(txid,actor,organization_id,action,target,lote,os,prog,payload) VALUES(txid_current(),'{T.W}','{T.A}','envase','{row['id']}','{l}','{o}','{p}','{payload}'::jsonb);"
    # Minting is owner-only fixture setup within a transaction; client cannot do so.
    base="BEGIN;"+T.actor(T.W)+"RESET ROLE;"
    for field,value in [('organization_id',T.B),('lote_id',T.L5),('id',T.u(2805)),('quantidade',2),('operador','FOREIGN'),('etiqueta_gerada',True),('volume_por_unidade',500)]:
        changed=dict(row); changed[field]=value
        mutated=insert.replace(payload,json.dumps(changed).replace("'","''"))
        before=X.snapshot()
        X.reject('exact permit rejects changed '+field,base+permit+mutated,'42501')
        assert X.snapshot()==before
    for label,changed in [('actor',permit.replace(T.W,T.V)),('txid',permit.replace('txid_current()','txid_current()-1')),('action',permit.replace("'envase'","'other'")),('root',permit.replace("'"+o+"'","'"+T.O5+"'"))]:
        before=X.snapshot(); X.reject('permit binds '+label,base+changed+insert,'42501'); assert X.snapshot()==before
    X.sql(base+permit+insert+"ROLLBACK;")
    X.ok('owner fixture exact permit positive reaches tenant and volume guards')
    for field,expr in [('organization_id',f"'{T.B}'::uuid"),('quantidade','NEW.quantidade+1'),('volume_por_unidade','5000'),('operador',"'MUTATED'"),('etiqueta_gerada','true')]:
        # Change packaging coherently so the real constraint cannot mask final-permit denial.
        extra="NEW.tipo_embalagem:='bombona_5L';" if field=='volume_por_unidade' else ''
        definition=f"CREATE FUNCTION public.local_mutate_after_permit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.{field}:={expr};{extra} RETURN NEW; END $$;CREATE TRIGGER b01_local_mutate BEFORE INSERT ON public.envase FOR EACH ROW EXECUTE FUNCTION public.local_mutate_after_permit();"
        X.sql(definition); before=X.snapshot()
        X.reject('post-permit normalizer changed '+field+' aborts exactly',base+permit+insert,'42501'); assert X.snapshot()==before
        X.sql('DROP TRIGGER b01_local_mutate ON public.envase;DROP FUNCTION public.local_mutate_after_permit();')
    # Duplicate row UUID is deliberately deleted using fixture replica mode, then
    # reinserted with triggers enabled: failure must be missing authority, not PK.
    X.reject('consumed one-shot permit cannot authorize another insert',base+permit+insert+"SET LOCAL session_replication_role=replica;DELETE FROM public.envase WHERE id='"+row['id']+"';SET LOCAL session_replication_role=origin;"+insert,'42501')
    assert X.last('SELECT count(*) FROM platform_private.envase_insert_permits_v1;')=='0'
    reserved=json.loads(X.last(f"SELECT to_jsonb(s)::text FROM public.estoque_produto s WHERE lote_id='{l}' AND status='reservado';"))
    free=json.loads(X.last(f"SELECT to_jsonb(s)::text FROM public.estoque_produto s WHERE lote_id='{l}' AND status='disponivel';"))
    assert reserved['quantidade']==1 and reserved['quantidade_reservada']==1 and reserved['volume_total']==1
    assert reserved['reservado_para_os_id']==o and reserved['reservado_por']==T.W and reserved['reservado_em'] is not None
    assert free['quantidade']==2 and free['volume_total']==2 and all(free[k] is None for k in ['quantidade_reservada','reservado_por','reservado_em','reservado_para_os_id'])
    X.ok('reserved/free exact units volume actor and nullable reservation fields preserved')
    # Independent canonical batch adjustment changes only existing rows; exact replay
    # must leave entire stock/ledger/receipts unchanged.
    item=free['id']
    stmt=T.actor()+f"SELECT public.rpc_estoque_reservar_v1('{o}','manual','[{{\"item_id\":\"{item}\",\"quantidade\":1}}]'::jsonb,'independent-batch01','{{\"cliente_id\":\"{T.C}\"}}'::jsonb);"
    # The installed signature is read before dispatch; fail closed if not the expected one.
    sig=X.last("SELECT to_regprocedure('public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb)') IS NOT NULL;")
    assert sig=='t','CANONICAL_BATCH_SIGNATURE_MISSING'
    result=json.loads(X.last(stmt)); assert result.get('ok') is True,result
    target=result['itens'][0]; assert target!=item
    assert X.last(f"SELECT sum(quantidade)=3 AND sum(volume_total)=3 FROM public.estoque_produto WHERE lote_id='{l}';")=='t'
    assert X.last(f"SELECT count(*) FROM public.estoque_movimentacoes WHERE estoque_produto_id='{target}' AND acao='reserva' AND usuario_id='{T.U}';")=='1'
    before=X.snapshot(); result=json.loads(X.last(stmt)); assert result.get('ok') is True and X.snapshot()==before,result
    X.ok('independent canonical stock batch and exact replay preserve installed contract')
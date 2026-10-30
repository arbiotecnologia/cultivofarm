"""Pinned delta inside the canonical motor; no replacement ledger/context/guards."""
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent
def build():
    j=json.loads((H/'capture/current.json').read_text())
    f=next(x for x in j['functions'] if x['name']=='rpc_estoque_operar_v1')
    assert f['md5']=='c71a9e848eff0a522cbaa3a7ec2949a5'
    assert hashlib.md5(f['body'].encode()).hexdigest()==f['md5']
    old="""    IF v_qtd = COALESCE(v_item.quantidade_reservada,0) THEN
      UPDATE public.estoque_produto SET status='disponivel' WHERE id=p_item_id;
    ELSE"""
    new="""    IF v_qtd = COALESCE(v_item.quantidade_reservada,0) THEN
      IF EXISTS(SELECT 1 FROM platform_private.delivery_context_20261030 d
        WHERE d.txid=txid_current() AND d.actor=auth.uid() AND d.action='cancel'
         AND d.target=NULLIF(p_payload->>'referencia_id','')::uuid) THEN
        PERFORM platform_private.delivery_merge_split_20261030(p_item_id,v_ctx,p_payload);
      ELSE
        UPDATE public.estoque_produto SET status='disponivel' WHERE id=p_item_id;
      END IF;
    ELSE"""
    assert f['body'].count(old)==1
    (H/'motor-delta.sql.review').write_text(f['body'].replace(old,new))
if __name__=='__main__':build()
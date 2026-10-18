-- F2-B3.3-B: simulação sintética PostgreSQL descartável. NÃO é installer, NÃO prova JWT/RLS.
-- Modela: mandato do ator (tenant+papel+entitlement), elegibilidade do alvo, receipt privado
-- imutável, CAS por versão, idempotência por chave+hash, colisão direct/unknown, cleanup monotônico.
CREATE SCHEMA lab;
CREATE TABLE lab.actors(id text PRIMARY KEY, tenant text, role text, active bool, entitled bool);
CREATE TABLE lab.partners(id text PRIMARY KEY, owner text, ctx text, active bool);
CREATE TABLE lab.links(user_id text PRIMARY KEY, partner_id text, papel text, revoked bool DEFAULT false);
CREATE TABLE lab.clients(partner_id text, cliente_id text, PRIMARY KEY(partner_id,cliente_id));
CREATE TABLE lab.puc(partner_id text, user_id text, cliente_id text, active bool, version int NOT NULL DEFAULT 1,
 PRIMARY KEY(partner_id,user_id,cliente_id));
CREATE TABLE lab.ptc(partner_id text, user_id text, cliente_id text, active bool, origin text NOT NULL,
 source_receipt bigint, PRIMARY KEY(partner_id,user_id,cliente_id));
CREATE TABLE lab.receipts(id bigserial PRIMARY KEY, idem_key text UNIQUE NOT NULL, payload_md5 text NOT NULL,
 actor text NOT NULL, tenant text NOT NULL, action text NOT NULL, result_version int NOT NULL);
CREATE FUNCTION lab.no_mutation() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'receipt_immutable'; END$$;
CREATE TRIGGER ro BEFORE UPDATE OR DELETE ON lab.receipts FOR EACH ROW EXECUTE FUNCTION lab.no_mutation();

CREATE FUNCTION lab.op(_actor text,_partner text,_target text,_cliente text,_action text,_expected int,_key text)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE a lab.actors; p lab.partners; l lab.links; r lab.receipts; cur lab.puc; d lab.ptc; md5v text; v int;
BEGIN
 md5v := md5(concat_ws('|',_actor,_partner,_target,_cliente,_action,_expected));
 SELECT * INTO r FROM lab.receipts WHERE idem_key=_key;
 IF FOUND THEN
   IF r.payload_md5<>md5v THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
   RETURN r.result_version;                       -- replay: sem nova escrita
 END IF;
 SELECT * INTO a FROM lab.actors WHERE id=_actor;
 SELECT * INTO p FROM lab.partners WHERE id=_partner FOR SHARE;
 IF a IS NULL OR NOT a.active OR NOT a.entitled OR a.role NOT IN ('admin','gestor') THEN RAISE EXCEPTION 'actor_forbidden'; END IF;
 IF p IS NULL OR NOT p.active OR p.owner IS NULL OR p.owner<>a.tenant THEN RAISE EXCEPTION 'cross_tenant_forbidden'; END IF;
 -- lock determinístico da chave (linha ou ausência) antes de decidir
 PERFORM pg_advisory_xact_lock(hashtext(_partner||'|'||_target||'|'||_cliente));
 SELECT * INTO cur FROM lab.puc WHERE partner_id=_partner AND user_id=_target AND cliente_id=_cliente FOR UPDATE;
 IF coalesce(cur.version,0)<>_expected THEN RAISE EXCEPTION 'cas_conflict'; END IF;
 SELECT * INTO d FROM lab.ptc WHERE partner_id=_partner AND user_id=_target AND cliente_id=_cliente FOR UPDATE;
 IF d.origin IN ('direct','unknown') THEN RAISE EXCEPTION 'direct_unknown_collision'; END IF;
 IF _action='grant' THEN
   SELECT * INTO l FROM lab.links WHERE user_id=_target AND partner_id=_partner AND NOT revoked FOR SHARE;
   IF l IS NULL OR l.papel<>'tecnico' THEN RAISE EXCEPTION 'target_ineligible'; END IF;
   IF NOT EXISTS(SELECT 1 FROM lab.clients WHERE partner_id=_partner AND cliente_id=_cliente) THEN RAISE EXCEPTION 'client_not_linked'; END IF;
 ELSIF _action='revoke' THEN
   IF cur IS NULL OR NOT cur.active THEN RAISE EXCEPTION 'nothing_to_revoke'; END IF;   -- cleanup NÃO exige elegibilidade atual
 ELSE RAISE EXCEPTION 'bad_action'; END IF;
 INSERT INTO lab.puc VALUES(_partner,_target,_cliente,_action='grant',1)
  ON CONFLICT(partner_id,user_id,cliente_id) DO UPDATE SET active=EXCLUDED.active, version=lab.puc.version+1
  RETURNING version INTO v;
 INSERT INTO lab.receipts(idem_key,payload_md5,actor,tenant,action,result_version)
  VALUES(_key,md5v,_actor,a.tenant,_action,v) RETURNING * INTO r;
 INSERT INTO lab.ptc VALUES(_partner,_target,_cliente,_action='grant','projected',r.id)
  ON CONFLICT(partner_id,user_id,cliente_id) DO UPDATE SET active=EXCLUDED.active, source_receipt=EXCLUDED.source_receipt
  WHERE lab.ptc.origin='projected';
 RETURN v;
END$$;

-- reader fail-closed: grant só vale com vínculo ativo + papel técnico + parceiro com owner
CREATE FUNCTION lab.can_read(_u text,_c text) RETURNS bool LANGUAGE sql AS $$
 SELECT EXISTS(SELECT 1 FROM lab.ptc t JOIN lab.links l ON l.user_id=t.user_id AND l.partner_id=t.partner_id
  JOIN lab.partners p ON p.id=t.partner_id
  WHERE t.user_id=_u AND t.cliente_id=_c AND t.active AND NOT l.revoked AND l.papel='tecnico' AND p.active AND p.owner IS NOT NULL)$$;

CREATE FUNCTION lab.expect_err(_sql text,_err text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE _sql; RAISE EXCEPTION 'FAIL expected %',_err;
EXCEPTION WHEN raise_exception THEN IF SQLERRM<>_err THEN RAISE EXCEPTION 'FAIL got % expected %',SQLERRM,_err; END IF; END$$;

INSERT INTO lab.actors VALUES('gA','T_A','gestor',true,true),('admA','T_A','admin',true,true),('gB','T_B','gestor',true,true),
 ('noent','T_A','gestor',true,false),('tecA','T_A','tecnico',true,true);
INSERT INTO lab.partners VALUES('PA','T_A','commercial_owner',true),('PL','T_A','legacy_partner_tenant',true),
 ('PB','T_B','commercial_owner',true),('PX',NULL,'none',true);
INSERT INTO lab.links VALUES('t1','PA','tecnico'),('t2','PL','tecnico'),('t3','PB','tecnico'),('g1','PA','gestor');
INSERT INTO lab.clients VALUES('PA','c1'),('PA','c2'),('PL','c1'),('PB','c9'),('PX','c1');
INSERT INTO lab.ptc VALUES('PA','t1','c2',true,'direct',NULL);

DO $t$ DECLARE v int; BEGIN
 -- 1 ator distinto do alvo concede
 v := lab.op('gA','PA','t1','c1','grant',0,'k1'); ASSERT v=1 AND lab.can_read('t1','c1'); RAISE NOTICE 'PASS actor!=target grant';
 -- 2 repetição idempotente
 v := lab.op('gA','PA','t1','c1','grant',0,'k1'); ASSERT v=1 AND (SELECT count(*) FROM lab.receipts)=1; RAISE NOTICE 'PASS replay idempotent';
 PERFORM lab.expect_err($$SELECT lab.op('gA','PA','t1','c1','revoke',0,'k1')$$,'idempotency_conflict'); RAISE NOTICE 'PASS same key other payload';
 -- 3 CAS
 PERFORM lab.expect_err($$SELECT lab.op('gA','PA','t1','c1','revoke',0,'k2')$$,'cas_conflict'); RAISE NOTICE 'PASS stale CAS';
 -- 4 cross-tenant e mandato
 PERFORM lab.expect_err($$SELECT lab.op('gB','PA','t1','c1','grant',1,'k3')$$,'cross_tenant_forbidden'); RAISE NOTICE 'PASS cross-tenant B->A';
 PERFORM lab.expect_err($$SELECT lab.op('noent','PA','t1','c1','grant',1,'k4')$$,'actor_forbidden'); RAISE NOTICE 'PASS no entitlement';
 PERFORM lab.expect_err($$SELECT lab.op('tecA','PA','t1','c1','grant',1,'k5')$$,'actor_forbidden'); RAISE NOTICE 'PASS tecnico not mandate';
 PERFORM lab.expect_err($$SELECT lab.op('t1','PA','t1','c1','grant',1,'k5b')$$,'actor_forbidden'); RAISE NOTICE 'PASS target cannot self-authorize';
 PERFORM lab.expect_err($$SELECT lab.op('gA','PX','t1','c1','grant',0,'k6')$$,'cross_tenant_forbidden'); RAISE NOTICE 'PASS partner without owner fail-closed';
 -- 5 legacy_partner_tenant preservado (mesmo tenant)
 v := lab.op('admA','PL','t2','c1','grant',0,'k7'); ASSERT lab.can_read('t2','c1'); RAISE NOTICE 'PASS legacy_partner_tenant preserved';
 -- 6 colisão direct
 PERFORM lab.expect_err($$SELECT lab.op('gA','PA','t1','c2','grant',0,'k8')$$,'direct_unknown_collision');
 ASSERT (SELECT origin='direct' AND active FROM lab.ptc WHERE user_id='t1' AND cliente_id='c2'); RAISE NOTICE 'PASS direct collision aborts, direct preserved';
 -- 7 papel revogado: reader fecha, cleanup funciona, regrant impossível
 UPDATE lab.links SET revoked=true WHERE user_id='t1';
 ASSERT NOT lab.can_read('t1','c1'); RAISE NOTICE 'PASS reader fail-closed after link revoke';
 v := lab.op('gA','PA','t1','c1','revoke',1,'k9'); ASSERT v=2 AND NOT (SELECT active FROM lab.ptc WHERE user_id='t1' AND cliente_id='c1');
 RAISE NOTICE 'PASS cleanup with ineligible target';
 PERFORM lab.expect_err($$SELECT lab.op('gA','PA','t1','c1','grant',2,'k10')$$,'target_ineligible'); RAISE NOTICE 'PASS regrant impossible after revoke';
 PERFORM lab.expect_err($$SELECT lab.op('gA','PA','t1','c1','revoke',2,'k11')$$,'nothing_to_revoke'); RAISE NOTICE 'PASS cleanup monotonic';
 -- 8 receipts imutáveis
 PERFORM lab.expect_err($$UPDATE lab.receipts SET action='x'$$,'receipt_immutable'); RAISE NOTICE 'PASS receipt immutable';
 ASSERT (SELECT count(*) FROM lab.receipts)=3; RAISE NOTICE 'PASS receipt count exact';
END $t$;

-- SOMENTE laboratório descartável. NÃO representa Auth/guards/RLS de produção.
-- Argumento actor é entrada do modelo, NÃO autenticação nem RPC deployável.
CREATE SCHEMA lab;
CREATE TABLE lab.gate(singleton boolean PRIMARY KEY, revision integer NOT NULL);
INSERT INTO lab.gate VALUES(true,0);
CREATE TABLE lab.actors(id text PRIMARY KEY,org text,partner text,owner text,
 mode text,role text,ready boolean,entitled boolean,contexts integer);
CREATE TABLE lab.targets(id text PRIMARY KEY,partner text,tenant text,eligible boolean);
CREATE TABLE lab.clients(id text PRIMARY KEY,partner text,tenant text);
CREATE TABLE lab.puc(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 partner text,target text,client text,active boolean,version integer,
 UNIQUE(partner,target,client));
CREATE TABLE lab.ptc(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 partner text,target text,client text,active boolean,UNIQUE(partner,target,client));
-- Simula extensão protegida de trilha existente, não segundo catálogo de grants.
CREATE TABLE lab.audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor text,org text,owner text,partner text,target text,client text,op text,
 key text,content jsonb,result bigint,version integer,
 UNIQUE(actor,org,partner,key));
CREATE TABLE lab.source(ptc bigint PRIMARY KEY,puc bigint UNIQUE,
 partner text,target text,client text,first_event bigint NOT NULL);
CREATE FUNCTION lab.immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_SOURCE_AUDIT' USING ERRCODE='42501'; END $$;
CREATE TRIGGER immutable_source BEFORE UPDATE OR DELETE ON lab.source
 FOR EACH ROW EXECUTE FUNCTION lab.immutable();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON lab.audit
 FOR EACH ROW EXECUTE FUNCTION lab.immutable();
CREATE ROLE lab_client;
REVOKE ALL ON ALL TABLES IN SCHEMA lab FROM PUBLIC,lab_client;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA lab FROM PUBLIC,lab_client;

CREATE FUNCTION lab.operation(actor_id text,partner_id text,target_id text,client_id text,
 operation text,expected integer,request_key text,fail_audit boolean DEFAULT false)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a lab.actors; t lab.targets; c lab.clients; p lab.puc; q lab.ptc;
 e lab.audit; s lab.source; payload jsonb; event_id bigint; new_version integer;
BEGIN
 -- Toute autorité doit être revalidée APRÈS le verrou partagé, avant replay.
 UPDATE lab.gate SET revision=revision+1 WHERE singleton;
 SELECT * INTO a FROM lab.actors WHERE id=actor_id;
 IF NOT FOUND OR NOT a.ready OR NOT a.entitled OR a.contexts<>1
 OR a.partner IS DISTINCT FROM partner_id OR a.role NOT IN ('manager','admin','superadmin')
 OR NOT ((a.mode='commercial_owner' AND a.org=a.owner)
      OR (a.mode='legacy_partner_tenant' AND a.org='legacy:'||a.partner))
 THEN RAISE EXCEPTION 'ACTOR_CONTEXT_DENIED' USING ERRCODE='42501'; END IF;
 IF expected IS NULL OR expected<0 OR request_key IS NULL OR request_key=''
 OR operation NOT IN ('grant','revoke') OR operation IS NULL
 THEN RAISE EXCEPTION 'INVALID_CONTROLS'; END IF;
 SELECT * INTO c FROM lab.clients WHERE id=client_id;
 IF NOT FOUND OR c.partner IS DISTINCT FROM partner_id OR c.tenant IS DISTINCT FROM a.owner
 THEN RAISE EXCEPTION 'CLIENT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 payload:=jsonb_build_array(actor_id,a.org,a.owner,partner_id,target_id,client_id,operation,expected);
 SELECT * INTO e FROM lab.audit WHERE actor=actor_id AND org=a.org AND partner=partner_id AND key=request_key;
 IF FOUND THEN
  IF e.content IS DISTINCT FROM payload THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN e.result;
 END IF;
 SELECT * INTO p FROM lab.puc WHERE partner=partner_id AND target=target_id AND client=client_id FOR UPDATE;
 IF coalesce(p.version,0)<>expected THEN RAISE EXCEPTION 'CAS_CONFLICT'; END IF;
 SELECT * INTO q FROM lab.ptc WHERE partner=partner_id AND target=target_id AND client=client_id FOR UPDATE;
 IF q.id IS NOT NULL THEN
  SELECT * INTO s FROM lab.source WHERE ptc=q.id;
  IF NOT FOUND OR s.puc IS DISTINCT FROM p.id OR s.partner IS DISTINCT FROM partner_id
   OR s.target IS DISTINCT FROM target_id OR s.client IS DISTINCT FROM client_id
   OR NOT EXISTS(SELECT 1 FROM lab.audit WHERE id=s.first_event)
  THEN RAISE EXCEPTION 'DIRECT_UNKNOWN_COLLISION'; END IF;
 END IF;
 IF operation='grant' THEN
  SELECT * INTO t FROM lab.targets WHERE id=target_id;
  IF NOT FOUND OR NOT t.eligible OR t.partner IS DISTINCT FROM partner_id OR t.tenant IS DISTINCT FROM a.owner
  THEN RAISE EXCEPTION 'TARGET_INELIGIBLE' USING ERRCODE='42501'; END IF;
 ELSE
  IF p.id IS NULL THEN RAISE EXCEPTION 'SOURCE_REQUIRED'; END IF;
  -- Cleanup monotone: aucun check de l'éligibilité ACTUELLE de la cible.
 END IF;
 new_version:=expected+1;
 IF p.id IS NULL THEN
  INSERT INTO lab.puc(partner,target,client,active,version)
  VALUES(partner_id,target_id,client_id,true,new_version) RETURNING * INTO p;
 ELSE
  UPDATE lab.puc SET active=(operation='grant'),version=new_version WHERE id=p.id RETURNING * INTO p;
 END IF;
 IF q.id IS NULL AND operation='grant' THEN
  INSERT INTO lab.ptc(partner,target,client,active) VALUES(partner_id,target_id,client_id,true) RETURNING * INTO q;
 ELSIF q.id IS NOT NULL THEN
  UPDATE lab.ptc SET active=(operation='grant') WHERE id=q.id;
 END IF;
 IF fail_audit THEN RAISE EXCEPTION 'AUDIT_FAILURE'; END IF;
 INSERT INTO lab.audit(actor,org,owner,partner,target,client,op,key,content,result,version)
 VALUES(actor_id,a.org,a.owner,partner_id,target_id,client_id,operation,request_key,payload,p.id,new_version)
 RETURNING id INTO event_id;
 IF q.id IS NOT NULL AND s.ptc IS NULL THEN
  INSERT INTO lab.source VALUES(q.id,p.id,partner_id,target_id,client_id,event_id);
 END IF;
 RETURN p.id;
END $$;
REVOKE ALL ON FUNCTION lab.operation(text,text,text,text,text,integer,text,boolean) FROM PUBLIC,lab_client;
CREATE FUNCTION lab.direct_write(partner_id text,target_id text,client_id text,state boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 UPDATE lab.gate SET revision=revision+1 WHERE singleton;
 IF EXISTS(SELECT 1 FROM lab.ptc q JOIN lab.source s ON s.ptc=q.id
 WHERE q.partner=partner_id AND q.target=target_id AND q.client=client_id)
 THEN RAISE EXCEPTION 'PROJECTED_DIRECT_TAMPERING'; END IF;
 INSERT INTO lab.ptc(partner,target,client,active) VALUES(partner_id,target_id,client_id,state)
 ON CONFLICT(partner,target,client) DO UPDATE SET active=EXCLUDED.active;
END $$;
REVOKE ALL ON FUNCTION lab.direct_write(text,text,text,boolean) FROM PUBLIC,lab_client;
CREATE FUNCTION lab.link_revoke(target_id text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 UPDATE lab.gate SET revision=revision+1 WHERE singleton;
 UPDATE lab.targets SET eligible=false WHERE id=target_id;
 UPDATE lab.puc SET active=false,version=version+1 WHERE target=target_id AND active;
 UPDATE lab.ptc q SET active=false FROM lab.source s,lab.puc p
 WHERE s.ptc=q.id AND s.puc=p.id AND p.target=target_id;
END $$;
REVOKE ALL ON FUNCTION lab.link_revoke(text) FROM PUBLIC,lab_client;
CREATE FUNCTION lab.can_read(target_id text,client_id text) RETURNS boolean LANGUAGE sql AS $$
SELECT EXISTS(SELECT 1 FROM lab.ptc q JOIN lab.targets t ON t.id=q.target
 JOIN lab.clients c ON c.id=q.client LEFT JOIN lab.source s ON s.ptc=q.id
 LEFT JOIN lab.puc p ON p.id=s.puc
 WHERE q.target=target_id AND q.client=client_id AND q.active AND t.eligible
 AND t.partner=q.partner AND t.tenant=c.tenant AND c.partner=q.partner
 AND (s.ptc IS NULL OR (p.active AND p.partner=q.partner AND p.target=q.target AND p.client=q.client)));
$$;
REVOKE ALL ON FUNCTION lab.can_read(text,text) FROM PUBLIC,lab_client;
-- Biblioteca transacional QA (criada e destruída na MESMA transação de 05/06). Somente session_user=postgres.
CREATE TABLE IF NOT EXISTS qa_b2bfin.ticket(txid bigint PRIMARY KEY, op text NOT NULL);
CREATE TABLE IF NOT EXISTS qa_b2bfin.saved_fn(fn regprocedure PRIMARY KEY, def text NOT NULL, src_md5 text NOT NULL);
CREATE TABLE IF NOT EXISTS qa_b2bfin.rowmark(rowhash text PRIMARY KEY, tbl regclass NOT NULL);
REVOKE ALL ON ALL TABLES IN SCHEMA qa_b2bfin FROM PUBLIC;
-- Exceção estrita: postgres + ticket desta transação + linha manifestada (id pré-registrado ou hash de linha derivada).
CREATE OR REPLACE FUNCTION qa_b2bfin.allowed(j jsonb) RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS $f$
 SELECT session_user = 'postgres' AND j IS NOT NULL
  AND EXISTS (SELECT 1 FROM qa_b2bfin.ticket t WHERE t.txid = txid_current())
  AND (EXISTS (SELECT 1 FROM qa_b2bfin.manifest m WHERE m.id::text = j->>'id' AND (m.kind <> 'receivable' OR j->>'description' LIKE 'QA-FIN-%'))
       OR EXISTS (SELECT 1 FROM qa_b2bfin.rowmark r WHERE r.rowhash = md5(j::text)))
$f$;
CREATE OR REPLACE FUNCTION qa_b2bfin.relax(f regprocedure) RETURNS void LANGUAGE plpgsql SET search_path TO '' AS $f$
DECLARE p pg_proc%ROWTYPE; d text; src text; pos int; inner_ text; pre text;
BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid = f;
 IF (SELECT lanname FROM pg_language WHERE oid = p.prolang) <> 'plpgsql' OR p.prorettype <> 'trigger'::regtype THEN RAISE EXCEPTION 'QA_RELAX_REFUSED: % não é trigger plpgsql', f; END IF;
 IF EXISTS (SELECT 1 FROM qa_b2bfin.saved_fn s WHERE s.fn = f) THEN RETURN; END IF;
 src := p.prosrc; IF src ~ '^\s*#' THEN RAISE EXCEPTION 'QA_RELAX_REFUSED: diretiva em %', f; END IF;
 d := pg_get_functiondef(f); pos := position(src IN d); IF pos = 0 THEN RAISE EXCEPTION 'QA_RELAX_REFUSED: corpo não localizado %', f; END IF;
 INSERT INTO qa_b2bfin.saved_fn VALUES (f, d, md5(src));
 inner_ := rtrim(src, E' \n\t\r'); IF right(inner_, 1) <> ';' THEN inner_ := inner_ || ';'; END IF;
 pre := E'\nBEGIN\n IF TG_LEVEL = ''ROW'' THEN\n  IF TG_OP = ''DELETE'' THEN IF qa_b2bfin.allowed(to_jsonb(OLD)) THEN RETURN OLD; END IF;\n'
     || E'  ELSIF qa_b2bfin.allowed(to_jsonb(NEW)) THEN RETURN NEW; END IF;\n END IF;\n';
 EXECUTE left(d, pos - 1) || pre || inner_ || E'\nEND;\n' || substr(d, pos + length(src));
END $f$;
CREATE OR REPLACE FUNCTION qa_b2bfin.restore_all() RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $f$
DECLARE s record; out jsonb := '[]';
BEGIN
 FOR s IN SELECT * FROM qa_b2bfin.saved_fn LOOP
  EXECUTE s.def;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = s.fn) <> s.src_md5 OR pg_get_functiondef(s.fn) <> s.def THEN RAISE EXCEPTION 'QA_RESTORE_DRIFT %', s.fn; END IF;
  out := out || jsonb_build_object('fn', s.fn::text, 'md5', s.src_md5);
 END LOOP;
 DELETE FROM qa_b2bfin.saved_fn; DELETE FROM qa_b2bfin.ticket;
 RETURN out;
END $f$;

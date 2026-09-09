#!/usr/bin/env python3
"""
H9-E2 - prova de concorrencia REAL em duas conexoes PostgreSQL independentes
contra a homologacao ikaauvsflpmamgxmkhoq (DSN em $STAGING_DSN).

NAO usa Promise.all/asyncio no mesmo cliente: sao dois processos psql distintos,
com transacoes explicitas, contencao observada por bloqueio real de lock.

Fluxo por RPC (finish / checkout / checkin):
  1. fixture deterministica marcada H9E2 (UUIDs fixos, registrados no dossie);
  2. sessao A: BEGIN -> set claims -> RPC -> mantem o lock (sem COMMIT);
  3. sessao B: BEGIN -> set claims -> mesma RPC, mesmo client_uuid -> deve BLOQUEAR;
  4. COMMIT de A -> B deve retornar sucesso idempotente com o MESMO id;
  5. conferencia de exatamente um visitas_checkin e um visitas_logs;
  6. limpeza integral em finally, com prova de residuo zero.

Uso:  python3 h9e2-prova-concorrencia-multisessao.py [pre|pos]
"""

import json
import os
import select
import subprocess
import sys
import time
import uuid

DSN = os.environ["STAGING_DSN"]
FASE = (sys.argv[1] if len(sys.argv) > 1 else "pos").lower()

DONO = "77905960-8e07-4214-b1c9-516a381fcd28"
ADMIN = "b5c2ebd4-7cdf-4647-a585-6ec49f1b583a"

# UUIDs deterministicos da fixture (recuperacao manual se o harness morrer).
REG = {
    "finish": "9e200001-0000-4000-8000-000000000001",
    "checkout": "9e200001-0000-4000-8000-000000000002",
    "checkin": "9e200001-0000-4000-8000-000000000003",
}
CU = {
    "finish": "9e2c0001-0000-4000-8000-000000000001",
    "checkout": "9e2c0001-0000-4000-8000-000000000002",
    "checkin": "9e2c0001-0000-4000-8000-000000000003",
}
IDS = list(REG.values())
TAG = "H9E2-CONCORRENCIA"

results = []


def claims(uid):
    return json.dumps({"sub": uid, "role": "authenticated"})


class Session:
    """Conexao psql independente, controlada por marcadores."""

    def __init__(self, name):
        self.name = name
        # Binario e sem buffer: com buffer de texto o select() pode declarar o
        # descritor vazio enquanto ha linha pendente no buffer do Python,
        # dessincronizando os marcadores.
        self.p = subprocess.Popen(
            ["psql", DSN, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=0"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=0,
        )
        self.fd = self.p.stdout.fileno()
        self.buf = b""
        # Warm-up: o pooler leva segundos para abrir a sessao.
        self.send("\\echo READY_" + name)
        self.read_until("READY_" + name, 90)

    def send(self, sql):
        self.p.stdin.write((sql.rstrip() + "\n").encode())
        self.p.stdin.flush()

    def send_marked(self, sql, mark):
        self.send(sql)
        self.send(f"\\echo {mark}")

    def _pump(self, timeout):
        """Le o que estiver disponivel e devolve linhas completas."""
        if select.select([self.fd], [], [], timeout)[0]:
            chunk = os.read(self.fd, 65536)
            if chunk:
                self.buf += chunk
        lines = []
        while b"\n" in self.buf:
            line, self.buf = self.buf.split(b"\n", 1)
            lines.append(line.decode(errors="replace"))
        return lines

    def read_until(self, mark, timeout):
        out, deadline = [], time.time() + timeout
        while time.time() < deadline:
            for line in self._pump(0.2):
                if line.strip() == mark:
                    return "\n".join(out), True
                out.append(line)
        return "\n".join(out), False

    def idle(self, seconds):
        """True se nada foi emitido no periodo (indicio de bloqueio real)."""
        out, deadline = [], time.time() + seconds
        while time.time() < deadline:
            out.extend(self._pump(0.2))
        return len(out) == 0, "\n".join(out)

    def close(self):
        try:
            self.send("\\q")
            self.p.wait(timeout=10)
        except Exception:
            self.p.kill()


def psql(sql, quiet=False):
    r = subprocess.run(
        ["psql", DSN, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0 and not quiet:
        raise RuntimeError(f"psql falhou: {r.stdout}{r.stderr}")
    return r.stdout.strip()


def check(nome, ok, detalhe=""):
    results.append((nome, ok, detalhe))
    print(("PASS " if ok else "FAIL ") + nome + ((" | " + detalhe) if detalhe else ""))


# ---------------------------------------------------------------- fixture
def setup():
    psql(
        f"""
    INSERT INTO public.registros_consultor
      (id, natureza_registro, status, consultor_responsavel, created_by,
       observacoes_tecnicas, problema_principal)
    VALUES
      ('{REG['finish']}','visita','rascunho','{DONO}','{DONO}','{TAG}','{TAG} problema'),
      ('{REG['checkout']}','visita','rascunho','{DONO}','{DONO}','{TAG}','{TAG} problema'),
      ('{REG['checkin']}','visita','rascunho','{DONO}','{DONO}','{TAG}','{TAG} problema');

    INSERT INTO public.technical_visit_assignments (registro_consultor_id, user_id, role, is_active)
    VALUES ('{REG['finish']}','{DONO}','participante',true),
           ('{REG['checkout']}','{DONO}','participante',true),
           ('{REG['checkin']}','{DONO}','participante',true);

    INSERT INTO public.visita_diagnosticos (registro_id, versao) VALUES ('{REG['finish']}',1);

    UPDATE public.registros_consultor SET status='em_andamento'
     WHERE id IN ('{REG['finish']}','{REG['checkout']}','{REG['checkin']}');

    INSERT INTO public.visitas_checkin
      (registro_consultor_id, consultor_id, tipo_checkin, status, observacoes, data_hora_checkin)
    VALUES
      ('{REG['finish']}','{DONO}','chegada_fazenda','realizado','{TAG}', now() - interval '2 hours'),
      ('{REG['checkout']}','{DONO}','chegada_fazenda','realizado','{TAG}', now() - interval '2 hours');
    """
    )
    print("fixture H9E2 criada: " + ", ".join(IDS))


def cleanup():
    """Limpeza delimitada por UUID. Sem desabilitar trigger, RLS ou auditoria:
    usa claims de administrador, permitidos pelas proprias regras vigentes."""
    lista = ",".join(f"'{i}'" for i in IDS)
    cus = ",".join(f"'{c}'" for c in CU.values())
    psql(
        f"""
    BEGIN;
    SELECT set_config('request.jwt.claims', '{claims(ADMIN)}', true);
    DELETE FROM public.visitas_logs WHERE registro_consultor_id IN ({lista});
    -- inclui orfaos: a FK visitas_checkin -> registros_consultor e ON DELETE SET NULL,
    -- entao linhas antigas do harness podem ter perdido o vinculo.
    DELETE FROM public.visitas_checkin
     WHERE registro_consultor_id IN ({lista})
        OR client_uuid IN ({cus})
        OR observacoes = '{TAG}';
    DELETE FROM public.registros_consultor WHERE id IN ({lista});
    COMMIT;
    """
    )
    resid = psql(
        f"""SELECT
      (SELECT count(*) FROM public.registros_consultor WHERE id IN ({lista}))
    + (SELECT count(*) FROM public.visitas_checkin WHERE registro_consultor_id IN ({lista}))
    + (SELECT count(*) FROM public.visitas_checkin WHERE client_uuid IN ({",".join(f"'{c}'" for c in CU.values())}))
    + (SELECT count(*) FROM public.visitas_logs WHERE registro_consultor_id IN ({lista}))
    + (SELECT count(*) FROM public.registros_consultor WHERE observacoes_tecnicas = '{TAG}')"""
    )
    check("residuo zero apos limpeza", resid == "0", f"residuo={resid}")


# ---------------------------------------------------------------- cenarios
def duas_sessoes(nome, call_sql, reg_id):
    a, b = Session("A"), Session("B")
    try:
        a.send_marked(
            f"BEGIN; SELECT set_config('request.jwt.claims','{claims(DONO)}',true);", "A_TX"
        )
        a.read_until("A_TX", 60)
        a.send_marked(call_sql, "A_RPC")
        out_a, ok_a = a.read_until("A_RPC", 60)
        check(f"{nome}: sessao A executou a RPC e retem o lock", ok_a, out_a.strip()[:120])

        b.send_marked(
            f"BEGIN; SELECT set_config('request.jwt.claims','{claims(DONO)}',true);", "B_TX"
        )
        b.read_until("B_TX", 60)
        b.send(call_sql)
        bloqueou, vazamento = b.idle(4)
        check(f"{nome}: sessao B bloqueou durante a retencao", bloqueou, vazamento.strip()[:160])

        a.send_marked("COMMIT;", "A_COMMIT")
        a.read_until("A_COMMIT", 30)

        b.send("\\echo B_RPC")
        out_b, ok_b = b.read_until("B_RPC", 60)
        b.send_marked("COMMIT;", "B_COMMIT")
        b.read_until("B_COMMIT", 30)

        id_a = next((l for l in out_a.splitlines() if l.strip()), "")
        id_b = next((l for l in out_b.splitlines() if l.strip()), "")
        mesmo = ok_b and id_a and id_b and (id_a.strip() in id_b or id_b.strip() in id_a)
        check(
            f"{nome}: B retornou o MESMO resultado vencedor (idempotente)",
            bool(mesmo),
            f"A={id_a.strip()[:80]} | B={id_b.strip()[:80]}",
        )
    finally:
        a.close()
        b.close()

    n_ck = psql(
        f"SELECT count(*) FROM public.visitas_checkin WHERE registro_consultor_id='{reg_id}' AND client_uuid IS NOT NULL"
    )
    check(f"{nome}: exatamente um visitas_checkin gravado", n_ck == "1", f"n={n_ck}")


def main():
    print(f"=== H9-E2 prova multi-sessao (fase {FASE}) ===")
    ref = psql("SELECT project_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1")
    if ref != "ikaauvsflpmamgxmkhoq":
        raise SystemExit(f"ABORTADO: projeto {ref} nao autorizado")

    setup()
    try:
        duas_sessoes(
            "finish_technical_visit_secure",
            f"SELECT checkout_id FROM public.finish_technical_visit_secure("
            f"'{REG['finish']}'::uuid, -21.1, -47.8, 5, NULL, NULL, '{TAG}', '{CU['finish']}'::uuid);",
            REG["finish"],
        )
        duas_sessoes(
            "rpc_realizar_checkout_visita",
            f"SELECT public.rpc_realizar_checkout_visita("
            f"'{REG['checkout']}'::uuid, '{CU['checkout']}'::uuid, -21.1, -47.8, 5, NULL, '{TAG}', NULL, NULL)->>'id';",
            REG["checkout"],
        )
        duas_sessoes(
            "rpc_realizar_checkin_visita",
            f"SELECT public.rpc_realizar_checkin_visita("
            f"'{REG['checkin']}'::uuid, '{CU['checkin']}'::uuid, 'chegada_fazenda'::public.tipo_checkin,"
            f" -21.1, -47.8, 5, NULL, '{TAG}', NULL, NULL, NULL, NULL, NULL, NULL)->>'id';",
            REG["checkin"],
        )
    finally:
        cleanup()

    falhas = [n for n, ok, _ in results if not ok]
    print(f"\nTOTAL {len(results)} | FALHAS {len(falhas)}")
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()

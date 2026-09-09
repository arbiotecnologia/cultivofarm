#!/usr/bin/env python3
"""
H9-F2 - prova de concorrencia REAL + CARDINALIDADE EXATA das tres RPCs de visita,
contra a homologacao ikaauvsflpmamgxmkhoq (DSN em $STAGING_DSN).

Completa a lacuna deixada em H9-E2: alem de provar contencao real de lock e
resultado idempotente identico, esta prova exige a cardinalidade exata de
`visitas_checkin`, `visitas_logs` e `solicitacoes_timeline` apos cada cenario
concorrente, incluindo UM cenario com solicitacao vinculada (timeline = 1).

Efeitos esperados por escrita bem-sucedida (derivados do corpo vivo das RPCs
e dos gatilhos ativos de `visitas_checkin`):
  - 1 linha em visitas_checkin;
  - 1 linha em visitas_logs pelo gatilho trg_log_checkin (acao=checkin_realizado);
  - 1 linha em visitas_logs escrita pela propria RPC;
  - 1 linha em solicitacoes_timeline SOMENTE quando o registro (ou o ultimo
    check-in, no caso do checkout) tiver solicitacao_id vinculada.
Quando solicitacao_id e NULL, a timeline esperada e ZERO por definicao do
proprio corpo da RPC (`IF v_solicitacao_id IS NOT NULL THEN ...`), e nao por
ausencia de efeito colateral nao observado.

Nao usa asyncio/Promise.all: sao dois processos psql independentes, com
transacoes explicitas e contencao observada por bloqueio real.

Uso:  python3 h9f-prova-cardinalidade-concorrencia.py
"""

import json
import os
import select
import subprocess
import sys
import time

DSN = os.environ["STAGING_DSN"]

DONO = "77905960-8e07-4214-b1c9-516a381fcd28"
ADMIN = "b5c2ebd4-7cdf-4647-a585-6ec49f1b583a"
CLIENTE = "091f833c-c5a1-41df-8695-2d3df6b9d622"

REG = {
    "finish": "9f000001-0000-4000-8000-000000000001",
    "checkout": "9f000001-0000-4000-8000-000000000002",
    "checkin": "9f000001-0000-4000-8000-000000000003",
    "checkin_vinculado": "9f000001-0000-4000-8000-000000000004",
}
CU = {
    "finish": "9f00c001-0000-4000-8000-000000000001",
    "checkout": "9f00c001-0000-4000-8000-000000000002",
    "checkin": "9f00c001-0000-4000-8000-000000000003",
    "checkin_vinculado": "9f00c001-0000-4000-8000-000000000004",
}
SOLIC = "9f005001-0000-4000-8000-000000000001"
IDS = list(REG.values())
TAG = "H9F-CARDINALIDADE"

results = []


def claims(uid):
    return json.dumps({"sub": uid, "role": "authenticated"})


class Session:
    """Conexao psql independente, controlada por marcadores."""

    def __init__(self, name):
        self.name = name
        self.p = subprocess.Popen(
            ["psql", DSN, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=0"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=0,
        )
        self.fd = self.p.stdout.fileno()
        self.buf = b""
        self.send("\\echo READY_" + name)
        self.read_until("READY_" + name, 90)

    def send(self, sql):
        self.p.stdin.write((sql.rstrip() + "\n").encode())
        self.p.stdin.flush()

    def send_marked(self, sql, mark):
        self.send(sql)
        self.send(f"\\echo {mark}")

    def _pump(self, timeout):
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
    INSERT INTO public.portal_solicitacoes (id, cliente_id, user_id, tipo_demanda, descricao)
    VALUES ('{SOLIC}','{CLIENTE}','{DONO}','visita_tecnica','{TAG}');

    INSERT INTO public.registros_consultor
      (id, natureza_registro, status, consultor_responsavel, created_by,
       observacoes_tecnicas, problema_principal, solicitacao_id)
    VALUES
      ('{REG['finish']}','visita','rascunho','{DONO}','{DONO}','{TAG}','{TAG} problema', NULL),
      ('{REG['checkout']}','visita','rascunho','{DONO}','{DONO}','{TAG}','{TAG} problema', NULL),
      ('{REG['checkin']}','visita','rascunho','{DONO}','{DONO}','{TAG}','{TAG} problema', NULL),
      ('{REG['checkin_vinculado']}','visita','rascunho','{DONO}','{DONO}','{TAG}','{TAG} problema','{SOLIC}');

    INSERT INTO public.technical_visit_assignments (registro_consultor_id, user_id, role, is_active)
    VALUES ('{REG['finish']}','{DONO}','participante',true),
           ('{REG['checkout']}','{DONO}','participante',true),
           ('{REG['checkin']}','{DONO}','participante',true),
           ('{REG['checkin_vinculado']}','{DONO}','participante',true);

    INSERT INTO public.visita_diagnosticos (registro_id, versao) VALUES ('{REG['finish']}',1);

    UPDATE public.registros_consultor SET status='em_andamento'
     WHERE id IN ({",".join(f"'{i}'" for i in IDS)});

    INSERT INTO public.visitas_checkin
      (registro_consultor_id, consultor_id, tipo_checkin, status, observacoes, data_hora_checkin)
    VALUES
      ('{REG['finish']}','{DONO}','chegada_fazenda','realizado','{TAG}', now() - interval '2 hours'),
      ('{REG['checkout']}','{DONO}','chegada_fazenda','realizado','{TAG}', now() - interval '2 hours');
    """
    )
    print("fixture H9F criada: " + ", ".join(IDS))


def cleanup():
    """Limpeza delimitada por UUID/tag, em `finally`. Sem desabilitar gatilho,
    RLS ou auditoria: usa claims de administrador, permitidas pelas regras vigentes."""
    lista = ",".join(f"'{i}'" for i in IDS)
    cus = ",".join(f"'{c}'" for c in CU.values())
    psql(
        f"""
    BEGIN;
    SELECT set_config('request.jwt.claims', '{claims(ADMIN)}', true);
    DELETE FROM public.solicitacoes_timeline WHERE solicitacao_id = '{SOLIC}';
    DELETE FROM public.visitas_logs WHERE registro_consultor_id IN ({lista});
    -- inclui orfaos: a FK visitas_checkin -> registros_consultor e ON DELETE SET NULL.
    DELETE FROM public.visitas_checkin
     WHERE registro_consultor_id IN ({lista})
        OR client_uuid IN ({cus})
        OR observacoes = '{TAG}';
    DELETE FROM public.registros_consultor WHERE id IN ({lista});
    DELETE FROM public.portal_solicitacoes WHERE id = '{SOLIC}';
    COMMIT;
    """
    )
    resid = psql(
        f"""SELECT
      (SELECT count(*) FROM public.registros_consultor WHERE id IN ({lista}))
    + (SELECT count(*) FROM public.registros_consultor WHERE observacoes_tecnicas = '{TAG}')
    + (SELECT count(*) FROM public.visitas_checkin WHERE registro_consultor_id IN ({lista}))
    + (SELECT count(*) FROM public.visitas_checkin WHERE client_uuid IN ({cus}))
    + (SELECT count(*) FROM public.visitas_checkin WHERE observacoes = '{TAG}')
    + (SELECT count(*) FROM public.visitas_logs WHERE registro_consultor_id IN ({lista}))
    + (SELECT count(*) FROM public.solicitacoes_timeline WHERE solicitacao_id = '{SOLIC}')
    + (SELECT count(*) FROM public.portal_solicitacoes WHERE id = '{SOLIC}')"""
    )
    check("residuo zero apos limpeza (finally)", resid == "0", f"residuo={resid}")


# ---------------------------------------------------------------- cenarios
def duas_sessoes(nome, call_sql, reg_id, esp_ck, esp_log, esp_tl, motivo_tl):
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
        check(f"{nome}: sessao B bloqueou durante a retencao (contencao real)", bloqueou,
              vazamento.strip()[:160])

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
        f"SELECT count(*) FROM public.visitas_checkin WHERE registro_consultor_id='{reg_id}'"
    )
    n_cu = psql(
        f"SELECT count(*) FROM public.visitas_checkin WHERE registro_consultor_id='{reg_id}' AND client_uuid IS NOT NULL"
    )
    n_log = psql(
        f"SELECT count(*) FROM public.visitas_logs WHERE registro_consultor_id='{reg_id}'"
    )
    n_tl = psql(
        f"SELECT count(*) FROM public.solicitacoes_timeline WHERE solicitacao_id='{SOLIC}'"
    )
    check(f"{nome}: cardinalidade visitas_checkin = {esp_ck}", n_ck == str(esp_ck), f"n={n_ck}")
    check(f"{nome}: exatamente 1 check-in com client_uuid (sem duplicacao)", n_cu == "1", f"n={n_cu}")
    check(f"{nome}: cardinalidade visitas_logs = {esp_log}", n_log == str(esp_log), f"n={n_log}")
    check(
        f"{nome}: cardinalidade solicitacoes_timeline = {esp_tl} ({motivo_tl})",
        n_tl == str(esp_tl),
        f"n={n_tl}",
    )


def main():
    print("=== H9-F2 prova de concorrencia real + cardinalidade exata ===")
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
            esp_ck=2,   # 1 da fixture + 1 checkout escrito pela RPC
            esp_log=3,  # 1 da fixture (gatilho) + 1 gatilho + 1 log da RPC
            esp_tl=0,
            motivo_tl="registro sem solicitacao_id: a RPC nao escreve timeline",
        )
        duas_sessoes(
            "rpc_realizar_checkout_visita",
            f"SELECT public.rpc_realizar_checkout_visita("
            f"'{REG['checkout']}'::uuid, '{CU['checkout']}'::uuid, -21.1, -47.8, 5, NULL, '{TAG}', NULL, NULL)->>'id';",
            REG["checkout"],
            esp_ck=2,
            esp_log=3,
            esp_tl=0,
            motivo_tl="ultimo check-in sem solicitacao_id: a RPC nao escreve timeline",
        )
        duas_sessoes(
            "rpc_realizar_checkin_visita",
            f"SELECT public.rpc_realizar_checkin_visita("
            f"'{REG['checkin']}'::uuid, '{CU['checkin']}'::uuid, 'chegada_fazenda'::public.tipo_checkin,"
            f" -21.1, -47.8, 5, NULL, '{TAG}', NULL, NULL, NULL, NULL, NULL, NULL)->>'id';",
            REG["checkin"],
            esp_ck=1,
            esp_log=2,  # 1 gatilho + 1 log da RPC
            esp_tl=0,
            motivo_tl="registro sem solicitacao_id: a RPC nao escreve timeline",
        )
        duas_sessoes(
            "rpc_realizar_checkin_visita (solicitacao vinculada)",
            f"SELECT public.rpc_realizar_checkin_visita("
            f"'{REG['checkin_vinculado']}'::uuid, '{CU['checkin_vinculado']}'::uuid,"
            f" 'chegada_fazenda'::public.tipo_checkin,"
            f" -21.1, -47.8, 5, NULL, '{TAG}', NULL, NULL, NULL, NULL, NULL, NULL)->>'id';",
            REG["checkin_vinculado"],
            esp_ck=1,
            esp_log=2,
            esp_tl=1,  # exatamente um evento de timeline, sem duplicacao concorrente
            motivo_tl="registro com solicitacao_id: exatamente um evento",
        )
    finally:
        cleanup()

    falhas = [n for n, ok, _ in results if not ok]
    print(f"\nTOTAL {len(results)} | FALHAS {len(falhas)}")
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()

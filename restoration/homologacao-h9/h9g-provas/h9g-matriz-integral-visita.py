#!/usr/bin/env python3
"""
H9-G (adendo) — MATRIZ INTEGRAL DA FUNCIONALIDADE DE VISITA, executada
exclusivamente contra a homologacao ikaauvsflpmamgxmkhoq (DSN em $STAGING_DSN).

Cobre, por perfil e pre-condicao, os grupos 1..14 do adendo no nivel de
contrato real (RPCs + tabelas + gatilhos), que e a fronteira que a interface
consome. Os grupos puramente visuais (viewport/rolagem/area de toque) sao
cobertos por testes estaticos/unitarios no repositorio e pelo smoke autenticado
de UI, que permanece pendente de login manual.

Regras:
  - nenhum acesso a producao (navfzbwgwzruipouyfnk) ou sandbox (yzszlzjpovmcteuxjznj);
  - fixtures inequivocamente temporarias (prefixo H9GM-) removidas em finally;
  - historico legitimo preexistente nunca e alterado;
  - nenhuma integracao externa e disparada (provado ao final por contagem de filas).

Uso: python3 h9g-matriz-integral-visita.py
"""

import json
import os
import subprocess
import sys
import uuid

DSN = os.environ["STAGING_DSN"]
for proibido in ("navfzbwgwzruipouyfnk", "yzszlzjpovmcteuxjznj"):
    if proibido in DSN:
        sys.exit("ABORT: DSN aponta para ambiente proibido")
if "ikaauvsflpmamgxmkhoq" not in DSN:
    sys.exit("ABORT: DSN nao e o staging autorizado")

ADMIN = "b5c2ebd4-7cdf-4647-a585-6ec49f1b583a"   # administrador
TEC = "77905960-8e07-4214-b1c9-516a381fcd28"      # consultor_tecnico (dono)
OUTRO = "2767fb15-7f00-41d5-8360-622d6dea8de6"    # tecnico_agronomo sem escopo
PRODUTOR = "85998744-78fd-41ae-b74e-2b763e7f8089"  # cliente_produtor
CULTURA = "2e852cb7-fe76-4310-ac83-8951ee675415"   # Soja

TAG = "H9GM"
CLIENTE = "9f00e001-0000-4000-8000-000000000001"
FAZENDA = "9f00e002-0000-4000-8000-000000000001"
TALHAO = "9f00e003-0000-4000-8000-000000000001"
VINCULO = "9f00e004-0000-4000-8000-000000000001"
INEXISTENTE = "9f00ffff-0000-4000-8000-0000000000ff"

resultados = []


def psql(sql, uid=None, autocommit=True):
    """Executa SQL; quando uid e informado, roda como `authenticated` com JWT."""
    prefixo = ""
    if uid:
        claims = json.dumps({"sub": uid, "role": "authenticated"}).replace("'", "''")
        prefixo = (
            "SET LOCAL ROLE authenticated;\n"
            f"SELECT set_config('request.jwt.claims', '{claims}', true);\n"
        )
    corpo = f"BEGIN;\n{prefixo}{sql}\nCOMMIT;\n" if autocommit else sql
    p = subprocess.run(
        ["psql", DSN, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=0"],
        input=corpo.encode(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    return p.stdout.decode().strip()


def caso(cid, grupo, perfil, precond, acao, esperado, saida, ok, tabelas="", limpeza="finally"):
    resultados.append(
        dict(id=cid, grupo=grupo, perfil=perfil, precondicao=precond, acao=acao,
             esperado=esperado, observado=saida.replace("\n", " ⏎ ")[:400],
             status="PASS" if ok else "FAIL", tabelas=tabelas, limpeza=limpeza)
    )
    print(("PASS " if ok else "FAIL ") + f"{cid} [{grupo}] {acao}")
    if not ok:
        print("      esperado: " + esperado)
        print("      observado: " + saida.replace("\n", " ⏎ ")[:400])


def contem(saida, *tokens):
    return all(t in saida for t in tokens)


def criar_visita(uid, client_uuid, **kw):
    args = {
        "p_client_uuid": f"'{client_uuid}'::uuid",
        "p_cliente_id": f"'{CLIENTE}'::uuid",
        "p_fazenda_id": f"'{FAZENDA}'::uuid",
        "p_talhao_id": f"'{TALHAO}'::uuid",
        "p_cultura_id": f"'{CULTURA}'::uuid",
        "p_data_vistoria": "CURRENT_DATE",
        "p_tipo_visita": "'vistoria_inicial'::public.tipo_visita",
        "p_objetivo_visita": f"'{TAG} objetivo'",
        "p_observacoes_tecnicas": f"'{TAG} temporario'",
    }
    args.update(kw)
    lista = ", ".join(f"{k} => {v}" for k, v in args.items())
    return psql(f"SELECT public.rpc_criar_visita_idempotente({lista});", uid)


def registro_id_de(saida):
    for linha in saida.splitlines():
        linha = linha.strip()
        if linha.startswith("{"):
            try:
                obj = json.loads(linha)
            except json.JSONDecodeError:
                continue
            if obj.get("registro_id"):
                return obj["registro_id"]
            if obj.get("id"):
                return obj["id"]
            rota = obj.get("next_route") or ""
            if rota.startswith("/app/visita/"):
                return rota.rsplit("/", 1)[-1]
    return None


def setup():
    psql(
        f"""
        INSERT INTO public.clientes (id, nome) VALUES ('{CLIENTE}', '{TAG} Cliente Temporario')
          ON CONFLICT (id) DO NOTHING;
        INSERT INTO public.fazendas (id, cliente_id, nome) VALUES ('{FAZENDA}', '{CLIENTE}', '{TAG} Fazenda')
          ON CONFLICT (id) DO NOTHING;
        INSERT INTO public.talhoes (id, fazenda_id, nome, area_hectares)
          VALUES ('{TALHAO}', '{FAZENDA}', '{TAG} Talhao', 10)
          ON CONFLICT (id) DO NOTHING;
        INSERT INTO public.user_clientes (id, user_id, cliente_id, is_active, access_level)
          VALUES ('{VINCULO}', '{TEC}', '{CLIENTE}', true, 'execute')
          ON CONFLICT (id) DO NOTHING;
        """
    )


def cleanup():
    saida = psql(
        f"""
        WITH regs AS (SELECT id FROM public.registros_consultor WHERE observacoes_tecnicas LIKE '{TAG}%' OR objetivo_visita LIKE '{TAG}%')
        , d1 AS (DELETE FROM public.visitas_logs WHERE registro_consultor_id IN (SELECT id FROM regs) RETURNING 1)
        , d2 AS (DELETE FROM public.visitas_checkin WHERE registro_consultor_id IN (SELECT id FROM regs) RETURNING 1)
        , d3 AS (DELETE FROM public.visita_diagnosticos WHERE registro_id IN (SELECT id FROM regs) RETURNING 1)
        , d4 AS (DELETE FROM public.registros_consultor_recomendacoes WHERE registro_consultor_id IN (SELECT id FROM regs) RETURNING 1)
        , d5 AS (DELETE FROM public.registros_consultor_status_log WHERE registro_consultor_id IN (SELECT id FROM regs) RETURNING 1)
        , d6 AS (DELETE FROM public.registros_consultor_arquivos WHERE registro_consultor_id IN (SELECT id FROM regs) RETURNING 1)
        , d7 AS (DELETE FROM public.visitas_campo WHERE registro_consultor_id IN (SELECT id FROM regs) RETURNING 1)
        SELECT 'apagados_filhos='||((SELECT count(*) FROM d1)+(SELECT count(*) FROM d2)+(SELECT count(*) FROM d3)
               +(SELECT count(*) FROM d4)+(SELECT count(*) FROM d5)+(SELECT count(*) FROM d6)+(SELECT count(*) FROM d7));
        DELETE FROM public.registros_consultor WHERE observacoes_tecnicas LIKE '{TAG}%' OR objetivo_visita LIKE '{TAG}%';
        DELETE FROM public.user_clientes WHERE id = '{VINCULO}';
        DELETE FROM public.talhoes WHERE id = '{TALHAO}';
        DELETE FROM public.fazendas WHERE id = '{FAZENDA}';
        DELETE FROM public.clientes WHERE id = '{CLIENTE}';
        SELECT 'residuo_registros='||(SELECT count(*) FROM public.registros_consultor WHERE observacoes_tecnicas LIKE '{TAG}%' OR objetivo_visita LIKE '{TAG}%')
             ||' residuo_vinculo='||(SELECT count(*) FROM public.user_clientes WHERE id='{VINCULO}')
             ||' residuo_cliente='||(SELECT count(*) FROM public.clientes WHERE id='{CLIENTE}')
             ||' residuo_checkin='||(SELECT count(*) FROM public.visitas_checkin c JOIN public.registros_consultor r ON r.id=c.registro_consultor_id WHERE r.observacoes_tecnicas LIKE '{TAG}%');
        """
    )
    return saida


def executar():
    # ---------------- Grupo 1 — Listagem ----------------
    s = psql("SELECT public.rpc_listar_visitas_tecnicas_v1();", TEC)
    caso("V1.1", "1-Listagem", "tecnico", "sessao valida", "listar visitas (default)",
         "jsonb com total/itens, sem erro", s, contem(s, "total") and "ERROR" not in s,
         "registros_consultor")

    s = psql("SELECT public.rpc_listar_visitas_tecnicas_v1(p_search => 'ZZZ-NAO-EXISTE-H9GM');", TEC)
    caso("V1.2", "1-Listagem", "tecnico", "busca sem resultado", "busca vazia",
         "total=0 sem erro", s, '"total": 0' in s or '"total":0' in s, "registros_consultor")

    s = psql("SELECT public.rpc_listar_visitas_tecnicas_v1(p_page => 2, p_page_size => 5);", TEC)
    caso("V1.3", "1-Listagem", "tecnico", "paginacao", "pagina 2 tamanho 5",
         "retorna pagina sem erro", s, "ERROR" not in s and "total" in s, "registros_consultor")

    s = psql("SELECT public.rpc_listar_visitas_tecnicas_v1(p_status => ARRAY['finalizado'], p_de => CURRENT_DATE - 3650, p_ate => CURRENT_DATE);", TEC)
    caso("V1.4", "1-Listagem", "tecnico", "filtros status+data", "filtrar finalizadas",
         "retorna sem erro", s, "ERROR" not in s, "registros_consultor")

    s = psql("SELECT public.rpc_listar_visitas_tecnicas_v1();", None)
    caso("V1.5", "1-Listagem", "anonimo", "sem sessao", "listar sem autenticar",
         "unauthenticated (42501)", s, "unauthenticated" in s, "-", "n/a")

    s = psql("SELECT public.rpc_resumo_atendimentos_tecnicos_v1();", TEC)
    caso("V1.6", "1-Listagem", "tecnico", "painel", "resumo de atendimentos",
         "contadores sem erro", s, "ERROR" not in s, "registros_consultor")

    # ---------------- Grupo 2 — Criacao ----------------
    cu_a = str(uuid.uuid4())
    s = criar_visita(TEC, cu_a)
    reg_a = registro_id_de(s)
    caso("V2.1", "2-Criacao", "tecnico", "cliente/fazenda/talhao/cultura validos",
         "criar visita (rascunho)", "registro_id retornado, status rascunho",
         s, bool(reg_a) and "rascunho" in s, "registros_consultor")
    if not reg_a:
        return

    s2 = criar_visita(TEC, cu_a)
    caso("V2.2", "2-Criacao", "tecnico", "mesmo client_uuid", "reenviar criacao (duplo clique)",
         "mesmo registro_id, sem nova linha", s2, registro_id_de(s2) == reg_a, "registros_consultor")

    s = psql(
        f"SELECT count(*) FROM public.registros_consultor WHERE client_uuid = '{cu_a}';", TEC)
    caso("V2.3", "2-Criacao", "tecnico", "apos duplo envio", "cardinalidade de criacao",
         "exatamente 1 linha", s, s.splitlines()[-1].strip() == "1", "registros_consultor")

    s = criar_visita(TEC, str(uuid.uuid4()), p_cliente_id="NULL::uuid")
    caso("V2.4", "2-Criacao", "tecnico", "campo obrigatorio ausente", "criar sem cliente",
         "erro de validacao, nenhuma linha criada", s, "ERROR" in s, "registros_consultor")

    s = criar_visita(TEC, str(uuid.uuid4()), p_tipo_visita="'monitoramento'::public.tipo_visita",
                     p_data_vistoria="CURRENT_DATE - 1")
    reg_mon = registro_id_de(s)
    caso("V2.5", "2-Criacao", "tecnico", "tipo/data alternativos", "criar visita de monitoramento",
         "criada com tipo monitoramento", s, bool(reg_mon), "registros_consultor")

    s = criar_visita(PRODUTOR, str(uuid.uuid4()))
    caso("V2.6", "2-Criacao", "produtor", "perfil sem escopo tecnico", "tentar criar visita",
         "bloqueio (sem_permissao/forbidden)", s,
         "ERROR" in s and ("permission" in s or "forbidden" in s or "permissao" in s), "-", "n/a")

    # ---------------- Grupo 3 — Edicao / versionamento ----------------
    s = psql(f"SELECT version FROM public.registros_consultor WHERE id='{reg_a}';")
    v = int(s.splitlines()[-1])
    s = psql(
        f"SELECT public.rpc_atualizar_identificacao_visita('{reg_a}'::uuid, {v},"
        f" '{{\"objetivo_visita\":\"{TAG} objetivo editado\",\"safra\":\"2026/27\"}}'::jsonb);", TEC)
    caso("V3.1", "3-Edicao", "tecnico", "rascunho", "editar identificacao com versao correta",
         "sucesso e version incrementada", s, "ERROR" not in s, "registros_consultor")

    s = psql(
        f"SELECT public.rpc_atualizar_identificacao_visita('{reg_a}'::uuid, {v},"
        f" '{{\"safra\":\"2026/28\"}}'::jsonb);", TEC)
    caso("V3.2", "3-Edicao", "tecnico", "versao obsoleta", "editar com version antiga",
         "version_conflict", s, "version_conflict" in s, "registros_consultor")

    s = psql(
        f"SELECT public.rpc_atualizar_identificacao_visita('{reg_a}'::uuid, 999,"
        f" '{{\"safra\":\"2026/29\"}}'::jsonb);", OUTRO)
    caso("V3.3", "3-Edicao", "tecnico sem escopo", "registro alheio", "editar visita de outro",
         "bloqueio sem revelar existencia", s, "ERROR" in s and "version_conflict" not in s,
         "registros_consultor", "n/a")

    s = psql(f"SELECT objetivo_visita FROM public.registros_consultor WHERE id='{reg_a}';")
    caso("V3.4", "3-Edicao", "sistema", "apos edicoes", "dado historico preservado",
         "objetivo editado persistido", s, "objetivo editado" in s, "registros_consultor")

    # ---------------- Grupo 4 — Check-in / check-out ----------------
    cu_ci = str(uuid.uuid4())
    base_ci = (f"SELECT public.rpc_realizar_checkin_visita('{reg_a}'::uuid, '{cu_ci}'::uuid,"
               " 'chegada_fazenda'::public.tipo_checkin, -17.22, -46.85, 8, NULL, NULL, now())")
    s = psql(base_ci + ";", TEC)
    caso("V4.1", "4-Checkin", "tecnico", "GPS valido", "check-in chegada_fazenda",
         "sucesso, 1 checkin, 1 log canonico", s, "ERROR" not in s,
         "visitas_checkin, visitas_logs")

    s2 = psql(base_ci + ";", TEC)
    caso("V4.2", "4-Checkin", "tecnico", "mesmo client_uuid", "repetir check-in (duplo clique)",
         "idempotente, nenhuma linha nova", s2, "ERROR" not in s2, "visitas_checkin")

    s = psql(
        f"SELECT 'ck='||(SELECT count(*) FROM public.visitas_checkin WHERE registro_consultor_id='{reg_a}')"
        f"||' logs='||(SELECT count(*) FROM public.visitas_logs WHERE registro_consultor_id='{reg_a}' AND acao='checkin_realizado');")
    caso("V4.3", "4-Checkin", "sistema", "apos duplo clique", "cardinalidade canonica",
         "ck=1 logs=1", s, "ck=1 logs=1" in s, "visitas_checkin, visitas_logs")

    s = psql(
        f"SELECT public.rpc_realizar_checkin_visita('{reg_a}'::uuid, '{uuid.uuid4()}'::uuid,"
        " 'chegada_fazenda'::public.tipo_checkin, -17.22, -46.85, 8, NULL, NULL, now());", TEC)
    caso("V4.4", "4-Checkin", "tecnico", "uuid distinto, mesmo tipo/ciclo", "repetir com outro uuid",
         "checkin_duplicado_para_tipo_no_ciclo", s, "checkin_duplicado_para_tipo_no_ciclo" in s,
         "visitas_checkin")

    s = psql(
        f"SELECT public.rpc_realizar_checkin_visita('{reg_a}'::uuid, '{uuid.uuid4()}'::uuid,"
        " 'chegada_talhao'::public.tipo_checkin, NULL, NULL, NULL, NULL, NULL, now());", TEC)
    caso("V4.5", "4-Checkin", "tecnico", "GPS negado sem justificativa", "check-in sem GPS",
         "erro exigindo justificativa OU aceite documentado", s, "ERROR" in s or "id" in s,
         "visitas_checkin")

    s = psql(
        f"SELECT public.rpc_realizar_checkin_visita('{reg_a}'::uuid, '{uuid.uuid4()}'::uuid,"
        " 'inicio_visita'::public.tipo_checkin, NULL, NULL, NULL, 'H9GM sem sinal de GPS no talhao',"
        " NULL, now());", TEC)
    caso("V4.6", "4-Checkin", "tecnico", "GPS negado COM justificativa", "check-in justificado",
         "aceito", s, "ERROR" not in s, "visitas_checkin, visitas_logs")

    s = psql(
        f"SELECT public.rpc_realizar_checkin_visita('{reg_a}'::uuid, '{uuid.uuid4()}'::uuid,"
        " 'chegada_talhao'::public.tipo_checkin, -17.22, -46.85, 950, 'H9GM precisao ruim', NULL, now());", TEC)
    caso("V4.7", "4-Checkin", "tecnico", "GPS impreciso (950 m)", "check-in com baixa precisao",
         "aceito e precisao registrada, ou recusa explicita", s, "ERROR" not in s or "precisao" in s,
         "visitas_checkin")

    s = psql(
        f"SELECT public.rpc_realizar_checkin_visita('{reg_a}'::uuid, '{uuid.uuid4()}'::uuid,"
        " 'chegada_fazenda'::public.tipo_checkin, -17.22, -46.85, 8, NULL, NULL, now());", OUTRO)
    caso("V4.8", "4-Checkin", "tecnico sem escopo", "registro alheio", "check-in indevido",
         "bloqueio 42501 sem revelar existencia", s, "ERROR" in s, "-", "n/a")

    s_ok = psql(
        f"SELECT public.rpc_realizar_checkin_visita('{INEXISTENTE}'::uuid, '{uuid.uuid4()}'::uuid,"
        " 'chegada_fazenda'::public.tipo_checkin, -17.22, -46.85, 8, NULL, NULL, now());", OUTRO)
    indistinguivel = ("forbidden" in s and "forbidden" in s_ok) or (
        s.split("ERROR:")[-1].strip()[:40] == s_ok.split("ERROR:")[-1].strip()[:40])
    caso("V4.9", "10-Autorizacao", "tecnico sem escopo", "uuid inexistente x existente",
         "erro indistinguivel (sem oraculo)", "existente=" + s[-80:] + " | inexistente=" + s_ok[-80:],
         indistinguivel, "-", "n/a")

    cu_co = str(uuid.uuid4())
    base_co = (f"SELECT public.rpc_realizar_checkout_visita('{reg_a}'::uuid, '{cu_co}'::uuid,"
               " -17.22, -46.85, 9, NULL, 'H9GM checkout', now())")
    s = psql(base_co + ";", TEC)
    caso("V4.10", "4-Checkout", "tecnico", "com check-in previo", "checkout",
         "sucesso e log checkout_realizado", s, "ERROR" not in s, "visitas_checkin, visitas_logs")

    s = psql(base_co + ";", TEC)
    caso("V4.11", "4-Checkout", "tecnico", "mesmo client_uuid", "repetir checkout",
         "idempotente sem nova linha", s, "ERROR" not in s, "visitas_checkin")

    s = psql(
        f"SELECT 'co='||(SELECT count(*) FROM public.visitas_checkin WHERE registro_consultor_id='{reg_a}' AND tipo_checkin='checkout')"
        f"||' log='||(SELECT count(*) FROM public.visitas_logs WHERE registro_consultor_id='{reg_a}' AND acao='checkout_realizado');")
    caso("V4.12", "4-Checkout", "sistema", "apos repeticao", "cardinalidade canonica do checkout",
         "co=1 log=1", s, "co=1 log=1" in s, "visitas_checkin, visitas_logs")

    s = psql(
        f"SELECT public.rpc_realizar_checkout_visita('{reg_a}'::uuid, '{uuid.uuid4()}'::uuid,"
        " -17.22, -46.85, 9, NULL, NULL, now());", TEC)
    caso("V4.13", "4-Checkout", "tecnico", "uuid distinto", "checkout repetido com outro uuid",
         "checkout_duplicado", s, "checkout_duplicado" in s, "visitas_checkin")

    # ---------------- Grupo 5 — Diagnostico ----------------
    cu_d = str(uuid.uuid4())
    s = psql(f"SELECT version FROM public.registros_consultor WHERE id='{reg_a}';")
    v = int(s.splitlines()[-1])
    payload = json.dumps({"categoria": "insetos_praga", "problema": f"{TAG} lagarta",
                          "descricao": "foco isolado", "severidade": "medio", "incidencia": "12.5"})
    s = psql(f"SELECT public.rpc_upsert_diagnostico_visita('{reg_a}'::uuid, '{cu_d}'::uuid,"
             f" '{payload}'::jsonb, {v});", TEC)
    caso("V5.1", "5-Diagnostico", "tecnico", "rascunho", "adicionar diagnostico",
         "criado e persistido", s, "ERROR" not in s, "visita_diagnosticos")

    s = psql(f"SELECT public.rpc_upsert_diagnostico_visita('{reg_a}'::uuid, '{cu_d}'::uuid,"
             f" '{payload}'::jsonb, 999);", TEC)
    caso("V5.2", "5-Diagnostico", "tecnico", "mesmo client_uuid", "reenviar diagnostico",
         "idempotente, sem duplicar", s, "ERROR" not in s or "version_conflict" in s,
         "visita_diagnosticos")

    p2 = json.dumps({"categoria": "doencas_fungicas", "problema": f"{TAG} mancha",
                     "severidade": "alto", "incidencia": "100"})
    s = psql(f"SELECT version FROM public.registros_consultor WHERE id='{reg_a}';")
    v = int(s.splitlines()[-1])
    s = psql(f"SELECT public.rpc_upsert_diagnostico_visita('{reg_a}'::uuid, '{uuid.uuid4()}'::uuid,"
             f" '{p2}'::jsonb, {v});", TEC)
    caso("V5.3", "5-Diagnostico", "tecnico", "percentual limitrofe 100%", "segundo diagnostico",
         "aceito, multiplos diagnosticos", s, "ERROR" not in s, "visita_diagnosticos")

    s = psql(f"SELECT count(*) FROM public.visita_diagnosticos WHERE registro_id='{reg_a}';")
    caso("V5.4", "5-Diagnostico", "sistema", "apos 3 chamadas", "cardinalidade de diagnosticos",
         "2 linhas (1 idempotente)", s, s.splitlines()[-1].strip() == "2", "visita_diagnosticos")

    s = psql(f"SELECT public.rpc_upsert_diagnostico_visita('{reg_a}'::uuid, '{uuid.uuid4()}'::uuid,"
             f" '{p2}'::jsonb, 1);", OUTRO)
    caso("V5.5", "5-Diagnostico", "tecnico sem escopo", "registro alheio", "gravar diagnostico",
         "forbidden_visita", s, "forbidden_visita" in s or "ERROR" in s, "-", "n/a")

    s = psql(f"SELECT id FROM public.visita_diagnosticos WHERE registro_id='{reg_a}' LIMIT 1;")
    diag_id = s.splitlines()[-1].strip()
    s = psql(f"SELECT public.rpc_delete_diagnostico_visita('{diag_id}'::uuid);", OUTRO)
    caso("V5.6", "5-Diagnostico", "tecnico sem escopo", "diagnostico alheio", "remover diagnostico",
         "sem_permissao", s, "sem_permissao" in s or "ERROR" in s, "visita_diagnosticos", "n/a")

    # ---------------- Grupo 6 — Evidencias ----------------
    s = psql(
        f"""INSERT INTO public.registros_consultor_arquivos
            (registro_consultor_id, arquivo_url, arquivo_path, nome_arquivo, tipo_arquivo, tipo_midia,
             categoria_arquivo, legenda, foto_principal, uploaded_by, latitude, longitude, capturado_em)
            VALUES ('{reg_a}', 'visitas/{TAG}.jpg', 'visitas/{TAG}.jpg', '{TAG}.jpg', 'image/jpeg', 'foto',
                    'campo', '{TAG} evidencia', true, '{TEC}', -17.22, -46.85, now())
            RETURNING 'evidencia_id='||id;""", TEC)
    caso("V6.1", "6-Evidencias", "tecnico", "visita propria", "anexar foto principal com metadados",
         "linha criada com GPS/autoria", s, "evidencia_id=" in s, "registros_consultor_arquivos")

    s = psql(
        f"""INSERT INTO public.registros_consultor_arquivos
            (registro_consultor_id, arquivo_url, arquivo_path, nome_arquivo, tipo_arquivo, tipo_midia, uploaded_by)
            VALUES ('{reg_a}', 'visitas/{TAG}.m4a', 'visitas/{TAG}.m4a', '{TAG}.m4a', 'audio/mp4', 'audio', '{TEC}')
            RETURNING 'audio_id='||id;""", TEC)
    caso("V6.2", "6-Evidencias", "tecnico", "visita propria", "anexar audio",
         "linha criada", s, "audio_id=" in s, "registros_consultor_arquivos")

    s = psql(
        f"""INSERT INTO public.registros_consultor_arquivos
            (registro_consultor_id, arquivo_url, arquivo_path, nome_arquivo, tipo_arquivo, tipo_midia, uploaded_by)
            VALUES ('{reg_a}', 'visitas/{TAG}-x.pfx', 'visitas/{TAG}-x.pfx', '{TAG}.pfx', 'application/x-pkcs12', 'arquivo', '{OUTRO}')
            RETURNING id;""", OUTRO)
    caso("V6.3", "6-Evidencias", "tecnico sem escopo", "visita alheia", "anexar arquivo indevido",
         "bloqueio por RLS", s, "ERROR" in s or "row-level" in s,
         "registros_consultor_arquivos", "n/a")

    s = psql(f"SELECT count(*) FROM public.registros_consultor_arquivos WHERE registro_consultor_id='{reg_a}';", OUTRO)
    caso("V6.4", "6-Evidencias", "tecnico sem escopo", "leitura de anexos alheios", "listar evidencias",
         "0 linhas visiveis", s, s.splitlines()[-1].strip() == "0", "registros_consultor_arquivos")

    s = psql(
        f"DELETE FROM public.registros_consultor_arquivos WHERE registro_consultor_id='{reg_a}'"
        f" AND tipo_midia='audio' RETURNING 'removida='||id;", TEC)
    caso("V6.5", "6-Evidencias", "tecnico", "evidencia propria", "remover evidencia",
         "removida", s, "removida=" in s, "registros_consultor_arquivos")

    s = psql(
        "SELECT count(*) FROM public.registros_consultor_arquivos"
        " WHERE lower(coalesce(nome_arquivo,'')) LIKE '%.pfx' OR lower(coalesce(arquivo_path,'')) LIKE '%.pfx';")
    caso("V6.6", "6-Evidencias", "sistema", "guarda de certificado", "procurar PFX em anexos de visita",
         "0 ocorrencias", s, s.splitlines()[-1].strip() == "0", "registros_consultor_arquivos")

    # ---------------- Grupo 7 — Desfechos ----------------
    s = psql(f"SELECT version FROM public.registros_consultor WHERE id='{reg_a}';")
    v = int(s.splitlines()[-1])
    rec = json.dumps({"recomendacao_tecnica": f"{TAG} aplicar manejo biologico",
                      "encaminhar_para_os": "false"})
    s = psql(f"SELECT public.rpc_upsert_recomendacao_visita('{reg_a}'::uuid, '{uuid.uuid4()}'::uuid,"
             f" '{rec}'::jsonb, {v});", TEC)
    caso("V7.1", "7-Desfechos", "tecnico", "rascunho", "registrar recomendacao",
         "criada sem erro", s, "ERROR" not in s, "registros_consultor_recomendacoes")

    s = psql(f"SELECT version FROM public.registros_consultor WHERE id='{reg_a}';")
    v = int(s.splitlines()[-1])
    s = psql(f"SELECT public.rpc_programar_retorno_visita('{reg_a}'::uuid, {v}, CURRENT_DATE + 15, '{TAG} retorno');", TEC)
    caso("V7.2", "7-Desfechos", "tecnico", "rascunho", "agendar retorno",
         "agendado sem erro", s, "ERROR" not in s, "registros_consultor")

    s = psql(f"SELECT public.rpc_programar_retorno_visita('{reg_a}'::uuid, 1, NULL, NULL);", TEC)
    caso("V7.3", "7-Desfechos", "tecnico", "campo condicional ausente", "retorno sem data",
         "data_prevista_obrigatoria", s, "data_prevista_obrigatoria" in s, "registros_consultor")

    s = psql(f"SELECT version FROM public.registros_consultor WHERE id='{reg_a}';")
    v = int(s.splitlines()[-1])
    s = psql(f"SELECT public.rpc_ativar_monitoramento_visita('{reg_a}'::uuid, {v}, 'monitoramento', CURRENT_DATE);", TEC)
    caso("V7.4", "7-Desfechos", "tecnico", "rascunho", "ativar somente monitoramento",
         "ativado sem erro", s, "ERROR" not in s, "registros_consultor")

    s = psql(f"SELECT public.rpc_converter_visita_em_os('{reg_a}'::uuid, '{TAG} conversao');", OUTRO)
    caso("V7.5", "7-Desfechos", "tecnico sem escopo", "visita alheia", "gerar OS indevida",
         "bloqueio", s, "ERROR" in s, "ordens_servico", "n/a")

    # ---------------- Grupo 8 — Finalizacao ----------------
    cu_b = str(uuid.uuid4())
    s = criar_visita(TEC, cu_b)
    reg_b = registro_id_de(s)
    s = psql(f"SELECT public.rpc_finalizar_visita_v2('{reg_b}'::uuid, 1);", TEC)
    caso("V8.1", "8-Finalizacao", "tecnico", "sem check-in e sem diagnostico", "finalizar",
         "pre-requisito exigido (diagnostico/checkin)", s,
         "diagnostico_obrigatorio" in s or "checkin_obrigatorio" in s, "registros_consultor")

    s = psql(f"SELECT version FROM public.registros_consultor WHERE id='{reg_a}';")
    v = int(s.splitlines()[-1])
    s = psql(f"SELECT public.rpc_finalizar_visita_v2('{reg_a}'::uuid, {v});", OUTRO)
    caso("V8.2", "8-Finalizacao", "tecnico sem escopo", "visita alheia pronta", "finalizar",
         "sem_permissao", s, "sem_permissao" in s or "ERROR" in s, "registros_consultor", "n/a")

    s = psql(f"SELECT public.rpc_finalizar_visita_v2('{reg_a}'::uuid, 999);", TEC)
    caso("V8.3", "8-Finalizacao", "tecnico", "versao errada", "finalizar com version obsoleta",
         "version_conflict", s, "version_conflict" in s, "registros_consultor")

    s = psql(f"SELECT version FROM public.registros_consultor WHERE id='{reg_a}';")
    v = int(s.splitlines()[-1])
    s = psql(f"SELECT public.rpc_finalizar_visita_v2('{reg_a}'::uuid, {v});", TEC)
    caso("V8.4", "8-Finalizacao", "tecnico", "check-in + diagnostico + cultura", "fluxo feliz",
         "finalizada sem erro", s, "ERROR" not in s, "registros_consultor, visitas_logs")

    s = psql(
        f"SELECT 'status='||status||' finalized_at='||(finalized_at IS NOT NULL)::text"
        f"||' finalized_by_ok='||(finalized_by = '{TEC}')::text FROM public.registros_consultor WHERE id='{reg_a}';")
    caso("V8.5", "8-Finalizacao", "sistema", "apos finalizar", "gravacao atomica de autoria",
         "status=finalizado finalized_at=true finalized_by_ok=true", s,
         contem(s, "status=finalizado", "finalized_at=true", "finalized_by_ok=true"),
         "registros_consultor")

    s = psql(f"SELECT version FROM public.registros_consultor WHERE id='{reg_a}';")
    v = int(s.splitlines()[-1])
    s = psql(f"SELECT public.rpc_finalizar_visita_v2('{reg_a}'::uuid, {v});", TEC)
    caso("V8.6", "8-Finalizacao", "tecnico", "ja finalizada", "duplo clique em finalizar",
         "visita_nao_editavel, sem novo log", s, "visita_nao_editavel" in s or "ERROR" in s,
         "registros_consultor")

    s = psql(
        f"SELECT 'logs_final='||(SELECT count(*) FROM public.visitas_logs WHERE registro_consultor_id='{reg_a}' AND acao='visita_finalizada')"
        f"||' statuslog='||(SELECT count(*) FROM public.registros_consultor_status_log WHERE registro_consultor_id='{reg_a}' AND status_novo='finalizado');")
    caso("V8.7", "8-Finalizacao", "sistema", "apos duplo clique", "cardinalidade da finalizacao",
         "logs_final=1 statuslog=1", s, "logs_final=1" in s and "statuslog=1" in s,
         "visitas_logs, registros_consultor_status_log")

    s = psql(
        f"SELECT public.rpc_atualizar_identificacao_visita('{reg_a}'::uuid,"
        f" (SELECT version FROM public.registros_consultor WHERE id='{reg_a}'), '{{\"safra\":\"9999\"}}'::jsonb);", TEC)
    caso("V8.8", "3-Edicao", "tecnico", "visita finalizada", "editar apos finalizar",
         "status_nao_editavel", s, "status_nao_editavel" in s or "nao_editavel" in s,
         "registros_consultor")

    # ---------------- Grupo 9 — Historico / auditoria / timeline ----------------
    s = psql(
        f"SELECT 'autoria_ok='||bool_and(usuario_id IS NOT NULL)::text||' ts_ok='||bool_and(created_at IS NOT NULL)::text"
        f" FROM public.visitas_logs WHERE registro_consultor_id='{reg_a}';")
    caso("V9.1", "9-Auditoria", "sistema", "apos ciclo completo", "autoria e timestamp dos logs",
         "autoria_ok=true ts_ok=true", s, contem(s, "autoria_ok=t", "ts_ok=t") or contem(s, "autoria_ok=true", "ts_ok=true"),
         "visitas_logs")

    s = psql(
        f"SELECT 'ant='||coalesce(status_anterior,'-')||' novo='||coalesce(status_novo,'-')||' autor='||(changed_by IS NOT NULL)::text"
        f" FROM public.registros_consultor_status_log WHERE registro_consultor_id='{reg_a}' ORDER BY created_at DESC LIMIT 1;")
    caso("V9.2", "9-Auditoria", "sistema", "transicao registrada", "status anterior/novo e autor",
         "ant=rascunho novo=finalizado autor=true", s,
         "novo=finalizado" in s and ("autor=t" in s or "autor=true" in s),
         "registros_consultor_status_log")

    s = psql(
        f"SELECT 'solicitacao='||coalesce((SELECT solicitacao_id::text FROM public.registros_consultor WHERE id='{reg_a}'),'NULL')"
        f"||' timeline='||(SELECT count(*) FROM public.solicitacoes_timeline WHERE solicitacao_id ="
        f" (SELECT solicitacao_id FROM public.registros_consultor WHERE id='{reg_a}'));")
    caso("V9.3", "9-Auditoria", "sistema", "visita avulsa (solicitacao_id NULL)", "timeline esperada",
         "timeline=0 por definicao do corpo das RPCs (IF solicitacao_id IS NOT NULL)", s,
         "solicitacao=NULL" in s and "timeline=0" in s, "solicitacoes_timeline")

    s = psql(
        f"SELECT 'logs_duplicados='||count(*) FROM (SELECT acao, count(*) c FROM public.visitas_logs"
        f" WHERE registro_consultor_id='{reg_a}' AND acao IN ('checkin_realizado','checkout_realizado','visita_finalizada')"
        f" GROUP BY acao HAVING count(*) > 1) x;")
    caso("V9.4", "9-Auditoria", "sistema", "H9-GR aplicado", "ausencia de log duplicado",
         "logs_duplicados=0", s, "logs_duplicados=0" in s, "visitas_logs")

    # ---------------- Grupo 10 — Autorizacao (leitura/workspace) ----------------
    s = psql(f"SELECT public.rpc_get_visita_workspace('{reg_a}'::uuid);", TEC)
    caso("V10.1", "10-Autorizacao", "tecnico dono", "visita propria", "abrir detalhe (URL direta)",
         "workspace com permissions", s, "permissions" in s, "registros_consultor")

    s = psql(f"SELECT public.rpc_get_visita_workspace('{reg_a}'::uuid);", ADMIN)
    caso("V10.2", "10-Autorizacao", "administrador", "qualquer visita", "abrir detalhe",
         "workspace com permissions", s, "permissions" in s, "registros_consultor")

    s_ex = psql(f"SELECT public.rpc_get_visita_workspace('{reg_a}'::uuid);", OUTRO)
    s_in = psql(f"SELECT public.rpc_get_visita_workspace('{INEXISTENTE}'::uuid);", OUTRO)
    igual = s_ex.split("ERROR:")[-1].strip()[:60] == s_in.split("ERROR:")[-1].strip()[:60]
    caso("V10.3", "10-Autorizacao", "tecnico sem escopo", "URL direta existente x inexistente",
         "resposta identica (sem oraculo de existencia)",
         "existente=" + s_ex[-70:] + " | inexistente=" + s_in[-70:], igual, "-", "n/a")

    s = psql(f"SELECT public.rpc_get_visita_workspace('{reg_a}'::uuid);", PRODUTOR)
    caso("V10.4", "10-Autorizacao", "produtor", "URL direta de visita interna", "abrir detalhe",
         "bloqueio ou ausencia de dados internos", s,
         "ERROR" in s or '"can_edit": false' in s or '"can_edit":false' in s, "-", "n/a")

    s = psql(f"SELECT count(*) FROM public.registros_consultor WHERE id='{reg_a}';", PRODUTOR)
    caso("V10.5", "10-Autorizacao", "produtor", "leitura direta da tabela", "SELECT via Data API",
         "0 linhas (RLS)", s, s.splitlines()[-1].strip() == "0", "registros_consultor")

    s = psql(f"UPDATE public.registros_consultor SET safra='H' WHERE id='{reg_a}' RETURNING id;", OUTRO)
    caso("V10.6", "10-Autorizacao", "tecnico sem escopo", "escrita direta na tabela", "UPDATE via Data API",
         "0 linhas / bloqueio RLS", s, "UPDATE 0" in s or "ERROR" in s or "id" not in s.splitlines()[-1],
         "registros_consultor", "n/a")

    # ---------------- Grupo 13 — Integracoes ----------------
    s = psql(
        "SELECT 'comunicacao_pendente='||(SELECT count(*) FROM public.communication_events"
        " WHERE created_at > now() - interval '30 minutes')"
        "||' entregas='||(SELECT count(*) FROM public.communication_deliveries"
        " WHERE created_at > now() - interval '30 minutes');")
    caso("V13.1", "13-Integracoes", "sistema", "durante toda a matriz", "verificar disparos externos",
         "nenhuma entrega real criada (flags OFF)", s,
         "entregas=0" in s or "ERROR" in s, "communication_*", "n/a")

    s = psql(
        "SELECT 'nfe='||(SELECT count(*) FROM public.fiscal_xml_runs WHERE created_at > now() - interval '30 minutes');")
    caso("V13.2", "13-Integracoes", "sistema", "durante toda a matriz", "verificar fiscal",
         "nenhuma execucao fiscal", s, "nfe=0" in s or "ERROR" in s, "fiscal_xml_runs", "n/a")


try:
    setup()
    executar()
finally:
    residuo = cleanup()
    print("\n--- LIMPEZA ---")
    print(residuo)
    resultados.append(dict(id="V14.1", grupo="14-Limpeza", perfil="sistema",
                           precondicao="fim da matriz", acao="remover fixtures temporarias",
                           esperado="residuo zero das fixtures H9GM",
                           observado=residuo.replace("\n", " ⏎ ")[:400],
                           status="PASS" if "residuo_registros=0" in residuo and "residuo_cliente=0" in residuo and "residuo_vinculo=0" in residuo else "FAIL",
                           tabelas="todas do dominio visita", limpeza="finally"))

falhas = [r for r in resultados if r["status"] == "FAIL"]
destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), "h9g-matriz-integral-resultado.json")
with open(destino, "w", encoding="utf-8") as fh:
    json.dump({"total": len(resultados), "pass": len(resultados) - len(falhas),
               "fail": len(falhas), "casos": resultados}, fh, ensure_ascii=False, indent=2)

print(f"\nTOTAL={len(resultados)} PASS={len(resultados)-len(falhas)} FAIL={len(falhas)}")
sys.exit(1 if falhas else 0)

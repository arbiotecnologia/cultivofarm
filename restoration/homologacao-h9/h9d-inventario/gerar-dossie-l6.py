#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
H9-D-L6 — gerador determinístico do dossiê, das decisões, do inventário e do resumo.

Ambiente único permitido: staging ikaauvsflpmamgxmkhoq.
Produção navfzbwgwzruipouyfnk é PROIBIDA (não é consultada por este script).

Entrada:
  /tmp/l6/fp.tsv  — fingerprints vivos do catálogo da homologação, gerados por:
    SELECT p.proname||'('||pg_catalog.oidvectortypes(p.proargtypes)||')',
           md5(pg_get_functiondef(p.oid)), length(pg_get_functiondef(p.oid)),
           coalesce(array_to_string(p.proconfig,','),''), coalesce(p.proacl::text,''),
           p.provolatile, pg_get_userbyid(p.proowner), p.prosecdef
      FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prosecdef ORDER BY 1;

Saída (no diretório deste script):
  dossie-l6.json, decisoes-l6.json,
  secdef-authenticated-inventory-h9d.tsv (atualizado), classificacao-h9d.tsv (sincronizado),
  resumo-h9d.json (aritmética derivada).
"""
import hashlib
import json
import os

DIR = os.path.dirname(os.path.abspath(__file__))
FP = "/tmp/l6/fp.tsv"
AMBIENTE = "ikaauvsflpmamgxmkhoq"
PRODUCAO_PROIBIDA = "navfzbwgwzruipouyfnk"
LOTE = "H9-D-L6"
LEDGER = 674
ULTIMA_MIGRATION = "20261018000000"
FORWARD = "restoration/homologacao-h9/h9d-forwards/20261017000000_h9dl6_authz_scoped_visit_writes_no_oracle_v1.sql"
ROLLBACK = "restoration/homologacao-h9/h9d-rollbacks/20261017000000_h9dl6_authz_scoped_visit_writes_no_oracle_v1_rollback.sql"
FORWARD_L6R = "restoration/homologacao-h9/h9d-forwards/20261018000000_h9dl6r_acl_and_checkout_uuid_fix_v1.sql"
ROLLBACK_L6R = "restoration/homologacao-h9/h9d-rollbacks/20261018000000_h9dl6r_acl_and_checkout_uuid_fix_v1_rollback.sql"
INCIDENTE_RASTREABILIDADE = (
    "Apos a aplicacao e o registro unico da versao 20261017000000, o arquivo do forward foi emendado "
    "com REVOKE explicito de anon/authenticated sobre public._visita_scope_ok(uuid,uuid) e o SQL foi "
    "reexecutado sob a MESMA versao, sem novo registro no ledger — violacao da imutabilidade da migration "
    "aplicada. A H9-D-L6R reconstituiu o arquivo 20261017000000 no conteudo historico da PRIMEIRA aplicacao "
    "(apenas REVOKE FROM PUBLIC + GRANT service_role) e regularizou a revogacao explicita, de forma "
    "versionada e reversivel, pelo forward 20261018000000 (ledger 673 -> 674, ocorrencia unica)."
)

METODO = (
    "Leitura integral de pg_get_functiondef das 30 assinaturas canônicas e de todos os helpers "
    "transitivos no catálogo vivo da homologação; ACL, owner, proconfig, volatilidade e OID lidos "
    "do catálogo; callsites mapeados por varredura em src/ e supabase/functions; provas dinâmicas "
    "executadas no staging com identidade authenticated sem papel, comparando recurso real alheio "
    "contra UUID inexistente, sempre em transação revertida quando há escrita. Regex serviu apenas "
    "como triagem — nenhuma classificação foi promovida por nome ou aparência."
)

A = "AUTH_COMPROVADA"
X = "EXPOSICAO_COMPROVADA_CORRIGIDA"

CADEIA_VISITA = (
    "Cadeia transitiva lida: public._visita_scope_ok(uuid,uuid) [novo, SECDEF, search_path=public, "
    "EXECUTE apenas service_role] = can_manage_technical_visit OR is_active_visit_participant OR "
    "registros_consultor.created_by/consultor_responsavel/consultor_profile_id = uid; "
    "can_manage_technical_visit = fn_authz_uid_scope_ok AND (has_role administrador OR "
    "is_visit_responsible OR is_visit_org_manager); is_active_visit_participant lê "
    "technical_visit_assignments com is_active=true; _assert_visita_editavel valida status por "
    "is_technical_visit_editable_status. Todos com search_path fixo e sem SQL dinâmico."
)

SIGS = {
    "rpc_listar_visitas_tecnicas_v1(text,text[],date,date,uuid,uuid,integer,integer)": dict(
        classificacao=A,
        guarda="Corpo lido: v_uid := auth.uid() com RAISE 'unauthenticated' (42501) antes de qualquer leitura; a CTE base filtra cada linha por can_view_technical_visit(v_uid, r.id) ANTES da paginação, e a capacidade de edição vem de can_manage_technical_visit.",
        cadeia="can_view_technical_visit = fn_authz_uid_scope_ok AND (administrador OR is_visit_responsible OR is_active_visit_participant OR is_visit_org_manager); todos SECDEF com search_path=public.",
        callsites="src/hooks/useVisitasTecnicas* e telas de agenda técnica; nenhum callsite passa identidade por parâmetro.",
        prova="Listagem escopada: identidade authenticated sem papel recebe conjunto vazio, sem diferença entre filtro que casaria com visita alheia e filtro sem correspondência. Sem escrita.",
    ),
    "rpc_marcar_etiqueta_impressa(uuid,text)": dict(
        classificacao=A,
        guarda="Autenticação e papel (administrador/gestor/producao/operador_onfarm/administrativo) verificados ANTES do SELECT ... FOR UPDATE em produto_etiquetas.",
        cadeia="has_role(uuid,app_role) SECDEF stable com search_path=public; nenhuma outra função chamada.",
        callsites="src/pages/etiquetas/* — apenas perfis internos de produção.",
        prova="Identidade sem papel recebe 42501 antes de qualquer leitura; a mensagem 'Etiqueta não encontrada' só é alcançável por staff interno cujo escopo já cobre todas as etiquetas — não constitui oráculo entre tenants.",
    ),
    "rpc_message_set_status(uuid,text)": dict(
        classificacao=A,
        guarda="A autorização é uma consulta única escopada: staff OU existência da mensagem já vinculada ao partner do chamador; só então o UPDATE ocorre.",
        cadeia="get_user_partner_id() lê partner_users pelo auth.uid(); has_role para staff.",
        callsites="src/pages/portal-parceiro/* (central de mensagens).",
        prova="Mensagem real de outro parceiro e UUID inexistente produzem o mesmo erro de permissão; nenhuma linha é alterada (transação revertida, resíduo zero).",
    ),
    "rpc_notificar_gestor(text,text,text)": dict(
        classificacao=A,
        guarda="v_uid := auth.uid() com fail-closed e is_operational_staff(v_uid) antes do INSERT em notificacoes; destinatários derivados de user_roles gestor, nunca de parâmetro.",
        cadeia="is_operational_staff SECDEF com search_path=public, EXECUTE apenas postgres/service_role, alcançada de forma transitiva.",
        callsites="chamada por rotinas internas e por supabase/functions de alertas.",
        prova="Identidade sem papel: 42501 antes de escrever. Prova mutante em transação revertida, resíduo zero.",
    ),
    "rpc_partner_commercial_history(uuid,date,date)": dict(
        classificacao=A,
        guarda="Autoriza antes de ler: administrador/gestor OU p_partner_id igual a get_user_partner_id(); parceiro nulo falha fechado.",
        cadeia="get_user_partner_id() e has_role, ambos SECDEF com search_path=public.",
        callsites="src/pages/portal-parceiro/ e painéis comerciais internos.",
        prova="Parceiro de outro tenant recebe 42501 idêntico ao de partner_id inexistente; nenhuma linha comercial é revelada.",
    ),
    "rpc_partner_dashboard(uuid)": dict(
        classificacao=A,
        guarda="Resolve o partner alvo (parâmetro ou padrão do chamador) e exige administrador/gestor OU igualdade com o partner do chamador ANTES de qualquer leitura de pedidos/mensagens.",
        cadeia="get_user_partner_id() e has_role, ambos SECDEF stable com search_path=public e fail-closed em identidade nula; nenhuma outra função é chamada.",
        callsites="src/pages/portal-parceiro/DashboardParceiro*.",
        prova="Partner alheio e partner inexistente retornam o mesmo 42501 para identidade sem escopo.",
    ),
    "rpc_partner_message_counters(uuid)": dict(
        classificacao=A,
        guarda="Exige administrador/gestor OU chamador com partner não nulo igual ao alvo; parâmetro nulo cai para o partner do próprio chamador.",
        cadeia="get_user_partner_id() e has_role, ambos SECDEF stable com search_path=public; leitura agregada de partner_messages sem SQL dinâmico.",
        callsites="src/pages/portal-parceiro/ (badge de mensagens).",
        prova="Identidade sem papel e sem partner recebe 42501; contadores nunca são calculados com filtro nulo para não-staff.",
    ),
    "rpc_portal_partner_financial()": dict(
        classificacao=A,
        guarda="Sem parâmetro de identidade: o filtro é derivado de partner_users pelo auth.uid(). Sessão sem sub produz conjunto vazio (fail-closed por construção).",
        cadeia="partner_users lido diretamente com predicado user_id = auth.uid().",
        callsites="src/pages/portal-parceiro/Financeiro*.",
        prova="Chamada anônima retorna vazio, não erro distinto; identidade de outro parceiro só vê o próprio financeiro.",
    ),
    "rpc_portal_partner_financial(uuid)": dict(
        classificacao=A,
        guarda="O partner_id recebido só é honrado quando o chamador é staff financeiro/administrativo; caso contrário é substituído pelo partner do próprio chamador antes da leitura.",
        cadeia="has_role (SECDEF stable, search_path=public) e leitura de partner_users com predicado user_id = auth.uid(); sem SQL dinâmico.",
        callsites="src/pages/financeiro/ e portal do parceiro.",
        prova="Parceiro que informa partner_id alheio recebe apenas os próprios dados — sem BOLA e sem erro que diferencie a existência do partner alvo.",
    ),
    "rpc_preparar_notificacoes_alertas()": dict(
        classificacao=A,
        guarda="Aceita apenas service_role (execução interna/cron) ou administrador/gestor autenticado; qualquer outra identidade falha fechado antes de ler alertas e antes do INSERT.",
        cadeia="has_role; leitura de configuracoes de alerta e escrita idempotente por chave.",
        callsites="supabase/functions/enviar-alertas-notificacoes e cron interno.",
        prova="Identidade authenticated sem papel: 42501 antes de qualquer escrita; execução repetida não duplica notificações (chave idempotente). Transação revertida, resíduo zero.",
    ),
    "rpc_preview_administrative_broadcast_count(app_role)": dict(
        classificacao=A,
        guarda="administrador/gestor exigido antes de contar destinatários; retorna apenas agregados, nunca identidades.",
        cadeia="has_role; leitura de user_roles e regras de entrega.",
        callsites="src/pages/configuracoes/ (comunicados administrativos).",
        prova="Identidade sem papel: 42501. Papel inexistente e papel sem destinatários retornam a mesma forma agregada.",
    ),
    "rpc_programar_os_v1(uuid,text,date)": dict(
        classificacao=A,
        guarda="Autenticação e papel operacional verificados antes do SELECT ... FOR UPDATE da OS; a transição de status é validada contra a escada de ciclo de vida.",
        cadeia="has_role; funções de escada de status; escrita em eventos da OS.",
        callsites="src/hooks/useEsteiraLaboratory.ts e src/pages/operacao/CockpitLaboratory.tsx.",
        prova="Identidade sem papel: 42501 antes de ler a OS. search_path é fixo em 'public, pg_temp' — pg_temp em ÚLTIMA posição não permite sombreamento de objetos de public, portanto não é vetor de search_path hijacking; mantido como está para não alterar comportamento fora do escopo da correção.",
    ),
    "rpc_publish_communication_event(text,text,uuid,jsonb,text)": dict(
        classificacao=A,
        guarda="Exige administrador antes de validar evento/fonte e antes do INSERT idempotente; a expansão de destinatários é server-side.",
        cadeia="has_role; helpers de expansão de destinatários do módulo de comunicação, todos com search_path fixo.",
        callsites="src/features/comunicacao/ e supabase/functions/_shared/comunicacao/.",
        prova="Identidade sem papel: 42501 antes de qualquer leitura de fonte. Mensagens que diferenciam fonte inexistente só são alcançáveis por administrador, cujo escopo já é global — não há oráculo entre tenants. Escrita idempotente por chave; transação revertida, resíduo zero.",
    ),
    "rpc_publish_communication_event_v2(text,text,uuid,jsonb,text)": dict(
        classificacao=A,
        guarda="Mesma guarda administrativa da v1, com expansão delegada a _comunicacao_expand_event e inserção idempotente por chave.",
        cadeia="has_role; _comunicacao_expand_event (SECDEF, search_path=public, sem SQL dinâmico).",
        callsites="src/features/comunicacao/ e triggers do módulo de comunicação.",
        prova="Identidade sem papel: 42501. Reexecução com a mesma chave não duplica eventos. Transação revertida, resíduo zero.",
    ),
    "rpc_rastreio_produto_interno(uuid)": dict(
        classificacao=A,
        guarda="Autentica, bloqueia cliente_produtor e chama can_user_access_produto_etiqueta(p_etiqueta_id) ANTES do SELECT da etiqueta.",
        cadeia="can_user_access_produto_etiqueta lido integralmente: retorna false para etiqueta inexistente E para etiqueta alheia, e true para perfis internos independentemente da existência.",
        callsites="src/pages/public/RastrearProduto.tsx (via rota interna) e telas de etiquetas.",
        prova="Para identidade sem escopo, etiqueta real alheia e UUID inexistente produzem exatamente 'Sem permissão para rastreio interno' — indistinguíveis. 'Etiqueta não encontrada' só é alcançável por staff interno de escopo global.",
    ),
    "rpc_reabrir_visita(uuid,integer,text)": dict(
        classificacao=A,
        guarda="Exige motivo não vazio e papel administrador ANTES de _visita_lock_and_check; só então trava, valida versão, atualiza status e registra auditoria.",
        cadeia="_visita_lock_and_check (SECDEF, search_path=public) e has_role.",
        callsites="src/pages/app/wizard/ e telas de aprovação de visita.",
        prova="Não administrador: 42501 antes de qualquer leitura — visita inexistente e visita alheia são indistinguíveis. Escrita em transação revertida, resíduo zero.",
    ),
    "rpc_realizar_checkin_visita(uuid,uuid,tipo_checkin,numeric,numeric,numeric,text,text,timestamp with time zone,uuid,uuid,uuid,uuid,text)": dict(
        classificacao=X,
        guarda="ANTES da correção o corpo chamava _assert_visita_editavel(p_registro_id) sem gate próprio: registro inexistente devolvia 'registro_nao_encontrado' (P0002), registro alheio editável devolvia 'sem_permissao' (42501) e registro alheio já fechado devolvia 'visita_nao_editavel' (42501) — três respostas distintas que enumeram registros_consultor e vazam o status de visitas de terceiros. O forward 20261017000000 insere _visita_scope_ok(v_uid, p_registro_id) imediatamente antes daquela chamada, com o MESMO erro já usado pela função ('forbidden_visita_nao_atribuido', 42501). Assinatura, retorno, idempotência por client_uuid e regra de negócio preservados.",
        cadeia=CADEIA_VISITA,
        callsites="src/hooks/useFluxoVisitaTecnica.ts:117, src/hooks/useOfflineSync.ts:443, src/lib/offlineCheckinQueue.ts:67 — nenhum depende do código de erro anterior.",
        prova="Prova no staging, identidade authenticated sem papel, transação revertida: registro real alheio → 42501 forbidden_visita_nao_atribuido; UUID inexistente → 42501 forbidden_visita_nao_atribuido. Indistinguíveis. Resíduo zero.",
    ),
    "rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamp with time zone,text)": dict(
        classificacao=X,
        guarda="Mesmo padrão do check-in: _assert_visita_editavel era alcançado sem gate próprio, diferenciando inexistente, alheio editável e alheio fechado. O forward insere _visita_scope_ok imediatamente antes, com o erro já existente 'forbidden_visita_nao_atribuido' (42501).",
        cadeia=CADEIA_VISITA,
        callsites="src/hooks/useFluxoVisitaTecnica.ts:503, src/hooks/useOfflineSync.ts:443, src/components/visita/PresencaCheckoutButton.tsx.",
        prova="Prova no staging, identidade sem papel, transação revertida: registro real alheio e UUID inexistente produzem a MESMA resposta forbidden_visita_nao_atribuido (42501). Indistinguíveis. Resíduo zero. O defeito funcional independente (predicado 'client_uuid = p_client_uuid::text' contra coluna uuid, que fazia a função falhar fechada com 42883 antes do gate) foi corrigido na H9-D-L6R pelo forward 20261018000000: a comparação passou a ser uuid = uuid, o checkout legítimo volta a retornar jsonb com id/data_hora_checkin/idempotent, e o fingerprint vivo migrou de 759eabc40273aa815319239cf23777a5 para 2b2cc2d7d51a37a515ef79823c28f690.",
    ),
    "rpc_registrar_ocorrencia_entrega(uuid,jsonb)": dict(
        classificacao=A,
        guarda="Autentica e exige is_delivery_staff(v_uid) antes de consultar entregas e antes do INSERT de ocorrência e auditoria.",
        cadeia="is_delivery_staff = fn_authz_uid_scope_ok AND (administrador/gestor/administrativo/producao/operador_onfarm/aplicador).",
        callsites="src/pages/app/entregas/ (registro de ocorrência).",
        prova="Identidade sem papel: 42501 antes de ler a entrega. A diferenciação de entrega inexistente só existe para staff de logística, cujo escopo já cobre todas as entregas. Escrita em transação revertida, resíduo zero.",
    ),
    "rpc_remove_visit_technician(uuid,uuid,text)": dict(
        classificacao=A,
        guarda="can_manage_technical_visit é exigido antes de verificar ciclo aberto e antes do UPDATE da atribuição.",
        cadeia="can_manage_technical_visit e leitura de technical_visit_assignments.",
        callsites="src/pages/app/wizard/ (equipe da visita).",
        prova="Identidade sem escopo: 42501 idêntico para visita alheia e visita inexistente; 'atribuicao_inexistente' só ocorre depois de autorizado. Transação revertida, resíduo zero.",
    ),
    "rpc_resolve_commercial_prices(jsonb,uuid,date,jsonb)": dict(
        classificacao=A,
        guarda="Autentica, exige papel comercial/staff ou parceiro válido e resolve o partner do chamador antes de acionar o motor de preços; produtor direto e partner ambíguo falham fechados.",
        cadeia="get_user_partner_id(), has_role, fn_catalogo_preco_canonico e helpers de precedência comercial, todos com search_path fixo.",
        callsites="src/hooks/useSimulateB2BPaymentPlan.ts e telas de carrinho B2B.",
        prova="Parceiro de outro tenant não obtém preços de terceiros; identidade sem papel recebe 42501 antes de qualquer leitura de tabela de preços.",
    ),
    "rpc_resumo_atendimentos_tecnicos_v1()": dict(
        classificacao=A,
        guarda="Autentica e exige administrador/gestor ou papel técnico; o agregado é calculado somente sobre visitas aprovadas por can_view_technical_visit.",
        cadeia="can_view_technical_visit = fn_authz_uid_scope_ok AND (administrador OR responsável OR participante ativo OR gestor da organização) e has_role; ambos SECDEF com search_path fixo.",
        callsites="src/pages/app/ (resumo de atendimentos).",
        prova="Identidade sem escopo recebe agregado zerado, sem diferença entre ausência de dados e dados alheios.",
    ),
    "rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)": dict(
        classificacao=X,
        guarda="ANTES da correção o corpo executava 'SELECT * INTO v_registro FROM registros_consultor WHERE id = ...' e disparava 'registro_nao_encontrado' (P0002) ANTES de calcular admin/created_by/escopo de cliente, enquanto registro alheio existente disparava 'sem_permissao' (42501) — oráculo de existência. O forward 20261017000000 calcula a autorização primeiro e só revela 'registro_nao_encontrado' a quem já tem escopo (administrador), preservando a UX legítima.",
        cadeia="has_role(administrador) e has_active_user_cliente_access(uid, cliente_id, ARRAY['execute','manage']) — ambos SECDEF, search_path=public, fail-closed em NULL.",
        callsites="src/pages/app/wizard/WizardCampoStep.tsx:192 e src/hooks/useOfflineSync.ts:559 — nenhum depende do código de erro anterior.",
        prova="Prova no staging, identidade authenticated sem papel, transação revertida: registro real alheio → 42501 sem_permissao; UUID inexistente → 42501 sem_permissao. Indistinguíveis. Resíduo zero.",
    ),
    "rpc_set_communication_template_metadata(uuid,text,text,jsonb,text)": dict(
        classificacao=A,
        guarda="administrador exigido antes do lock do template e antes da validação/gravação de metadados.",
        cadeia="has_role; leitura e lock de comunicacao_templates.",
        callsites="src/pages/configuracoes/ (módulo de comunicação).",
        prova="Identidade sem papel: 42501 antes de tocar o template. Transação revertida, resíduo zero.",
    ),
    "rpc_update_communication_template(uuid,text,text,text,jsonb)": dict(
        classificacao=A,
        guarda="administrador exigido antes do lock/UPDATE, com regra de imutabilidade de status preservada.",
        cadeia="has_role (SECDEF stable, search_path=public); lock e UPDATE em comunicacao_templates, sem SQL dinâmico.",
        callsites="src/pages/configuracoes/ (módulo de comunicação).",
        prova="Identidade sem papel: 42501. Template inexistente só é diferenciado para administrador, de escopo global. Transação revertida, resíduo zero.",
    ),
    "rpc_upsert_communication_rule(uuid,text,app_role,text,comunicacao_canal,text,integer,jsonb,integer,boolean,integer)": dict(
        classificacao=A,
        guarda="administrador exigido antes de validar evento/template e antes do INSERT/UPDATE da regra.",
        cadeia="has_role; comunicacao_regras e comunicacao_templates.",
        callsites="src/pages/configuracoes/ (regras de comunicação).",
        prova="Identidade sem papel: 42501 antes de qualquer escrita. Transação revertida, resíduo zero.",
    ),
    "rpc_upsert_diagnostico_visita(uuid,uuid,jsonb,integer)": dict(
        classificacao=X,
        guarda="ANTES da correção a função chamava PERFORM _assert_visita_editavel(p_registro_id) antes do seu próprio teste de escopo, expondo três respostas distintas (P0002 registro_nao_encontrado, 42501 sem_permissao, 42501 visita_nao_editavel) para quem não tem escopo algum. O forward 20261017000000 acrescenta o fail-closed explícito de sessão e o gate _visita_scope_ok imediatamente antes daquela chamada, reutilizando o erro já existente 'forbidden_visita' (42501).",
        cadeia=CADEIA_VISITA,
        callsites="src/pages/app/wizard/WizardDiagnosticoStep.tsx:138 e src/hooks/useOfflineSync.ts:621 — nenhum depende do código de erro anterior.",
        prova="Prova no staging, identidade authenticated sem papel, transação revertida: registro real alheio → 42501 forbidden_visita; UUID inexistente → 42501 forbidden_visita. Indistinguíveis. Resíduo zero.",
    ),
    "rpc_upsert_recomendacao_visita(uuid,uuid,jsonb,integer)": dict(
        classificacao=A,
        guarda="Padrão de referência do domínio: autentica, calcula escopo (can_manage/participante) e só então chama _assert_visita_editavel, trava a visita e faz o upsert; inexistente e alheio já produziam o mesmo 42501.",
        cadeia=CADEIA_VISITA,
        callsites="src/pages/app/wizard/ e src/hooks/useOfflineSync.ts.",
        prova="Prova no staging: registro alheio e UUID inexistente indistinguíveis, sem correção necessária. Corrida de idempotência tratada por captura de unique_violation. Transação revertida, resíduo zero.",
    ),
    "rpc_verify_communication_channel(uuid,uuid,comunicacao_canal,boolean,boolean)": dict(
        classificacao=A,
        guarda="administrador exigido antes de gravar preferências de canal e o registro de consentimento.",
        cadeia="has_role; comunicacao_preferencias e auditoria de consentimento.",
        callsites="src/pages/configuracoes/ e central de notificações.",
        prova="Identidade sem papel: 42501 antes de qualquer escrita. Transação revertida, resíduo zero.",
    ),
    "simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)": dict(
        classificacao=A,
        guarda="Autentica e exige administrador/financeiro/gestor OU parceiro B2B do mesmo partner ANTES de ler parceiro, plano e catálogo; técnico de parceiro e produtor falham fechados; a assinatura canônica do carrinho é calculada no servidor.",
        cadeia="get_user_partner_id(), has_role, rpc_resolve_commercial_prices e helpers de precedência comercial.",
        callsites="src/hooks/useSimulateB2BPaymentPlan.ts:83.",
        prova="Parceiro alheio: 42501 antes de qualquer leitura, idêntico para partner inexistente; nenhuma condição financeira de terceiros é revelada. Função somente de leitura.",
    ),
}

assert len(SIGS) == 30, len(SIGS)


def fingerprints():
    live = {}
    with open(FP, encoding="utf-8") as fh:
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 8:
                continue
            live[parts[0].replace(", ", ",")] = dict(
                definition_md5=parts[1],
                definition_len=int(parts[2]),
                proconfig=parts[3],
                acl=parts[4],
                volatilidade=parts[5],
                owner=parts[6],
                security_definer=parts[7] in ("t", "true", "True"),
            )
    return live


def sha256(path):
    with open(os.path.join(DIR, "..", "..", "..", path), "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def main():
    live = fingerprints()
    faltando = [s for s in SIGS if s not in live]
    if faltando:
        raise SystemExit("assinaturas ausentes no catálogo vivo: %s" % faltando)

    assinaturas = {}
    for sig, d in SIGS.items():
        assinaturas[sig] = dict(
            classificacao=d["classificacao"],
            guarda_textual=d["guarda"],
            cadeia_transitiva=d["cadeia"],
            callsites=d["callsites"],
            prova_individual=d["prova"],
            fingerprint_vivo=live[sig],
        )

    resumo_lote = {}
    for d in SIGS.values():
        resumo_lote[d["classificacao"]] = resumo_lote.get(d["classificacao"], 0) + 1

    comum = dict(
        ambiente=AMBIENTE,
        producao_proibida=PRODUCAO_PROIBIDA,
        lote=LOTE,
        ledger=LEDGER,
        ultima_migration=ULTIMA_MIGRATION,
        total=len(SIGS),
        forward_aplicado="20261017000000_h9dl6_authz_scoped_visit_writes_no_oracle_v1 (aplicado uma única vez; ledger 672 -> 673) + retificação 20261018000000_h9dl6r_acl_and_checkout_uuid_fix_v1 (aplicada uma única vez; ledger 673 -> 674)",
        forward_path=FORWARD,
        forward_sha256=sha256(FORWARD),
        rollback_path=ROLLBACK,
        rollback_sha256=sha256(ROLLBACK),
        forward_l6r_path=FORWARD_L6R,
        forward_l6r_sha256=sha256(FORWARD_L6R),
        rollback_l6r_path=ROLLBACK_L6R,
        rollback_l6r_sha256=sha256(ROLLBACK_L6R),
        incidente_rastreabilidade=INCIDENTE_RASTREABILIDADE,
        metodo=METODO,
        resumo_lote=resumo_lote,
    )

    with open(os.path.join(DIR, "dossie-l6.json"), "w", encoding="utf-8") as fh:
        json.dump(dict(comum, assinaturas=assinaturas), fh, ensure_ascii=False, indent=1)
        fh.write("\n")

    decisoes = {
        sig: dict(
            classificacao=d["classificacao"],
            guarda_textual=d["guarda"],
            cadeia_transitiva=d["cadeia"],
            callsites=d["callsites"],
            prova_individual=d["prova"],
        )
        for sig, d in SIGS.items()
    }
    with open(os.path.join(DIR, "decisoes-l6.json"), "w", encoding="utf-8") as fh:
        json.dump(dict(comum, assinaturas=decisoes), fh, ensure_ascii=False, indent=1)
        fh.write("\n")

    # ---- inventário autoritativo ----
    inv = os.path.join(DIR, "secdef-authenticated-inventory-h9d.tsv")
    with open(inv, encoding="utf-8") as fh:
        linhas = fh.read().rstrip("\n").split("\n")
    header = linhas[0].split("\t")
    i_sig = header.index("signature")
    i_cls = header.index("classificacao_h9d")
    i_evi = header.index("evidencia")
    i_md5 = header.index("body_md5")

    atualizadas = 0
    out = [linhas[0]]
    for linha in linhas[1:]:
        col = linha.split("\t")
        sig = col[i_sig]
        if sig in SIGS:
            d = SIGS[sig]
            col[i_cls] = d["classificacao"]
            evid = "%s Corpo lido integralmente no lote determinístico %s; ver dossie-l6.json. %s %s" % (
                "Exposição comprovada e corrigida pelos forwards 20261017000000 e, na retificação L6R, 20261018000000."
                if d["classificacao"] == X
                else "Autorização comprovada.",
                LOTE,
                d["guarda"],
                d["prova"],
            )
            col[i_evi] = evid.replace("\t", " ")
            if sig in live:
                col[i_md5] = live[sig]["definition_md5"]
            atualizadas += 1
        out.append("\t".join(col))
    if atualizadas != 30:
        raise SystemExit("esperadas 30 linhas atualizadas, obtidas %d" % atualizadas)
    with open(inv, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")

    # ---- espelho compacto ----
    with open(os.path.join(DIR, "classificacao-h9d.tsv"), "w", encoding="utf-8") as fh:
        fh.write("signature\tescopo_h9d\tclassificacao_h9d\tevidencia\n")
        i_esc = header.index("escopo_h9d")
        for linha in out[1:]:
            col = linha.split("\t")
            fh.write("\t".join([col[i_sig], col[i_esc], col[i_cls], col[i_evi]]) + "\n")

    # ---- resumo derivado ----
    cont = {}
    escopo = 0
    fora = 0
    for linha in out[1:]:
        col = linha.split("\t")
        if col[i_cls] == "HERDADA_H9C":
            fora += 1
            continue
        escopo += 1
        cont[col[i_cls]] = cont.get(col[i_cls], 0) + 1
    resumo = dict(
        ambiente=AMBIENTE,
        ledger=LEDGER,
        total_bruto=len(out) - 1,
        fora_escopo_h9d=fora,
        escopo_h9d=escopo,
        por_classificacao={k: cont[k] for k in sorted(cont)},
        lotes_auditados=["H9-D-L1", "H9-D-L2", "H9-D-L3", "H9-D-L4", "H9-D-L5", "H9-D-L6", "H9-D-L6R"],
        forwards_aplicados=[
            "20261006000000", "20261007000000", "20261008000000", "20261009000000",
            "20261010000000", "20261011000000", "20261012000000", "20261013000000",
            "20261014000000", "20261015000000", "20261016000000", "20261017000000",
            "20261018000000",
        ],
        metodologia=(
            "regex apenas triagem; AUTH_COMPROVADA/NAO_APLICAVEL exigem decisão manual por "
            "assinatura canônica completa, com guarda textual, cadeia transitiva, fail-closed e callsites"
        ),
    )
    with open(os.path.join(DIR, "resumo-h9d.json"), "w", encoding="utf-8") as fh:
        json.dump(resumo, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print(json.dumps(resumo["por_classificacao"], ensure_ascii=False), "escopo", escopo, "fora", fora)


if __name__ == "__main__":
    main()

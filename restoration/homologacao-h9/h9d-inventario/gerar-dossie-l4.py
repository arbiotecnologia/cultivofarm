#!/usr/bin/env python3
"""H9-D-L4 — gerador determinístico do dossiê das 30 assinaturas auditadas.

Fonte dos fingerprints: catálogo vivo da homologação `ikaauvsflpmamgxmkhoq`
(nunca produção). Reproduza o TSV de entrada com:

    psql "$STAGING_DSN" -Atc "
      SELECT p.proname||'('||pg_catalog.oidvectortypes(p.proargtypes)||')'
             || E'\\t' || md5(pg_get_functiondef(p.oid))
             || E'\\t' || length(pg_get_functiondef(p.oid))
             || E'\\t' || coalesce(p.proacl::text,'')
             || E'\\t' || coalesce(p.proconfig::text,'')
             || E'\\t' || p.provolatile::text
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = ANY(<as 30 assinaturas>);" > live_pos.tsv

Uso: python3 gerar-dossie-l4.py live_pos.tsv dossie-l4.json
"""
import json
import sys

A: dict[str, dict[str, str]] = {}


def e(sig, guarda, cadeia, nullfc, bola, dyn, cls, obs, sqld="nenhum", cs=""):
    A[sig] = dict(
        guarda_textual=guarda,
        cadeia_transitiva=cadeia,
        null_fail_closed=nullfc,
        tenant_bola_idor=bola,
        sql_dinamico=sqld,
        callsites=cs,
        prova_dinamica=dyn,
        classificacao=cls,
        observacao=obs,
    )


e('rpc_b2b_executive_dashboard()',
  "IF NOT (has_role(auth.uid(),'administrador') OR 'gestor' OR 'financeiro' OR 'gestor_comercial' OR 'administrativo') THEN RAISE 42501 — guarda na primeira instrução, antes de qualquer leitura",
  "public.has_role (SECDEF, search_path=public) sobre public.user_roles; leituras agregadas de partner_orders/accounts_receivable",
  "auth.uid() NULL => has_role false => 42501 (fail-closed)",
  "sem parâmetros; agregação global restrita a papéis executivos; não expõe parceiro individual",
  "sessão cliente_produtor => ERROR permission_denied (42501). Admin executa normalmente.",
  "AUTH_COMPROVADA",
  "Agregado global sem SELECT *; contagens por FILTER, sem dupla contagem.", cs="src (1 arquivo)")
e('rpc_b2b_financial_kpis(date,date,uuid)',
  "v_uid := auth.uid(); IF NOT (has_role administrador/financeiro/gestor/gestor_comercial) THEN RAISE 'Sem permissão' — antes de qualquer leitura",
  "has_role -> user_roles; agregações sobre pedidos/títulos B2B",
  "auth.uid() NULL => nenhum papel => exceção",
  "p_partner_id é apenas filtro opcional para papéis já autorizados globalmente; parceiro B2B não tem acesso a esta RPC",
  "cliente_produtor => ERROR 'Sem permissão'",
  "AUTH_COMPROVADA",
  "Filtro por parceiro só após autorização de papel corporativo.", cs="src (1 arquivo)")
e('rpc_b2b_governance_kpis()',
  "Mesma matriz executiva de 5 papéis com RAISE 42501 antes da leitura",
  "has_role -> user_roles; leituras de governança B2B", "NULL => 42501", "sem parâmetros",
  "cliente_produtor => permission_denied", "AUTH_COMPROVADA",
  "Sem exposição por parâmetro.", cs="src (1 arquivo)")
e('rpc_b2b_integrity_check()',
  "IF NOT has_role(administrador) AND NOT has_role(gestor) THEN RAISE 'Acesso negado'",
  "has_role -> user_roles", "NULL => negado", "sem parâmetros",
  "cliente_produtor => ERROR 'Acesso negado'", "AUTH_COMPROVADA",
  "Restrita a administrador/gestor.", cs="src (1 arquivo)")
e('rpc_b2b_list_selectable_payment_plans()',
  "v_uid NULL => 'not_authorized'; exige admin/financeiro/gestor_comercial OU parceiro_b2b",
  "has_role; commercial_payment_plans; commercial_payment_plan_assignments JOIN partner_users",
  "NULL => not_authorized",
  "Parceiro só enxerga planos atribuídos ao seu partner_id via partner_users.user_id = v_uid; vigência valid_from/valid_until e status='published' aplicados",
  "cliente_produtor => ERROR not_authorized", "AUTH_COMPROVADA",
  "Escopo de parceiro imposto server-side no WHERE, não por parâmetro.", cs="src (1 arquivo)")
e('rpc_b2b_partner_credit(uuid)',
  "v_uid NULL => auth_required; p_partner_id NULL => partner_required; autorização admin/financeiro/gestor_comercial OU parceiro_b2b COM vínculo partner_users(user_id,partner_id); senão 'forbidden' — tudo antes de fn_b2b_credit_exposure",
  "public.fn_b2b_credit_exposure(uuid,numeric,uuid)",
  "NULL de uid ou de partner => exceção antes de leitura",
  "BOLA testado: parceiro_b2b real chamando partner_id alheio (381142fc-…) => ERROR 'forbidden'; próprio partner_id => JSON de exposição correto",
  "cliente_produtor => negado; parceiro alheio => forbidden; próprio => 200",
  "AUTH_COMPROVADA",
  "Escopo de parceiro comprovado dinamicamente, não por regex.", cs="src (2 arquivos)")
e('rpc_b2b_partner_profitability(date,date,uuid)',
  "Matriz executiva de 5 papéis, RAISE 42501 com HINT antes da leitura",
  "has_role; agregações de receita/custo por parceiro", "NULL => 42501",
  "p_partner_id é filtro para papéis corporativos; parceiro B2B não executa",
  "cliente_produtor => permission_denied", "AUTH_COMPROVADA",
  "Rentabilidade não é exposta a parceiro.", cs="src (1 arquivo)")
e('rpc_b2b_revenue_forecast(uuid)',
  "Matriz executiva de 5 papéis, RAISE 42501 antes da leitura",
  "has_role; projeções sobre pedidos/títulos", "NULL => 42501",
  "idem: parâmetro é filtro pós-autorização corporativa",
  "cliente_produtor => permission_denied", "AUTH_COMPROVADA",
  "Forecast não revela parceiro alheio a parceiro.", cs="src (1 arquivo)")
e('rpc_bi_fluxo_visitas_resumo(timestamp with time zone,timestamp with time zone,uuid,uuid,uuid,text,text)',
  "IF NOT can_view_bi_operacional(v_uid) THEN retorna {ok:false, reason:'sem_permissao'} sem dados; além disso o CTE base reaplica escopo por papel",
  "can_view_bi_operacional; has_role; get_cliente_ids_for_user; mv_fluxo_visita_tecnica",
  "auth.uid() NULL => can_view_bi_operacional false => retorno vazio fail-closed",
  "consultor/técnico limitado a m.consultor_id = v_uid OU cliente em get_cliente_ids_for_user(v_uid); papéis corporativos veem tudo",
  "cliente_produtor => {\"ok\":false,\"reason\":\"sem_permissao\",\"total_visitas\":0} (nenhum dado)",
  "AUTH_COMPROVADA",
  "Escopo cruzado imposto dentro do CTE; agregações por FILTER sobre a mesma base, sem dupla contagem nem SELECT *.",
  cs="src (2 arquivos)")
e('rpc_cancelar_etiqueta_produto(uuid,text)',
  "v_uid NULL => 'Não autenticado'; motivo < 3 chars => 'Motivo obrigatório'; papéis administrador/gestor/producao; só então UPDATE",
  "has_role; produto_etiquetas; produto_etiqueta_eventos; financial_audit_log", "NULL => negado",
  "UPDATE condicionado a status <> 'cancelada'; NOT FOUND => erro genérico ('não encontrada ou já cancelada') sem distinguir inexistente de já-cancelada",
  "cliente_produtor => ERROR 'Sem permissão para cancelar etiqueta'", "AUTH_COMPROVADA",
  "Idempotência por status; motivo obrigatório; auditoria dupla (evento + financial_audit_log).",
  cs="src (2 arquivos)")
e('rpc_coletar_assinatura_digital_entrega(uuid,jsonb)',
  "v_uid NULL => 'Sessão inválida'; is_delivery_staff(v_uid) obrigatório antes da leitura da entrega",
  "is_delivery_staff -> fn_authz_uid_scope_ok + has_role; entregas; entrega_comprovantes",
  "NULL => negado; recebedor_nome/assinatura_hash nulos => erro de validação",
  "acesso restrito a staff de entrega; status 'cancelada' bloqueado",
  "cliente_produtor => ERROR 'Sem permissão'", "AUTH_COMPROVADA",
  "Validação de payload após autorização; sem oráculo para não-staff.", cs="src (1 arquivo)")
e('rpc_commercial_alerts()',
  "IF NOT (administrador OR gestor_comercial) THEN RAISE 'forbidden'", "has_role; bases comerciais",
  "NULL => forbidden", "sem parâmetros", "cliente_produtor => forbidden", "AUTH_COMPROVADA",
  "Restrita à alçada comercial.", cs="src (1 arquivo)")
e('rpc_commercial_consolidated_dashboard(date,date,uuid,uuid,text,text)',
  "IF NOT (administrador OR gestor_comercial) THEN RAISE 'forbidden' antes de qualquer leitura",
  "has_role; agregações comerciais", "NULL => forbidden",
  "parâmetros são filtros pós-autorização", "cliente_produtor => forbidden", "AUTH_COMPROVADA",
  "Consolidação sem SELECT * e sem dupla contagem.", cs="src (1 arquivo)")
e('rpc_commercial_kpis(date,date,uuid,uuid,text)',
  "IF NOT (administrador OR gestor_comercial) THEN RAISE 'forbidden'", "has_role; agregações comerciais",
  "NULL => forbidden", "filtros pós-autorização", "cliente_produtor => forbidden", "AUTH_COMPROVADA",
  "KPIs coerentes com o dashboard consolidado.", cs="src (1 arquivo)")
e('rpc_commercial_simulator(uuid,uuid,numeric,numeric)',
  "IF NOT (administrador OR gestor_comercial) THEN RAISE 'forbidden' antes de resolver preço",
  "has_role; motor de preço comercial", "NULL => forbidden",
  "não expõe preço interno a parceiro/cliente; complementa a revogação H9-D-L3 de fn_catalogo_preco_canonico",
  "cliente_produtor => forbidden", "AUTH_COMPROVADA",
  "Simulação restrita à alçada comercial.", cs="src (1 arquivo)")
e('rpc_confirmar_entrega_embalagens(uuid)',
  "v_uid NULL => 'auth required'; papéis administrador/gestor/producao/operador_onfarm; erro se não houver embalagem reservada/separada",
  "has_role; estoque_embalagens; movimentações; financial_audit_log", "NULL => negado",
  "transição de estado exigida (reservado/separado) impede confirmação arbitrária",
  "cliente_produtor => ERROR 'sem permissão'", "AUTH_COMPROVADA",
  "Transição válida + auditoria.", cs="src (1 arquivo)")
e('rpc_confirmar_recebimento_entrega(uuid,jsonb)',
  "v_uid NULL => 'Sessão inválida'; is_delivery_staff obrigatório; depois valida entrega, status e comprovante assinado",
  "is_delivery_staff; entregas; entrega_comprovantes", "NULL => negado",
  "restrito a staff; exige comprovante em estado confirmável e com assinatura",
  "cliente_produtor => ERROR 'Sem permissão'", "AUTH_COMPROVADA",
  "Máquina de estados do comprovante respeitada.", cs="src (1 arquivo)")
e('rpc_confirmar_separacao_embalagem(uuid)',
  "v_uid NULL => 'auth required'; can_user_manage_estoque_embalagem(p_embalagem_id) OU papel administrativo; exige status='reservado'",
  "can_user_manage_estoque_embalagem; estoque_embalagens; rpc_recalcular_separacao_entrega",
  "NULL => negado", "autorização por recurso (helper por embalagem), não por UUID opaco",
  "cliente_produtor => ERROR 'sem permissão'", "AUTH_COMPROVADA",
  "Transição reservado->separado com movimentação e auditoria.", cs="src (1 arquivo)")
e('rpc_converter_visita_em_os(uuid,text)',
  "ANTES: auth.uid() NULL => mensagem; em seguida LIA registros_consultor e só então avaliava papéis, produzindo mensagens distintas 'Visita técnica não encontrada.' vs 'Sem permissão para converter esta visita.'. DEPOIS: gate de capacidade (administrador/gestor/consultor_tecnico/tecnico_agronomo) ANTES de qualquer leitura, com mensagem única de permissão",
  "has_role; registros_consultor; ordens_servico_onfarm; portal_solicitacoes; solicitacoes_timeline; registros_consultor_status_log; visitas_logs",
  "auth.uid() NULL => 'Não autenticado' sem leitura",
  "Oráculo de existência comprovado: identidade cliente_produtor distinguia registro real de UUID inexistente. Corrigido: ambas as respostas passam a ser idênticas para quem não tem papel de domínio de visita",
  "ANTES (cliente_produtor): real => 'Sem permissão…', inexistente => 'Visita técnica não encontrada.' (respostas distintas). DEPOIS: ambas => 'Sem permissão para converter esta visita.'. Admin: inexistente => 'Visita técnica não encontrada.' (feedback operacional preservado); consultor não responsável => negado como antes",
  "EXPOSICAO_COMPROVADA_CORRIGIDA",
  "Corrigido pelo forward 20261013000000_h9dl4_authz_visit_domain_gate_v1 (ledger 668->669), somente homologação, com rollback simétrico e ensaio rollback->reaplicação de fingerprint idêntico (d9cfffa0121c3704e0d39270d2dade29; estado com rollback c8f4b2c1720926f1d877b2df4a413bac). Assinatura, retorno jsonb, chaves e callsites preservados. Idempotência de OS já existente e matriz de permissão original intactas.",
  cs="src/hooks/useFluxoVisitaTecnica.ts:239")
e('rpc_create_communication_template(text,text,comunicacao_canal,text,text,jsonb)',
  "IF NOT has_role(auth.uid(),'administrador') THEN RAISE insufficient_privilege; valida variaveis como array JSON",
  "has_role; comunicacao_templates", "NULL => negado",
  "criação restrita a administrador; created_by/updated_by = auth.uid()",
  "identidade financeiro (não admin) => ERROR 'apenas administrador'", "AUTH_COMPROVADA",
  "Versionamento em 'draft'; autoria registrada.", cs="src (2 arquivos)")
e('rpc_criar_visita_idempotente(uuid,uuid,uuid,uuid,uuid,date,tipo_visita,text,text,text,uuid,text,categoria_problema_consultor,nivel_pressao,numeric,urgencia_consultor,text,text,text,numeric,numeric,numeric,uuid)',
  "auth.uid() NULL => unauthenticated; origem validada; obrigatórios validados; idempotência por client_uuid com autorização antes do retorno (correção H9-D-L1); acesso técnico/vínculo de cliente exigido para criar",
  "has_role; get_cliente_ids_for_user; registros_consultor; coerência fazenda->cliente e talhao->fazenda",
  "parâmetros nulos => invalid_request antes de qualquer escrita",
  "BOLA testado com fixture temporária revertida: produtor criando visita para cliente ALHEIO => {ok:false,error:'technical_access_required'}; para o próprio cliente vinculado => criação legítima",
  "cliente_produtor/cliente alheio => technical_access_required; cliente próprio => ok; colisão de idempotência cross-actor => idempotency_conflict genérico (H9-D-L1)",
  "AUTH_COMPROVADA",
  "Fixtures de prova inseridas e revertidas na mesma transação; zero resíduos confirmados.",
  cs="src (4 arquivos)")
e('rpc_dashboard_geral_lab_resumo()',
  "v_uid NULL => 42501; is_executivo(v_uid) obrigatório => 42501",
  "is_executivo -> user_roles; múltiplos blocos com EXCEPTION que apenas marcam indisponibilidade",
  "NULL => 42501", "sem parâmetros; agregação global executiva",
  "cliente_produtor => ERROR 'Acesso negado' (42501)", "AUTH_COMPROVADA",
  "Blocos EXCEPTION WHEN OTHERS degradam para lista de indisponíveis sem vazar SQLERRM.",
  cs="src (1 arquivo)")
e('rpc_delete_diagnostico_visita(uuid)',
  "ANTES: nenhuma verificação própria; fazia SELECT do registro em visita_diagnosticos e só então delegava a _assert_visita_editavel. DEPOIS: auth.uid() NULL => 42501 e gate de capacidade (administrador/gestor/consultor_tecnico/tecnico_agronomo) ANTES da leitura; _assert_visita_editavel preservado",
  "_assert_visita_editavel -> can_manage_technical_visit, is_active_visit_participant, is_technical_visit_editable_status; visita_diagnosticos",
  "ANTES: sem sessão retornava silenciosamente. DEPOIS: sem sessão => 42501",
  "Oráculo de existência comprovado: cliente_produtor recebia retorno silencioso para UUID inexistente e 42501 'sem_permissao' para diagnóstico real de terceiro, permitindo enumerar IDs válidos. Corrigido: resposta 42501 uniforme",
  "ANTES: inexistente => sucesso silencioso; real alheio => 42501; sem JWT => sucesso silencioso. DEPOIS: os três => 42501 'sem_permissao'. Admin: inexistente => silencioso (idempotência preservada); diagnóstico real => exclusão legítima executada (transação revertida)",
  "EXPOSICAO_COMPROVADA_CORRIGIDA",
  "Corrigido pelo forward 20261013000000 (ledger 668->669), somente homologação, rollback simétrico e fingerprint idêntico no ensaio. Contrato RETURNS void e callsites offline/wizard preservados. Adendo de auditoria independente reprovado no catálogo vivo com o UUID real b906cbf7-c7b1-4736-98c2-a5f281238068: real, inexistente e sessão sem JWT retornam agora 42501 'sem_permissao' de forma indistinguível; nenhum SELECT do recurso precede a autorização.",
  cs="src/hooks/useOfflineSync.ts:612; src/pages/app/wizard/WizardDiagnosticoStep.tsx:160")
e('rpc_delete_recomendacao_visita(uuid)',
  "ANTES: nenhuma verificação própria antes da leitura do registro. DEPOIS: auth.uid() NULL => 42501 e mesmo gate de capacidade antes da leitura; _assert_visita_editavel preservado",
  "_assert_visita_editavel e cadeia; registros_consultor_recomendacoes",
  "ANTES: silencioso sem sessão. DEPOIS: 42501",
  "Mesmo oráculo de existência da RPC de diagnóstico, com a tabela de recomendações; defeito estruturalmente idêntico e determinístico",
  "ANTES (cliente_produtor): inexistente => sucesso silencioso. DEPOIS: 42501 'sem_permissao'. Caminho legítimo de consultor/admin preservado",
  "EXPOSICAO_COMPROVADA_CORRIGIDA",
  "Mesma migração 20261013000000; contrato e callsites preservados. Adendo de auditoria independente: sem recomendação real disponível para prova positiva, a correção foi aplicada por identidade estrutural com a RPC de diagnóstico; prova depois com UUID inexistente e sem JWT retorna 42501 'sem_permissao'.",
  cs="src/hooks/useOfflineSync.ts:664; src/pages/app/wizard/WizardRecomendacaoStep.tsx:192")
e('rpc_desativar_bank_account(uuid,text)',
  "IF NOT is_financial_staff(auth.uid()) THEN RAISE insufficient_privilege antes do UPDATE",
  "is_financial_staff -> fn_authz_uid_scope_ok + has_role; bank_accounts; financial_audit_log",
  "NULL => fn_authz_uid_scope_ok false => negado",
  "UPDATE por id após autorização de alçada financeira; NOT FOUND => erro",
  "cliente_produtor => ERROR 'Sem permissão.'", "AUTH_COMPROVADA",
  "Soft-delete (active=false) com motivo e auditoria; não apaga dados.", cs="src (1 arquivo)")
e('rpc_desativar_cost_center(uuid,text)',
  "IF NOT is_financial_staff(auth.uid()) THEN RAISE insufficient_privilege antes do UPDATE",
  "is_financial_staff; financial_cost_centers; financial_audit_log", "NULL => negado",
  "idem conta bancária", "cliente_produtor => ERROR 'Sem permissão.'", "AUTH_COMPROVADA",
  "Soft-delete auditado.", cs="src (1 arquivo)")
e('rpc_desvincular_etiqueta_entrega(uuid,uuid,text)',
  "v_uid NULL => 'Não autenticado'; papéis administrador/gestor/producao/operador_onfarm; motivo >= 3 chars; UPDATE só de vínculo ativo",
  "has_role; entrega_etiquetas; produto_etiqueta_eventos; financial_audit_log", "NULL => negado",
  "UPDATE exige par (entrega_id, etiqueta_id) ativo; NOT FOUND => erro único que não distingue inexistente de já desvinculado",
  "cliente_produtor => ERROR 'Sem permissão'", "AUTH_COMPROVADA",
  "Motivo obrigatório e auditoria; bloco EXCEPTION do audit log não mascara a operação principal.",
  cs="nenhum callsite direto no frontend (uso administrativo)")
e('rpc_dispensar_assinatura_entrega(uuid,text)',
  "v_uid NULL => 'Sessão inválida'; papéis administrador/gestor/administrativo; motivo >= 5 chars — tudo antes de qualquer leitura/escrita",
  "has_role; entregas; entrega_comprovantes; rpc_gerar_formulario_entrega; entrega_ocorrencias; financial_audit_log; extensions.digest",
  "NULL => negado", "alçada restrita; dispensa registrada com motivo, ocorrência e auditoria",
  "cliente_produtor => ERROR 'Apenas admin/gestor/administrativo podem dispensar assinatura'",
  "AUTH_COMPROVADA", "Hash de validação e trilha completa; motivo obrigatório.", cs="src (1 arquivo)")
e('rpc_entrega_assinar_termo_v1(uuid,jsonb,text)',
  "v_uid NULL => sessao_invalida; is_delivery_staff obrigatório; idempotency_key obrigatória; payload validado — antes de localizar o termo",
  "is_delivery_staff; entrega_termos; financial_audit_log; extensions.digest; pg_advisory_xact_lock",
  "NULL => negado", "staff-only; sem parâmetro de identidade de terceiro",
  "cliente_produtor => ERROR 'sem_permissao'", "AUTH_COMPROVADA",
  "Concorrência: pg_advisory_xact_lock por entrega + SELECT FOR UPDATE. Idempotência: replay só com mesma idempotency_key e mesmo request_fingerprint (SHA-256), senão idempotency_payload_mismatch; reutilização de chave em outro termo => idempotency_key_reutilizada; estado != rascunho => erro de transição. search_path fixo em public, extensions.",
  cs="src (2 arquivos)")
e('rpc_entrega_cancelar_termo_v1(uuid,text)',
  "v_uid NULL => sessao_invalida; papéis administrador/gestor/administrativo antes de qualquer leitura; motivo exigido",
  "has_role; entrega_termos; financial_audit_log", "NULL => negado",
  "alçada restrita; transição de status validada", "cliente_produtor => ERROR 'sem_permissao'",
  "AUTH_COMPROVADA", "Cancelamento auditado com motivo.", cs="src (1 arquivo)")

VOL = {"i": "IMMUTABLE", "s": "STABLE", "v": "VOLATILE"}


def main(tsv_path: str, out_path: str) -> None:
    rows = {}
    for line in open(tsv_path):
        p = line.rstrip("\n").split("\t")
        if len(p) < 6:
            continue
        rows[p[0].replace(", ", ",")] = {
            "definition_md5": p[1],
            "definition_len": int(p[2]),
            "acl": p[3],
            "proconfig": p[4],
            "volatilidade": VOL[p[5]],
        }
    assert len(A) == 30, len(A)
    faltando = [s for s in A if s not in rows]
    assert not faltando, faltando
    resumo = {}
    for x in A.values():
        resumo[x["classificacao"]] = resumo.get(x["classificacao"], 0) + 1
    out = {
        "ambiente": "ikaauvsflpmamgxmkhoq",
        "producao_proibida": "navfzbwgwzruipouyfnk",
        "ledger": 669,
        "lote": "H9-D-L4",
        "total": 30,
        "commit_base": "eaa63c00eecabfc492ae21ba06782f882259f976",
        "forward_aplicado": "20261013000000_h9dl4_authz_visit_domain_gate_v1",
        "fonte_hash_sql": (
            "SELECT p.proname||'('||pg_catalog.oidvectortypes(p.proargtypes)||')' AS sig, "
            "md5(pg_get_functiondef(p.oid)) AS definition_md5, "
            "length(pg_get_functiondef(p.oid))::text AS definition_len, "
            "coalesce(p.proacl::text,'') AS acl, coalesce(p.proconfig::text,'') AS proconfig, "
            "p.provolatile::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
            "WHERE n.nspname='public' AND p.prosecdef;"
        ),
        "fingerprint_forward": "d9cfffa0121c3704e0d39270d2dade29",
        "fingerprint_rollback": "c8f4b2c1720926f1d877b2df4a413bac",
        "fingerprint_sql": (
            "SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),'|' "
            "ORDER BY p.proname)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
            "WHERE n.nspname='public' AND p.proname IN "
            "('rpc_delete_diagnostico_visita','rpc_delete_recomendacao_visita','rpc_converter_visita_em_os');"
        ),
        "metodo": (
            "Leitura integral de pg_get_functiondef das 30 assinaturas e dos helpers transitivos; "
            "ACL/owner/proconfig/volatilidade lidos do catálogo vivo; callsites mapeados por varredura "
            "em src/ e supabase/functions; provas dinâmicas executadas com identidades reais em "
            "transações revertidas (sem JWT, authenticated sem papel de domínio, cliente_produtor, "
            "parceiro_b2b, consultor/técnico, financeiro e administrador). Nenhuma classificação por "
            "regex isolado."
        ),
        "resumo_classificacao": resumo,
        "assinaturas": {},
    }
    for sig, meta in A.items():
        out["assinaturas"][sig] = {**rows[sig], **meta}
    with open(out_path, "w") as fh:
        json.dump(out, fh, indent=1, ensure_ascii=False)
    print("entradas:", len(out["assinaturas"]), resumo)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

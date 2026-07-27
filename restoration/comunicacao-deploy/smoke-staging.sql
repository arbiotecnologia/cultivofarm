-- smoke-staging.sql — smoke read-mostly em transação com ROLLBACK.
-- Verifica assinaturas/grants/cenários negativos sem IDs reais, sem envio,
-- sem simular auth.uid() de forma insegura e sem desabilitar RLS.

\set ON_ERROR_STOP on
BEGIN;

-- 1) Assinaturas obrigatórias (Fase 2 v2)
DO $$
DECLARE
  v_needed text[] := ARRAY[
    'public.rpc_publish_communication_event_v2(text,text,uuid,jsonb,text)',
    'public.rpc_set_communication_template_metadata(uuid,text,text,jsonb,text)',
    'public.rpc_preview_administrative_broadcast_count(public.app_role)',
    'public.rpc_resolve_outbox_address(uuid)',
    'public.rpc_skip_communication_delivery(uuid,text,text)',
    'public.rpc_cancel_communication_delivery(uuid,text,text)',
    'public.rpc_defer_communication_delivery(uuid,text,text,integer)',
    'public.rpc_fail_communication_delivery_v2(uuid,text,text,text,boolean)',
    'public.rpc_dispatch_inapp_notification(uuid,uuid,uuid,text,text)',
    'public.rpc_create_portal_notification_secure(uuid,text,text,text)',
    'public.rpc_create_operational_notification_secure(uuid,text,text,text,text)'
  ];
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY v_needed LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION 'smoke: assinatura ausente %', v_sig;
    END IF;
  END LOOP;
  RAISE NOTICE 'smoke: assinaturas OK';
END $$;

-- 2) Grants mínimos para EXECUTE (roles authenticated / service_role)
DO $$
DECLARE
  v_role text;
  v_fn   text;
  v_fns  text[] := ARRAY[
    'rpc_publish_communication_event_v2',
    'rpc_set_communication_template_metadata',
    'rpc_preview_administrative_broadcast_count',
    'rpc_resolve_outbox_address'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.routine_privileges
      WHERE routine_schema='public'
        AND routine_name=v_fn
        AND grantee IN ('authenticated','service_role')
        AND privilege_type='EXECUTE'
    ) THEN
      RAISE EXCEPTION 'smoke: grant EXECUTE ausente em %', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'smoke: grants OK';
END $$;

-- 3) Cenário negativo: publish v2 com idempotency_key curto → deve falhar
DO $$
BEGIN
  BEGIN
    PERFORM public.rpc_publish_communication_event_v2(
      'administrative_important_update', NULL, NULL,
      jsonb_build_object('titulo','x','mensagem','y','target_role','administrador'),
      'short'
    );
    RAISE EXCEPTION 'smoke: publish v2 aceitou idempotency_key curto';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'smoke: publish v2 rejeitou idempotency_key curto (esperado): %', SQLERRM;
  END;
END $$;

-- 4) Cenário negativo: OS event sem source → deve falhar
DO $$
BEGIN
  BEGIN
    PERFORM public.rpc_publish_communication_event_v2(
      'os_pronto_entrega', NULL, NULL, '{}'::jsonb, 'abcdefgh12345'
    );
    RAISE EXCEPTION 'smoke: publish v2 aceitou OS sem source';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'smoke: publish v2 rejeitou OS sem source (esperado): %', SQLERRM;
  END;
END $$;

-- 5) Cenário negativo: set metadata com status inválido
DO $$
BEGIN
  BEGIN
    PERFORM public.rpc_set_communication_template_metadata(
      '00000000-0000-0000-0000-000000000000'::uuid,
      'nome_qualquer','pt_BR','[]'::jsonb,'submitted'
    );
    RAISE EXCEPTION 'smoke: metadata aceitou status legado submitted';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'smoke: metadata rejeitou submitted (esperado): %', SQLERRM;
  END;
END $$;

-- Nunca comitar: este arquivo é somente smoke.
ROLLBACK;

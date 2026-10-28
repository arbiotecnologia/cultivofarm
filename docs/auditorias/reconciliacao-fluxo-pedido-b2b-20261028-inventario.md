# Anexo — contratos capturados, não recaptura LIVE

Gerado exclusivamente das evidências existentes no repositório. Sem conexão de banco. MD5 é de pg_get_functiondef capturado, não assinatura de release homologado. Nenhuma ACL deduzida quando metadado ausente. Ref das capturas: `swzpzcwiasxmjutrmvkm`.

## A2 — captura 28/10/2026 (37 funções)

| Assinatura | OID | MD5 | Owner | ACL capturada | Config |
|---|---|---|---|---|---|
| public.enforce_cliente_id_for_produtor() | 41622 | ecad56badcb2120f7048fad7519f76f4 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.fn_financial_audit() | 41686 | 46f777c2020ff9a059a80ae6dab4bd12 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.fn_h6_guard_ar_installment_snapshot() | 41736 | c3f26bc5217a5d86227c7e74f762b3ad | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.fn_h6_guard_title_snapshot() | 41737 | d9cc5c95f837de9d77cec2159e24bbf9 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.fn_h6d_block_hard_delete() | 41744 | 5c07dd23a0c9355c3fe11811004b0381 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.tg_recalc_risk_on_ar_change() | 42131 | 2d38119a0bb885471ba0112c300a4144 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.guard_profile_sensitive_fields() | 61233 | 1c2ad8d0ef38ea66866f8b85d3acb109 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path="" |
| public.tg_sync_b2b_financial_status() | 42136 | e636fcf74c5e1c7c8037d5a17f525c27 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.has_role(_user_id uuid, _role app_role) | 95587 | 4d90e93d521a4819d9085f28d742030f | postgres | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} | search_path="" |
| platform_private.has_role(_user_id uuid, _role app_role) | 37054 | c5af5b55de6d79da9b73a33948746ae2 | postgres | {postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres} | search_path="" |
| public.fn_entrega_confirmar_engine_v1(p_entrega_id uuid, p_os_id uuid, p_origem text, p_recebedor jsonb DEFAULT '{}'::jsonb, p_opcoes jsonb DEFAULT '{}'::jsonb) | 41671 | 6eb78ceebe90196ac5b95bfc127dd63b | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public, pg_temp |
| public.fn_entrega_valor_faturavel_v1(p_entrega_id uuid) | 41675 | 5ac43dc18eee407723c0d78cd97f0db4 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.fn_mark_entrega_not_billable(_entrega_id uuid, _reason text) | 41748 | e4008b029ce8d58f70f3fc88571d03be | postgres | {postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres} | search_path=public |
| public.is_financial_staff(_uid uuid) | 42634 | 6e8f2fa7b92ca7e039d092353b3ebfe2 | postgres | {postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres} | search_path=public, pg_temp |
| public.h15_profile_organization_guard() | 67200 | 43be4da16aae664a48fa4c73315b4420 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=pg_catalog, public |
| public.fn_generate_receivable_installments() | 41732 | f632f15c9f46cb9889082fc533a27ea1 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| cf_user_guards_v1.acquire_gate() | 71452 | b0dd9a14d5fd799a40df0975baf4c5a6 | postgres | {postgres=X/postgres} | search_path="" |
| cf_user_guards_v1.require_admin() | 71453 | ec8e7077521cdee212be924bfb400e8a | postgres | {postgres=X/postgres} | search_path="" |
| cf_user_guards_v1.advance_stamp() | 71454 | ce295ff5799d306ad81578047cd9bff5 | postgres | {postgres=X/postgres} | search_path="" |
| cf_user_guards_v1.touch_related_profiles() | 71455 | e5911c3801be399f9de57e038b390e79 | postgres | {postgres=X/postgres} | search_path="" |
| cf_user_guards_v1.block_truncate() | 71456 | a919901eb1e045461a5bc6e4da178624 | postgres | {postgres=X/postgres} | search_path="" |
| public.rpc_entrega_confirmar_v1(p_entrega_id uuid, p_recebedor jsonb, p_opcoes jsonb DEFAULT '{}'::jsonb) | 41920 | cd39f9fe93514420976263d13856c17c | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public, pg_temp |
| public.guard_superadmin_role_assignment() | 72698 | 4a59f48e25096848a79be6de9d959cef | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path="" |
| public._saas_trg_require_feature() | 83854 | 13ed48832f81cbb35434688ca35fda4b | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path="" |
| public.fn_authz_uid_scope_ok(_uid uuid) | 42563 | 00a9a4d4a075d756d312d69778493b39 | postgres | {postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres} | search_path=public, pg_temp |
| public.fn_entrega_guard_faturamento_v1(p_entrega_id uuid, p_total numeric) | 41673 | fe0d6a0f670787f87081fe0650102d22 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.organizations_guard_status() | 84007 | 1c2241052d227831f625b909eb606bda | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path="" |
| public.fn_generate_receivable_from_entrega(_entrega_id uuid, _payload jsonb) | 41730 | 670ea34d37c4c4fd6612031ad763a3a7 | postgres | {postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres} | search_path=public |
| public.guard_profile_senha_ticket() | 84540 | bb9ea2f95f8f151ebd4b97c2a2e747b7 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path="" |
| public.guard_profile_senha_provisoria() | 83979 | e38505f726490b064e61d9aa4e3be5a7 | postgres | {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} | search_path="" |
| public.guard_profile_tenant_fields() | 90519 | bd6d513d936f5c5fb0490b5d1d2f9f1d | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path="" |
| public.guard_tenant_organization_id() | 90690 | d01a740c1e3e02407131d2b9228bf658 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path="" |
| public.d51_5_validate_financial_tenant_links() | 90880 | f470a25ba7e65b366c62ad3ac8aa3112 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public, pg_temp |
| public.h15_user_organization(p_user uuid) | 90967 | ff3688c33c7211b6c3fe60447a7728ac | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=pg_catalog, public |
| public.update_updated_at_column() | 42147 | b1930ed5bca3be839f783c6202ab8147 | postgres | {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} | search_path=public |
| platform_private.h15_actor_organization() | 67184 | 64e10608403238a41a9baf92857ca881 | postgres | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} | search_path="" |
| platform_private.platform_actor_access_ready(p_user uuid) | 95577 | 048249c0c2106c3761e26eacb8d0de84 | postgres | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} | search_path="" |

## Estoque/envase — captura 27/10/2026 (metadados de catálogo)

| Assinatura | OID | MD5 | Owner | ACL capturada | Config |
|---|---|---|---|---|---|
| public._comunicacao_trg_os_pronto_retirada() | 41579 | b0340dbc6fa5c5f880f0881ad845cb52 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public._refresh_esteira_laboratorio_after_change() | 41590 | 2f361c1fd9de578cf45796d82f3754e0 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public._sync_planning_from_os() | 41593 | 0e79d2c5c352a41f147a62bb1ae5afe4 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.check_os_status_transition() | 41613 | 8dc2c40052b006e51b1defc0284a09e6 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public, pg_temp |
| public.fn_create_programacao_on_os_classica_insert() | 41666 | 27b31332cebda532e2d99d9547f9b67c | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.fn_envase_material_imutavel() | 41678 | a1b1200dfba57684958a8ea94e7afe66 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public, pg_temp |
| public.fn_estoque_produto_guard() | 41684 | fdb38c8e1a6497600c914104bf32c3d3 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.fn_ledger_append_only() | 41747 | a7aae92122f2ba24edffa1b79ce389ac | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.fn_notify_lab_on_programacao() | 41750 | c910c1466bbc06328e3eb9f5b2b132ca | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path="" |
| platform_private.guard_manual_program_binding_v1() | 118390 | 7c168ffa9393207fb3388c9546c19d05 | postgres | {postgres=X/postgres} | search_path="" |
| public.fn_sync_os_classica_downstream() | 41774 | 06e64b76968f91e19f03b24363ac610a | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| platform_private.guard_manual_lot_delete_v1() | 118494 | 0d490a2910e7fb63dd50fd4c86e1cf0f | postgres | {postgres=X/postgres} | search_path="" |
| public.fn_validate_envase_volume() | 41781 | 9d2f0ba3df89e211bee4bb7b85f0804b | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.log_estoque_movimentacao() | 41812 | 45dcb6afde3b37528b972cc018e5162a | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.set_numero_os_regular() | 42070 | e132d714014a46dfbe38670920182ef0 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| platform_private.guard_manual_lot_write_v1() | 117670 | 4eab765e76ca79f16a7dd481887496d9 | postgres | {postgres=X/postgres} | search_path="" |
| platform_private.guard_manual_cq_parent_v1() | 118533 | fbe67571995aa8e4c942ca29215c15b5 | postgres | {postgres=X/postgres} | search_path="" |
| public.tg_protect_os_structural_fields() | 42126 | 8c9c5436e1f0091706a4ff17c9f365fa | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.tg_recalc_planning_from_os() | 42130 | ac8746e2c142d33bfb9e4f3c6d5daf6d | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.validate_estoque_reserva() | 42150 | 9bdbd6bc6fc957993bbdff466db6ef22 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.validate_estoque_entrada() | 42149 | 9e24938a8d716a02ba023c9fb7ce24e9 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.validate_responsavel_producao() | 42155 | 443795794c2cb18b295239a0c81021c6 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.fn_cockpit_is_gestor() | 42571 | ba163f110a2552850fdfebc8f01a2419 | postgres | {postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres} | search_path=public, pg_temp |
| public.fn_cockpit_ctx_programacao(uuid) | 42570 | d39da56ff10ae7b0ecf6d438b981f2f0 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public, pg_temp |
| public.fn_estoque_pode_operar(uuid, text) | 42576 | d0d1e37b39e6f9f814c832ec63a540dd | postgres | {postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres} | search_path=public |
| platform_private.trg_lab_programming_biological_only() | 110889 | d253b17831afaacef106b5c5e1efbb29 | postgres | {postgres=X/postgres} | search_path="" |
| platform_private.trg_lab_lot_biological_only() | 110891 | 58abf38671745d272abeb923ee866083 | postgres | {postgres=X/postgres} | search_path="" |
| platform_private.trg_lab_os_biological_only() | 110893 | 75b55313502aecaf7226cd0a235f1a4f | postgres | {postgres=X/postgres} | search_path="" |
| public.trg_os_sync_partner_order_fn() | 42143 | d219a4922c0c6d2a464175dc61bdf5a3 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| private.guard_os_separate_approval() | 111268 | f00397fe862e611fbfa0eba3911d95c6 | postgres | {postgres=X/postgres} | search_path="" |
| platform_private.stock_p1_lote_owned(uuid) | 96242 | a06f69d41e1f1f996c3c37de6e5c69fb | postgres | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} | search_path="" |
| public.stock_p1_lote_owned(uuid) | 96243 | c276c7826319a6c2058e0c239a1a5954 | postgres | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} | search_path="" |
| platform_private.stock_p1_guard() | 96245 | ad87685f4b7bc87bd8cc3f41f283966d | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path="" |
| public.rpc_cockpit_registrar_envase_v1(uuid, uuid, text, uuid, jsonb, date, text, text, boolean, text) | 41900 | 867c445736fbd2de9416ae4ad6a9d253 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public, extensions, pg_temp |
| public.check_os_item_ref() | 41612 | d059f0014afe15e9d9405fc54a478f2e | postgres | {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} | search_path=public |
| platform_private.stock_p1_movement_owned(uuid, uuid) | 96512 | 9d5199e2226bf08314ea98e7ba1bd56f | postgres | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} | search_path="" |
| public.stock_p1_movement_owned(uuid, uuid) | 96513 | aac11ad7b68d10fe225996f13f32e9b4 | postgres | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} | search_path="" |
| platform_private.stock_p1_movement_guard() | 96515 | f8b5d6828da2db8151b1490f364ef585 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path="" |
| public.rpc_cockpit_cancelar_reserva_v1(uuid, uuid, text, text) | 41892 | b30eb1df9094e4dace1d071b11b6af41 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public, pg_temp |
| public.rpc_criar_embalagens_pos_envase(jsonb) | 41909 | 9d2769dbadaf3aa85afefba595e20b91 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| platform_private.stock_motor_actor(text) | 96969 | 6dfbaa7283b963cb78f19ccdf13ecd9f | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path="" |
| platform_private.stock_motor_refs(uuid, uuid, uuid, jsonb) | 96970 | a61ded2d53f25e87354197873d5bda3e | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path="" |
| platform_private.stock_motor_item(uuid, text, jsonb) | 96971 | 8da786d076cdc443731b27fa4fa9e297 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path="" |
| public.rpc_estoque_operar_v1(text, uuid, numeric, text, jsonb) | 42717 | c71a9e848eff0a522cbaa3a7ec2949a5 | postgres | {postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres} | search_path=public |
| platform_private.stock_motor_context_set(jsonb) | 97776 | 0bbe2c6e5db9670187d442121d46ecb5 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path="" |
| public.fn_estoque_ctx_force(jsonb) | 41680 | 6a820e57ff63adbe5924831fbcefbc8d | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.fn_estoque_ctx_close() | 41679 | 500186214020f96eac9b3df424ed4f7c | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public |
| public.rpc_estoque_reservar_v1(uuid, text, jsonb, text, jsonb) | 41927 | ce2e7cd4080ff2f8fc15cce9294046d9 | postgres | {postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres} | search_path="" |
| public._saas_trg_require_feature() | 83854 | 13ed48832f81cbb35434688ca35fda4b | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path="" |
| public.fn_estoque_fingerprint(text, uuid, numeric, jsonb) | 41683 | f812a94bb9bb61d2354d010ec170d98e | postgres | {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} | search_path=public, extensions |
| public.fn_validate_envase_cq() | 41780 | fc4a739dc17d709d70102885c115112f | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path=public, pg_temp |
| public.lote_volume_envasado(uuid) | 41818 | 06d444c44f19b6569053c76b3122dcef | postgres | {postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres} | search_path=public |
| public.guard_tenant_organization_id() | 90690 | d01a740c1e3e02407131d2b9228bf658 | postgres | {postgres=X/postgres,service_role=X/postgres} | search_path="" |
| public.update_updated_at_column() | 42147 | b1930ed5bca3be839f783c6202ab8147 | postgres | {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} | search_path=public |

## OS/entrega — corpos capturados em 27/10/2026

Arquivo definitions.json não inclui OID/ACL/config separados; ver preflight.sql/README do pacote para permissões verificadas. Os corpos por si sós não comprovam privilégio efetivo.

| Função no arquivo de corpos | MD5 |
|---|---|
| cf_user_guards_v1.acquire_gate | b0dd9a14d5fd799a40df0975baf4c5a6 |
| platform_private.stock_p1_guard | ad87685f4b7bc87bd8cc3f41f283966d |
| platform_private.stock_p1_movement_guard | f8b5d6828da2db8151b1490f364ef585 |
| public._refresh_esteira_laboratorio_after_change | 2f361c1fd9de578cf45796d82f3754e0 |
| public.fn_cockpit_assert_b2b_liberado | 65859c6036077da399e15bc4ba6cbdfc |
| public.fn_cockpit_assert_operador_origem | ec7bd47943764dc4bfda9cdbea2cf283 |
| public.fn_cockpit_norm_origem | 701ba8da92fc3df9ea0e5270ab5e74b2 |
| public.fn_entrega_assert_confirmador | 62f210a4d3052cad23977e43a4dcf0e5 |
| public.fn_entrega_confirmar_engine_v1 | 6eb78ceebe90196ac5b95bfc127dd63b |
| public.fn_entrega_marcar_cancelamento | c5ba9bf8b5b019124d00e36e5a7b0f2a |
| public.fn_estoque_ctx_open | 0ed7e5b17cdca353135b562121aeb9dc |
| public.fn_estoque_ctx_read | 25bba24bf824b91b59dd48523be85769 |
| public.fn_estoque_produto_guard | fdb38c8e1a6497600c914104bf32c3d3 |
| public.fn_h6c_entrega_ar_b2b_link | 9d9cdca4e82d515557c0cdd151f1d077 |
| public.fn_ledger_append_only | a7aae92122f2ba24edffa1b79ce389ac |
| public.fn_sync_entrega_financial_status | 829616d1d23271f7678059d8e34fcb1e |
| public.fn_validate_entrega_confirmacao | 6add438d185c91379d436dc90d1e7617 |
| public.fn_validate_entrega_estoque | 2c2412690cf8c52121a5aed8cdd34436 |
| public.guard_tenant_organization_id | d01a740c1e3e02407131d2b9228bf658 |
| public.log_estoque_movimentacao | 45dcb6afde3b37528b972cc018e5162a |
| public.rpc_aprovar_os_v1 | 1023b9d5210534bee16147e2ce29ee12 |
| public.rpc_cockpit_cancelar_reserva_v1 | b30eb1df9094e4dace1d071b11b6af41 |
| public.rpc_cockpit_confirmar_entrega_v1 | c3ec76faf50df232e92094db6e7d96ec |
| public.rpc_cockpit_criar_entrega_v1 | a4d47ccf5d116141ed46e9de9ea7eeaa |
| public.rpc_entrega_cancelar_v1 | f830c6c718e2b44a1ded06a19a04557a |
| public.rpc_entrega_confirmar_v1 | cd39f9fe93514420976263d13856c17c |
| public.rpc_programar_os_v1 | e374f0ba1698b37523b890dc91682eaf |
| public.tg_recalc_planning_from_entrega | 9f7c032ef8df2cae0097b8a24ee4016f |
| public.trg_entrega_sync_partner_order_fn | e8fb9e9512db8d1cfb801e37f63ee497 |
| public.update_updated_at_column | b1930ed5bca3be839f783c6202ab8147 |
| public.validate_estoque_entrada | 9e24938a8d716a02ba023c9fb7ce24e9 |
| public.validate_estoque_reserva | 9bdbd6bc6fc957993bbdff466db6ef22 |

## Proveniência dos anexos

- scripts/delivery-finance-a2-20261028/live-functions.json
- scripts/stock-envase-recovery-20261027/live/catalog.json
- scripts/os-delivery-reopening-20261027/live/definitions.json

Funções do pedido/crédito/fiscal não presentes nestas capturas não recebem hash inventado; seus registros externos e consumidores estão no relatório principal. Antes de implantação o auditor deve recapturar catálogo/policies/grants por canal canônico verificável.

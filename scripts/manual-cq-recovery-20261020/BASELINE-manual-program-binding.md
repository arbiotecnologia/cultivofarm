# Baseline LIVE conferida — 20/10 13:13 UTC

Proprietário confirmou reprodução no schema hosted atual: transação authenticated claims B permitiu zerar `programacao_producao.ordem_servico_id` e depois alterar `lotes.volume_produzido` para 101; ROLLBACK, nada persistido, conforme recibo independente. Não é uma execução ou certificação pelo agente.

Proprietário confirmou aplicação de `manual_program_binding_containment`: OLD.ordem_servico_id não NULL e lote(programacao_id=OLD.id) proíbem alteração id/ordem_servico_id/ordem_servico_onfarm_id/organization_id/produto_id/microrganismo_id, com 42501 MANUAL_PROGRAM_BINDING_IMMUTABLE, sem escape. Recibo: seis mutações negadas, update inócuo permitido, lote direto negado, ROLLBACK; volume100/vínculoOS original preservados.

Leitura SELECT no Supabase canônico confirmou marcador `swzpzcwiasxmjutrmvkm`, corpo, owner postgres, SECURITY DEFINER com search_path vazio e ACL `{postgres=X/postgres}`. Hash pg_get_functiondef `7c168ffa9393207fb3388c9546c19d05`. Trigger `aa_manual_program_binding_v1`, BEFORE UPDATE FOR EACH ROW, habilitado O, tgtype19, função `platform_private.guard_manual_program_binding_v1()`. Hash agregado de triggers `3cd248f967d379787235709a45a8f4e8` confirmado pela mesma leitura.

PRE/POST/rollback exigem corpo/hash/owner/ACL, definição exata do trigger e agregado LIVE (excluindo somente o trigger CQ adicionado no POST/rollback). A função e seu trigger não são definidos, removidos ou substituídos na montagem. Snapshot em `live-test-fixtures/` serve exclusivamente ao PostgreSQL descartável. Histórico vulnerável continua em fixtures históricas somente para reprodução antes da instalação local da contenção LIVE.

Montagem local retomada, não liberação para implantação: gate CQ false, revisão independente integral e homologação real continuam pendentes. Nenhum DDL/DML hosted/deploy/publicação/sessão pelo agente. A leitura de catálogo não certifica o fluxo CQ A/B.
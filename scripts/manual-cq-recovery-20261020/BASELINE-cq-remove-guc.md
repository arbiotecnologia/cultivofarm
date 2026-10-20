# Baseline implantada — não reaplicar

Migração `cq_remove_guc_definer_bypass`, aplicada pelo proprietário no Supabase canônico `swzpzcwiasxmjutrmvkm`, 20/10/2026 02:45 UTC.

| Função | MD5 pg_get_functiondef atual | ACL |
|---|---|---|
| public.fn_cq_autoria_servidor() | 329913a20fa9284bd794a034ca4cdfd0 | {postgres=X/postgres,service_role=X/postgres} |
| public.fn_cq_resultado_imutavel() | 1ffd8093e77aa56a8814ed6e292ef299 | {postgres=X/postgres,service_role=X/postgres} |

Leitura somente confirmou ref, owner postgres, corpos sem escape e ACLs. Recibo do proprietário: reprodução authenticated transacional anterior; após migração UPDATE finalizado negado inclusive GUC=on, rollback concluído, nenhum CQ fictício persistiu. Não confundir com homologação do fluxo CQ completo.

O pacote CQ exige estes hashes em PRE, POST e pós-rollback, sem alterar estas funções. Snapshots atuais preservados em rollback e cq-integrity.sql.review; corpos vulneráveis segregados em historical-test-fixtures somente para testes descartáveis. Nenhum purge, implantação ou alteração de sessões executado pelo agente.
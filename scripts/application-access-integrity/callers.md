# Callers — catálogo produção lido SELECT-only 19/10

- `platform_private.storage1_application_allowed(text,text)` MD5 fa4f590bec955e4a254a906fbda82e20: leitura de Storage de evidência chega ao helper. Corrigir helper não altera bucket/path/policies.
- `public.can_user_access_arquivo(text,uuid)` MD5 1e83ee139ec2badd52195aa4e31843a3: autorização indireta de arquivo; nenhuma reabertura.
- `platform_private.storage2_salvar_aplicacao_legacy_closed(uuid,jsonb,uuid,jsonb,uuid[])` MD5 bd546d19ae6598ba0db5837b83ef398d: referência em corpo legado fechado, não executar nem conceder EXECUTE.
- Policies `aplicacoes_select_scoped`, `aplicacao_evidencias_select_scoped`, `aplicacao_evidencias_vinculos_select_scoped`, `aplicacao_emails_select_scoped` usam helper sobre id/aplicacao_id.
- Frontend PDF/card consulta aplicação/evidências autenticadas; não chama helper como substituto da RLS.

Busca de catálogo textual não certifica SQL dinâmico/global. Origem auditada: FK aplicações→manual/onfarm; manual→cliente/organization; onfarm→cliente (sem organization_id). Helpers RLS de cliente podem ter atalhos internos: esta candidata verifica diretamente existência/tenant do cliente persistido, sem confiar nesse atalho como prova de origem.
Preflight completo deve revisar ACL dos callers e policies atuais; MD5 acima é inventário, não guarda aplicada sobre funções que não são modificadas.
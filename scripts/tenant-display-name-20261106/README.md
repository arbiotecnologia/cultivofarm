# TENANT_DISPLAY_NAME_V1 — candidato revisável (NÃO aplicado)

Motivo: `org_onboarding_state()` em produção só devolve organization_id/nome ao ADMIN; demais perfis ficavam sempre neutros.

Conteúdo:
- `public.tenant_display_name_v1()` — SECURITY DEFINER, search_path vazio, guard canônico `platform_private.h15_actor_organization()` (perfil ativo, acesso pronto/sem senha provisória ou convite em processamento, organização ativa). Retorna somente `{contract, organization_id, name}`. EXECUTE só `authenticated`.
- Delta mínimo em `platform_private.b2b_commercial_partner_projection()`: acrescenta `seller {organization_id, name}` do commercial owner apenas quando a cadeia `permitted` já existente aprovou; demais chaves inalteradas; ACL preservada.
- Pins de produção capturados read-only em 06/11 (ref swzpzcwiasxmjutrmvkm, PG 17.6): h15 `64e10608`, access_ready `048249c0`, projeção `ebd6bf6f`, wrapper `730a1748`; ACL da projeção `postgres,authenticated,service_role`. Pós-pin da projeção `350c34b6` (calculado e reproduzido em PG 17.11 local; confirmar em 03-post após instalação).

Arquivos: `01-pre.sql.readonly`, `02-install.sql.review`, `03-post.sql.readonly`, `04-rollback-deny.sql.review` (gerados por `generate.py`).

Teste: `python3 test-local-pg.py` → `evidence-local-pg.json` PASS (30 checks): corpos capturados reproduzem os pins; pre/install/post OK; reexecução aborta; nome para admin, consultor, financeiro, cliente e comprador de A ("AR Bio") e usuário de F ("FSF Agro"); negados perfil inativo, senha provisória, convite em processamento, organização inativa, sem perfil, anon e sessão sem sub; sem campos sensíveis; projeção dá `seller` AR Bio ao comprador permitido, `null` ao vínculo revogado, nunca o nome do parceiro comprador, demais chaves idênticas; rollback restaura o corpo exato e nega. Costuras sintéticas declaradas — não é prova JWT/RLS hospedada.

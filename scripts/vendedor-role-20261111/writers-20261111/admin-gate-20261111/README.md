# Gate administrativo da carteira do Vendedor (02d) — somente revisão

Ordem: 02a → 02b → 02c → **01d PRE → 02d INSTALL → 03d POST**; reversão: 04d (exige estado candidato exato, restaura corpos 02b/02c e ACL medidos, preserva atribuições/auditoria).
Gerado por `generate.py` (medido no espelho); testado por `test_admin_gate_pg.py` executando os bytes do `manifest.json`.

- Administrador: `h15_actor_organization` (empresa ativa, perfil ativo, acesso pronto) = empresa do papel administrador, sem vínculo externo; reavaliado após as travas.
- Atribuir: parceiro do tenant ativo e não excluído (`SELLER_PORTFOLIO_PARTNER_INVALID`), vendedor ativo, exclusivo, sem vínculo externo (`SELLER_PORTFOLIO_SELLER_INVALID`); outro tenant segue `FORBIDDEN` (sem oráculo).
- Travas: perfis (ordem por user_id) → papéis → parceiro. Desativação concorrente espera ou vence e a revalidação nega. Papel conflitante inserido em paralelo não é travável por linha: `seller_commercial_actor` continua negando no uso.
- Revogar/listar/visão: só admin vigente; revogação não valida alvo.
- Achado: o 02b já negava admin com acesso suspenso (has_role exige access_ready); a falha real era empresa inativa, parceiro inativo/excluído e vendedor com papéis combinados.

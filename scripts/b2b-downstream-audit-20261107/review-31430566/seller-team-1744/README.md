# Escopo da equipe vendedora — revisão 02c23d82

**Status: INATIVO / NÃO APROVADO.** Pacote exclusivamente local para revisão; nenhuma operação hospedada, publicação, NF, cobrança, envio ou aprovação contábil foi realizada.

## Correção candidata

- `request_b2b_payment_terms_adjustment_secure`, `approve_b2b_payment_terms_secure` e `reject_b2b_payment_terms_secure` deixam de usar o leitor de comprador `b2b_phase1_order_visible`.
- O novo helper privado `platform_private.b2b_seller_financial_scope_error(uuid,uuid)` exige ator autenticado e readiness canônico; perfil e organização ativos; papel interno `administrador`, `financeiro` ou `gestor_comercial`; `partner_accounts.commercial_owner_organization_id` igual à organização do ator; parceiro ativo/não excluído; e feature `pedidos_b2b`.
- Superadmin e qualquer mistura com `parceiro_b2b`, `parceiro_b2b_tecnico`, `cliente_produtor` ou `superadmin` são negados. Não há desvio especial para Superadmin.
- O positivo não exige `organizations.partner_account_id` nem `partner_users`. A fixture legítima usa `organizations.partner_account_id=NULL` e zero vínculos `partner_users` para os três papéis internos.
- Os três writers reautorizam depois do lock do pedido, preservam `C2_ACCOUNTING_PENDING` e exigem condição associada ao mesmo pedido. Não houve alteração do leitor comprador, grants, B3, fiscal, cobrança ou gates contábeis.

## Hashes do candidato

- Instalação `02-install.sql.review` SHA256: `dc7fe58de129c0133e2a032c69efc79f300352eedbf88c9120b74def16490035`.
- Request MD5: `1698b9355688d0068246292cbe652a79`.
- Approve MD5: `20fa5eee63ab89fe56cf46b4f9fe01a2`.
- Reject MD5: `b1ee789f30e5612a4cd1c27f9dda578f`.
- Helper MD5: `c46617ec2a1320c9c05e3da33af8a350`.
- O helper pertence a `postgres` e não tem EXECUTE para `PUBLIC`, `anon`, `authenticated` ou `service_role`.

## Evidência local

`test-exitcode.txt = 0`; **175/175**, sem somar baterias históricas. Todos os **38 gatilhos reais** permaneceram habilitados durante as chamadas.

Cobertura executada em PostgreSQL descartável:

- PRE/POST, deriva de corpo/owner/ACL, determinismo do gerador e pacote sem GRANT.
- Positivo C2 validado para administrador, financeiro e gestor comercial em request, approve e reject, sem vínculo comprador e sem Superadmin.
- Negação de Superadmin, administrador+B2B e administrador+cliente nas três operações.
- FSF/tenant estrangeiro, comprador sem papel, pedido ausente, condição ausente e condição de outro pedido.
- `C2_ACCOUNTING_PENDING` preservado nas três operações; o shape proibido por `c2_external_origin_assert` continua negado.
- Revogações durante lock de papel, perfil, senha provisória/readiness, convite, owner comercial, organização, parceiro e feature; approve/reject também exercitados.
- Replays sem duplicar condição, controles no registro legado, histórico preservado e rollback deny-only, inclusive helper sem EXECUTE de cliente.

Arquivos: `decision-candidates.json`, `test-output.txt`, `test-stderr.txt`, `test-exitcode.txt`, `key-results.txt`, `manifest.json`, `generator.diff`, `test.diff` e `package/`.

## Limites e revisão exigida

Auth, schema e parte dos vínculos são costuras sintéticas declaradas no JSON. O PASS comprova somente o componente no PostgreSQL descartável; não prova JWT/RLS/Storage/PostgREST/browser nem elegibilidade de uma conta hospedada.

Antes de qualquer decisão de instalação, o auditor deve conferir independentemente os corpos, owners, ACLs e relações LIVE e homologar os vínculos ARBio e sessões reais. Este documento não aprova implantação.

# Achado LIVE de escopo — 07/11 16:38 UTC

**Status: INATIVO / NÃO APROVADO / NÃO IMPLANTADO.** Esta revisão não autoriza instalação. O SQL candidato não mudou: MD5 `7eb3b5be33552f6bd4eecd56796502ed`.

## Capturas confrontadas

Os corpos locais executados têm exatamente os MD5 relatados pelo auditor como LIVE:

| Função | MD5 |
|---|---|
| `platform_private.b2b_phase1_partner_visible(uuid,boolean)` | `915f516e605af7cc14584e2e762a2661` |
| `platform_private.b2b_actor_scope(uuid)` | `c3f2997746f24bc2efd15db5c0ccc862` |
| `platform_private.platform_actor_access_ready(uuid)` | `048249c0c2106c3761e26eacb8d0de84` |

Não foi necessário inventar stub para essas três funções. Isso confirma somente a correspondência entre os MD5 relatados e as capturas locais; não é uma nova leitura LIVE. Os demais corpos, owners e ACLs continuam sujeitos à conferência independente do auditor.

## Semântica vendedor versus comprador

- Para interno não superadmin, `b2b_phase1_partner_visible` exige `profile_ok AND partner_valid AND org_partner=p_partner` de `b2b_actor_scope`.
- O positivo interno comum desta matriz usa `organizations.partner_account_id`, com `partner_accounts.commercial_owner_organization_id` coerente com a organização do ator. Não se deduz autorização apenas de `commercial_owner_organization_id`.
- Administrador, financeiro e gestor comercial são atores comuns, sem superadmin e sem papel externo. O superadmin não é mais usado como positivo de elegibilidade.
- `partner_users` único não foi promovido a caminho de admin vendedor. Na composição capturada, sua validação chama `is_valid_b2b_partner_user`, que exige papéis externos e rejeita papel administrativo. O controle admin+parceiro sem vínculo da organização foi negado por `b2b_phase1_scope_denied`.
- FSF sintético é administrador comum com vínculo próprio organização→parceiro; mesmo assim foi negado no pedido de ARBio, tanto validado quanto legado.

## Resultado executado

`../../test-adjustment-candidate.py`: **76/76, exit 0**, PostgreSQL descartável, stderr vazio. Evidência: `adjustment-candidate.json`, `stdout.txt`, `stderr.txt` e `exitcode.txt`.

1. Administrador, financeiro e gestor comercial com caminho interno sintético coerente solicitaram ajuste **somente no legado**. São controles de código, não prova de que qualquer admin ARBio hospedado esteja elegível.
2. No pedido externo validado, os três papéis passaram pelo escopo, mas foram negados pelo gatilho real com `C2_EXTERNAL_ORIGIN_DENIED`; pedido, termos, auditoria e notificações permaneceram íntegros. Não se contornou o gatilho e não se declara positivo validado.
3. C2 `pending→pending` continuou negado por `C2_ACCOUNTING_PENDING`, sem efeitos.
4. Comprador sem papel financeiro/administrativo continuou negado por `unauthorized`.
5. Revogações durante lock cobriram papel, perfil inativo, senha provisória, vínculo organização-parceiro, convite `processing`, `access_valid_after` posterior ao JWT `iat` e feature `pedidos_b2b`; todas negaram sem efeitos.
6. PRE/POST/rollback, 14 dependências reais capturadas, owners/ACLs, 38 gatilhos e ausência de novos grants foram preservados.

## Limite decisivo

O resultado **não aprova implantação nem prova produção**. Elegibilidade real do vendedor ARBio exige sessão real e vínculos LIVE válidos, com reteste do comprador, FSF e pendência contábil pelo auditor. O positivo legado é sintético; o externo validado não tem positivo. Auth por GUC, `auth.jwt`, esquema, vínculos, assinatura e features continuam costuras locais, sem JWT/RLS/PostgREST/Storage.

A evidência anterior 60/60 foi preservada em `../historical-60/` e não deve ser usada como justificativa de instalação. Nenhuma operação hospedada, publicação, NF/cobrança, aprovação contábil, envio ou delegação ocorreu.

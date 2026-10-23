# Correção da lacuna de cadastro — candidato integral INATIVO

## Escopo corrigido
- Mesmo formulário `Configuracoes`, sem segundo cadastro: três perfis externos cumulativos, parceiro ativo da empresa do ator e cliente principal. Empresa vem da sessão; não há escolha cross-tenant nem campo de autoridade no payload.
- Produtor exclusivo sem parceiro preservado. Clientes selecionados reconsultados integralmente, separados da paginação, com ao menos uma fazenda ativa visível no mesmo tenant por cliente; pending/error retiram a prova local. Claim/finish continuam responsáveis pela autoridade, locks, vigência e recibo real.
- Payload envia `roles` e `external_roles` idênticos, sem alias singular `role`, senha, tenant, autorização de fazenda ou papéis internos. Edge coordenada rejeita alias contraditório/duplicado antes do claim/Auth; fluxo de receipt/finish/compensação intocado.
- Edição de produtor sem parceiro oferece seleção de parceiro no editor canônico. Confirmação única resolve `assign`/`revoke_roles` a partir do conjunto final; comandos desvincular/reativar não alteram a seleção implicitamente.
- Lock síncrono e fence de ator/tenant preservados. Payload de recibo incerto não pode ser alterado com mesma chave; troca do tipo bloqueada após tentativa. Sucesso confirmado renova chave; resposta tardia de tenant antigo não é adotada.

## Execuções locais em 23/10
- `bun run test --config scripts/contracts-c2-20261022/integral/frontend/vitest.config.ts`: **128/128**, 14 arquivos.
- Página real candidata: **15/15** em `Configuracoes.integration.test.tsx`; cadastro cumulativo e técnico exclusivo, produtor sem parceiro, ausência de perfil/parceiro/fazenda, erro de vínculo, transição interno→externo, double submit/retry idêntico/payload alterado, troca tenant pendente, edição cumulativa/revogação, CAS/releitura, produtor existente sem parceiro, erro e resposta tardia de edição.
- `tsgo -p .../integral/frontend/tsconfig.json`: zero erros nas 20 cópias.
- `deno test --allow-env .../coordinated/edge/create-user/index_test.ts`: **13/13**, incluindo alias, produtor exclusivo e compensação exata; `deno check` PASS.
- SQL: instalação SHA256 `57f6fa35252f82ad2176ada5837e6ce50b900d8f9e1462f6aee669b0a65f3bb6`; rollback `4305ec72aa234649a78e7269cd0839bc39c6ef03db24b1655050179d4fa86ac6`, ambos inalterados. 49 checks PostgreSQL preservados como evidência anterior, não nova execução.
- Diff focado em `frontend/registration-review.patch`; manifesto fixa baselines e hashes das 20 cópias. Edge permanece fora do runtime `supabase/functions`.

## Limitações exatas
1. jsdom monta Configurações real, mas Auth/RPC/Storage são doubles explícitos; não certifica navegador, JWT, RLS, Auth nem fluxo A/B hosted. Nenhuma conta/fixture real criada.
2. Editor lifecycle só trabalha com parceiro escolhido/existente. Atribuição de produtor exige vínculos `user_clientes` existentes; não administra criação/transferência desses vínculos, fazendas ou assignments técnicos. Novo cadastro produtor usa claim/finish para seus vínculos.
3. Editor de dados comuns legado só suporta gestor B2B exclusivo/produtor exclusivo; técnico exclusivo e combinações seguem somente lifecycle, sem editar nome/telefone por contrato novo não revisado.
4. Preflight LIVE fresco, postflight, montagem/implantação integral, homologação de RLS dos leitores cliente/fazenda, revogação no navegador e primeiro acesso continuam a cargo da revisão independente. A réplica anterior tem limitações estruturais descritas no README.
5. Não há expiração individual `valid_until` B2B nova. Direitos internos, financeiro/documentos não auditados, fiscal e sessões reais não foram ampliados.
6. Build do runtime pela plataforma não valida o bundle candidato inativo. Nenhum SQL, deploy Edge, promoção `src` ou publicação neste turno; rollback deny-only preservado.
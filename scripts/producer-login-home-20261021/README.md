# Login produtor caindo em /acesso-pendente — candidata, NÃO publicada

Base: publicado a82c82d5 (bundle index-XMyZEuFT.js). Real: produtor A (perfil ativo, `cliente_produtor`) → /acesso-pendente; "Atualizar acesso" não resolve.

## Causa comprovada
`/app/login` (MobileLogin) com usuário sempre envia a `/selecionar-portal`. `get_my_available_portal_contexts` enumera só
admin/b2b/technical (produtor = lista vazia, correto no servidor). SelecionarPortal tratava lista vazia como "sem acesso" →
`/acesso-pendente`; AcessoPendente também só resolvia esses 3 contextos. `safeHome`/AuthRoute já documentam produtor → `/app`.

## Correção mínima (3 arquivos, sem rota/permissão/SQL/dados/contexto novo)
- `useAvailableContexts`: `producerHome = "/app"` SOMENTE com `ready` (perfil ativo, tenant, papéis carregados e
  `authzReady`/`checkAuthzAccess` do monitor produtor já provado por `producerContextProbe`), papel `cliente_produtor`,
  leitura de contextos concluída sem erro/refetch e lista vazia. Sem nova consulta nem probe.
- SelecionarPortal: lista vazia → `producerHome ?? "/acesso-pendente"`; produtor fica dentro do AuthzEpochBoundary existente (pausa/negação canônicas).
- AcessoPendente: mesma regra (corrige "Atualizar acesso").
- `/app` continua guardado por MobileLayout + monitor/RLS. Produtor + técnico real segue o fluxo anterior.

## Testes (AuthProvider/gates/probe reais, transporte simulado)
`src/test/config/producerLoginHome.integration.test.tsx`: antes 4 FAIL/7 PASS (`before.txt`), depois 11/11 (`after.txt`).
Negativas: sem vínculo, RLS vazio, tenant divergente no h15, sem papel, inativo; indisponibilidade de contextos e de probe
não geram acesso-pendente nem /app; Retry recupera. Carga: 1 leitura de contextos, 1 probe. Baterias config/clientes/navegação/multiportal: 1242/1242. Typecheck OK.
Não é homologação real.

## Rollback
`python3 scripts/producer-login-home-20261021/rollback.py` (verifica hashes). Preserva retomada/renovação e XML isolado.

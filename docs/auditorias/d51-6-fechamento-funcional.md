# D51.6 — Fechamento funcional multi-tenant

## Decisão

- Homologação de segurança: **PASS**.
- Homologação funcional multi-tenant: **PASS**.
- Avanço da auditoria horizontal: **LIBERADO**.

## Gate 1 — Storage

- `consultor-arquivos` foi classificado como mídia técnica sensível e está privado.
- Novos objetos usam caminho iniciado pelo `organization_id` da sessão ativa, derivado do perfil autenticado.
- Policies de leitura, inclusão, alteração e exclusão exigem perfil ativo, organização e papel operacional permitido.
- O bucket estava vazio; portanto, não houve conteúdo legado a migrar nem inferência de proprietário.
- `clientes-docs`, `financial-docs`, `financial-reports` e `financial-receipts` permanecem privados.
- `logos` permanece público apenas para identidade visual global no prefixo reservado `platform/`.

## Gate 2 — Prova A/B autenticada

- Execução canônica com quatro identidades temporárias: administradores Tenant A e B, usuário inativo e Superadmin sem organização.
- As identidades A e B autenticaram com sessões reais via Auth.
- Resultado: **46/46 verificações PASS**.
- Cobertura: usuários/perfis/papéis; clientes, fazendas e talhões; Portal; contas a receber; ordens de serviço; configuração e documentos fiscais; dashboards/RPCs fail-closed; e Storage `consultor-arquivos`, `clientes-docs`, `financial-docs`, `financial-reports` e `financial-receipts`.
- Em cada superfície aplicável: A acessou A; A não leu nem escreveu B; IDs e paths de B foram recusados; URL pública direta e signed URL cruzada falharam; usuário inativo e Superadmin sem vínculo ficaram fail-closed.
- Tokens A e B mantiveram contextos distintos.

## Reparos encontrados pela prova

- O gerador de parcelas passou a propagar `organization_id` do título.
- O validador financeiro compartilhado passou a ler somente os campos existentes em cada tabela, mantendo a checagem da cadeia de ownership.
- O gatilho de risco financeiro foi restrito à tabela de parcelas e continua inacessível diretamente a usuários.

## Cleanup

- Executor temporário removido do projeto e do Supabase.
- Contas Auth, perfis, papéis, vínculos, clientes, fazendas, talhões, títulos, parcelas, ordens, notas e objetos temporários removidos.
- Verificação final por marcador exclusivo: **zero resíduos** em Auth, tabelas operacionais e Storage.
- Nenhum cliente real, documento real, emissão fiscal ou operação produtiva foi acionado.

## Gate 3 — Validações

- Testes focados de Storage e isolamento sistêmico: **11/11 PASS**.
- Typecheck: **PASS**.
- Build automático: **PASS**.
- Scanner Supabase: nenhum P0/P1; dez informações de baseline fora do escopo D51.6.
- Linter Supabase: 467 achados preexistentes; nenhum novo achado atribuído às correções.
- Suíte global: excedeu o limite de 600 segundos; o log parcial contém falhas de infraestrutura/baseline não relacionadas (mock do cliente Supabase e testes Deno executados pelo Bun), sem falha D51.6.
- Smoke passivo da prévia protegida: HTTP 401, conforme esperado sem sessão.

## Rollback e forward-fix

- Rollback de aplicação: reverter os consumidores para caminhos anteriores não é recomendado, pois reabriria paths sem escopo de empresa.
- Rollback de banco: restaurar as funções anteriores também não é recomendado, pois reintroduziria falhas de inserção e validação financeira.
- Forward-fix: manter buckets privados, paths tenant-scoped e corrigir qualquer novo consumidor somente pela derivação server-side da organização.

## Riscos residuais

- O baseline do linter continua com funções `SECURITY DEFINER` amplamente executáveis e proteção contra senhas vazadas desativada; não foram introduzidos por D51.6.
- Relatórios/RPCs já classificados sem ownership determinístico continuam fail-closed, por decisão de segurança anterior.
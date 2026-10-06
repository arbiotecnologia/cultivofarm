# Fechamento das pendências da auditoria multiplano

## Objetivo
Fechar as 5 pendências com fixtures fictícias `AUDIT_PLAN_20261006_FINAL`, limpeza comprovada por hash/contagem e sem deploy, cobrança ou publicação do DRAFT real.

## Pré-condições (fail-closed)
- Tirar o snapshot/hash do estado real antes de qualquer mutação: 1 DRAFT, 0 PUBLISHED, 5 assinaturas sem versão, 0 overrides, contagens de organizações/perfis/papéis/auditoria e usuários Auth.
- As identidades Auth só serão criadas por uma Edge Function administrativa temporária (`audit-fixture-identities`), restrita ao Platform Superadmin e ao prefixo da fixture, usando `auth.admin.createUser/deleteUser` no servidor. Senhas aleatórias ficam só em memória e são devolvidas uma única vez em resposta no-store para o harness local.
- Se o harness não conseguir obter sessão para essas identidades (preview `external_unmanaged`), a Fase B será marcada como BLOCKED e todo o restante continua.

## Fase A — fixtures
- 4 organizações fictícias, cada uma com versão PUBLISHED de teste e assinatura ACTIVE com os snapshots aprovados (Base 1, Essencial 2, Gestão 5, Completo 17). Os campos técnicos serão copiados do DRAFT real.
- Perfis com papéis reais do enum: Base `administrador` + `producao`; Essencial `gestor` + `financeiro`; Gestão `tecnico_agronomo` + `gestor_comercial`; Completo `administrador` + `administrativo`.
- Todas as linhas criadas serão registradas em uma tabela de manifesto em `platform_private` para permitir uma limpeza determinística.

## Fase B — UI autenticada
- Playwright local (`/tmp/browser`, credenciais apenas em variáveis efêmeras) contra localhost, para cada identidade, em desktop 1280 e mobile 390:
  - sidebar permitido/negado;
  - rota permitida;
  - URL direta negada mostrando "Fora do plano";
  - interceptação de rede provando que não há consulta às tabelas da rota negada;
  - estados loading/erro.
- A evidência registrará apenas plano, papel e rota, sem e-mail ou token.

## Fase C — concorrência
- Script Deno/Node com dois clientes Supabase independentes (sessões distintas do Superadmin fixture ou duas conexões) e barreira `Promise.all`:
  - publicar o mesmo DRAFT de teste com chaves diferentes;
  - publicar com a mesma chave;
  - criar/encerrar override com a mesma chave e com payload divergente.
- Verificação: uma versão, um registro de auditoria, conflito seguro, nenhum deadlock.
- Se faltar um Superadmin fixture (papel de plataforma não criável sem tocar dados reais), usar duas sessões `run_sql` em paralelo com `pg_advisory` e marcar o grau de prova.

## Fase D — rotas e portais
- Inventariar `src/App.tsx`, a sidebar e os guards especializados.
- Mapear em `featureRouteMap` apenas correspondências inequívocas a features reais (ex.: rotas de visita/agenda do portal técnico → `visitas_tecnicas`, pedidos/simulador do portal parceiro → `pedidos_b2b`/`simulacoes`), aplicadas como condição adicional nos guards existentes, antes das queries.
- Registrar as lacunas sem feature real.
- Atualizar os testes de mapa, sidebar, guard e portais.

## Fase E — Auth security
- Consultar o plano e a configuração Auth via Management API/advisor.
- Leaked password protection só afeta novos cadastros e trocas de senha, mas exige plano Pro+.
- Entregar diagnóstico READY/BLOCKED e rollout, sem alterar Auth de produção automaticamente.

## Limpeza e validação
- Remover os usuários Auth via admin API, as organizações/versões/assinaturas/overrides/perfis/auditoria fixture pelo manifesto, a Edge Function temporária e os arquivos com segredo.
- Reconferir as contagens/hash pré = pós.
- Rodar os 62+ testes, typecheck, ESLint focado, scanner de segredos e build, e consultar os advisors.
- Atualizar `roadmap.md`/`AGENTS.md` só com fatos comprovados.

## Riscos
- As linhas de auditoria append-only podem ter triggers que impedem a remoção. Nesse caso, a fixture afetada não será criada e o subteste ficará BLOCKED.

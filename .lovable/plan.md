## Objetivo

Produzir documentação atualizada e completa do AR Bio Manager em **dois arquivos consolidados** (cada um autocontido, fácil de exportar/imprimir), gerados a partir do código real — navegação, rotas, permissões, hooks, RPCs, Edge Functions e feature flags — e não de suposições.

## Entregáveis

1. `docs/MANUAL-DO-USUARIO.md` — manual de usabilidade, linguagem de negócio.
2. `docs/REFERENCIA-TECNICA.md` — referência técnica, linguagem de engenharia.

Os documentos históricos de fases (`fiscal-fase3-*`, `comunicacao-*`, `reformulacao-*` etc.) **não serão alterados**; ambos os novos arquivos apontam para eles como histórico.

## Conteúdo — Manual do Usuário

- Visão geral do sistema e glossário (OS, lote, CQ, envase, talhão, protocolo, B2B, on-farm).
- Acesso: login, recuperação, acesso pendente, seleção de portal, comportamento do administrador (acesso total sem seletor).
- Perfis e o que cada um enxerga: administrador, gestor, técnico agrônomo, produção, administrativo, cliente/produtor, parceiro B2B.
- Um capítulo por área da navegação, seguindo `src/config/navigation.ts`:
  Dashboard (Geral / Executiva / Operacional) · Comercial e Relacionamento · Campo e Assistência Técnica · Produção On-Farm · Financeiro · Financeiro B2B · Inteligência e Controle · Administração.
- Em cada capítulo: para que serve, quem acessa, passo a passo das ações principais, campos obrigatórios, validações comuns e erros frequentes.
- Processos ponta a ponta (fluxos que atravessam telas):
  visita técnica → recomendação → OS → PCP → produção → CQ → envase → estoque → entrega → confirmação → finalização;
  solicitação do produtor → triagem → atendimento;
  pedido B2B → simulação → reserva de estoque → faturamento;
  ciclo fiscal (perfis → rascunho → prontidão, com emissão desligada);
  notificações e Central de Notificações.
- Apps mobile: consultor (registro offline, sincronização, FAB) e produtor.
- Configurações administrativas passo a passo, incluindo a aba Comunicação (SMTP, WhatsApp, modo de teste, e-mail de teste).

## Conteúdo — Referência Técnica

- Stack, estrutura de pastas e convenções.
- Ambientes: staging `ar-bio-temp` e produção `ar-bio`, com a regra de que produção não recebe alterações sem autorização explícita.
- Mapa de rotas × guards × permissões (`src/lib/permissions.ts`, `AppLayout`, `AppPortalGuard`, portais).
- Módulos: componentes, hooks e RPCs que cada um consome.
- Módulo de Comunicação: tabelas, publisher/resolver/expansor, outbox e worker, adapters (e-mail, WhatsApp, in-app), DLQ e replay, observabilidade, webhook de status.
- Módulo Fiscal: perfis, rascunho, prontidão, certificados, SINIEF, trava de emissão.
- Feature flags (`src/config/featureFlags.ts` + variáveis `VITE_*`) e estado atual de cada uma.
- Edge Functions (as 20+ em `supabase/functions/`): propósito, autenticação e efeitos colaterais.
- Segurança: RLS, `has_role`, tabela de papéis separada, grants, exportação CSV blindada.
- Qualidade: como rodar typecheck, build, Vitest e Playwright; pastas de teste.
- Índice do histórico de fases em `docs/` e `restoration/`.

## Método

1. Varredura de leitura sobre `src/config/navigation.ts`, `src/lib/permissions.ts`, `src/App.tsx`, `src/pages/**`, `src/features/comunicacao/**`, `supabase/functions/**` e `src/config/featureFlags.ts`.
2. Consulta somente-leitura ao staging para confirmar nomes reais de RPCs/tabelas citados.
3. Redação dos dois arquivos.
4. Referência cruzada a partir do `README.md` (apenas dois links no índice).

## Notas técnicas

- Nenhuma migration, deploy, mudança de flag ou alteração de código de aplicação. Trabalho exclusivamente documental (arquivos `.md` + links no README).
- Nenhum segredo, DSN, token ou credencial aparece nos documentos.
- Funcionalidades desligadas por flag serão documentadas explicitamente como "existente, porém desabilitada".

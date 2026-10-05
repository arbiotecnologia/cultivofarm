# D52 — Ciclo de vida da assinatura SaaS

## Objetivo
Fechar o ciclo interno de assinatura por empresa no Supabase canônico, preservando dados e histórico, sem cobrança externa real e sem reabrir D51.

## Diagnóstico inicial
- O modelo atual possui planos, funcionalidades, assinatura, overrides e histórico, mas não possui versões imutáveis de plano, cobrança SaaS, webhook de pagamento ou job de expiração.
- As cinco assinaturas vivas têm `trial_ends_at` nulo; três estão em `TRIAL`, uma em `ACTIVE` e uma em `SUSPENDED`.
- A alteração de assinatura atual permite qualquer estado canônico por ação manual, sem matriz formal de transições, snapshots ou idempotência de evento.
- `PAST_DUE` mantém acesso integral e não existe carência configurada.
- O gate de tela libera durante erro/carregamento; o gate de escrita ignora usuários autenticados sem organização.
- Limites existem no catálogo, mas não são aplicados na criação de recursos.
- Não há integração de pagamento SaaS habilitada. Conforme a política da plataforma, nenhum código de cobrança externa será criado antes da ativação dessa integração.

## Execução A→I

### A. Modelo versionado e histórico
- Criar versões imutáveis de plano com preço, moeda, ciclo, limites e vigência.
- Vincular cada assinatura à versão contratada e persistir snapshots comerciais sem recalcular documentos históricos.
- Ampliar o histórico append-only com estado/plano anterior e novo, origem, motivo, correlação e referência opcional de evento.
- Preservar linhas existentes; legado sem versão continuará identificável e bloqueado para mudanças comerciais até regularização explícita.

### B. Máquina de estados e trial
- Reutilizar o enum atual e formalizar transições permitidas, sem enum paralelo.
- Fixar trial novo em 14 dias; início/fim serão imutáveis fora de uma extensão exclusiva de Superadmin, com motivo e auditoria.
- Criar processamento idempotente para expirar trials vencidos e aplicar suspensão conforme a política sem apagar dados.
- Impedir renovação indevida de trial, reativação implícita e transições terminais inválidas.

### C. Autorização e mutações
- Substituir a mutação genérica por rotinas server-side específicas, com Superadmin validado, lock, organização existente e idempotência.
- Tenant continuará somente leitura da própria assinatura, limites e histórico permitido.
- Nenhum identificador de organização recebido do navegador autorizará ação tenant; `service_role` permanecerá exclusivo do servidor.

### D. Pagamento desacoplado
- Como pagamentos ainda não estão habilitados, não será implementado gateway, checkout ou cobrança real.
- Definir apenas o contrato de domínio e o estado `PAYMENT INTEGRATION BLOCKED`, sem simular confirmação em produção.
- A continuação do gateway exigirá ativação de Payments no chat interativo do Lovable; depois serão adicionados webhook assinado, `event_id` único e conciliação idempotente.

### E. Entitlements e limites
- Tornar leitura e escrita fail-closed quando a resolução de assinatura estiver indisponível, vencida, suspensa, cancelada ou expirada.
- Remover o bypass de usuário autenticado sem organização nos gates SaaS.
- Aplicar limites server-side somente às funcionalidades com métrica determinística já existente; ausência de medidor ficará fail-closed, sem inventar contagem.
- Downgrade preservará dados excedentes e bloqueará somente novas criações, registrando a pendência.

### F. Interface
- Painel da plataforma exibirá versão, vigência, trial, situação efetiva e ações válidas conforme a transição atual.
- “Meu Plano” mostrará trial, vigência, limites e bloqueio de forma somente leitura.
- Não haverá botão de pagamento enquanto a integração não estiver habilitada.

### G. Homologação controlada
- Criar fixtures temporárias marcadas para duas empresas e identidades de homologação, com limpeza integral.
- Cobrir trial, expiração, suspensão, reativação manual auditada, cancelamento, upgrade, downgrade, limites, exceção, tenant sem mutação, cross-tenant e histórico.
- Casos de pagamento/webhook serão marcados `BLOCKED`, não simulados como sucesso, enquanto Payments não estiver habilitado.

### H. Validação operacional
- Conferir estado vivo de RLS, funções, grants, triggers, jobs e índices.
- Executar testes focados, suíte global, typecheck, build, scanner, linter/advisors e smoke autenticado A/B sem cobrança externa.
- Não publicar automaticamente; implantação de funções internas e migrations ocorrerá somente no projeto canônico.

### I. Fechamento
- Atualizar roadmap e relatório D52 com evidências mascaradas, riscos, rollback e forward-fix.
- Decisão separada: segurança, ciclo interno e pagamento externo.
- D52 completo só poderá receber `PASS funcional` após Payments ser habilitado e o fluxo real de pagamento ser homologado; até lá, pagamento ficará `NO-GO/BLOCKED` sem enfraquecer o restante.

## Premissas e limites
- Banco exclusivo: `swzpzcwiasxmjutrmvkm`.
- Nenhuma cobrança, webhook externo ou ação real de produção será executada.
- Nenhum dado existente será apagado, e ownership, preço ou vigência não serão inferidos.
- A política atual não define carência; portanto, não será criada uma carência implícita.
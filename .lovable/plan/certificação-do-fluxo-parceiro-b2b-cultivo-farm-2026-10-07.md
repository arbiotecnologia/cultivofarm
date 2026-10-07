# Certificação do fluxo Parceiro B2B — Cultivo Farm

## Resultado esperado
Completar e certificar o fluxo existente de Catálogo → Simulação → Pedido → Aprovação → Produção → Contas a Receber → NF-e → Entrega, com documentação de transporte integrada à entrega. Não criar portais, rotas ou cadastros paralelos.

## Diagnóstico inicial confirmado
- Ambiente canônico confirmado: produção `swzpzcwiasxmjutrmvkm`; consultas de leitura realizadas pela ferramenta Supabase. O comando de diagnóstico do Lovable recusou acesso ao backend externo e não foi usado como alternativa de escrita.
- `tg_auto_b2b_receivable` captura falhas e grava `financeiro_auto_falhou`, sem retentativa nessa função.
- `generate_b2b_receivable_secure` possui lock consultivo; a implementação usa condições vinculadas ao pedido e o vínculo financeiro existente. Há índice único de recebível **ativo** por pedido; cancelamento e reprocessamento precisam preservar o histórico sem produzir cobrança duplicada.
- A implementação financeira continua executável por `authenticated` e usa `auth.uid() IS NULL` como chamada de sistema. Isso exige auditoria de autorização/tenant antes de qualquer reuso ou expansão; ausência de usuário não será prova suficiente de privilégio.
- `fiscal_invoices` tem vínculos com pedido/recebível/entrega e índices de idempotência, mas as políticas consultadas não incluem leitura por parceiro B2B.
- Existem políticas `public` em entregas, parceiros e simulações. Sua normalização será feita apenas após verificar permissões efetivas e os acessos públicos intencionais; não confundir várias políticas permissivas com proteção de tenant.
- Buckets `fiscal-xml`, `fiscal-certificates` e `entrega-documentos` são privados. A auditoria de todas as políticas e dos caminhos ainda precisa ser concluída.
- Os roteiros antigos de homologação encontrados apontam para ambientes proibidos. Não serão executados, adaptados em silêncio ou usados como prova do estado atual.
- Os cenários A/B/C ponta a ponta, a interface autenticada e a concorrência real ainda **não foram executados**. Não há certificação concedida nesta auditoria inicial.

## Execução em fases
### Fase 1 — Roteiro e certificação A/B/C
1. Completar inventário vivo de rotas, hooks, RPCs, triggers, constraints, RLS, grants, Storage e funções fiscais. Comparar definições aplicadas com o código, sem tratar migrations antigas como prova do runtime.
2. Criar roteiro automatizado exclusivo do canônico, com guarda de destino, fixtures reproduzíveis dentro de transação, rollback obrigatório, hashes/contagens antes e depois e evidências sanitizadas por cenário. Impedir efeitos externos; não disparar e-mail, emissão ou transmissão.
3. Cobrir A (gestor, aprovação/transportadora), B (gestor, entrega/carga própria) e C (técnico). Provar parceiro/empresa/cliente/título/entrega forjados, catálogo, snapshots, preços e cart_hash, conversão, idempotência, crédito, aprovação, produção e financeiro.
4. Distinguir simulações técnicas de simulações financeiras. Garantir que C não veja preços, condições, pedidos, crédito ou documentos financeiros, mesmo por chamada direta.
5. Registrar fiscal/transporte como FAIL ou BLOCKED quando ainda não implementados: CT-e recebido e decisão MDF-e não serão simulados como funcionalidade certificada.
6. Corrigir nesta fase apenas defeitos comprovados necessários à matriz A/B/C, com migrations mínimas quando indispensáveis; repetir as provas após a correção.

**Gate da Fase 1:** relatório de resultados individuais PASS/FAIL/BLOCKED, zero resíduos, isolamento comprovado e limites explícitos. Esta rodada de execução começa e termina na Fase 1; as demais seguem a regra do projeto de autorização específica por fase.

### Fase 2 — Confiabilidade financeira
- Reutilizar geração, condições e vínculos canônicos; fechar acesso direto indevido à implementação e validar organização, parceiro, pedido e perfil no servidor.
- Implementar registro transacional de trabalho financeiro pendente, retries com backoff, lease/lock, tentativas limitadas, reconciliação e reprocessamento autorizado. A fila de Comunicação não será convertida em motor financeiro nem ativará entregas externas.
- Alerta interno sem segredos; nunca recalcular snapshots comerciais. Resolver divergência entre faturamento integral e entrega parcial por gate seguro até existir política aprovada.
- Provar falha/retry, parcelas, cancelamento/histórico e concorrência sem duplicar título.

### Fase 3 — NF-e integrada
- Criar rascunho idempotente a partir de recebível B2B elegível no módulo fiscal existente, com vínculos e itens derivados no servidor.
- Reutilizar preflight, perfis, certificado, cálculo, XML e reconciliação; testar contratos e falhas sem transmissão fiscal real.
- Gate server-side de expedição quando NF-e for obrigatória: ausência de autorização válida bloqueia. Obrigatoriedade desconhecida também bloqueia e vira pendência.
- Parceiro apenas consulta documentos explicitamente liberados, com projeção mínima; técnico não acessa dados fiscais financeiros. Não conceder emissão, edição ou cancelamento ao parceiro.

### Fase 4 — Transporte e linha do tempo
- Acrescentar “Documentação de transporte” à entrega atual: modalidade, responsável, participantes, identificação, RNTRC quando aplicável, motorista/veículo, placa/UF, origem/destinos e notas transportadas.
- Receber CT-e modelo 57 de terceiro: validar XML, chave, autorização, participantes e referências NF-e; armazenar privado com hash e auditoria. XML importado sozinho não prova autorização; sem prova confiável, manter pendente.
- Carga própria não exige CT-e por padrão. Decisão MDF-e depende de modalidade/UF/trajeto e fundamento fiscal aprovado; desconhecido permanece fail-closed.
- Emissão própria CT-e permanece OFF. Usar estruturas específicas de transporte apenas se os contratos NF-e existentes forem incompatíveis; compartilhar auditoria e vínculos, sem duplicar pedidos/títulos/entregas.
- Linha do tempo nas telas atuais do parceiro e bloco interno da entrega, sem margem, tributação interna ou análise de crédito.

## Detalhes técnicos e segurança
- Fontes: `partner_accounts`, `partner_simulations`, `partner_orders`, `partner_order_payment_terms`, `partner_order_financial_links`, `accounts_receivable`, `fiscal_invoices`, `entregas`.
- Consumidores a evoluir após inventário: `src/hooks/usePartnerCatalog.ts`, `usePartnerSimulations.ts`, `useSimulateB2BPaymentPlan.ts`, `useCreatePartnerOrder.ts`, `useB2BFinanceiro.ts`, `useFiscalDocuments.ts`, páginas atuais de pedidos/simulações e componentes atuais de entrega.
- Autorização server-side por usuário, perfil ativo, organização e vínculo do recurso; grants mínimos e RLS fail-closed. Cores privados somente quando necessários, sem endpoint paralelo ou `service_role` no navegador.
- Toda tabela pública nova terá grants explícitos, RLS e políticas coerentes na mesma migration. Mudanças de esquema somente pela ferramenta de migration no canônico comprovado; histórico e documentos protocolados não podem ser apagados.
- Auditoria: ator/perfil/organização/parceiro/pedido/título/nota/entrega/documento, antes/depois, motivo, idempotência, tentativa, códigos sanitizados e hashes; não gravar tokens ou segredos.
- Prova SQL com claims locais não equivale a autenticação HTTP. Teste autenticado real e concorrência multi-conexão terão resultados separados; quando impossíveis sem persistir fixtures, registrar BLOCKED sem usar contas reais arbitrariamente.

## Validação e entrega
- Testes focados e suíte, lint focal/global com distinção de dívida preexistente, verificações automáticas de tipos/build, scanner e advisors atuais de segurança/performance.
- Desktop/mobile por navegador nas telas afetadas; emissão e produção fiscal permanecem desligadas.
- Relatório por fase: antes/depois, arquivos, migrations/rollback, matriz RLS/Storage/RPC, evidências individuais A/B/C, contagens, resíduos, pendências contador/UF e GO/NO-GO.
- GO apenas para partes efetivamente comprovadas; NO-GO para certificação ponta a ponta enquanto qualquer requisito crítico permanecer FAIL/BLOCKED. Nenhuma publicação do app automática.
# Fase 2 — versão comercial revisável e fundação segura de pagamentos

## Resultado desta rodada
Evoluir o painel e o modelo SaaS existentes para preparar, validar e publicar versões comerciais reais sem preencher valores por inferência; em paralelo, criar uma fundação provider-agnostic de pagamentos totalmente não operacional. A prova positiva continuará bloqueada até existir entrada comercial real e assinatura real versionada.

## 1. Versão comercial DRAFT → PUBLISHED → ARCHIVED
- Estender `saas_plan_versions` minimamente com estado explícito, revisão, trial configurável, chave idempotente e metadados de arquivamento, preservando as versões existentes e a compatibilidade das leituras atuais.
- Criar RPCs `platform_*` transacionais para salvar/validar/publicar/arquivar, sempre derivando o ator de `auth.uid()` e exigindo Platform Superadmin no servidor.
- Congelar preço, moeda, ciclo, trial, limites e funcionalidades no momento da publicação; publicação repetida retorna o mesmo resultado e concorrência não duplica versões.
- Manter versões publicadas imutáveis; correções comerciais criam nova versão. Arquivamento não apaga histórico.
- Normalizar grants ao menor privilégio compatível com RPCs `SECURITY INVOKER`, mantendo RLS e tickets transacionais.

## 2. Painel Plataforma
- Reutilizar a gestão SaaS existente e adicionar cadastro/edição de rascunho com campos comerciais vazios por padrão.
- Exibir pendências reais por campo, snapshot de funcionalidades e confirmação explícita antes de publicar.
- Desabilitar publicação enquanto preço, moeda, ciclo, vigência, trial, limites, funcionalidades, motivo ou confirmação estiverem incompletos.
- Prevenir duplo envio e refletir estados de salvamento, validação, publicação e arquivamento.

## 3. Fundação provider-agnostic de pagamentos — OFF
- Criar estruturas isoladas para clientes externos, contratos, eventos recebidos, tentativas, reconciliação, outbox e auditoria append-only, sem misturar planos B2B ou o histórico SaaS.
- Aplicar grants explícitos, RLS sem acesso direto de usuário, validações por trigger quando temporais e funções internas com privilégios mínimos.
- Implementar contratos TypeScript e adaptadores simulados determinísticos; nenhuma credencial, checkout, endpoint público funcional ou chamada externa.
- Manter feature flag desligada e ingestão disponível apenas para testes internos; eventos duplicados e fora de ordem não alteram fatos confirmados.

## 4. Provas e documentação
- Cobrir autorização, RLS, idempotência, concorrência, rollback, imutabilidade, duplicidade, ordem inválida, assinatura simulada inválida, retry e reconciliação.
- Rodar testes focados, typecheck, lint focado, scanner de segredos, build automático e advisors disponíveis.
- Documentar Mercado Pago x Stripe para o Brasil com fontes oficiais, sem inventar taxas, mantendo a decisão em ADR pendente quando faltar dado comercial.
- Atualizar relatório em 17 seções, roadmap, rollback/forward-fix, arquivos exatos e decisões separadas.

## Limites e decisões
- Supabase exclusivo: `swzpzcwiasxmjutrmvkm`; nenhum dado comercial vivo será criado ou alterado nesta rodada.
- Publicação comercial: IMPLEMENTED/READY somente se todas as provas estruturais passarem; prova positiva seguirá BLOCKED/NO-GO.
- Pagamentos: FOUNDATION READY somente se testes passarem; cobrança real seguirá OFF/NO-GO.
- Não habilitar Lovable Payments: este projeto usa Supabase externo, incompatível com essa integração gerenciada, e a solicitação é somente a fundação desligada.
- Não avançar para a próxima fase do produto.

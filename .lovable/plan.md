# Pós-D52 — Prova comercial positiva e fundação de pagamentos

## Objetivo
Auditar o estado comercial vivo, obter prova positiva somente com dados reais e, após esse gate, preparar uma fundação de pagamentos desacoplada sem ativar cobrança.

## Fases

### 1. Auditoria viva e Gate A
- Conferir no Supabase canônico planos, versões, funcionalidades, assinaturas, snapshots e auditoria, sem escrita.
- Contabilizar de forma sanitizada versões por estado e assinaturas legadas/versionadas por estado.
- Mapear campos comerciais obrigatórios, constraints, índices, triggers, RLS, grants e funções privilegiadas.
- Distinguir publicação do aplicativo de versão comercial `PUBLISHED`.
- Criar relatório pós-D52 e classificar o Gate A: prova já disponível, rascunho real publicável ou `BLOCKED/NO-GO` por dados reais ausentes.

### 2. Publicação comercial segura, somente se necessária
- Reutilizar o modelo e painel de Plataforma existentes, sem fluxo paralelo.
- Publicar apenas rascunho completo via Platform Superadmin validado no servidor, com idempotência, lock, snapshot e auditoria imutável.
- Mostrar pendências comerciais reais na interface e impedir publicação incompleta ou concorrente.
- Não criar nem inferir preços, moeda, periodicidade, trial, limites ou funcionalidades.

### 3. Prova comercial positiva
- Com versão real publicada e assinatura real versionada, validar contexto e funcionalidades como tenant autenticado.
- Comprovar item liberado no menu e por acesso direto, além do isolamento A/B e da resistência à forja de organização.
- Manter `BLOCKED` se não houver dados reais completos; não fabricar fixtures comerciais.

### 4. Fundação de pagamentos, cobrança desligada
- Comparar Mercado Pago e Stripe para o Brasil sem inventar taxas.
- Modelar armazenamento provider-agnostic, fatos imutáveis, webhooks idempotentes, conciliação, reembolso/disputa, auditoria e fila.
- Criar somente estruturas, contratos, adaptadores simulados e testes; manter feature flag OFF e nenhum checkout, credencial, webhook operacional ou cobrança real.

### 5. Fechamento e próxima fase
- Atualizar roadmap e relatório com evidências, arquivos, riscos, rollback/forward-fix e decisões separadas.
- Só identificar e executar um incremento da próxima fase se a prova comercial positiva estiver em `PASS` e houver nova autorização.

## Validação
- Testes focados de banco, RLS, funções e interface; typecheck, lint focado, build, scanner e advisors.
- Evidências sem identidades, tokens, endereços de rede ou outros identificadores sensíveis.

## Limites
- Usar exclusivamente `swzpzcwiasxmjutrmvkm` e preservar dados e histórico.
- Não ativar cobrança, criar credenciais, alterar dados comerciais reais ou publicar o aplicativo automaticamente.
- Executar uma fase por vez; esta rodada começa e termina na Fase 1/Gate A.
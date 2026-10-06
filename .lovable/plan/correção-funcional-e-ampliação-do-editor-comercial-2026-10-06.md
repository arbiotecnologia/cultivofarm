# Correção funcional e ampliação do editor comercial

## Escopo e segurança
- Trabalhar somente no Supabase canônico `swzpzcwiasxmjutrmvkm` e no editor comercial.
- Preservar o DRAFT real, assinaturas, tenants, preços, ciclos, vigência e snapshots atuais.
- Não publicar versão comercial, aplicativo ou pagamentos.
- Provas de publicação serão não mutantes ou integralmente revertidas.

## 1. Diagnóstico e contrato de publicação
- Consolidar definição, permissões, tickets, locks, gatilhos e validação das RPCs de salvar/validar/publicar.
- Registrar a tentativa recente como sem evento correlacionável nos logs, sem inventar erro.
- Reproduzir o contrato de publicação em teste transacional reversível e verificar idempotência, autorização e estado final.
- Tratar como causas comprovadas a divergência de motivo (frontend e RPC exigem 5, checklist aceita 1) e qualquer falha adicional demonstrada pelo teste.

## 2. Motivo mínimo compartilhado
- Criar `MOTIVO_MIN_LENGTH = 2` em utilitário comercial compartilhado pelo editor e seus testes.
- Aplicar `trim` e a mesma regra no checklist, botões, handlers e mensagens; nunca falhar silenciosamente.
- Ajustar, por migration forward-only, as RPCs de salvar e publicar para aceitar exatamente o mesmo mínimo e persistir o motivo normalizado.

## 3. Catálogo global no editor
- Remover de `availableFeatures` o filtro por `saas_plan_features`; manter somente módulos ativos e funcionalidades ativas elegíveis para comercialização, incluindo a compatibilidade legada já aprovada.
- Exibir todos os módulos ativos, inclusive os vazios, preservando busca, filtro de selecionadas e contadores.
- Ajustar a validação server-side do DRAFT para usar o mesmo catálogo global, sem backfill nem alteração de `saas_plan_features`.
- Manter seleção independente por plano no respectivo DRAFT/snapshot; mostrar não concede entitlement.
- Preservar dependências, confirmação em lote e limites derivados somente das funcionalidades selecionadas.

## 4. Publicação segura no frontend
- Exigir DRAFT, baseline idêntico, validação completa/válida, motivo com 2 caracteres, `PUBLICAR` exato e nenhuma operação pendente.
- Bloquear duplo clique e preservar a chave de publicação no retry; renovar apenas após sucesso ou alteração comercial.
- Em sucesso, recarregar versões antes de confirmar o resultado e limpar apenas a confirmação.
- Em erro, preservar formulário/confirmação e mostrar mensagem segura e acionável.

## Validação e evidências
- Cobrir motivos vazio/1/2/espaços/Unicode, catálogo global por plano, isolamento de seleção, seleção individual/módulo/todas, dependências, limites, gate, retry e regressões de moeda/data/fingerprint.
- Executar prova server-side transacional com rollback, não-superadmin, idempotência, RLS A/B e invariância dos entitlements.
- Rodar Vitest focado, `tsgo`, ESLint focado, scanner de segredos e build.
- Confirmar ao final quantidades de DRAFT/PUBLISHED/assinaturas e registrar causa, arquivos, migration, consumidores, riscos e forward-fix.

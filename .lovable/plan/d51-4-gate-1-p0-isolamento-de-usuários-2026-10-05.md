# D51.4 — Gate 1 P0: isolamento de usuários

## Objetivo
Eliminar o vazamento cross-tenant em Configurações → Usuários, sem executar onboarding ou auditoria horizontal.

## Execução
1. Revalidar o Supabase canônico e inventariar RLS/RPCs/Edges e consultas das seis fontes do Gate 1.
2. Corrigir somente bypasses que permitam listar, ler ou alterar usuários fora da organização derivada server-side de auth.uid().
3. Manter Superadmin fora do fluxo operacional e impedir sua atribuição.
4. Remover leituras globais e garantir cache/deep-link vinculados à identidade e organização atuais.
5. Executar matriz A/B completa com rollback, cobrindo leitura, edição, status, senha, criação, papéis, deep-link e cache.
6. Validar testes focados/globais, typecheck, build, linter/advisors, scanner, deploy das Edges necessárias e smoke.
7. Registrar migrations, rollback, evidências e decisão Gate 1 PASS/NO-GO; parar sem iniciar Gates 2 ou 3.

## Limites
- Preservar dados e histórico; fixtures apenas transacionais e sem lixo.
- Não alterar onboarding, módulos horizontais, comunicação ou flags.
- Não confiar em organization_id enviado pelo navegador.

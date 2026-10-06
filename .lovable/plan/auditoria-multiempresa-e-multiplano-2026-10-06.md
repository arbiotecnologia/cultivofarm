# Auditoria multiempresa e multiplano

## Objetivo

Comprovar que Base, Essencial, Gestão e Completo mantêm snapshots independentes e que cada empresa recebe somente a interseção entre RBAC e os entitlements da versão publicada vinculada. Nenhuma publicação comercial, cobrança ou implantação será feita.

## Execução

1. **Fechar o inventário read-only**
   - Mapear RPCs, tabelas, triggers, constraints, grants, RLS, histórico, overrides e todos os consumidores de entitlement, inclusive `saas_has_feature`.
   - Mapear sidebar, rotas diretas, guards, estados de carregamento/erro e a interseção RBAC + plano.
   - Registrar contagens e hashes do estado comercial inicial sem expor PII.

2. **Montar a matriz reversível A/B/C/D**
   - Reutilizar somente planos, módulos, features e campos técnicos já existentes.
   - Criar quatro organizações/atores/versões/assinaturas fictícios com prefixo `AUDIT_PLAN_20261006` dentro de uma única transação.
   - Aplicar seleções distintas: Base mínimo; Essencial com módulo adicional; Gestão ampliado não total; Completo com as 17 features.
   - Registrar as feature keys escolhidas apenas por cobertura de teste e desfazer tudo com `ROLLBACK`.

3. **Provar contratos server-side**
   - Verificar independência dos snapshots, dependências, catálogo elegível, feature inválida/inativa e módulo vazio real quando existir.
   - Testar DRAFT, PUBLISHED não vinculada, ACTIVE/TRIAL, expirada/cancelada/suspensa/sem versão, feature negada, troca de plano e imutabilidade histórica.
   - Testar overrides GRANT/REVOKE, precedência, tenant correto, auditoria, idempotência e tentativa concorrente controlada.
   - Executar matriz RLS com claims locais de atores reais ou fictícios, incluindo forja de organização, sem vínculo, outro tenant e Platform Superadmin.

4. **Validar RBAC e interface**
   - Cobrir os papéis reais aplicáveis sem criar significado comercial novo: feature nunca amplia papel e papel nunca contorna plano.
   - Exercitar sidebar e URL direta para permitido/negado, incluindo loading, vazio, erro e sem permissão em desktop e mobile.
   - Usar sessão autenticada real somente se o ambiente a disponibilizar; qualquer cenário impossível será marcado `UNVERIFIED`, sem simulação indevida.

5. **Corrigir apenas falhas comprovadas**
   - Consolidar qualquer consumidor divergente no resolvedor canônico por migration forward-only.
   - Preservar `SECURITY INVOKER` nas APIs públicas, `search_path` seguro, autenticação server-side, grants mínimos, RLS, snapshots e auditoria.
   - Não ampliar acesso `anon`, não criar fluxo paralelo e não alterar o DRAFT real.

6. **Certificar e restaurar**
   - Confirmar rollback e igualdade do estado antes/depois por hashes e contagens.
   - Rodar testes focados, typecheck, lint focado, scanner de segredos e build.
   - Atualizar `roadmap.md` e `AGENTS.md` somente com resultados comprovados.

## Critérios de parada

- Qualquer mutação fora da transação, divergência do projeto Supabase canônico ou impossibilidade de restaurar interrompe a prova afetada.
- Publicação real, deploy e pagamentos permanecem bloqueados.
- A ausência de sessão autenticada real bloqueia apenas a prova visual correspondente; as demais provas continuam.

## Entrega

Matriz empresa × plano × features × perfis, falhas e correções, migrations/arquivos, evidências SQL/RLS/RBAC/UI, hashes antes/depois, estado vivo final, riscos e decisão GO/NO-GO por plano e global.
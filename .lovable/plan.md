# Gate D51.1 — fechamento técnico antes do E2E

## Objetivo
Eliminar os bloqueios técnicos remanescentes do D51 sem criar usuários, enviar e-mails, processar pedidos, publicar o aplicativo ou iniciar o E2E.

## Execução

1. **Reconciliar o ledger sem reaplicar SQL**
   - Capturar a definição canônica de colunas, constraints, índices, policies, grants e funções das duas migrations D51.
   - Comparar semanticamente com os arquivos versionados e registrar evidências antes/depois.
   - Usar somente o repair oficial do histórico se a equivalência for integral e a ferramenta estiver disponível; caso contrário, manter bloqueio P1 explícito, sem inserir linhas manualmente.

2. **Corrigir os seis contratos da suíte global**
   - Substituir baselines de migrations congelados por invariantes que aceitem novas migrations válidas e detectem sobreposição, quebra de ledger ou artefato não reconciliado.
   - Manter `verify_jwt=false` apenas em allowlist explícita de funções que validam `Authorization` e JWT internamente; o teste continuará falhando para qualquer exceção nova não auditada.
   - Atualizar o manifesto repo-only somente após fechar a reconciliação canônica.

3. **Triar e corrigir advisors D51/SaaS**
   - Identificar nominalmente os dois grants públicos e as funções authenticated ligadas aos fluxos SaaS.
   - Classificar autorização interna, `search_path`, origem de tenant e uso de metadata.
   - Aplicar apenas os revokes/guards mínimos para P0/P1 comprovados, preservando chamadas legítimas.

4. **Proteção de senha vazada**
   - Verificar se existe mecanismo oficial disponível para habilitação segura.
   - Habilitar e validar apenas se suportado; caso dependa do Dashboard, documentar o passo manual exato sem contorno.

5. **Certificação e relatório**
   - Executar typecheck, build, suíte Vitest completa e focada, testes Deno, linter, grants e chamadas negativas sem JWT/JWT inválido.
   - Criar `docs/auditoria-d51-1-fechamento.md` com evidências, correções, migrations/repair, rollback/forward-fix, riscos e decisão objetiva.

## Limites
- Nenhuma conta, e-mail, pedido ou dado operacional real será criado ou alterado.
- Nenhum SQL já aplicado será reaplicado e nenhuma linha será inserida manualmente no ledger.
- Nenhum deploy/publicação do aplicativo; mudanças remotas ficam restritas a migrations/grants/configuração de segurança indispensáveis e oficialmente suportadas.
- O trabalho termina no D51.1, antes do E2E e do D52.

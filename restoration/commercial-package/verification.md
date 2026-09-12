# Simulador e Condições — verificação local

- Implementação local, sem acesso a banco, publicação ou aplicação de migration.
- Migration pendente: `20261027000000_commercial_simulator_hardening_v1.sql`.
- Nenhum dado HML/FaseE alterado ou criado.
- Teste focado: `bun run test -- src/test/comercial/commercial-package.test.tsx`: 38/38 aprovados (rodada final, 2026-09-12 UTC).
- Regressão CAT-09/10: 17/17 aprovados.
- Typecheck/build: NÃO certificados; o log automático contém erros de contratos ausentes. O arquivo gerado `types.ts` possui 2.060 linhas (baseline esperado: 21.850).
- Configuração gerenciada local não corresponde ao destino canônico. Arquivos gerados protegidos preservados; nenhum teste conectado ou navegação da aplicação foi realizado.
- Não executar manualmente build/typecheck neste ambiente: executados pelo harness automático.

## Arquivos funcionais
- src/pages/comercial/SimuladorComercial.tsx
- src/hooks/useCommercial.ts
- src/lib/comercial/validation.ts
- src/pages/comercial/CommercialPaymentPlansPage.tsx
- src/components/comercial/AtribuicoesPlanosTab.tsx
- src/components/comercial/MatrizConfiguravelTab.tsx
- src/test/comercial/commercial-package.test.tsx
- supabase/migrations/20261027000000_commercial_simulator_hardening_v1.sql

## Gate de aplicação
NO-GO enquanto configuração gerenciada/tipos não forem reconciliados e compilação e smoke autenticado não forem aprovados no destino autorizado.
A busca de chamadores encontrou apenas o hook legado de runtime, agora removido, além de definições SQL históricas e teste de inventário preservados.
A migration aborta se a assinatura canônica estiver ausente ou houver dependência registrada/textual da legada. Revoga todas as permissões públicas e service_role sem DROP. Antes de aplicar, exportar ACL/proconfig e verificar consumidores externos, jobs e dependências dinâmicas não visíveis no repositório; rollback exige restauração exata desse backup.
Não há prova de execução ou privilégio efetivo no servidor; o contrato de migration é estático.

## Ajuste final — 2026-09-12
- Migration renomeada com timestamp `20261027000000` (posterior à maior versão existente `20261026000000`), conteúdo SQL preservado. Nenhuma migration histórica renomeada.
- Elegibilidade exige atribuição publicada, datas válidas, vigência inclusiva por dia e parceiro selecionado. Escopo parceiro exige correspondência e ausência de customer; default exige ambos os destinatários nulos. Planos continuam restritos à RPC de planos selecionáveis; plano apenas ativo não basta.
- Contrato local: publicação de assignment permite default; proibição de default_scope_not_publishable pertence às linhas da matriz, não às atribuições. Servidor permanece autoridade final.
- Removido bloqueio de navegação por parâmetros. aria-invalid cobre parceiro, plano, item, quantidade, volume e vencimento.
- Erros usam conditionErrorMessage; retorno desconhecido é substituído por mensagem segura, sem texto técnico bruto.
- Teste focado real: 1 arquivo, 38 testes aprovados, 0 falhas.
- Typecheck/build completos não certificados: log automático mantém erros de contratos ausentes; types.ts continua com 2.060 linhas e configuração de ambiente divergente do destino autorizado.
- Restauração de types.ts/.env bloqueada pela instrução do ambiente que proíbe editar esses arquivos gerados. Não foi mascarada a falha nem declarado build limpo. Execução manual de build/typecheck também é vedada neste ambiente; validação cabe ao harness automático.
- Nenhuma conexão, acesso ao banco, aplicação SQL, publicação ou alteração de HML/FaseE realizada.

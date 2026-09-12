# Simulador e Condições — verificação local

- Implementação local, sem acesso a banco, publicação ou aplicação de migration.
- Migration pendente: `20261027000000_commercial_simulator_hardening_v1.sql`.
- Nenhum dado HML/FaseE alterado ou criado.
- Teste focado: `bun run test -- src/test/comercial/commercial-package.test.tsx`: 24/24 aprovados.
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

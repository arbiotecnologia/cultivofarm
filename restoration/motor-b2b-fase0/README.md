# FASE 0 — Motor Unificado de Preços e Condições Comerciais B2B

Artefatos de auditoria (somente leitura) da Fase 0.

- Relatório completo: [`docs/motor-b2b-fase0-auditoria.md`](../../docs/motor-b2b-fase0-auditoria.md)
- `capture-rpc-snapshot.sql` — consulta read-only que devolve o corpo vigente das 10 RPCs
  do motor comercial já no formato `CREATE OR REPLACE FUNCTION`, servindo como script de
  rollback exato para a Fase 1.

## Regras do ambiente

- Executar **apenas** em staging `ikaauvsflpmamgxmkhoq`.
- Produção `navfzbwgwzruipouyfnk` é proibida nesta fase.
- Nenhum arquivo aqui aplica alterações: são consultas de leitura e documentação.

## Ordem recomendada na Fase 1

1. Rodar `capture-rpc-snapshot.sql` e salvar a saída como `rollback-rpcs-<AAAAMMDD>.sql` nesta pasta.
2. Só então aplicar a migration da Fase 1.
3. Em caso de reversão, executar o arquivo de rollback salvo no passo 1.

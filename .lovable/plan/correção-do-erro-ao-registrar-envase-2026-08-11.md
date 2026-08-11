# Correção do erro ao registrar envase

## Causa raiz (verificada no staging ikaauvsflpmamgxmkhoq)

O motor `rpc_cockpit_registrar_envase_v1` grava, ao criar as entradas de estoque, duas movimentações com os rótulos `entrada_envase_reservado` e `entrada_envase_livre`.

A tabela `estoque_movimentacoes` tem a restrição `estoque_movimentacoes_acao_valida`, que aceita apenas este vocabulário canônico:

```text
entrada, reserva, cancelamento_reserva, expedicao, estorno_expedicao,
entrega, descarte, ajuste, edicao, perda, devolucao, consumo, transferencia
```

Como `entrada_envase_*` não está na lista, o banco rejeita o INSERT e toda a transação do envase é abortada — daí a mensagem `new row for relation "estoque_movimentacoes" violates check constraint "estoque_movimentacoes_acao_valida"`.

Fatos confirmados: `rpc_cockpit_registrar_envase_v1` é a única função do banco que usa esses rótulos; a tabela `estoque_movimentacoes` está hoje sem nenhuma linha, portanto não há histórico com o vocabulário divergente; existe o gatilho `trg_estoque_mov_append_only` (ledger imutável) sobre a tabela.

## Correção proposta

### 1. Banco (migration, somente staging)

Alinhar o motor ao vocabulário canônico em vez de afrouxar a restrição:

- Substituir `entrada_envase_reservado` por `acao = 'entrada'` com `status_novo = 'reservado'` e observação "Entrada de envase reservada para a OS".
- Substituir `entrada_envase_livre` por `acao = 'entrada'` com `status_novo = 'disponivel'` e observação "Excedente de envase para estoque livre".
- Nenhuma outra linha da função é alterada: quantidades, cálculo de reservado/livre, regra de encerramento (`completed`/parcial com alçada de gestor) e avanço da esteira permanecem idênticos.
- Trava de ambiente fail-closed no topo da migration (bloqueio da produção `navfzbwgwzruipouyfnk` + exigência do marcador de staging), no mesmo padrão das migrations recentes.
- Script de rollback correspondente em `restoration/`.

Motivo da escolha: a distinção reservado x livre já é totalmente representada por `status_novo` (`reservado` / `disponivel`) e pelo vínculo com a OS, então não é preciso criar novos rótulos nem mexer no ledger append-only nem em consumidores de BI.

### 2. Interface

- Mapear no dicionário de erros do cockpit as violações de restrição do estoque para uma mensagem clara ("Não foi possível registrar a movimentação de estoque do envase"), em vez de expor o texto cru do Postgres no toast.

### 3. Validação

- Harness SQL: executar o envase da OS travada (lote LT-2026-0001, 10 L, Bombona 5L x2) e conferir que são criadas a linha de `estoque_produto` reservada para a OS e a movimentação `entrada` correspondente, com a esteira avançando para Estoque / Reserva.
- Teste unitário do mapeamento de erro novo.
- Regressão completa: `tsgo`, `vitest`, `build`.

## Restrições respeitadas

- Nenhuma alteração na produção `navfzbwgwzruipouyfnk`; migration aplicada apenas em `ikaauvsflpmamgxmkhoq`.
- Sem publicação; sem alteração de rotas, permissões ou dependências.

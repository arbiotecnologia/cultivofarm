export default function Index() {
  return <body>FASE 1 — REMEDIAÇÃO CRÍTICA DO FLUXO PÓS-ENVASE DA OS AR BIO

Execute exclusivamente no staging Supabase `ikaauvsflpmamgxmkhoq`.

PRODUÇÃO `navfzbwgwzruipouyfnk` É PROIBIDA.

Não publicar.
Não transmitir SEFAZ.
Não alterar conexão.
Não criar módulo, rota, tabela ou fluxo paralelo.
Preservar todas as funcionalidades existentes.

OBJETIVO

Desbloquear com segurança o trecho:

ENVASE → ESTOQUE/RESERVA → ENTREGA → CONFIRMAÇÃO

corrigindo duas incompatibilidades confirmadas entre RPCs de estoque e a constraint `estoque_movimentacoes_acao_valida`.

CAUSAS RAIZ JÁ CONFIRMADAS NA AUDITORIA

1. `rpc_cockpit_confirmar_entrega_v1` utiliza ação de estoque `baixa_entrega`, que não pertence ao vocabulário aceito por `estoque_movimentacoes_acao_valida`.

2. `rpc_cockpit_cancelar_reserva_v1` utiliza `estorno_reserva`, que também não pertence ao vocabulário aceito.

A constraint atualmente aceita o vocabulário canônico existente, incluindo:

entrada
reserva
cancelamento_reserva
expedicao
estorno_expedicao
entrega
descarte
ajuste
edicao
perda
devolucao
consumo
transferencia

NÃO ampliar a constraint apenas para acomodar nomes divergentes sem justificativa arquitetural.

PRINCÍPIO DA CORREÇÃO

Alinhar as RPCs ao vocabulário canônico já existente no sistema, evitando criar novas ações redundantes.

ANTES DE ALTERAR

1. Audite novamente no banco real de staging as definições ATUAIS de:

- rpc_cockpit_confirmar_entrega_v1
- rpc_cockpit_cancelar_reserva_v1
- rpc_avancar_esteira_laboratorio
- _rpc_avancar_esteira_laboratorio_internal
- estoque_movimentacoes_acao_valida

2. Confirme semanticamente qual ação corresponde a cada transição.

Para cancelamento de reserva, a candidata esperada é:

`cancelamento_reserva`.

Para confirmação/saída relacionada à entrega, avaliar a semântica atual de:

`expedicao`

versus

`entrega`.

Não alterar automaticamente sem conferir como os consumidores, BI, ledger e estoque interpretam os dois eventos.

3. Localize todos os consumidores dos valores de `acao` antes da alteração.

IMPLEMENTAÇÃO

Criar uma NOVA migration incremental, com timestamp posterior às migrations atuais.

A migration deve:

- possuir trava fail-closed de ambiente;
- abortar explicitamente se detectar produção;
- exigir marker válido do staging `ikaauvsflpmamgxmkhoq`;
- ser idempotente;
- possuir rollback correspondente;
- preservar SECURITY DEFINER;
- preservar `SET search_path = public, pg_temp`;
- preservar grants atuais legítimos;
- revogar PUBLIC/anon quando aplicável;
- manter validação de `auth.uid()` e papéis existentes.

Corrigir `rpc_cockpit_cancelar_reserva_v1` para utilizar a ação canônica correspondente a cancelamento de reserva.

Corrigir `rpc_cockpit_confirmar_entrega_v1` para utilizar a ação canônica correta para a movimentação de saída/entrega, conforme o significado real confirmado no schema.

NÃO alterar quantidades, cálculos, reservas, vínculos ou status sem necessidade.

IDEMPOTÊNCIA

Revisar ambas as RPCs para garantir que repetição da mesma requisição não:

- duplique movimentação;
- desconte estoque novamente;
- libere reserva duas vezes;
- crie eventos duplicados;
- avance a OS duas vezes.

Se não houver proteção suficiente, implementar a proteção mínima necessária dentro da mesma RPC, preferencialmente com lock transacional/advisory lock e verificação do estado atual.

TESTE FUNCIONAL OBRIGATÓRIO

Executar somente no staging.

Sempre que houver alteração de dados durante o teste, usar:

BEGIN;
...
ROLLBACK;

Testar:

CENÁRIO A
OS/envase com estoque reservado
→ confirmar entrega
→ movimentação aceita
→ estoque/status coerentes
→ OS avança corretamente.

CENÁRIO B
Executar a mesma confirmação novamente
→ nenhuma baixa duplicada.

CENÁRIO C
Reserva existente
→ cancelar reserva
→ ação `cancelamento_reserva`
→ saldo retorna corretamente.

CENÁRIO D
Cancelar novamente
→ nenhuma duplicação ou saldo incorreto.

CENÁRIO E
Usuário sem papel autorizado
→ acesso negado.

CENÁRIO F
OS finalizada/cancelada
→ operação incompatível recusada.

AUDITORIA

Conferir `laboratorio_esteira_eventos` após o ensaio dentro da transação.

Cada ação precisa registrar corretamente:

- OS;
- origem;
- programação quando aplicável;
- etapa anterior;
- etapa nova;
- usuário;
- ação;
- data/hora.

REGRESSÃO

Executar:

- typecheck/tsgo;
- testes relacionados a laboratório/estoque/entrega;
- suíte Vitest completa;
- build.

Exigir ZERO FAIL.

Não considerar testes antigos como evidência: executar novamente.

NÃO EXECUTAR AINDA AS FASES 2, 3 OU 4.

RELATÓRIO FINAL

Entregar:

1. commit/HEAD inicial;
2. migration criada;
3. rollback criado;
4. funções alteradas;
5. definição da ação canônica escolhida e justificativa;
6. resultados dos testes SQL;
7. confirmação de idempotência;
8. typecheck;
9. Vitest;
10. build;
11. arquivos alterados;
12. riscos residuais;
13. confirmação explícita de que produção não foi acessada;
14. confirmação de que nada foi publicado;
15. status final:

APTO_PARA_FASE_2

ou

BLOQUEADO, informando exatamente o motivo.</body>;
}

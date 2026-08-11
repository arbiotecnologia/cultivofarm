# Correção do fluxo: OS gerada não pode ser programada

## Diagnóstico (verificado no staging ikaauvsflpmamgxmkhoq)

- A única OS existente hoje (`ordens_servico`, criada em 11/08) está com `status = 'aberta'` e `data_programada` nula.
- `rpc_avancar_esteira_laboratorio`, ao receber `assumir_producao`, só faz o auto-avanço quando a OS está em `aprovada` (`aprovada -> programada`). Para qualquer outro status ela retorna a mensagem que o usuário vê: *"OS precisa estar em status 'programada' para assumir produção. Status atual: aberta"*.
- O trigger `check_os_status_transition` permite apenas transições de +1 passo na régua `aberta → aprovada → programada → em_producao → ...`, então nem um update direto de `aberta` para `programada` funcionaria.
- Não existe hoje nenhuma ação de UI que mude o status da OS de `aberta` para `aprovada`/`programada`. No Cockpit, o botão "Definir data" grava apenas `programacao_producao.data_programada` — não toca no status da OS. Resultado: o fluxo trava exatamente onde o usuário relatou.

## Solução proposta

### 1. Motor no banco (migration, somente staging)

Criar `public.rpc_programar_os_v1(p_os_id, p_origem, p_data_programada)`, `SECURITY DEFINER`, fail-closed:

- Valida papel do usuário (mesmo conjunto já usado por `rpc_avancar_esteira_laboratorio`: admin/gestor/produção/laboratório).
- Rejeita OS `cancelada`/`finalizada` e status já adiantado (`em_producao` em diante) com mensagem clara.
- Executa a escada respeitando o trigger: `aberta → aprovada → programada`, passo a passo, dentro da mesma transação.
- Grava `data_programada` na OS e sincroniza `programacao_producao.data_programada` do registro vinculado.
- Registra evento de auditoria em `laboratorio_esteira_eventos` (ação `programar_os`).
- Retorna JSONB `{ success, status, message }`, no mesmo contrato dos RPCs da esteira.
- GRANT `EXECUTE` apenas para `authenticated`; REVOKE de `PUBLIC`/`anon`.
- Trava de ambiente fail-closed no topo da migration (bloqueio da produção `navfzbwgwzruipouyfnk`, exigência do marcador de staging), no mesmo padrão das migrations recentes.

Ajuste complementar em `rpc_avancar_esteira_laboratorio`: no ramo `assumir_producao`, o auto-avanço passa a cobrir também `aberta` (subindo `aberta → aprovada → programada`), mantendo o bloqueio para os demais status. Assim o botão "Assumir produção" deixa de travar mesmo quando a programação explícita não foi feita.

Script de rollback correspondente em `restoration/`.

### 2. Interface

- **Cockpit do Laboratório**: o seletor de data no painel de detalhe passa a chamar a nova ação "Programar produção" (data + status) em vez de apenas atualizar a data; quando a OS estiver em `aberta`/`aprovada`, exibir botão explícito **"Programar"** ao lado da data, com estado de carregamento e toast de sucesso/erro.
- **Ordens de Serviço** (`/ordens-servico`): incluir ação "Programar" no card/linha das OS em `aberta`/`aprovada`, abrindo seletor de data e chamando o mesmo RPC.
- Mensagens de erro do RPC são exibidas integralmente (sem mascarar), e as queries do cockpit/esteira/OS são invalidadas após sucesso.

### 3. Validação

- Teste unitário do hook novo (mock do RPC: sucesso, erro de papel, status inválido).
- Harness SQL de verificação: OS `aberta` → programar → `programada` → `assumir_producao` conclui sem erro; papel sem permissão recebe negativa.
- Regressão completa: `tsgo`, `vitest`, `build`.

## Restrições respeitadas

- Nenhuma alteração em produção `navfzbwgwzruipouyfnk`; migration aplicada apenas em `ikaauvsflpmamgxmkhoq`.
- Sem publicação e sem alteração de rotas, permissões existentes ou dependências.

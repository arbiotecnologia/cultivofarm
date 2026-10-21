# Registro da revisão d5e0a318 — monitor (somente documentação)

## Entendimento registrado
- Candidata `monitor-spike-floor-20261021` (floor 10s -> 12s) **NÃO aprovada**. Produção continua no frontend `51048f5f`. Nada é publicado nem implantado.
- A revisão independente confirmou 4/4 casos: o pico de 10.500 ms seria evitado, mas os picos de 12.136, 14.651 e 17.000 ms continuam pausando o acesso. Ou seja, a mudança não resolve o problema real.
- Correlação real do gateway (admin B, 15:20:10–40 UTC): v2 origin 14.651 ms (upstream 50, request `01a15f0c-7dbb-7e77-9fd6-35c33ec13473`) e 12.136 ms (upstream 64, request `01a15f0c-7dcd-7379-bcfc-d3fd495bffe0`). A V1 respondeu entre ~235 e 438 ms. A mesma identidade tinha várias abas, então não dá para afirmar qual request pertence a qual aba.
- Correção de interpretação: `rttMs=10430` no evento `expire` é o tempo decorrido de uma requisição **ainda pendente**, não o tempo de uma resposta completa. A frase "resposta chegou 3 ms atrasada" no relatório estava errada e será corrigida.
- Um aumento de 67–71% na carga por aba não será apresentado como solução.
- Homologação real: download A/B depois da renovação natural concluído às 15:36 UTC; revogação individual do admin A/B PASS, com papéis restaurados no mesmo ID.
- Ainda falta: estabilidade do gateway (latência v2) e homologação dos demais perfis reais. SU-518022 continua apenas ack.

## Mudanças (somente documentação)
1. `scripts/monitor-spike-floor-20261021/REPORT.md`:
   - colocar no topo o status "NÃO APROVADA — revisão d5e0a318; não publicar";
   - corrigir a análise da causa (requisição pendente aos 10.430 ms; a duração final foi de 12–14,6 s pelo gateway, sem correlação exata por aba);
   - registrar os resultados 4/4 e que o floor de 12 s não cobre picos reais;
   - mencionar que a causa provável está na latência v2 do gateway/upstream, investigada pelo proprietário, e que é fora do escopo do monitor;
   - atualizar as homologações concluídas e o que está pendente.
2. `roadmap.md` (se existir): marcar a candidata floor12 como rejeitada e manter como pendentes a estabilidade do gateway e os perfis reais.

## Fora do escopo
Não haverá alteração de código de runtime, testes, SQL, Auth, papéis, Edge, deploy ou publicação. Também não será feita nova candidata nesta rodada.

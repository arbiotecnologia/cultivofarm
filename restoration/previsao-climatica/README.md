# Previsão Climática (/previsao-agronomica) — auditoria consolidada

Escopo: somente frontend. Nada foi publicado, sincronizado com GitHub, aplicado
como migration/RPC ou gravado no banco. Nenhuma chamada real a serviço pago foi
feita durante a auditoria (a Edge Function `sync-clima` não foi invocada).

## Correções aplicadas (frontend, compatíveis com o contrato atual)

1. `src/lib/previsao/clima.ts` (novo) — regras puras: leitura numérica segura
   (0 é valor válido), agregações que retornam ausência em vez de zero,
   formatação de data/hora em `America/Sao_Paulo`, frescor da última leitura,
   validação de coordenadas, validação de entrada manual, detecção de leitura
   duplicada no mesmo minuto, consolidação climática e teste de suficiência de
   dados para o cálculo de risco.
2. Dashboard Climático: estados loading/erro/retry; KPIs exibem `—` quando não
   há leitura (antes exibiam `0.0°C` / `0%` mesmo sem dados); eixo e rótulos em
   fuso operacional; sincronização com timeout de 30 s, bloqueio de duplo clique
   e identificação explícita da fonte (Open-Meteo) e do período; entrada manual
   com campo de data/hora, validação numérica, faixas de sanidade física,
   bloqueio de data futura, bloqueio de duplicidade e de duplo envio; erro real
   do banco é propagado em vez de mensagem genérica; coordenadas inválidas
   (fora de faixa ou 0,0) passam a bloquear a sincronização.
3. Cálculo de Risco: loading/erro/retry; bloqueio explicativo quando faltam
   temperatura ou umidade na leitura mais recente (antes o risco era calculado
   sobre zeros implícitos); exibição da base do cálculo (data da leitura,
   frescor, número de leituras) e da descrição da regra aplicada.
4. Previsão Inteligente: mesmas guardas de dados insuficientes; texto explícito
   de que não há projeção meteorológica futura, apenas condições observadas;
   botão "Gerar Alerta" com bloqueio de duplo clique e erro real propagado.
5. Alertas: erro/retry na tabela; atualização condicional pelo status atual,
   detectando alteração concorrente por outro usuário; bloqueio de duplo clique;
   rótulos acessíveis nos botões e filtros.
6. Histórico: corrigido `SelectItem value=""` (o Radix lança exceção e derrubava
   o filtro de talhão) por sentinela `__todos__`; loading/erro/retry; ordenação
   dos talhões por nome; erros de consulta deixam de ser silenciados.

## Riscos bloqueados (não implementados — exigiriam banco/servidor)

- **Duplicidade de leitura climática**: a verificação é client-side sobre a
  janela de 7 dias carregada. Sem índice único em
  `clima_dados (fazenda_id, data_hora)` duas sessões simultâneas ainda podem
  inserir a mesma medição. Requer migration — não aplicada.
- **Faixas físicas no servidor**: as validações de temperatura/umidade/chuva/
  vento existem apenas no frontend. CHECK constraints exigiriam migration.
- **Atomicidade da sincronização**: `sync-clima` apaga a janela e reinsere sem
  transação explícita; uma falha no insert pode deixar o período vazio.
  Correção exige alteração de Edge Function — não realizada.
- **Idempotência do "Gerar Alerta"**: nada impede dois alertas iguais para o
  mesmo talhão/tipo/dia. Exigiria restrição única ou RPC — não criada.
- **Permissões**: as ações dependem exclusivamente de RLS em `clima_dados` e
  `alertas_agronomicos`; não há gate de perfil no frontend e nenhuma política
  foi inspecionada ou alterada nesta auditoria.
- **Definições agronômicas**: os limiares em `src/lib/risco-agronomico.ts` não
  foram alterados — mudá-los exigiria definição agronômica formal.
- **Nível de confiança numérico** na Previsão Inteligente não foi criado: não há
  métrica definida no contrato e inventá-la seria fabricar informação.

## Scripts

Nenhum script SQL foi preparado: todas as pendências acima dependem de decisão
de esquema/negócio ainda não autorizada. Ao ser autorizado, o pacote deve conter
migration idempotente e script de rollback correspondente.

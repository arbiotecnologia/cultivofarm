# Monitor — Retry/renovação sem "Carregando" infinito (pacote contra PUBLICADO 84edf6c)

Status: candidato revisável. NÃO publicado, sem SQL, sem grants/RLS, sem mutação de dados/papéis. Lease 15 s, folga 7,5 s,
probe, gates e rotas inalterados. Não inclui receivables nem lote.

## Causa (reproduzida com AuthProvider/monitor/probe/guards reais e transporte fake 500 ms/chamada)
O mesmo contador `generationRef` servia de fence de respostas E de dono do `loading`. Eventos que não são carregadores
(expiração do monitor `onExpire`, Retry, época) incrementavam o contador e:
1. cancelavam o Retry no meio da leitura fresca quando o monitor antigo do par expirava (ex.: foco ao voltar para a aba) → tela
   continuava pausada em /financeiro/receber ("Retry não recuperou consultor");
2. órfãos: o carregador em voo descartava a resposta e retornava SEM `setLoading(false)` → "Carregando..." para sempre;
3. requisição travada não tinha prazo → "Carregando..." para sempre.
Baseline 84edf6c: 7/15 cenários do teste novo falham (1, 2, travada, resposta tardia, e os 3 never-resolve de 60 s). Candidato: 15/15.

## Correção (src/hooks/useAuth.tsx, src/lib/authz/localDiagnostics.ts)
- Dono do carregamento separado (`loaderSeqRef`) do fence de resultados. Resposta cercada nunca é adotada; se não há carregador
  mais novo nem agendado e a identidade é a mesma, relê do zero (no máx. 3 vezes) e depois mostra erro recuperável.
- Prazo de 20 s por carregamento (independente do lease): erro explícito "Falha ao carregar dados do usuário", resposta tardia descartada.
- Timer agendado (TOKEN_REFRESHED/SIGNED_IN) carrega na geração atual se outro fence ocorreu antes de disparar.
- Retry só desiste por troca de identidade/saída/desmontagem ou carregador mais novo (TOKEN_REFRESHED); expiração do monitor antigo
  não o cancela. Leitura fresca paralela e com prazo. Após re-resolução, o monitor do NOVO escopo inicia; mesmo escopo re-sonda o
  monitor expirado depois do commit (nunca o monitor antigo da closure). Sem tenant em cache (falha anterior) a probe do novo
  escopo re-prova o tenant; tenant divergente com cache continua não adotado.
- Diagnóstico numérico: eventos `load_restart`/`load_timeout` (`cultivo-authz-load`, só ms decorridos); diagnósticos do monitor
  passam a valer para todos os escopos ambientais revisados (par, residual, financeiro, admin), mesma allowlist.

## Latência 7838 ms (admin B)
Falha segura esperada, não pausa indevida: com lease de 15 s medido do início da requisição, ida ≥ 7,5 s (metade do lease) torna
impossível renovar a tempo. Log com `reason:"timeout"` e `rttMs ≥ 7500` (resposta ou expiração) classifica esse caso. Teste: probes
de ~3 s por 3 min sem nenhuma expiração; 8 s pausa; Retry recupera com latência normal.

## Testes (transporte/relógio fake; não é JWT/RLS real)
`src/test/config/retryLoadingRace.integration.test.tsx` 12/12: par→gestor removido em /financeiro/receber→Retry→financeiro negado,
/app técnico recuperado; expiração do monitor antigo durante leitura fresca e durante carregador; TOKEN_REFRESHED durante Retry
(leitura e carregador) + expiração; renovação natural no residual; leitura travada; resposta tardia; troca de empresa; 0 papéis;
restauração do par; admin 3 s estável / 8 s pausa.
Suíte config+lib+hooks+guards+authz 1094/1096; restante src/test 7423/7435 — as 14 falhas são idênticas na baseline 84edf6c
(tipos legados 2, Edge v89 8, notificação 1, visita 3). tsgo app/node sem erros.

## Reversão
`rollback.sh` restaura bytes exatos de 84edf6c (2 arquivos) e remove o teste novo; verificado em cópia temporária.

## Pendente (homologação real, sem reload)
Retirar só gestor em /financeiro/receber → Retry → financeiro negado e técnico recuperado; renovação natural sem travar;
restauração. Não marcar homologado sem esse recibo.

## Adendo 18:20 — evidência independente never-resolve
- TOKEN_REFRESHED com profiles que nunca responde: após 60 s sem spinner, readiness fechada, erro recuperável (prazo 20 s do carregador).
- Retry com leitura fresca que nunca responde: prazo 20 s libera o single-flight; com transporte de volta, novo Retry recupera o consultor.
- Retry cujo carregador nunca responde: o Retry não espera mais o carregador (loading mantém readiness fechada; o carregador tem
  prazo próprio), então `retryInFlightRef` é liberado; erro explícito, sem autoridade antiga; respostas tardias descartadas.
- AdminB real: pending timeout 15005 ms (17:55:37 e 17:56:26) = rede acima do lease de 15 s → bloqueio seguro esperado; lease não estendido.

# SMTP-T1 — revisão de redaction autenticada

## Decisão e limites
**NO-GO para senha real e abertura de gates.** Fundação fechada instalada pelo auditor conforme relato00:27 UTC; não houve aplicação, publicação ou inspeção remota pelo agente. Esta revisão permanece T1, sem SMTP operacional ou novo módulo. Nenhuma falha de sigilo hospedada foi reproduzida: há superfície de exposição documentada e ausência de prova de supressão.

## Diagnóstico do caminho existente
| Camada | Contrato/estado local observado | O que não comprova |
|---|---|---|
| UI/cliente canônico | TENANT_SMTP_REVIEWED=false interrompe load/save antes de functions.invoke; campos ficam bloqueados | UI publicada bloqueada não exercita tráfego com credencial |
| Edge | reviewed=false retorna503 antes de getUser, scope, leitura do body e save; gateway verify_jwt=true informado externamente | 503 pode ter sido registrado com body/headers pelo gateway antes do handler |
| PUT autorizado, se revisado futuramente | JSON password vira argumento p_password de tenant_email_settings_save via cliente JWT do ator | não há criptografia de aplicação antes dos pontos de observabilidade; HTTPS não impede logging no servidor |
| RPC | wrapper INVOKER/core privado validam ator/tenant; gate privado false antes de validação/Vault, rechecado após lock | rejeição42501 não impede logging do request/SQL que já chegou |
| Vault/audit | API oficial; referências privadas; retorno allowlist e audit sem credencial | proteção em repouso/ROLLBACK não removem logs de rede, SQL ou exportações |

**Impossibilidade atual:** sem modificar o bloqueio pré-auth, não há UI→Edge→PostgREST com os gates atuais. PUT direto autenticado à Edge fechada prova somente a borda, não PostgREST. Chamada direta à RPC prova outro caminho, não a cadeia pedida. Mocks e claims SQL não substituem JWT real.

## Fontes oficiais consultadas nesta rodada
- Supabase: https://supabase.com/docs/guides/functions/logging — Invocations inclui request/response data, **headers e body**; Logs inclui exceções e mensagens customizadas. A página não estabelece um controle hospedado de redaction seletiva ou comprova proteção de Authorization. Não presumir captura universal efetiva nem ausência de captura: exigir evidência da configuração real.
- PostgreSQL: https://www.postgresql.org/docs/current/runtime-config-logging.html — log_parameter_max_length=0 desativa valores de bind em logs não-erro; log_parameter_max_length_on_error=0 desativa bind em erros. Não removem literais do texto SQL. log_min_error_statement e logs de duração/amostragem são caminhos independentes.
- PostgREST upstream: https://docs.postgrest.org/en/stable/references/configuration.html — log-level regula classes de eventos, não redaction de campos; log-query registra SQL quando habilitado. A versão upstream consultada não prova versão/configuração/disponibilidade desses controles no Supabase hospedado. Desabilitar prepared statements não elimina parâmetros nem é solução de sigilo.

## Intervenção mínima recomendada — primeiro a plataforma
O proprietário deve obter do Supabase suporte/configuração verificável para **supressão antes da ingestão**, específica ao endpoint e seus RPCs quando disponível:
1. Invocations/gateway/runtime/APM/drains: não persistir body da requisição com password, nem Authorization/cookies/tokens; verificar também respostas, exceções e capturas anteriores ao código da função. Filtro na tela, retenção curta ou apagar depois não são supressão.
2. Gateway da Data API/PostgREST: mesma garantia para body p_password e headers JWT. Avaliar logs de query/erro e observabilidade de proxy, não só stdout PostgREST. Não confundir log-level baixo com redaction.
3. PostgreSQL: confirmar configurações **efetivas na sessão/role de execução do PostgREST e no core DEFINER**, inclusive overrides database/role/function/pool. Exigir binds desativados em logs normais e erros, pgAudit sem parâmetros e sem caminhos que gravem literais de segredo. Revisar duração/amostragem, mensagens/contextos de erro, ferramentas SQL e exports. Configurar dentro da RPC pode ser tarde: o request/bind já passou por logging anterior.

Valores históricos próprios: log_parameter_max_length=-1, log_parameter_max_length_on_error=0, log_statement=ddl, pgaudit.log=none/log_parameter=off. Não foram reconsultados. -1 permite bind completo quando um caminho de logging aplicável estiver ativo; ddl sozinho não demonstra vazamento da RPC nem exclui logs de duração/erro. Redaction de bind não cobre SQL com senha literal; nunca usar senha real no SQL Editor, CLI, scripts ou comentários.

Não há controle hospedado comprovado nesta revisão; não entregar um comando fictício de desligamento de Invocations. Uma declaração genérica do suporte não basta: delimitar endpoints, campos, momento da supressão, camadas downstream, retenção, drains e versão/configuração observada. Se a configuração exigir alteração global, avaliar impacto antes, sem reduzir auditoria dos outros módulos.

## Prova mínima concreta após a garantia de plataforma — candidato, NÃO implementado
**Requer autorização explícita de revisão/implantação temporária pelo auditor**, pois o reviewed=false atual nega tudo antes de auth. Não ativar reviewed=true nem o gate privado para testar.

Alternativa estreita reutilizando somente o contrato existente:
- UI real permanece com campos e submit bloqueados. Harness temporário do auditor usa import do **cliente canônico**, sem ler/exportar sessão, para functions.invoke do mesmo tenant-email-settings/PUT com payload fixo sintético conforme saveSchema. Executado no contexto da página de Configurações e sessão genuína Admin AR consentida; não é teste de digitação/salvamento pelo formulário, registrar essa limitação. Não criar cliente, endpoint, módulo ou fila; não editar storage/claims/roles ou fazer impersonation.
- Candidato mínimo no handler existente permite sob reviewed=false **somente igualdade exata de todo o payload sintético fixado na revisão**; nenhum campo livre/credencial real aceito. Mesmo Origin, método, limites, getUser e scope autoritativos; negativo de identidade continua negado. Marcador público não é autenticação nem segredo e não autoriza sozinho. Sem selector por URL, header ou parâmetro novo. Toda chamada não coincidente continua fechada; nenhuma exceção implementada nesta entrega.
- Usar valores não pessoais, host reservado não conectável `smtp.example.com`, remetente/usuário sintéticos e marcador aleatório sem valor de credencial dentro de password. Não executar DNS/SMTP. Não registrar conteúdo nem headers. Contrato PUT e p_password existentes chegam ao mesmo save, que deve retornar42501 pelo **gate SQL false**, sem tentativa Vault ou escrita. Não mascarar essa rejeição como sucesso.
- Antes da chamada, auditor confirma gatefalse/estado-base usando seu acesso autorizado ao canônico. Depois confere ausência de delta em settings/audit/refs, sem leitura de segredo. Não usar ROLLBACK externo para HTTP: é outra transação; gatefalse é a contenção. Descartar o candidato temporário ao terminar e restabelecer entrypoint sem exceção; três gates continuam false. Sem reaplicar migration nem criar fixture/identidade.

Isso prova percurso autenticado com rejeição, não save/rotate/CAS via UI real nem comportamento Vault em erro. Esses ramos exigem garantia de configuração/logging e futura autorização própria; não abrir gate para obtê-los nesta revisão.

## Inspeção sem capturar JWT/senha do navegador
Não abrir/exportar Network, HAR, trace, request/response dump, storage/session, cookies ou logs brutos. SDK usa sessão no fluxo normal; harness não lê token e retorna apenas status/código allowlist. Não gravar screenshot de campos/sessão ou executar logger de requests. Verificar integridade do harness e desabilitar capturas do runner antes de usá-lo.

Auditor consulta na plataforma somente projeções/contagens sanitizadas, por janela UTC/endpoint/request ID não secreto. Busca do marcador sintético em body e p_password, logs SQL/erro/runtime e drains retorna apenas camada/count/intervalo; jamais retornar linhas completas. Para Authorization/cookies, checar apenas presença de campo não redigido, sem acessar seu valor. Se a ferramenta só permite bodies/headers brutos, parar e pedir ao suporte evidência sanitizada. Essa inspeção não evita que a plataforma capture JWT; a supressão anterior à ingestão deve estar garantida **antes** do probe.

Critérios: cobertura/latência de ingestão e drains confirmados, evento/contador de acesso não sensível presente como controle positivo, marcador ausente em todas as superfícies cobertas, header sensível não persistido, rejeição esperada e zero escrita. Ausência em busca amostrada, janela curta, fonte sem permissão ou logs desativados sem controle positivo = UNVERIFIED, não PASS. Se aparecer marcador, registrar somente achado/contagem, manter NO-GO e pedir contenção/retencão ao proprietário; não excluir logs automaticamente. Não buscar senhas/JWT reais como canários.

## Se a plataforma não suportar a supressão necessária
**Recomendação neste T1: permanecer fechado.** Não existe correção apenas com console removido, Cache-Control:no-store, type=password, base64 ou ocultação de painel. Um envelope cifrado antes do primeiro logger e caminho de descriptografia seguro poderia proteger conteúdo, mas mudaria contrato, chaves, replay, limites e RPC/Vault; proteger somente UI→Edge ainda deixa p_password plaintext downstream. Não desenhar nem implementar isso sem recorte arquitetural autorizado. Não contornar com service_role ou acesso Vault no cliente.

## Evidência e QA desta revisão
Inspeção própria: arquivos locais do contrato/UI/handler/RPC e fontes oficiais públicas; nenhuma sessão, log remoto, SQL remoto ou segredo acessado. Instalação e resultados hosted continuam EXTERNOS. Runtime, gates, dependências e permissões sem delta; ajustes apenas documentais. Verificações locais: registrar resultados da execução ao final desta seção. Typecheck/build não executados manualmente; não necessários para inferir redaction e não substituem evidência hospedada.
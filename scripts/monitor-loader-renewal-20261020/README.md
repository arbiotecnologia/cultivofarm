# Loader pós-renovação — candidata separada, NÃO ativada

CQ final foi concluído antes desta preparação: 140 checks SQL descartáveis, 72 Vitest, tipos candidatos e 52 hashes PASS. Contenções LIVE e produto-only permanecem no pacote CQ fechado, sem alteração por este artefato. `prepare.py` verifica cada hash CQ e fixa seu manifesto no candidato do loader.

## Recibos e reprodução

Proprietário observou no publicado afa241: B auth_refresh13:07:06.118UTC → load_timeout20.015s → erro recuperado por refresh() via botão; A auth_refresh13:11:35.622, expire13:15:35.993 RTT7929 lease0 e13:16:22.126 RTT7952 lease−4; auto_retry recuperou descartando modal. Anexos A/B positivos com hashes iguais depois da recuperação são recibos do proprietário, não homologação deste candidato.

Baseline byte-exata capturada de `src/hooks/useAuth.tsx` reproduz em teste de AuthProvider real/SDK simulado: leitura profiles11s seguida de roles11s, perfil aplicado parcialmente aos11s e watchdog20s terminando em erro persistente, resposta tardia descartada. Isso demonstra a categoria de falha do loader, **não identifica nem resolve a causa do gateway**. Nenhuma sessão real foi recarregada, alterada ou usada em teste.

## Delta candidato

- Somente cópia do AuthProvider existente, sem outro cliente, provider, rota, role ou dependência.
- Profiles/roles paralelos, sinal de aborto compartilhado, commit conjunto somente com loader/geração/ator atuais. Prazo de cada tentativa continua20s; nenhuma adoção parcial. Signout, identidade/renovação, Retry, epoch/expiração, offline e unmount cancelam leituras.
- Falha transitória pós-TOKEN_REFRESHED da mesma identidade: somente **uma** nova tentativa após1s, com novas leituras canônicas e credencial corrente gerenciada pelo cliente. Nenhum token/sessão anterior é salvo, reaplicado ou buscado. Hung em ambas tentativas chega ao estado terminal em aproximadamente41s; cada tentativa individual termina em20s. Fresh loader por fence não-loader continua com teto preexistente de3 reinícios, nunca adota resposta invalidada.
- Timeout/transporte/5xx podem usar essa tentativa; 401/403, perfil ausente/inativo/incompatível, zero papéis e offline não a usam. Falhas e negações não chamam signOut global; logout explícito mantém fluxo canônico. Nenhuma negação vira autorização. Profile e papéis vazios permanecem ocultos, erros fecham readiness mesmo para escopo interno.
- Lease15s, monitor/probes, epochs, regra tenant e papéis residuais intactos. Nova leitura sozinha não autoriza escopo monitorado: precisa da resposta fresca do probe. RTT8s do probe ainda pode expirar e pausar legitimamente; esta candidata não promete eliminá-lo.
- Recuperação transitória descarta qualquer recibo/modal/draft antigo. A recuperação limitada saudável da baseline só se mantém onde já existia reconfirmação exata; nunca reabre bytes, respostas antigas ou privilégios.
- Retry pre-read também recebe aborto e prazo, mas não novo retry automático. Offline/signout/unmount cancelam espera e tentativas; sem tentativa automática no evento online.

## Verificação e limites

Testes reais do provider/monitor com SDK simulado: paralelismo/atomicidade3s e8s,11s abaixo do watchdog,20s/hung e orçamento terminal,503→recuperação,401 negado, resposta tardia ignorando abort, A→B e tenant, par e cada papel residual, inatividade/revogação total, offline/signout/unmount, refresh explícito, probe3s/8s. **23 testes candidatos + 18 regressões + 1 reprodução da baseline PASS**; tipos da cópia isolada PASS. Cópias das regressões anteriores adicionam somente a forma SDK abortSignal e corrigem caminho do helper, preservando cenários/asserts; não alteram testes de runtime. Na primeira execução, mocks antigos sem abortSignal falharam; cópias compatíveis passaram. Cancelamento efetivo é assertado nos novos testes, não nos mocks anteriores que ignoram o sinal. Runtime não é substituído para testes. Build automático OK; sem browser hosted/JWT/RLS/anexos da candidata, portanto **homologação real pendente**, gateway não PASS.

```sh
mkdir -p /tmp/monitor-loader-validation
cp scripts/monitor-loader-renewal-20261020/rollback/src/hooks/useAuth.tsx.review /tmp/monitor-loader-validation/baseline.tsx
MONITOR_LOADER_BASELINE=1 bun run test --config scripts/monitor-loader-renewal-20261020/vitest.config.ts
bun run test --config scripts/monitor-loader-renewal-20261020/vitest.config.ts
MONITOR_LOADER_REGRESSION=1 bun run test --config scripts/monitor-loader-renewal-20261020/vitest.config.ts
python3 scripts/monitor-loader-renewal-20261020/prepare.py
```

## Revisão e rollback

`frontend-candidate/src/hooks/useAuth.tsx` e `frontend.patch` são proposta, não rollout. `rollback/src/hooks/useAuth.tsx.review` é baseline byte-exata; `rollback.py` recusa qualquer runtime desconhecido e não escreve se já estiver na baseline. Não executar aplicação/rollback/publicação automaticamente. Manifesto contém SHA256 de cada artefato, baseline/candidata e manifesto CQ. Revisão independente integral antecede eventual ativação/publicação e homologação real A/B; CQ, anexos, SQL, Edge, roles e sessões permanecem intocados.
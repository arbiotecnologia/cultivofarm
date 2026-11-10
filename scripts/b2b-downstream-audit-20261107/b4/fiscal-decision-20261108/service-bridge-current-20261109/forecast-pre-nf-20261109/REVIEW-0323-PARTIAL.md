# Complemento 03:23 — resultado parcial, NÃO GO

Somente PostgreSQL 17.11 descartável por socket Unix, restaurações integrais novas; nenhum SQL hospedado, publicação, emissão, cobrança ou envio. A prova 184 permanece histórica, não certifica os candidatos atuais.

## Alterações candidatas

- SYNC/CANCEL exigem READ COMMITTED, duas features canônicas e operações exatas no piloto existente antes/depois dos locks. Instalação sem concessões lifecycle; rollback revoga concessões sem apagar histórico.
- Início canônico candidato reserva EMISSION_STARTED na mesma transação da transmissão e preserva replay antes da reserva nova. Consulta protocolar candidata grava vínculo privado imutável ao evento de timeout, versão da previsão, emissão, NF e XML. Não usa created_at+UUID como causalidade.
- Grant dos helpers privados não foi ampliado. Vocabulário da allowlist foi estendido por constraints pinadas; registros físicos históricos são preservados.
- Constatação READONLY de produção sobre ausência de feature/gate nos helpers c2p1 foi fornecida pelo auditor, NÃO consultada pelo agente. Rótulo INACTIVE não é barreira operacional.

## Execuções preservadas

Evidências: `order-e2e-new-20261108/evidence/attempt-N/run.stdout.txt`, `run.stderr.txt`, `run.exitcode`, `checks.json`.

| Tentativa | Exit | Falha observada |
|---|---:|---|
| 188 | 1 | ModuleNotFoundError do teste de contenção; import corrigido |
| 189 | 1 | 23514: mutação de concessões de outros canais violou shape; mutação restringida ao lifecycle |
| 190 | 1 | PT409 FISCAL_IN_FLIGHT no controle positivo CANCEL; controle agora liquida transmissão via callback em rollback |
| 191 | 1 | P0001 FISCAL_PRODUCTION_ENDPOINT_BLOCKED no BEGIN da consulta: marcador ausente na restauração metadata-only |
| 192 | 1 | 23514 environment_label_check no marcador sintético; label corrigido para STAGING, ainda não reexecutado |

191 completou 48 verificações de contenção em `lifecycle-containment.json`: feature pedidos_b2b/contas_receber, gate, concessão revogada/expirada, referências divergentes, leitura não autoriza lifecycle, controles exatos em rollback e revogação real durante espera de papel, tenant, features e piloto. REPEATABLE READ nos dois wrappers foi negado antes dessas verificações. Auth SQL é sintética, não JWT hospedado.

31 estáticos passaram no espelho; não aprovam cadeia. Artefatos gerados nesse espelho ainda NÃO foram promovidos sobre os SQL históricos do repositório, para evitar apresentar pacote final não validado. Fonte modificada e SQL antigo não devem ser instalados como conjunto.

## Pendências deste candidato

Reexecutar correção STAGING; verificar origem fiscal/causalidade, 215/106/280 e guard imutável, corrida das duas intenções antes SYNC, begin×cancel ambos commits, estrangeiro sem espera, drift ACL executado, 18/9/9, parceiro747→738, pagamento9, callback tardio, preservação dos 38 gatilhos e rollback integral. Nenhum PASS novo desses cenários é declarado.

Leitor `rpc_receivable_money_projection_v1`: fonte candidata `financial-price-generator-20261029/integration/origin.sql.review` revoga authenticated explicitamente. Diagnóstico de catálogo/ator foi adicionado ao ensaio, mas não alcançado nas tentativas novas; positivo continua BLOCKED, sem grant e sem leitura owner como substituto.

Estado: **REVIEW_ONLY_INACTIVE_NOT_APPROVED**.

## Complemento 03:42 — controles distintos e espera comprovada

Incorporado ao mesmo harness; tentativas 193 e 194 executadas sequencialmente, sem processo duplicado e sem hosted. O CANCEL do documento principal continua negando corretamente `PT409 B2B_FORECAST_FISCAL_IN_FLIGHT`: esse resultado registra passagem da autorização e bloqueio de negócio, NÃO sucesso de cancelamento. Não foi liquidada artificialmente a transmissão para passar esse controle.

O sucesso funcional tem controle separado no pedido PC, depois de timeout e consulta canônica 217, exigindo zero transmissões PENDING/SENT, ACK de cancelamento e restauração do estado por rollback. **Esse controle ainda não foi alcançado**; não declarar PASS.

`lifecycle_lock_barrier.py` mantém holder aberto até COMMIT explícito, espera estado idle-in-transaction e só envia revogação depois de observar waiter `wait_event_type=Lock`, holder específico em `pg_blocking_pids` e locks não concedidos em `pg_locks`. Deadline sem essa evidência aborta, termina caller e faz ROLLBACK sem mutação/sem PASS. Pausa curta serve apenas à frequência do poll, não à prova. Dois testes unitários do harness passaram; não substituem PG.

| Tentativa | Exit | Evidência nova / limite |
|---|---:|---|
| 193 | 1 | Restauração sem falhas catalogadas; 48 controles de contenção, incluindo **12 waiters comprovados antes da revogação**; SYNC autorizado em rollback e CANCEL autorizado com bloqueio de negócio PT409. Cadeia parou no BEGIN de consulta com P0001 FISCAL_PRODUCTION_ENDPOINT_BLOCKED. |
| 194 | 1 | Nova restauração integral, sequencial, mesmos 48 controles e 12 waiters comprovados. Configuração da fixture fiscal nova recebeu nfe_environment_code=2 no INSERT, sem alterar snapshots/guards. Mesmo bloqueio fiscal permanece: ajuste insuficiente, não é correção comprovada. |

Evidências exatas em `scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/evidence/attempt-{193,194}/`: `workspace.json`, `run.stdout.txt`, `run.stderr.txt`, `run.exitcode`, `checks.json`, `restore-results.json`, `lifecycle-containment.json` (PIDs/locks/SQLSTATEs), `fiscal-marker-local.json`. Na 193 também `focused-harness-tests.txt`. Cada cadeia chegou a 47 checkpoints antes da falha; não houve rollback integral final nem PASS financeiro novo.

O marcador canônico STAGING/production_emission_allowed=false foi lido e registrado; o writer canônico também exige configuração fiscal ativa de homologação. A configuração da fixture foi ajustada no INSERT original, mas a 194 demonstra que isso não eliminou o bloqueio. Diagnóstico residual e controle funcional PC seguem pendentes, sem enfraquecer guard ou forçar UPDATE de documento.

**Acoplamento piloto/logística:** o helper existente exige gate `b2b_resale_logistics_gate_v1` além da allowlist. Ativar esse singleton hosted só para testar lifecycle pode afetar capacidades logísticas e NÃO está autorizado. Antes de qualquer piloto hosted, revisar impacto nos consumidores e comprovar contenção exata independente; nenhuma abertura global foi feita ou proposta como atalho. Instalação candidata continua fechada e SQL históricos não foram promovidos.

Permanecem pendentes: controle funcional reconciliado, corridas begin/cancel e duas intenções, causalidade/negativas fiscais finais, drift ACL executado, cadeia 18/9/9 e parceiro747→738, pagamento9, callback tardio/rollback integral/preservação final dos 38 triggers e leitor financeiro positivo. Resultados 184/191 históricos não substituem estas provas; JWT/RLS/Storage hosted, emissão/envio/cobrança reais não foram executados. **NÃO GO.**
## Complemento 12:55 — diagnóstico FISCAL_PRODUCTION_ENDPOINT_BLOCKED (somente local)

**Predicado que falhava (193/194):** `rpc_fiscal_sefaz_transmit_begin_v1` (corpo canônico MD5 `4d93bb04e4a18771ed9185d2f3c5d6dc`, sobreposição candidata linha 32) — cláusula 2:
`SELECT coalesce(nfe_environment_code,'') FROM public.company_fiscal_settings WHERE is_active LIMIT 1` → `''` ≠ `'2'`.
Cláusulas: (1) marcador `project_ref`/`production_emission_allowed` — passava (STAGING/false); (2) configuração ativa LIMIT 1 — **falhava**; (3) host `hnfe.fazenda.mg.gov.br` — estático, passava.

**Causa demonstrada (tentativa 195, `fiscal-begin-preflight.json`, READ ONLY):** duas configurações ativas; a primeira no heap (ctid (0,1)) é a sentinela sintética `10000000-0000-4000-8000-000000000707` da organização `10000000-…-0001` (origem `stock-envase-recovery-20261027/isolated/sentinels.py`), com `nfe_environment_code` NULL. A da ARBio (`00000000-…-0001`, `'2'`) foi inserida corretamente — não houve ON CONFLICT/NOT EXISTS ineficaz para a ARBio. O ajuste do INSERT na 194 nunca poderia resolver: o guard lê configuração de **qualquer empresa**, sem ORDER BY nem tenant.

**Defeito de código (não da fixture):** a cláusula 2 canônica é tenant-blind; em multi-tenant real o bloqueio/liberação de uma emissão depende de outra empresa. A sentinela foi preservada. Correção candidata em `begin_overlay` (`wrappers_and_credit.py`): com documento, `tpamb` vem da configuração ativa **da própria NF** (`c.id=i.company_settings_id AND c.organization_id=i.organization_id`); sem documento, a cláusula canônica fica literal. Ausente/outra empresa ⇒ NULL ⇒ bloqueado. Marcador e host intactos; nenhuma emissão externa.

**Preflight rápido:** `fiscal_begin_preflight` (READ ONLY) roda logo após o INSERT da fixture e antes de cada BEGIN de consulta; aborta em minutos citando o predicado.
**Negativas (tentativa 198, rollback):** própria configuração `'1'`, NULL e inativa com outras empresas `'2'` → `P0001 FISCAL_PRODUCTION_ENDPOINT_BLOCKED`, zero transmissões. A configuração é preparada com `session_replication_role=replica` dentro da transação revertida (mesma costura sintética da fixture) e o writer roda com `origin`.

**Outros defeitos demonstrados e corrigidos no candidato:**
- 196: a cadeia usava SQL `06-install` antigo do repositório (sem READ COMMITTED). `rebuild_current.py` agora gera o candidato **dentro do espelho** (`NEW_E2E_BUILD_FORECAST=1`) e grava `mirror-forecast-artifacts.json` com hashes; o repositório não é promovido.
- 199: `B2B_FORECAST_REPLAY_DIVERGENCE` no segundo ciclo da mesma NF: `attempt` era sempre `1+1`, então a chave de repetição `nota:2` colidia entre transmissões. A transição agora usa `transmission_id` do payload na chave (a NF continua sendo a intenção). A 200 mostrou que trocar a referência quebrava `fiscal_intent_id::uuid`; essa alternativa foi revertida.
- 201a: a segunda intenção da corrida usava fixture com transmissão SENT pré-inserida, que bloqueava o cancelamento seguinte de forma legítima (`FISCAL_IN_FLIGHT`). Agora a segunda NF nasce sem transmissão; só o início canônico pode criar uma.
- `missing-returned-proof`: `response_summary` é NOT NULL (padrão `'{}'`); o caso passou a usar retorno 217 sem `chNFe`.

**Perda de evidência:** dois reinícios do sandbox apagaram os diretórios 195–199 e o primeiro 201. Os resultados acima foram observados durante a execução, mas os arquivos **não estão preservados**; foram renumerados e nada é declarado PASS com base neles. A tentativa 200 está preservada.

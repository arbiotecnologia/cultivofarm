# Validação local — revisão 24/10/2026 00:14 UTC

**69 checks PASS no PostgreSQL descartável; 1/1 Vitest da composição PASS (39s).** Não é homologação hosted Auth/JWT/RLS.

Revisão independente 9c62ecab relatada pelo proprietário: PRE integral readonly canônico PASS; PRE contábil 42501/C2_ACCOUNTING_PREREQUISITE_BLOCKED esperado. A preencheu CNPJ/razão social reais, continua DRAFT sem atestado. Nenhuma nova consulta ou alteração hosted pelo agente nesta rodada; bloqueio humano mantido.

Correções desta rodada: mensagem externa comunica aprovação comercial sem promessa operacional; ramo interno capturado preservado. Testes `na_entrega` singleton/cumulativo confirmam aprovação com readyfalse/receivablefalse, zero títulos/vínculos, cobrança manual negada sem qualquer efeito e em_producao/entregue negados, sem planejamento. O teste primeiro falhou porque o impl original efetivamente criava título pré-entrega; corrigido apenas no ramo externo do impl com 42501/C2_EXTERNAL_DELIVERY_REQUIRED. Eligibility internal-only e fiscal resolver não alterados.

Overflow conhecido: limite1/exposição180 gera 18000%, incompatível com numeric6,2, SQLSTATE22003; função capturada e create completo negados sem efeitos. Experimento separado `v_pct numeric` conserva LIMIT_EXCEEDED_BLOCK e LIMIT_EXCEEDED_APPROVAL, depois ROLLBACK e MD5 original. Proposta documental em `numeric-overflow-proposal.md`, não integrada ao candidato.

PRE estrutural/contábil e rollback permanecem byte-exatos; POST e expected-source atualizados só para approve/impl modificados. Capturas históricas intactas. Snapshot das tentativas negadas inclui agora settings, além de pedidos/filhos/idempotência/financeiro/audits/notificações/planejamento.

Complemento 23:55: PRE contábil aceita apenas fixture sintética validada, bloqueia DRAFT/atestado NULL e ausência de configuração ativa; create DRAFT/NULL reverte sem pedido parcial. Seis negativos do trigger de filhos, executados como owner local com caller sintético, negam alteração de cronograma por gestor singleton/cumulativo, técnico/produtor e gestor/admin B com `C2_EXTERNAL_OWNER_DENIED`; estado integral inalterado. Aprovação/cobrança owner A seguem passando na cadeia capturada. Nenhuma nova mudança nos corpos candidatos foi necessária para a composição dos filhos.

Produção conforme relato independente: A ativo DRAFT/atestado NULL; B semconfig. **Bloqueio humano contábil permanece aberto**, sem fabricar atestado/CNPJ ou alterar dados para PASS. Fixture positiva local não representa estado de produção. Nenhuma consulta hosted nesta rodada; writer permanece false e pacote inativo.

Comando: `python3 scripts/owner-orders-20261023/internal-origin-composition-20261023/test-local.py`.

- Fidelidade MD5 dos corpos capturados; 44 triggers atuais ligados; PRE integral containment e POST composição-contida PASS.
- PRE negativo rejeita RLS desativada e policy permissiva adicional, sem alterar políticas no candidato.
- RPC baseline reproduz `B2B_INTERNAL_ACTOR_DENIED`; candidata cria gestor singleton e gestor+técnico via RPC real, preço1L180, três parcelas, sem título pré-aprovação.
- Técnico isolado/produtor/gestorB→A/A→B negados sem qualquer nova linha nas tabelas observadas; revogação nega criação.
- AdminA aprova e gera exatamente um título/3 parcelas; parcelas coincidem com cronograma (inclusive data/valor) e ownerA. Billing repetido não duplica título.
- AdminB não lê pedido/itens/termos/cronograma/título/parcelas A sob policies capturadas; AdminA lê próprio título. Não confundir claims locais com JWT emitido pelo hosted Auth.
- Negativos de aprovação técnico/produtor/gestorB/adminB; origem imutável, RLS bloqueia edição direta; issuer não validado e cliente estrangeiro negam transação integral.
- Falha injetada no INSERT do vínculo financeiro reverte status/selagem/título/parcelas/cronograma/audits. Falha é sintética e explícita, restante da cadeia financeira usa corpos reais.
- Guard de crédito real muda estado após selagem; guard final nega persistência `C2_EXTERNAL_UNFINALIZED_APPROVAL` e reverte tudo.
- Configuração ausente em pedido elegível retorna `B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED`, sem INSERT automático nem título parcial.
- Replay do create mantém mesmo retorno/nenhuma nova linha; fingerprint divergente `idempotency_conflict`; hash incorreto `price_changed`; rollback mantém dados e helperfalse.

Regressão desta rodada: `bun run test src/test/saas/c2-orders-origin-composition-postgres.test.ts`: **1 teste PASS**, executa os 69 checks da composição; o harness P1 anterior não foi repetido.

Build automático da prévia observado **OK**; nenhum runtime frontend alterado. Typecheck/build manual não executados conforme restrição do ambiente. Nenhum teste de navegador/sessão executado; nenhuma ação hospedada de DDL/DML, publicação, role ou sessão.

Capturas originais de 23/10 usaram SELECT de metadados/corpos no canônico; nenhuma consulta hospedada nesta revisão de 24/10. Sem alterações de dados reais, configurações, papéis, sessões ou publicação.

NO-GO até revisão independente integral e evidências hosted autorizadas; produção/entrega continuam fechadas no candidato.

Revisão independente read-only final `sub_a97z1rj3`: nenhum bloqueador identificado nos arquivos examinados; confirmou guard final, conjunto integral policies/RLS, origem/ticket, financeiro e rollback. Executou 44 checks da versão anterior aos dois negativos PRE; rodada final do agente46PASS inclui esses dois negativos. Não acessou hosted, não certifica JWT/RLS e não autoriza implantação/reabertura. PRE/POST final também rejeita gatilhos inesperados.

Revisão read-only desta rodada `sub_gewxz6bx` confirmou mensagem externa, preservação interna/eligibility e proposta separada. Apontou ausência de allowlist exaustiva de transições externas e concorrência do conjunto de emissores como itens ainda não certificados: nenhum gate foi ampliado para resolvê-los. Suspeita de NULL/status arbitrário é limitada por coluna capturada `status partner_order_status NOT NULL` (enum), mas não substitui prova da matriz de transições. Entrega positiva é deliberadamente indisponível: pacote exige operação negada; nenhuma cobrança `na_entrega` pós-entrega foi homologada ou inventada. Esses limites permanecem NO-GO para liberação operacional.
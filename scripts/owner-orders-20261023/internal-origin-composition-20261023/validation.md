# Validação local — 23/10/2026

**56 checks PASS no PostgreSQL descartável nesta rodada; 1/1 regressão Vitest PASS na rodada anterior, não repetida.** Não é homologação hosted Auth/JWT/RLS.

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

Regressão: `bun run test src/test/saas/c2-orders-p1-postgres.test.ts`: **1 teste PASS**, harness anterior sintético independente, não substitui o teste desta composição.

Build automático da prévia observado **OK**; nenhum runtime frontend alterado. Typecheck/build manual não executados conforme restrição do ambiente. Nenhum teste de navegador/sessão executado; nenhuma ação hospedada de DDL/DML, publicação, role ou sessão.

As únicas consultas hospedadas desta rodada foram SELECT de metadados/corpos no canônico. Algumas capturas usaram a ferramenta `run_sql` com SELECT apenas; não houve DDL/DML e isso não constitui aplicação de SQL candidato.

NO-GO até revisão independente integral e evidências hosted autorizadas; produção/entrega continuam fechadas no candidato.

Revisão independente read-only final `sub_a97z1rj3`: nenhum bloqueador identificado nos arquivos examinados; confirmou guard final, conjunto integral policies/RLS, origem/ticket, financeiro e rollback. Executou 44 checks da versão anterior aos dois negativos PRE; rodada final do agente46PASS inclui esses dois negativos. Não acessou hosted, não certifica JWT/RLS e não autoriza implantação/reabertura. PRE/POST final também rejeita gatilhos inesperados.
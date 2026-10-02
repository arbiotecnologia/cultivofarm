# Campanha completa de homologação AUDIT-CF-20261002-01

## Objetivo
Auditar o Cultivo Farm de ponta a ponta, corrigindo apenas defeitos comprovados com mudanças mínimas, versionadas e reversíveis. Cada fase só começa após o gate anterior estar comprovadamente verde; resultados não executados permanecem `NOT RUN`.

## Regras permanentes
- Usar exclusivamente o Supabase canônico `swzpzcwiasxmjutrmvkm` e validar o vínculo antes de cada operação.
- Identificar dados persistentes com `HOMOLOGAÇÃO AUDIT-CF-20261002-01`; usar somente CNPJ `36.736.180/0001-11`, e-mail corporativo `renato@refilinformatica.com.br` e destinatário `teste@refilinformatica.com.br`.
- Não usar clientes, produtores, parceiros ou endereços reais como fixtures. Cenários multi-tenant adicionais serão transacionais com `ROLLBACK` ou usarão organizações já marcadas como homologação.
- Nunca registrar ou expor senha, token, OTP, cookie, `service_role`, action link ou segredo.
- Manter SMTP fechado exceto na janela controlada da Fase 1; envio real somente ao destinatário autorizado.
- Preservar trilhas; cleanup persistente por inativação/cancelamento auditável, nunca por apagamento de evidência.
- Parar imediatamente em P0/P1 sem correção segura, cross-tenant, dado real, destinatário não autorizado, segredo, ação humana indispensável ou decisão de produto não inferível.
- Manter Leaked Password Protection como risco aceito temporariamente, visível e não homologado.

## Documentação e evidências
1. Criar `docs/auditoria-master-AUDIT-CF-20261002-01.md` como registro canônico de baseline, execução, achados, correções, rollback/forward-fix e decisões.
2. Criar `docs/matriz-testes-AUDIT-CF-20261002-01.md` com casos positivos/negativos, perfis, cross-tenant, idempotência, concorrência, estados visuais, auditoria, desempenho e regressão.
3. Atualizar `roadmap.md` a cada gate, sem apagar riscos ou pendências anteriores.
4. Registrar IDs apenas mascarados, timestamps UTC, contagens pré/pós e evidência objetiva; nunca promover inferência a fato.

## Execução sequencial

### Fase 0 — inventário e baseline
- Inventariar rotas, telas, guardas, módulos, planos/features, tabelas, views, RPCs, triggers, Edge Functions, buckets, RLS/grants, integrações, cron/queues/webhooks, auditorias, estados/transições, dados de homologação e órfãos.
- Produzir mapa módulo → frontend → backend → dados → autorização → auditoria.
- Rodar scanner, linter, dependências, consultas lentas, typecheck, build e suíte global; classificar P0/P1/P2/P3 com distinção entre achados comprovados e alertas contextuais.
- Corrigir P0/P1 novo somente quando causa e menor privilégio estiverem claros; revalidar antes de avançar.

### Fase 1 — fechar D51.2
- Revalidar REFIL contida, CNPJ livre, proteção E01 publicada, SMTP OFF/OFF, destinatário exclusivo e job AR BIO intocado.
- Com sessão Superadmin real, executar E01 somente para a empresa marcada e parar no checkpoint. Auditar exatamente uma organização, assinatura e evento, com zero convite/Auth/profile.
- Somente após E01 PASS, abrir janela SMTP pelas flags auditáveis, executar E02 uma vez e auditar job, Auth user, profile, papel administrador, tenant correto, tentativa SMTP e ausência de superadmin.
- Pausar apenas nos cliques humanos obrigatórios de recebimento/primeiro acesso; enquanto isso, executar negativas e testes isolados de retry, resend, cooldown, idempotência, falha, crash, lease/fencing, takeover e duplo clique.
- Fechar SMTP após a janela e auditar o estado fail-closed.

### Fases 2–14 — domínios funcionais
Executar na ordem solicitada: SaaS/planos; Auth/multi-tenant; cadastros; comercial; produção/estoque; entregas/campo; financeiro; fiscal; comunicação; documentos/storage; BI/relatórios; UX/mobile/PWA; resiliência/segurança/performance.

Para cada domínio:
- baseline somente leitura e catálogo de contratos/transições;
- testes positivos, negativos, perfis e cross-tenant;
- duplicidade, concorrência, idempotência e falhas;
- desktop/mobile e estados loading/vazio/erro/sucesso quando houver interface;
- trilha de auditoria, performance e regressão;
- correção mínima com migration para estrutura/RLS/RPC ou código existente, sem fluxo paralelo;
- testes focados, typecheck, build, suíte relevante/global, scanner/advisors e smoke antes do próximo gate.

### Fase 15 — certificação e cleanup
- Rodar regressão global, scanner/advisors, typecheck/build e smoke publicado.
- Comparar baseline pré/pós, executar cleanup auditável, listar tudo que foi criado/inativado e registrar `NOT RUN`, riscos aceitos e bloqueios.
- Emitir decisão final GO/NO-GO por fase e geral, com rollback/forward-fix de cada alteração.

## Critério de avanço imediato
- `PASS`: evidência objetiva do comportamento, autorização, isolamento, auditoria e ausência de regressão.
- `FAIL corrigível`: aplicar correção mínima, retestar e continuar somente quando verde.
- `BLOCKED/NO-GO`: parar toda progressão quando houver risco P0/P1, ação humana/credencial indispensável, dado real ou decisão de produto.

## Premissas técnicas
- O projeto usa React/Vite e Supabase externo; nenhuma estrutura paralela será criada.
- Funções críticas derivam identidade da sessão; IDs de organização fornecidos pelo navegador nunca são autoridade.
- `SECURITY DEFINER` exige `search_path` fixo, guarda interna e ACL mínima; views expostas usam isolamento compatível com RLS.
- Fixtures destrutivas ou multi-tenant serão executadas em transação com `ROLLBACK`; dados persistentes autorizados terão identificação e cleanup auditável.

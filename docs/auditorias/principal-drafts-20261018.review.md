# Confirmações produtor/financeiro — continuidade de drafts

## Correção e escopo

Revisão independente financeira9d074: `refreshOnConfirmation: b2bContextOnly` alcançava também produtor/financeiro e disparava refresh, epoch e remount em cada confirmação idêntica. Reprodução local: **6 testes FAIL / 45 PASS** antes do ajuste, rascunho esperado preenchido retornou vazio após dois polls.

Delta mínimo em `src/hooks/useAuth.tsx`: `refreshOnConfirmation: b2bContextOnly && !producerContextOnly && !financialContextOnly`. O engine existente não mudou. B2B mantém comportamento publicado, inclusive limpeza/refetch em confirmação idêntica; seu teste integrado específico passa. Produtor/financeiro renovam somente a lease quando a tupla observada é idêntica; dados e estado da view permanecem montados. Mudança real da tupla ainda executa onEpochChange, limpa/cancela QueryClient, incrementa epoch e refresh. Pending/expired/identity continuam retirando a árvore e invalidando respostas. Revalidação explícita entra pending e incrementa epoch mesmo se a resposta síncrona simulada for agrupada no mesmo render: draft não persiste.

Nenhum stamp novo necessário para essa correção: financeira valida h15/perfil ativo/senha definitiva/tenant/roles self/has_role/h15 final; inativação e role incompatível negam. Produtor mantém conjunto canônico de clientes e h15/RLS, sem limitar múltiplos clientes. **Não há revisão monotônica nem prova de ABA/transiente não observado**, nem snapshot atômico nas leituras separadas; não ampliar isso como autorização global/entitlements. Os dois comentários de probes foram corrigidos para a nova semântica, sem mudar suas consultas ou fingerprints. `usePortalCliente` continua com preferência estável não autorizadora e fence de requests/epoch.

## Testes e evidência

- **11 arquivos / 183 testes PASS**, execução focada; não executar nem alegar suíte global.
- Produtor `/app/solicitar` e `/portal`: formulário stateful dentro dos guards/layouts reais, draft preenchido sobrevive >=2 polls, h15 confirma consultas reais do transporte fake. Mudança C+D→C descarta draft; revogação total pausa/limpa; restore via retry não recupera draft. Seleção B continua estável nos polls e descartada quando revogada. Epoch permanece igual em confirmação idêntica, aumenta na mudança real.
- Financeiro: formulário stateful dentro de ProtectedRoutes/AppLayout reais; draft sobrevive >=2 polls. Inativação, role removida, timeout e foco/revalidação descartam; restore não recupera. Nova identidade não herda draft nem R$999 da resposta antiga. Dashboard financeiro real é exercitado; não usa pagamento órfão como fixture positiva.
- Regressões B2B (inclusive confirmação idêntica que refaz cache), produtor mobile/desktop, stale/offline/timeout, guard/seleção e anexos PASS. Warning de dimensões zero Recharts no JSDOM permanece; não é login real nem inspeção visual de modal completo.
- **2/2 testes staging PASS**, cópias candidate/rollback executadas; SHA256 dos bytes UTF-8 preservados. `git diff --check` PASS. Build/typecheck automáticos OK, sinal observado `2026-10-18T23:45:39Z`.

Testes React usam sessões/RPC fake e formulário representativo em memória, não provam login/JWT/RLS, nem preservação de todo formulário persistido/offline da aplicação. Auditoria real continua independente. Não houve chamada hosted, DDL/DML, deploy Edge ou publicação.

## Gates, preflight e rollback

Produtor **true** já autorizado; financeiro **false** até concluir revisão/preflight; foundation true/b2b-context e Blob false preservados byte a byte. Preflight produtor integral **PASS em produção informado pelo auditor** (6 hashes/ACL + clientes RLS checksum); não executado novamente pelo agente. Homologação real não concluída. Anexos a905 e engine/probe/guard B2B protegidos por SHA256 e regressões, sem alteração.

Delta revisável: `scripts/authz-cache/principal-draft-release/manifest.json`, `1.candidate.review`/`1.rollback.review` (useAuth), `2.*` (comentário probe produtor), `3.*` (comentário financeiro), `stage.py`, `test_stage.py`, `gate.current.review`. PRE/POST fixos dos bytes, baseline `673f248ab206f6f276bb1c1306bb15985559285a`; receipt limitado e hashes protegidos no manifest. Scripts somente geram cópias externas, recusam drift antes de saída e não instalam. Modo activation apenas copia o gate **atual idêntico**, não libera financeiro.

Rollback completo: operador deve exigir **todos os POST exatos** antes de restaurar **todos os PRE**, recusando drift posterior. Restaura comportamento anterior com remount periódico conhecido; não é solução operacional para drafts. Em emergência, a desativação somente produtor já entregue em `producer-preference-release/producer-gate.off.review` pode ser revisada contra o gate on exato; não desativar B2B nem abrir financeiro/Blob. Artefatos históricos não foram regenerados; seu staging antigo deve falhar fechado sobre o delta novo.
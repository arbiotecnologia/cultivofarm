# Fase pequena — Gestor + Consultor técnico em tela aberta

## Evidência externa e escopo
- Base publicada informada: `751ba5017dd2cffb84320246b0000fd41e8b4435`. Proprietário informou operador A homologado real, redirecionamento PASS e perfil restaurado.
- Tenant B, sessão real com roles exatas `[gestor, consultor_tecnico]`, ativo/não provisório: `/selecionar-portal` oferecia Gestão/Técnico; `/app` e `/financeiro/receber` sem dados A. Inativação informada `2026-10-19T01:46:28.620459Z`; às `01:47:07.206Z` ambas telas/menus permaneciam visíveis sem reload. Perfil já restaurado externamente. Isso comprova persistência visual, NÃO autorização de novas requisições HTTP.
- Nenhum perfil/dado alterado; nenhum banco, DDL/DML hosted, Edge, contrato, RBAC, dependência, publicação ou ativação executado. Não houve subagentes.

## Candidata limitada OFF
- `src/lib/authz/authzEpochGate.ts`: somente nova flag `MANAGER_CONSULTANT_CONTEXT_MONITOR_ENABLED=false`; gates publicados preservados true, scope `b2b-context`, Blob false e global v6 fechado.
- `src/lib/authz/internalContextProbe.ts`: mantém singles financeiro/admin/consultor/operador e aceita somente conjunto exato gestor+consultor; constante congelada e cópia de expectativas antes de qualquer await. Ordem independente, cardinalidade exata, sem duplicados/subsets/supersets/externos/superadmin. h15 inicial → perfil próprio ativo/não provisório e tenant → roles protegidas → has_role estritamente true para ambas → h15 final. Fingerprint ordenado; sem TTL/revisão server inventados.
- `src/hooks/useAuth.tsx`: mesmo monitor, principalScope e fences; combinação exata com organização UUID atrás da nova flag. Poll igual não dispara refresh/remount; mudança observada/erro/timeout/foco/retry descartam cache e UI. Perda individual não muda a autoridade esperada do monitor; restore permite retomar sem draft antigo.
- `src/App.tsx`: boundary desktop antes de RoleGuard/AppLayout/menu. `src/components/guards/AppPortalGuard.tsx`: boundary antes dos leitores dependentes de readiness, cobrindo layout Campo inteiro. `src/pages/SelecionarPortal.tsx`: boundary externo desmonta o seletor completo e fences existentes impedem navegação por preferência tardia. Nenhuma mudança nas escolhas ou destinos legítimos.
- Sete suítes existentes apenas declaram nova flag OFF em seus mocks; novas suítes `managerConsultantGate.test.ts` e `managerConsultantOpenSession.integration.test.tsx`.

## Provas e rollback
- `scripts/authz-cache/manager-consultant-open-session/`: `candidate/`, `rollback/`, `manifest.json`, `SHA256SUMS`, `stage.py`, `test_stage.py`, `preflight-readonly.sql.review`.
- 38 hashes de fontes/provas protegidas e 30 hashes de artefatos no manifest fixo. MD5 dos cinco contratos, ACL/owner/search_path e checksums RLS profiles/user_roles herdados sem rehash das fases aprovadas.
- Preflight SELECT-only/READ ONLY, marker ref obrigatório `swzpzcwiasxmjutrmvkm`, timeouts, contratos/ACL/RLS e inventário agregado. NÃO executado nesta fase. Confirmar ref do conector antes de execução integral; drift exige STOP, nunca recalcular expectativas para passar.
- Stage apenas produz arquivos revisáveis em diretório vazio fora do projeto. Valida manifest/hash de todas fontes e artefatos antes de escrever; recusa ativação/desativação e qualquer drift. Rollback original byte-exato dos seis arquivos runtime e mocks; JSON indica remoção de dois testes novos. Não aplica rollback automaticamente; alterações futuras/gates novos fazem recusar o estado divergente.
- Manifest SHA256: `d5d2973717496a4d3a4ed9e41b3f9b29503a4a5c0b87b86f14e49f09729425f2`.

## Resultados locais
- Final: **23 arquivos, 550/550 testes PASS**. Novos: 64 integração + 3 gate, incluindo roleloss de cada papel, ordem, duplicados, extra/externo/superadmin, provisório, tenant/UID, has_role individual, expectativas mutadas durante await, foco/timeout/offline/tardios, desktop/Campo/seletor e troca legítima de portais.
- Staging **6/6 PASS**, SHA256SUMS verificado. Cópias binary/UTF-8/LF/CRLF, drift fonte/artefato, destino e modos indevidos cobertos.
- Primeira rodada: 59 PASS/1 FAIL por fixture sem feature `contas_receber`; corrigido apenas o plano fake do novo teste. Final não apresentou falhas novas. Seis falhas históricas da suíte ampla permanecem documentadas nas fases anteriores; suíte ampla NÃO repetida.
- Build automático observado OK. Typecheck: existe log do harness de comando tsgo com exit0, mas sem associação inequívoca à candidata final; **typecheck final não certificado**, não presumir PASS.

## Limites e próximos gates externos
- Transporte/session/RPC fake e páginas stub; AuthProvider, monitor, guards, layouts e seletor reais. Não login/JWT/RLS hosted nem homologação real. Gate runtime OFF impede observar o novo recorte ativo no preview real sem autorização posterior.
- Preflight independente, revisão, ativação explícita e publicação/homologação login B real aguardam proprietário. Nenhuma alteração real para produzir teste.
- Lease/poll limitados ao monitor existente; sem promessa de instantaneidade, ABA/transientes não observados, snapshot atômico, revogação de entidades/entitlements, bytes/URLs já divulgados ou auditoria global/contratos concluídos.
- Normalização legada de roles não foi alterada; o probe reconsulta lista bruta protegida e nega duplicação inclusive no primeiro poll. UI boundary apenas restringe; servidor/RLS permanecem autoridade.

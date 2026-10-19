# Administrador de empresa — candidata limitada, gate fechado

## Escopo e estado

Baseline publicado informado: `07d27698fff1026c09cffe2c4859ea59592aca5e`, deployment do auditor `68340d34-09b4-49e7-915a-4ac46fd1fa2a`, domínio e preview com `index-CgXJJ8e4.js`. Não houve publicação, DDL/DML hosted, deploy Edge, novo RPC/schema/trigger, subagente ou pagamento/cobrança pelo agente.

Candidata altera somente seleção do monitor existente no AuthProvider, probe interno compartilhado e boundary existente do shell em `App.tsx`, com testes/artefatos/documentação. Não altera rotas, RBAC/RLS, contratos ou guards de entidades. `COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED=false`; foundation/produtor/financeiro continuam true, scope `b2b-context`, Blob false e v6 global fechado. Não há monitor paralelo.

O recorte exige roles exatamente `[administrador]` e organization UUID válido. Não inclui superadmin/plataforma, orgNULL ou roles compostos. Consulta h15 → perfil próprio → user_roles self com cardinalidade 1 → has_role self → h15 final, pelo cliente Supabase canônico. Erros, ativo não true, senha provisória, UID/tenant/role divergentes e timeout falham fechado. Leituras separadas não são snapshot/revisão monotônica; não comprovam ABA ou transientes entre polls. Não revoga retroativamente bytes/URLs emitidos.

Confirmações idênticas renovam apenas lease, preservando draft/modal sem refresh/epoch/remount. B2B mantém seu refresh publicado. Mudança observada, expiry, revalidação explícita e identidade invalidam cache e desmontam página/menus; restore autorizado remonta vazio, sem recuperar drafts. Não amplia revogação de entidades ou entitlements; o servidor continua autoritativo para novas requests.

## Evidência externa fornecida pelo auditor

- Admin B, papel exclusivo administrador e tenant B válido: inativação CAS `2026-10-19T00:35:28.282807Z`; mesma `/financeiro/receber` aos `00:35:52.378Z` (>24s) ainda exibiu menus/Nova Conta sem reload/navegação. Restore CAS `00:36:06.125554Z`. Isso prova retenção visual, **não prova novas requests HTTP autorizadas**.
- Publicação anterior do comprovante: seis hashes, staging 2/2 e seis helper cases independentes PASS; diálogo abriu/cancelou sem confirmar, pagamentos 3 e recebíveis 2 inalterados. Anexo de baixa vigente **não homologado**: recebimento A estornado e legados orgNULL. Schema não possui UNIQUE owner/path; `23505` fake não prova corrida nem idempotência global concorrente.
- Pós-migração `financial_document_owner_integrity`: financeiro A no preview `QMZ-AAz8` realizou upload Outro/abertura de `CultivoFarm-Auditoria-PosMigracao-20261019.txt`, doc `b2c80d34-eeae-4e9d-97fc-8eb5191ebf3e`, tenant A, owner RECEIVABLE existente, uploader financeiro A. Dois arquivos de teste, sem pagamentos. Login B real publicado mostrou zero contas, confirmado. Evidência informada, não repetida aqui; não é teste HTTP direto signer.
- Redirecionamento produtor → financeiro em aba antiga `CkCa` terminou em acesso-pendente; rota financeiro correta abriu. Pendência **UX separada**, não evidência de autorização nem mudança incluída na candidata.

## Verificação local

`bun run test --` com integrações admin/financeiro/produtor/B2B/foundation, gates reais, B2B release, painel de anexos, comprovante e diálogo: **10 arquivos / 241 testes PASS**. Admin usa AuthProvider, monitor, ProtectedRoutes, AppLayout, boundary e QueryClient reais; página admin e transportes/session são stubs explícitos. Prova pending sem menus/dados, dois polls idênticos com draft/modal, inativação/role/tenant, retry negado/restore, timeout/offline/tardios, UID novo, papéis compostos/org inválida, has_role estritamente true e erros em cada leitura canônica. **Não é usuário autenticado real, JWT/RLS, Storage ou homologação SQL**. Warnings JSDOM/Recharts preexistentes não falharam.

Build/typecheck são automáticos do harness, não executados manualmente. Resultado atual deve ser confirmado no último registro antes da entrega. O gate admin false impede alegar correção já ativa em produção/preview; teste live gate-on depende da revisão/ativação do proprietário.

## Preflight e staging/rollback

`scripts/authz-cache/company-admin-open-session/preflight-readonly.sql.review`: arquivo integral SELECT-only em transação READ ONLY com timeouts/ROLLBACK. Auditor deve comprovar ref `swzpzcwiasxmjutrmvkm` no conector **antes de executar**; marker guard adicional falha em ref ausente/divergente/NULL. Hashes fixos de cinco funções canônicas, owner/ACL/search_path/definer/volatility e dois checksums de policies seguem baseline do preflight financeiro existente. **Não foram reconfirmados hosted neste turno**: qualquer drift exige interrupção e revisão, nunca adaptar/aplicar automaticamente. Verifica RLS/SELECT; reporta ACL/owners/checksums e inventário de triggers. Inventário de readiness é agregado sem expor identidades/linhas. Não contém DDL, testes de login ou reparo de dados.

`manifest.json` declara SHA256 byte-exato de fontes protegidas, candidate/rollback e preflight. `stage.py candidate|rollback|activation|deactivation <diretório externo vazio>` somente gera cópias revisáveis: nunca instala no projeto ou publica. Todos os hashes são verificados antes de escrever; mudança posterior em monitor, gates, guard, anexos ou artefatos recusa a operação. Baseline rollback é 07d27698 para os arquivos tocados neste recorte; arquivos novos são listados para remoção revisada, nunca removidos pelo script.

Activation é cópia com **somente admin false→true**; deactivation copia a candidata false, preservando produtor/financeiro/foundation. Rollback completo restaura apenas arquivos deste recorte ao baseline, sem reverter anexos/monitores publicados. Não usar cópia sobre HEAD divergente; não há instalação CAS automática nem atomicidade de filesystem em falha de escrita. Testes de staging verificam quatro modos byte-exatos, drift sem saída parcial, destino protegido e UTF-8/LF/CRLF.

## Pendências e riscos

Preflight canônico integral, revisão/ativação e login real admin em tela aberta aguardam o proprietário. Após ativação: conferir mesma URL, pausa de menus/dados sem reload após inativação/role/tenant, retry negado e restore vazio; comparar produtor/financeiro/B2B e drafts/modais >35s. Sem prazo rígido de detecção, ABA/transientes ou equivalência entre SQL claims e login. Sem aceite global, contratos concluídos ou ampliação de Blob/v6.
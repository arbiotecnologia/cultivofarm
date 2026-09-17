# FASE 0 — Auditoria somente leitura do vínculo (Cultivo Farm)

Nada foi alterado: sem banco, sem migration, sem deploy, sem emissão. Apenas leitura de arquivos, execução do gate estático e da bateria de testes de vínculo.

## Evidências atuais (coletadas agora, não histórico)

1. **Código canônico — conforme.** Os quatro pontos de vínculo ativo apontam exclusivamente para `swzpzcwiasxmjutrmvkm`:
   - `src/integrations/supabase/client.ts:7` (URL literal, sem `import.meta.env`)
   - `src/integrations/supabase/bindingGuard.ts:1`
   - `src/config/fiscalBinding.ts:12`
   - `supabase/config.toml:1` (`project_id`)
   - `supabase/functions/_shared/fiscal/canonicalProject.ts:9`
2. **Arquivo `.env` gerado pelo ambiente — divergente.** Existe na raiz (188 bytes, carimbo 17/09 21:47), gerado pela integração gerenciada, e contém três variáveis:
   - `VITE_SUPABASE_PROJECT_ID` = ref proibido `yzszlzjpovmcteuxjznj`
   - `VITE_SUPABASE_URL` = host do mesmo ref proibido
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = chave publicável do mesmo projeto (valor não exibido)
   Nenhum segredo é mostrado neste relatório.
3. **Impacto real do `.env`: nulo em runtime.** Nenhum arquivo de `src/`, `scripts/` ou `supabase/functions/` lê `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID` ou `VITE_SUPABASE_PUBLISHABLE_KEY` — as únicas ocorrências são asserções negativas dentro dos próprios testes de vínculo. O cliente usa constantes literais protegidas por `assertCanonicalSupabaseBinding`.
4. **Artefato de build — conforme.** Em `dist/`, dois arquivos contêm `swzpzcwiasxmjutrmvkm` e **zero** arquivos contêm qualquer ref proibido. O build publicável não carrega o ref do `.env`.
5. **Falha de teste identificada e reproduzida.** É exatamente uma, e é o comportamento fail-closed esperado:
   - `restoration/homologacao-h7/check-frontend-binding.sh` termina com código 10 e mensagem `H7d BINDING GATE: ABORT — .env VITE_SUPABASE_PROJECT_ID='yzszlzjpovmcteuxjznj' != CultivoFarm esperado`.
   - Isso reprova o caso `o gate aprova o binding atual e não expõe segredos` em `src/test/config/binding-gate.integration.test.ts`.
   - Bateria de vínculo executada agora: **29 aprovados, 1 reprovado** (somente o caso acima), nos seis arquivos listados abaixo.
6. **Refs proibidos no restante do repositório.** Fora do `.env`, as ocorrências estão em documentação, auditorias, artefatos históricos, harnesses de teste e scripts de restauração — nenhum em caminho de runtime do app. Casos que merecem atenção posterior (fora desta fase): `tests/harnesses/visita-atendimentos-runtime-harness/`, `e2e/base-tecnica-redirect.spec.ts`, `supabase/tests/motor-b2b/fase1/01-pricing-credit-harness.sql`.
7. **Ambiente fiscal.** `supabase/config.toml` declara `verify_jwt = true` para `fiscal-sefaz-transport` e `fiscal-xml-engine`; ambas seguem **prontas para deploy e não publicadas**, coerente com o inventário de Edges que você consultou.

## Paths solicitados

Testes de vínculo:
- `src/test/config/binding-gate.integration.test.ts` (único reprovado)
- `src/test/config/connection-binding.static.test.ts`
- `src/test/config/cultivofarm-runtime.static.test.ts`
- `src/test/config/fiscal-binding.test.ts`
- `src/test/config/pwa-binding-hardening.test.ts`
- `src/test/config/canonicalTypesGuard.test.ts`

Guards:
- `src/integrations/supabase/bindingGuard.ts` (bloqueio antes de criar o cliente)
- `src/main.tsx` (tela "Conexão bloqueada" se o vínculo falhar)
- `src/config/fiscalBinding.ts` (fail-closed fiscal por ref de runtime)
- `supabase/functions/_shared/fiscal/canonicalProject.ts` (alvo canônico nas Edges)
- `restoration/homologacao-h7/check-frontend-binding.sh` (gate estático)
- `scripts/fiscal-release-gate.sh`

Relatório mais recente: `docs/auditorias/cultivo-farm-fiscal-correcao-final.md` (17/09 22:23).

## Diagnóstico da falha e mecanismo exato de correção

O arquivo `.env` é **gerado e sobrescrito pela integração gerenciada da plataforma**, não pelo código. Ele está listado em `.gitignore` (linhas 36–37). Editá-lo aqui não resolve: a próxima regeração o reescreve com o mesmo ref.

Existem duas saídas, e a escolha é sua:

- **Opção A — corrigir na origem (recomendada).** A integração gerenciada do projeto Lovable precisa ser reapontada/desvinculada do backend interno para parar de emitir `yzszlzjpovmcteuxjznj`. Isso é uma ação de configuração do projeto, fora do alcance do código; enquanto não ocorrer, o gate continuará reprovando — corretamente.
- **Opção B — reconhecer o `.env` como não autoritativo.** Ajustar o gate e o teste para tratar o `.env` gerenciado como ruído comprovadamente inerte (nenhum consumidor no código, nenhum vestígio no build), mantendo a reprovação fail-closed apenas para `client.ts`, `config.toml` e artefatos de build. Isso torna a suíte verde sem afrouxar a proteção real.

Nenhuma das duas será executada agora — esta fase é somente leitura, conforme solicitado.

## Limites respeitados

Sem consulta a projetos antigos, sem Cloud DB, sem deploy, sem migration, sem emissão, sem exibição de chaves ou segredos, sem avanço de fase.

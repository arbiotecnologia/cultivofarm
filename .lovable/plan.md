## Objetivo

Recriar o projeto do zip `lovable-678a7573.zip` 1:1 dentro deste repositório, mantendo a stack original (Vite + React Router DOM + Tailwind v3 + shadcn) e conectando ao mesmo Supabase (`pcjzpvhbizccjtegekbb.supabase.co`) já usado pelo `.env` do zip.

## Passos

1. **Limpar o template TanStack Start atual**
   - Remover: `src/routes/`, `src/router.tsx`, `src/server.ts`, `src/start.ts`, `src/routeTree.gen.ts`, `src/styles.css`, `src/lib/error-*.ts`, `src/hooks/use-mobile.tsx`, `src/lib/utils.ts`, `vite.config.ts`, `tsconfig.json`, `components.json`, `eslint.config.js`, `bunfig.toml`, `package.json`, `bun.lock`, `.prettierrc`, `.prettierignore`, `AGENTS.md`, `public/favicon.ico`.
   - Manter apenas `.gitignore` e `.lovable/`.

2. **Copiar o conteúdo do zip para a raiz do projeto** (excluindo `.git`, `node_modules`, `bun.lockb`, `package-lock.json`, `.lovable/plan.md`, testes E2E opcionais mantidos):
   - Diretórios: `src/`, `public/`, `supabase/`, `docs/`, `e2e/`, `tests/`, `scripts/`.
   - Arquivos raiz: `index.html`, `package.json`, `bun.lock`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `tsconfig*.json`, `components.json`, `eslint.config.js`, `playwright.config.ts`, `playwright-fixture.ts`, `vitest.config.ts`, `README.md`.

3. **Wiring Supabase**
   - Criar `.env` com as credenciais publicáveis do zip:
     ```
     VITE_SUPABASE_URL="https://pcjzpvhbizccjtegekbb.supabase.co"
     VITE_SUPABASE_PUBLISHABLE_KEY="<anon key do zip>"
     VITE_SUPABASE_PROJECT_ID="pcjzpvhbizccjtegekbb"
     ```
   - `src/integrations/supabase/client.ts` já lê essas variáveis — nenhum código muda.
   - Nada de `supabase--enable`: o projeto continua apontando para o Supabase existente do usuário. Migrations e edge functions do diretório `supabase/` ficam como referência/histórico; não serão reaplicadas.

4. **Instalar dependências e verificar build**
   - `bun install` para regenerar `node_modules` com o `package.json` novo.
   - Rodar `bun run build` para validar que compila. Ajustar apenas erros bloqueantes de import/typescript se aparecerem.

5. **Preview**
   - Reiniciar o dev server. O app deve subir na rota `/` do `src/App.tsx` original, conectado ao Supabase do usuário. Login/perfis funcionam contra o projeto Supabase existente.

## Fora do escopo

- **Não** vou reaplicar as 486 migrations nem reimplantar as 19 edge functions — o Supabase de destino já é o mesmo do zip, então já as tem. Se você quiser aplicá-las em um projeto novo, é outra tarefa.
- **Não** vou rodar Playwright/E2E — só build + preview.
- **Não** vou migrar para TanStack Start (você escolheu manter Vite/React Router).

## Riscos

- A chave anon está commitada no `.env` (é publicável, seguro).
- Como a stack muda de TanStack Start para Vite puro, o preview do Lovable precisa reiniciar; qualquer configuração específica do template atual (SSR, `start.ts`) deixa de existir.
- Alguns imports do projeto do zip podem depender de pacotes que precisam de flags específicas (ex.: `xlsx` vindo de URL da SheetJS). Se `bun install` falhar em algum deles, resolvo pontualmente.

## Fase Fiscal 3.17 — Homologação operacional isolada e auditável

Orçamento desta rodada: 35 créditos. Escopo estrito, sem aplicar banco nem deploy.

---

### Parte A — Central de Homologação (frontend)
- Nova aba **"Homologação"** em `src/pages/configuracoes/FiscalEmpresa.tsx` (reuso da página existente; sem nova rota).
- Novo componente `src/components/fiscal/homologacao/HomologacaoSecao.tsx`:
  - Checklist somente-leitura (ambiente, produção off, dados empresa, NF-e, NFS-e, ≥1 produto/serviço/cliente prontos, certificado ativo, cofre disponível, funções disponíveis via probe seguro, RPCs presentes, contagem de rascunhos por estado).
  - Estados pt-BR: Pronto, Incompleto, Bloqueado, Indisponível, Não configurado.
  - Ações: "Ir para Empresa/Produtos/Serviços/Clientes/Certificado Digital", "Criar rascunho" (link para `/fiscal/documentos`), "Atualizar verificação" (refetch).
  - Sem botões de Emitir/Transmitir/Autorizar/Produção.
- Novo hook `src/hooks/useFiscalHomologationReadiness.ts` chamando a RPC via `supabase.rpc`, com tipo local estreito. Fail-safe para "Indisponível" quando a RPC ainda não estiver no schema.
- Gate de aba: administrador, gestor, financeiro (via `useAuth().roles`).

### Parte B — Migration canônica read-only
- `supabase/migrations/20260725000000_fiscal_fase3_17_homologation_readiness.sql`:
  - `create or replace function public.rpc_fiscal_homologation_readiness() returns jsonb`
  - `security definer`, `set search_path = public, pg_temp`, `stable`.
  - Gate: `has_role(auth.uid(),'administrador'|'gestor'|'financeiro')` senão `raise exception 'FISCAL_FORBIDDEN'`.
  - Lê apenas views/tabelas fiscais existentes; nunca `http`, nunca escreve.
  - Retorna JSON estável: `{ status: 'READY'|'INCOMPLETE'|'BLOCKED'|'UNAVAILABLE', checklist: [{key,label_ptbr,status,detail}], counts:{drafts_total, drafts_ready, drafts_incomplete, drafts_blocked} }`.
  - `production_enabled=true` → `BLOCKED`. Ambiente ≠ HOMOLOGATION → nunca `READY`. Certificado precisa estar ATIVO/AVAILABLE e dentro de validade para READY.
  - Não retorna fingerprint, serial completo, subject, object_path, material.
  - `revoke all on function ... from public, anon;` + `grant execute ... to authenticated;`.
- Stub documental em `restoration/migrations/20260725000000_fiscal_fase3_17_homologation_readiness.sql` (sem SQL executável, apenas cabeçalho de redirecionamento igual ao padrão da fase anterior).

### Parte C — Tipos
- Regeneração oficial não é possível (sem CLI). Criar tipos locais estreitos em `src/lib/fiscal/homologationReadiness.ts` (ChecklistItem, ReadinessResult, unions pt-BR). Sem `any`, sem cast global. Documentar pendência de regeneração no cabeçalho do arquivo.

### Parte D — Fixtures staging
- `restoration/fiscal-homologation-fixtures/` com:
  - `README.md` (pt-BR, uso manual, guardas).
  - `01-preflight.sql` — checa `public._fiscal_staging_marker` com `marker='STAGING'`; aborta senão.
  - `02-seed.sql` — insere fixtures com prefixo `FISCAL_HML_` (2 clientes, 1 produto pronto, 1 serviço pronto, rascunhos NF-e válido / NFS-e válido / incompleto, snapshots por item; nenhum status AUTHORIZED/ISSUED; nenhum certificado).
  - `03-verify.sql` — asserts (zero produção, zero AUTHORIZED/ISSUED, DRAFT/NONE/MANUAL_RECORD apenas, prefixos, totais, snapshots).
  - `04-cleanup.sql` — DELETE limitado a `LIKE 'FISCAL_HML_%'`, sem CASCADE amplo.
- Sem senha, JWT, URL, project ref.

### Parte E — Permissões e UX
- Aba visível apenas para administrador/gestor/financeiro. Sem alterar home/menu global. Buscador global já cobre a página; adicionar termo "Homologação fiscal" no title da aba.

### Parte F — Testes
- Ampliar `src/test/fiscal/fase3_16.static.test.ts` (ou novo `fase3_17.static.test.ts`) com asserções:
  - Migration 20260725 existe, contém REVOKE FROM PUBLIC/anon, GRANT authenticated, gate has_role, sem `http`, sem `insert/update/delete`, sem `alter`.
  - RPC não retorna fingerprint/serial/object_path (regex no SQL).
  - `HomologacaoSecao.tsx` não contém `Emitir|Transmitir|Autorizar|Produção` como botão, contém labels pt-BR.
  - Fixtures: 01-preflight exige marker STAGING; 02-seed usa `FISCAL_HML_`; sem `AUTHORIZED`/`ISSUED`; 04-cleanup restrito a prefixo, sem CASCADE.
  - Stub restoration sem SQL executável.
  - `homologationReadiness.ts` não usa `any`.

### Validação
- `bun run typecheck`, `bun run build`, `bunx vitest run src/test/fiscal`.
- Nenhum deploy, nenhuma migration aplicada, nenhuma alteração no banco principal, `production_enabled=false` mantido.

### Fora de escopo
Aplicação da migration, deploy de Edge, ativação de emissão, integração com provedor, alterações em RLS não fiscal, criação de rotas novas, alteração de motor financeiro/B2B.

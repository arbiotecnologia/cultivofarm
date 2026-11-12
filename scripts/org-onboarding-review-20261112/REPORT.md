# Onboarding com revisão obrigatória e contenção da Central Fiscal — 12/11/2026

Base: captura somente leitura do banco oficial `swzpzcwiasxmjutrmvkm` (`live-capture/capture.json`, MD5 por função).
Nada foi aplicado no banco hospedado nem publicado.

## Causa
- `org_onboarding_complete` (MD5 d6cb2a2f…) sempre chamava `_org_set_status(v_org,'ativa',…)`.
- A tela, ao retomar rascunho, criava localmente `situacao_cadastral: "ATIVA"`, e o “manual” era só estado do navegador.

## Instalação (operador, pelo conector)
1. `install.sql.review` — transação única: preflight (pins MD5 + fixture homolog + bloqueio de rerun) → `01-core.sql` → `02-fiscal-guard.sql` (gerado) → postflight (ACL, gatilhos, políticas).
2. Edge `supabase/functions/onboarding-cnpj-lookup/index.ts` — grava a evidência via `svc_onboarding_record_cnpj_evidence` (EXECUTE só service_role; usa `SUPABASE_SERVICE_ROLE_KEY` já existente na função). Antes da migração a chamada falha e a consulta continua funcionando (evidência ausente ⇒ revisão).
3. Frontend (sem publicar daqui): tela “Cadastro em revisão”, fila/aprovação/remessa na Plataforma.
4. Remeter a Homologação CultivoFarm 20261001 (`442444d9-263f-45d9-a991-a679498d06c3`): Plataforma → Empresas → abrir → “Remeter à revisão” (superadmin, motivo). Não há SQL direto: exige `auth.uid()` de superadmin.
- Rollback: `04-rollback.sql.review` (deny-only).

## Testes executados
- `tests/test_pg.py` — PostgreSQL 17 descartável com corpos LIVE (MD5 iguais), claims SQL sintéticas e `session_user=authenticator` (guard real de organizations): **51/51** (`evidence/pg-run.json`).
- Vitest: `org-onboarding-review.test.tsx` 5/5; arquivos relacionados 504/504.
- Playwright (`tests/browser_review_screen.py`): Chromium 1280×1800 e 390×844 toque, rede Supabase simulada; tela pendente em `/` e acesso direto a `/configuracoes/fiscal/empresa`, recarga, sumiço após aprovação (`evidence/browser/`).

## Limites
Não prova JWT/PostgREST/Edge/BrasilAPI hospedados; navegador usou respostas simuladas. Auditor deve repetir com sessões reais após instalar.

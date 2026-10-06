# Sucessão de versão comercial publicada — 2026-10-06

## Causa raiz
1. `platform_publish_plan_version_draft` recusava qualquer sucessora: a v1 PUBLISHED tem `effective_to NULL`, e a checagem de sobreposição tratava toda vigência aberta como conflito; não havia fluxo para encerrar a antecessora (o trigger `saas_plan_version_no_mutation` bloqueava qualquer UPDATE em PUBLISHED).
2. Editor: sem DRAFT, o formulário ficava vazio, sem indicar que a v1 é imutável; o id enviado ao salvar não era filtrado por status.

## Correção
- Migration `20261006225758_e18b38b3-483c-4399-a518-c10853602353.sql`:
  - novo escopo de ticket `saas_plan_version_supersede`;
  - trigger permite em PUBLISHED somente `effective_to: NULL -> valor > effective_from`, com todos os demais campos idênticos e ticket;
  - publicação com advisory lock por plano; falha fechada com >1 versão vigente, início ≤ anterior ou sobreposição; encerra a antecessora em `effective_to = início da nova`; auditoria `superseded` + `published` com ator, motivo, origem e chave; retry com mesma chave devolve o mesmo id; mesma chave em outro rascunho = conflito.
- Migration `20261006230004_972d3b64-bf26-46a3-9d31-f5283904060e.sql`: inclui `superseded` na lista de ações válidas da auditoria (a prova pegou essa falha).
- Frontend (`VersaoComercialEditor.tsx`, `commercialDraftState.ts`): sem DRAFT, carrega a última PUBLISHED como origem com `draftId=null`, limpa a vigência, mostra aviso de imutabilidade e botão "Criar nova versão"; `draftIdParaSalvar` só envia id de DRAFT.

## Evidências (banco real, transação desfeita — `supabase/tests/prova-comercial-positiva/02-sucessao-versao-rollback.sql`)
- anon e admin de empresa: salvar negado.
- Salvar com id PUBLISHED: negado (`rascunho inexistente`).
- Novo rascunho = versão 2; segundo salvar atualiza o mesmo rascunho; 1 DRAFT.
- Vigência anterior e igual: negadas; após a falha, v1 continua com `effective_to NULL` (rollback do bloco).
- Confirmação errada: negada.
- Publicação: v2 PUBLISHED; retry mesmo id; 1 auditoria `published` + 1 `superseded`.
- v1: continua PUBLISHED, `effective_to = início da v2`, conteúdo (sem `effective_to`/`updated_at`) inalterado.
- Mesma chave, outro rascunho: conflito.
- UPDATE direto de preço da v1: negado.
- Assinaturas idênticas; pagamentos 0/0 → 0/0.
- Encerrar v2 por UPDATE direto na mesma transação da publicação: **negado** após o hardening (ticket vinculado ao id exato da antecessora).

## Hardening final (migration `20261006231457_d6fdffbd-2973-4016-9cf2-bd64cbf0cc2c.sql`)
- Ticket `saas_plan_version_supersede` agora tem como alvo o id exato da versão antecessora; a emissão exige versão PUBLISHED com vigência aberta (demais escopos continuam validando o plano); o trigger exige `has_ticket(..., OLD.id)`; a publicação emite com `prev.id`.
- Retry com mesma chave/mesma versão só devolve o id se o motivo normalizado for igual ao original; motivo divergente → `platform_conflict`; mesma chave em outra versão → conflito; sem auditoria duplicada.
- Prova transacional com rollback: retry com motivo normalizado igual = mesmo id (auditorias 1 published + 1 superseded); motivo divergente = conflito, auditorias continuam 2; encerrar v2 na mesma transação = negado; ticket para versão já encerrada = negado; v1 conteúdo inalterado; assinaturas iguais; pagamentos 0/0.
- O risco residual registrado antes foi eliminado.

## Estado real após a rodada
1 PUBLISHED (v1, hash `ea28551e…` igual ao inicial, `effective_to NULL`), 0 DRAFT, 0 auditorias `superseded`, 5 assinaturas sem versão, pagamentos OFF. A v2 real não foi publicada.

## Testes
Suíte completa 5.540 passaram / 4 pulados; typecheck, ESLint focado, build e scanner de segredos OK. Novos: `src/test/saas/plan-version-succession.test.ts`, `src/test/saas/plan-version-succession-editor.test.tsx`. Advisor: 466 achados preexistentes, nenhum novo.

## Rollback
Forward-fix: recriar as três funções com as definições anteriores e a constraint sem `superseded` (só se não houver linhas com essa ação).

## Não verificado
Fluxo na tela com login real de Superadmin; concorrência real com duas sessões simultâneas (protegida pelo advisory lock, não provada).

## GO/NO-GO
GO para criar v2 em rascunho e publicar sucessora com segurança. Publicação real da v2 continua sendo decisão humana. Prova comercial positiva A/B/C: NO-GO até a vigência da v1 começar (2026-10-07 03:13 UTC).

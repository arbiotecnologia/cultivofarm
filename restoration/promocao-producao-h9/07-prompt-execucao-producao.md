# Prompt de execução em produção — NÃO EXECUTAR AINDA

Este arquivo é o texto a ser enviado quando, e somente quando, todos os gates do
runbook estiverem comprovados. Ele **não autoriza** nada por si só.

---

## FASE P1-EXEC — PROMOÇÃO CONTROLADA H9, ONDA P1 (BANCO DE PRODUÇÃO)

AUTORIZAÇÃO
Autorizo expressamente a escrita no banco de PRODUÇÃO `navfzbwgwzruipouyfnk`,
limitada à ONDA P1 do plano `restoration/promocao-producao-h9/02-plano-ondas.md`.
Nenhuma outra onda, nenhum outro ambiente, nenhuma outra migration.

LIMITES
- Sandbox `yzszlzjpovmcteuxjznj`: proibido.
- Homologação `ikaauvsflpmamgxmkhoq`: somente leitura nesta janela.
- Proibido publicar frontend, deployar Edge Function, copiar dados, criar
  usuários, alterar `tpAmb`, ligar flags de entrega ou disparar e-mail,
  WhatsApp, webhook, `pg_net`, `cron` ou SEFAZ.
- Proibido aplicar qualquer versão fora da lista da onda P1.
- Proibido aplicar as 59 migrations repo-only em quarentena.
- Proibido aplicar as 119 versões BLOQUEADA/REQUER_DECISÃO e as 2 STAGING_ONLY.

PROVAS EXIGIDAS ANTES DA PRIMEIRA ESCRITA
1. Backup/PITR de produção comprovado, com data e hora.
2. Restore point `pre_p1_h9` criado.
3. `03-prechecks.sql` executado no alvo, saída arquivada, sem achado bloqueante.
4. Diff de ledger produção × homologação conferido contra
   `01-manifesto-migrations.csv`.
5. Confirmação explícita, impressa, de que o alvo é `navfzbwgwzruipouyfnk`.
6. Snapshot das definições e ACLs das funções afetadas pela onda.

EXECUÇÃO
- Aplicar as migrations da onda P1 na ordem exata do manifesto, uma por vez,
  cada uma em transação própria, com `lock_timeout='5s'` e
  `statement_timeout='120s'`.
- Parar na primeira falha e aplicar `05-rollback-por-onda.md`, seção P1.

VERIFICAÇÃO
- `04-postchecks.sql` integral; qualquer consulta "esperado: 0 linhas" que
  retorne linha é ABORT.
- Advisors de segurança e performance comparados ao baseline; a onda não pode
  piorar o baseline aprovado da homologação (390 segurança / 503 performance) e
  deve caminhar para eliminar os 2 ERROR `security_definer_view` de produção.
- Smoke por perfil: administrador, gestor, financeiro, técnico agrônomo,
  consultor técnico, parceiro B2B e cliente produtor. Somente leitura.
- Confirmar zero eventos externos no período.

ENTREGA
Ledger antes/depois, saídas de precheck e postcheck, delta de advisors, resultado
do smoke, riscos residuais e veredito GO/NO-GO para abrir a janela da onda P2.
Não declarar "produção promovida" enquanto P2–P6 não estiverem concluídas.

---

Para as ondas seguintes, reutilizar este mesmo texto trocando a onda, a lista de
versões, o restore point e a seção de rollback. A onda P6 (frontend e Edge
Functions) exige prompt próprio e só após P1–P5 aprovadas.

# Recuperação canônica — candidata, não implantação

Destino exclusivo `swzpzcwiasxmjutrmvkm`. Nenhuma escrita hosted, publicação ou Edge deploy foi executada. O executor comprova o ref fora do SQL antes de qualquer operação; os arquivos não executam operações automaticamente.

## Arquivos
- `candidate.sql.review`: transação integral, 16 fingerprints de funções/ACL/owner/search_path/volatilidade e fingerprint de colunas/constraints/policies/triggers. Apenas RPC existente e Storage1 existente mudam; private receipts são criados sem grants/policies para cliente. Helper de leitura POST `04067ba43cea3eed845a1fd3735061e0` intocado.
- `preflight-readonly.sql`, `postflight.sql.review`: guardas e contagens, sem dados pessoais.
- `rollback.sql.review`: guarda POST, restaura corpos/ACL fechados exatos; preserva recibos/aplicações/objetos, não autoinstala e não apaga histórico. Depois de rollback, uma reaplicação exige revisão por destino ocupado, não DROP automático.
- `function.sql.review`, `storage.sql.review`, `setup.sql.review`: módulos legíveis concatenados por `assemble.py`, sem execução hosted.
- `test-local.py`, `local-setup.sql`, `results.local.json`: PG descartável socket-only, claims emuladas/schema reduzido. Não são JWT/login/Storage SDK real. Guardas hosted completas recusam schema reduzido; testes de instalação integral usam substituições explicitamente locais de guardas.
- `rollback/src`: cópias exatas dos formulários/unidades da base. Novo `src/lib/aplicacoes/salvar.ts` é removido somente depois da restauração dos callers; não tocar PDF/monitores/gates/Edges.
- `typecheck-independent.md`, `export-checkout.py`, `checkout-inputs.json`: checkout completo recuperável para checker app externo, sem declarar PASS automático.

## Contrato implementado
Mesma assinatura `rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[])`. `_phase=prepare|finalize` no JSON. Prepare autoriza ator h15/papéis/vínculos/referências e congela payload/manifest/keep antes de permitir somente os locators declarados ao próprio ator, por 15min. Não insere aplicação parcial nem libera bucket. Finalize reautoriza antes de todo replay, verifica Storage `bucket/name/owner/metadata.size/mimetype/version`, cria aplicação/evidências/vínculos e troca `is_latest` na mesma transação. Retries idênticos usam UUID/manifest congelados. Retificação concorrente tem um vencedor. Legacy_closed permanece sem EXECUTE.

Dose real é explicitamente escolhida pelo operador em `mL/ha`, não inferida de recomendação nem catálogo; total em mL calculado e conferido no servidor. Não altera unidades históricas nem oferece conversão kg/L. Não finaliza OS, não chama notificações/e-mail/financeiro.

## Limites de revisão / NO-GO para aplicação automática
- Revisão13:25: PostgreSQL104/104 PASS e Vitest194/194 dirigidos (aplicações/PDF/monitor/diagnóstico). Storage revalida carteira inclusive mixed-role, responsável/roles/readiness, lote e status OS. Novas somente entregue/pronto_entrega/envase; retificação também finalizada. Mobile harmonizado com desktop. Schema reduzido não reproduz cada trigger/RLS de produção; metadata Storage sintética não prova bytes reais/MIME. PostgreSQL não inspeciona bytes do bucket: metadata é evidência Storage API, não antivírus/magic-byte audit.
- Writers concorrentes de criação de roles/invites, troca de memberships e locks de outros módulos não estão certificados globalmente. Locks de linhas existentes e rechecks reduzem corrida, não certificam todos os writers externos/ABA.
- Preparações expiradas e objetos parcialmente enviados podem permanecer órfãos. Sem cleanup destrutivo automático, sem prolongar preparação em retry. Expiração não inventa nova autorização; recuperação/limpeza exige alvo comprovado e revisão própria.
- Alteração Storage1 torna objetos finalizados imutáveis e nega novas mutações genéricas em pai finalizado. Necessita revisão de callers legados e teste Storage real antes de aceite; rollback restaura baseline mas não remove dados novos.
- Auditor informou tsc -p tsconfig.app.json --noEmit EXIT0 e119/119 independentes na exportação anterior1668 arquivos. Novos inputs desta revisão ainda exigem checker externo; não foi executado checker manual pelo agente. Build não substitui checker. Não retroagir ou transferir PASS entre snapshots.
- Homologação A/B positiva, upload real, retificação real, revogação durante upload e geração PDF são pendentes da implantação revisada e fixture técnica autorizada. Financeiro A não recebe papel técnico por conveniência de teste.

Não habilita v6/global/Blob, não avança contratos B2B, não modifica sessões/perfis em produção.
# Correção do salvamento fiscal original — 12/11/2026

## Causa e caminho efetivo
- Rota real: `/configuracoes/fiscal/empresa`, montada em `src/App.tsx` por `RoleGuard` → `src/pages/configuracoes/FiscalEmpresa.tsx`.
- Ambos os botões de salvar chamam `useUpdateFiscalCompanySettings` → `buildUpdatePayload` → cliente Supabase canônico → **PATCH `/rest/v1/company_fiscal_settings?id=eq.<id>&organization_id=eq.<empresa>&configuration_version=eq.<revisão observada>`**.
- Não existe Edge nem RPC de salvamento nesta cadeia. `rpc_fiscal_company_settings_init()` é somente inicialização. RTC, certificado e revisão contábil são caminhos independentes e não foram alterados.
- Causa encontrada na fonte original: o seletor/schema aceitava `READY_FOR_HOMOLOGATION` e o payload o copiava sem tradução. Esse valor pertence a outro vocabulário de prontidão (`last_validation_status`), não ao CHECK de `configuration_status`.
- A constraint canônica aceita `DRAFT`, `PENDING_ACCOUNTING`, `VALIDATED`, `BLOCKED`, conforme confirmação do proprietário e fonte SQL local. Antes da correção, `VALIDATED`/`BLOCKED` também eram convertidos em `DRAFT` ao reabrir.
- Sem acesso remoto, não foi capturado o corpo HTTP das quatro falhas de produção. A causa reproduzida corresponde exatamente à constraint informada; não se afirma inspeção de logs hosted.

## Alterações mínimas
1. `src/lib/fiscal/companyFiscalValidation.ts`: quatro estados canônicos para leitura; `configuration_status` e atestados contábeis omitidos no save. Nunca traduzir “pronto” em `VALIDATED`. NF-e/NFS-e operacionais continuam false, produção não entra no payload; preparação/identificação/JSON/referências continuam preservados.
2. `src/pages/configuracoes/FiscalEmpresa.tsx`: status apenas leitura, rótulos reais; erro/refetch não rebasa rascunho sujo nem sua revisão observada. Sucesso confirmado adota retorno; troca de ator/empresa/época limpa rascunho; consulta CNPJ também marca edição. Nenhum novo papel ou gate.
3. `src/hooks/useFiscalCompanySettings.ts`: consultas/cache por ator/empresa, filtro explícito de empresa, sem `LIMIT 1` escondendo ambiguidade; captura de escopo antes/depois do transporte, CAS positivo, retorno conferido, sem retries de escrita. RLS original continua autoridade; não foi alterada.
4. `src/lib/fiscal/labels/index.ts`: rótulos de `VALIDATED`/`BLOCKED`. Rótulo histórico READY mantido para consumidores fora do save.

## Provas e limites
- `src/test/fiscal/companyFiscalSave.original.test.tsx`: formulário **original** e hooks/SDK reais; somente fetch substituído por transporte sintético sem rede. AR Bio fictícia, quatro estados, reabertura, campos, erros 23514/42501/PT409, refetch sujo, revisão CAS antiga, negativa de outro tenant e Financeiro/Gestor/Comercial/Técnico sem save. Cada saída PATCH exata em `evidence/payloads/*.json`.
- `test_pg.py`: PostgreSQL **socket-only**, CHECK extraído da fundação canônica, colunas/checks da central, helper/trigger e expressões RLS H15 extraídos dos bytes originais; 26 checks. Reproduz READY inválido com o nome exato da constraint; executa os mesmos payloads JSON capturados pelo SDK, lê novamente, verifica quatro estados/atestados preservados, CAS zero, Financeiro/empresa estrangeira e CHECK intacto.
- Costuras declaradas: identidades/tabelas de perfil/roles sintéticas e colunas aditivas para o recorte; RLS predecessor recriado com expressões H15. Não existe emissor, callback, NF, cobrança nem provedor no harness.
- O espelho completo r12 anterior (`/tmp/felig`, dump `/tmp/r12`) não está disponível nesta sessão. Este espelho **de componente** não certifica todos os triggers atuais do banco original, JWT, PostgREST hospedado nem sessão real. Não é renomeado como E2E completo.
- Falhas locais de preparação preservadas em `evidence/pg-attempt-1..3.txt`; quarta tentativa passou sem desativar controles. Evidência PostgreSQL e hashes de fontes em `evidence/pg.json`.

## Implantação / reversão
**Somente frontend.** Não há Edge alterada, migration, DDL/GRANT ou instalador servidor necessário. Constraint, revisão contábil, habilitações/gates e banco não devem mudar. O build público precisa de publicação **posterior autorizada** para receber esta correção; nada foi publicado aqui.
Revisar os quatro arquivos de runtime acima e testes. Não transportar `test_pg.py`, fixtures ou SQL de teste para produção. Reversão do frontend não exige banco, mas restauraria o defeito; manter salvamento contido se houver reversão.

Resultados finais e SHA-256: `evidence/vitest-final.txt`, `evidence/pg.json`, `evidence/build-final.txt` e `SHA256SUMS`.
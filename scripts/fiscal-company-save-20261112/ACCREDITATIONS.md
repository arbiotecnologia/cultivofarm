# Complemento independente — credenciamento declarado e PIS/COFINS

## Origem e implantação
Os campos existiam no banco/tipos, mas não no formulário ou no mapeamento de salvamento do projeto original. Integrados na aba **Empresa** da rota `/configuracoes/fiscal/empresa?aba=empresa`, ao lado de regime/CRT, utilizando o mesmo PATCH, autorização e revisão `configuration_version` do cadastro existente. Sem Edge/RPC/SQL novo: implantação somente frontend, publicação posterior autorizada necessária para o site público; não realizada.

## Contrato preservado
- `uf_accreditations` é array JSON. Exemplo canônico em `restoration/fase-f3/runtime-harness.sql:74` e `restoration/fase-f3-correcao/runtime-harness.sql:56`: `[{"uf":"GO","accredited":true}]`. A UI registra MG com o mesmo formato, **apenas** `uf`/`accredited`; não adiciona datas, ambiente, protocolo, evidência, resultado técnico ou contábil.
- Alteração no registro observado da UF por merge preserva chaves adicionais, ordem, outras UFs e entradas opacas; UF repetida impede edição sem escolher/descartar registros. Sem exclusão ou normalização retroativa. Arrays ausentes na resposta são omitidos do payload, não convertidos em vazio; null não é um array válido no schema canônico.
- `pis_cofins_regime` permite null, CUMULATIVO, NAO_CUMULATIVO, MISTO, SIMPLES_NACIONAL (domínio F3 canônico). Leitura null continua “Não informado”; nenhuma inferência de LUCRO_PRESUMIDO/CRT3. Escolha explícita pode ser apagada para null.
- Declaração de aptidão não comprova SEFAZ. `configuration_status`, `accounting_validated_at`, validação técnica, prontidão/gates/emissão continuam independentes. PIS/COFINS null não impede salvar; o bloqueio de cálculo/prontidão do servidor por regime ausente continua intacto.
- Conflito não refaz merge sobre dados novos: mantém rascunho/revisão antiga e falha CAS; nenhuma repetição automática. Troca de ator/empresa/época também retira o editor de declaração pendente. Permissões existentes mantidas.

## Arquivos
- `src/lib/fiscal/companyAccreditations.ts`: merge não destrutivo e domínio PIS/COFINS.
- `src/components/fiscal/CompanyAccreditationsFields.tsx`: declaração opcional por UF, sem metadados inventados.
- `src/lib/fiscal/companyFiscalValidation.ts`: leitura/payload/schema opcionais.
- `src/pages/configuracoes/FiscalEmpresa.tsx`: montagem na aba existente.
- `src/hooks/useFiscalCompanySettings.ts`: complemento de tipos, sem novo transporte ou autorização.
- Testes `src/test/fiscal/companyAccreditations.test.ts`, `companyAccreditations.pg.test.ts`, `companyFiscalSave.original.test.tsx`; harness componente `scripts/fiscal-company-save-20261112/test_pg.py`.

## Evidências e limites
Em `evidence/accreditations/`: payload exato do SDK, testes do formulário original e PostgreSQL socket-only, hashes das fontes e resultado. Fixture AR Bio fictícia LUCRO_PRESUMIDO/CRT3/PENDING_ACCOUNTING, PIS/COFINS null, MG/SP com metadados existentes. Verificações de merge/roundtrip, null, erro/conflito, CAS stale, isolamento e quatro estados contábeis. PostgreSQL reutiliza colunas/scanner/constraints F3 e H15 canônicos; identidades e colunas adicionais do recorte são sintéticas.
**Não é prova do espelho completo original, sessão JWT, PostgREST/RLS hospedado ou SEFAZ.** Nenhum dado hospedado lido/alterado, envio, emissão ou publicação. Tentativa inicial de harness falhou ao procurar scanner no arquivo F3 (fonte real é central F3.15); preservada, sem relaxar constraints; segunda tentativa passou.

Manifesto de revisão independente: `SHA256SUMS-accreditations`. Artefatos anteriores não constituem certificação do complemento.
# Fase 8 — Validação XSD oficial e regressão do XML (redução da base de cálculo)

Data: 2026-09-16 · Banco: swzpzcwiasxmjutrmvkm (nenhuma alteração de banco nesta fase)

## Escopo executado

- Validação automatizada do XML gerado contra o **XSD oficial NF-e 4.00**
  (`supabase/functions/fiscal-xml-engine/xsd/nfe_v4.00.xsd`) via `xmllint --schema`.
- Extensão da gramática interna fail-closed (`validateNfeXml.ts`) para os grupos
  passados a existir na Fase 4: `ICMS20` (com `pRedBC`), `ICMS40`, `ICMSSN101`,
  `ICMSSN102` e o grupo `IPI` (`IPITrib` / `IPINT`). Sem isso, o preflight
  reprovaria XML válido gerado pelo motor.
- Correção de defeito encontrado pela validação oficial: `dhEmi` era montado
  concatenando `T00:00:00-03:00` mesmo quando o payload já trazia data-hora
  completa, produzindo valor fora do padrão do leiaute. Agora normalizado
  (`normalizeDhEmi`): data pura recebe hora/offset; data-hora completa é
  preservada e só recebe offset se faltar.

## Arquivos alterados

- `supabase/functions/_shared/fiscal/nfe/validateNfeXml.ts` — gramática ampliada.
- `supabase/functions/_shared/fiscal/nfe/buildNfeXml.ts` — `normalizeDhEmi`.
- `src/test/fiscal/fase8.xsd.icms20.test.ts` (novo) — 3 testes XSD oficiais.

Migrations criadas: nenhuma. RPCs alteradas: nenhuma. RLS alterada: nenhuma.
Componentes React alterados: nenhum.

## Evidências

- `vitest src/test/fiscal/fase8.xsd.icms20.test.ts fase3_4.icms20 nfeXmlEngine`: **33/33 PASS**
  - ICMS20 com `pRedBC=60.0000`, `vBC=4000.00`, `pICMS=18.00`, `vICMS=720.00` → válido no XSD oficial.
  - ICMS20 + IPI apurado (`IPITrib`) → válido no XSD oficial.
  - Regressão sem redução (`ICMS00`) → válido no XSD oficial, comportamento anterior idêntico.
- `vitest src/test/fiscal` (suite completa): 1698 PASS, 6 FAIL pré-existentes
  (divergência de `types.ts`/SINIEF 49, sem relação com esta frente).
- `tsgo --noEmit`: sem erros. Build: OK.

Observação metodológica: `TNFe` exige `ds:Signature`; o teste anexa assinatura
sintética estruturalmente válida apenas para satisfazer a cardinalidade — o XML
de preparação continua não assinado e a emissão permanece desativada (tpAmb=2).

## Pendências

- E2E Playwright do RascunhoWizard (Admin / Financeiro / perfil sem permissão;
  desktop e mobile) — não executado.
- Fase 9 — homologação com NF-e sintética ponta a ponta no banco (preview →
  rascunho salvo → cálculo → XML → XSD) e cenário SEFAZ compatível — não executado.
- Troca da senha do banco.

## Riscos e rollback

- Risco baixo: alterações restritas a validação e formatação de `dhEmi`.
- Rollback: reverter os dois arquivos do motor XML e excluir o teste novo;
  nenhuma alteração de banco a desfazer.

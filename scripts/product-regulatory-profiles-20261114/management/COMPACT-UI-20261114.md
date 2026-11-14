# Refinamento da prévia — 14/11/2026

## Entregue
- Detalhe compartilhado nas entradas existentes: cobertura salva exibida uma vez; seleção e salvamento apenas ao expandir a edição.
- Anexos assumem a cobertura integral (`microorganism_ids: []`); restrição exige escolha explícita dentro da cobertura salva, sem alterar o contrato.
- Dados técnicos/MAPA agrupados; justificativa MAPA condicional, sempre acessível sob demanda. Valores existentes fora das opções atuais e textos longos/multilinha continuam acessíveis. Nenhum campo fiscal duplicado foi acrescentado.
- Pendências por assunto com atalhos; somente bloqueios semanticamente idênticos são deduplicados. Código/campo/camada/itens diferentes continuam distintos.
- Checklist formal completo recolhido; cada item tem expansão e edição individual. Cadastro e anexo não confirmam formalmente nenhum item.
- Edições recolhidas permanecem em memória; Atualizar/submissão não descartam alterações. Revisão observada não é rebaseada por releitura enquanto houver alterações. Visualização privada e retomada de reservas preservadas.

## Evidência executada
- `bun run test src/test/fiscal/productDossierManagement.test.tsx src/test/fiscal/productRegulatoryDossiers.test.tsx src/test/fiscal/dossierDocumentViewer.test.tsx src/test/fiscal/dossierTaskGroups.test.ts --maxWorkers=2`: **41/41 PASS** (4 arquivos).
- Inclui leitura/edição/CAS/conflito, cobertura expandida/recolhida, os 12 itens formais sem aprovação automática, anexo integral e restrição sem escolha bloqueada, retomada/descarte/limite/formato/hash, visualizador privado e revogação/escopo.
- Chrome Playwright com módulos reais de apresentação e leitores sintéticos, sem tráfego externo: **1280×1800 e 390×1800 PASS**, sem overflow ou pageerror; expansão/recolhimento conserva justificativa não salva. Capturas inspecionadas em `/tmp/browser/dossier-compact/`.
- Compilação automática: **build OK**, entrada mais recente consultada `2026-11-14T03:51:13Z`. Não executado build/typecheck manual.

## Limites
- Não é prova de sessão real, autorização JWT/RLS hospedada, IAB ou upload real; estes testes permanecem sintéticos. Não houve acesso ou alteração de Bombarbio/QA nem consulta administrativa de banco.
- Sem SQL, migração, alteração de Edge/ACL/API ou publicação. Limpezas e homologações pendentes anteriores não foram executadas neste recorte.
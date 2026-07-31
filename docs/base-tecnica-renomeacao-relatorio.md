# Relatório — Evolução "Protocolos" → "Base Técnica Agronômica" (staging)

## 1. Ambiente validado
- Staging autorizado: `ikaauvsflpmamgxmkhoq` (todas as consultas read-only foram executadas nele).
- Produção `navfzbwgwzruipouyfnk`: **não acessada**. Nada publicado, nada promovido, nenhum dado histórico alterado.
- Nenhuma entidade nova de protocolo foi criada.

## 2. Arquivos alterados
- `src/config/navigation.ts` — rótulo do menu e palavras-chave de busca.
- `src/pages/Protocolos.tsx` — H1, descrição e `document.title`.
- `src/components/protocolos/catalog/CropsManager.tsx` — acessibilidade, placeholder e ajuda contextual do campo "Objetivo agronômico".
- `src/test/protocolos/base-tecnica.rename.test.ts` — novo.
- `docs/proposta-entidade-protocolo-agronomico.md` — novo (proposta, sem implementação).
- `docs/base-tecnica-renomeacao-relatorio.md` — este relatório.

## 3. Nome anterior e novo
| Item | Antes | Depois |
|---|---|---|
| Menu | Protocolos | **Base Técnica** |
| Título da página | Protocolos Técnicos | **Base Técnica Agronômica** |
| Descrição | Cadastro de produtos, culturas, problemas e microrganismos | **Produtos, microrganismos, culturas, alvos e recomendações técnicas.** |

## 4. Rotas preservadas
- `/protocolos` mantida em `src/App.tsx` sob `RoleGuard`; id do item de menu (`protocolos`) e chave de permissão `"/protocolos"` inalterados.
- Busca do menu encontra "Base Técnica", "Produtos", "Culturas", "Alvos" e ainda "Protocolos" (compatibilidade).
- `/base-tecnica` **não criada**; permanece documentada como evolução futura com redirect compatível.
- Sem renomeação de tabelas, colunas, funções, pastas (`src/components/protocolos/**`) ou imports.

## 5. Correção de Cultura (P1) — auditoria
Diálogo de Cultura contém apenas **Nome** e **Descrição**. Sem aba de objetivos, sem salto automático, sem toast direcionando para visitas. `objetivos_visita_sugestoes` intacta (0 registros em staging, nenhum removido) e continua servindo Configurações → Objetivos de Visita e a Visita Técnica. Cadastro de cultura não cria registro de visita e não armazena objetivo de visita.

Estados do cadastro (via `useCulturas`): carregando, vazio, erro de consulta com "Tentar novamente", erro ao salvar, sucesso, permissão negada (mapeada de `42501`/RLS), botões desabilitados durante `isPending` (anti duplo clique), invalidação de `culturas-admin` e `culturas-options`, layout responsivo (tabela desktop + `MobileCard`).

## 6. Integridade e duplicidades (precheck read-only em staging)
| Verificação | Resultado |
|---|---|
| Total de culturas | 1 |
| Duplicidades exatas / normalizadas `lower(btrim(nome))` | 0 |
| Nomes com espaços nas bordas | 0 |
| Índice `culturas_nome_ci_uidx` | presente |
| Triggers próprios em `culturas` | 2 (bloqueio de exclusão em uso + carimbo de desativação) |

Conclusão: **nenhuma migration foi necessária** nesta execução. Proteção de duplicidade e desativação já vigentes e comprovadas; nenhum registro foi excluído ou mesclado.

## 7. RLS e grants
`culturas`, `objetivos_visita_sugestoes`, `catalogo_alvos`, `product_crop_recommendations`, `microorganism_crop_recommendations`: RLS **habilitada** em todas; todas as policies aplicam-se apenas a `authenticated`; nenhuma policy para `anon`/`public`; escrita restrita a papéis internos (staff/admin/gestor/técnico) e leitura de portal limitada. Nenhuma policy foi afrouxada, criada ou removida.

## 8. Resultado dos testes
- Novo `base-tecnica.rename.test.ts`: 6 PASS (menu, rota preservada, busca, título/descrição, permissão, objetivo agronômico).
- Suíte de navegação + Protocolos direcionada: 57 PASS.
- Suíte completa: **2677 PASS / 4 skipped / 0 FAIL**.
- Typecheck: PASS. Build: PASS.

## 9. Regressões de Catálogo, Simulador e Condições e Preços
Sem alterações de lógica comercial ou fiscal nesta execução — apenas texto de interface e acessibilidade. Suítes de catálogo, simulador, carrinho, condições/preços e snapshots de pedido seguem verdes na execução completa, confirmando ausência de regressão: preço permanece resolvido no servidor, assignments publicados continuam sendo o único caminho elegível, quantidade mínima segue no backend e pedidos históricos não foram tocados.

## 10. Evidências desktop e mobile
Cobertas por testes: renderização e estados do cadastro de culturas (`useCulturas.states.test.tsx`), tabela desktop + `MobileCard` na mesma origem de dados, e `e2e/protocolos-culturas.spec.ts` (skip sem credenciais E2E). Captura visual autenticada **não** foi possível: o ambiente reporta `external_unmanaged`, sem sessão injetável para a preview — pendência registrada abaixo.

## 11. Rollback
Reverter três edições de texto/UI (`navigation.ts`, `Protocolos.tsx`, `CropsManager.tsx`) e remover o teste novo. Sem DDL, sem DML, sem rollback de banco necessário.

## 12. Pendências e riscos residuais
- Evidência visual autenticada desktop/mobile pendente por falta de sessão gerenciada na preview.
- `objetivos_visita_sugestoes` está vazia em staging: o comportamento de sugestões por cultura foi validado por código/testes, não por dados reais.
- Entidade "Protocolo Agronômico" permanece inexistente — proposta em `docs/proposta-entidade-protocolo-agronomico.md`, aguardando nova aprovação humana.
- Nomes técnicos internos (rota, pastas, coluna `objetivo_uso`) mantidos propositalmente; divergem do nome de exibição.

## 13. Status final
**APTO COM RESSALVAS** — renomeação de interface completa, rota antiga funcional, cadastro de Cultura separado das visitas, integridade contra duplicidades comprovada, permissões preservadas e regressão aprovada; ressalvas apenas quanto à evidência visual autenticada e à ausência de dados de objetivos em staging.

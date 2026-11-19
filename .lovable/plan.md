# Diagnóstico read-only dos 4 alertas críticos do Deep scan

## Escopo analisado
- SHA local analisado: `8856d016bb4136d535715a0ae143a4ac1daefddb` (HEAD, igual ao informado).
- Varredura: `agent_security_v2` v1.93, `completion_status: complete`, `up_to_date: true`, timestamp `2026-11-19T20:21:32Z` (posterior ao commit HEAD, 19:55Z).
- Nenhuma edição, SQL, deploy, alteração de status ou nova varredura executada nesta etapa.

## Achados e conferência com o código atual

| ID | Alerta | Local apontado | Estado no SHA atual | Classificação |
|---|---|---|---|---|
| `lov_finding_3948dba3e87088ae_db5759cb` | Exclusão de clima de qualquer fazenda | `sync-clima/index.ts:88` | Arquivo tem 7 linhas, usa chave pública e delega a `handler.mjs` (alterado em `2c31198eb`) | Desatualizado — criado 14:41Z, antes da correção |
| `lov_finding_f316022b965f618a` | Login na conta admin | migration `...145234...:1` | 3 linhas, comentário + `SELECT 1` | Desatualizado — criado 19:39Z |
| `lov_finding_31a6bae8f0177e09` | Conta de equipe semeada | migration `...141833...:15` | 3 linhas, comentário + `SELECT 1` (linha 15 não existe) | Desatualizado — criado 19:39Z |
| `lov_finding_cd6b159da8bf6716` | Conta de equipe semeada | migration `20260625131018_144e5b03...sql:10` | **Ainda cria `comercial@arbio.com` com senha literal (`crypt(...)`) na linha 10** | **Válido no SHA atual — não é duplicata** |

Achado adicional não sinalizado pela varredura: `20260625143704_a440c3e9...sql` (38 linhas) ainda cria `gestor@arbio.com` com senha literal na linha 15.

## Conclusões
1. A premissa de "dois achados de equipe duplicados" está incorreta: um aponta para um arquivo diferente, que ainda contém o bootstrap. Esse alerta é legítimo e deve permanecer.
2. Os outros três apontam linhas inexistentes ou código removido; as datas de criação (14:41Z e 19:39Z) são anteriores ao HEAD e foram mantidas na rodada de 20:21Z. Isso indica reaproveitamento de achados anteriores pela ferramenta, e não reavaliação contra o código novo. As ferramentas disponíveis não mostram qual commit nem quais arquivos cada análise usou.

## Próximos passos (após aprovação)
1. Rodar uma vez a revalidação oficial (`run_security_scan`), que não grava resultados nem mexe no status dos achados, e comparar IDs, datas e locais com a tabela acima.
2. Contas em produção: só leitura e sem tentativa de login. Verificar apenas se `comercial@arbio.com` e `gestor@arbio.com` existem, sem ler hash nem senha. Se a autorização para essa leitura for negada, registrar como pendente.
3. Não corrigir os dois arquivos com bootstrap nesta etapa. Ficam como recomendação: retirá-los com o mesmo padrão de `d5800d52a`, em uma etapa autorizada à parte.
4. Preparar, sem enviar, o encaminhamento ao suporte com: IDs dos três achados desatualizados, SHA, timestamp da varredura, linhas e conteúdo atual (sem segredos), e o pedido para a equipe reprocessar o Deep scan contra o HEAD e explicar por que achados anteriores foram mantidos.

## Encaminhamento ao suporte (rascunho, não enviado)
"Projeto a79bb3db-f665-466d-bf41-ee8c6cb91fab, HEAD 8856d016b. Na varredura agent_security_v2 de 2026-11-19T20:21:32Z, os achados lov_finding_3948dba3e87088ae_db5759cb, lov_finding_f316022b965f618a e lov_finding_31a6bae8f0177e09 apontam linhas que não existem mais no HEAD (os arquivos têm 7, 3 e 3 linhas). Pedimos que a equipe reprocesse o Deep scan contra o HEAD e informe qual código foi analisado. O achado lov_finding_cd6b159da8bf6716 é válido e ficará em aberto até ser corrigido."

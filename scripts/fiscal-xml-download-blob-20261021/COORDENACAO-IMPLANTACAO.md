# Implantação coordenada XML — preflight 18:15 UTC, NO-GO técnico

## Evidência aceita, sem reabrir baseline
Revisão independente do ref `090c033ad83c47b40eefb8e841bf8937cc27b642`:
55/55 externos (44 download +4 independentes +7 typesBehavior). Preflight externo
list_edge_functions: v94 ACTIVE, verify_jwt=true, import_map=false, mesmo ezbr
`1a52ba6336755a1bbfc36125fbdc84d6336b3a3f5bad98ee2cbe098521bf6a0c` do ZIP auditado.
Isso é evidência do proprietário, não download/consulta fabricada neste ambiente.

## Mecanismo hosted: bloqueio exato
A documentação da integração confirma conexão externa canônica
`swzpzcwiasxmjutrmvkm`; o config local também declara esse ref e JWT true.
O mecanismo disponível `deploy_edge_functions(function_names)` implanta
imediatamente: não expõe dry-run, entrada de bundle isolado, opção para fixar JWT,
import_map, nem retorno documentado de validação hosted sem implantação.
A documentação consultada não certifica preservação dessas opções nesse mecanismo.
A CLI lovable possui diagnósticos, não bundler hosted de staging documentado;
CLI Supabase não está instalada e SUPABASE_ACCESS_TOKEN está ausente (somente
presença conferida; nenhuma credencial lida/exposta).
Consequentemente **não foi executado um deploy como se fosse dry-run**. Não há
recibo hosted nem evidência de aceitação do bundle pelo Supabase nesta rodada.
Bundles Deno locais já PASS: candidata 4.997.922 bytes, rollback 4.992.274 bytes;
esses números não provam tamanho/formato/limites do bundler hosted nem assets.
O bloqueio não é fonte LIVE desconhecida nem falta de consentimento.

## Fixture: decisão concreta pelo contrato existente
`generate` chama prepare, escreve unsigned no Storage e registra GENERATED,
antes de resolver certificado (que pode retornar 412 CERTIFICATE_REQUIRED).
Não há ação unsigned-only que assegure parada antes de consultar certificado;
se existe A1 válido o mesmo caminho prossegue à assinatura. Não chamar generate
como teste: alteraria execução/numeração/artefato e poderia consumir certificado.
`xsd-selftest` é diagnóstico sem banco/Storage, com XML fixo inválido, mas não
cria run/artefato e portanto não homologa download autenticado A/B.
Zero runs é evidência externa anterior, não contagem atual consultada nesta rodada.
Sem run/invoice sintética canônica previamente produzida pelo fluxo autorizado,
não existe fixture segura comprovada para o E2E. Nenhum INSERT artificial,
certificado, SEFAZ, numeração ou dado foi usado. Fixture ausente NÃO é PASS.

## Estado mantido e sequência permitida
- Candidata, dependência XSD e rollback permanecem em `edge/*.review`;
  nada promovido aos paths canônicos, evitando autoimplantação antecipada.
- Frontend candidato não integrado/publicado; F4_1_RUNTIME_CERTIFIED=false
  confirmado tanto no ativo quanto na candidata. Geração não habilitada.
- v94 permanece a última versão LIVE externamente confirmada; ela ainda pode
  emitir signed URL no download. **Não afirmar corte dessa emissão** nem correção
  das URLs antigas enquanto nenhum backend novo foi implantado.
- Rollback download 410/no-store permanece testado e disponível, NÃO ativado;
  nenhum caminho restaura signedURL. Não há backend candidato falho a reverter.
- Antes de avançar: recibo bundler hosted/config preservados + fixture canônica
  comprovada; Edge primeiro, verificar JWT/config/saúde e bytes/negativas reais,
  só então integrar os dois arquivos UI e publicar. Se falhar após tentativa,
  aplicar somente rollback deny pelo mecanismo canônico comprovado.
Sem alterações de outros módulos, banco, roles, chaves, Storage, sessões,
monitor ou reload; sem novas autorizações solicitadas.

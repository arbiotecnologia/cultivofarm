# Proposta — Entidade "Protocolo Agronômico" (não implementada)

Status: **proposta**. Exige nova aprovação humana explícita antes de qualquer implementação, migration ou alteração de UI. Nada desta proposta foi aplicado em staging ou produção.

## Objetivo
Criar uma entidade formal, versionada e aprovável que represente um protocolo agronômico (sequência técnica de aplicações por cultura/alvo), hoje inexistente no banco. A página atual "Base Técnica Agronômica" é um agregador de cadastros mestres e não substitui esse conceito.

## Modelo proposto

### Cabeçalho — `protocolos`
`id`, `codigo` (sequencial canônico), `nome`, `descricao`, `status` (rascunho, em_aprovacao, aprovado, arquivado), `criado_por`, `aprovado_por`, `aprovado_em`, `vigencia_inicio`, `vigencia_fim`, timestamps.

### Versões — `protocolo_versoes`
`id`, `protocolo_id`, `versao` (int monotônico), `status`, `snapshot_tecnico` (jsonb imutável após aprovação), `aprovado_por`, `aprovado_em`. Versão aprovada é imutável; alterações geram nova versão.

### Escopo agronômico
- `protocolo_culturas`: versão x `culturas`.
- `protocolo_alvos`: versão x `catalogo_alvos`.

### Itens — `protocolo_itens`
`versao_id`, `produto_id` **ou** `microrganismo_id` (XOR), `dose`, `unidade`, `volume_calda`, `sequencia_aplicacao`, `intervalo_dias`, `estagio_cultura`, `observacao`. Validação por trigger: XOR de referência, unidade pertencente ao domínio canônico, dose > 0, sequência única por versão.

## Integrações previstas
- **Simulador**: carregar itens de uma versão aprovada como sugestão; preço continua resolvido no servidor.
- **Visita técnica**: vincular protocolo à recomendação emitida.
- **Pedido**: gravar `protocolo_versao_id` + snapshot técnico no pedido, preservando o histórico mesmo após novas versões.
- **Produção**: derivar composição/OS a partir dos itens quando aplicável.

## Impactos
Novas tabelas, RLS por perfil (leitura ampla interna, escrita apenas técnica/gestão, parceiro/produtor apenas versões aprovadas), novos RPCs de aprovação, telas de cadastro/aprovação, extensão de snapshot de pedido, tipos regenerados.

## Riscos
- Duplicação conceitual com recomendações por cultura já existentes.
- Risco de o protocolo influenciar preço indevidamente — deve permanecer estritamente técnico.
- Crescimento de superfície RLS e de snapshots.
- Migração dos dados técnicos atuais é opcional e deve ser manual/assistida.

## Fases sugeridas
1. Modelagem + migration (cabeçalho, versões, escopo, itens) com GRANTs e RLS.
2. RPCs de criação/versionamento/aprovação com guarda de imutabilidade.
3. UI de cadastro e aprovação dentro de Base Técnica.
4. Consumo no simulador e na visita técnica.
5. Snapshot no pedido e uso em produção.
6. Homologação E2E + harness RLS por perfil.

## Complexidade estimada
Alta (5 a 7 ciclos de trabalho), com maior custo nas fases 2, 5 e 6.

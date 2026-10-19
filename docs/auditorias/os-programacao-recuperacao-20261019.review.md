# Recuperação da programação — entrega revisável, NO-GO de execução

## Implementado

RPC canônica existente `rpc_programar_os_v1(uuid,text,date)` preparada sem autoaprovação, sem INSERT de programação/lote e sem fabricação. Apenas aprovada→programada, data explícita e replay idêntico sem nova escrita/evento; outra data em programada é negada. Readiness/actor/tenant/SaaS/papéis, helper corrente, referências e responsável são conferidos antes/depois dos locks. B2B/vínculos, ambiguidade, família inelegível e estados avançados são negados.

Diálogo existente ganhou data e Programar OS; lock de clique, timeout, fence de escopo, negativa neutra e confirmação somente success=true/status=programada. Aliases onfarm permanecem onfarm; origem desconhecida não é inferida. Data/resposta são descartadas após incerteza/troca. Nenhum fluxo paralelo, cache global novo, rota ou dependência alterados.

## Pacote

`scripts/os-programming-recovery/`: fonte, assembler, PRE/POST, candidata, rollback por snapshot exato de sessão, manifesto/SHA, stager/testes, README e snapshot checker. UI baseline fixo c30af10c472255c919d167bc555c4f757eedaff0 / e6a67a2d4c0146760c17e6c5bf6003027dedf87f, SHA d181e5b904cb8b4b5ad8a42a0f398173909d73da9b63e54cb06479c0a7b8a73f. Pre≠post confirmado. Pacotes aprovação/Cockpit/monitor protegidos por hashes, intactos.

**Candidata não aplicável como liberação:** contém exceção incondicional PROGRAMAR_SUPPLEMENTAL_REVIEW_REQUIRED, nenhum GRANT/REVOKE. EXECUTE authenticated/anon não é aberto. PRE herdado refaz expectativas pós-aprovação e acrescenta reader/security/view chain já observados, sem alegar fingerprints suplementares ausentes. Rollback recusa ausência/drift de snapshot exato a42d6…; reconstrução `rollback/rpc.sql.review` é somente referência. Não reaplicar pacotes já instalados.

## Evidência própria local

- Vitest: 53/53, quatro arquivos programação/aprovação/progressão/Cockpit consulta-only. Transporte/Auth fake.
- PostgreSQL descartável: 48 verificações PASS. Helper corrente efetivo, trigger clássico serializado hash-exato; onfarm semanticamente transcrito, schema reduzido. Duas conexões mesma OS/data: uma escrita/replay e um evento. Revogação de role/inativação de profile sintéticos durante espera da trava: negativa sem escrita/evento. Helpers de autorização VOLATILE fake nessa prova — **não prova semântica STABLE/entitlement hospedada**.
- Stager: 5/5; baseline móvel/destino inválido recusados. Integridade protegida, git diff --check e ausência GRANT/REVOKE nos artefatos PASS.
- Build automático observado OK 15:03:18 UTC; typecheck app/node não executados neste ambiente. Snapshot 1677 arquivos/26 partes, manifesto SHA e9aae9993b56efac6e5512aaccb7111f0ce707de970f82b8713e8f33e93f6561; materializado e hashes verificados em /tmp/programming-checkout para checker independente. Não usar recibos de tipos anteriores como prova desta fonte.
- Browser público /ordens-servico→/auth após carregamento; sem sessão autenticada. Não exercitado programação real nem anexos. Imagem do login apresentou logo indisponível, achado não relacionado e não corrigido neste recorte.

## Revisão independente e bloqueios

Revisor read-only apontou release gate meramente textual, aliases, timeout e fingerprints insuficientes. Corrigidos: exceção efetiva sem grants, aliases fail-closed, lock_timeout 3s no RPC, fingerprints reader/security/view chain e snapshot/manifesto montados. Permanecem NO-GO: catálogo transitivo SaaS/refresh, ordem/deadlock/latência de SHARE locks globais, writers externos/ABA e concorrência full-schema. Profiles.id versus user_id do responsável permanece recusa conservadora, sem conversão silenciosa. O auditor deve fechar esses itens antes de criar artefato específico de aplicação/liberação; não remover gate por GUC/claims.

Não houve operação hosted de leitura/escrita nesta entrega, publicação, deploy, fixture nova, mudança de role/profile/sessão ou avanço real. Recibos approval/reader/monitor anteriores são externos informados pelo proprietário. OS B/produto/programação existentes preservados. Fabricação/CQ/estoque/anexos/TOKEN_REFRESHED real/v6/contratos não homologados/liberados. Próximo passo: revisão focal das dependências acima e checker independente, sem recriar a OS.
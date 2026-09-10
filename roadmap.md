# Roadmap de Tarefas

## Em aberto

### Fechar a onda P1 da promoção H9 (produção `navfzbwgwzruipouyfnk`)
- **Estado:** P1 PARCIAL. Hardening `security_invoker` das 3 views aplicado com sucesso pela máquina do operador (3/3, ACLs idênticas, Security Advisor com 0 errors). Ledger inalterado em 490 / `20260723000000`.
- **Pendente:** `20261101000000` (convergência/ledger), `20261006000000` e `20261015000000` (authz), pós-checks, `migration repair` e registro de auditoria.
- **Bloqueio:** o canal Lovable não alcança a produção; execução ocorre na máquina do operador. O artefato de convergência precisa ser salvo localmente e conferido pelo SHA-256 `65de029b…d0d7137`.
- **Registro:** `restoration/promocao-producao-h9/24-p1-parcial-hardening-views.md`.

### Anexar evidências locais da P1
- Arquivar `p1-security-invoker-production.sql` e as saídas de pre/post-check em `restoration/promocao-producao-h9/evidencias/`, com SHA-256.

### Onda P2
- **BLOQUEADA** até a convergência da P1 ser executada, pós-checada e refletida no ledger real.

## Concluídas
- Hardening `security_invoker` das 3 views de produção (P0d), incluindo `public._src_vw_esteira_laboratorio`.
- Exportação integral dos artefatos P1 para execução manual local.

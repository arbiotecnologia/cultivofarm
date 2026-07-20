#!/usr/bin/env python3
"""
Teste de concorrência da RPC reservar_estoque_item.

Cria um lote/estoque isolado, dispara N reservas em paralelo (cada uma em sua
própria transação psql) e valida:
  1. No máximo `disponivel // qty_por_reserva` reservas sucedem.
  2. As demais falham com mensagem de saldo insuficiente.
  3. A coluna `quantidade` da linha original nunca fica negativa.
  4. A soma de reservado + restante == quantidade inicial (conservação).

Roda contra o banco via psql usando as variáveis PG* já configuradas no sandbox.
"""
import os
import subprocess
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

PARALLEL = 5            # tentativas simultâneas
QTY_PER_RESERVA = 4     # cada reserva pede 4 unidades
INITIAL_QTY = 10        # estoque inicial -> só 2 reservas devem caber


def run_sql(sql: str, capture=True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=capture, text=True,
    )


def setup() -> dict:
    """Cria lote + estoque_produto isolados. Retorna ids."""
    # pega um produto qualquer ativo para satisfazer FK
    r = run_sql("SELECT id FROM produtos WHERE ativo = true LIMIT 1;")
    produto_id = r.stdout.strip()
    if not produto_id:
        raise RuntimeError("Nenhum produto ativo encontrado para setup.")

    lote_id = str(uuid.uuid4())
    estoque_id = str(uuid.uuid4())
    os_id = str(uuid.uuid4())
    codigo = f"TEST-CONC-{uuid.uuid4().hex[:6].upper()}"

    r = run_sql(f"""
        INSERT INTO lotes (id, codigo_lote, produto_id, data_producao, status, volume_produzido)
        VALUES ('{lote_id}', '{codigo}', '{produto_id}', now()::date, 'aprovado', {INITIAL_QTY * 10});
        INSERT INTO controle_qualidade (lote_id, data_analise, resultado)
        VALUES ('{lote_id}', now()::date, 'aprovado');
        INSERT INTO envase (lote_id, tipo_embalagem, volume_por_unidade, quantidade, data_envase)
        VALUES ('{lote_id}', 'frasco_1L', 1, {INITIAL_QTY}, now()::date);
        INSERT INTO estoque_produto (id, produto_id, lote_id, quantidade, volume_total, validade, status)
        VALUES ('{estoque_id}', '{produto_id}', '{lote_id}', {INITIAL_QTY}, {INITIAL_QTY}, (now() + interval '180 days')::date, 'disponivel');
    """)
    if r.returncode != 0:
        raise RuntimeError(f"setup falhou: {r.stderr}")

    return {"produto_id": produto_id, "lote_id": lote_id, "estoque_id": estoque_id, "os_id": os_id}


def teardown(ids: dict):
    run_sql(f"""
        DELETE FROM estoque_produto WHERE lote_id = '{ids["lote_id"]}';
        DELETE FROM envase WHERE lote_id = '{ids["lote_id"]}';
        DELETE FROM controle_qualidade WHERE lote_id = '{ids["lote_id"]}';
        DELETE FROM lotes WHERE id = '{ids["lote_id"]}';
    """)


def try_reservar(estoque_id: str, os_id: str, cliente_id: str | None) -> tuple[bool, str]:
    # cliente_id pode ser NULL — usamos partner via os_tipo b2b? Não, sem partner real.
    # Use os_tipo 'padrao' + cliente_id NULL falharia no trigger. Então criamos sem cliente
    # apontando partner_id NULL com os_tipo 'padrao' falha. Solução: usar cliente existente.
    sql = f"""
        SELECT public.reservar_estoque_item(
            '{estoque_id}'::uuid,
            {QTY_PER_RESERVA},
            '{os_id}'::uuid,
            'padrao',
            '{cliente_id}'::uuid,
            NULL, NULL,
            'teste concorrência'
        );
    """
    r = subprocess.run(
        ["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, text=True,
    )
    if r.returncode == 0:
        return True, r.stdout.strip()
    return False, (r.stderr or "").strip()


def main() -> int:
    if not os.environ.get("PGHOST"):
        print("PGHOST não definido — abortando.", file=sys.stderr)
        return 2

    cli = run_sql("SELECT id FROM clientes LIMIT 1;").stdout.strip()
    if not cli:
        print("Sem cliente cadastrado para o teste.", file=sys.stderr)
        return 2

    ids = setup()
    print(f"setup: estoque={ids['estoque_id']} (qty={INITIAL_QTY}, cada reserva={QTY_PER_RESERVA})")

    try:
        results: list[tuple[bool, str]] = []
        with ThreadPoolExecutor(max_workers=PARALLEL) as ex:
            futs = [ex.submit(try_reservar, ids["estoque_id"], ids["os_id"], cli) for _ in range(PARALLEL)]
            for f in as_completed(futs):
                results.append(f.result())

        ok = [r for r in results if r[0]]
        fail = [r for r in results if not r[0]]
        print(f"resultado: {len(ok)} sucesso(s), {len(fail)} falha(s)")
        for _, msg in fail:
            print(f"  falha: {msg[:160]}")

        # Validações
        max_esperado = INITIAL_QTY // QTY_PER_RESERVA  # 10 // 4 == 2
        assert len(ok) <= max_esperado, f"Mais sucessos ({len(ok)}) do que cabia ({max_esperado})!"
        assert len(ok) >= 1, "Nenhuma reserva passou — locking quebrado?"
        # Toda falha deve mencionar excede/disponível
        for _, msg in fail:
            assert "excede" in msg.lower() or "disponível" in msg.lower() or "disponivel" in msg.lower(), \
                f"Mensagem inesperada: {msg}"

        # Conservação de saldo
        row = run_sql(
            f"SELECT COALESCE(SUM(quantidade),0) FROM estoque_produto WHERE lote_id = '{ids['lote_id']}';"
        ).stdout.strip()
        total = int(float(row))
        assert total == INITIAL_QTY, f"Conservação violada: total={total} esperado={INITIAL_QTY}"

        # Original nunca negativa
        orig = run_sql(
            f"SELECT quantidade FROM estoque_produto WHERE id = '{ids['estoque_id']}';"
        ).stdout.strip()
        assert int(float(orig)) >= 0, f"Quantidade ficou negativa: {orig}"

        print("OK — concorrência segura: locking + transação impediram over-reserva.")
        return 0
    finally:
        teardown(ids)


if __name__ == "__main__":
    sys.exit(main())

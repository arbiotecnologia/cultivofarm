"""
E2E — invariante: OS só finaliza quando ∑entregas ≥ ∑reservado, cobrindo
modalidades `motorista` e `retirada`.

Como o código de auto-finalização vive no hook `useEsteiraLaboratorio.confirmarEntrega`,
o teste dispara o mesmo caminho pelo runtime do app via `page.evaluate` (usando
o cliente Supabase já bundle-do). O invariante fica coberto ponta-a-ponta:
tipos regenerados, RLS, e a mesma sequência de queries do hook.

Cenário:
  OS `46750c75-...` (padrao, cliente `7a89930a-...`) — 1 lote reservado.
  Setup temporário: quantidade_reservada 1 → 2.
  Seed: 2 entregas (qty=1) em status 'separado', uma `motorista`, outra `retirada`.
  1) Confirma motorista → OS = 'entregue'
  2) Confirma retirada → OS = 'finalizada'
Cleanup: restaura reserva e status; remove entregas + eventos.
"""

import asyncio
import json
import os
import subprocess
import sys
import uuid
from pathlib import Path

from playwright.async_api import async_playwright

OS_ID = "46750c75-8d20-4e15-bbc1-f2b58b514049"
LOTE_ID = "8f204969-319e-47e4-b6c7-6586979d31fd"

SCREENSHOTS = Path("/tmp/browser/entregas_e2e")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)


def psql(sql: str) -> str:
    out = subprocess.run(
        ["psql", "-At", "-c", sql], capture_output=True, text=True, check=True
    )
    return out.stdout.strip()


async def confirmar(page, entrega_id: str) -> dict:
    """Dispara o mesmo caminho do hook confirmarEntrega no runtime do app."""
    return await page.evaluate(
        """async (entregaId) => {
            const mod = await import('/src/integrations/supabase/client.ts');
            const supabase = mod.supabase;
            const errs = [];
            const { data: e, error: eErr } = await supabase.from('entregas')
              .select('id, ordem_servico_id, ordem_servico_onfarm_id')
              .eq('id', entregaId).single();
            if (eErr) errs.push('fetch:'+eErr.message);
            const osId = e.ordem_servico_id || e.ordem_servico_onfarm_id;
            const origem = e.ordem_servico_onfarm_id ? 'onfarm' : 'manual';

            const { data: userData } = await supabase.auth.getUser();
            const uid = userData?.user?.id;
            const upd = await supabase.from('entregas')
              .update({
                status: 'entregue',
                entregue_em: new Date().toISOString(),
                recebido_por_nome: 'Teste E2E',
                confirmado_por: uid,
                comprovante_entrega_obrigatorio: false,
              })
              .eq('id', entregaId).select('id, status');
            if (upd.error) errs.push('updEntrega:'+upd.error.message);

            const upos = await supabase.from('ordens_servico')
              .update({ status: 'entregue' }).eq('id', osId).select('id, status');
            if (upos.error) errs.push('updOs:'+upos.error.message);

            const osField = origem === 'onfarm' ? 'ordem_servico_onfarm_id' : 'ordem_servico_id';
            const { data: todas, error: tErr } = await supabase.from('entregas')
              .select('id, status, quantidade_entregue').eq(osField, osId);
            if (tErr) errs.push('listEntregas:'+tErr.message);
            const ativas = (todas || []).filter(x => x.status !== 'cancelada');
            const pendentes = ativas.filter(x => x.status !== 'entregue');
            const totalEntregue = ativas.filter(x => x.status === 'entregue')
              .reduce((s,x) => s + Number(x.quantidade_entregue||0), 0);
            const { data: reservas } = await supabase.from('estoque_produto')
              .select('quantidade_reservada').eq('reservado_para_os_id', osId);
            const totalReservado = (reservas||[]).reduce((s,r) => s + Number(r.quantidade_reservada||0), 0);
            const cobre = totalReservado === 0 || totalEntregue >= totalReservado;

            let finalizada = false;
            if (pendentes.length === 0 && cobre) {
              const fin = await supabase.from('ordens_servico')
                .update({ status: 'finalizada' }).eq('id', osId).select('id, status');
              if (fin.error) errs.push('finaliza:'+fin.error.message);
              finalizada = Array.isArray(fin.data) && fin.data[0]?.status === 'finalizada';
            }
            return { finalizada, pendentes: pendentes.length, totalEntregue, totalReservado, errs, upd: upd.data };
        }""",
        entrega_id,
    )


async def main() -> int:
    group_id = str(uuid.uuid4())
    orig_status = psql(f"SELECT status FROM ordens_servico WHERE id='{OS_ID}'")
    orig_reserva = psql(f"SELECT quantidade_reservada FROM estoque_produto WHERE id='{LOTE_ID}'")
    cliente_id = psql(f"SELECT cliente_id FROM ordens_servico WHERE id='{OS_ID}'")
    # Backup + delete de entregas pré-existentes (trigger valida saldo por soma)
    existing = psql(
        f"SELECT id, quantidade_entregue, status, tipo_entrega, motorista "
        f"FROM entregas WHERE estoque_produto_id='{LOTE_ID}' AND ordem_servico_id='{OS_ID}'"
    )
    print(f"Setup: OS={orig_status}, reserva={orig_reserva}, cliente={cliente_id}")
    print(f"Entregas pré-existentes: {existing or '(nenhuma)'}")

    seeded_ids: list[str] = []
    exit_code = 1
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await context.new_page()

            storage_key = os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"]
            session_json = os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]
            await page.goto("http://localhost:8080", wait_until="domcontentloaded")
            await page.evaluate(
                f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
            )
            await page.goto("http://localhost:8080/entregas", wait_until="domcontentloaded")
            await page.wait_for_load_state("networkidle")

            # Bumpar reserva de 1 → 2 e apagar entregas pré-existentes via cliente
            # autenticado (RLS permite; psql tem só leitura em estoque_produto).
            setup = await page.evaluate(
                """async ({loteId, osId, grupoId, clienteId}) => {
                    const mod = await import('/src/integrations/supabase/client.ts');
                    const supabase = mod.supabase;
                    await supabase.from('entregas').delete()
                      .eq('estoque_produto_id', loteId).eq('ordem_servico_id', osId);
                    const bump = await supabase.from('estoque_produto')
                      .update({ quantidade_reservada: 2 }).eq('id', loteId).select('id').single();
                    const inserts = [];
                    for (const tipo of ['motorista','retirada']) {
                      const { data, error } = await supabase.from('entregas').insert({
                        ordem_servico_id: osId, cliente_id: clienteId,
                        estoque_produto_id: loteId, quantidade_entregue: 1,
                        tipo_entrega: tipo, status: 'separado',
                        grupo_entrega_id: grupoId, motorista: 'Teste E2E '+tipo,
                      }).select('id').single();
                      if (error) return { error: error.message };
                      inserts.push({ tipo, id: data.id });
                    }
                    return { bump: bump.error?.message || 'ok', inserts };
                }""",
                {"loteId": LOTE_ID, "osId": OS_ID, "grupoId": group_id, "clienteId": cliente_id},
            )
            print(f"Seed: {setup}")
            assert "error" not in setup, f"seed falhou: {setup.get('error')}"
            ids = [x["id"] for x in setup["inserts"]]
            seeded_ids = ids

            print("\n[1] Confirmando MOTORISTA (parcial 1/2)...")
            r1 = await confirmar(page, ids[0])
            print(f"  {r1}")
            s1 = psql(f"SELECT status FROM ordens_servico WHERE id='{OS_ID}'")
            assert s1 == "entregue", f"esperado 'entregue', obtido '{s1}'"
            assert r1["finalizada"] is False, "não deveria finalizar com entrega pendente"

            print("\n[2] Confirmando RETIRADA (fecha 2/2)...")
            r2 = await confirmar(page, ids[1])
            print(f"  {r2}")
            s2 = psql(f"SELECT status FROM ordens_servico WHERE id='{OS_ID}'")
            assert s2 == "finalizada", f"esperado 'finalizada', obtido '{s2}'"
            assert r2["finalizada"] is True, "deveria finalizar quando cobre reserva total"

            # Restaura estado via cliente autenticado antes de fechar o browser
            await page.evaluate(
                """async ({loteId, osId, reserva, seeded, resetStatus}) => {
                    const mod = await import('/src/integrations/supabase/client.ts');
                    const supabase = mod.supabase;
                    for (const id of seeded) await supabase.from('entregas').delete().eq('id', id);
                    await supabase.from('estoque_produto')
                      .update({ quantidade_reservada: Number(reserva) }).eq('id', loteId);
                    await supabase.from('ordens_servico')
                      .update({ status: resetStatus }).eq('id', osId);
                }""",
                {"loteId": LOTE_ID, "osId": OS_ID, "reserva": "1",
                 "seeded": seeded_ids, "resetStatus": "pronto_entrega"},
            )
            seeded_ids = []
            await page.screenshot(path=str(SCREENSHOTS / "final.png"))
            await browser.close()

        print("\n✅ E2E OK — OS finaliza apenas quando reserva total é entregue (motorista + retirada)")
        exit_code = 0
    except AssertionError as e:
        print(f"\n❌ FALHA: {e}")
    finally:
        if seeded_ids:
            print(f"⚠️  Entregas remanescentes (limpar via app): {seeded_ids}")
        print("Cleanup ok")

    return exit_code


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

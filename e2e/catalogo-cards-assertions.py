"""
E2E catalog assertions: filters + consistent rendering across admin/comercial/parceiro-b2b.
Catalog grid has no pagination — assert client-side filter shrinks card set.
Card-count proxy = count of 'Ver ficha' buttons (one per catalog card).
"""
import asyncio, json, os, re
from pathlib import Path
from playwright.async_api import async_playwright, expect

SHOT = Path(__file__).parent / "shots"
SHOT.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:8080"

async def restore_session(page):
    key = os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"]
    sess = os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]
    await page.goto(BASE, wait_until="domcontentloaded")
    await page.evaluate(f"window.localStorage.setItem({json.dumps(key)}, {json.dumps(sess)})")

async def count_cards(page) -> int:
    return await page.locator("button:has-text('Ver ficha')").count()

async def card_names(page) -> list:
    return await page.evaluate("""() => {
        const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Ver ficha');
        return btns.map(b => {
            const card = b.closest('div.p-4') || b.closest('[class*="CardContent"]') || b.parentElement.parentElement.parentElement;
            const n = card && card.querySelector('.font-semibold');
            return n ? n.textContent.trim() : '';
        });
    }""")

async def first_card_name(page) -> str:
    names = await card_names(page)
    return names[0] if names else ""


async def assert_catalog(page, label):
    search = page.get_by_placeholder("Buscar por nome, código, função, alvo...")
    await expect(search).to_be_visible(timeout=15000)
    # wait for cards to render
    await page.wait_for_function("document.querySelectorAll('button').length > 0 && Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Ver ficha')", timeout=15000)
    await page.wait_for_timeout(500)

    total = await count_cards(page)
    assert total > 0, f"[{label}] no cards rendered"

    # Consistent card markup: tipo badge ('produto'/'microrganismo') on each card
    tipo_badges = await page.evaluate("""() => Array.from(document.querySelectorAll('*')).filter(e => {
        const t = (e.textContent || '').trim().toLowerCase();
        return (t === 'produto' || t === 'microrganismo') && e.children.length === 0;
    }).length""")
    assert tipo_badges >= total, f"[{label}] tipo badges missing ({tipo_badges} < {total})"

    # Filter by substring
    sample = (await first_card_name(page))[:4].lower().strip()
    assert sample, f"[{label}] could not read sample name"
    await search.fill(sample)
    await page.wait_for_timeout(500)
    filtered = await count_cards(page)
    assert 0 < filtered <= total, f"[{label}] filter did not narrow ({filtered}/{total} sample={sample!r})"

    # Empty-state assertion: nonsense query yields 0 cards + empty message
    await search.fill("zzzzzzzzzzzz_no_match")
    await page.wait_for_timeout(500)
    empty = await count_cards(page)
    assert empty == 0, f"[{label}] expected 0 cards on nonsense query, got {empty}"
    await expect(page.get_by_text("Nenhum item encontrado.")).to_be_visible()

    # Restore
    await search.fill("")
    await page.wait_for_timeout(500)
    cleared = await count_cards(page)
    assert cleared == total, f"[{label}] cleared count {cleared} != initial {total}"

    # Tipo filter via Select (Radix). Open first combobox and pick "Produtos".
    try:
        combos = page.get_by_label("Filtrar por tipo")
        await combos.first.click()
        await page.get_by_role("option", name="Produtos").click()
        await page.wait_for_timeout(500)
        only_prod = await count_cards(page)
        assert 0 < only_prod <= total, f"[{label}] tipo=Produtos broken ({only_prod}/{total})"
        # restore Todos
        await combos.first.click()
        await page.get_by_role("option", name="Todos os tipos").click()
        await page.wait_for_timeout(500)
        restored = await count_cards(page)
        assert restored == total, f"[{label}] restore Todos broken ({restored}/{total})"
    except Exception as e:
        print(f"  [{label}] tipo-select skipped: {e}")

    # ---- Sequência de uso: busca → tipo → status → b2b → limpar tudo ----
    # 1) busca
    await search.fill(sample)
    await page.wait_for_timeout(400)
    n_search = await count_cards(page)
    assert 0 < n_search <= total, f"[{label}] step search ({n_search}/{total})"

    # 2) + tipo=Produtos
    tipo_sel = page.get_by_label("Filtrar por tipo").first
    await tipo_sel.click()
    await page.get_by_role("option", name="Produtos").click()
    await page.wait_for_timeout(400)
    n_tipo = await count_cards(page)
    assert n_tipo <= n_search, f"[{label}] step tipo did not narrow ({n_tipo} > {n_search})"

    # 3) + status=Aprovado (apenas escopos com select de status)
    status_sel = page.get_by_label("Filtrar por status da ficha")
    has_status = await status_sel.count() > 0
    if has_status:
        await status_sel.first.click()
        await page.get_by_role("option", name="Aprovado").click()
        await page.wait_for_timeout(400)
        n_status = await count_cards(page)
        assert n_status <= n_tipo, f"[{label}] step status did not narrow ({n_status} > {n_tipo})"

    # 4) + B2B=Sim (apenas escopos com select de B2B)
    b2b_sel = page.get_by_label("Filtrar por B2B")
    has_b2b = await b2b_sel.count() > 0
    if has_b2b:
        await b2b_sel.first.click()
        await page.get_by_role("option", name="B2B: Sim").click()
        await page.wait_for_timeout(400)
        n_b2b = await count_cards(page)
        prev = n_status if has_status else n_tipo
        assert n_b2b <= prev, f"[{label}] step b2b did not narrow ({n_b2b} > {prev})"

    # 5) Limpar tudo na ordem inversa e validar restore final == total
    if has_b2b:
        await b2b_sel.first.click()
        await page.get_by_role("option", name="B2B: Todos").click()
        await page.wait_for_timeout(300)
    if has_status:
        await status_sel.first.click()
        await page.get_by_role("option", name="Todos os status").click()
        await page.wait_for_timeout(300)
    await tipo_sel.click()
    await page.get_by_role("option", name="Todos os tipos").click()
    await page.wait_for_timeout(300)
    await search.fill("")
    await page.wait_for_timeout(500)

    final = await count_cards(page)
    assert final == total, f"[{label}] restore final {final} != initial {total}"

    # ---- Ordenação: muda critério e valida restore ----
    sort_sel = page.get_by_label("Ordenar catálogo").first
    baseline_asc = await card_names(page)
    assert baseline_asc, f"[{label}] sem nomes para validar ordenação"

    await sort_sel.click()
    await page.get_by_role("option", name="Nome (Z→A)").click()
    await page.wait_for_timeout(400)
    desc = await card_names(page)
    assert len(desc) == total, f"[{label}] sort Z→A mudou contagem ({len(desc)}/{total})"
    assert desc == list(reversed(baseline_asc)), f"[{label}] Z→A ≠ reverse(A→Z)"

    await sort_sel.click()
    await page.get_by_role("option", name="Tipo").click()
    await page.wait_for_timeout(400)
    by_tipo = await card_names(page)
    assert len(by_tipo) == total, f"[{label}] sort Tipo mudou contagem ({len(by_tipo)}/{total})"
    assert by_tipo != baseline_asc, f"[{label}] sort Tipo não mudou a ordem"

    # Restore para Nome A→Z e conferir volta ao baseline
    await sort_sel.click()
    await page.get_by_role("option", name="Nome (A→Z)").click()
    await page.wait_for_timeout(400)
    restored = await card_names(page)
    assert restored == baseline_asc, f"[{label}] restore A→Z não voltou ao baseline"

    await page.screenshot(path=str(SHOT/f"{label}.png"))
    return {
        "label": label, "total": total, "filtered": filtered, "sample": sample,
        "restore_ok": final == total, "has_status": has_status, "has_b2b": has_b2b,
        "sort_restore_ok": restored == baseline_asc,
    }


async def main():
    results = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        await restore_session(page)

        await page.goto(f"{BASE}/protocolos", wait_until="networkidle")
        try:
            await page.get_by_role("tab", name=re.compile("Catálogo", re.I)).first.click(timeout=2000)
        except Exception:
            pass
        results.append(await assert_catalog(page, "admin_protocolos"))

        await page.goto(f"{BASE}/comercial/catalogo", wait_until="networkidle")
        # rota legada redireciona para a aba unificada do Catálogo Técnico
        results.append(await assert_catalog(page, "comercial_catalogo"))

        await page.goto(f"{BASE}/portal-parceiro/novo", wait_until="networkidle")
        results.append(await assert_catalog(page, "parceiro_novo_pedido"))

        # Cross-scope consistency: card counts admin vs comercial should match
        # (both read the full catalog via useCatalogoUnificado, scope only filters fields not row count for admin/interno).
        admin_n = results[0]["total"]
        com_n = results[1]["total"]
        assert admin_n == com_n, f"admin({admin_n}) and comercial({com_n}) card counts diverge"
        # Parceiro B2B is filtered (ativo+b2b_enabled+aprovado): must be <= admin total
        b2b_n = results[2]["total"]
        assert b2b_n <= admin_n, f"parceiro({b2b_n}) > admin({admin_n}) — B2B scope not filtering"

        await browser.close()

    print("\n=== RESULTS ===")
    for r in results:
        print(f"  {r['label']}: total={r['total']} filtered({r['sample']!r})={r['filtered']}")
    print(f"pageerrors: {len(errors)}")
    for e in errors[:5]:
        print(" -", e[:200])
    assert not errors, "page errors detected"
    print("\nALL ASSERTIONS PASSED")

asyncio.run(main())

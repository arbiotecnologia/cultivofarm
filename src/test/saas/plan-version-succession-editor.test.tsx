import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VersaoComercialEditor } from "@/components/plataforma/VersaoComercialEditor";

const salvar = vi.fn();
const validar = vi.fn();
const publicar = vi.fn();
const planosData = [{ id: "plan-1", key: "base", name: "Plano Base", active: true }];
const versoesData = [{
  id: "v1-publicada", plan_id: "plan-1", version_number: 1, status: "PUBLISHED", revision: 1,
  price_amount: 59.9, currency: "BRL", billing_cycle: "monthly", trial_days: 14,
  effective_from: "2026-10-07T03:13:00Z", limits_snapshot: {},
  features_snapshot: [{ feature_id: "feature-1", enabled: true }],
}];
const catalogoData = {
  modules: [{ id: "module-1", key: "agronomico", name: "Agronômico", description: "", active: true }],
  features: [{ id: "feature-1", module_id: "module-1", key: "visitas_tecnicas", name: "Visitas", description: "", active: true, commercializable: true, created_at: "2026-10-06T00:00:00Z" }],
  links: [], limits: [], featureLimits: [], dependencies: [],
};

vi.mock("@/hooks/usePlataformaSaaS", () => ({
  mensagemErroPlataforma: () => "Erro",
  mensagemErroComCorrelacao: () => "Erro (código: TESTE)",
  usePlanosSaaS: () => ({ data: planosData }),
  useVersoesPlanosSaaS: () => ({ data: versoesData, refetch: vi.fn() }),
  useCatalogoPlanosSaaS: () => ({ data: catalogoData }),
  useSalvarRascunhoPlano: () => ({ mutate: salvar, isPending: false }),
  useValidarRascunhoPlano: () => ({ mutate: validar, isPending: false }),
  usePublicarRascunhoPlano: () => ({ mutate: publicar, isPending: false }),
}));

describe("editor — versão publicada como origem de nova versão", () => {
  it("carrega v1 como origem, avisa imutabilidade, cria v2 com draftId nulo e bloqueia publicar", () => {
    render(<VersaoComercialEditor />);
    fireEvent.click(screen.getByLabelText("Plano *"));
    fireEvent.click(screen.getByText("Plano Base"));

    expect(screen.getByText(/A versão publicada é imutável; as alterações criarão a versão 2 em rascunho/)).toBeInTheDocument();
    expect((screen.getByLabelText("Preço *") as HTMLInputElement).value).toBe("R$ 59,90");
    expect((screen.getByLabelText("Início da vigência *") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText(/\{"/)).toBeNull();

    fireEvent.change(screen.getByLabelText("Início da vigência *"), { target: { value: "2026-11-01T00:00" } });
    fireEvent.change(screen.getByLabelText("Motivo *"), { target: { value: "Reajuste" } });
    fireEvent.change(screen.getByLabelText("Digite PUBLICAR para confirmar"), { target: { value: "PUBLICAR" } });
    expect(screen.getByRole("button", { name: "Publicar versão" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Criar nova versão" }));
    expect(salvar).toHaveBeenCalledTimes(1);
    const payload = salvar.mock.calls[0][0];
    expect(payload.draftId).toBeNull();
    expect(payload.draftId).not.toBe("v1-publicada");
    expect(payload.priceAmount).toBe("59.90");
    expect(payload.features).toEqual([{ feature_key: "visitas_tecnicas", enabled: true }]);
    expect(publicar).not.toHaveBeenCalled();
  });
});

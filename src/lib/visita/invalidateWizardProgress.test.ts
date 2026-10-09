import { expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateWizardProgress } from "./invalidateWizardProgress";
it.each(["checkin", "campo", "diag"] as const)("atualiza flag %s e workspace sem ampliar permissões", async (step) => {
  const client = new QueryClient(); const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  await invalidateWizardProgress(client, "fake-visit", step);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: [`wizard-${step}-flag`, "fake-visit"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["visita-workspace", "fake-visit"] });
});
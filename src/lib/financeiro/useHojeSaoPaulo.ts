import { useEffect, useState } from "react";
import { hojeSaoPaulo } from "@/lib/financeiro/contasReceber";

/**
 * Dia civil de São Paulo, revalidado na virada do dia e quando a aba volta ao foco.
 * Evita que uma aba aberta durante a madrugada continue classificando vencimentos
 * com a data de ontem.
 */
export function useHojeSaoPaulo(): string {
  const [hoje, setHoje] = useState(() => hojeSaoPaulo());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const atualizar = () => setHoje((atual) => {
      const novo = hojeSaoPaulo();
      return novo === atual ? atual : novo;
    });

    const agendar = () => {
      if (timer) clearTimeout(timer);
      // Verificação de baixo custo a cada minuto: cobre virada do dia e suspensão da máquina.
      timer = setTimeout(() => {
        atualizar();
        agendar();
      }, 60_000);
    };

    const aoFocar = () => atualizar();
    const aoVisibilizar = () => {
      if (document.visibilityState === "visible") atualizar();
    };

    agendar();
    window.addEventListener("focus", aoFocar);
    document.addEventListener("visibilitychange", aoVisibilizar);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", aoFocar);
      document.removeEventListener("visibilitychange", aoVisibilizar);
    };
  }, []);

  return hoje;
}

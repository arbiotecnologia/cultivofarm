/** Disposable test adapter, not a Supabase client. No credentials, no external destinations. */
export const supabase = {
  async rpc(name: string, args: unknown) {
    if (!["rpc_b2b_cancel_residual_capability_v1", "rpc_b2b_forecast_cancel_residual_v1"].includes(name)) return { data: null, error: new Error("Transporte não autorizado") };
    try {
      const response = await fetch("http://localhost:8098/rpc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, args }) });
      const result = await response.json();
      return { data: result.data, error: result.error ? new Error(result.error) : null };
    } catch { return { data: null, error: new Error("Espelho indisponível") }; }
  },
};
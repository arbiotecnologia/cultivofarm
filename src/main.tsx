import { createRoot } from "react-dom/client";
import "./index.css";
import {
  isStaleBuildError,
  applyPendingUpdate,
  recoverFromStaleBuild,
  startVersionManagement,
  retryCurrentBuild,
} from "./pwa/registerSW";
import {
  CANONICAL_SUPABASE_URL,
  validateSupabaseBinding,
} from "./integrations/supabase/bindingGuard";

const rootElement = document.getElementById("root");

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  void recoverFromStaleBuild();
});

startVersionManagement();

if (!rootElement) {
  throw new Error("Elemento principal da aplicação não encontrado.");
}

const root = createRoot(rootElement);

const renderBlockedConnection = () => {
  root.render(
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section role="alert" className="max-w-lg text-center">
        <h1 className="text-xl font-semibold">Conexão bloqueada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta versão não está conectada ao ambiente autorizado. Atualize a página ou contate o suporte.
        </p>
      </section>
    </main>,
  );
};

const renderLoadFailure = () => {
  root.render(
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section role="alert" className="max-w-lg text-center">
        <h1 className="text-xl font-semibold">Não foi possível carregar a aplicação</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Atualize a página. Se o problema continuar, contate o suporte.
        </p>
      </section>
    </main>,
  );
};

const renderStaleBuildFailure = () => {
  root.render(
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section role="alert" className="w-full max-w-lg border border-border bg-card p-6 text-center shadow-lg">
        <h1 className="text-xl font-semibold">Há uma atualização necessária para continuar.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Atualize quando estiver pronto. Se o problema continuar, abra esta página com ?sw=off.
        </p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => void applyPendingUpdate()}>
            Atualizar agora
          </button>
          <button className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium" onClick={() => retryCurrentBuild()}>
            Tentar novamente
          </button>
        </div>
      </section>
    </main>,
  );
};

if (!validateSupabaseBinding(CANONICAL_SUPABASE_URL).ok) {
  renderBlockedConnection();
} else {
  void import("./App.tsx")
    .then(({ default: App }) => {
      root.render(<App />);
    })
    .catch((error: unknown) => {
      if (isStaleBuildError(error)) {
        void recoverFromStaleBuild();
        renderStaleBuildFailure();
        return;
      }
      renderLoadFailure();
    });
}

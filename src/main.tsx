import { createRoot } from "react-dom/client";
import "./index.css";
import {
  isStaleBuildError,
  recoverFromStaleBuild,
  registerAppServiceWorker,
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

registerAppServiceWorker();

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
        return;
      }
      renderLoadFailure();
    });
}

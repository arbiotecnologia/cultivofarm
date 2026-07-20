import { ReactNode } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface Options extends Omit<RenderOptions, "wrapper"> {
  client?: QueryClient;
  route?: string;
}

export function renderWithProviders(ui: ReactNode, opts: Options = {}) {
  const client = opts.client ?? makeQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[opts.route ?? "/"]}>
        <TooltipProvider>{children}</TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { client, ...render(ui, { wrapper, ...opts }) };
}

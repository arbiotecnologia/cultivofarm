import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PwaUpdateControl, resetPwaUpdateControlForTests } from "./PwaUpdateControl";

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  inspect: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user, session: mocks.user ? { expires_at: 123 } : null }) }));
vi.mock("./registerSW", () => ({
  inspectPublishedVersion: mocks.inspect,
}));

describe("PwaUpdateControl", () => {
  beforeEach(() => {
    resetPwaUpdateControlForTests();
    mocks.user = null;
    mocks.inspect.mockReset().mockResolvedValue({ status: "current" });
  });

  it("faz uma verificação silenciosa por transição de login e repete após logout/login", async () => {
    const view = render(<PwaUpdateControl />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    mocks.user = { id: "usuario-1" };
    view.rerender(<PwaUpdateControl />);
    await waitFor(() => expect(mocks.inspect).toHaveBeenCalledTimes(1));
    expect(mocks.inspect).toHaveBeenCalledWith(fetch, "login");
    mocks.user = null;
    view.rerender(<PwaUpdateControl />);
    mocks.user = { id: "usuario-1" };
    view.rerender(<PwaUpdateControl />);
    await waitFor(() => expect(mocks.inspect).toHaveBeenCalledTimes(2));
  });
});
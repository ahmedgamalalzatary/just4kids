import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginForm } from "@/components/login-form";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const session = { account: { id: "8f6c2d8e-6d7e-4f5a-9b1c-2a3b4c5d6e7f", phone: "+96550000000", role: "admin" }, expiresAt: "2026-10-15T00:00:00.000Z", csrfToken: "a".repeat(64) };

function renderForm(onSuccess = vi.fn()) {
  render(<QueryClientProvider client={new QueryClient()}><LoginForm onSuccess={onSuccess} /></QueryClientProvider>);
  return onSuccess;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("LoginForm", () => {
  it("asks for an international phone number before contacting the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderForm();
    await userEvent.type(screen.getByLabelText("رقم الهاتف"), "50000000");
    await userEvent.type(screen.getByLabelText("كلمة المرور"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "تسجيل الدخول" }));
    expect(await screen.findByText(/بالصيغة الدولية/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gets a login token, signs in, and reports the session", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(200, { csrfToken: "b".repeat(64) }))
      .mockResolvedValueOnce(json(200, session));
    vi.stubGlobal("fetch", fetchMock);
    const onSuccess = renderForm();
    await userEvent.type(screen.getByLabelText("رقم الهاتف"), "+96550000000");
    await userEvent.type(screen.getByLabelText("كلمة المرور"), "secret");
    await userEvent.click(screen.getByRole("button", { name: "تسجيل الدخول" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(session));
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/auth/login");
    expect(new Headers(init.headers).get("X-CSRF-Token")).toBe("b".repeat(64));
    expect(init.body).toBe(JSON.stringify({ phone: "+96550000000", password: "secret" }));
  });

  it("shows the server's reason when sign-in is refused", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json(200, { csrfToken: "b".repeat(64) }))
      .mockResolvedValueOnce(json(401, { error: { code: "INVALID_CREDENTIALS", message: "رقم الهاتف أو كلمة المرور غير صحيحين" } })));
    renderForm();
    await userEvent.type(screen.getByLabelText("رقم الهاتف"), "+96550000000");
    await userEvent.type(screen.getByLabelText("كلمة المرور"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "تسجيل الدخول" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("رقم الهاتف أو كلمة المرور غير صحيحين");
  });
});

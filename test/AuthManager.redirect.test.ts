import AuthManager from "../src/AuthManager";

class TestAuthManager extends AuthManager {
  protected async getTokenEndpointUrl(_grantType: string): Promise<string> {
    return "https://example.test/token";
  }
}

describe("AuthManager.handleRedirect", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  function createManager(navigateCallback = jest.fn()) {
    return new TestAuthManager({
      clientId: "client",
      authority: "https://example.test",
      scopes: "openid",
      redirectUri: "/oauth/callback",
      navigateCallback,
      policies: {},
    });
  }

  function setCallback(code: string, state: string) {
    window.history.replaceState({}, "", "/oauth/callback?code=" + code + "&state=" + state);
    localStorage.setItem("auth_pkce_verifier", "verifier-" + code);
    localStorage.setItem("auth_state", state);
  }

  test("shares the exchange and its settled result for repeated callbacks", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
      }),
    });
    globalThis.fetch = fetchMock;
    const navigate = jest.fn();
    const manager = createManager(navigate);
    const onLogin = jest.fn();
    manager.addEventListener("login", onLogin);
    setCallback("first", "state-1");
    localStorage.setItem("auth_original_url", "/dashboard");

    const first = manager.handleRedirect();
    const second = manager.handleRedirect();

    expect(second).toBe(first);
    await Promise.all([first, second]);
    await expect(manager.handleRedirect()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/dashboard");
    expect(localStorage.getItem("auth_pkce_verifier")).toBeNull();
    expect(localStorage.getItem("auth_state")).toBeNull();
    expect(manager.isAuthenticated()).toBe(true);
  });

  test("handles a later callback with a new code and state", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
      }),
    });
    globalThis.fetch = fetchMock;
    const manager = createManager();
    const onLogin = jest.fn();
    manager.addEventListener("login", onLogin);

    setCallback("first", "state-1");
    await manager.handleRedirect();

    setCallback("second", "state-2");
    await manager.handleRedirect();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onLogin).toHaveBeenCalledTimes(2);
  });
});

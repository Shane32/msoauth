import AuthManager, { AuthManagerConfiguration, PolicyFunction } from "./AuthManager";

/**
 * A proxy implementation of AuthManager that only handles provider selection
 * Used when multiple providers are configured but none is active
 */
class ProxyAuthManager<TPolicyNames extends string = string> extends AuthManager<TPolicyNames> {
  private providers: Map<string, AuthManager<TPolicyNames>> = new Map();
  private defaultProviderId: string;

  /**
   * Creates a new instance of ProxyAuthManager
   * @param {AuthManager[]} providers - The available auth providers
   * @param {string} [defaultProviderId] - The default provider ID
   * @throws {Error} If no providers are provided, if there are duplicate provider IDs, or if the default provider ID is invalid
   */
  constructor(providers: AuthManager<TPolicyNames>[], defaultProviderId?: string) {
    // Validate providers
    if (!providers || providers.length === 0) {
      throw new Error("At least one provider must be specified");
    }

    // Create a minimal configuration for the proxy
    super({
      id: "proxy",
      clientId: "",
      authority: "",
      scopes: "",
      redirectUri: "/",
      navigateCallback: () => {},
      policies: {} as Record<TPolicyNames, PolicyFunction>,
    } as AuthManagerConfiguration<TPolicyNames>);

    // Initialize providers map, checking for duplicate IDs
    const usedIds = new Set<string>();
    providers.forEach((provider) => {
      const id = provider.id;

      // Ensure ID is unique
      if (usedIds.has(id)) {
        throw new Error(`Duplicate provider ID "${id}" found`);
      }

      usedIds.add(id);
      this.providers.set(id, provider);
    });

    // Validate and set default provider ID
    if (defaultProviderId) {
      if (!this.providers.has(defaultProviderId)) {
        throw new Error(`Default provider ID "${defaultProviderId}" not found`);
      }
      this.defaultProviderId = defaultProviderId;
    } else {
      // If no default provider is specified, use the first provider
      this.defaultProviderId = providers[0].id;
    }
  }

  /**
   * Gets all available providers
   * @returns {Map<string, AuthManager<TPolicyNames>>} Map of provider ID to provider
   */
  public getProviders(): Map<string, AuthManager<TPolicyNames>> {
    return this.providers;
  }

  /**
   * Gets the default provider ID
   * @returns {string} The default provider ID
   */
  public getDefaultProviderId(): string {
    return this.defaultProviderId;
  }

  /**
   * Initiates the OAuth login flow with the specified provider
   * @param {string} [path] - Optional path to redirect after login
   * @param {string} [providerId] - Optional provider ID to use for login
   */
  public async login(path?: string, providerId?: string): Promise<void> {
    const provider = this.providers.get(providerId || this.defaultProviderId);
    if (!provider) {
      throw new Error(`Provider with ID "${providerId}" not found`);
    }
    await provider.login(path);
  }

  /**
   * Handles the OAuth redirect callback
   * Tries each provider until one successfully handles the redirect
   */
  public async handleRedirect(providerId?: string): Promise<void> {
    const provider = this.providers.get(providerId || this.defaultProviderId);
    if (!provider) {
      throw new Error(`Provider with ID "${providerId}" not found`);
    }
    await provider.handleRedirect();
  }

  /**
   * When logged in, refreshes the access token if it's expired
   * Tries each provider until one successfully authenticates
   */
  public async autoLogin(): Promise<void> {
    // Try to auto-login with each provider
    const providers = Array.from(this.providers.values());
    for (const provider of providers) {
      try {
        await provider.autoLogin();
        if (provider.isAuthenticated()) {
          return;
        }
      } catch (error) {
        // Ignore errors and try the next provider
      }
    }
  }

  public async logout(path?: string): Promise<void> {
    throw new Error("No active provider. Use a specific provider to log out.");
  }

  public async getAccessToken(): Promise<string> {
    throw new Error("No active provider. Use a specific provider to get an access token.");
  }

  public async getMsAccessToken(): Promise<string> {
    throw new Error("No active provider. Use a specific provider to get an MS Graph access token.");
  }

  public isAuthenticated(): boolean {
    return false; // Always return false since no provider is active
  }

  public can(policy: TPolicyNames): boolean {
    return false; // Always return false since no provider is active
  }
}

export default ProxyAuthManager;

/**
 * OpenID Connect provider configuration endpoints
 */
export interface OpenIDConfiguration {
  /** URL of the authorization endpoint */
  authorization_endpoint: string;
  /** URL of the token endpoint */
  token_endpoint: string;
  /** URL of the end session endpoint */
  end_session_endpoint: string;
  /** The issuer identifier for the OpenID provider */
  issuer: string;
}

/**
 * Manages OpenID Connect configuration by fetching and caching the configuration
 * from the provider's well-known endpoint.
 */
class OpenIDConfigurationManager {
  /** Promise for ongoing configuration fetch request */
  private configPromise: Promise<OpenIDConfiguration> | null = null;
  /** Cached configuration to avoid repeated fetches */
  private cachedConfig: OpenIDConfiguration | null = null;

  /**
   * Creates a new instance of OpenIDConfigurationManager
   * @param {string} authority - Base URL of the OpenID Connect provider
   */
  constructor(private authority: string) {}

  /**
   * Fetches the OpenID configuration from the provider's well-known endpoint
   * @returns {Promise<OpenIDConfiguration>} The OpenID configuration
   * @throws {Error} If the configuration fetch fails
   */
  private async fetchOpenIDConfiguration(): Promise<OpenIDConfiguration> {
    const trimmedAuthority = this.authority.replace(/\/+$/, "");
    const response = await fetch(`${trimmedAuthority}/.well-known/openid-configuration`);

    if (!response.ok) {
      throw new Error("Failed to fetch OpenID configuration");
    }

    return await response.json();
  }

  /**
   * Gets the OpenID configuration, using cached values if available
   * Implements a caching strategy to avoid unnecessary network requests
   * @returns {Promise<OpenIDConfiguration>} The OpenID configuration
   * @throws {Error} If the configuration fetch fails
   */
  public async getConfiguration(): Promise<OpenIDConfiguration> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    if (this.configPromise) {
      return this.configPromise;
    }

    this.configPromise = this.fetchOpenIDConfiguration();

    try {
      this.cachedConfig = await this.configPromise;
      return this.cachedConfig;
    } finally {
      this.configPromise = null;
    }
  }

  /**
   * Clears the cached configuration
   * Forces the next getConfiguration call to fetch fresh data
   */
  public clearCache(): void {
    this.cachedConfig = null;
  }
}

export default OpenIDConfigurationManager;

import AuthManager, { AuthManagerConfiguration } from "./AuthManager";

/**
 * Configuration object for GoogleAuthManager
 * Extends AuthManagerConfiguration with Google-specific options
 */
export interface GoogleAuthManagerConfiguration<TPolicyNames extends string = string> extends AuthManagerConfiguration<TPolicyNames> {
  /** URL for the proxy endpoint that will handle token requests with client secret */
  proxyUrl: string;
}

/**
 * Google-specific implementation of AuthManager
 * Handles Google OAuth flows and token management with proxy support for client_secret
 * @template TPolicyNames - Enum type for policy keys
 */
class GoogleAuthManager<TPolicyNames extends string = string> extends AuthManager<TPolicyNames> {
  /** URL for the proxy endpoint that will handle token requests with client secret */
  private readonly proxyUrl: string;

  /**
   * Creates a new instance of GoogleAuthManager
   * @param {GoogleAuthManagerConfiguration} config - Configuration object for the GoogleAuthManager
   */
  constructor(config: GoogleAuthManagerConfiguration<TPolicyNames>) {
    // Validate proxyUrl
    if (!config.proxyUrl) {
      throw new Error("proxyUrl is required for GoogleAuthManager");
    }

    // Add Google-specific scopes to the configuration
    const googleConfig = { ...config };

    // Add required Google scopes (openid profile email) to the provided scopes
    // avoiding duplicates
    const requiredScopes = ["openid", "profile", "email"];
    const existingScopes = googleConfig.scopes.split(" ").filter((s) => s.trim() !== "");

    // Add required scopes that don't already exist
    for (const scope of requiredScopes) {
      if (!existingScopes.includes(scope)) {
        existingScopes.push(scope);
      }
    }

    // Update the scopes in the config
    googleConfig.scopes = existingScopes.join(" ");

    // Store proxyUrl for later use
    const proxyUrl = config.proxyUrl;

    // Call the parent constructor with the updated config
    super(googleConfig);

    // Store the proxy URL
    this.proxyUrl = proxyUrl;
  }

  /**
   * Override getTokenEndpointUrl to use the proxy URL instead of the token endpoint
   * @param {string} grantType - The OAuth grant type (e.g., "authorization_code", "refresh_token")
   * @returns {Promise<string>} The URL to use for token requests
   * @protected
   */
  protected async getTokenEndpointUrl(grantType: string): Promise<string> {
    // Use the proxy URL for all token requests
    return this.proxyUrl;
  }
}

export default GoogleAuthManager;

import AuthManager, { AuthManagerConfiguration } from "./AuthManager";
import { TokenResponse } from "./AuthManager.helpers";

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

    // Add openid scopes to the configuration
    const googleConfig = {
      ...config,
      scopes: ((config.scopes || "") + " openid profile email").trim(),
    };

    // Call the parent constructor with the updated config
    super(googleConfig);

    // Store the proxy URL
    this.proxyUrl = config.proxyUrl;
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

  /**
   * Override generateRedirectParams to include access_type=offline
   * This ensures Google OAuth will always return a refresh token
   * @param {string} code - The authorization code from the OAuth provider
   * @param {string} codeVerifier - The PKCE code verifier
   * @returns {URLSearchParams} The parameters for the token request
   * @protected
   */
  protected generateRedirectParams(code: string, codeVerifier: string): URLSearchParams {
    // Get base params from parent class
    const params = super.generateRedirectParams(code, codeVerifier);

    // Add access_type=offline to ensure we get a refresh token
    params.append("access_type", "offline");

    return params;
  }

  /**
   * Override parseTokenResponse to set access_token to equal id_token
   * This is useful for Google OAuth where the id_token contains user information
   * that may be needed for authentication purposes
   * @param {TokenResponse} response - The raw token response from the OAuth provider
   * @returns {TokenResponse} The modified token response
   * @protected
   */
  protected parseTokenResponse(response: TokenResponse): TokenResponse {
    // Create a copy of the response to avoid modifying the original
    const parsedResponse = { ...response };

    // If id_token exists, set access_token to equal id_token
    if (parsedResponse.id_token) {
      parsedResponse.access_token = parsedResponse.id_token;
    }

    return parsedResponse;
  }
}

export default GoogleAuthManager;

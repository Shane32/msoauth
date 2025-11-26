/* eslint-disable @typescript-eslint/naming-convention */
import {
  extractUserInfo,
  extractTokenExpiration,
  convertTokenInfoToV3,
  generatePKCECodes,
  generateState,
  getCurrentRelativeUrl,
  TokenInfo,
  TokenInfoV1,
  TokenResponse,
  UserInfo,
} from "./AuthManager.helpers";
import OpenIDConfigurationManager from "./OpenIDConfigurationManager";

/** Types of authentication events that can be listened to */
export type AuthEventType = "login" | "logout" | "tokensChanged";
/** Callback function type for auth event listeners */
export type AuthEventListener = () => void;
/** Callback function type for navigation */
export type NavigateCallback = (
  /** The relative path to navigate to (must start with '/') */
  path: string,
) => void;
/** Type for policy functions that evaluate user roles */
export type PolicyFunction = (roles: string[]) => boolean;

/**
 * Represents a set of OAuth scopes with a name
 */
export interface ScopeSet {
  /** Name of the scope set */
  name: string;
  /** Space-delimited string of OAuth scopes */
  scopes: string;
}

/**
 * Configuration object for AuthManager
 */
export interface AuthManagerConfiguration<TPolicyNames extends string = string> {
  /** Provider ID (optional, defaults to "default") */
  id?: string;
  /** OAuth client ID */
  clientId: string;
  /** Base URL of the OAuth authority */
  authority: string;
  /** OAuth scopes requested (for backward compatibility, used as default scope set) */
  scopes: string;
  /** Additional named scope sets */
  scopeSets?: ScopeSet[];
  /** URI where the OAuth provider will redirect after login */
  redirectUri: string;
  /** Function to handle navigation in the app */
  navigateCallback: NavigateCallback;
  /** Object containing policy functions for authorization */
  policies: Record<TPolicyNames, PolicyFunction>;
  /** Optional URI for redirect after logout */
  logoutRedirectUri?: string;
}

/**
 * Manages OAuth authentication flow, token handling, and user authorization.
 * Implements PKCE (Proof Key for Code Exchange) for secure authorization code flow.
 * @template TPolicyNames - Enum type for policy keys
 */
class AuthManager<TPolicyNames extends string = string> {
  // Provider-specific storage keys
  private readonly tokenKey: string;
  private readonly verifierKey: string;
  private readonly stateKey: string;
  private readonly originalUrlKey: string;

  // Add ID property
  readonly id: string;

  private tokenInfo: TokenInfo | null = null;
  private refreshPromise: Promise<void> | null = null;
  private eventListeners: Map<AuthEventType, Set<AuthEventListener>> = new Map();
  protected configManager: OpenIDConfigurationManager;
  private readonly absoluteRedirectUri: string;
  private readonly absoluteLogoutRedirectUri: string | undefined;
  private readonly policies: Record<TPolicyNames, PolicyFunction>;
  private readonly defaultScopes: string;
  private readonly allScopes: string;
  private readonly scopeSets: Map<string, string> = new Map();
  private readonly clientId: string;
  private readonly navigateCallback: NavigateCallback;
  public userInfo: UserInfo | null = null;

  /**
   * Creates a new instance of AuthManager
   * @param {AuthManagerConfiguration} config - Configuration object for the AuthManager
   */
  constructor(config: AuthManagerConfiguration<TPolicyNames>) {
    if (!config.redirectUri.startsWith("/")) {
      throw new Error('redirectUri must start with "/"');
    }
    if (config.logoutRedirectUri && !config.logoutRedirectUri.startsWith("/")) {
      throw new Error('logoutRedirectUri must start with "/"');
    }

    // Default ID to "default" if not provided (for backward compatibility)
    this.id = config.id || "default";

    // Initialize provider-specific storage keys
    const keyId = config.id ? `_${config.id}` : "";
    this.tokenKey = `auth_tokens${keyId}`;
    this.verifierKey = `auth_pkce_verifier${keyId}`;
    this.stateKey = `auth_state${keyId}`;
    this.originalUrlKey = `auth_original_url${keyId}`;

    this.clientId = config.clientId;
    this.navigateCallback = config.navigateCallback;
    this.absoluteRedirectUri = `${window.location.origin}${config.redirectUri}`;
    this.absoluteLogoutRedirectUri = config.logoutRedirectUri ? `${window.location.origin}${config.logoutRedirectUri}` : undefined;
    this.policies = config.policies;

    // Initialize scopes as requested
    this.defaultScopes = config.scopes;
    this.scopeSets.set("default", this.defaultScopes);

    // Initialize allScopes with default scopes
    let allScopesList = this.defaultScopes.split(" ").filter((s) => s.trim() !== "");

    // Add additional scope sets from config
    if (config.scopeSets) {
      for (const scopeSet of config.scopeSets) {
        this.scopeSets.set(scopeSet.name, scopeSet.scopes);
        // Add unique scopes to allScopesList
        const scopesArray = scopeSet.scopes.split(" ").filter((s) => s.trim() !== "");
        for (const scope of scopesArray) {
          if (!allScopesList.includes(scope)) {
            allScopesList.push(scope);
          }
        }
      }
    }

    // Set allScopes as a space-separated string of all unique scopes
    this.allScopes = allScopesList.join(" ");

    this.configManager = new OpenIDConfigurationManager(config.authority);

    // Try to load tokens from storage
    const stored = localStorage.getItem(this.tokenKey);
    if (stored) {
      const parsedToken = JSON.parse(stored);

      // Convert from older versions to version 3 if needed
      this.tokenInfo = convertTokenInfoToV3(parsedToken);

      // Initialize userInfo from stored token
      if (this.tokenInfo && this.tokenInfo.version === 3) {
        this.userInfo = extractUserInfo(this.tokenInfo.idToken);
      }
    }
  }

  // ====== Event handling ======

  /**
   * Registers an event listener for authentication events
   * @param {AuthEventType} event - Type of event to listen for
   * @param {AuthEventListener} listener - Callback function to execute
   */
  public addEventListener(event: AuthEventType, listener: AuthEventListener): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  /**
   * Removes an event listener for authentication events
   * @param {AuthEventType} event - Type of event to stop listening for
   * @param {AuthEventListener} listener - Callback function to remove
   */
  public removeEventListener(event: AuthEventType, listener: AuthEventListener): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  /**
   * Triggers an authentication event
   * @param {AuthEventType} event - Type of event to emit
   */
  private emitEvent(event: AuthEventType): void {
    this.eventListeners.get(event)?.forEach((listener) => listener());
  }

  // ====== Authentication methods ======

  /**
   * When logged in, refreshes the access token if it's expired, otherwise logs out
   */
  public async autoLogin(): Promise<void> {
    if (this.tokenInfo) {
      try {
        // if the token has expired, refresh the tokens
        await this.getAccessToken();
      } catch (err) {
        console.warn("Unable to refresh cached tokens", err);
        // Failed to refresh token - user needs to login manually
        this.localLogout();
      }
    }
  }

  /**
   * Checks if the user is currently authenticated
   * @returns {boolean} True if user has valid refresh tokens
   */
  public isAuthenticated(): boolean {
    return this.tokenInfo !== null && this.tokenInfo.refreshToken !== undefined && this.tokenInfo.refreshToken !== "";
  }

  /**
   * Initiates the OAuth login flow with PKCE
   * Redirects to the OAuth provider's authorization endpoint
   * @param {string} [path] - Optional path to redirect after login
   */
  public async login(path?: string): Promise<void> {
    // Store current URL before redirecting
    localStorage.setItem(this.originalUrlKey, path || getCurrentRelativeUrl());

    const pkce = await generatePKCECodes();
    const config = await this.configManager.getConfiguration();

    // Store verifier for later use
    localStorage.setItem(this.verifierKey, pkce.codeVerifier);

    // Generate and store state
    const state = generateState();
    localStorage.setItem(this.stateKey, state);

    // Generate login parameters
    const params = this.generateLoginParams(pkce.codeChallenge, state);

    window.location.href = `${config.authorization_endpoint}?${params.toString()}`;
  }

  /**
   * Generates the parameters for the login request
   * @param {string} codeChallenge - The PKCE code challenge
   * @param {string} state - The state parameter for CSRF protection
   * @returns {URLSearchParams} The parameters for the login request
   * @protected
   */
  protected generateLoginParams(codeChallenge: string, state: string): URLSearchParams {
    return new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.absoluteRedirectUri,
      response_type: "code",
      scope: this.allScopes,
      state,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
    });
  }

  /**
   * Handles the OAuth redirect callback
   * Exchanges the authorization code for tokens
   * If multiple scope sets exist, immediately refreshes tokens to get tokens for all scope sets
   * If only one scope set exists, uses the returned tokens directly
   * @throws {Error} If authorization code is missing or invalid
   */
  public async handleRedirect(): Promise<void> {
    // Parse the query string
    const queryParams = new URLSearchParams(window.location.search);
    const code = queryParams.get("code");
    if (!code) {
      throw new Error("No authorization code found");
    }

    // Get stored code verifier
    const codeVerifier = localStorage.getItem(this.verifierKey);
    if (!codeVerifier) {
      throw new Error("No code verifier found");
    }

    // Verify state parameter
    const storedState = localStorage.getItem(this.stateKey);
    if (!storedState || storedState !== queryParams.get("state")) {
      throw new Error("Invalid state parameter");
    }

    // Clean up state
    localStorage.removeItem(this.stateKey);

    // Generate params for token request
    const params = this.generateRedirectParams(code, codeVerifier);

    // Clean up verifier
    localStorage.removeItem(this.verifierKey);

    const response = await fetch(await this.getTokenEndpointUrl("authorization_code"), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error("Failed to get tokens");
    }

    const rawData = await response.json();

    // Parse the token response
    const data = this.parseTokenResponse(rawData);

    if (this.scopeSets.size === 1) {
      // If only one scope set exists, use the returned tokens directly
      this.tokenInfo = {
        version: 3,
        refreshToken: data.refresh_token,
        idToken: data.id_token || "",
        idTokenExpiresAt: data.id_token ? extractTokenExpiration(data.id_token) : 0,
        accessTokens: {
          default: {
            token: data.access_token,
            expiresAt: Date.now() + data.expires_in * 1000,
          },
        },
      };

      // Update user info from ID token
      if (data.id_token) {
        this.userInfo = extractUserInfo(data.id_token);
      }

      // Save tokens to local storage
      localStorage.setItem(this.tokenKey, JSON.stringify(this.tokenInfo));
      this.emitEvent("tokensChanged");
    } else {
      // If multiple scope sets exist, refresh tokens to get tokens for all scope sets
      await this.refreshTokens(data.refresh_token);
    }

    this.emitEvent("login");

    // Restore original URL if it exists
    const originalUrl = localStorage.getItem(this.originalUrlKey);
    if (originalUrl) {
      localStorage.removeItem(this.originalUrlKey);
      this.navigateCallback(originalUrl);
    }
  }

  /**
   * Initiates the logout process
   * Clears local tokens and optionally redirects to the OAuth provider's logout endpoint
   * @param {string} [path] - Optional path to redirect after logout
   */
  public async logout(path?: string): Promise<void> {
    // Store current URL before redirecting
    localStorage.setItem(this.originalUrlKey, path || getCurrentRelativeUrl());

    // First perform local logout
    this.localLogout();

    // Perform OIDC logout if configured
    const config = await this.configManager.getConfiguration();
    if (config.end_session_endpoint) {
      const params = this.absoluteLogoutRedirectUri
        ? new URLSearchParams({
            client_id: this.clientId,
            post_logout_redirect_uri: this.absoluteLogoutRedirectUri,
          })
        : new URLSearchParams({
            client_id: this.clientId,
          });
      window.location.href = `${config.end_session_endpoint}?${params.toString()}`;
    }
  }

  /**
   * Handles the redirect after logout
   * Restores the original URL or navigates to home
   */
  public handleLogoutRedirect(): void {
    // Restore original URL if it exists
    const originalUrl = localStorage.getItem(this.originalUrlKey);
    if (originalUrl) {
      localStorage.removeItem(this.originalUrlKey);
      this.navigateCallback(originalUrl);
    } else {
      this.navigateCallback("/");
    }
  }

  /**
   * Performs local logout by clearing tokens and cache
   */
  private localLogout(): void {
    if (!this.tokenInfo && !this.userInfo) {
      return;
    }
    this.tokenInfo = null;
    this.userInfo = null;
    this.configManager.clearCache();
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.verifierKey);
    localStorage.removeItem(this.stateKey);
    this.emitEvent("logout");
    this.emitEvent("tokensChanged");
  }

  /**
   * Gets a valid access token for the specified scope set
   * @param {string} [scopeSetName="default"] - The name of the scope set to get the token for
   * @returns {Promise<string>} A valid access token
   * @throws {Error} If not authenticated, token refresh fails, or scope set doesn't exist
   */
  public async getAccessToken(scopeSetName: string = "default"): Promise<string> {
    if (!this.tokenInfo) {
      throw new Error("Not authenticated");
    }

    if (!this.scopeSets.has(scopeSetName)) {
      throw new Error(`Scope set '${scopeSetName}' does not exist`);
    }

    if (this.isTokenExpired()) {
      await this.refreshTokens();
    }

    const token = this.tokenInfo.accessTokens[scopeSetName]?.token;
    if (!token) {
      throw new Error(`No token available for scope set '${scopeSetName}'`);
    }

    return token;
  }

  /**
   * Gets a valid ID token, refreshing if necessary
   * @returns {Promise<string>} A valid ID token
   * @throws {Error} If not authenticated or token refresh fails
   */
  public async getIdToken(): Promise<string> {
    if (!this.tokenInfo) {
      throw new Error("Not authenticated");
    }

    if (this.isIdTokenExpired()) {
      await this.refreshTokens();
    }

    if (!this.tokenInfo.idToken) {
      throw new Error("No ID token available");
    }

    return this.tokenInfo.idToken;
  }

  /**
   * Refreshes all access tokens using the refresh token,
   * allowing simultaneous calls to avoid multiple refreshes.
   * A single call to refreshTokensInternal will be made, if needed.
   * @param {string} [refreshToken] - Optional refresh token to use
   * @throws {Error} If token refresh fails
   */
  private async refreshTokens(refreshToken?: string): Promise<void> {
    if (this.refreshPromise) {
      await this.refreshPromise;
      return;
    }

    this.refreshPromise = this.refreshTokensInternal(refreshToken);

    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Refreshes all access tokens using the refresh token
   * @param {string} [refreshToken] - Optional refresh token to use
   * @throws {Error} If token refresh fails
   */
  protected async refreshTokensInternal(refreshToken?: string): Promise<void> {
    let currentRefreshToken = refreshToken ?? this.tokenInfo?.refreshToken;

    if (!currentRefreshToken) {
      console.warn("No refresh token available during token refresh; logging out");
      this.localLogout();
      throw new Error("No refresh token available");
    }

    // Initialize token info if needed
    if (!this.tokenInfo) {
      this.tokenInfo = {
        version: 3,
        refreshToken: currentRefreshToken,
        idToken: "",
        idTokenExpiresAt: 0,
        accessTokens: {},
      };
    }

    // Create a copy of the current token info
    const newTokenInfo = {
      ...this.tokenInfo,
      accessTokens: { ...this.tokenInfo.accessTokens },
    };

    // Refresh tokens for all scope sets
    // Note: if refresh fails, we do not log out the user automatically; just throw an error
    //   since it could be a temporary connectivity issue
    const scopeEntries = Array.from(this.scopeSets.entries());
    for (let i = 0; i < scopeEntries.length; i++) {
      const [scopeSetName, scopes] = scopeEntries[i];

      if (!scopes || scopes.trim() === "") continue;

      const params = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.clientId,
        refresh_token: currentRefreshToken,
        scope: scopes,
      });

      const response = await fetch(await this.getTokenEndpointUrl("refresh_token"), {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        throw new Error(`Failed to refresh token for scope set '${scopeSetName}'`);
      }

      const rawData = await response.json();

      // Parse the token response
      const data = this.parseTokenResponse(rawData);

      // Update the refresh token for subsequent requests only if a new one is provided
      // This preserves the existing token if the provider doesn't rotate refresh tokens
      if (!!data.refresh_token) {
        currentRefreshToken = data.refresh_token;
      }

      // Update the token info
      newTokenInfo.accessTokens[scopeSetName] = {
        token: data.access_token,
        expiresAt: Date.now() + Number(data.expires_in) * 1000,
      };

      // Update ID token and its expiration if present
      if (data.id_token) {
        const idTokenExpiresAt = extractTokenExpiration(data.id_token);
        newTokenInfo.idToken = data.id_token;
        newTokenInfo.idTokenExpiresAt = idTokenExpiresAt;
      }
    }

    // Extract user info from the new ID token
    const userInfo = newTokenInfo.idToken ? extractUserInfo(newTokenInfo.idToken) : null;

    // Set tokenInfo and userInfo atomically (to avoid inconsistent state)

    // Update the tokens, and update the refresh token with the latest one
    this.tokenInfo = {
      ...newTokenInfo,
      refreshToken: currentRefreshToken,
    };

    // Update user info from ID token
    if (userInfo) {
      this.userInfo = userInfo;
    }

    // Save tokens to local storage
    localStorage.setItem(this.tokenKey, JSON.stringify(this.tokenInfo));
    this.emitEvent("tokensChanged");
  }

  /**
   * Checks if any access token is expired
   * @returns {boolean} True if any token is expired or close to expiring
   */
  private isTokenExpired(): boolean {
    if (!this.tokenInfo || !this.tokenInfo.accessTokens) return true;

    const now = Date.now();
    const expirationBuffer = 5 * 60 * 1000; // 5 minutes

    // Check if any token is expired or missing
    for (const scope of Array.from(this.scopeSets.keys())) {
      const tokenInfo = this.tokenInfo.accessTokens[scope];
      if (!tokenInfo || tokenInfo.expiresAt - now < expirationBuffer) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if the ID token is expired
   * @returns {boolean} True if ID token is expired or close to expiring
   */
  private isIdTokenExpired(): boolean {
    if (!this.tokenInfo || !this.tokenInfo.idTokenExpiresAt) return true;

    const now = Date.now();
    const expirationBuffer = 5 * 60 * 1000; // 5 minutes

    return this.tokenInfo.idTokenExpiresAt - now < expirationBuffer;
  }

  /**
   * Checks if the user has a specific policy permission
   * @param {TPolicyNames} policy - The policy to check
   * @returns {boolean} True if user has the specified policy permission
   */
  public can(policy: TPolicyNames): boolean {
    return this.userInfo ? (this.policies[policy]?.(this.userInfo.roles) ?? false) : false;
  }

  /**
   * Gets the token endpoint URL for a specific grant type
   * @param {string} grantType - The OAuth grant type (e.g., "authorization_code", "refresh_token")
   * @returns {Promise<string>} The URL to use for token requests
   * @protected
   */
  protected async getTokenEndpointUrl(grantType: string): Promise<string> {
    const config = await this.configManager.getConfiguration();
    return config.token_endpoint;
  }

  /**
   * Generates the parameters for the token request during redirect handling
   * @param {string} code - The authorization code from the OAuth provider
   * @param {string} codeVerifier - The PKCE code verifier
   * @returns {URLSearchParams} The parameters for the token request
   * @protected
   */
  protected generateRedirectParams(code: string, codeVerifier: string): URLSearchParams {
    return new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.clientId,
      code_verifier: codeVerifier,
      code,
      redirect_uri: this.absoluteRedirectUri,
    });
  }

  /**
   * Parses the token response from the OAuth provider
   * @param {TokenResponse} response - The raw token response from the OAuth provider
   * @returns {TokenResponse} The parsed token response
   * @protected
   */
  protected parseTokenResponse(response: TokenResponse): TokenResponse {
    // By default, just return the response as-is
    return response;
  }
}

export default AuthManager;

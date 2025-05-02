/* eslint-disable @typescript-eslint/naming-convention */
import {
  extractUserInfo,
  generatePKCECodes,
  generateState,
  getCurrentRelativeUrl,
  TokenInfo,
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
  path: string
) => void;
/** Type for policy functions that evaluate user roles */
export type PolicyFunction = (roles: string[]) => boolean;

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
  /** OAuth scopes requested */
  scopes: string;
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
  private configManager: OpenIDConfigurationManager;
  private readonly absoluteRedirectUri: string;
  private readonly absoluteLogoutRedirectUri: string | undefined;
  private readonly policies: Record<TPolicyNames, PolicyFunction>;
  private readonly scopes: string;
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
    this.scopes = `openid profile offline_access ${config.scopes}`;
    this.configManager = new OpenIDConfigurationManager(config.authority);

    // Try to load tokens from storage
    const stored = localStorage.getItem(this.tokenKey);
    if (stored) {
      this.tokenInfo = JSON.parse(stored);
      // Initialize userInfo from stored token
      if (this.tokenInfo && this.tokenInfo.version === 1) {
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
   * @returns {boolean} True if user has valid tokens
   */
  public isAuthenticated(): boolean {
    return this.tokenInfo !== null && !this.isTokenExpired();
  }

  /**
   * Initiates the OAuth login flow with PKCE
   * Redirects to the OAuth provider's authorization endpoint
   * @param {string} [path] - Optional path to redirect after login
   * @param {string} [providerId] - Optional provider ID (ignored in base AuthManager)
   */
  public async login(path?: string, providerId?: string): Promise<void> {
    // Store current URL before redirecting
    localStorage.setItem(this.originalUrlKey, path || getCurrentRelativeUrl());

    const pkce = await generatePKCECodes();
    const config = await this.configManager.getConfiguration();

    // Store verifier for later use
    localStorage.setItem(this.verifierKey, pkce.codeVerifier);

    // Generate and store state
    const state = generateState();
    localStorage.setItem(this.stateKey, state);

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.absoluteRedirectUri,
      response_type: "code",
      scope: this.scopes,
      state,
      code_challenge_method: "S256",
      code_challenge: pkce.codeChallenge,
    });

    window.location.href = `${config.authorization_endpoint}?${params.toString()}`;
  }

  /**
   * Handles the OAuth redirect callback
   * Exchanges the authorization code for tokens and immediately refreshes them
   * @param {string} [providerId] - Optional provider ID (ignored in base AuthManager)
   * @throws {Error} If authorization code is missing or invalid
   */
  public async handleRedirect(providerId?: string): Promise<void> {
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

    const config = await this.configManager.getConfiguration();

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.clientId,
      code_verifier: codeVerifier,
      code,
      redirect_uri: this.absoluteRedirectUri,
    });

    // Clean up verifier
    localStorage.removeItem(this.verifierKey);

    const response = await fetch(config.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error("Failed to get tokens");
    }

    const data: TokenResponse = await response.json();

    // Set initial tokens and immediately refresh them
    await this.refreshTokens(data.refresh_token);
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
   * Gets a valid access token for API requests
   * @returns {Promise<string>} A valid access token
   * @throws {Error} If not authenticated or token refresh fails
   */
  public async getAccessToken(): Promise<string> {
    if (!this.tokenInfo) {
      throw new Error("Not authenticated");
    }

    if (this.isTokenExpired()) {
      await this.refreshTokens();
    }

    return this.tokenInfo.apiAccessToken;
  }

  /**
   * Gets a valid access token for MS Graph requests
   * @returns {Promise<string>} A valid access token
   * @throws {Error} If not authenticated or token refresh fails
   */
  public async getMsAccessToken(): Promise<string> {
    if (!this.tokenInfo) {
      throw new Error("Not authenticated");
    }

    if (this.isTokenExpired()) {
      await this.refreshTokens();
    }

    return this.tokenInfo.msAccessToken;
  }

  /**
   * Refreshes both API and MS Graph access tokens using the refresh token
   * @throws {Error} If token refresh fails
   */
  private async refreshTokens(refreshToken?: string): Promise<void> {
    if (this.refreshPromise) {
      await this.refreshPromise;
      return;
    }

    this.refreshPromise = (async () => {
      const config = await this.configManager.getConfiguration();

      // Split scopes into API and MS Graph scopes
      const scopes = this.scopes.split(" ");
      const apiScopes = scopes.filter((s) => s.startsWith("api://"));
      const msScopes = scopes.filter((s) => !s.startsWith("api://"));

      // Refresh API token
      const apiParams = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.clientId,
        refresh_token: refreshToken ?? this.tokenInfo!.refreshToken,
        scope: apiScopes.join(" "),
      });

      const apiResponse = await fetch(config.token_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: apiParams.toString(),
      });

      if (!apiResponse.ok) {
        this.localLogout();
        throw new Error("Failed to refresh API token");
      }

      const apiData: TokenResponse = await apiResponse.json();

      // Refresh MS Graph token
      const msParams = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.clientId,
        refresh_token: apiData.refresh_token,
        scope: msScopes.join(" "),
      });

      const msResponse = await fetch(config.token_endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: msParams.toString(),
      });

      if (!msResponse.ok) {
        this.localLogout();
        throw new Error("Failed to refresh MS Graph token");
      }

      const msData: TokenResponse = await msResponse.json();

      // Update tokens with both responses
      this.tokenInfo = {
        version: 1,
        apiAccessToken: apiData.access_token,
        msAccessToken: msData.access_token,
        refreshToken: msData.refresh_token,
        apiExpiresAt: Date.now() + apiData.expires_in * 1000,
        msExpiresAt: Date.now() + msData.expires_in * 1000,
        idToken: msData.id_token,
      };
      this.userInfo = extractUserInfo(this.tokenInfo.idToken);
      localStorage.setItem(this.tokenKey, JSON.stringify(this.tokenInfo));
      this.emitEvent("tokensChanged");
    })();

    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Checks if either access token is expired
   * @returns {boolean} True if either token is expired or close to expiring
   */
  private isTokenExpired(): boolean {
    if (!this.tokenInfo) return true;
    const now = Date.now();
    // Refresh if either token has less than 5 minutes remaining
    return this.tokenInfo.apiExpiresAt - now < 5 * 60 * 1000 || this.tokenInfo.msExpiresAt - now < 5 * 60 * 1000;
  }

  /**
   * Checks if the user has a specific policy permission
   * @param {TPolicyNames} policy - The policy to check
   * @returns {boolean} True if user has the specified policy permission
   */
  public can(policy: TPolicyNames): boolean {
    return this.userInfo ? this.policies[policy]?.(this.userInfo.roles) ?? false : false;
  }
}

export default AuthManager;

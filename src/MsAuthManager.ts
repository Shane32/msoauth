import AuthManager, { AuthManagerConfiguration, ScopeSet } from "./AuthManager";

/**
 * Microsoft-specific implementation of AuthManager
 * Handles Microsoft-specific OAuth flows and token management
 * @template TPolicyNames - Enum type for policy keys
 */
class MsAuthManager<TPolicyNames extends string = string> extends AuthManager<TPolicyNames> {
  private hasApiScopes: boolean;

  /**
   * Creates a new instance of MsAuthManager
   * @param {AuthManagerConfiguration} config - Configuration object for the MsAuthManager
   */
  constructor(config: AuthManagerConfiguration<TPolicyNames>) {
    // Add Microsoft-specific scopes to the configuration
    const msConfig = { ...config };

    // Split the scopes by spaces
    const allScopes = config.scopes.split(" ").filter((scope) => scope.trim() !== "");

    // Filter API scopes (starting with "api://") and non-API scopes
    const apiScopes = allScopes.filter((scope) => scope.startsWith("api://"));
    const nonApiScopes = allScopes.filter((scope) => !scope.startsWith("api://"));

    // Update config.scopes to only include API scopes
    msConfig.scopes = apiScopes.join(" ");

    // Create a new scopeSets array with the MS-specific scope set
    // Include both standard MS scopes and non-API scopes from config
    const msScope: ScopeSet = {
      name: "ms",
      scopes: ["openid", "profile", "offline_access", ...nonApiScopes].join(" "),
    };

    // Add the MS scope set to the config
    msConfig.scopeSets = msConfig.scopeSets ? [...msConfig.scopeSets, msScope] : [msScope];

    // Call the parent constructor with the updated config
    super(msConfig);

    // Track whether we have API scopes
    this.hasApiScopes = apiScopes.length > 0;
  }

  /**
   * Gets a valid access token for the specified scope set
   * If no API scopes were configured and requesting the default scope set,
   * returns the ID token instead of the access token
   * @param {string} [scopeSetName="default"] - The name of the scope set to get the token for
   * @returns {Promise<string>} A valid access token or ID token
   * @throws {Error} If not authenticated, token refresh fails, or scope set doesn't exist
   */
  public async getAccessToken(scopeSetName: string = "default"): Promise<string> {
    // If no API scopes were configured and requesting default scope set,
    // return the ID token instead
    if (!this.hasApiScopes && scopeSetName === "default") {
      return this.getIdToken();
    }

    // Otherwise, use the parent implementation
    return super.getAccessToken(scopeSetName);
  }
}

export default MsAuthManager;

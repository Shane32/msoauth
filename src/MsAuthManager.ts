import AuthManager, { AuthManagerConfiguration, ScopeSet } from "./AuthManager";

/**
 * Microsoft-specific implementation of AuthManager
 * Handles Microsoft-specific OAuth flows and token management
 * @template TPolicyNames - Enum type for policy keys
 */
class MsAuthManager<TPolicyNames extends string = string> extends AuthManager<TPolicyNames> {
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
  }
}

export default MsAuthManager;

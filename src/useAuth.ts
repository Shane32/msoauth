import { useContext } from "react";
import AuthContext from "./AuthContext";
import AuthManagersContext from "./AuthManagersContext";
import AuthManager from "./AuthManager";

/**
 * Hook to access the auth manager
 * @param {string} [providerId] - Optional provider ID to get a specific auth manager
 * @returns {AuthManager} The auth manager
 * @throws {Error} If used outside of an AuthProvider or if the specified provider is not found
 */
function useAuth<TPolicyNames extends string = string>(providerId?: string): AuthManager<TPolicyNames> {
  const authContext = useContext(AuthContext);
  const authManagersContext = useContext(AuthManagersContext);

  if (!authContext) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  // If no provider ID is specified, return the active provider from AuthContext
  if (!providerId) {
    return authContext.authManager as AuthManager<TPolicyNames>;
  }

  // If a provider ID is specified, get it from the AuthManagersContext
  if (!authManagersContext) {
    throw new Error("useAuth with providerId must be used within a MultiAuthProvider");
  }

  const provider = authManagersContext.get(providerId) as AuthManager<TPolicyNames> | undefined;
  if (!provider) {
    throw new Error(`Provider with ID "${providerId}" not found`);
  }

  return provider;
}

export default useAuth;

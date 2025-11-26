import React, { ReactNode, useEffect, useState, useMemo } from "react";
import AuthManager from "./AuthManager";
import AuthContext, { AuthContextValue } from "./AuthContext";
import AuthManagersContext from "./AuthManagersContext";
import ProxyAuthManager from "./ProxyAuthManager";

interface IProps<TPolicyNames extends string = string> {
  // Accept multiple managers
  authManagers: AuthManager<TPolicyNames>[];
  children: ReactNode;
}

/**
 * Provider component for multiple auth managers
 * Uses a ProxyAuthManager to handle provider selection when no provider is active
 */
function MultiAuthProvider<TPolicyNames extends string = string>({ authManagers, children }: IProps<TPolicyNames>) {
  // Create the proxy manager
  const proxyAuthManager = useMemo(() => new ProxyAuthManager<TPolicyNames>(authManagers), [authManagers]);

  // Helper to create a new map of auth managers by ID
  const createAuthManagersMap = React.useCallback(() => {
    const map = new Map<string, AuthManager<TPolicyNames>>();
    authManagers.forEach((manager) => {
      map.set(manager.id, manager);
    });
    return map;
  }, [authManagers]);

  // Compute the current auth manager
  const getCurrentAuthManager = React.useCallback(
    () => authManagers.find((provider) => provider.isAuthenticated()) || proxyAuthManager,
    [authManagers, proxyAuthManager],
  );

  // Create a wrapper object that changes on each auth state change to trigger context updates
  const [contextValue, setContextValue] = useState<AuthContextValue>(() => ({
    authManager: getCurrentAuthManager(),
  }));

  // Create a map that changes on each auth state change to trigger context updates
  const [authManagersMap, setAuthManagersMap] = useState<Map<string, AuthManager<TPolicyNames>>>(() => createAuthManagersMap());

  useEffect(() => {
    const handleAuthChange = () => {
      // Create new objects to trigger context updates across the app
      setContextValue({ authManager: getCurrentAuthManager() });
      setAuthManagersMap(createAuthManagersMap());
    };

    // Subscribe to auth events for all providers
    authManagers.forEach((provider) => {
      provider.addEventListener("login", handleAuthChange);
      provider.addEventListener("logout", handleAuthChange);
    });

    // Try to auto-login with the proxy manager
    proxyAuthManager.autoLogin().then(handleAuthChange);

    // Cleanup subscriptions
    return () => {
      authManagers.forEach((provider) => {
        provider.removeEventListener("login", handleAuthChange);
        provider.removeEventListener("logout", handleAuthChange);
      });
    };
  }, [authManagers, proxyAuthManager, getCurrentAuthManager, createAuthManagersMap]);

  return (
    <AuthManagersContext.Provider value={authManagersMap}>
      <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
    </AuthManagersContext.Provider>
  );
}

export default MultiAuthProvider;

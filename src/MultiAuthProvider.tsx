import React, { ReactNode, useEffect, useState, useMemo } from "react";
import AuthManager from "./AuthManager";
import AuthContext from "./AuthContext";
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

  // Create a map of auth managers by ID
  const authManagersMap = useMemo(() => {
    const map = new Map<string, AuthManager<TPolicyNames>>();
    authManagers.forEach((manager) => {
      map.set(manager.id, manager);
    });
    return map;
  }, [authManagers]);

  // Trigger a re-render when the auth state changes
  const [, setTrigger] = useState({});

  useEffect(() => {
    const handleAuthChange = () => {
      setTrigger({});
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
  }, [authManagers, proxyAuthManager]);

  // Compute the current auth manager on each render
  const currentAuthManager = authManagers.find((provider) => provider.isAuthenticated()) || proxyAuthManager;

  return (
    <AuthManagersContext.Provider value={authManagersMap}>
      <AuthContext.Provider value={currentAuthManager}>{children}</AuthContext.Provider>
    </AuthManagersContext.Provider>
  );
}

export default MultiAuthProvider;

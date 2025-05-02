import React, { ReactNode, useEffect, useState, useMemo } from "react";
import AuthManager from "./AuthManager";
import AuthContext from "./AuthContext";
import ProxyAuthManager from "./ProxyAuthManager";

interface IProps<TPolicyNames extends string = string> {
  // Accept multiple managers
  authManagers: AuthManager<TPolicyNames>[];
  // Default provider ID (optional)
  defaultProviderId?: string;
  children: ReactNode;
}

/**
 * Provider component for multiple auth managers
 * Uses a ProxyAuthManager to handle provider selection when no provider is active
 */
function MultiAuthProvider<TPolicyNames extends string = string>({ authManagers, defaultProviderId, children }: IProps<TPolicyNames>) {
  // Create the proxy manager
  const proxyAuthManager = useMemo(
    () => new ProxyAuthManager<TPolicyNames>(authManagers, defaultProviderId),
    [authManagers, defaultProviderId]
  );

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

  return <AuthContext.Provider value={currentAuthManager}>{children}</AuthContext.Provider>;
}

export default MultiAuthProvider;

import React, { ReactNode, useEffect, useState } from "react";
import AuthManager from "./AuthManager";
import AuthContext, { AuthContextValue } from "./AuthContext";

interface IProps {
  authManager: AuthManager;
  children: ReactNode;
}

function AuthProvider({ authManager, children }: IProps) {
  // Create a wrapper object that changes on each auth state change to trigger context updates
  const [contextValue, setContextValue] = useState<AuthContextValue>(() => ({
    authManager,
  }));

  useEffect(() => {
    const handleAuthChange = () => {
      // Create a new wrapper object to trigger context updates across the app
      setContextValue({ authManager });
    };

    // Subscribe to auth events
    authManager.addEventListener("login", handleAuthChange);
    authManager.addEventListener("logout", handleAuthChange);

    // Validate/refresh access tokens on app load (or log out if the token is invalid)
    authManager.autoLogin();

    // Cleanup subscriptions
    return () => {
      authManager.removeEventListener("login", handleAuthChange);
      authManager.removeEventListener("logout", handleAuthChange);
    };
  }, [authManager]);

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export default AuthProvider;

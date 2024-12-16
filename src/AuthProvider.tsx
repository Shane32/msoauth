import React, { ReactNode, useEffect, useState } from "react";
import AuthManager from "./AuthManager";
import AuthContext from "./AuthContext";

interface IProps {
  authManager: AuthManager;
  children: ReactNode;
}

export function AuthProvider({ authManager, children }: IProps) {
  // trigger a re-render when the auth state changes
  const [, setTrigger] = useState({});

  useEffect(() => {
    const handleAuthChange = () => {
      setTrigger({});
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

  return <AuthContext.Provider value={authManager}>{children}</AuthContext.Provider>;
}

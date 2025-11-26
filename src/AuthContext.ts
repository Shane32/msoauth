import { createContext } from "react";
import AuthManager from "./AuthManager";

/**
 * Wrapper object that contains the AuthManager instance.
 * A new wrapper object is created each time the auth state changes,
 * triggering context updates across the app.
 */
export interface AuthContextValue {
  authManager: AuthManager;
}

/**
 * The AuthContext is a React context that provides the AuthManager instance to the rest of the app.
 * The AuthManager instance should be a stable instance that is created once and passed down through the component tree.
 * The wrapper object is recreated on each auth state change to trigger context updates.
 */
const AuthContext = createContext<AuthContextValue | null>(null);

export default AuthContext;

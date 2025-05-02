import { createContext } from "react";
import AuthManager from "./AuthManager";

/**
 * Context for multiple auth managers
 * Provides access to all configured auth managers
 */
const AuthManagersContext = createContext<Map<string, AuthManager> | null>(null);

export default AuthManagersContext;

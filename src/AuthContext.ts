import { createContext } from "react";
import AuthManager from "./AuthManager";

/**
 * The AuthContext is a React context that provides the AuthManager instance to the rest of the app.
 * The AuthManager instance should be a stable instance that is created once and passed down through the component tree.
 */
const AuthContext = createContext<AuthManager | null>(null);

export default AuthContext;

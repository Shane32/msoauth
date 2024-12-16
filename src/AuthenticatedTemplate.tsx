import { ReactNode, useContext } from "react";
import AuthContext from "./AuthContext";

export function AuthenticatedTemplate({ children }: { children: ReactNode }): ReactNode {
  const authContext = useContext(AuthContext);
  return authContext?.isAuthenticated() ? children : null;
}

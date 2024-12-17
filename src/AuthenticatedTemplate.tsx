import { ReactNode, useContext } from "react";
import AuthContext from "./AuthContext";

function AuthenticatedTemplate({ children }: { children: ReactNode }): ReactNode {
  const authContext = useContext(AuthContext);
  return authContext?.isAuthenticated() ? children : null;
}

export default AuthenticatedTemplate;

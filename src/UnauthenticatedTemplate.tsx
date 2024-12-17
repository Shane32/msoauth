import { ReactNode, useContext } from "react";
import AuthContext from "./AuthContext";

function UnauthenticatedTemplate({ children }: { children: ReactNode }): ReactNode {
  const authContext = useContext(AuthContext);
  return authContext?.isAuthenticated() ? null : children;
}

export default UnauthenticatedTemplate;

"use client";

import { Auth0Provider, useAuth0, type User } from "@auth0/auth0-react";
import { createContext, type ReactNode, useContext } from "react";

export const FCRM_ROLE_CLAIM = "https://myridius.ai/claims/fcrm_role";
export const FCRM_DISPLAY_NAME_CLAIM = "https://myridius.ai/claims/display_name";

type AuthMode = "demo" | "oidc" | "invalid";
type WorkbenchAuth = {
  mode: AuthMode;
  configured: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  user?: User;
  login: () => Promise<void>;
  logout: () => void;
  getAccessToken: () => Promise<string>;
};

const modeValue = process.env.NEXT_PUBLIC_AUTH_MODE ?? "demo";
const mode: AuthMode = modeValue === "demo" || modeValue === "oidc" ? modeValue : "invalid";
const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
const audience = process.env.NEXT_PUBLIC_AUTH0_AUDIENCE;
const configured = Boolean(domain && clientId && audience);

const demoAuth: WorkbenchAuth = {
  mode: "demo",
  configured: true,
  isLoading: false,
  isAuthenticated: true,
  login: async () => undefined,
  logout: () => undefined,
  getAccessToken: async () => "",
};

const WorkbenchAuthContext = createContext<WorkbenchAuth>(demoAuth);

function Auth0Identity({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, user, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0();
  const auth: WorkbenchAuth = {
    mode: "oidc",
    configured: true,
    isLoading,
    isAuthenticated,
    user,
    login: () => loginWithRedirect(),
    logout: () => logout({ logoutParams: { returnTo: window.location.origin } }),
    getAccessToken: async () => {
      const token = await getAccessTokenSilently({ authorizationParams: { audience } });
      if (!token) throw new Error("Auth0 did not return an API access token.");
      return token;
    },
  };

  return <WorkbenchAuthContext.Provider value={auth}>{children}</WorkbenchAuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (mode === "demo") {
    return <WorkbenchAuthContext.Provider value={demoAuth}>{children}</WorkbenchAuthContext.Provider>;
  }

  if (mode !== "oidc" || !configured) {
    return (
      <WorkbenchAuthContext.Provider
        value={{ ...demoAuth, mode, configured: false, isAuthenticated: false }}
      >
        {children}
      </WorkbenchAuthContext.Provider>
    );
  }

  return (
    <Auth0Provider
      domain={domain!}
      clientId={clientId!}
      authorizationParams={{
        audience,
        redirect_uri: typeof window === "undefined" ? undefined : window.location.origin,
        scope: "openid profile email",
      }}
    >
      <Auth0Identity>{children}</Auth0Identity>
    </Auth0Provider>
  );
}

export function useWorkbenchAuth() {
  return useContext(WorkbenchAuthContext);
}
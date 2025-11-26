# MSOAuth

A React library for Azure AD authentication with PKCE (Proof Key for Code Exchange) flow support. This library provides a secure and easy-to-use solution for implementing Azure AD authentication in React applications, with support for both API and Microsoft Graph access tokens. While this library can be used with other OAuth-compatible services, it is specifically designed to streamline integration with Azure Active Directory, ensuring developers can efficiently manage authentication flows, token acquisition, and user session management within their React applications.

## Features

- PKCE flow implementation for secure authentication
- Automatic token refresh handling
- Policy-based authorization
- Support for both API and Microsoft Graph access tokens
- React components for conditional rendering based on auth state
- TypeScript support

## Installation

```bash
npm install @shane32/msoauth
```

## Setup

1. Register your application in the Azure Portal and configure the following:
   - Redirect URI (e.g., `https://localhost:12345/oauth/callback`)
   - Logout URI (e.g., `https://localhost:12345/oauth/logout`)
   - Required API permissions
   - Enable implicit grant for access tokens

2. Create an MsAuthManager instance in your `main.tsx` with your Azure AD configuration (recommended for Azure AD as it automatically adds required Microsoft-specific scopes):

```typescript
import { MsAuthManager, Policies } from "@shane32/msoauth";

// Define your policies
export enum Policies {
  Admin = "Admin",
}

// Define policy functions
const policies: Record<keyof typeof Policies, (roles: string[]) => boolean> = {
  [Policies.Admin]: (roles) => roles.indexOf("All.Admin") >= 0,
};

// Initialize MsAuthManager
const authManager = new MsAuthManager({
  clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
  authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}/v2.0`,
  scopes: import.meta.env.VITE_AZURE_SCOPES,
  redirectUri: "/oauth/callback",
  navigateCallback: (path: string) => {
    // A navigate function that uses the browser's history API
    window.history.replaceState({}, "", path);
    // Dispatch a popstate event to trigger react-router navigation
    window.dispatchEvent(new PopStateEvent("popstate"));
  },
  policies,
  logoutRedirectUri: "/oauth/logout",
});
```

3. Wrap your app with the AuthProvider component and add route handlers for the OAuth callback and logout:

```typescript
root.render(
  <GraphQLContext.Provider value={{ client }}>
    <AuthProvider authManager={authManager}>
      <BrowserRouter>
        <Routes>
          <Route path="/oauth/callback" element={<OAuthCallback />} />
          <Route path="/oauth/logout" element={<OAuthLogout />} />
          <Route path="/*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </GraphQLContext.Provider>
);

function OAuthCallback() {
  useEffect(() => {
    authManager.handleRedirect();
  }, []);
  return <div>Processing login...</div>;
}

function OAuthLogout() {
  useEffect(() => {
    authManager.handleLogoutRedirect();
  }, []);
  return <div>Processing logout...</div>;
}
```

4. Create a strongly-typed `useAuth` hook for better TypeScript integration:

```typescript
import { useContext } from "react";
import { AuthManager, AuthContext } from "@shane32/msoauth";
import { Policies } from "../main";

function useAuth(): AuthManager<keyof typeof Policies> {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export default useAuth;
```

5. Configure your APIs to use the access tokens (or id tokens) provided by `AuthManager`:

Below is a sample of usage with the `@shane32/graphql` library:

```typescript
const client = new GraphQLClient({
  url: import.meta.env.VITE_GRAPHQL_URL,
  webSocketUrl: import.meta.env.VITE_GRAPHQL_WEBSOCKET_URL,
  sendDocumentIdAsQuery: true,
  transformRequest: async (config) => {
    try {
      const token = await authManager.getAccessToken();
      return {
        ...config,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { ...config.headers, Authorization: `Bearer ${token}` },
      };
    } catch {
      return config;
    }
  },
  generatePayload: async () => {
    try {
      const token = await authManager.getAccessToken();
      return {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Authorization: `Bearer ${token}`,
      };
    } catch {
      return {};
    }
  },
  defaultFetchPolicy: "no-cache",
});

// Listen for auth events to reset GraphQL client store
authManager.addEventListener("login", () => client.resetStore());
authManager.addEventListener("logout", () => client.resetStore());
```

Below is a sample of GraphiQL configuration:

```typescript
// Fetcher function using async/await for token retrieval and request execution
const fetcher = async (graphQLParams: unknown) => {
  const token = await authContext.getAccessToken(); // Fetch the token asynchronously
  const response = await fetch(import.meta.env.VITE_GRAPHQL_URL, {
    method: "post",
    headers: {
      /* eslint-disable */
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      /* eslint-enable */
    },
    body: JSON.stringify(graphQLParams),
  });

  if (response.status >= 200 && response.status < 300) {
    return await response.json(); // Parse JSON response body
  } else {
    throw response; // Throw the response as an error if the status code is not OK
  }
};
```

Below is a sample call to a MS Graph API:

```typescript
const auth = useAuth();
const [users, setUsers] = useState<MSGraphUser[]>([]);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  const fetchUsers = async () => {
    try {
      // Get MS Graph access token
      const token = await auth.getAccessToken("ms");

      // Fetch users from MS Graph API
      const response = await fetch("https://graph.microsoft.com/v1.0/users", {
        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          Authorization: `Bearer ${token}`,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      setUsers(data.value);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch users");
      console.error("Error fetching users:", err);
    }
  };

  fetchUsers();
}, [auth]);
```

## Usage

### User Information

```typescript
import useAuth from "../hooks/useAuth";

function UserProfile() {
  const userInfo = useAuth().userInfo;
  const name = userInfo?.given_name ?? userInfo?.name ?? userInfo?.email ?? "Unknown";

  return <div>Welcome, {name}</div>;
}
```

The `userInfo` property returns `null` when not authenticated or the contents of the ID token provided by Azure.

| Property        | Type                  | Description                         |
| --------------- | --------------------- | ----------------------------------- |
| `oid`           | `string`              | Unique identifier for the user      |
| `name`          | `string \| undefined` | Display name of the user            |
| `email`         | `string \| undefined` | Email address of the user           |
| `given_name`    | `string \| undefined` | User's first name                   |
| `family_name`   | `string \| undefined` | User's last name                    |
| `roles`         | `string[]`            | Array of roles assigned to the user |
| `[key: string]` | `unknown`             | Additional custom claims in the JWT |

In order for the user information to be populated correctly, please configure the token within your Azure App Registration to include these claims in the ID token:

| Claim         | Description                                                                               |
| ------------- | ----------------------------------------------------------------------------------------- |
| `email`       | The addressable email for this user, if the user has one                                  |
| `family_name` | Provides the last name, surname, or family name of the user as defined in the user object |
| `given_name`  | Provides the first or "given" name of the user, as set on the user object                 |

Other configured claims will also be provided through the `userInfo` object.

### Conditional Rendering

Use the provided template components to conditionally render content based on authentication state:

```typescript
import { AuthenticatedTemplate, UnauthenticatedTemplate } from "@shane32/msoauth";

function MyComponent() {
  return (
    <>
      <AuthenticatedTemplate>
        <div>This content is only visible when authenticated</div>
      </AuthenticatedTemplate>

      <UnauthenticatedTemplate>
        <div>This content is only visible when not authenticated</div>
      </UnauthenticatedTemplate>
    </>
  );
}
```

### Authentication Actions

```typescript
function LoginButton() {
  const auth = useAuth();

  const handleLogin = () => {
    auth.login();
  };

  const handleLogout = () => {
    auth.logout();
  };

  return auth.isAuthenticated() ? <button onClick={handleLogout}>Logout</button> : <button onClick={handleLogin}>Login</button>;
}
```

The `logout()` method clears local tokens and redirects to the authentication provider's logout endpoint (if configured). If you want to log out without redirecting to the provider (local logout only), use `localLogout()`:

```typescript
// Log out and redirect to provider's logout endpoint
await auth.logout();

// Log out locally without redirecting to provider
auth.localLogout();
```

### Policy-Based Authorization

```typescript
import useAuth from "../hooks/useAuth";
import { Policies } from "../main";

function AdminPanel() {
  const auth = useAuth();

  if (!auth.can(Policies.Admin)) {
    return <div>Access denied</div>;
  }

  return <div>Admin panel content</div>;
}
```

### Access Tokens

```typescript
import useAuth from "../hooks/useAuth";

async function fetchData() {
  const auth = useAuth();

  // Get token for your API
  const apiToken = await auth.getAccessToken();

  // Get token for Microsoft Graph
  const msToken = await auth.getAccessToken("ms");

  // Use tokens in API calls
  const response = await fetch("your-api-endpoint", {
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });
}
```

### Event Handlers

The AuthManager provides an event system that allows you to respond to authentication-related events. When using event handlers in React components, it's important to properly set up and clean up event listeners using the `useEffect` hook:

```typescript
import { useEffect } from "react";
import useAuth from "../hooks/useAuth";

const auth = useAuth();

useEffect(() => {
  // Event handler functions
  const handleLogin = () => {
    console.log("User logged in");
  };

  const handleLogout = () => {
    console.log("User logged out");
  };

  // Add event listeners
  auth.addEventListener("login", handleLogin);
  auth.addEventListener("logout", handleLogout);

  // Cleanup function to remove event listeners
  return () => {
    auth.removeEventListener("login", handleLogin);
    auth.removeEventListener("logout", handleLogout);
  };
}, [auth]); // Include auth in dependencies array
```

| Event Type      | Description                                                                               |
| --------------- | ----------------------------------------------------------------------------------------- |
| `login`         | Emitted when a user successfully logs in                                                  |
| `logout`        | Emitted when a user logs out or is logged out                                             |
| `tokensChanged` | Emitted when access tokens are refreshed or cleared, as user information may have changed |

### Multiple OAuth Providers

This library supports multiple OAuth providers, allowing you to configure and use different identity providers in your application. Use `MultiAuthProvider` to configure all your identity providers, and use the `useAuth` hook to login and handle redirects.

```typescript
// Use MultiAuthProvider instead of AuthProvider
root.render(
  <MultiAuthProvider authManagers={[azureProvider, googleProvider]}>
    <App />
  </MultiAuthProvider>
);

function LoginButtons() {
  const auth = useAuth(); // logged-in manager
  const azureAuth = useAuth("azure"); // azure manager
  const googleAuth = useAuth("google"); // google manager

  if (auth.isAuthenticated()) {
    return <button onClick={() => { auth.logout(); })}>Logout</button>;
  }

  return (
    <div>
      <button onClick={() => { azureAuth.login('/'); }}>Login with Microsoft</button>
      <button onClick={() => { googleAuth.login('/'); }}>Login with Google</button>
    </div>
  );
}

function AzureOAuthCallback() {
  const azureAuth = useAuth("azure");
  useEffect(() => {
    azureAuth.handleRedirect();
  }, [azureAuth]);
  return <div>Processing login...</div>;
}
```

## Configuration Options

| Option              | Type                                           | Required | Description                                                                         |
| ------------------- | ---------------------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `id`                | `string`                                       | No       | Unique identifier for the provider (defaults to "default")                          |
| `clientId`          | `string`                                       | Yes      | Azure AD application client ID                                                      |
| `authority`         | `string`                                       | Yes      | Azure AD authority URL (e.g., `https://login.microsoftonline.com/{tenant-id}/v2.0`) |
| `scopes`            | `string`                                       | Yes      | Space-separated list of required scopes                                             |
| `redirectUri`       | `string`                                       | Yes      | OAuth callback URI (must start with '/')                                            |
| `navigateCallback`  | `(path: string) => void`                       | Yes      | Function to handle navigation after auth callbacks                                  |
| `policies`          | `Record<string, (roles: string[]) => boolean>` | Yes      | Policy functions for authorization                                                  |
| `logoutRedirectUri` | `string`                                       | No       | URI to redirect to after logout (must start with '/')                               |

## Environment Variables

This library does not directly access environment variables, but for the examples above, you'll need to set up the following:

```env
VITE_AZURE_CLIENT_ID=your-client-id
VITE_AZURE_TENANT_ID=your-tenant-id
VITE_AZURE_SCOPES=api://your-api-scope User.Read.All
```

- Use `common` for the tenant ID if your Azure App Registration is configured to allow access from multiple tenants and/or personal accounts.
- Typically the API scope defaults to `api://your-client-id/scope-name` but you can customize this in the Azure App Registration

## Google OAuth Configuration

This library also supports Google OAuth authentication. Since Google requires a client secret for token exchange, which cannot be securely stored in client-side applications, you need to set up a proxy endpoint on your server to handle token requests.

### 1. Register your application in the Google Cloud Console

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth client ID"
5. Select "Web application" as the application type
6. Add your authorized JavaScript origins (e.g., `https://localhost:12345`)
7. Add your authorized redirect URIs (e.g., `https://localhost:12345/oauth/callback`)
8. Note your Client ID and Client Secret

### 2. Create a GoogleAuthManager instance in your `main.tsx`

```typescript
import { GoogleAuthManager, Policies } from "@shane32/msoauth";

// Initialize GoogleAuthManager
const authManager = new GoogleAuthManager({
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  authority: "https://accounts.google.com",
  scopes: "https://www.googleapis.com/auth/userinfo.email", // Add any additional scopes you need
  redirectUri: "/oauth/callback",
  navigateCallback: (path: string) => {
    window.history.replaceState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  },
  policies,
  logoutRedirectUri: "/oauth/logout",
  proxyUrl: import.meta.env.VITE_GOOGLE_PROXY_URL, // URL to your proxy endpoint
});
```

### 3. Set up a proxy endpoint in your ASP.NET Core backend

Create a controller to handle token requests:

```csharp
using Microsoft.AspNetCore.Mvc;
using System.Net.Http;
using System.Threading.Tasks;

[ApiController]
[Route("api/[controller]")]
public class GoogleAuthProxyController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;

    public GoogleAuthProxyController(IHttpClientFactory httpClientFactory, IConfiguration configuration)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
    }

    [HttpPost]
    public async Task<IActionResult> ProxyTokenRequest()
    {
        // Read the form data from the request
        var formData = await Request.ReadFormAsync();

        // Create a dictionary from the form data
        var requestDict = formData.ToDictionary(x => x.Key, x => x.Value.ToString());

        // Add the client secret to the request body
        requestDict["client_secret"] = _configuration["Authentication:Google:ClientSecret"];

        // Create a new form collection to send to Google
        var requestContent = new FormUrlEncodedContent(requestDict);

        // Determine the token endpoint based on the grant type
        string tokenEndpoint = "https://oauth2.googleapis.com/token";

        // Create an HTTP client
        var client = _httpClientFactory.CreateClient();

        // Forward the request to Google
        var response = await client.PostAsync(tokenEndpoint, requestContent);

        // Read the response content
        var responseContent = await response.Content.ReadAsStringAsync();

        // Return the response with the same status code
        return new ContentResult
        {
            Content = responseContent,
            ContentType = "application/json",
            StatusCode = (int)response.StatusCode
        };
    }
}
```

### 4. Configure your ASP.NET Core application

Add the following to your `Program.cs` or `Startup.cs`:

```csharp
// Add HTTP client factory
builder.Services.AddHttpClient();

// Configure CORS to allow requests from your frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins("https://localhost:12345") // Your frontend URL
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

// In the Configure method or middleware section
app.UseCors("AllowFrontend");
```

### 5. Add the Google client secret to your configuration

In your `appsettings.json` or environment variables:

```json
{
  "Authentication": {
    "Google": {
      "ClientId": "your-client-id",
      "ClientSecret": "your-client-secret"
    }
  }
}
```

### 6. Environment Variables for your frontend

```env
VITE_GOOGLE_CLIENT_ID=your-client-id
VITE_GOOGLE_PROXY_URL=https://your-backend-url/api/GoogleAuthProxy
```

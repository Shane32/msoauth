/**
 * Response structure from the OAuth token endpoint
 */
export interface TokenResponse {
  /** The access token used for API authorization */
  access_token: string;
  /** The refresh token used to obtain new access tokens */
  refresh_token: string;
  /** Number of seconds until the access token expires */
  expires_in: number;
  /** The id token used for user information */
  id_token: string;
}

/**
 * Legacy (version 1) representation of token information with expiration
 */
export interface TokenInfoV1 {
  /** The version number of this structure */
  version: 1;
  /** The current access token for API requests */
  apiAccessToken: string;
  /** The current access token for MS Graph requests */
  msAccessToken: string;
  /** The refresh token for obtaining new access tokens */
  refreshToken: string;
  /** Timestamp (in milliseconds) when the API access token expires */
  apiExpiresAt: number;
  /** Timestamp (in milliseconds) when the MS Graph access token expires */
  msExpiresAt: number;
  /** The id token used for user information */
  idToken: string;
}

/**
 * Internal representation of token information with expiration (version 2)
 */
export interface TokenInfo {
  /** The version number of this structure */
  version: 2;
  /** The refresh token for obtaining new access tokens */
  refreshToken: string;
  /** The id token used for user information */
  idToken: string;
  /** Access tokens for different scope sets */
  accessTokens: {
    [scopeSetName: string]: {
      /** The access token */
      token: string;
      /** Timestamp (in milliseconds) when the access token expires */
      expiresAt: number;
    };
  };
}

/**
 * User information extracted from the JWT token
 */
export interface UserInfo {
  /** Unique identifier for the user */
  oid: string;
  /** Display name of the user */
  name?: string;
  /** Email address of the user */
  email?: string;
  /** User's first name */
  given_name?: string;
  /** User's last name */
  family_name?: string;
  /** Array of roles assigned to the user */
  roles: string[];
  /** Additional custom claims in the JWT */
  [key: string]: unknown;
}

/**
 * Represents the decoded payload of a JWT (JSON Web Token).
 */
interface JwtPayload {
  /** Expiration time of the token (Unix timestamp) */
  exp: number;
  /** Azure Object ID (unique identifier) of the user */
  oid?: string;
  /** Subject of the user */
  sub: string;
  /** Array of roles assigned to the user */
  roles?: string[] | string;
  /** Additional custom claims in the JWT */
  [key: string]: unknown;
}

/**
 * Decodes a JWT token and returns its payload.
 * @param {string} token - The JWT token to decode
 * @returns {JwtPayload} The decoded JWT payload
 */
function jwtDecode(token: string): JwtPayload {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(base64));
}

/**
 * Interface for PKCE (Proof Key for Code Exchange) codes used in OAuth authentication.
 */
interface PKCECodes {
  /** The randomly generated verifier string */
  codeVerifier: string;
  /** The SHA-256 hashed and base64-url encoded challenge derived from the verifier */
  codeChallenge: string;
}

/**
 * Generates a cryptographically secure random state string for OAuth authentication.
 * Used to prevent CSRF attacks by ensuring the auth response matches the request.
 * @returns {string} A base64url-encoded random string
 */
export function generateState(): string {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  return bufferToBase64Url(array);
}

/**
 * Generates PKCE codes for OAuth authorization code flow with PKCE.
 * Creates a random code verifier and its corresponding SHA-256 hashed challenge.
 * @returns {Promise<PKCECodes>} Object containing the code verifier and challenge
 */
export async function generatePKCECodes(): Promise<PKCECodes> {
  // Generate code verifier
  const codeVerifier = generateState();

  // Generate code challenge
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hash = await window.crypto.subtle.digest("SHA-256", data);
  const codeChallenge = bufferToBase64Url(new Uint8Array(hash));

  return { codeVerifier, codeChallenge };
}

/**
 * Converts a Uint8Array buffer to a base64url-encoded string.
 * Base64url encoding is similar to base64 but uses URL-safe characters.
 * @param {Uint8Array} buffer - The buffer to convert
 * @returns {string} The base64url-encoded string
 */
export function bufferToBase64Url(buffer: Uint8Array): string {
  // Convert buffer to base64
  const base64 = btoa(String.fromCharCode.apply(null, Array.from(buffer)));
  // Make base64URL by replacing chars that are different
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Gets the current relative URL of the window, including path, search, and hash.
 * @returns {string} The relative URL of the window
 */
export function getCurrentRelativeUrl() {
  // Convert full URL to path for React navigation
  const url = new URL(window.location.href);
  return url.pathname + url.search + url.hash;
}

/**
 * Extracts user information from a JWT token
 * @param {string} idToken - The JWT token to decode
 * @returns {UserInfo} The extracted user information
 * @throws {Error} If required claims are missing from the token
 */
export function extractUserInfo(idToken: string): UserInfo {
  const decoded = jwtDecode(idToken);
  if (!decoded.oid && !decoded.sub) throw new Error("Both Object ID and Subject not found in token");

  return {
    ...decoded,
    oid: decoded.oid || decoded.sub,
    roles: decoded.roles ? (Array.isArray(decoded.roles) ? decoded.roles : [decoded.roles]) : [],
  };
}

/**
 * Converts a TokenInfo from version 1 to version 2
 * @param {any} tokenData - The token data to convert
 * @returns {TokenInfo} The converted token info
 */
export function convertTokenInfoToV2(tokenData: TokenInfo | TokenInfoV1): TokenInfo {
  // Check if it's the old TokenInfoV1 format with apiAccessToken and msAccessToken
  if (tokenData.version === 1 && "apiAccessToken" in tokenData && "msAccessToken" in tokenData) {
    const v1Token = tokenData as TokenInfoV1;

    // Convert to version 2 format
    return {
      version: 2,
      refreshToken: v1Token.refreshToken,
      idToken: v1Token.idToken,
      accessTokens: {
        // Map API token to default scope set
        default: {
          token: v1Token.apiAccessToken,
          expiresAt: v1Token.apiExpiresAt,
        },
        // Map MS Graph token to ms scope set
        ms: {
          token: v1Token.msAccessToken,
          expiresAt: v1Token.msExpiresAt,
        },
      },
    };
  }

  // It's already version 2 or higher
  return tokenData;
}

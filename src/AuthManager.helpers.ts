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
 * Internal representation of token information with expiration
 */
export interface TokenInfo {
  /** The version number of this structure */
  version: number;
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
  /** Object ID (unique identifier) of the user */
  oid?: string;
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
  if (!decoded.oid) throw new Error("Object ID not found in token");

  return {
    ...decoded,
    oid: decoded.oid,
    roles: decoded.roles ? (Array.isArray(decoded.roles) ? decoded.roles : [decoded.roles]) : [],
  };
}

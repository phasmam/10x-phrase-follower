# Authentication System in Development Mode

## Overview

The application uses a **development-only JWT token system** that bypasses Supabase's built-in authentication for local development. This allows developers to work without setting up full Supabase Auth while maintaining security boundaries.

## Backend Authentication Flow

### 1. DEV_JWT Token Generation

- **Endpoint**: `GET /api/dev/jwt`
- **Availability**: Only in `NODE_ENV=development`
- **Token Structure**: `dev_` prefix + JWT signed with `SUPABASE_JWT_SECRET`
- **Expiry**: 5 minutes (300 seconds)
- **User ID**: Fixed `DEFAULT_USER_ID` (`0a1f3212-c55f-4a62-bc0f-4121a7a72283`)

### 2. Middleware Authentication (`src/middleware/index.ts`)

```typescript
// Extracts Bearer token from Authorization header
const authHeader = context.request.headers.get("authorization");
if (authHeader?.startsWith("Bearer ")) {
  const token = authHeader.substring(7);

  // Check for DEV_JWT (starts with "dev_")
  if (token.startsWith("dev_")) {
    const actualJwt = token.substring(4); // Remove "dev_" prefix
    const { payload } = await jwtVerify(actualJwt, new TextEncoder().encode(devJwtSecret));
    if (payload.sub === DEFAULT_USER_ID) {
      userId = DEFAULT_USER_ID;
    }
  }
}
```

### 3. RLS Bypass for Development

When `userId === DEFAULT_USER_ID` in development:

- **Service Role Key**: Uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS policies
- **Admin Access**: Full database access without RLS restrictions
- **Header Flag**: Sets `x-dev-user-id` header for API endpoints

### 4. API Endpoint Pattern

All protected endpoints follow this pattern:

```typescript
export const GET: APIRoute = async ({ locals, request }) => {
  const userId = locals.userId;

  // Development mode: use service role key to bypass RLS
  let supabase = locals.supabase;
  if (import.meta.env.NODE_ENV === "development" && userId === DEFAULT_USER_ID) {
    const supabaseUrl = import.meta.env.SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseServiceKey) {
      supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
  }

  // Use supabase client for database operations
};
```

## Frontend Authentication Flow

### 1. Authentication Hook (`src/lib/hooks/useAuth.ts`)

```typescript
export function useAuth(): AuthState {
  // 1. Check localStorage for existing valid token
  const storedToken = localStorage.getItem("dev_jwt_token");
  const storedExpiry = localStorage.getItem("dev_jwt_expiry");

  // 2. If token exists and not expired, use it
  if (storedToken && now < expiry) {
    return { isAuthenticated: true, token: storedToken, ... };
  }

  // 3. Otherwise, fetch new DEV_JWT from API
  const response = await fetch("/api/dev/jwt");
  const data = await response.json();

  // 4. Store token in localStorage with expiry
  localStorage.setItem("dev_jwt_token", data.token);
  localStorage.setItem("dev_jwt_expiry", expiry.toString());
}
```

### 2. API Hook (`src/lib/hooks/useApi.ts`)

```typescript
export function useApi() {
  const { token, isAuthenticated } = useAuth();

  // Fallback: try localStorage if useAuth doesn't have token
  const getTokenFromStorage = () => {
    const storedToken = localStorage.getItem("dev_jwt_token");
    const storedExpiry = localStorage.getItem("dev_jwt_expiry");

    if (storedToken && now < expiry) {
      return storedToken;
    }
    return null;
  };

  const effectiveToken = token || getTokenFromStorage();
  const effectiveIsAuthenticated = isAuthenticated || !!effectiveToken;

  const apiCall = async (endpoint, options) => {
    const headers = {
      Authorization: `Bearer ${effectiveToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    };

    return fetch(endpoint, { ...options, headers });
  };
}
```

### 3. Login Flow (`src/components/AuthCard.tsx`)

```typescript
const handleSubmit = async (e) => {
  // 1. Always try to get DEV_JWT (no NODE_ENV check)
  const response = await fetch("/api/dev/jwt");

  if (response.ok) {
    const data = await response.json();

    // 2. Store token in localStorage
    localStorage.setItem("dev_jwt_token", data.token);
    localStorage.setItem("dev_user_id", data.user_id);
    localStorage.setItem("dev_jwt_expiry", expiry.toString());

    // 3. Redirect to notebooks
    window.location.href = "/notebooks";
  } else {
    throw new Error("Production authentication not yet implemented");
  }
};
```

### 4. Route Protection (`src/components/AuthGuard.tsx`)

```typescript
export default function AuthGuard({ children }) {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = "/login";
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return null;

  return <>{children}</>;
}
```

## Key Environment Variables

```bash
# Required for DEV_JWT generation
SUPABASE_JWT_SECRET=your-supabase-jwt-secret

# Required for RLS bypass
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Supabase connection
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
```

## Token Storage Structure

```typescript
// localStorage keys
"dev_jwt_token"; // The actual JWT token (with "dev_" prefix)
"dev_user_id"; // Fixed user ID for development
"dev_jwt_expiry"; // Timestamp when token expires
```

## Development vs Production

### Development Mode

- ✅ **DEV_JWT endpoint available** (`/api/dev/jwt`)
- ✅ **Any credentials work** (just need to hit the endpoint)
- ✅ **RLS bypass** using service role key
- ✅ **Token persistence** in localStorage
- ✅ **Auto-refresh** when token expires

### Production Mode

- ❌ **DEV_JWT endpoint returns 404**
- ❌ **Supabase Auth required** (not implemented yet)
- ❌ **RLS policies enforced**
- ❌ **No localStorage fallback**

## Common Patterns for New Components

### 1. Protected API Calls

```typescript
const { apiCall, isAuthenticated } = useApi();

useEffect(() => {
  if (!isAuthenticated) return;

  const loadData = async () => {
    const data = await apiCall<ResponseType>("/api/endpoint");
    // Handle data
  };

  loadData();
}, [isAuthenticated]); // Don't include apiCall in dependencies!
```

### 2. Authentication Checks

```typescript
const { isAuthenticated, isLoading } = useAuth();

if (isLoading) return <LoadingSpinner />;
if (!isAuthenticated) return <LoginPrompt />;
```

### 3. Logout Functionality

```typescript
const { logout } = useAuth();

const handleLogout = () => {
  logout(); // Clears localStorage and redirects to /login
};
```

## Security Considerations

- **Development Only**: DEV_JWT only works in development mode
- **Fixed User**: Always uses the same `DEFAULT_USER_ID`
- **Short Expiry**: Tokens expire in 5 minutes
- **Service Role**: Uses admin privileges to bypass RLS
- **No Production Impact**: Production uses standard Supabase Auth

This system provides a seamless development experience while maintaining clear security boundaries between development and production environments.

# DEV Mode Authentication Fix - Summary

## Introduction: Main Problem

After implementing the authentication module according to `auth-spec.md`, the application was stuck in an infinite "Loading..." state when running in development mode. Users could not access protected routes (`/notebooks`, `/import`, etc.) because the authentication hook (`useAuth`) was failing to initialize properly, leaving `isLoading: true` indefinitely.

### Symptoms

- **Infinite Loading Screen**: All protected pages showed "Loading..." and never resolved
- **DEV Mode Broken**: Development workflow was completely blocked
- **No Error Messages**: The failure was silent - no obvious errors in console
- **AuthGuard Stuck**: `AuthGuard` component remained in loading state because `useAuth().isLoading` never became `false`

### Root Cause Analysis

The problem had multiple contributing factors:

1. **Supabase Client Import Failure**:
   - The `supabaseClient` was imported at module level in `src/db/supabase.client.ts`
   - In development, `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_KEY` were not set (not needed for DEV_JWT)
   - The client initialization threw an error, preventing `useAuth` hook from even loading
   - This caused a silent failure during module import

2. **Wrong Authentication Priority**:
   - `useAuth` hook checked Supabase session **before** checking DEV_JWT
   - In development, Supabase client might not be configured, causing the hook to fail before reaching DEV_JWT logic
   - The hook never got a chance to use the working DEV_JWT endpoint

3. **State Management Issues**:
   - Original implementation used a single object state that included a `logout` function
   - This caused unnecessary re-renders and potential state update issues
   - The `logout` function was recreated on every render, causing state object to change identity

4. **Missing Error Handling**:
   - No try/catch around DEV_JWT fetch
   - Network errors or fetch failures would silently break the auth flow
   - No logging to help debug the issue

## Solution: How DEV Mode Was Fixed

### Fix 1: Made Supabase Client Optional in Development

**File**: `src/db/supabase.client.ts`

**Problem**: Supabase client threw an error if `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_KEY` were missing, even in development where they're not needed.

**Solution**:

- Made Supabase client initialization conditional
- In development, create a dummy client if env vars are missing (prevents import errors)
- Only throw error in production mode where Supabase is required
- Added warning message for missing configuration in dev

```typescript
// Before: Would throw error if env vars missing
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase configuration is missing...");
}

// After: Graceful handling in development
if (supabaseUrl && supabaseAnonKey) {
  supabaseClientInstance = createClient<Database>(supabaseUrl, supabaseAnonKey);
} else if (import.meta.env.NODE_ENV === "production") {
  throw new Error("Supabase configuration is missing...");
} else {
  // In development, create dummy client to prevent import errors
  console.warn("Supabase client not configured. Using DEV_JWT for authentication.");
  supabaseClientInstance = createClient<Database>("https://placeholder.supabase.co", "placeholder-key");
}
```

### Fix 2: Prioritized DEV_JWT Over Supabase

**File**: `src/lib/hooks/useAuth.ts`

**Problem**: Hook checked Supabase session first, which could fail in development before reaching DEV_JWT logic.

**Solution**:

- Reordered authentication checks to prioritize DEV_JWT
- Check DEV_JWT first (localStorage, then API)
- Only check Supabase session if DEV_JWT is not available
- This ensures DEV mode works even if Supabase is not configured

```typescript
// Before: Checked Supabase first
// 1. Check Supabase session
// 2. Check DEV_JWT

// After: Checks DEV_JWT first
// 1. Check DEV_JWT (localStorage)
// 2. Fetch DEV_JWT from API if needed
// 3. Only then check Supabase session (production fallback)
```

### Fix 3: Stabilized State Management

**File**: `src/lib/hooks/useAuth.ts`

**Problem**: Single object state with embedded function caused re-render issues.

**Solution**:

- Split state into separate `useState` hooks for each field
- Used `useCallback` for `logout` function to maintain stable reference
- Added `useRef` for mount tracking to prevent state updates after unmount
- Return stable object structure

```typescript
// Before: Single object state
const [authState, setAuthState] = useState({
  isAuthenticated: false,
  isLoading: true,
  token: null,
  userId: null,
  logout: () => {}, // Function recreated every render
});

// After: Separate state + stable callback
const [isAuthenticated, setIsAuthenticated] = useState(false);
const [isLoading, setIsLoading] = useState(true);
const [token, setToken] = useState<string | null>(null);
const [userId, setUserId] = useState<string | null>(null);
const logout = useCallback(async () => {
  /* ... */
}, []); // Stable reference
```

### Fix 4: Added Comprehensive Error Handling

**File**: `src/lib/hooks/useAuth.ts`

**Problem**: No error handling around DEV_JWT fetch, causing silent failures.

**Solution**:

- Wrapped DEV_JWT fetch in try/catch
- Added detailed console logging for debugging
- Graceful fallback to Supabase if DEV_JWT fails
- Better error messages

```typescript
// Added try/catch and logging
try {
  const devResponse = await fetch("/api/dev/jwt", {
    headers: { Accept: "application/json" },
  });

  console.log("DEV_JWT response status:", devResponse.status);

  if (devResponse.ok) {
    // Handle success
  } else {
    console.warn("DEV_JWT endpoint returned non-OK status:", devResponse.status);
  }
} catch (fetchError) {
  console.error("Failed to fetch DEV_JWT:", fetchError);
  // Continue to Supabase fallback
}
```

### Fix 5: Fixed ConfigStatusBadge Loading State

**File**: `src/components/ConfigStatusBadge.tsx`

**Problem**: Component tried to call API before authentication was ready, causing loading spinner to show indefinitely.

**Solution**:

- Wait for authentication to complete before calling API
- Check both `useAuth` and `useApi` authentication state
- Don't show loading if not authenticated

```typescript
// Added authentication check
useEffect(() => {
  // Only load credentials when authenticated and auth is done loading
  if (!authIsLoading && (isAuthenticated || authIsAuthenticated)) {
    loadCredentialsState();
  } else if (!authIsLoading && !isAuthenticated && !authIsAuthenticated) {
    setIsLoading(false); // Don't show loading if not authenticated
  }
}, [isAuthenticated, authIsAuthenticated, authIsLoading]);
```

## Key Changes Summary

| File                                   | Change                                                      | Impact                                         |
| -------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------- |
| `src/db/supabase.client.ts`            | Made client optional in dev, create dummy if missing        | Prevents import errors in development          |
| `src/lib/hooks/useAuth.ts`             | Prioritized DEV_JWT, stabilized state, added error handling | Fixes infinite loading, ensures DEV mode works |
| `src/components/ConfigStatusBadge.tsx` | Wait for auth before API calls                              | Prevents loading spinner issues                |

## Testing the Fix

### Verify DEV Mode Works

1. **Clear localStorage**:

   ```javascript
   localStorage.clear();
   ```

2. **Navigate to protected route** (e.g., `/notebooks`)

3. **Expected behavior**:
   - Should automatically fetch DEV_JWT from `/api/dev/jwt`
   - Should authenticate and show content (not stuck on "Loading...")
   - Check console for logs: "useAuth: Starting auth initialization", "Fetching DEV_JWT from /api/dev/jwt", "Generated new DEV_JWT token"

4. **Verify localStorage**:
   - Should contain: `dev_jwt_token`, `dev_user_id`, `dev_jwt_expiry`

### Verify Production Mode Still Works

1. **Set environment variables**:

   ```env
   PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   PUBLIC_SUPABASE_KEY=your-anon-key-here
   ```

2. **Build and run in production**:

   ```bash
   npm run build
   npm run preview
   ```

3. **Test login**:
   - DEV_JWT endpoint should return 404
   - Login form should use Supabase Auth
   - Should authenticate successfully

## Architecture Decisions

### Why DEV_JWT First?

- **Development Priority**: DEV mode should work without Supabase configuration
- **Fail Fast**: If DEV_JWT is available, use it immediately (faster)
- **Graceful Degradation**: Falls back to Supabase if DEV_JWT unavailable (production)

### Why Optional Supabase Client?

- **Development Flexibility**: Don't require Supabase setup for local development
- **Import Safety**: Prevent module import errors that break the entire app
- **Production Safety**: Still enforce Supabase in production where it's required

### Why Separate State Hooks?

- **Performance**: Avoid unnecessary re-renders from object identity changes
- **Stability**: Stable function references prevent cascading updates
- **Debugging**: Easier to track which state field changed

## Lessons Learned

1. **Environment Variable Handling**: Client-side code in Astro requires `PUBLIC_` prefix. Server-side code can use regular env vars.

2. **Module Import Errors**: Errors during module initialization can silently break React hooks. Always handle optional dependencies gracefully.

3. **State Management**: Embedding functions in state objects causes re-render issues. Use `useCallback` for stable function references.

4. **Error Handling**: Always wrap async operations in try/catch, especially network requests.

5. **Development vs Production**: Different code paths for dev/prod should be clearly separated and tested independently.

## Related Files

- `src/lib/hooks/useAuth.ts` - Main authentication hook
- `src/db/supabase.client.ts` - Supabase client initialization
- `src/components/AuthGuard.tsx` - Route protection component
- `src/components/AuthCard.tsx` - Login form component
- `src/pages/api/dev/jwt.ts` - DEV_JWT endpoint
- `docs/architecture/auth-spec.md` - Original specification

## Status

✅ **DEV Mode**: Fixed and working  
✅ **Production Mode**: Working (requires Supabase configuration)  
✅ **Error Handling**: Comprehensive logging and graceful fallbacks  
✅ **State Management**: Stable and performant

The authentication system now works correctly in both development and production modes, with proper error handling and state management.

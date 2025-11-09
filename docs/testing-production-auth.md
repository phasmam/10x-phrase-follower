# Testing Production Authentication Flow

This guide explains how to test the Supabase Auth (production) authentication flow.

## Prerequisites

1. **Supabase Project**: You need a Supabase project with Auth enabled
2. **Environment Variables**: Set up `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_KEY` in your `.env` file
3. **Test User**: Create a test user in Supabase

## Step 1: Set Up Environment Variables

Add these to your `.env` file (or set them in your deployment environment):

```env
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_KEY=your-anon-key-here
```

**Note**: In Astro, client-side code can only access environment variables prefixed with `PUBLIC_`.

## Step 2: Create a Test User

You have several options:

### Option A: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Users**
3. Click **Add user** → **Create new user**
4. Enter:
   - Email: `test@example.com` (or any email)
   - Password: `testpassword123` (min 8 characters)
   - Auto Confirm User: ✅ (check this to skip email confirmation)

### Option B: Using Supabase CLI

```bash
# If you have Supabase CLI installed
supabase auth users create test@example.com --password testpassword123
```

### Option C: Using the Dev Setup Endpoint (Development Only)

If you're testing in development mode, you can use the existing dev setup:

```powershell
# This creates a user with email: dev@example.com, password: password
Invoke-WebRequest -Uri "http://localhost:3000/api/dev/setup" -Method POST | Select-Object -ExpandProperty Content
```

## Step 3: Test in Production Mode (NODE_ENV=production)

To test production authentication properly, you need to run the app in production mode. In production mode:

- ✅ `/api/dev/jwt` automatically returns 404 (disabled)
- ✅ `/api/auth/login` is enabled and works
- ✅ Supabase client is required (will throw error if not configured)
- ✅ Only Supabase Auth is used (no DEV_JWT fallback)

### Method 1: Build and Preview (Recommended)

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

The app will run on `http://localhost:4321` (or the port shown) in production mode.

### Method 2: Set NODE_ENV Manually

If you want to test production mode with `npm run dev`, you can set the environment variable:

**Windows PowerShell:**
```powershell
$env:NODE_ENV="production"
npm run dev
```

**Windows CMD:**
```cmd
set NODE_ENV=production
npm run dev
```

**Linux/Mac:**
```bash
NODE_ENV=production npm run dev
```

**Note**: This method may not fully simulate production (some build optimizations won't apply), but it will enable production authentication behavior.

### Important: Environment Variables in Production

In production mode, you **MUST** set:
- `PUBLIC_SUPABASE_URL` - Required (will throw error if missing)
- `PUBLIC_SUPABASE_KEY` - Required (will throw error if missing)

The Supabase client will throw an error on startup if these are not set in production mode.

## Step 4: Test the Login Flow

1. **Clear localStorage** (to remove any DEV_JWT tokens):
   ```javascript
   // In browser console
   localStorage.clear()
   ```

2. **Navigate to `/login`**

3. **Enter credentials**:
   - Email: `test@example.com` (or the email you created)
   - Password: `testpassword123` (or the password you set)

4. **Submit the form**

5. **Expected behavior**:
   - Should redirect to `/notebooks`
   - Check localStorage for `sb_access_token`, `sb_refresh_token`, `sb_expires_at`, `sb_user_id`
   - Check browser console for logs

## Step 5: Verify Authentication State

### Check localStorage

Open DevTools → Application → Local Storage and verify:

- `sb_access_token`: Should contain a JWT token
- `sb_refresh_token`: Should contain a refresh token
- `sb_expires_at`: Should contain a timestamp
- `sb_user_id`: Should contain the user's UUID

### Check Browser Console

Look for these logs:
- "DEV_JWT not available, checking Supabase session"
- "Using stored Supabase session" (on page reload)

### Test API Calls

Open DevTools → Console and test an authenticated API call:

```javascript
const token = localStorage.getItem('sb_access_token');
fetch('/api/users/me', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json'
  }
})
.then(r => r.json())
.then(console.log);
```

Should return user information.

## Step 6: Test Token Refresh

1. **Wait for token to expire** (or manually expire it):
   ```javascript
   // In browser console - set expiry to past
   localStorage.setItem('sb_expires_at', (Date.now() - 1000).toString());
   ```

2. **Reload the page**

3. **Expected behavior**:
   - `useAuth` should detect token is close to expiry
   - Should automatically refresh using `sb_refresh_token`
   - Should update `sb_access_token` and `sb_expires_at`
   - Check console for: "Supabase token close to expiry, attempting refresh"

## Step 7: Test Logout

1. **Click the "Wyloguj" (Logout) button** in the topbar

2. **Expected behavior**:
   - Should clear all localStorage items (`sb_*` and `dev_*`)
   - Should call `supabase.auth.signOut()`
   - Should redirect to `/login`
   - Should reset auth state

3. **Verify**:
   - localStorage should be empty of auth tokens
   - Navigating to `/notebooks` should redirect back to `/login`

## Step 8: Test Error Cases

### Invalid Credentials

1. Try logging in with wrong password
2. **Expected**: Error message "Nieprawidłowe dane logowania."

### Rate Limiting

1. Try logging in multiple times with wrong credentials
2. **Expected**: Error message "Zbyt wiele prób. Spróbuj ponownie później." (after rate limit)

### Network Errors

1. Disconnect internet and try to login
2. **Expected**: Error message "Wystąpił błąd serwera. Spróbuj ponownie."

## Step 9: Test Protected Routes

1. **Without authentication**:
   - Navigate directly to `/notebooks` or `/import`
   - **Expected**: Should redirect to `/login`

2. **With authentication**:
   - After logging in, navigate to protected routes
   - **Expected**: Should show content, not redirect

## Troubleshooting

### Issue: "Supabase client not configured" warning

**Solution**: Make sure `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_KEY` are set in your `.env` file.

### Issue: Login fails with "Invalid email or password"

**Solutions**:
- Verify the user exists in Supabase Dashboard
- Check that email confirmation is not required (or confirm the email)
- Verify password meets requirements (min 8 characters)

### Issue: Token refresh fails

**Solutions**:
- Check that `sb_refresh_token` is stored in localStorage
- Verify the refresh token hasn't expired (Supabase refresh tokens last ~30 days)
- Check browser console for specific error messages

### Issue: API calls return 401

**Solutions**:
- Verify `Authorization: Bearer <token>` header is being sent
- Check that token hasn't expired
- Verify middleware is correctly extracting and validating the token

## Quick Test Script

You can use this PowerShell script to test the production login endpoint:

```powershell
# Test production login endpoint
$body = @{
    email = "test@example.com"
    password = "testpassword123"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/api/auth/login" `
    -Method POST `
    -Headers @{"Content-Type"="application/json"} `
    -Body $body | 
    Select-Object -ExpandProperty Content
```

**Note**: This endpoint returns 404 in development mode (as per spec). To test it, you need to either:
- Build and run in production mode
- Temporarily modify the endpoint to work in dev

## Next Steps

After verifying production auth works:

1. **Test in staging/production environment**
2. **Set up proper user registration flow** (if needed)
3. **Implement password reset** (if needed)
4. **Add email verification** (if needed)
5. **Set up proper error monitoring** for auth failures


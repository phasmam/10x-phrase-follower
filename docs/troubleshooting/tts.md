# 🔍 Investigation Summary: TTS Decryption Failure

## 🎯 Root Cause

The **"Decryption failed: The operation failed for an operation-specific reason"** error was caused by **PostgreSQL's `bytea` column converting encrypted data to hex format**, which corrupted the binary data needed for AES-GCM decryption.

## 🧪 Test Scripts Created

### 1. **`src/test-tts-isolated.js`**

- **Purpose**: Test TTS generation without encryption
- **What it does**: Bypasses encryption, tests Google TTS API directly
- **Result**: ✅ TTS generation works perfectly
- **Key finding**: The issue was NOT with TTS API or MP3 generation

### 2. **`src/test-encryption.js`**

- **Purpose**: Test encryption/decryption in isolation
- **What it does**: Encrypts and decrypts a test API key
- **Result**: ✅ Encryption/decryption logic works perfectly
- **Key finding**: The issue was NOT with the encryption algorithm

### 3. **`src/test-with-astro-env.js`**

- **Purpose**: Test decryption with real database data
- **What it does**: Loads environment variables, fetches encrypted data from database, attempts decryption
- **Result**: ❌ Decryption failed with database data
- **Key finding**: The issue was with the stored encrypted data format

### 4. **`src/debug-data-format.js`**

- **Purpose**: Analyze the exact format of stored encrypted data
- **What it does**: Examines raw database data, tests different conversion methods
- **Result**: Found data was stored as JSON-encoded Buffer format
- **Key finding**: Data format mismatch between storage and decryption

### 5. **`src/debug-hex-data.js`**

- **Purpose**: Analyze hex-encoded encrypted data
- **What it does**: Tests hex conversion, examines data structure
- **Result**: Found data was hex-encoded with wrong structure
- **Key finding**: Encrypted data was corrupted during storage

### 6. **`src/test-fresh-encryption.js`**

- **Purpose**: Test encryption/decryption with fresh data
- **What it does**: Encrypts API key, converts to hex format, tests decryption
- **Result**: ✅ Fresh encryption/decryption works perfectly
- **Key finding**: Confirmed the process works with correct data format

### 7. **`src/test-api-key-length.js`**

- **Purpose**: Test API endpoint with full Google API key
- **What it does**: Sends full API key to API, tests storage and retrieval
- **Result**: ❌ API accepted key but decryption still failed
- **Key finding**: Issue was with database column type, not API processing

### 8. **`src/test-column-length.js`**

- **Purpose**: Test if database column truncates data
- **What it does**: Tests different storage formats, checks data integrity
- **Result**: Found `bytea` column converts data to hex format
- **Key finding**: **ROOT CAUSE IDENTIFIED** - PostgreSQL `bytea` column corruption

## 🛠️ Solution Implemented (Database / Storage)

### Database Schema Fix

```sql
-- Changed encrypted_key from bytea to text
ALTER TABLE tts_credentials ALTER COLUMN encrypted_key TYPE text;
```

### API Endpoint Fix

```typescript
// Store as base64 string instead of Buffer
const encryptedKeyBase64 = encryptedKey.toString("base64");
```

### Decryption Logic Fix

```typescript
// Handle base64 strings properly
if (typeof encryptedData === "string") {
  buffer = Buffer.from(encryptedData, "base64");
}
```

## 📊 Test Results Summary

| Test Script                | Purpose          | Result     | Key Finding          |
| -------------------------- | ---------------- | ---------- | -------------------- |
| `test-tts-isolated.js`     | TTS Generation   | ✅ Success | TTS API works fine   |
| `test-encryption.js`       | Encryption Logic | ✅ Success | Algorithm works fine |
| `test-with-astro-env.js`   | Database Data    | ❌ Failed  | Data format issue    |
| `debug-data-format.js`     | Data Analysis    | 🔍 Found   | JSON Buffer format   |
| `debug-hex-data.js`        | Hex Analysis     | 🔍 Found   | Hex encoding issue   |
| `test-fresh-encryption.js` | Fresh Data       | ✅ Success | Process works        |
| `test-api-key-length.js`   | API Testing      | ❌ Failed  | Storage issue        |
| `test-column-length.js`    | Column Testing   | 🔍 Found   | **ROOT CAUSE**       |

## 🎉 Final Outcome

**Problem**: PostgreSQL `bytea` column converted encrypted data to hex format, breaking AES-GCM decryption.

**Solution**: Changed database schema to use `text` column with base64 storage.

**Result**: ✅ TTS credentials now encrypt/decrypt correctly, job worker works properly.

---

## 🌐 Cloudflare / Env Vars: `PHRASE_TTS_ENCRYPTION_KEY` Not Visible in Production

### Symptomy

- W środowisku produkcyjnym na Cloudflare Pages zapis TTS kredencjałów kończył się błędem:

  > `Failed to encrypt TTS credentials: Encryption failed: PHRASE_TTS_ENCRYPTION_KEY environment variable is required in production (see server logs for source diagnostics)`

- Mimo że:
  - klucz był ustawiony jako **secret** w GitHub Actions (`TTS_ENCRYPTION_KEY` → mapowany na `PHRASE_TTS_ENCRYPTION_KEY`),
  - oraz jako **variable/secret** w Cloudflare Pages (`PHRASE_TTS_ENCRYPTION_KEY` w Production → Variables and Secrets).

### Gdzie leżał problem

- Początkowa logika próbowała czytać klucz z:
  - `import.meta.env.TTS_ENCRYPTION_KEY / PHRASE_TTS_ENCRYPTION_KEY`,
  - `process.env`,
  - Cloudflare runtime przez `astro/runtime/server.getRuntime().env`,
  - `globalThis.env`.
- Diagnostyczny endpoint `GET /api/dev/env-debug` pokazał:
  - `importMeta.keysSample` zawierało `PHRASE_TTS_ENCRYPTION_KEY`, ale `hasKey: false` → **Astro znało nazwę, ale nie wartość** (sekret nie był wstrzykiwany do `import.meta.env`),
  - `runtimeEnv` i `processEnv` były puste.
- Kluczowa obserwacja z `astroContext`:

  ```json
  "localsRuntimeEnvKeysSample": [
    "PHRASE_TTS_ENCRYPTION_KEY",
    "PUBLIC_SUPABASE_KEY",
    "PUBLIC_SUPABASE_URL",
    "SUPABASE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_URL",
    "TTS_ENCRYPTION_KEY"
  ]
  ```

  → Adapter Cloudflare umieszcza **prawdziwe runtime env** w `context.locals.runtime.env`, a nie w `import.meta.env` ani `process.env`.

### Rozwiązanie (kod)

- **1. Centralne czytanie sekretów w `src/lib/tts-encryption.ts`:**
  - Dodano nowy pierwszy krok w `readEnvWithTrace(key)`:
    - próbuje dynamicznie zaimportować `astro:env` i odczytać `env[key]` jako główne źródło sekretów,
    - jeśli to zadziała → zwraca wartość z `source: "astro-env"`.
  - Następnie (fallback):
    - używa `runtimeEnvOverride` (patrz punkt 2),
    - `getAstroRuntimeEnv()` (`astro/runtime/server`),
    - `import.meta.env`,
    - `process.env`,
    - `globalThis.env`.

- **2. Podanie Cloudflare runtime env z API endpointu:**

  W `src/pages/api/tts-credentials.ts` (GET/PUT/DELETE) przy starcie handlera:

  ```ts
  const localsAny = context.locals as unknown as {
    runtime?: { env?: Record<string, string | undefined> };
  };
  if (localsAny.runtime?.env) {
    setRuntimeEnv(localsAny.runtime.env);
  }
  ```

  - `setRuntimeEnv` ustawia `runtimeEnvOverride` wewnątrz `tts-encryption.ts`.
  - Dzięki temu `readEnvWithTrace("PHRASE_TTS_ENCRYPTION_KEY")` widzi realne wartości z Cloudflare runtime, nawet jeśli `astro:env` lub `import.meta.env` nic nie zwracają.

- **3. Usunięcie zależności od Node Buffera w Cloudflare Workers:**
  - W środowisku Workers nie ma globalnego `Buffer`, więc:
    - dodano prosty `BufferCompat` (używany tylko w `encrypt()`/`decrypt()`),
    - w endpointzie `tts-credentials` konwersja do base64 obsługuje zarówno `Buffer`, jak i `Uint8Array`.

### Efekt końcowy

- W produkcji:
  - `PHRASE_TTS_ENCRYPTION_KEY` jest odczytywany z `context.locals.runtime.env` (Cloudflare bindings),
  - `encrypt()` i `decrypt()` działają poprawnie w środowisku Workers,
  - zapis TTS kredencjałów działa bez błędów.
- Lokalnie:
  - jeśli `PHRASE_TTS_ENCRYPTION_KEY` jest ustawiony w `.env` lub env shellowym, logika z `astro:env` / fallbackami również działa.

### Checklist przy podobnych problemach

- [ ] Sprawdź, czy sekret jest ustawiony **w GitHub Actions** (dla builda) oraz w **Cloudflare Pages → Production → Variables and Secrets**.
- [ ] Zbadaj, gdzie adapter wystawia env w `APIContext` (`context.locals.runtime.env`, `context.env`, itp.).
- [ ] Dla sekretów serwerowych preferuj:
  - `astro:env` jako pierwsze źródło,
  - fallback do runtime bindings (`locals.runtime.env`) zamiast `process.env` / `import.meta.env` na Cloudflare.

## 🧹 Cleanup

All test scripts can be removed as they were diagnostic tools:

- `src/test-*.js` files
- `src/debug-*.js` files
- `src/fix-*.js` files
- `src/clear-*.js` files

The investigation successfully identified and resolved the TTS decryption failure! 🚀

# Migracja z lokalnego Supabase do Supabase Cloud

Ten przewodnik pomoże Ci przejść z lokalnej instancji Supabase na darmową instancję w chmurze.

## Krok 1: Utworzenie projektu w Supabase Cloud

1. Przejdź na [supabase.com](https://supabase.com)
2. Zaloguj się lub utwórz konto (darmowe)
3. Kliknij **"New Project"**
4. Wypełnij formularz:
   - **Name**: Nazwa projektu (np. "phrase-follower")
   - **Database Password**: Wygeneruj silne hasło (zapisz je!)
   - **Region**: Wybierz najbliższy region (np. `West Europe` dla Polski)
5. Kliknij **"Create new project"** i poczekaj na utworzenie (2-3 minuty)

## Krok 2: Pobranie danych dostępowych

1. W dashboardzie projektu przejdź do **Settings** → **API**
2. Skopiuj następujące wartości:
   - **Project URL** (np. `https://xxxxx.supabase.co`)
   - **anon public** key (klucz w sekcji "Project API keys")
   - **service_role** key (klucz w sekcji "Project API keys" - UWAGA: to jest klucz administracyjny!)

## Krok 3: Zastosowanie migracji do cloudowej bazy

### Opcja A: Użycie Supabase CLI (zalecane)

```bash
# 1. Połącz lokalny projekt z cloudowym
supabase link --project-ref <project-ref>

# project-ref znajdziesz w URL projektu: https://app.supabase.com/project/<project-ref>
# lub w Settings → General → Reference ID

# 2. Zastosuj migracje
supabase db push
```

### Opcja B: Ręczne wykonanie migracji

1. W dashboardzie Supabase przejdź do **SQL Editor**
2. Otwórz każdy plik z `supabase/migrations/` w kolejności:
   - `20251013143000_initial_schema.sql`
   - `20251022193000_dev_rls_fix.sql`
   - `20251026143000_fix_encrypted_key_column.sql`
3. Skopiuj zawartość każdego pliku i wykonaj w SQL Editor

## Krok 4: Konfiguracja zmiennych środowiskowych

### Gdzie znaleźć wartości:

1. **Zaloguj się do Supabase Dashboard:**
   - Przejdź na [app.supabase.com](https://app.supabase.com)
   - Wybierz swój projekt

2. **Przejdź do Settings → API:**
   - W dashboardzie kliknij **Settings** (⚙️) w lewym menu
   - Kliknij **API** w sekcji Project Settings

3. **PUBLIC_SUPABASE_URL:**
   - W sekcji **Project URL** (na górze strony)
   - Format: `https://xxxxx.supabase.co`
   - Kliknij ikonę kopiowania obok URL

4. **PUBLIC_SUPABASE_KEY:**
   - W sekcji **Project API keys**
   - Klucz oznaczony jako **`anon` `public`**
   - Kliknij **Reveal** (oka), a następnie ikonę kopiowania
   - To jest długi string zaczynający się od `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

5. **SUPABASE_SERVICE_ROLE_KEY:**
   - W tej samej sekcji **Project API keys**
   - Klucz oznaczony jako **`service_role` `secret`**
   - Kliknij **Reveal** (oka), a następnie ikonę kopiowania
   - ⚠️ **UWAGA:** Ten klucz ma pełne uprawnienia administracyjne! Nigdy nie udostępniaj go publicznie!

6. **SUPABASE_JWT_SECRET:**
   - To jest używane tylko w trybie development do podpisywania DEV_JWT
   - Wygeneruj losowy string (nie jest to wartość z dashboardu Supabase)
   - **PowerShell (Windows):**
     ```powershell
     [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
     ```
   - **Alternatywnie:** Użyj generatora losowych stringów online (np. random.org) - wygeneruj string o długości ~44 znaków

### Utwórz plik .env:

Utwórz plik `.env` w katalogu głównym projektu (jeśli nie istnieje) i dodaj:

```env
# Supabase Cloud Configuration
PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
PUBLIC_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # anon public key
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # anon public key (dla kompatybilności)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # service_role key

# Opcjonalnie - dla development mode z DEV_JWT
SUPABASE_JWT_SECRET=your-jwt-secret-here  # Wygeneruj losowy string (patrz powyżej)
```

**WAŻNE:**

- `.env` jest w `.gitignore` - nie commituj go do repozytorium!
- `SUPABASE_SERVICE_ROLE_KEY` ma pełne uprawnienia - trzymaj go w tajemnicy
- W produkcji używaj zmiennych środowiskowych serwera, nie pliku `.env`
- `SUPABASE_URL` i `SUPABASE_KEY` są opcjonalne (dla kompatybilności wstecznej) - możesz użyć tych samych wartości co `PUBLIC_*`

## Krok 5: Weryfikacja połączenia

1. Uruchom aplikację:

   ```bash
   npm run dev
   ```

2. Sprawdź konfigurację Supabase:

   ```powershell
   # Sprawdź status konfiguracji
   Invoke-WebRequest -Uri "http://localhost:3000/api/dev/check-supabase-config" -Headers @{"Accept"="application/json"} | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
   ```

   Ten endpoint zwróci:
   - Status wszystkich zmiennych środowiskowych
   - Informację czy połączenie działa
   - Rekomendacje dotyczące konfiguracji

3. Sprawdź czy aplikacja łączy się z cloudową bazą:
   - Otwórz konsolę przeglądarki (F12)
   - Sprawdź czy nie ma błędów związanych z Supabase
   - Spróbuj zalogować się lub utworzyć konto

4. (Opcjonalnie) Przetestuj endpoint:

   ```powershell
   # Pobierz token JWT
   $token = (Invoke-WebRequest -Uri "http://localhost:3000/api/dev/jwt" -Headers @{"Accept"="application/json"} | Select-Object -ExpandProperty Content | ConvertFrom-Json).token

   # Przetestuj API z tokenem
   Invoke-WebRequest -Uri "http://localhost:3000/api/notebooks" -Headers @{"Authorization"="Bearer $token"; "Accept"="application/json"}
   ```

## Krok 6: Migracja danych (opcjonalnie)

Jeśli masz dane w lokalnej bazie, które chcesz przenieść:

### Eksport z lokalnej bazy:

```bash
# Zatrzymaj lokalny Supabase
supabase stop

# Eksportuj dane (dostosuj nazwy tabel)
pg_dump -h localhost -p 54322 -U postgres -d postgres -t users -t notebooks -t phrases --data-only > local_data.sql
```

### Import do cloudowej bazy:

1. W dashboardzie Supabase przejdź do **SQL Editor**
2. Otwórz plik `local_data.sql`
3. Upewnij się, że dane są zgodne z RLS policies
4. Wykonaj skrypt SQL

**UWAGA:** Cloudowa baza ma włączone RLS (Row Level Security), więc upewnij się, że:

- Użytkownicy mają odpowiednie uprawnienia
- Dane są przypisane do właściwych użytkowników
- Polityki RLS są poprawnie skonfigurowane

## Krok 7: Konfiguracja Storage (WYMAGANE)

Aplikacja używa Supabase Storage do przechowywania wygenerowanych plików MP3. **Ten krok jest wymagany** - bez niego aplikacja nie będzie mogła zapisywać plików audio.

### 7.1. Utworzenie bucketu `audio`

1. W dashboardzie Supabase przejdź do **Storage** (w lewym menu)
2. Kliknij **"New bucket"** lub **"Create bucket"**
3. Wypełnij formularz:
   - **Name**: `audio` (dokładnie tak, bez cudzysłowów)
   - **Public bucket**: **Odznacz** (nie publiczny - dostęp tylko dla zalogowanych użytkowników)
   - **File size limit**: `50MB` (lub więcej, jeśli potrzebujesz)
   - **Allowed MIME types**: Możesz zostawić puste (dopuszcza wszystkie) lub dodać `audio/mpeg`, `audio/mp3`
4. Kliknij **"Create bucket"**

### 7.2. Konfiguracja polityk dostępu (Storage Policies)

Po utworzeniu bucketu, musisz skonfigurować polityki dostępu, aby użytkownicy mogli:

- **Zapisywać** pliki w swoich folderach (`{user_id}/{notebook_id}/{phrase_id}/`)
- **Czytać** pliki z własnych folderów (poprzez signed URLs generowane przez backend)

#### Opcja A: Użycie SQL Editor (zalecane)

1. W dashboardzie przejdź do **SQL Editor**
2. Utwórz nowy query i wklej następujący kod SQL:

```sql
-- Polityka dla zapisu plików: użytkownicy mogą zapisywać tylko w swoich folderach
CREATE POLICY "Users can upload audio files in their own folders"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'audio' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Polityka dla aktualizacji plików: użytkownicy mogą aktualizować tylko swoje pliki
CREATE POLICY "Users can update their own audio files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'audio' AND
  (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'audio' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Polityka dla odczytu plików: użytkownicy mogą czytać tylko swoje pliki
CREATE POLICY "Users can read their own audio files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'audio' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Polityka dla usuwania plików: użytkownicy mogą usuwać tylko swoje pliki
CREATE POLICY "Users can delete their own audio files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'audio' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

3. Kliknij **"Run"** lub naciśnij `Ctrl+Enter` (Windows) / `Cmd+Enter` (Mac)

#### Opcja B: Użycie Storage Policies UI

1. W dashboardzie przejdź do **Storage** → **Policies**
2. Wybierz bucket `audio`
3. Dla każdej operacji (INSERT, SELECT, UPDATE, DELETE) kliknij **"New Policy"**
4. Użyj **Policy Template**: "For authenticated users only"
5. W polu **Policy definition** wklej odpowiednie wyrażenie:

**Dla INSERT:**

```sql
bucket_id = 'audio' AND (storage.foldername(name))[1] = auth.uid()::text
```

**Dla SELECT:**

```sql
bucket_id = 'audio' AND (storage.foldername(name))[1] = auth.uid()::text
```

**Dla UPDATE:**

```sql
bucket_id = 'audio' AND (storage.foldername(name))[1] = auth.uid()::text
```

**Dla DELETE:**

```sql
bucket_id = 'audio' AND (storage.foldername(name))[1] = auth.uid()::text
```

6. Zapisz każdą politykę

### 7.3. Weryfikacja konfiguracji

Po skonfigurowaniu bucketu i polityk:

1. Sprawdź czy bucket istnieje:
   - Przejdź do **Storage** → **Buckets**
   - Powinieneś zobaczyć bucket `audio` na liście

2. Sprawdź czy polityki są aktywne:
   - Przejdź do **Storage** → **Policies**
   - Wybierz bucket `audio`
   - Powinieneś zobaczyć 4 polityki (INSERT, SELECT, UPDATE, DELETE)

3. Przetestuj aplikację:
   - Uruchom aplikację i spróbuj wygenerować audio dla notatnika
   - Sprawdź logi aplikacji - nie powinno być błędów "Bucket not found"

## Krok 8: Aktualizacja konfiguracji dla produkcji

Dla środowiska produkcyjnego:

1. **Nie używaj pliku `.env`** - użyj zmiennych środowiskowych serwera
2. W ustawieniach hostingu (np. Vercel, Railway, Render) dodaj:
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (tylko dla backendu)

3. Zaktualizuj `site_url` w Supabase Auth:
   - Settings → Authentication → URL Configuration
   - Ustaw `Site URL` na URL Twojej aplikacji produkcyjnej
   - Dodaj `Redirect URLs` dla wszystkich domen

## Rozwiązywanie problemów

### Problem: "Invalid API key"

- Sprawdź czy skopiowałeś pełny klucz (anon key, nie service_role)
- Upewnij się, że używasz `PUBLIC_` prefix dla zmiennych dostępnych w przeglądarce

### Problem: "RLS policy violation"

- Sprawdź czy użytkownik jest zalogowany
- Zweryfikuj polityki RLS w dashboardzie Supabase (Authentication → Policies)
- W development możesz użyć `SUPABASE_SERVICE_ROLE_KEY` do bypass RLS

### Problem: "Connection refused"

- Sprawdź czy URL projektu jest poprawny
- Upewnij się, że projekt nie jest w trybie "paused" (darmowe projekty mogą być pauzowane po nieaktywności)

### Problem: "Bucket not found" / "StorageApiError: Bucket not found"

- **Sprawdź czy bucket `audio` został utworzony:**
  - Przejdź do **Storage** → **Buckets** w dashboardzie Supabase
  - Jeśli bucket nie istnieje, utwórz go zgodnie z instrukcjami w **Kroku 7.1**
- **Sprawdź czy nazwa bucketu jest dokładnie `audio`** (bez cudzysłowów, małymi literami)
- **Sprawdź czy polityki storage są skonfigurowane:**
  - Przejdź do **Storage** → **Policies**
  - Wybierz bucket `audio`
  - Powinny być 4 polityki (INSERT, SELECT, UPDATE, DELETE)
  - Jeśli brakuje, dodaj je zgodnie z instrukcjami w **Kroku 7.2**
- **Sprawdź czy używasz poprawnego klucza API:**
  - Backend powinien używać `SUPABASE_SERVICE_ROLE_KEY` do operacji na storage
  - Frontend używa `PUBLIC_SUPABASE_KEY` (anon key)
- **Sprawdź logi aplikacji** - mogą zawierać więcej szczegółów o błędzie

### Problem: Migracje nie działają

- Sprawdź czy wszystkie migracje są w kolejności chronologicznej
- Upewnij się, że nie ma konfliktów w schemacie
- Sprawdź logi w SQL Editor

## Przydatne linki

- [Supabase Dashboard](https://app.supabase.com)
- [Supabase CLI Documentation](https://supabase.com/docs/reference/cli)
- [Supabase Migration Guide](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)

## Następne kroki

Po pomyślnej migracji:

1. ✅ Zaktualizuj dokumentację projektu
2. ✅ Usuń lokalną instancję Supabase (opcjonalnie): `supabase stop`
3. ✅ Zaktualizuj CI/CD pipeline (jeśli używasz)
4. ✅ Skonfiguruj backup dla cloudowej bazy (Supabase automatycznie tworzy backupy dla płatnych planów)

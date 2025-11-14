## Specyfikacja architektury modułu logowania/wylogowania (bez rejestracji i resetu hasła)

Dokument opisuje projekt funkcjonalności uwierzytelniania użytkownika zgodnie z US-01 z PRD oraz bieżącym trybem developerskim. Celem jest dodanie pełnego logowania/wylogowania opartego o Supabase Auth w produkcji, przy jednoczesnym zachowaniu istniejącego mechanizmu DEV_JWT w środowisku developerskim, bez naruszania działania aplikacji.

W skrócie: w development zachowujemy ścieżkę opartą o `GET /api/dev/jwt` oraz localStorage; w produkcji używamy Supabase Auth (e-mail + hasło), przechowujemy tokeny sesji i przekazujemy je w nagłówku `Authorization: Bearer` do API (zgodnie z aktualnym middleware).

---

## 1. Architektura interfejsu użytkownika

### 1.1 Strony i layouty

- **`src/pages/login.astro` (istnieje):**
  - Zawiera kartę logowania (`AuthCard.tsx`, ładowaną client-side). Pozostaje dedykowaną stroną logowania.
  - Brak SSR logiki — interaktywność w pełni po stronie React.

- **`src/layouts/AppLayout.astro` (istnieje):**
  - Górny pasek (`Topbar.astro`) uzupełniamy o przycisk „Wyloguj” widoczny, gdy użytkownik jest zalogowany.
  - Wylogowanie realizowane client-side (komponent React montowany w topbarze jako mały widget, np. `LogoutButton.tsx` z `client:load`).
  - W trybie DEV zachowujemy znaczek „DEV”, jak obecnie.

- **Strony chronione** (np. `src/pages/index.astro`, `src/pages/notebooks/*.astro`, itp.):
  - Ochrona tras pozostaje po stronie klienta przy użyciu `AuthGuard.tsx` (komponent React montowany w danej stronie lub wrośnięty w komponenty strony), aby nie zmieniać istniejącego przepływu.
  - Alternatywnie (w przyszłości) można dodać wartę po stronie serwera, ale obecnie zachowujemy frontendowy wzorzec, aby nie naruszyć działania DEV_JWT.

### 1.2 Komponenty React – podział odpowiedzialności

- **`AuthCard.tsx` (istnieje – rozszerzamy):**
  - Formularz e-mail/hasło, walidacja wstępna (format e-mail, minimalna długość hasła, puste pola).
  - Ścieżka „dev najpierw” zostaje: najpierw próba `GET /api/dev/jwt`. Jeśli `200 OK` → zapis DEV_JWT w localStorage i przekierowanie do `/notebooks`.
  - Jeśli `GET /api/dev/jwt` zwróci `>= 400` → przełączamy się na produkcyjną ścieżkę Supabase Auth: `signInWithPassword({ email, password })` przez klienta Supabase (korzystając z anonimowego klucza z `src/db/supabase.client.ts`).
  - W przypadku sukcesu Supabase: zapisujemy `access_token`, `refresh_token`, `expires_at` (szczegóły w 3.3) oraz przekierowujemy do `/notebooks`.
  - W przypadku błędu: prezentujemy komunikat zgodny z regułami błędów (sekcja 1.4).

- **`AuthGuard.tsx` (istnieje):**
  - Pozostaje bez zmian koncepcyjnych: jeśli `useAuth()` mówi, że niezalogowany i nieładowanie — przekierowujemy do `/login`.
  - Wewnętrznie `useAuth()` zostanie rozbudowane, by potrafić rozpoznać sesję Supabase w produkcji (token, refresh), zachowując DEV_JWT w development.

- **`LogoutButton.tsx` (nowy, React):**
  - Renderowany w `Topbar.astro` przez `client:load`.
  - W DEV: czyści klucze `dev_jwt_*` i przekierowuje na `/login`.
  - W PROD: wywołuje `supabase.auth.signOut()`, czyści przechowywane tokeny, przekierowuje na `/login`.

- **`useAuth.ts` (istnieje – rozszerzamy):**
  - Obecnie auto-pobiera DEV_JWT w dev. Rozszerzamy o klienta Supabase i rozpoznanie trybu produkcyjnego:
    - DEV: zachowanie bez zmian (obsługa `dev_jwt_token`, auto-odświeżanie przez ponowne wywołanie `/api/dev/jwt` po wygaśnięciu — na razie best-effort, jak teraz).
    - PROD: wykrywa istniejącą sesję Supabase (np. w localStorage) lub przechowywane tokeny; ustawia `isAuthenticated=true`, `token=access_token` (do nagłówków API). Zapewnia funkcję `logout()` zgodnie z powyższym.

- **`useApi.ts` (istnieje):**
  - Bez zmian w kontrakcie: dodaje `Authorization: Bearer <token>` do żądań. W DEV token to `dev_*`, w PROD to token Supabase.

### 1.3 UX, walidacje i komunikaty błędów

- Walidacje po stronie klienta w `AuthCard.tsx`:
  - **Email**: wymagany, format RFC 5322 (lightweight — np. HTML5 `type="email"`).
  - **Hasło**: wymagane, min. 8 znaków (ustawialne, nie blokuje DEV trybu).
  - Przycisk submit z `disabled` podczas wysyłki.

- Komunikaty błędów (spójne z PRD – „Spójne komunikaty błędów”):
  - Błędy walidacji klienta: krótkie, przy polach, plus blok ogólny nad formularzem przy błędach serwera.
  - Błąd produkcyjnego logowania (Supabase):
    - 401/400: „Nieprawidłowe dane logowania.”
    - 429: „Zbyt wiele prób. Spróbuj ponownie później.”
    - 5xx: „Wystąpił błąd serwera. Spróbuj ponownie.”
  - Błąd DEV_JWT endpointu: „Tryb developerski jest niedostępny.” (wtedy automatycznie przechodzimy do próby Supabase).

- Scenariusze:
  - Użytkownik niezalogowany wchodzi na stronę chronioną → `AuthGuard` przekierowuje do `/login`.
  - Użytkownik w DEV: dowolne dane → `/api/dev/jwt` zwraca token → redirect do `/notebooks`.
  - Użytkownik w PROD: poprawne dane → Supabase Auth `signInWithPassword` → zapis tokenów → redirect.
  - Wylogowanie z topbara → czyszczenie sesji, redirect do `/login`.

---

## 2. Logika backendowa

Założenie: nie zmieniamy obecnego patternu autoryzacji po stronie API — middleware oczekuje nagłówka `Authorization: Bearer <token>`, który w DEV jest `dev_*`, a w PROD jest tokenem Supabase. Middleware już to obsługuje (`jwtVerify` dla DEV i `supabase.auth.getUser(token)` dla PROD).

### 2.1 Endpointy

- Istniejący: `GET /api/dev/jwt` (już wdrożony) — generuje krótkotrwały DEV_JWT. Tylko w `NODE_ENV=development`.

- Nowe (opcjonalne, cienkie wrapery dla spójności kontraktów — wdrożenie nie jest wymagane na MVP, ale specyfikuje kontrakt):
  - `POST /api/auth/login`
    - Body: `{ email: string, password: string }`.
    - Akcja: w PROD wywołuje `supabase.auth.signInWithPassword`, zwraca `{ access_token, expires_in, refresh_token, user }` (bez ustawiania HTTP-only cookie; pozostajemy przy Bearer zgodnym z middleware).
    - W DEV zwraca `404`, aby `AuthCard` mógł pozostać przy ścieżce `/api/dev/jwt`.
  - `POST /api/auth/logout`
    - Body: `{}`.
    - Akcja (PROD): `supabase.auth.signOut()`; zwraca `204 No Content`.
    - DEV: `204 No Content` (no-op).

Uwaga: endpoint `GET /api/users/me` już istnieje — może służyć do testowania, czy nagłówek Bearer działa i do pobierania bieżącego użytkownika po stronie UI.

### 2.2 Modele danych (DTO)

- LoginRequest: `{ email: string; password: string }`
- LoginResponse (PROD): `{ access_token: string; expires_in: number; refresh_token: string; user: { id: string; email: string } }`
- LogoutResponse: brak ciała (`204`).
- ErrorResponse: `{ error: { code: string; message: string; details?: unknown } }`

### 2.3 Walidacja danych wejściowych

- Zod w warstwie API Astro:
  - `email`: `z.string().email()`
  - `password`: `z.string().min(8)` (parametryzowalne)
  - W DEV endpointy auth mogą zwracać `404`, aby nie zaburzać obecnego DEV flow.

### 2.4 Obsługa wyjątków i błędów

- W handlerach API:
  - Pre-check: brak ciała → `400` z kodem `invalid_body`.
  - Błędne dane → `400` z kodem `validation_error` i listą pól.
  - Błędne dane logowania → `401` z kodem `invalid_credentials`.
  - Rate limiting (jeśli włączony po stronie Supabase) → `429` `too_many_requests`.
  - Inne błędy → `500` `internal_error`.

### 2.5 Middleware (stan obecny – bez zmian kontraktu)

- `src/middleware/index.ts` już:
  - Inicjalizuje `locals.supabase`.
  - Z DEV_JWT: weryfikuje sygnaturę i ustawia stałe `userId`.
  - Z PROD tokenem: `supabase.auth.getUser(token)` i ustawia `locals.userId`.
  - Ustawia nagłówki CORS i (w dev) `x-dev-user-id` dla ewentualnego obejścia RLS.

---

## 3. System autentykacji

### 3.1 Tryb development (bez zmian)

- Źródło prawdy: `GET /api/dev/jwt` (token `dev_...` na 5 minut; `DEFAULT_USER_ID`).
- Frontend:
  - `AuthCard` najpierw uderza w `/api/dev/jwt`; zapisuje `dev_jwt_token`, `dev_user_id`, `dev_jwt_expiry`.
  - `useAuth` sprawdza ważność, odświeża w razie potrzeby poprzez ponowny request (best-effort, jak obecnie).
  - `useApi` dodaje `Authorization: Bearer dev_...` do wszystkich żądań.

### 3.2 Tryb produkcyjny (nowe)

- Uwierzytelnianie: Supabase Auth (e-mail + hasło) z wykorzystaniem klienta `@supabase/supabase-js` z anon key (już skonfigurowany w `src/db/supabase.client.ts`).
- Logowanie:
  - `AuthCard` po nieudanym `/api/dev/jwt` wykonuje `supabase.auth.signInWithPassword({ email, password })`.
  - Po sukcesie zapisuje w `useAuth` lub w localStorage: `access_token`, `expires_at`, `refresh_token`.
  - `useApi` używa `access_token` do nagłówka `Authorization`.
- Wylogowanie:
  - `LogoutButton` wywołuje `supabase.auth.signOut()` i czyści stan oraz pamięć klienta, redirect do `/login`.

### 3.3 Przechowywanie i odświeżanie sesji

- Przechowywane pola (PROD):
  - `sb_access_token`, `sb_refresh_token`, `sb_expires_at` (nazwa kluczy w localStorage do ustalenia; ważne żeby nie kolidowały z `dev_jwt_*`).
  - Alternatywnie można polegać na wbudowanym mechanizmie sesji Supabase w pamięci klienta; na potrzeby spójności z `useApi` wygodniej jawnie przechowywać `access_token`.
- Odświeżanie:
  - `useAuth` przy starcie sprawdza `sb_expires_at`. Jeśli blisko wygaśnięcia lub nieważne, próbuje `supabase.auth.refreshSession()` i aktualizuje tokeny.
  - W razie błędu odświeżenia → traktujemy jak wylogowanie: czyścimy stan i redirect do `/login`.

### 3.4 Bezpieczeństwo i zgodność z PRD

- Klucz TTS pozostaje wyłącznie po stronie serwera (wymóg PRD) — niniejsza spec nie zmienia tego.
- Tokeny auth (PROD) trafiają do nagłówka Bearer jak oczekuje middleware — nie zmieniamy wzorca API.
- Brak rejestracji i resetu hasła w MVP: formularz zawiera tylko e-mail/hasło i linków do rejestracji/resetu nie pokazujemy.
- Ochrona przed naruszeniem DEV przepływu: zachowujemy pierwszeństwo `/api/dev/jwt` i nie modyfikujemy endpointu.

---

## 4. Integracja z istniejącymi modułami

- **`Topbar.astro`**: dodajemy w prawym górnym rogu przycisk „Wyloguj” poprzez osadzony komponent React `LogoutButton` (`client:load`).
- **`AuthCard.tsx`**: dopisujemy ścieżkę Supabase po nieudanym DEV_JWT; dodajemy czytelne komunikaty błędów i prostą walidację.
- **`useAuth.ts`**: utrzymujemy DEV flow, dodajemy PROD flow (odczyt/refresh sesji Supabase, wspólny interfejs `AuthState`).
- **`useApi.ts`**: bez zmian w interfejsie; token może być `dev_*` lub Supabase `access_token`.
- **`middleware/index.ts`**: bez zmian — już wspiera oba tryby.

---

## 5. Kontrakty (TL;DR)

### 5.1 UI

- `AuthCard.tsx`
  - Props: brak.
  - Zdarzenia: submit → próba DEV_JWT → fallback Supabase.
  - Stany błędów: `validation`, `invalid_credentials`, `too_many_requests`, `internal_error`.

- `LogoutButton.tsx`
  - Akcja: DEV → czyszczenie `dev_jwt_*`; PROD → `supabase.auth.signOut()`; redirect `/login`.

- `AuthGuard.tsx`
  - Kontrakt bez zmian; opiera się na `useAuth()`.

### 5.2 API (opcjonalne wrapery)

- `POST /api/auth/login`: przyjmuje `{ email, password }`, w PROD zwraca `{ access_token, expires_in, refresh_token, user }`, w DEV `404`.
- `POST /api/auth/logout`: w PROD `204` + `signOut`, w DEV `204` no-op.
- `GET /api/users/me`: już istnieje; używane do weryfikacji sesji po stronie UI.

### 5.3 Walidacja

- Zod schematy w endpointach (jeśli implementowane):
  - `email: z.string().email()`
  - `password: z.string().min(8)`

---

## 6. Scenariusze krytyczne

- Token DEV wygasł → `useAuth` odnotowuje brak ważności, automatycznie próbuje ponownie `GET /api/dev/jwt` (lub wymusza przejście na `/login` jeśli endpoint niedostępny).
- Token PROD wygasł → `useAuth` próbuje `supabase.auth.refreshSession()`; w razie porażki → `logout()`.
- Użytkownik otwiera bezpośredni link do zasobu (np. notatnika) → `AuthGuard` przekierowuje do `/login` bez ujawniania metadanych (PRD UC-01).
- Sieć niedostępna w trakcie logowania PROD → komunikat o błędzie serwera i możliwość ponowienia.

---

## 7. Wymagane zmiany w repo (bez implementacji — wskazania)

- Dodać `LogoutButton.tsx` w `src/components` (React, client:load w `Topbar.astro`).
- Rozszerzyć `AuthCard.tsx` (fallback do Supabase Auth przy braku DEV_JWT).
- Rozszerzyć `useAuth.ts` o ścieżkę PROD (sesja Supabase: odczyt/refresh, przechowywanie tokenów, spójny interfejs z DEV).
- (Opcjonalnie) dodać `src/pages/api/auth/login.ts` i `src/pages/api/auth/logout.ts` jako cienkie wrapery — tylko jeśli chcemy mieć serwerowe punkty kontrolne; nie jest to wymagane do działania przy użyciu klienta Supabase.

Zmiany nie naruszają aktualnego działania DEV — `AuthCard` wciąż najpierw próbuje `/api/dev/jwt`, a middleware nadal przyjmuje Bearer zarówno `dev_*`, jak i token Supabase.

---

## 8. Wymagania konfiguracyjne i środowiskowe

- ENV (już stosowane):
  - `SUPABASE_URL`
  - `SUPABASE_KEY` (anon)
  - `SUPABASE_JWT_SECRET` (dla DEV_JWT)
  - (opcjonalnie) `PUBLIC_APP_URL` dla CORS

- Porty i testy manualne (Windows PowerShell):
  - DEV token:
    - `Invoke-WebRequest -Uri "http://localhost:3000/api/dev/jwt" -Headers @{"Accept"="application/json"} | Select-Object -ExpandProperty Content`
  - Sprawdzenie sesji po zalogowaniu (PROD):
    - dodać nagłówek `Authorization: Bearer <access_token>` do wywołań `http://localhost:3000/api/users/me`.

---

## 9. Kryteria akceptacji (mapowanie na PRD UC-01)

- Niezalogowany użytkownik przy próbie wejścia na zasoby → przekierowanie na `/login` (frontend Guard), bez wycieku metadanych.
- Logowanie odbywa się na dedykowanej stronie (`/login`) z polami e-mail i hasło.
- Wylogowanie dostępne z przycisku w prawym górnym rogu (`Topbar.astro`).
- Tryb developerski zachowany i niewpływający na produkcję.
- W produkcji logowanie oparte o Supabase Auth; wszystkie żądania do API zawierają Bearer token w nagłówku (zgodnie z middleware).

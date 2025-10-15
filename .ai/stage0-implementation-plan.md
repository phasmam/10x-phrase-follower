<analysis>
1) **Cel etapu i PRD (UC-y) — skrót**

- Cel: uruchomić „walking skeleton” z pełnym Auth (Bearer JWT), włączonym RLS na wszystkich tabelach, restrykcyjnym CORS i zdrowiem `/api/health`. W DEV dodać wygodny **DEV_JWT** (krótko-żyjący, podpisany `SUPABASE_JWT_SECRET`, `sub=DEFAULT_USER_ID`) automatycznie wstrzykiwany do żądań — tylko gdy `NODE_ENV=development`. W produkcji/e2e **wyłącznie** prawidłowy Bearer JWT; brak service-role w ścieżkach UI. Kryteria akceptacji: użytkownik widzi wyłącznie swoje zasoby; obcy zasób zwraca 404/403; health działa.
- Powiązanie z PRD (UC-01): prywatny dostęp, przekierowanie do logowania, brak wycieku metadanych między użytkownikami.

2. **Zakres API w etapie**

Dotykamy wyłącznie cross-cutting: nagłówki `Authorization`, polityki CORS, RLS, oraz publiczny `/api/health`. Wszystkie pozostałe endpointy pozostają „stubbed/403/404” pod RLS. Z katalogu API na teraz **aktywne**: `GET /api/health`, `GET /api/users/me` (jako minimalny „smoke” Auth + RLS). Reszta poza zakresem funkcjonalnym, ale musi zachowywać się poprawnie z 401/403/404.

- **Nowe/aktywne**: `/api/health`, `/api/users/me`.
- **Modyfikowane**: brak (wdrażamy fundamenty autoryzacji/korzystania z RLS pod wszystkie przyszłe ścieżki).
- **Poza zakresem**: CRUD notatników/fraz, import, jobs, builds, manifest itd. (Etapy 1–3).

3. **Zależności i kolejność**

- Supabase Auth (JWT), konfiguracja CORS do origin aplikacji, RLS na wszystkich tabelach wg planu DB, brak użycia service-role w UI. W DEV – mechanizm DEV_JWT (tylko local dev). Health endpoint. Kolejno: **Auth** → **RLS** → **CORS** → **/api/health** → **DEV_JWT (dev only)**.

4. **Model danych (w tym etapie)**

- Tabele już istnieją (users, notebooks, phrases, …) — w tym etapie **włączamy RLS** i polityki dla wszystkich według §4 planu DB; brak zmian schematu. Indeksy pozostają jak w planie — na tym etapie kluczowe są polityki RLS i poprawne FK.

5. **Typy/DTO/komendy**

- `GET /api/users/me` → minimalny profil (`id`, `created_at`) z @api-plan; typy bazują na `public.users` (alias z `auth.users`). Odwołania do definicji typów w `@database.types.ts` / `@types` (bez powielania).

6. **Walidacje i limity**

- Walidacje warstwy Auth: brak tokena → 401; token nieważny/nieprawidłowy → 401; zasób nie mój → 404/403 (wg RLS). Body/query brak — tylko health i `users/me`. Globalnie trzymamy konwencję katalogu błędów (`error.code`).

7. **Bezpieczeństwo**

- JWT Supabase w `Authorization: Bearer`.
- **RLS enabled na wszystkich tabelach** jak w §4 (`USING/WITH CHECK` per tabela).
- CORS ograniczony do origin aplikacji.
- DEV_JWT: wyłącznie w DEV buildach (guard compile-time/runtime), TTL krótki.
- Brak ekspozycji sekretów (w tym `SUPABASE_SERVICE_ROLE` i jakichkolwiek kluczy TTS — ale TTS i storage signing pojawią się w późniejszych etapach).

8. **Scenariusze błędów**

- 401 `unauthorized` (brak/invalid Bearer), 403 `forbidden` (RLS odrzucił), 404 `not_found` (gdy polityka/implementacja maskuje cudze zasoby), 500 `internal`. Dla health zawsze 200 gdy proces żyje; 500 gdy brak DB. Katalog błędów wg konwencji `{"error":{code,message}}`.

9. **Wydajność**

- Minimalny narzut: weryfikacja JWT i proste zapytanie `users`/`health`. Indeksy bez zmian. Brak workerów/MV.

10. **Testy jednostkowe (max 10)**

- Skupione na Auth, RLS, CORS i DEV_JWT (szczegóły w końcowej sekcji testów).

</analysis>

---

# stage-implementation-plan.md

# Stage Implementation Plan: Etap 0 — Auth/RLS „walking skeleton” + DEV_JWT

## 1) Przegląd etapu

- **Cel i zakres:** uruchomić szkielet aplikacji z Supabase Auth (Bearer JWT), włączonym RLS na wszystkich tabelach, restrykcyjnym CORS oraz publicznym `GET /api/health`. W DEV dodać **DEV_JWT** (podpisany `SUPABASE_JWT_SECRET`, `sub=DEFAULT_USER_ID`), automatycznie wstrzykiwany do żądań wyłącznie przy `NODE_ENV=development`. Brak użycia service-role w ścieżkach UI. Kryteria: użytkownik widzi tylko swoje zasoby; obcy zasób → 404/403; health żyje. Odniesienie: @stages-plan.md (Etap 0), @prd.md (UC-01).
- **Zależności:** Supabase Auth/JWT, PostgreSQL z RLS wg @plan-db.md, konfiguracja CORS do origin aplikacji (Astro), brak ekspozycji sekretów.

## 2) Zakres API w tym etapie

| Endpoint                      | Operacja | Status                                                    | Walidacje kluczowe                              | Kody błędów   |
| ----------------------------- | -------- | --------------------------------------------------------- | ----------------------------------------------- | ------------- |
| `/api/health`                 | GET      | **nowy**                                                  | Brak Auth; sprawdzenie DB connectivity          | 200, 500      |
| `/api/users/me`               | GET      | **nowy** (min)                                            | Wymaga Bearer JWT; rekord tylko bieżącego usera | 200, 401      |
| Wszystkie inne z @api-plan.md | —        | **poza zakresem** (muszą respektować 401/403/404 pod RLS) | Path UUID; brak działania merytorycznego        | 401, 403, 404 |

Linki do kontraktów: @api-plan.md §2.1 Users, §2.12 Health. Konwencje błędów/paginacji/Idempotency – obowiązują globalnie, lecz aktywnie użyte dopiero w kolejnych etapach.

## 3) Model danych i RLS

- **Tabele używane:** `public.users` (profil cienki) + pośrednio wszystkie tabele objęte RLS (notebooks, phrases, …) — w tym etapie nie wykonujemy ich CRUD, ale **RLS musi być włączony** i poprawny dla całej bazy.
- **Relacje krytyczne:** `users ← notebooks ← phrases` (weryfikacja RLS prs. do krzyżowych dostępów).
- **Indeksy (istniejące):** bez zmian; ważne, by były wdrożone zgodnie z @plan-db.md.
- **RLS:** włączyć `ENABLE ROW LEVEL SECURITY` i polityki `USING/WITH CHECK` z §4 @plan-db.md dla **każdej** tabeli; szczególnie: `users.id = auth.uid()`, `notebooks.user_id = auth.uid()`, dziedziczenie przez `phrases`, `audio_segments`, `jobs`, `builds` itd.
- **Dodatkowe asercje własności:** selekcje w API zawsze przez rekordy przefiltrowane RLS (brak service-role).

## 4) Typy i kontrakty

- **DTO/Response:**
  - `Users.MeResponse` — zgodny z @api-plan.md (`{ id, created_at }`).
  - `HealthResponse` — `{ status, db, time }`.
    (Odwołania typów do `@database.types.ts` / `@types`, bez duplikowania).

- **Reguły serializacji:** ISO-8601 `timestamptz` w odpowiedziach, UUID jako string; ETag/If-None-Match mogą zostać podłączone później (konwencja w @api-plan.md).

## 5) Walidacja i limity

- **Auth:** brak/nieważny JWT → `401 unauthorized`.
- **Autoryzacja:** dostępu do nie swoich zasobów broni RLS → `403` lub `404 not_found` bez ujawniania metadanych.
- **CORS:** tylko origin aplikacji (Astro).
- **Body/query:** brak (poza `users/me` i `health`).
- **Katalog błędów:** JSON `{ "error": { "code", "message" } }` (konwencja globalna).

## 6) Przepływy (E2E) w ramach etapu

### 6.1 „Who am I” (weryfikacja Auth + RLS)

```
Client → (GET /api/users/me, Authorization: Bearer <JWT>)
    → API (weryfikacja JWT) → DB SELECT users WHERE id=auth.uid()
        → OK: 200 { id, created_at }
        → Brak/invalid: 401
```

Kontrakt wg @api-plan.md.

### 6.2 Health (żywotność)

```
Client → (GET /api/health)
    → API: sprawdzenie połączenia z DB → 200 {status:'ok', db:'ok', time:...} / 500
```

Kontrakt wg @api-plan.md.

### 6.3 DEV_JWT (tylko DEV)

```
Dev client boot → fetch DEV_JWT from local dev helper
  → Wstrzyknij Authorization: Bearer <DEV_JWT> do wszystkich requestów
  → API: akceptuje token (sub=DEFAULT_USER_ID), tylko przy NODE_ENV=development
```

Zasady wg @stages-plan.md (Etap 0).

## 7) Bezpieczeństwo

- **JWT i CORS:** Supabase JWT wymagany (prod/e2e); CORS zawężony do origin aplikacji.
- **RLS:** włączone na wszystkich tabelach per @plan-db.md; brak użycia service-role w UI/SSR.
- **DEV_JWT:** tylko w DEV; TTL krótki; generowany podpisem `SUPABASE_JWT_SECRET`; nie dołącza do buildów.
- **Sekrety:** żaden sekret (w tym `SUPABASE_SERVICE_ROLE`, klucze TTS) nie trafia do klienta; tylko zmienne serwerowe. @backend.mdc/@shared.mdc/@astro.mdc obowiązują. (odwołanie bez cytowania treści)

## 8) Obsługa błędów

- **HTTP + `error.code`:** `401 unauthorized`, `403 forbidden`, `404 not_found`, `500 internal`. W health: 200/500. Mapowanie wyjątków zgodnie z @api-plan.md (konwencja błędów).
- **Edge cases:** wygasła sesja → 401; token z innym `sub` niż rekord — RLS → 404/403; brak DB → 500 w health.

## 9) Wydajność

- **Budżet latencji:** `users/me` ~ O(1) SELECT po PK (`auth.uid()`), health: krótki ping DB.
- **Indeksy:** bez nowych; upewnić się, że `users.id` jest PK oraz RLS nie wymusza joinów nieindeksowanych. @plan-db.md bez zmian.
- **Paginacja/batch:** nie dotyczy w tym etapie.

## 10) Testy jednostkowe

1. `users/me` bez tokena → 401.
2. `users/me` z ważnym JWT (user A) → 200 i `id == sub`.
3. Próba odczytu zasobu innego użytkownika (np. `GET /api/notebooks/:id` belong B) → 404/403 (RLS).
4. `/api/health` przy działającym DB → 200 `{status:'ok', db:'ok'}`.
5. `/api/health` przy zasymulowanym braku DB → 500.
6. DEV_JWT akceptowany gdy `NODE_ENV=development` → 200 na `users/me`.
7. DEV_JWT odrzucony w prod/e2e (feature flag/guard) → 401.
8. CORS: żądanie spoza dozwolonego origin → zablokowane (preflight/response headers).
9. RLS polityki „WITH CHECK”: INSERT/UPDATE na tabelach (gdy spróbujemy) z innym `user_id` → 403 (DB).
10. Brak service-role w UI: próba wywołania bezpośredniego SELECT’u poza RLS (mock) → błąd (ochrona SSR). (odwołanie: zasady implementacji)

## 11) Kroki wdrożenia (kolejność)

1. **Konfiguracja Auth/CORS:** Ustawić CORS do origin Astro; wpiąć middleware w API do weryfikacji Bearer JWT. @api-plan.md konwencje.
2. **Włączenie RLS:** `ENABLE ROW LEVEL SECURITY` + polityki z @plan-db.md dla wszystkich tabel. Zweryfikować `auth.uid()` na środowiskach.
3. **Endpoint `/api/health` (public):** sprawdzenie DB connectivity, format odpowiedzi.
4. **Endpoint `/api/users/me` (priv):** SELECT po `auth.uid()`; odpowiedź wg kontraktu.
5. **DEV_JWT (dev only):** generator + wstrzykiwanie w fetch/axios w DEV; feature flag, krótkie TTL; wycięcie z buildów prod. @stages-plan.md.
6. **Hardening nagłówków i błędów:** jednolite `{"error":{...}}`, maskowanie 404/403, brak logowania JWT.
7. **Testy jednostkowe:** uruchomić zestaw z pkt 10.
8. **Review zgodności:** checklista @shared.mdc/@backend.mdc/@astro.mdc (konwencje kodu, brak sekretów w kliencie).
9. **Deploy:** środowisko e2e/prod bez DEV_JWT; smoke: `health`, `users/me` z prawidłowym JWT. @stages-plan.md kryteria akceptacji.

**Stałe wymagania spełnione:** kody statusu (200/201/400/401/404/409/422/500; 402 w przyszłych etapach), zgodność z RLS i zasadami implementacji, stack Astro/TS/React/Tailwind/Supabase. @api-plan.md, @plan-db.md.

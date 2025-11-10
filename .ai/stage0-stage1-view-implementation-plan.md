## 1. Przegląd

Widoki **Notatnik** i **Import** realizują Etap 0 („Auth/RLS walking skeleton” + DEV_JWT) oraz Etap 1 (CRUD notatników/fraz, import, limity, raport odrzuceń). Celem jest zapewnienie prywatnego dostępu do zasobów użytkownika (RLS, JWT) oraz wprowadzenie danych do nauki poprzez import w formacie `EN ::: PL` z jasnym raportem odrzuceń i walidacjami zgodnie z PRD. Odniesienia: @prd.md, @ui-plan.md, @api-plan.md.

## 2. Routing widoku

- Publiczny: `/login` (Supabase Auth; redirect po zalogowaniu do `/notebooks`).
- Prywatne (wymagają JWT):
  - `/notebooks` — lista notatników (przegląd, rename, delete).
  - `/import` — utworzenie notatnika + import linii `EN ::: PL`.
  - `/notebooks/:id` — szczegóły notatnika: tabela fraz, reorder, delete, statusy audio (podgląd).

- Ochrona tras: RLS + Bearer JWT; w DEV tryb **DEV_JWT** automatycznie dodawany do requestów (tylko `NODE_ENV=development`).

## 3. Struktura komponentów

```
<AppLayout>
  <Topbar />
  <RouteOutlet>
    /login -> <AuthCard />
    /notebooks -> <NotebookList>
                    <NotebookTile />
                    <RenameNotebookDialog />
                    <DeleteConfirmDialog />
                    <LoadMore />
                  </NotebookList>
    /import -> <ImportView>
                 <ImportForm />
                 <NormalizeToggle />
                 <ImportSummary />
               </ImportView>
    /notebooks/:id -> <NotebookView>
                        <PhraseTable>
                          <PlayCell />
                          <DragHandle />
                        </PhraseTable>
                        <GenerateAudioButton disabled-on-missing-config />
                        <AudioStatusBadge />
                        <DeleteConfirmDialog />
                      </NotebookView>
  </RouteOutlet>
  <Toasts />
</AppLayout>
```

Podział oparty o plan UI i PRD.

## 4. Szczegóły komponentów

### Topbar

- **Opis**: Stała nawigacja (logo→`/notebooks`, link do `/import`, ikona „gear”→`/settings`, menu użytkownika).
- **Elementy**: `<nav>`, linki, `ConfigStatusBadge` (odczyt `/api/tts-credentials` → `is_configured`).
- **Zdarzenia**: kliknięcia nawigacji, logout.
- **Walidacja**: brak.
- **Typy**: `TtsConfigStateDTO` (odpowiedź z `/api/tts-credentials`).
- **Propsy**: `{ currentPath: string }`.

### AuthCard (/login)

- **Opis**: Formularz logowania Supabase; po sukcesie redirect do `/notebooks`.
- **Elementy**: `<form>`, pola auth (wg Supabase), `ErrorBanner`.
- **Zdarzenia**: `onSubmit` → Supabase Auth signIn.
- **Walidacja**: podstawowa walidacja pól (email, hasło).
- **Typy**: brak specyficznych DTO.
- **Propsy**: brak.

### NotebookList (/notebooks)

- **Opis**: Lista notatników użytkownika, opcjonalne wyszukiwanie po nazwie, paginacja kursorem.
- **Elementy**: `NotebookTile`, `RenameNotebookDialog`, `DeleteConfirmDialog`, `LoadMore`.
- **Zdarzenia**:
  - `onRename` → `PATCH /api/notebooks/:id`,
  - `onDelete` → `DELETE /api/notebooks/:id`,
  - `onSearch` → `GET /api/notebooks?q=...`,
  - `onLoadMore` → `GET /api/notebooks?cursor=...`.

- **Walidacja**: nazwa 1..100; konflikt duplikatu (409).
- **Typy**: `NotebookDTO`, `NotebooksListResponseDTO`.
- **Propsy**: `{ initialItems?: NotebookDTO[] }`.

### ImportView (/import)

- **Opis**: Utworzenie notatnika i import fraz z linii `EN ::: PL`, normalizacja opcjonalna, podsumowanie (accepted/rejected + lista przyczyn).
- **Elementy**: `ImportForm` (textarea + „Normalizuj”), `ImportSummary`, `GoToNotebookButton`.
- **Zdarzenia**: `onSubmit` → `POST /api/notebooks:import` (Idempotency-Key), po 201 → render `ImportSummary`; opcjonalnie `GET /api/notebooks/:id/import-logs`.
- **Walidacja** (frontend):
  - dokładnie jeden separator `:::` na linię, EN i PL niepuste,
  - limity: ≤100 fraz w payloadzie, ≤2000 znaków na część, nazwa 1..100, komunikaty z PRD.

- **Typy**: `ImportRequestDTO`, `ImportResponseDTO`, `ImportLogDTO`.
- **Propsy**: brak.

### NotebookView (/notebooks/:id)

- **Opis**: Przegląd fraz w notatniku; reorder pozycji; usuwanie fraz; przegląd statusów audio (complete/failed/missing); przycisk **Generate audio** (poza zakresem Etapu 1 – wyłącznie UI placeholder lub disabled).
- **Elementy**: `PhraseTable` (kolumny EN | PL | Play | Status), `DragHandle`, `PlayCell`, `DeleteConfirmDialog`, `AudioStatusBadge`.
- **Zdarzenia**:
  - `onReorder` → `POST /api/notebooks/:id/phrases:reorder`,
  - `onDeletePhrase` → `DELETE /api/phrases/:phraseId`,
  - `onLoad` → `GET /api/notebooks/:id/phrases` (+ opcj. `GET /api/notebooks/:id/audio-status`).

- **Walidacja**:
  - spójność pozycji (unikalne `position`),
  - teksty 1..2000,
  - UUID-y w ścieżkach,
  - statusy audio i manifest tylko do odczytu (Etap 1: wyświetlenie).

- **Typy**: `PhraseDTO`, `ReorderRequestDTO`, `AudioStatusDTO`.
- **Propsy**: `{ notebook: NotebookDTO }`.

### Dialogi wspólne

- **DeleteConfirmDialog** — potwierdzenia usunięcia (notatnik/fraza); komunikaty z PRD.
- **RenameNotebookDialog** — zmiana nazwy (1..100).

## 5. Typy

> Bazuj na @types.ts (DTO) oraz poniższych ViewModelach.

**DTO (z API):**

- `NotebookDTO`, `NotebooksListResponseDTO`, `ImportRequestDTO`, `ImportResponseDTO`, `ImportLogDTO`, `PhraseDTO`, `ReorderRequestDTO`, `AudioStatusDTO`, `TtsConfigStateDTO`. (Mapują bezpośrednio odpowiedzi/żądania z planu API.)

**ViewModel (UI-specyficzne):**

- `NotebookVM` = `{ id: string; name: string; updatedAt: string; canDelete: boolean }`
- `PhraseRowVM` = `{ id: string; position: number; en: string; pl: string; status?: "complete"|"failed"|"missing"; canPlay: boolean }`
- `ImportLineErrorVM` = `{ lineNo: number; rawText: string; reason: string }`
- `Pagination<T>` = `{ items: T[]; nextCursor?: string|null }`
- `DevAuthMode` = `"dev_jwt" | "prod_jwt"` (do zarządzania nagłówkami).

## 6. Zarządzanie stanem

- **Poziom strony (React islands)**: lokalny stan dla formularzy (`useState/useReducer`), paginacja i filtry.
- **Asynchroniczne dane**: proste hooki `useNotebooks`, `useImport`, `useNotebookPhrases` (fetch + abort + minimalny cache in-memory per island).
- **DEV_JWT**: w DEV interceptory `fetch`/`fetcher` automatycznie doklejają `Authorization: Bearer <DEV_JWT>`; w PROD nagłówek pochodzi z Supabase Auth (nie ma mechanizmu DEV_JWT w buildach).
- **Optimistic UI**: rename/delete oraz reorder z rollbackiem po błędzie.

## 7. Integracja API

- **Auth**: Supabase JWT w `Authorization: Bearer` (RLS enforced).
- **Notebooks**:
  - `GET /api/notebooks?limit,cursor,q,sort,order` → render listy.
  - `PATCH /api/notebooks/:id { name }` → rename (409 przy duplikacie).
  - `DELETE /api/notebooks/:id` → usunięcie (204).

- **Import**:
  - `POST /api/notebooks:import { name, lines[], normalize }` (+ `Idempotency-Key`) → po 201: `ImportSummary`.
  - `GET /api/notebooks/:id/import-logs` → lista odrzuceń (stronicowana).

- **Phrases**:
  - `GET /api/notebooks/:id/phrases` (sort po `position`).
  - `POST /api/notebooks/:id/phrases:reorder { moves[] }` (walidacja unikalności pozycji).
  - `DELETE /api/phrases/:phraseId` (204).

- **Health**:
  - `GET /api/health` (diagnostyka przy dev-setup).

## 8. Interakcje użytkownika

- Import: wklejenie linii → podgląd ilości → submit → podsumowanie (accepted, rejected, lista przyczyn) → „Przejdź do notatnika”.
- Lista notatników: rename/delete z toastami; „Więcej” dla paginacji; klik kafelka → `/notebooks/:id`.
- Notatnik: D&D reorder → zapis; usuwanie frazy z dialogiem; Play aktywny tylko gdy istnieje co najmniej jeden segment `complete` (Etap 1: wyświetlenie statusu).
- Auth: po utracie sesji redirect do `/login`; cross-user zasoby → 404/403 bez metadanych.

## 9. Warunki i walidacja

- **Import (frontend & backend)**: pojedynczy `:::` na linię; EN/PL niepuste; ≤100 linii; ≤2000 znaków/strona; normalizacja opcjonalna.
- **Notebook name**: 1..100 znaków; unikalność per użytkownik (case-insensitive).
- **Phrase**: `position` unikalne w notatniku; `en_text/pl_text` 1..2000.
- **Auth/RLS**: wszystkie żądania wymagają ważnego JWT; dev-only **DEV_JWT** w trybie development.
- **Błędy zgodne z katalogiem**: `400 validation_error`, `409 unique_violation`, `413 limit_exceeded`, `404 not_found`.

## 10. Obsługa błędów

- Import: pokazanie listy odrzuconych linii z powodem; przy `413` komunikat „Import przekracza 100 fraz”.
- RLS: 403/404 renderowane wspólnym layoutem błędów bez metadanych.
- Rename/Delete/Reorder: optimistic UI z rollbackiem; toasty sukcesu/błędu.
- Health check: w DEV link „sprawdź backend” → `/api/health`.

## 11. Kroki implementacji

1. **Etap 0 — Auth/RLS skeleton**
   a) Skonfiguruj Supabase Auth (JWT) i RLS; CORS do origin aplikacji.
   b) Dodaj **DEV_JWT** w dev-buildzie (interceptor doklejający `Authorization: Bearer ...`).
   c) Zaimplementuj guard routingu (public `/login`, prywatne reszta).
   d) Dodaj `/api/health` check w UI.
2. **Layout i nawigacja**: `AppLayout`, `Topbar`, trasy `/login`, `/notebooks`, `/import`, `/notebooks/:id`.
3. **Widok listy notatników**: fetch `GET /api/notebooks`, kafelki, rename (`PATCH`), delete (`DELETE`), „Więcej”.
4. **Widok importu**: formularz (textarea + „Normalizuj”), walidacje, `POST /api/notebooks:import` z Idempotency-Key, `ImportSummary` + link do notatnika, `GET import-logs`.
5. **Widok notatnika**: tabela fraz (`GET phrases`), D&D reorder (`POST :reorder`), delete frazy (`DELETE`), (opcjonalnie) `GET audio-status`.
6. **Obsługa błędów i toasty**: wspólny `ErrorLayout`, `Toasts`, mapowanie kodów błędów z API.
7. **Testy E2E (kryteria UC-04/05/10)**: widoczność wyłącznie własnych zasobów; raport odrzuceń importu; limity; 404/403 dla obcych zasobów.

---

**Załączniki i referencje**:

- PRD: @prd.md
- Opis widoku: ui-plan.md
- Endpointy: @api-plan.md
- Etapy: stages-plan.md
- Typy DTO: @types.ts (lokalny plik, źródło prawdy dla kontraktów)

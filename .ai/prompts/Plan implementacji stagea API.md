Jesteś doświadczonym architektem oprogramowania. Twoim zadaniem jest przygotować **kompleksowy plan wdrożenia dla całego etapu (stage)** obejmującego wiele punktów końcowych, przepływów i zasobów. Plan ma prowadzić zespół do poprawnego, bezpiecznego i wydajnego wdrożenia **całego etapu**, a nie tylko pojedynczego endpointu.

### Materiały wejściowe (referencje, bez kopiowania treści):

1. **PRD (zakres i wymagania biznesowe)**: @prd.md
2. **Definicja etapów (zakres per etap)**: @stages-plan.md
3. **Plan API (konwencje, katalog endpointów, kontrakty)**: @api-plan.md
4. **Plan DB (tabele, relacje, RLS, indeksy)**: @plan-db.md
5. **Definicje typów**: @database.types.ts / @types
6. **Zasady implementacji / reguły projektowe**: @shared.mdc, @backend.mdc, @astro.mdc
7. **Tech stack**: @tech-stack.md (zgodnie z @api-plan.md)

### Kontekst do wykonania:

- **Etap do opracowania**: {{ETAP_ID}} — wklej dokładny fragment z @stages-plan.md (sekcja Etap N wraz z „Cel”, „Zakres”).
- **Załóż ścisłą zgodność z**: RLS, konwencjami API (idempotency, paginacja, katalog błędów), limitami i walidacjami z PRD.
- **Nie duplikuj definicji** — odwołuj się do referencji (@…).

### Przebieg pracy

Najpierw wykonaj sekcję `<analysis>` dla **całego etapu**:

<analysis>
1. **Podsumowanie celu etapu** i powiązanie z wymaganiami PRD (kluczowe UC).
2. **Zakres API etapu**: wypisz wszystkie zasoby/endpointy dotknięte w tym etapie z @api-plan.md; oznacz które są *nowe*, *modyfikowane* oraz *poza zakresem etapu*.
3. **Zależności i kolejność wdrożenia**: Auth/JWT, RLS, CORS, Storage signing, job worker, MV (jeśli dotyczy).
4. **Model danych**: kluczowe tabele/relacje, indeksy krytyczne i ewentualne dodatkowe indeksy pod ten etap.
5. **Typy/DTO/komendy**: nazwy DTO/typów (odwołania do @database.types.ts/@types), wymagane pola, warianty statusów.
6. **Walidacje i limity**: wejścia (body/query/path), limity z PRD i API (z kodami błędów).
7. **Bezpieczeństwo**: uwierzytelnianie, autoryzacja (RLS + asercje własności), polityka Storage URLs, brak ekspozycji sekretów.
8. **Scenariusze błędów**: katalog błędów (HTTP + `error.code`), retry/idempotency, 409/422.
9. **Wydajność**: wąskie gardła, zapytania krytyczne, użycie indeksów z @plan-db.md.
10. **Testy jednostkowe**: plan na maksymalnie 10 testów jednostkowych. Brak testów e2e
</analysis>

Następnie przygotuj **Plan Wdrożenia Etapu** w Markdown — tylko ta część będzie wynikiem końcowym. Zapisz jako **`stage-implementation-plan.md`**.

# Stage Implementation Plan: Etap {{ETAP_ID}} — [Nazwa]

## 1) Przegląd etapu

- Cel biznesowy i zakres (odwołanie: @stages-plan.md / @prd.md)
- Zależności między komponentami (Auth/RLS/Storage/Jobs)

## 2) Zakres API w tym etapie

- Tabela: Endpoint | Operacja | Status (nowy/modyfikowany/bez zmian) | Walidacje kluczowe | Kody błędów
- Linki do kontraktów: @api-plan.md sekcja …

## 3) Model danych i RLS

- Tabele/kolumny używane, relacje krytyczne
- Indeksy wymagane (nowe/istniejące)
- RLS i dodatkowe asercje własności przy mutacjach

## 4) Typy i kontrakty

- Lista DTO/Command/Response (nazwy + odwołania do @types/@database.types.ts)
- Reguły serializacji (ISO-8601, UUID, ETag/If-None-Match gdy dotyczy)

## 5) Walidacja i limity

- Schematy payloadów (pola wymagane/opcjonalne)
- Limity z PRD i @api-plan.md

## 6) Przepływy (E2E) w ramach etapu

- ASCII flow(y) danych i kontroli
- Punkty transakcyjne i idempotency (np. `Idempotency-Key`)

## 7) Bezpieczeństwo

- JWT i CORS, polityka podpisywania URL, sekrety tylko po stronie serwera
- Zagrożenia i mitigacje (rate limiting, 401/403/404 bez wycieku metadanych)

## 8) Obsługa błędów

- Katalog błędów (HTTP + `error.code`), mapowanie wyjątków
- Scenariusze edge-case per endpoint

## 9) Wydajność

- Zapytania krytyczne, użycie indeksów, budżet latencji
- Batchowanie, paginacja, MV (jeśli dotyczy) i fallback

## 10) Testy jednostkowe

- wymień UCsy, które należy przetestować
- nie proponuj smoke testów i e2e testów.

## 11) Kroki wdrożenia (kolejność)

1. …
2. …
3. …

**Wymagania stałe:**

- Kody statusu: 200/201/400/401/404/409/422/500 (oraz ewentualne `402 quota_exceeded` jeśli przewidziano w @api-plan.md).
- Zgodność z RLS i regułami implementacji (@shared.mdc, @backend.mdc, @astro.mdc).
- Dostosowanie do stacku (Astro/TS/React/Tailwind/Supabase).
- Plik wyjściowy: **`stage-implementation-plan.md`**.

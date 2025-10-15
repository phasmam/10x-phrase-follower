Twoim zadaniem jest wdrożenie **całego etapu (stage)** obejmującego wiele endpointów i zmian w modelu danych, zgodnie z zatwierdzonym planem etapu. Celem jest solidna, czytelna implementacja z poprawną walidacją, obsługą błędów i zgodnością z regułami projektu.

### Wejście (referencje):

<implementation_plan>
{{stage-implementation-plan}} ← dodaj referencję do planu etapu (np. @stage-implementation-plan.md)
</implementation_plan>

<types>
{{types}} ← referencje do definicji typów (np. @types, @database.types.ts)
</types>

<implementation_rules>
{{backend-rules}} ← referencje do reguł backendowych (np. @shared.mdc, @backend.mdc, @astro.mdc)
</implementation_rules>

<api_and_db_plans>
@api-plan.md, @plan-db.md, @prd.md, @stages-plan.md
</api_and_db_plans>

### Tryb pracy (inkrementalny)

<implementation_approach>
W jednym przebiegu zrealizuj **maksymalnie 3 konkretne zadania** (work items) ze Stage Planu — np.:

- zestaw endpointów w jednym obszarze (CRUD/akcje),
- migracje/indeksy/RLS dla powiązanego modułu,
- logika usługowa i kontrakty dla wybranego przepływu.

Na końcu:

- krótko podsumuj, co zostało zrobione,
- wypisz **3 kolejne** planowane działania.
  Przerwij po tym kroku — czekam na feedback.
  </implementation_approach>

### Kroki wykonania

1. **Analiza Stage Planu (bez kodu)**

- Wypisz elementy w scope: endpointy (z metodami), zmiany DB (tabele/indeksy/RLS), zależności (Auth/JWT, CORS, Storage, job worker, MV jeśli dotyczy).
- Oznacz statusy: _nowe_, _modyfikowane_, _poza zakresem_.
- Zbierz wspólne wymagania: walidacje, limity, idempotency, paginacja, kody błędów.

2. **Slicing na 3 zadania**

- Wybierz do 3 spójnych work items z najwyższą wartością/krytycznością.
- Dla każdego zdefiniuj mini-DoD (co uznajemy za „done” technicznie).

3. **Implementacja wybranych zadań**
   Dla każdego work itemu:

- **Routing/handler**: zarejestruj ścieżki i metody HTTP.
- **Schematy wejścia/wyjścia**: zdefiniuj DTO (odwołania do @types), walidacje pól (required/optional, formaty).
- **Logika usługowa**: zaimplementuj w service (lub wydziel nowy), bez logiki w handlerze.
- **Dostęp do danych**: zapytania zoptymalizowane pod indeksy; transakcje tam, gdzie to konieczne.
- **RLS i autoryzacja**: egzekwuj własność i role; brak bocznych kanałów dostępu.
- **Idempotency/pagination** (jeśli dotyczy): honoruj `Idempotency-Key`, stałe kursory/limit.
- **Obsługa błędów**: mapuj do 200/201/400/401/404/409/422/500 (+ ewentualnie `402 quota_exceeded` jeśli przewidziano); zwracaj `error.code` i spójne komunikaty.
- **Kontrakty**: utrzymuj zgodność z @api-plan.md (nazwy pól, statusy, formaty).

4. **Zmiany DB (jeśli w danym work itemie)**

- Migracje/indeksy (DDL), modyfikacje RLS (POLICY/USING/WITH CHECK).
- Krótkie uzasadnienie indeksów (na podstawie wzorców zapytań).

5. **Weryfikacja wykonania (bez testów automatycznych)**

- Lista edge-cases do ręcznego sprawdzenia.
- Krótkie kroki weryfikacji kontraktu (request/response examples).

6. **Wyjście tej iteracji**

- Wypisz artefakty: ścieżki plików, krótkie diff-bloki lub pseudopatche (tylko kluczowe fragmenty).
- Podsumowanie wykonanych 3 zadań + **3 kolejne** planowane działania.

### Wymagania stałe

- Kody statusu: 200/201/400/401/404/409/422/500 (opcjonalnie `402 quota_exceeded` jeśli przewidziano).
- Zgodność z @api-plan.md, @plan-db.md (RLS) oraz @shared.mdc, @backend.mdc, @astro.mdc.
- Brak ekspozycji sekretów; walidacje i limity zgodne z PRD/API.
- Styl i czystość kodu wg reguł projektu.

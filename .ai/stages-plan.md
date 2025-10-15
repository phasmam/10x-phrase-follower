# Etap 0 — Auth/RLS „walking skeleton” + DEV_JWT

**Cel:** izolacja danych i bezklikalny dev-flow.
**Zakres:**

* **Produkcja/e2e:** autoryzacja Bearer JWT, RLS włączone na wszystkich tabelach, CORS do origin aplikacji, brak użycia service-role w ścieżkach UI, health endpoint.
* **DEV (Opcja B):** krótkotrwały **DEV_JWT** podpisany `SUPABASE_JWT_SECRET` z `sub=DEFAULT_USER_ID`, automatycznie dodawany do requestów (`Authorization: Bearer …`). Tryb wyłącznie przy `NODE_ENV=development`.
  **Akceptacja (PRD/UC-01):** użytkownik widzi wyłącznie własne zasoby; obcy zasób → 404/403; health endpoint żyje.
  **Dodatkowo (DoD):** w e2e/prod requesty bez ważnego Bearer JWT są odrzucane (401/403), a mechanizm DEV_JWT nie trafia do buildów.

# Etap 1 — Notatnik + Import (CRUD, limity, raport odrzuceń)

**Cel:** wprowadzić dane do nauki, gwarantując walidacje.
**Zakres:** CRUD notatników/fraz; import `EN ::: PL` z normalizacją; limity (frazy/notatnik, długość frazy, max notatników/użytkownik); log odrzuceń. Widok listy i notatnika w GUI.
**Akceptacja (UC-04/05 + UC-10 import):** poprawne utworzenie notatnika z importu, zachowanie kolejności/pozycji, jasno zwrócone odrzucenia (lista odrzuconych z powodem).

# Etap 2 — „Audio loop” (TTS konfiguracja → generowanie → minimalny odsłuch)

**Cel:** domknięta pętla wartości: fraza → audio → odsłuch.
**Zakres:** zapis/test klucza TTS (bez ekspozycji do klienta); konfiguracja EN1/EN2/EN3/PL (bez duplikatów EN); pełny rebuild notatnika (po sukcesie dezaktywacja starych segmentów i GC plików); **Playback Manifest** ze **signed URL** (pomija missing/failed). Minimalny player: Play/Pause, sekwencja EN1→EN2→EN3→PL, prędkości, auto-advance.
**Akceptacja (UC-02/03/06/07 + UC-10 generate):** klucz TTS zweryfikowany; pojedynczy aktywny job; manifest działa (krótkie URL, brak failed/missing); player gra pełną sekwencję; w razie niepowodzenia generowania jasny komunikat błędu („Nie udało się wygenerować audio. Spróbuj ponownie.”).

# Etap 3 — Klik-to-seek + highlight + statusy

**Cel:** lepsza kontrola nauki i widoczność postępu.
**Zakres:** klik-to-seek po słowie (heurystyka), highlight on/off; agregat **audio status** (complete/failed/missing) w tabeli fraz; player pomija braki zgodnie z manifestem.
**Akceptacja (UC-08/UC-09):** klik w słowo ustawia odtwarzanie; highlight działa; statusy spójne z aktywnym buildem.

---

# Post-MVP (lista)

* **Export MP3/ZIP** (zgodnie z PRD „plany na przyszłość”).
* Idempotency-Key na POST-ach.
* Rate limiting (szczególnie `generate` i `tts:test`).
* Katalog błędów + telemetria/metryki jobów.
* Częściowa regeneracja (per fraza).

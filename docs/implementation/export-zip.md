[4 tools called]

### Wstęp – cel i kontekst

Celem jest zaimplementowanie funkcji **Eksport ZIP** opisanej w `docs/details/export-zip.md`: z poziomu widoku notatnika użytkownik klika **Export**, a backend zwraca plik `{notebook}.zip` zawierający **płaską listę plików MP3 (1 MP3 na frazę)**. Każdy MP3 to sklejka segmentów audio EN1→(800 ms pauzy)→EN2→(800 ms)→EN3→(800 ms)→PL, bez trzasków; nazwa pliku jest ściśle zdefiniowana, a cały ZIP nie może przekroczyć 30 MB. Poniżej masz spójny opis wymagań oraz zarys konkretnych miejsc w kodzie, gdzie agent powinien wprowadzić zmiany.

---

## 1. Zakres funkcjonalny eksportu ZIP

- **Wejście użytkownika**:
  - Użytkownik jest zalogowany, otwiera widok notatnika (`NotebookView`).
  - Z poziomu notatnika klika przycisk **Export**.
- **Dane źródłowe**:
  - Notatnik ma ustawione `current_build_id`.
  - Dla fraz istnieją segmenty audio w Supabase:
    - Bucket: `audio`.
    - Ścieżki segmentów: `audio/{userId}/{notebookId}/{phraseId}/{voiceSlot}.mp3` (już istniejące).
    - Metadane segmentów: tabela `audio_segments` (`path`, `duration_ms`, `size_bytes`, `status`, itd.).
- **Co powstaje**:
  - **ZIP** generowany „w locie” (streamowany response, **bez zapisu ZIP-a do storage**).
  - W środku:
    - Jeden plik MP3 **na każdą kwalifikującą się frazę**.
    - Struktura ZIP-a: **płaska** (bez katalogów).
- **Kryteria kwalifikacji frazy do eksportu**:
  - Fraza należy do danego notatnika.
  - Dla bieżącego `current_build_id` istnieją segmenty `audio_segments` o `status = "complete"` dla wszystkich slotów: `EN1`, `EN2`, `EN3`, `PL`.
  - Jeśli dla frazy czegokolwiek brakuje (`failed`/`missing`/brak segmentu) → **cała fraza jest pomijana** w ZIP-ie (bez błędu globalnego).
- **Zachowanie limitu wielkości ZIP-a**:
  - Przed startem generowania:
    - Sumujemy `size_bytes` wszystkich segmentów użytych do eksportu (dla kwalifikujących się fraz).
    - **Zakładamy**, że rozmiar ZIP ≈ suma rozmiarów MP3 (kompresja MP3 w ZIP prawie nic nie daje).
    - Jeśli szacowany rozmiar > 30 MB → **przerywamy operację** i zwracamy błąd z jasnym komunikatem.
- **Zachowanie przy błędzie**:
  - **Brak stron HTML.**  
    Na błąd zwracamy po prostu komunikat (np. `text/plain` lub JSON z `{ error: "..." }`), **nie renderujemy strony**.
- **Brak persystencji ZIP-ów w MVP**:
  - Nie tworzymy katalogu `storage/exports/{notebookId}/{exportId}.zip`, nie robimy crona 24h.
  - `storage.md` opisuje to jako „future”; MVP tego nie dotyka.

---

## 2. Specyfikacja nazewnictwa plików MP3 w ZIP-ie

Format nazwy:

- **`{dni_od_2025-01-01}_{N}_{Fraza_do_150}.mp3`**

Szczegóły:

- **`dni_od_2025-01-01`**:
  - Liczba dni od **2025-01-01**, liczona kalendarzowo.
  - Przykład:
    - Data eksportu: **2026-01-01** → `dni_od_2025-01-01 = 366`.
      - 2025 ma 365 dni → 2026-01-01 to 366‑ty dzień licząc od 2025-01-01.
  - Implementacyjnie:
    - Użyj dat UTC: `base = 2025-01-01T00:00:00Z`.
    - `diffDays = floor((todayUtc - base) / 86400000) + 1`.
    - Dzień 2025-01-01 → 1, 2025-12-31 → 365, 2026-01-01 → 366.
- **`N`**:
  - **Indeks frazy** w ZIP-ie (bez zer wiodących), **liczony tylko po frazach, które się zakwalifikowały**, zaczynając od 1.
  - Czyli pierwsza fraza w ZIP-ie → `1`, druga → `2`, itd.
- **`Fraza_do_150`**:
  - Źródło: **angielski tekst frazy (`en_text`)**.
  - Kroki normalizacji:
    1. `trim`, redukcja wielokrotnych spacji do pojedynczej.
    2. **Usuń wszystkie znaki specjalne**, zostaw tylko:
       - litery A–Z, a–z,
       - cyfry 0–9,
       - spacje.
         (Czyli np. `How's it going?` → `Hows it going`).
    3. Obetnij tekst do **maksymalnie 150 znaków**.
    4. Spacje zamień na `_`.
  - Dzięki temu nazwy są **bezpieczne dla Windows** (brak znaków specjalnych, brak problematycznych symboli).

---

## 3. API backend – nowy endpoint eksportu ZIP

### 3.1. Ścieżka i metoda

- **Endpoint**: `GET /api/notebooks/:notebookId/export-zip`
- **Plik**: `src/pages/api/notebooks/[notebookId]/export-zip.ts`
- **Wymagane zachowania spójne z innymi endpointami**:
  - `export const prerender = false;`
  - Autoryzacja: korzystamy z `context.locals.userId` jak w `playback-manifest.ts`.
  - Walidacja `notebookId` jako UUID (regex jak w `/api/notebooks/[notebookId].ts`).

### 3.2. Flow wysokopoziomowy w handlerze `GET`

1. **Autoryzacja i walidacja wejścia**:
   - Pobierz `userId` z `locals` (helper jak `getUserId` w `playback-manifest.ts`).
   - Zweryfikuj format `notebookId` (regex UUID).
   - Pobierz klienta Supabase: `getSupabaseClient(context)`.
   - Upewnij się, że użytkownik istnieje (`ensureUserExists` – spójnie z innymi endpointami).

2. **Pobranie notatnika i sprawdzenie builda**:
   - SELECT z tabeli `notebooks`:
     - `id`, `user_id`, `name`, `current_build_id`.
   - Upewnij się, że `user_id === userId` (wzoruj się na `/api/notebooks/[notebookId].ts`).
   - Jeśli notatnik nie istnieje lub nie jest użytkownika → 404.
   - Jeśli `current_build_id` jest `null` → 400 z jasnym komunikatem:
     - np. `Brak gotowego buildu audio dla tego notatnika. Wygeneruj audio przed eksportem.`

3. **Rate limiting (1 eksport / 30 sekund per użytkownik+notatnik)**:
   - W `src/lib` można dodać prosty serwis w stylu `idempotency.service.ts`, np. `export-zip-rate-limit.service.ts`:
     - In-memory `Map<string, number>` z timestampem ostatniego eksportu, klucz: `${userId}:${notebookId}`.
     - Okno: 30 sekund (30_000 ms).
     - Jeśli od ostatniego eksportu < 30 sekund → 429 + komunikat:
       - np. `Eksport dla tego notatnika był niedawno wykonany. Spróbuj ponownie za 30 sekund.`
   - To rozwiązanie jest wystarczające dla single-tenant / dev; w przyszłości można zastąpić Redisem.

4. **Pobranie fraz w kolejności**:
   - Z tabeli `phrases` dla danego `notebook_id`:
     - Kolumny: `id`, `position`, `en_text`, `pl_text`.
   - Sortowanie po `position` rosnąco (taka sama kolejność jak w playerze).
   - Jeśli brak fraz → można zwrócić pusty ZIP (OK) albo 400 z komunikatem; rekomendacja: **pusty ZIP z 0 plików** (ale z reguły notatnik ma frazy).

5. **Pobranie segmentów audio dla buildu**:
   - Z tabeli `audio_segments`:
     - Filtr: `build_id = current_build_id` oraz `phrase_id IN (ids fraz)`.
     - Potrzebne pola: `phrase_id`, `voice_slot`, `path`, `size_bytes`, `status`.
   - Można się wzorować na logice w `/api/notebooks/[notebookId]/playback-manifest.ts`, ale tu nie są potrzebne signed URL-e, tylko `path` do użycia w storage.

6. **Wybranie fraz kwalifikujących się do eksportu**:
   - Grupujemy segmenty po `phrase_id`.
   - Dla każdej frazy sprawdzamy, czy **istnieją segmenty** o `status = "complete"` dla dokładnie tych slotów:
     - `EN1`, `EN2`, `EN3`, `PL`.
   - Jeśli jakiegokolwiek brakuje → **całą frazę pomijamy** (nie generujemy jej MP3, nie wrzucamy do ZIP-a).
   - Tworzymy listę `exportablePhrases` w tej samej kolejności, co `phrases` (po `position`), ale odfiltrowaną wg powyższego kryterium.

7. **Estymacja rozmiaru ZIP-a (limit 30 MB)**:
   - Dla wszystkich zakwalifikowanych fraz:
     - Zbierz `size_bytes` ich segmentów (`EN1`, `EN2`, `EN3`, `PL`).
     - Zsumuj: `totalAudioBytes`.
   - Dodaj niewielki narzut na ZIP (np. +1% lub stałe np. +1 MB) – definicja:
     - `estimatedZipBytes = totalAudioBytes * 1.01 + 1_000_000`.
   - Jeśli `estimatedZipBytes > 30 * 1024 * 1024` → przerwij:
     - Status: **400**.
     - Treść: jednoznaczny komunikat, np.  
       `Eksport przekracza limit 30 MB. Zmniejsz liczbę fraz lub skróć notatnik.`

8. **Generowanie ZIP-a i strumieniowanie odpowiedzi**:
   - Utwórz ZIP w locie (np. przy użyciu biblioteki typu `archiver` albo innego narzędzia kompatybilnego z Node 22, bez nadmiernego zużycia pamięci).
   - Ustaw nagłówki odpowiedzi:
     - `Content-Type: application/zip`
     - `Content-Disposition: attachment; filename="{notebookNameSanitized}.zip"`
       - `notebookNameSanitized` – podobna normalizacja jak dla nazw MP3 (ASCII letters/digits/spaces → `_`, obcięcie długości).
   - Dla każdej frazy w `exportablePhrases`:
     1. **Zbuduj nazwę pliku MP3** wg zasad z sekcji 2.
     2. **Pobierz cztery segmenty MP3 z Supabase Storage**:
        - Bucket `audio`, `path` z `audio_segments.path`.
        - Tu można użyć **osobnego klienta storage** (jak w `playback-manifest.ts`) lub istniejącego z `getSupabaseClient(context)`.
     3. **Połącz segmenty w jeden plik MP3**:
        - Kolejność: EN1 → 800 ms ciszy → EN2 → 800 ms ciszy → EN3 → 800 ms ciszy → PL.
        - Format docelowy: ten sam co w `tts-audio-pipeline.md` (MP3 22.05 kHz / 64 kbps, mono).
        - MVP:
          - Agent powinien użyć odpowiedniego narzędzia / biblioteki, która:
            - Łączy MP3 w sposób zgodny ze specyfikacją (bez uszkadzania nagłówków),
            - Wstawia dokładną pauzę 800 ms jako **ciszę** między segmentami.
          - Micro-fade („docelowo”) może zostać pominięty w pierwszej wersji – ważne, by zachować poprawną składnię MP3.
     4. **Dodaj wygenerowany MP3 do ZIP-a** pod wyliczoną nazwą.
   - Po dodaniu wszystkich plików zakończ strumień ZIP i zwróć odpowiedź.

9. **Obsługa błędów runtime**:
   - Wszystkie nieoczekiwane wyjątki → logowanie na serwerze i odpowiedź:
     - Status: 500
     - Typ treści: np. `text/plain` albo JSON.
     - Komunikat ogólny, np. `Nie udało się wygenerować eksportu ZIP. Spróbuj ponownie później.`
   - **Nie** generować HTML-a – tylko prosty tekst / JSON.

---

## 4. UI – przycisk „Export” w notatniku

### 4.1. Miejsce w UI

- Plik: `src/components/NotebookView.tsx`.
- Sekcja przycisków nad tabelą fraz (obok `Open Player` i `GenerateAudioButton`):

Aktualnie:

- `Open Player` (link do `/player/:id`).
- `GenerateAudioButton` (tworzenie joba TTS).

Do dodania:

- **`Export`** – przycisk wywołujący eksport ZIP.

### 4.2. Zachowanie przycisku

- **Stan umożliwiający eksport**:
  - Przycisk jest aktywny, tylko gdy `state.notebook?.current_build_id` jest ustawione (czyli audio zbudowane).
  - Opcjonalnie: jeśli `state.activeJob` jest aktywny, można:
    - albo pozwolić na eksport (korzystając z ostatniego `current_build_id`),
    - albo zablokować przycisk do zakończenia joba – decyzja do doprecyzowania, ale sensowne jest pozwolenie na eksport z aktualnie aktywnego buildu.
- **Wywołanie backendu i obsługa błędów „bez strony”**:
  - Żeby **nie dostawać „stron błędu”**, lepiej **nie** używać `href` bezpośrednio, tylko:
    - Napisać mały komponent `ExportZipButton`:
      - Używa `fetch` do `GET /api/notebooks/:notebookId/export-zip`.
      - Jeśli `response.ok`:
        - `const blob = await response.blob();`
        - Utworzyć `URL.createObjectURL(blob)` i programowo kliknąć `<a download="...">`.
      - Jeśli `!response.ok`:
        - Spróbować odczytać `text()` lub JSON z `{ error: string }`.
        - Pokazać komunikat w `toast` (używając `useToast` – spójnie z `GenerateAudioButton`).
  - Dzięki temu wszystkie błędy pozostają w ramach SPA (toast), a backend może zwracać czysty tekst / JSON bez HTML-a.

---

## 5. Struktura zmian w kodzie – zarys dla agenta

### 5.1. Nowy endpoint: `export-zip.ts`

- **Lokalizacja**: `src/pages/api/notebooks/[notebookId]/export-zip.ts`.
- **Główne elementy**:
  - `export const prerender = false;`
  - Helper `getUserId(context: APIContext): string` (jak w `playback-manifest.ts`).
  - Funkcja pomocnicza do sanitizacji nazw plików (`sanitizeNotebookName`, `buildPhraseFilename`).
  - Implementacja `export async function GET(context: APIContext)` z pełnym flow z sekcji 3.2.
  - Ewentualnie wydzielenie logiki:
    - `selectExportablePhrases(...)`
    - `estimateZipSize(...)`
    - `createPhraseMp3(...)` (łączenie segmentów + pauzy).

### 5.2. Serwis rate-limitujący eksporty

- **Lokalizacja**: np. `src/lib/export-zip-rate-limit.ts`.
- **API**:
  - `canExport(userId: string, notebookId: string): boolean`
  - `markExport(userId: string, notebookId: string): void`
- **Implementacja**:
  - In-memory `Map<string, number>`: `lastExportAtMs`.
  - Stała `EXPORT_COOLDOWN_MS = 30 * 1000`.
  - Jeśli `now - lastExportAtMs < EXPORT_COOLDOWN_MS` → false (zwróć 429 w endpointzie).

### 5.3. Helpery do nazw i daty

- **Lokalizacja**: można dodać do `src/lib/utils.ts` lub nowy plik np. `src/lib/export-zip.utils.ts`.
- Funkcje:
  - `getDaysSinceBaseDate(today: Date, base: Date = new Date("2025-01-01T00:00:00Z")): number`
  - `sanitizePhraseName(enText: string): string` – wg zasad z sekcji 2.
  - `buildPhraseFilename(indexInZip: number, enText: string, exportDate: Date): string`.

### 5.4. Integracja z Supabase Storage

- W endpointzie:
  - Użyj `getSupabaseClient(context)` i z niego `supabase.storage.from("audio")`.
  - Pobieraj pliki MP3 przez `download(path)`.
  - Upewnij się, że tryb użycia storage jest spójny z `playback-manifest.ts` (który korzysta z serwisowego klienta, jeśli jest dostępny).

### 5.5. UI – nowy przycisk eksportu

- **Nowy komponent**:
  - `src/components/ExportZipButton.tsx` (lub inline w `NotebookView.tsx`, ale dedykowany komponent jest czytelniejszy).
  - Props: `notebookId: string`, `disabledReason?: string`.
  - Wewnątrz:
    - `const { addToast } = useToast();`
    - `const [isExporting, setIsExporting] = useState(false);`
    - `onClick`:
      - Jeśli `disabled` → nic nie rób.
      - Ustaw `isExporting = true`.
      - `fetch` na endpoint, obsługa sukcesu/błędu jak w sekcji 4.2.
      - W finally – `isExporting = false`.
- **Użycie w `NotebookView.tsx`**:
  - W miejscu, gdzie jest `Open Player` i `GenerateAudioButton`, dodać `ExportZipButton`.
  - Przekazać `notebookId`.
  - Ustawić `disabled` gdy `!state.notebook?.current_build_id`.

---

## 6. Podsumowanie wymagań „nie do zapomnienia”

- **Strona backend**:
  - Nowy endpoint `GET /api/notebooks/:notebookId/export-zip`.
  - Autoryzacja jak w `playback-manifest.ts`.
  - Walidacja `notebookId` jako UUID.
  - Użycie `current_build_id`; brak builda → 400.
  - Wybór tylko fraz z kompletnymi segmentami EN1+EN2+EN3+PL (`status = "complete"`).
  - Szacowanie rozmiaru ZIP-a z `size_bytes`; limit 30 MB → 400.
  - Nazwy plików: `{dni_od_2025-01-01}_{N}_{Fraza_do_150}.mp3` z EN, bez znaków specjalnych, spacje → `_`, indeks bez zer wiodących.
  - Sklejka audio: EN1 → 800 ms ciszy → EN2 → 800 ms → EN3 → 800 ms → PL; format MP3 22.05 kHz / 64 kbps.
  - ZIP generowany w locie, bez zapisu do storage.
  - Rate limit: 1 eksport / 30 sekund per użytkownik+notatnik (in-memory).
  - Błędy: statusy 4xx/5xx + prosty komunikat (tekst / JSON), **zero HTML**.

- **Strona frontend**:
  - Nowy przycisk **Export** w `NotebookView` przy tabeli fraz.
  - Przycisk aktywny tylko gdy `current_build_id` istnieje.
  - Wywołanie API przez `fetch`, sukces → pobranie ZIP-a, błąd → toast z komunikatem.
  - Brak osobnych stron błędów – tylko komunikaty.

To jest kompletny, spójny opis pod implementację – agent może na tej bazie bez dodatkowych pytań zaimplementować endpoint, helpery, przycisk w UI i testy pomocnicze (np. dla nazewnictwa i obliczania `dni_od_2025-01-01`).

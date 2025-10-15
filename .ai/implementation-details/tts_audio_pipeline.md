# Pipeline TTS i generowanie MP3

## Parametry audio

- Format wyjściowy: MP3 22.05 kHz / 64 kbps, mono.
- Pauza między segmentami (EN→EN→EN→PL) w playerze: 800 ms.
- Pauza między frazami: 800 ms (auto-advance).

## Konfiguracja lektorów (MVP: multi-voice)

- Per użytkownik: EN3 (kolejność decyduje o odtwarzaniu) + PL1.
- Brak duplikatów w obrębie języka.
- Zmiana konfiguracji → pełny rebuild notatnika.

## Kroki generowania (per notatnik)

1. Sprawdź, że użytkownik ma poprawny klucz Google TTS (test przy zapisie klucza).
2. Dla każdej frazy:
   - Dla EN1, EN2, EN3 (w zapisanej kolejności) oraz PL:
     - Wywołaj TTS i zapisz plik do `storage/audio/{notebookId}/{phraseId}/{voice}.mp3`.
   - Oznacz status frazy: `complete` (wszystkie segmenty) albo `failed/missing`.
3. Po sukcesie rebuildu całego notatnika: usuń stare MP3 (brak duplikatów).
4. W razie błędów: nie wykonuj retry (MVP); pokaż globalny komunikat:
   „Nie udało się wygenerować audio. Spróbuj ponownie."

## API (serwer → Google TTS)

- Klucz TTS wyłącznie po stronie serwera.
- Endpoint serwerowy: `{voiceId, text, lang=en|pl, audioConfig} → MP3 buffer`.
- Frontend NIGDY nie widzi klucza.

## Statusy i odporność

- Segmenty nieudane oznacz jako `failed`; UI pokazuje status per fraza.
- Rebuild idempotentny: po udanym przebiegu poprzednie MP3 są usuwane.

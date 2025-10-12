# Player: sekwencja, klik-to-seek, highlight, kopiowalność

## Sekwencja odtwarzania
- EN1 → EN2 → EN3 → PL
- Pauza między segmentami: 800 ms
- Pauza między frazami: 800 ms (auto-advance)
- Prędkości: 0.75, 0.9, 1.0, 1.25

## Klik-to-seek (kluczowe)
- Klik w pierwsze słowo frazy → start od początku BIEŻĄCEGO segmentu (nie od EN1).
  - Przykład: jeśli gra EN2 i klikniesz pierwsze słowo, wracamy do początku EN2.
- Klik w dowolne słowo → seek do początku tokenu w aktualnie grającym segmencie.
- Jeśli gra PL, a klikniesz słowo EN → odtwarzaj od początku EN1 (początek frazy).

## Kopiowalność i spacje
- Cała fraza MUSI być kopiowalna 1:1 (ze wszystkimi spacjami i znakami).
- Render:
  - kontener: `white-space: pre-wrap; user-select: text;`
  - słowa/interpunkcja: `span.token[data-token-index]` (klikalne),
  - spacje i myślniki-pauzy: `span.ws` / `span.dash` (nieklikalne),
  - zaznaczanie tekstu działa na całym tekście (nie blokować selecta).
- Kliki tylko na `.token`, ale zaznaczanie obejmuje wszystko.

## Highlight
- Przełączalny: on/off.
- Token = słowo + przyległa interpunkcja (zob. tokenizacja.md).
- Synchronizacja heurystyczna; cel offsetu ≤ ~80 ms (best effort).
- Tokeny typu „pauza-dash" (samodzielny „-"/„—" między słowami) nie są klikalne ani highlightowane.

## Minimalny preload (MVP)
- Ładuj aktualny segment + opcjonalnie kolejny segment.
- Pełny prefetch (bundle + anulowanie) opisany w `prefetching.md` (future).

## Stany błędów
- Brak segmentu: player pomija i kontynuuje; UI sygnalizuje `missing`.
- Błąd pobrania: pokaż komunikat, przejdź do następnego segmentu/frazy.

## API wewnętrzne (przykład)
- `loadPhraseSegments(phraseId) → Promise<AudioBuffers[]>`
- `seekToToken(segmentId, tokenIndex)`
- `setRate(rate)`
- `toggleHighlight(enabled)`


# Tokenizacja i normalizacja (EN/PL)

## Cel

Spójny podział na tokeny (słowo + przyległa interpunkcja) wykorzystywany jednocześnie w:

- synchronizacji klik-to-seek,
- podświetlaniu słów,
- heurystycznym mapowaniu czasu (start/end),
- zachowaniu pełnej kopiowalności frazy (ze spacjami).

## Normalizacja wejścia

Wejście (import i dodawanie ręczne) przechodzi przez pipeline:

1. Zamiana typograficznych cudzysłowów na proste (np. " " → ").
2. Usunięcie znaków zero-width (ZWJ/ZWNJ/ZWSP).
3. Redukcja wielokrotnych spacji do jednej (poza pojedynczymi, które muszą zostać).
4. Zachowanie znaków „-" i „—" (nie usuwamy, nie zamieniamy; patrz „Pauzy i myślniki").
5. Usunięcie znaków sterujących i niewidocznych (poza whitespace).
6. Trim na początku i końcu EN/PL.

## Reguły tokenizacji

- Token = [słowo] + [przyległa interpunkcja po słowie].
- Interpunkcja przyległa: , . ! ? : ; … ) ] " ' — jeśli występuje bezpośrednio po słowie.
- Lewa interpunkcja (np. otwierający cudzysłów/nawias) NIE wchodzi do tokenu; renderowana osobno jako token interpunkcyjny (zalecenie: klikalny).
- Apostrof w środku słowa (it's, don't) jest częścią tokenu.
- Liczby i skróty (Mr., Dr.) są pojedynczym tokenem; kropka skrótowa zalicza się jako „przyległa".

## Pauzy i myślniki

- „-" lub „—" między słowami, otoczone spacjami, traktujemy jako osobny token typu „pauza-dash".
  - zachowujemy dokładny znak (nie zamieniamy „—" na „-"),
  - token „pauza-dash" jest widoczny, NIEklikalny, bez highlightu,
  - w mapowaniu czasu otrzymuje 0 ms (lub minimalny budżet 10–20 ms wyłącznie dla ciągłości indeksów); pauzę robi TTS.
- „-" w środku słowa (np. well-being) należy do tokenu słowa (klikalny, highlightowany).

## Spacje jako tokeny

- Spacje i znaki nowej linii zachowujemy w strukturze renderowania jako osobne węzły (`span.ws`), nieklikalne.
- Dzięki temu cały tekst można zaznaczyć/kopiować 1:1, włącznie z odstępami.
- CSS dla kontenera: `white-space: pre-wrap`; `user-select: text`.

## Heurystyka czasu słów (gdy brak znaczników od TTS)

- Czas segmentu T (ms) dzielimy na tokeny „rdzeniowe" (słowa); interpunkcja i „pauza-dash" dostają 0 ms.
- Wzór: `t_i = T * (len(core_word_i) / Σ len(core_word_j))`
- Start tokenu = suma poprzednich t + opcjonalny minimalny odstęp techniczny 10–20 ms.
- Cel: offset highlightu względem audio ≤ ~80 ms (best effort).

## Dane wyjściowe do playera

Dla każdej frazy i segmentu:

- `tokens`: lista obiektów `{ text, type: "word"|"punct"|"dash"|"space", startMs, endMs, charStart, charEnd, clickable: bool }`
- `clickMap`: odwzorowanie kliknięcie→`(segmentCurrent, tokenStartMs)` dla `type="word"`.

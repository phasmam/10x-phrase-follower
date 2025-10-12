# Prefetching (future)

## Cel
Zredukować opóźnienia startu i przejść, zapewniając płynne odtwarzanie bez „dziur".

## Zasady
- Po wejściu w frazę i: pobierz równolegle wszystkie segmenty (EN1..EN3, PL).
- Preload pierwszego segmentu frazy i+1.
- Limit równoległości: 6.
- Anulowanie: przy ręcznej zmianie frazy anuluj trwające pobrania poprzedniej frazy.

## Pseudokod
enterPhrase(i):
  cancelAllDownloads()
  queue = segments(i) + firstSegment(i+1)
  downloadParallel(queue, limit=6)

onPhraseChange(newI):
  cancelAllDownloads()
  enterPhrase(newI)

## Błędy
- Timeout pojedynczego segmentu → sygnalizuj i kontynuuj z pozostałymi.
- Brak jakiegokolwiek segmentu frazy → player przechodzi do następnej frazy.


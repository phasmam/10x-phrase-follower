# Bezpieczeństwo i prywatność

## Sesja i dostęp
- Logowanie wymagane do wszystkich ekranów.
- Izolacja danych per użytkownik; prosty URL guessing nie daje dostępu (owner check).
- Próba dostępu do cudzych zasobów → 404/403 bez wycieku metadanych.

## Klucz Google TTS
- Przechowywany i używany wyłącznie po stronie serwera.
- Test walidacyjny przy zapisie; frontend widzi jedynie status „skonfigurowano".
- Klucz NIGDY nie trafia do JS/payloadów.

## Usuwanie danych
- Hard delete MP3/ZIP (MVP).
- Po udanym rebuildzie: kasowanie starych plików (brak duplikatów).


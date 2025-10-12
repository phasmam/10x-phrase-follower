# Storage i porządkowanie

## Struktura katalogów (lokalnie, single-tenant)
- `storage/audio/{notebookId}/{phraseId}/{voice}.mp3`
- `storage/audio_tmp/...`
- `storage/exports/{notebookId}/{exportId}.zip`
- `storage/meta/...`

## Zasady
- Hard delete:
  - usunięcie frazy → usuń wszystkie jej MP3,
  - usunięcie notatnika → usuń audio i eksporty powiązane.
- Po udanym rebuildzie notatnika: usuń poprzednie MP3 (brak duplikatów).
- ZIP-y (future): kasuj po pobraniu oraz cron „auto-clean" > 24 h.

## Nazwy plików (eksport – future)
- `{dni_od_2025-01-01}_{NNN}_{Fraza_do_150}.mp3`
- `NNN` = zero-padded indeks frazy (wymusza kolejność).
- Spacje → `_`; znaki problematyczne usuwane/normalizowane.

## Sanity checks
- Po rebuildzie: skan katalogu notatnika → brak plików starszych generacji.
- Przy imporcie: liczba fraz ≤ 100, każda fraza ≤ 2000 znaków.


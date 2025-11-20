# Eksport ZIP (future)

## Zakres

- Generuje `{notebook}.zip` na żądanie.
- Wewnątrz: płaskie pliki `.mp3` (bez katalogów).

## Budowa pliku frazy

- Sklejka: EN1 → [800 ms] → EN2 → [800 ms] → EN3 → [800 ms] → PL
- Bez trzasków i artefaktów (docelowo micro-fade – zob. audio-pipeline).
- Źródła: MP3 z supabase

## Nazewnictwo

- `{dni_od_2025-01-01}_{NNN}_{Fraza_do_150}.mp3` (np. `220_001_How_is_it_going.mp3`)
- `NNN` = zero-padded indeks frazy.
- Spacje → `_`; znaki problematyczne usuwane/normalizowane.

## Przycisk

- z poziomu notatnika przycisk Export

## Czyszczenie

- Usuń ZIP po pobraniu.
- Auto-clean: wszystkie ZIP-y starsze niż 24 h.

## Limity

- Rozmiar ZIP < 30 MB (przerwij z czytelnym komunikatem).

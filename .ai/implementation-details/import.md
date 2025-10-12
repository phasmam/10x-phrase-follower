# Import pliku `EN ::: PL`

## Format
- Każda linia: `EN zdanie ::: PL zdanie`
- Separator dokładnie `:::` (spacje wokół dopuszczalne po trim).

## Walidacja
Odrzuć linię, jeśli:
- brak separatora lub jest wiele separatorów,
- EN lub PL puste po trim,
- przekroczono limit: ≤100 fraz/notatnik, ≤2000 znaków/fraza.

Raport: pokaż tylko odrzucone linie z numerem i powodem.

## Normalizacja (spójna z tokenizacja.md)
- NIE usuwamy i NIE zamieniamy „-" ani „—".
- Redukujemy ≥2 spacje do pojedynczej (pojedyncze spacje zostają).
- Usuwamy zero-width, znaki sterujące; zamieniamy „inteligentne" cudzysłowy na proste; trim.

## Algorytm (pseudokod)
parse(file):
  lines = readLines(file)
  accepted = []
  rejected = []
  for (idx, raw) in enumerate(lines):
    s = normalize_preserving_dashes(raw)
    parts = splitByExactSeparator(s, ":::")
    if len(parts) != 2:
      reject(idx, "wielokrotny/niejednoznaczny separator"); continue
    en = trim(parts[0]); pl = trim(parts[1])
    if en == "" or pl == "":
      reject(idx, "pusty EN/PL"); continue
    if len(en) > 2000 or len(pl) > 2000:
      reject(idx, "przekroczony limit znaków"); continue
    accepted.append({en, pl})
    if len(accepted) >= 100: break
  return {accepted, rejected}

## Dane wyjściowe
- Lista zaakceptowanych par EN/PL do utworzenia notatnika.
- Raport odrzuceń: `[{ lineNumber, reason, preview }]`.

## UI
- Po imporcie pokazujemy tylko odrzucone pozycje z powodem (bez rozbudowanych statystyk).


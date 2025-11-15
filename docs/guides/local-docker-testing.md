# Testowanie Dockera lokalnie przed deployem

## Krok 1: Zbuduj obraz Dockera lokalnie

```bash
# W katalogu projektu
docker build -t phrase-follower:local .
```

To zbuduje obraz z tagiem `phrase-follower:local`.

**Uwaga:** Build może zająć kilka minut (pierwszy raz dłużej, bo pobiera zależności).

## Krok 2: Stwórz plik `.env` lokalnie (jeśli nie masz)

```bash
# W katalogu projektu
cp .env.example .env  # jeśli masz przykład
# lub stwórz ręcznie
nano .env
```

Wklej zmienne środowiskowe:

```env
PUBLIC_SUPABASE_URL=https://twoj-projekt.supabase.co
PUBLIC_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_URL=https://twoj-projekt.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PHRASE_TTS_ENCRYPTION_KEY=twoj_64_znakowy_hex_key
NODE_ENV=production
```

## Krok 3: Uruchom kontener lokalnie

### Opcja A: Użyj docker-compose (zalecane)

```bash
# Ustaw zmienną środowiskową dla obrazu
export DOCKER_IMAGE=phrase-follower:local

# Uruchom
docker compose up
```

**Lub bezpośrednio w docker-compose.yml** - zmień linię 7:

```yaml
image: phrase-follower:local # zamiast ghcr.io/...
```

Potem:

```bash
docker compose up
```

### Opcja B: Uruchom bezpośrednio przez docker run

```bash
docker run -p 3000:3000 \
  --env-file .env \
  phrase-follower:local
```

## Krok 4: Sprawdź czy działa

```bash
# W innym terminalu
curl http://localhost:3000
```

**Oczekiwany wynik:** HTML odpowiedź (strona główna aplikacji)

## Krok 5: Sprawdź logi

```bash
# Jeśli używasz docker-compose
docker compose logs -f

# Jeśli używasz docker run
docker logs <container-id>
```

**Co sprawdzić w logach:**

- `Server listening on http://0.0.0.0:3000` (nie localhost!)
- Brak błędów związanych z Supabase
- Brak błędów związanych z brakującymi zmiennymi środowiskowymi

## Krok 6: Test logowania

Otwórz w przeglądarce:

```
http://localhost:3000
```

Spróbuj się zalogować - powinno działać.

## Debugowanie

### Problem: Błąd "Supabase configuration is missing"

**Rozwiązanie:**

```bash
# Sprawdź czy zmienne są w kontenerze
docker compose exec app env | grep SUPABASE

# Jeśli nie ma, sprawdź .env
cat .env | grep SUPABASE
```

### Problem: Port 3000 zajęty

**Rozwiązanie:**

```bash
# Zmień port w docker-compose.yml
ports:
  - "3001:3000"  # zamiast 3000:3000

# Lub zatrzymaj inne aplikacje na porcie 3000
```

### Problem: Obraz się nie buduje

**Rozwiązanie:**

```bash
# Sprawdź błędy builda
docker build -t phrase-follower:local . 2>&1 | tee build.log

# Sprawdź czy wszystkie pliki są na miejscu
ls -la
```

### Problem: Kontener się crashuje

**Rozwiązanie:**

```bash
# Sprawdź logi
docker compose logs

# Uruchom w trybie interaktywnym (jeśli używasz docker run)
docker run -it --env-file .env phrase-follower:local sh
# W kontenerze:
node dist/server/entry.mjs
```

## Szybka checklista

- [ ] Obraz zbudowany: `docker build -t phrase-follower:local .`
- [ ] `.env` utworzony z wszystkimi zmiennymi
- [ ] Kontener uruchomiony: `docker compose up`
- [ ] Logi pokazują: `Server listening on http://0.0.0.0:3000`
- [ ] `curl http://localhost:3000` zwraca HTML
- [ ] Logowanie działa w przeglądarce

## Po pomyślnym teście lokalnym

Jeśli wszystko działa lokalnie:

1. Commit i push zmian
2. GitHub Actions zbuduje obraz i wypchnie do GHCR
3. Na droplecie: `docker compose pull && docker compose up -d`

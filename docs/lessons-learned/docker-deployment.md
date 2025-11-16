# Lessons Learned: Docker Deployment z Astro + Node.js

## 1. Zmienne środowiskowe w Astro z Node adapterem

**Problem:** `import.meta.env` nie jest automatycznie mapowane do `process.env` w runtime Node.js.

**Rozwiązanie:** Zawsze dodawaj fallback do `process.env` dla zmiennych używanych w runtime:

```typescript
const value = import.meta.env.VAR || (typeof process !== "undefined" && process.env.VAR);
```

**Kiedy:** Wszystkie miejsca, gdzie używasz `import.meta.env` w kodzie serwerowym (API endpoints, middleware, utils).

---

## 2. PUBLIC\_\* zmienne muszą być dostępne podczas builda

**Problem:** Zmienne z prefixem `PUBLIC_` są wstawiane do kodu klienta podczas builda Astro, nie w runtime.

**Rozwiązanie:** Przekazuj `PUBLIC_*` zmienne jako build args w Dockerfile i GitHub Actions:

```dockerfile
ARG PUBLIC_SUPABASE_URL
ENV PUBLIC_SUPABASE_URL=${PUBLIC_SUPABASE_URL}
```

**Kiedy:** Zawsze gdy używasz `PUBLIC_*` zmiennych w kodzie klienta (React components, client-side code).

---

## 3. Server host configuration w Docker

**Problem:** Domyślnie Astro nasłuchuje tylko na `localhost` (127.0.0.1), co uniemożliwia dostęp z zewnątrz kontenera.

**Rozwiązanie:** Ustaw `host: true` w `astro.config.mjs`:

```javascript
server: { port: 3000, host: true } // Nasłuchuje na 0.0.0.0
```

**Kiedy:** Zawsze gdy deployujesz w Dockerze lub innym kontenerze.

---

## 4. crypto.randomUUID() w bundle'owanym kodzie

**Problem:** `crypto.randomUUID()` może nie działać w bundle'owanym kodzie (Alpine Linux, różne środowiska).

**Rozwiązanie:** W kodzie serwerowym (API endpoints) używaj bezpośrednio `import { randomUUID } from "node:crypto"`. W komponentach klienta (React) używaj helper function `generateUUID()` z fallbackami.

**Kiedy:** Zawsze gdy używasz UUID w kodzie - rozdziel implementację dla server-side i client-side.

---

## 5. GitHub Actions permissions dla GHCR

**Problem:** `GITHUB_TOKEN` nie ma domyślnie uprawnień do tworzenia pakietów w organizacji.

**Rozwiązanie:** Dodaj `permissions: { packages: write }` do joba, który pushuje do GHCR.

**Kiedy:** Zawsze gdy używasz GitHub Container Registry (GHCR) w GitHub Actions.

---

## 6. Secrets vs Environment Variables w GitHub Actions

**Problem:** Nie można używać `secrets` bezpośrednio w warunku `if` na poziomie joba.

**Rozwiązanie:** Sprawdzaj secret w pierwszym stepie i ustaw output, potem używaj `if: steps.check.outputs.enabled == 'true'` w kolejnych stepach.

**Kiedy:** Gdy chcesz warunkowo uruchamiać job na podstawie secret.

---

## 7. Nginx jako reverse proxy (opcjonalne, ale zalecane)

**Problem:** Port 3000 może być zablokowany przez firewall lub nie być dostępny z zewnątrz.

**Rozwiązanie:** Użyj nginx jako reverse proxy na porcie 80 (zwykle otwarty) i przekieruj na `localhost:3000`.

**Kiedy:** Gdy aplikacja działa lokalnie w kontenerze, ale nie jest dostępna z zewnątrz.

---

## 8. Testowanie lokalnie przed deployem

**Problem:** Różnice między środowiskiem lokalnym a produkcyjnym (dev mode vs build, różne Node.js wersje).

**Rozwiązanie:** Zawsze testuj lokalnie z buildem produkcyjnym (`npm run build && npm run preview`) lub Dockerem przed deployem.

**Kiedy:** Zawsze przed pierwszym deployem i po większych zmianach w konfiguracji.

---

## 9. Docker multi-stage build dla Astro

**Problem:** Build Astro wymaga dev dependencies, ale runtime tylko production dependencies.

**Rozwiązanie:** Użyj multi-stage build - builder stage z wszystkimi deps, runner stage tylko z production deps.

**Kiedy:** Zawsze dla aplikacji Node.js/Astro w Dockerze - zmniejsza rozmiar obrazu i czas builda.

---

## 10. Environment variables w docker-compose.yml

**Problem:** Zmienne z `.env` nie są automatycznie dostępne w kontenerze.

**Rozwiązanie:** Użyj `${VAR_NAME}` w `docker-compose.yml` - docker-compose automatycznie czyta z `.env` w tym samym katalogu.

**Kiedy:** Zawsze gdy używasz docker-compose - upraszcza zarządzanie zmiennymi.

---

## Checklist przed deployem

- [ ] Wszystkie `import.meta.env` mają fallback do `process.env`
- [ ] `PUBLIC_*` zmienne są przekazywane jako build args
- [ ] `host: true` w astro.config.mjs
- [ ] W kodzie serwerowym używasz `randomUUID` z `node:crypto`, w komponentach klienta `generateUUID()` z utils
- [ ] Permissions w GitHub Actions ustawione
- [ ] Test lokalny z buildem produkcyjnym
- [ ] docker-compose.yml używa GHCR image (nie local)
- [ ] `.env` na droplecie ma wszystkie zmienne

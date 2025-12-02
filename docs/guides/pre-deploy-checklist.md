# Checklist przed deployem na DigitalOcean

## ✅ Weryfikacja konfiguracji

### 1. Dockerfile

- [x] Build args dla zmiennych środowiskowych (PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_KEY, etc.)
- [x] ENV ustawione dla builda
- [x] Port 3000 exposed
- [x] Server nasłuchuje na 0.0.0.0 (host: true w astro.config.mjs)

### 2. GitHub Actions (.github/workflows/master.yml)

- [x] Build args przekazywane do docker build
- [x] Secrets używane: PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_KEY, SUPABASE_URL, SUPABASE_KEY
- [x] Permissions: packages: write
- [x] Deploy przez SSH do dropleta
- [x] Obsługa deployu z branchy: `master`, `export-zip` (i innych po dodaniu do workflow)
- [x] Automatyczne tagowanie obrazów Docker według brancha (np. `ghcr.io/...:export-zip`)

### 3. docker-compose.yml

- [x] Image: ghcr.io/michal-duchnowski/10x-phrase-follower:latest (nie phrase-follower:local!)
- [x] Wszystkie zmienne środowiskowe zdefiniowane
- [x] Port 3000:3000

### 4. Kod źródłowy

- [x] supabase.client.ts - fallback do process.env
- [x] Wszystkie API endpoints - fallback do process.env
- [x] astro.config.mjs - host: true (nasłuchuje na 0.0.0.0)

### 5. Sekrety w GitHub

- [ ] PUBLIC_SUPABASE_URL
- [ ] PUBLIC_SUPABASE_KEY
- [ ] SUPABASE_URL
- [ ] SUPABASE_KEY
- [ ] SUPABASE_SERVICE_ROLE_KEY
- [ ] PHRASE_TTS_ENCRYPTION_KEY
- [ ] DROPLET_HOST
- [ ] DROPLET_USER
- [ ] DROPLET_SSH_KEY

### 6. Na droplecie

- [ ] Docker + docker-compose zainstalowane
- [ ] Katalog /opt/phrase-follower utworzony
- [ ] docker-compose.yml w /opt/phrase-follower/
- [ ] .env w /opt/phrase-follower/ z wszystkimi zmiennymi
- [ ] (Opcjonalnie) nginx skonfigurowany
- [ ] (Opcjonalnie) obraz ustawiony jako publiczny w GHCR

## 🚀 Gotowe do deployu!

Po commit i push na branch `master` lub `export-zip`:

1. GitHub Actions zbuduje obraz z build args
2. Wypchnie do GHCR z tagiem odpowiadającym branchowi (np. `ghcr.io/michal-duchnowski/10x-phrase-follower:export-zip`)
3. Zaktualizuje `.env` na droplecie z odpowiednim tagiem obrazu
4. Zdeployuje na droplet przez SSH (`docker compose pull && docker compose up -d`)

**Uwaga:** Workflow automatycznie aktualizuje `DOCKER_IMAGE` w pliku `.env` na droplecie, aby używał obrazu z odpowiednim tagiem brancha. Dla brancha `master` używa tagu `latest`, dla innych branchy używa nazwy brancha jako tagu.

Oto **krótkie, techniczne i jednoznaczne podsumowanie** całej naszej rozmowy — idealne do wklejenia do Cursor / Obsidian.

---

# ✅ **Migracja z Cloudflare → DigitalOcean Droplet (podsumowanie)**

## 1. **Powód migracji**

Cloudflare Workers/Pages mają twarde ograniczenia, które blokują Twój projekt:

- limit subrequestów (50 free / 1000 paid)
- limit CPU time (10–50 ms)
- limit rozmiaru odpowiedzi (10–25 MB)
- brak stabilności dla długich operacji (generowanie MP3, ZIP)
- cloudflare serverless nie nadaje się do batch jobs (np. 800 requestów do Google TTS w jednym flow)

Twój use-case wymaga:

- generowania dużej liczby MP3
- pobierania ich z Supabase
- pakowania ZIP
- wykonywania cięższych operacji w jednym jobie

➡️ **Cloudflare się do tego nie nadaje — niezależnie od konfiguracji.**

---

## 2. **Dlaczego DigitalOcean Droplet jest lepszy**

Droplet = pełny Linux (Ubuntu) → zero limitów serverless.

Co dostajesz:

- normalny Node.js / Docker / docker-compose
- brak limitów CPU time
- brak limitów subrequestów
- brak limitów na długość trwania requestu
- możesz robić: generowanie MP3, ZIP, batch processing
- 100% kontrolę nad środowiskiem wykonawczym
- bezpieczne przechowywanie sekretów (env vars)
- możliwość dodania własnej domeny lub jednego z tanich rozszerzeń

Najmniejsza moc wystarcza:

- **Droplet 1 vCPU / 1–2 GB RAM za 6–12 USD/mies.**

---

## 3. **Docelowa architektura po migracji**

### Frontend:

- może pozostać na Cloudflare Pages / Netlify / Vercel
- lub też możesz hostować go w tym samym droplecie

### Backend (nowy):

- uruchamiasz na droplecie jako Docker container
- port 3000 (backend API)
- reverse proxy przez nginx + HTTPS (Let’s Encrypt)

### Operacje wymagające mocy:

- generowanie audio przez Google TTS
- upload do Supabase
- pobieranie plików z Supabase
- tworzenie ZIP
  ➡️ wykonywane po stronie dropleta **bez limitów**.

---

## 4. **Sekrety**

‼️ **NIE zapisujesz sekretów w obrazie Docker.**

Zamiast tego:

- sekrety przekazujesz jako ENV w docker-compose
- albo jako zmienne globalne w `/etc/environment`

Przykład:

```yaml
environment:
  SUPABASE_URL: ...
  SUPABASE_KEY: ...
  GOOGLE_TTS_KEY: ...
```

---

## 5. **Domena**

Opcje:

1. **Kup domenę w DigitalOcean** – najprostsza i najczystsza opcja.
   Koszt: ~1 USD/rok (np. `.xyz`, `.site`)
   Dostajesz:
   - stabilny URL
   - automatyczne DNS
   - Let’s Encrypt certyfikaty

2. Wskazujesz domenę na IP dropleta:

```
api.twoja-domena.xyz → 167.x.x.x
```

3. Konfigurujesz nginx:

```nginx
server {
    server_name api.twoja-domena.xyz;
    location / {
        proxy_pass http://localhost:3000;
    }
}
```

4. Uruchamiasz SSL:

```
sudo certbot --nginx -d api.twoja-domena.xyz
```

---

## 6. **Deployment workflow**

### Build & push Docker image przez GitHub Actions:

- build Dockerfile
- push to DO Registry albo GitHub Container Registry

### Na droplecie:

- docker-compose pull
- docker-compose up -d

Lub automatyzacja:

- GH Actions SSH deploy
- Webhooks DO API

---

## 7. **Dlaczego ta architektura jest stabilna**

Po migracji:

- backend nie padnie przy 800 requestach do Google TTS
- ZIP-y dowolnego rozmiaru działają
- generowanie audio działa synchronicznie lub asynchronicznie
- brak ukrytych limitów serverless
- całkowita przewidywalność środowiska
- plan kosztowy niski (6–12 USD/mies.)

---

## 8. **Rejestr obrazów: GitHub Container Registry (GHCR)**

Masz dwie opcje trzymania obrazów Docker:

1. **DigitalOcean Container Registry (DOCR)** – registry od DO
2. **GitHub Container Registry (GHCR)** – registry pod `ghcr.io/...`

### 8.1. Porównanie DOCR vs GHCR

- **DOCR (DigitalOcean Container Registry)**:
  - wszystko w jednym ekosystemie DO (droplet + registry),
  - bardzo blisko sieciowo do dropleta,
  - ale to **osobny, płatny zasób** (płacisz za storage i transfer),
  - dodatkowa konfiguracja po stronie DO (tokeny, `doctl` itp.).
- **GHCR (GitHub Container Registry)**:
  - świetna integracja z **GitHub Actions** – build → push → deploy w jednym miejscu,
  - w typowym małym projekcie praktycznie **bez dodatkowych kosztów** poza tym, co już masz w GitHubie,
  - nie trzeba konfigurować dodatkowych usług w DigitalOcean,
  - droplet po prostu robi `docker pull ghcr.io/...` (z tokenem, jeśli obraz prywatny).

### 8.2. Decyzja projektowa

- **Wybrany wariant**: **GitHub Container Registry (GHCR)**.
- Powód:
  - minimalizacja kosztów i ilości usług,
  - prosty pipeline w GitHub Actions,
  - sekrety CI/CD trzymasz w jednym miejscu (GitHub Secrets).

---

## 9. **Domena i HTTPS na droplecie**

Docelowo kupujesz domenę w **DigitalOcean** i kierujesz ją na IP dropleta:

- np. `api.twoja-domena.xyz → 167.x.x.x`

Domena w DO:

- upraszcza konfigurację DNS,
- daje stabilny URL do API,
- ale **nie zastępuje HTTPS** na droplecie.

### 9.1. HTTPS (TLS) na droplecie

Przy architekturze „droplet + nginx”:

- nadal potrzebujesz **certyfikatu TLS**, żeby mieć `https://...`,
- najprościej użyć **Let’s Encrypt + certbot**:

```bash
sudo certbot --nginx -d api.twoja-domena.xyz
```

To:

- generuje darmowy certyfikat TLS,
- automatycznie podłącza go do konfiguracji nginx,
- ogarnia też automatyczne odświeżanie certyfikatu.

Jeśli kiedyś przejdziesz na **DigitalOcean Load Balancer** albo **App Platform**, możesz korzystać z ich managed certów, ale w aktualnym podejściu (czysty droplet) **Let’s Encrypt jest nadal potrzebny**.

---

## 10. **Plan CI/CD z GitHub Actions + GHCR + droplet**

Docelowy pipeline:

1. Push na `master` → odpala się CI:
   - format (`npm run format:check`),
   - lint (`npm run lint`),
   - test (`npm run test:run`),
   - build (`npm run build` z adapterem Node).
2. Po zielonym buildzie:
   - GitHub Actions buduje obraz Dockera,
   - taguje go np.:
     - `ghcr.io/<user>/<repo>:latest`
     - `ghcr.io/<user>/<repo>:<github.sha>`
   - pushuje obraz do GHCR.
3. GitHub Actions łączy się przez **SSH** z dropletem i robi:
   - `cd /opt/phrase-follower` (katalog z `docker-compose.yml`),
   - `docker compose pull` (ściąga nowy obraz),
   - `docker compose up -d` (restartuje kontener na nowej wersji).

### 10.1. Sekrety w GitHub Actions

W GitHub Secrets trzymasz m.in.:

- `GHCR_USERNAME` / `GHCR_TOKEN` – dostęp do GHCR (jeśli obraz prywatny),
- `DROPLET_HOST` – IP albo hostname dropleta,
- `DROPLET_USER` – użytkownik SSH (np. `root` lub dedykowany user),
- `DROPLET_SSH_KEY` – prywatny klucz SSH (PEM) do logowania z GitHub Actions,
- produkcyjne envy:
  - `PUBLIC_SUPABASE_URL`
  - `PUBLIC_SUPABASE_KEY`
  - `SUPABASE_URL`
  - `SUPABASE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `PHRASE_TTS_ENCRYPTION_KEY`

Sekrety produkcyjne możesz:

- trzymać tylko na droplecie (`.env` + `docker-compose.yml`) – wtedy GitHub ich nie musi znać,
- albo w GitHub Secrets i generować z nich `.env` przy deployu (bardziej zautomatyzowane, ale też bardziej złożone).

---

## 11. **Checklist: kolejne kroki wdrożenia**

### 11.1. Kroki w repozytorium

- **Dockerfile**:
  - dodać `Dockerfile` dla produkcji (Astro Node adapter, `output: "server"`, port 3000),
  - zapewnić `npm ci` + `npm run build` w obrazie.
- **docker-compose.yml**:
  - dodać plik (np. w repo lub jako przykład), który odpala kontener z obrazu z GHCR,
  - zdefiniować zmienne środowiskowe dla Supabase i TTS.
- **CI**:
  - dodać nowy workflow lub job w `master.yml`:
    - build Dockera,
    - push do GHCR,
    - deploy na droplet przez SSH.
- **Cloudflare**:
  - wyłączyć lub odłączyć job `deploy_cloudflare_pages`, kiedy będziesz gotowy całkowicie przejść na droplet.

### 11.2. Kroki na droplecie

- zainstalować Docker + docker-compose,
- przygotować katalog na appkę, np. `/opt/phrase-follower`,
- umieścić tam `docker-compose.yml` (lub zaciągać go przez `git pull`),
- skonfigurować nginx (reverse proxy na `localhost:3000`),
- wygenerować certyfikat Let’s Encrypt przez `certbot --nginx`,
- ręcznie przetestować `docker compose pull && docker compose up -d`.

### 11.3. Ostatni etap

- zapiąć pipeline GitHub Actions (push → GHCR → deploy),
- przetestować deploy (`workflow_dispatch`),
- potwierdzić, że produkcyjne scenariusze (TTS, ZIP, batch import) działają z dropleta,
- na końcu całkowicie wyłączyć Cloudflare z flow produkcyjnego.

---

# 🎯 **Finalny wniosek**

Migracja z Cloudflare Pages/Workers → DigitalOcean Droplet to **najbardziej rozsądne rozwiązanie** dla Twojego projektu wykorzystującego:

- generowanie wielu MP3,
- uploady,
- batch processing,
- ZIP,
- cięższe operacje JS/Node.

Droplet eliminuje wszystkie problemy Cloudflare, daje pełną kontrolę i minimalny DevOps.

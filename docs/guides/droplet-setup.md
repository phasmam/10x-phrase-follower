# Setup DigitalOcean Droplet - Przed pierwszym deployem

## Checklist: Co trzeba zrobić na droplecie przed uruchomieniem GitHub Actions

### 1. Zainstaluj Docker + docker-compose

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install docker-compose (plugin)
apt install docker-compose-plugin -y

# Verify installation
docker --version
docker compose version
```

### 2. Przygotuj katalog aplikacji

```bash
mkdir -p /opt/phrase-follower
cd /opt/phrase-follower
```

### 3. Skopiuj docker-compose.yml

Możesz to zrobić na kilka sposobów:

**Opcja A: Bezpośrednio z repo (jeśli masz dostęp przez git)**

```bash
cd /opt/phrase-follower
git clone https://github.com/phasmam/10x-phrase-follower.git .
# lub tylko docker-compose.yml:
curl -o docker-compose.yml https://raw.githubusercontent.com/phasmam/10x-phrase-follower/master/docker-compose.yml
```

**Opcja B: Ręcznie przez WinSCP/SSH**

- Skopiuj `docker-compose.yml` z repo do `/opt/phrase-follower/`

### 4. Stwórz plik .env z sekretami produkcyjnymi

```bash
cd /opt/phrase-follower
nano .env
```

Wklej następujące zmienne (wartości z GitHub Secrets lub z Twojego środowiska):

```env
# Docker image (opcjonalne - fallback w docker-compose.yml działa)
DOCKER_IMAGE=ghcr.io/phasmam/10x-phrase-follower:latest

# Supabase
SUPABASE_URL=twoja_supabase_url
SUPABASE_KEY=twoj_supabase_key
SUPABASE_SERVICE_ROLE_KEY=twoj_service_role_key
PUBLIC_SUPABASE_URL=twoja_public_supabase_url
PUBLIC_SUPABASE_KEY=twoj_public_supabase_key

# TTS Encryption
PHRASE_TTS_ENCRYPTION_KEY=twoj_64_znakowy_hex_key
```

Zapisz: `CTRL+O, Enter, CTRL+X`

**Ważne:** Ustaw odpowiednie uprawnienia:

```bash
chmod 600 .env
```

### 5. (Opcjonalnie) Zaloguj się do GitHub Container Registry (GHCR)

**WAŻNE:** Najprostsze rozwiązanie to ustawić obraz jako **publiczny** w GitHub — wtedy ten krok możesz **pominąć**.

#### Opcja A: Ustaw obraz jako publiczny (ZALECANE) ✅

Po pierwszym pushu obrazu przez GitHub Actions:

1. Idź do: `https://github.com/phasmam/10x-phrase-follower/pkgs/container/10x-phrase-follower`
2. Kliknij na obraz (np. `latest`)
3. Kliknij **"Package settings"** (po prawej stronie)
4. Przewiń w dół do sekcji **"Danger Zone"**
5. Kliknij **"Change visibility"** → wybierz **"Public"**
6. Potwierdź

Teraz droplet może pobrać obraz **bez logowania** — możesz pominąć Opcję B.

#### Opcja B: Zostaw obraz prywatny i zaloguj się na droplecie

Jeśli chcesz zostawić obraz prywatny, musisz się zalogować na droplecie:

```bash
# 1. Wygeneruj Personal Access Token w GitHub:
#    Settings → Developer settings → Personal access tokens → Tokens (classic)
#    Scope: read:packages (tylko do odczytu obrazów)

# 2. Zaloguj się na droplecie:
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u phasmam --password-stdin

# 3. (Opcjonalnie) Zapisz token w pliku, żeby nie wygasał po restarcie:
#    Możesz użyć docker-credential-helper lub po prostu ponownie się zalogować przy każdym deployu
```

**Rekomendacja:** Użyj Opcji A (publiczny obraz) — prostsze i nie wymaga zarządzania tokenami.

### 6. (Opcjonalnie) Skonfiguruj nginx + HTTPS

Jeśli chcesz mieć HTTPS i własną domenę:

```bash
# Install nginx
apt install nginx -y

# Install certbot
apt install certbot python3-certbot-nginx -y

# Configure nginx
nano /etc/nginx/sites-available/phrase-follower
```

Wklej konfigurację nginx:

```nginx
server {
    listen 80;
    server_name api.twoja-domena.xyz;  # lub IP dropleta

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Aktywuj konfigurację:

```bash
ln -s /etc/nginx/sites-available/phrase-follower /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# Jeśli masz domenę, wygeneruj certyfikat:
certbot --nginx -d api.twoja-domena.xyz
```

### 7. Przetestuj ręcznie (opcjonalnie)

Przed pierwszym deployem z GitHub Actions możesz przetestować ręcznie:

```bash
cd /opt/phrase-follower

# Pull image
docker compose pull

# Start container
docker compose up -d

# Check logs
docker compose logs -f

# Check status
docker compose ps
```

Jeśli wszystko działa, możesz zatrzymać:

```bash
docker compose down
```

---

## Podsumowanie - co jest wymagane przed pierwszym deployem

✅ **Wymagane:**

1. Docker + docker-compose zainstalowane
2. Katalog `/opt/phrase-follower` utworzony
3. `docker-compose.yml` w `/opt/phrase-follower/`
4. `.env` z sekretami w `/opt/phrase-follower/`
5. (Jeśli obraz prywatny) Zalogowanie do GHCR

⏭️ **Opcjonalne (można zrobić później):**

- nginx + HTTPS
- Domena

---

## Po pierwszym deployem z GitHub Actions

GitHub Actions automatycznie:

1. Zbuduje obraz Dockera
2. Wypchnie do GHCR
3. Połączy się przez SSH z dropletem
4. Wykona: `cd /opt/phrase-follower && docker compose pull && docker compose up -d`

**Uwaga:** Upewnij się, że:

- Sekrety w GitHub (`DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`) są ustawione
- SSH key jest dodany do `authorized_keys` na droplecie
- `.env` na droplecie ma wszystkie potrzebne zmienne

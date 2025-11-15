# Troubleshooting DigitalOcean Droplet Deployment

## Problem: Pipeline przeszedł, ale aplikacja nie działa na IP

### Krok 1: Sprawdź status kontenera Dockera

Połącz się przez SSH z dropletem:

```bash
ssh -i C:\Users\TwojUser\.ssh\deploy-phrase-follower root@IP_DROPLETA
```

Sprawdź czy kontener działa:

```bash
cd /opt/phrase-follower
docker compose ps
```

**Oczekiwany wynik:**

```
NAME                IMAGE                                          STATUS
phrase-follower     ghcr.io/phasmam/10x-phrase-follower:latest    Up X seconds/minutes
```

**Jeśli kontener nie działa:**

- Sprawdź logi: `docker compose logs`
- Sprawdź ostatnie logi: `docker compose logs --tail=50`

### Krok 2: Sprawdź logi kontenera

```bash
cd /opt/phrase-follower
docker compose logs -f
```

**Co szukać:**

- Błędy startowe
- Błędy połączenia z Supabase
- Błędy związane z brakującymi zmiennymi środowiskowymi
- Port już zajęty

**Typowe błędy:**

- `Error: Missing SUPABASE_URL` → brakuje zmiennych w `.env`
- `EADDRINUSE: address already in use :::3000` → port 3000 zajęty
- `Error connecting to database` → problem z Supabase credentials

### Krok 3: Sprawdź czy port 3000 jest otwarty

**Sprawdź czy aplikacja nasłuchuje lokalnie:**

```bash
# Sprawdź czy coś nasłuchuje na porcie 3000
netstat -tlnp | grep 3000
# lub
ss -tlnp | grep 3000
```

**Sprawdź firewall (ufw):**

```bash
# Sprawdź status firewalla
ufw status

# Jeśli firewall jest aktywny, otwórz port 3000
ufw allow 3000/tcp
ufw reload
```

**Sprawdź DigitalOcean Firewall (jeśli używasz):**

- DigitalOcean Dashboard → Networking → Firewalls
- Upewnij się, że port 3000 (lub 80/443) jest otwarty

### Krok 4: Sprawdź czy docker-compose.yml i .env są na miejscu

```bash
cd /opt/phrase-follower
ls -la
```

**Powinieneś zobaczyć:**

- `docker-compose.yml`
- `.env` (z uprawnieniami 600)

**Jeśli brakuje plików:**

```bash
# Skopiuj docker-compose.yml (jeśli brakuje)
curl -o docker-compose.yml https://raw.githubusercontent.com/phasmam/10x-phrase-follower/master/docker-compose.yml

# Stwórz .env (jeśli brakuje)
nano .env
# Wklej wszystkie zmienne środowiskowe
chmod 600 .env
```

### Krok 5: Sprawdź czy obraz został pobrany

```bash
docker images | grep phrase-follower
```

**Jeśli obrazu nie ma:**

```bash
cd /opt/phrase-follower
docker compose pull
docker compose up -d
```

### Krok 6: Test lokalny na droplecie

```bash
# Sprawdź czy aplikacja odpowiada lokalnie
curl http://localhost:3000

# Lub z zewnątrz (z dropleta)
curl http://IP_DROPLETA:3000
```

**Jeśli `curl localhost:3000` działa, ale z zewnątrz nie:**

- Problem z firewallem lub port forwarding
- Użyj nginx jako reverse proxy (patrz Krok 7)

### Krok 7: (Opcjonalnie) Skonfiguruj nginx jako reverse proxy

Jeśli aplikacja działa na `localhost:3000`, ale nie z zewnątrz, użyj nginx:

```bash
# Install nginx
apt install nginx -y

# Create nginx config
nano /etc/nginx/sites-available/phrase-follower
```

Wklej:

```nginx
server {
    listen 80;
    server_name IP_DROPLETA;  # lub twoja domena

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

Aktywuj:

```bash
ln -s /etc/nginx/sites-available/phrase-follower /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default  # usuń domyślną konfigurację
nginx -t
systemctl reload nginx
```

Teraz aplikacja powinna być dostępna na porcie 80 (http://IP_DROPLETA).

### Krok 8: Sprawdź czy kontener się restartuje

```bash
docker compose ps
```

**Jeśli status to "Restarting" lub "Exited":**

- Kontener się crashuje
- Sprawdź logi: `docker compose logs --tail=100`
- Sprawdź `.env` - może brakuje zmiennych

### Krok 9: Ręczne uruchomienie kontenera (debug)

```bash
cd /opt/phrase-follower

# Zatrzymaj kontener
docker compose down

# Uruchom w trybie foreground (zobaczysz logi)
docker compose up
```

**Ctrl+C** żeby zatrzymać, potem:

```bash
# Uruchom w tle
docker compose up -d
```

---

## Szybka checklista diagnostyczna

```bash
# 1. Status kontenera
cd /opt/phrase-follower && docker compose ps

# 2. Logi
docker compose logs --tail=50

# 3. Port lokalnie
curl http://localhost:3000

# 4. Port zewnętrznie
curl http://IP_DROPLETA:3000

# 5. Firewall
ufw status

# 6. Pliki
ls -la /opt/phrase-follower/

# 7. Obraz
docker images | grep phrase-follower
```

---

## Najczęstsze problemy i rozwiązania

### Problem: Kontener się nie uruchamia

**Rozwiązanie:** Sprawdź logi, sprawdź `.env`, sprawdź czy wszystkie zmienne są ustawione

### Problem: Port 3000 nie odpowiada

**Rozwiązanie:** Sprawdź firewall, użyj nginx jako reverse proxy

### Problem: Błąd "Missing environment variable"

**Rozwiązanie:** Sprawdź `.env` - wszystkie zmienne muszą być ustawione

### Problem: Błąd połączenia z Supabase

**Rozwiązanie:** Sprawdź `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` w `.env`

### Problem: Obraz nie został pobrany

**Rozwiązanie:** `docker compose pull` - upewnij się że obraz jest publiczny w GHCR

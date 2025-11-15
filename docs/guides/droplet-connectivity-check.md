# Checklist: Dlaczego serwer nie jest widoczny z zewnątrz

## Krok 1: Sprawdź czy kontener działa

```bash
cd /opt/phrase-follower
docker compose ps
```

**Oczekiwany wynik:**

```
NAME                STATUS
phrase-follower     Up X minutes
```

**Jeśli kontener nie działa:**

```bash
docker compose logs --tail=50
```

---

## Krok 2: Sprawdź czy aplikacja odpowiada lokalnie na droplecie

```bash
# Test lokalny
curl http://localhost:3000

# Lub z IP dropleta (z dropleta)
curl http://IP_DROPLETA:3000
```

**Oczekiwany wynik:** HTML odpowiedź (nie błąd połączenia)

**Jeśli nie działa:**

- Sprawdź logi: `docker compose logs -f`
- Sprawdź czy port 3000 jest zajęty: `netstat -tlnp | grep 3000`

---

## Krok 3: Sprawdź czy port 3000 nasłuchuje

```bash
# Sprawdź czy coś nasłuchuje na porcie 3000
netstat -tlnp | grep 3000
# lub
ss -tlnp | grep 3000
```

**Oczekiwany wynik:**

```
tcp  0  0  0.0.0.0:3000  0.0.0.0:*  LISTEN  PID/program
```

**Jeśli nie ma:**

- Kontener może się crashować
- Sprawdź logi: `docker compose logs`

---

## Krok 4: Sprawdź firewall na droplecie (ufw)

```bash
# Sprawdź status
ufw status

# Jeśli firewall jest aktywny, otwórz port 3000
ufw allow 3000/tcp
ufw reload

# Sprawdź ponownie
ufw status
```

**Jeśli firewall był wyłączony, ale teraz go włączyłeś:**

- Port 3000 powinien być teraz dostępny

---

## Krok 5: Sprawdź DigitalOcean Firewall (jeśli używasz)

1. Idź do: DigitalOcean Dashboard → Networking → Firewalls
2. Sprawdź czy masz aktywny firewall przypisany do dropleta
3. Jeśli tak, upewnij się że port 3000 (lub 80/443) jest otwarty

**Jeśli używasz DO Firewall:**

- Dodaj regułę: Inbound → TCP → Port 3000 → Allow

---

## Krok 6: Test z zewnątrz (z Twojego komputera)

```powershell
# PowerShell (Windows)
Invoke-WebRequest -Uri "http://IP_DROPLETA:3000" -UseBasicParsing
```

**Jeśli działa:**

- Problem rozwiązany! ✅

**Jeśli nie działa:**

- Przejdź do Kroku 7 (nginx reverse proxy)

---

## Krok 7: Skonfiguruj nginx jako reverse proxy (ZALECANE)

Jeśli aplikacja działa lokalnie (`curl localhost:3000` działa), ale nie z zewnątrz, użyj nginx:

```bash
# Install nginx
apt update
apt install nginx -y

# Stwórz konfigurację
nano /etc/nginx/sites-available/phrase-follower
```

Wklej (zamień `IP_DROPLETA` na rzeczywiste IP):

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

Zapisz: `CTRL+O`, `Enter`, `CTRL+X`

```bash
# Aktywuj konfigurację
ln -s /etc/nginx/sites-available/phrase-follower /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default  # usuń domyślną konfigurację

# Test konfiguracji
nginx -t

# Jeśli test OK, przeładuj nginx
systemctl reload nginx

# Sprawdź status
systemctl status nginx
```

**Teraz aplikacja powinna być dostępna na porcie 80:**

```powershell
Invoke-WebRequest -Uri "http://IP_DROPLETA" -UseBasicParsing
```

---

## Krok 8: (Opcjonalnie) HTTPS z Let's Encrypt

Jeśli masz domenę wskazującą na IP dropleta:

```bash
# Install certbot
apt install certbot python3-certbot-nginx -y

# Wygeneruj certyfikat
certbot --nginx -d twoja-domena.xyz

# Certbot automatycznie zaktualizuje konfigurację nginx
```

---

## Szybka checklista diagnostyczna

Wykonaj wszystkie te komendy i sprawdź wyniki:

```bash
# 1. Status kontenera
cd /opt/phrase-follower && docker compose ps

# 2. Logi kontenera
docker compose logs --tail=20

# 3. Test lokalny
curl http://localhost:3000

# 4. Port nasłuchuje?
netstat -tlnp | grep 3000

# 5. Firewall
ufw status

# 6. Nginx (jeśli zainstalowany)
systemctl status nginx
nginx -t
```

---

## Najczęstsze problemy

### Problem: Kontener działa, ale `curl localhost:3000` nie działa

**Rozwiązanie:** Sprawdź logi - aplikacja może się crashować przy starcie

### Problem: `curl localhost:3000` działa, ale z zewnątrz nie

**Rozwiązanie:**

1. Sprawdź firewall (ufw i DO Firewall)
2. Użyj nginx jako reverse proxy (port 80 jest zwykle otwarty)

### Problem: Port 3000 nie nasłuchuje

**Rozwiązanie:** Kontener może się restartować - sprawdź logi

### Problem: Błąd "Connection refused" z zewnątrz

**Rozwiązanie:** Firewall blokuje port - otwórz port 3000 lub użyj nginx na porcie 80

# Lessons Learned: Konfiguracja domeny i SSL w Digital Ocean

## ⚠️ Ważne: Digital Ocean NIE oferuje rejestracji domen

**Kluczowy wniosek:** Digital Ocean **nie rejestruje domen** — tylko zarządza DNS dla już zarejestrowanych domen.

### Co to oznacza:

1. **Musisz najpierw zarejestrować domenę u zewnętrznego rejestratora:**
   - Namecheap (popularny, częste promocje)
   - Cloudflare Registrar (najtańsze ceny, bez marży)
   - GoDaddy
   - Hover
   - Porkbun

2. **Następnie dodajesz domenę do Digital Ocean** do zarządzania DNS:
   - DigitalOcean Dashboard → Networking → Domains → "Add Domain"
   - To jest **darmowe** — tylko zarządzanie DNS

3. **Zmieniasz nameservery w rejestratorze** na Digital Ocean:
   ```
   ns1.digitalocean.com
   ns2.digitalocean.com
   ns3.digitalocean.com
   ```

---

## 🔍 Rozwiązywanie problemów DNS

### Problem: NXDOMAIN (domena nie istnieje w DNS)

**Objawy:**

```bash
dig example.com +short
# Zwraca: (puste) lub błąd NXDOMAIN
```

**Przyczyny:**

1. Nameservery w rejestratorze nie wskazują na Digital Ocean
2. Rekordy DNS w Digital Ocean nie są ustawione
3. DNS jeszcze się nie propagował (za wcześnie)

**Rozwiązanie:**

1. Sprawdź nameservery w rejestratorze (Namecheap/Cloudflare/etc.)
2. Ustaw na Digital Ocean nameservery
3. W Digital Ocean: Networking → Domains → dodaj rekordy A:
   - `@` → IP dropleta
   - `www` → IP dropleta
4. Poczekaj na propagację (15 min - 4 godziny, czasem do 48h)

### Problem: DNS wskazuje na złe IP (parking page)

**Objawy:**

```bash
dig example.com +short
# Zwraca: 192.0.2.1 (parking page rejestratora)
# Zamiast: 192.168.1.100 (IP dropleta)
```

**Przyczyna:** Nameservery w rejestratorze nie są ustawione na Digital Ocean, lub rekordy DNS w Digital Ocean wskazują na złe IP.

**Rozwiązanie:**

1. Sprawdź nameservery w rejestratorze
2. Zmień na Digital Ocean nameservery
3. Sprawdź rekordy A w Digital Ocean — powinny wskazywać na IP dropleta
4. Sprawdź IP dropleta: `curl -4 ifconfig.me` lub `hostname -I`

### Sprawdzanie propagacji DNS

**Użyj zewnętrznego DNS resolvera** (Google 8.8.8.8) zamiast lokalnego:

```bash
# Na serwerze
dig @8.8.8.8 example.com +short
dig @8.8.8.8 www.example.com +short

# Powinno zwrócić IP dropleta (np. 192.168.1.100)
```

**Online tools:**

- https://www.whatsmydns.net/#A/example.com
- Sprawdza propagację DNS na całym świecie

---

## 🔒 Konfiguracja Let's Encrypt (certbot)

### Problem: Certbot nie może zweryfikować domeny

**Błąd:**

```
Domain: example.com
Type:   unauthorized
Detail: Invalid response from http://example.com/.well-known/acme-challenge/...
```

**Przyczyny:**

1. DNS wskazuje na złe IP (nie na Twój droplet)
2. Nginx przekierowuje HTTP na HTTPS przed uzyskaniem certyfikatu
3. Port 80 nie jest otwarty w firewall
4. Nginx nie nasłuchuje na porcie 80

**Rozwiązanie:**

1. **Upewnij się, że DNS wskazuje na poprawne IP:**

   ```bash
   dig @8.8.8.8 example.com +short
   # Powinno zwrócić IP dropleta
   ```

2. **Tymczasowo usuń przekierowanie HTTP → HTTPS** z konfiguracji nginx:

   ```nginx
   server {
       listen 80;
       server_name example.com www.example.com;

       # Tymczasowo - proxy do aplikacji (przed uzyskaniem certyfikatu)
       location / {
           proxy_pass http://localhost:3000;
           # ... reszta proxy settings
       }
   }
   ```

3. **Lub użyj standalone mode:**

   ```bash
   sudo systemctl stop nginx
   sudo certbot certonly --standalone -d example.com -d www.example.com
   sudo systemctl start nginx
   ```

4. **Sprawdź firewall:**
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

### Problem: Certbot uzyskał certyfikat, ale nie może go zainstalować

**Błąd:**

```
Could not automatically find a matching server block for example.com.
Set the `server_name` directive to use the Nginx installer.
```

**Przyczyna:** Konfiguracja nginx używa IP zamiast domeny w `server_name`.

**Rozwiązanie:**

1. Zmień `server_name` w konfiguracji nginx:

   ```nginx
   # ❌ Złe
   server_name 192.168.1.100;

   # ✅ Dobre
   server_name example.com www.example.com;
   ```

2. Zaktualizuj ścieżki certyfikatów na Let's Encrypt:

   ```nginx
   ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
   ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
   ```

3. Dodaj blok HTTP z przekierowaniem na HTTPS:
   ```nginx
   server {
       listen 80;
       server_name example.com www.example.com;
       return 301 https://$server_name$request_uri;
   }
   ```

---

## 📝 Poprawna konfiguracja nginx dla Let's Encrypt

### Pełna konfiguracja (po uzyskaniu certyfikatu):

```nginx
# HTTP - przekierowanie na HTTPS
server {
    listen 80;
    server_name example.com www.example.com;

    # Przekieruj wszystkie żądania HTTP na HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    server_name example.com www.example.com;

    # Let's Encrypt certificates
    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Logs
    access_log /var/log/nginx/example-access.log;
    error_log /var/log/nginx/example-error.log;

    # Proxy settings
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';

        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # Cache bypass
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Ważne punkty:

1. **`server_name` musi używać domeny, nie IP** — certbot potrzebuje tego do automatycznej instalacji
2. **Certyfikaty Let's Encrypt** są w `/etc/letsencrypt/live/DOMENA/`
3. **Automatyczne odnawianie** — certbot tworzy timer, który odnawia certyfikaty automatycznie (ważne 90 dni)

---

## 🛠️ Przydatne komendy

### Sprawdzanie DNS:

```bash
# Zewnętrzny DNS resolver (Google)
dig @8.8.8.8 example.com +short

# Lokalny DNS resolver
nslookup example.com

# Sprawdź IP dropleta
curl -4 ifconfig.me
hostname -I
```

### Sprawdzanie nginx:

```bash
# Test konfiguracji
sudo nginx -t

# Przeładuj konfigurację
sudo systemctl reload nginx

# Status nginx
sudo systemctl status nginx

# Sprawdź czy nasłuchuje na portach
sudo netstat -tlnp | grep -E ':(80|443)'
sudo ss -tlnp | grep -E ':(80|443)'
```

### Certbot:

```bash
# Uzyskaj certyfikat
sudo certbot --nginx -d example.com -d www.example.com

# Tylko certyfikat (bez automatycznej konfiguracji nginx)
sudo certbot certonly --nginx -d example.com -d www.example.com

# Standalone mode (wymaga zatrzymania nginx)
sudo systemctl stop nginx
sudo certbot certonly --standalone -d example.com -d www.example.com
sudo systemctl start nginx

# Zainstaluj certyfikat (jeśli został uzyskany, ale nie zainstalowany)
sudo certbot install --cert-name example.com

# Sprawdź status automatycznego odnawiania
sudo systemctl status certbot.timer

# Test odnawiania (bez faktycznego odnawiania)
sudo certbot renew --dry-run
```

### Firewall:

```bash
# Sprawdź status
sudo ufw status

# Otwórz porty HTTP i HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Lub użyj profilu nginx
sudo ufw allow 'Nginx Full'
```

---

## 📋 Checklist konfiguracji domeny i SSL

### 1. Rejestracja domeny:

- [ ] Zarejestrowano domenę u zewnętrznego rejestratora (Namecheap/Cloudflare/etc.)
- [ ] Domena jest aktywna i opłacona

### 2. Konfiguracja DNS w Digital Ocean:

- [ ] Domena dodana w Digital Ocean (Networking → Domains → "Add Domain")
- [ ] Rekord A dla `@` wskazuje na IP dropleta
- [ ] Rekord A dla `www` wskazuje na IP dropleta

### 3. Nameservery w rejestratorze:

- [ ] Nameservery zmienione na Digital Ocean:
  - `ns1.digitalocean.com`
  - `ns2.digitalocean.com`
  - `ns3.digitalocean.com`
- [ ] Poczekano na propagację (sprawdź: `dig @8.8.8.8 domena.xyz +short`)

### 4. Nginx:

- [ ] Nginx zainstalowany (`apt install nginx -y`)
- [ ] Konfiguracja używa domeny w `server_name` (nie IP)
- [ ] Port 80 otwarty w firewall
- [ ] Nginx działa (`systemctl status nginx`)

### 5. Certbot:

- [ ] Certbot zainstalowany (`apt install certbot python3-certbot-nginx -y`)
- [ ] Certyfikat uzyskany (`certbot --nginx -d example.com`)
- [ ] Certyfikat zainstalowany (certbot automatycznie lub ręcznie)
- [ ] Automatyczne odnawianie działa (`systemctl status certbot.timer`)

### 6. Testowanie:

- [ ] HTTP przekierowuje na HTTPS
- [ ] HTTPS działa bez błędów w przeglądarce
- [ ] Certyfikat jest zaufany (zielona kłódka)
- [ ] Aplikacja działa pod HTTPS

---

## 💡 Najczęstsze błędy i jak ich unikać

1. **"DNS problem: NXDOMAIN"**
   - ✅ Sprawdź nameservery w rejestratorze
   - ✅ Sprawdź rekordy DNS w Digital Ocean
   - ✅ Poczekaj na propagację DNS

2. **"Invalid response from http://..."**
   - ✅ Upewnij się, że DNS wskazuje na poprawne IP
   - ✅ Sprawdź czy port 80 jest otwarty
   - ✅ Tymczasowo usuń przekierowanie HTTP → HTTPS

3. **"Could not automatically find a matching server block"**
   - ✅ Użyj domeny w `server_name`, nie IP
   - ✅ Upewnij się, że `server_name` pasuje do domeny w certbot

4. **Certyfikat uzyskany, ale nginx używa self-signed**
   - ✅ Zaktualizuj ścieżki certyfikatów w nginx na Let's Encrypt
   - ✅ Sprawdź czy certyfikat istnieje: `ls -la /etc/letsencrypt/live/example.com/`

---

## 🎯 Podsumowanie procesu

1. **Zarejestruj domenę** u zewnętrznego rejestratora (Namecheap/Cloudflare)
2. **Dodaj domenę do Digital Ocean** (Networking → Domains → "Add Domain")
3. **Skonfiguruj rekordy DNS** w Digital Ocean (rekordy A dla `@` i `www`)
4. **Zmień nameservery** w rejestratorze na Digital Ocean
5. **Poczekaj na propagację DNS** (sprawdzaj: `dig @8.8.8.8 example.com +short`)
6. **Skonfiguruj nginx** z domeną w `server_name` (nie IP)
7. **Uzyskaj certyfikat** (`certbot --nginx -d example.com`)
8. **Sprawdź działanie** — otwórz `https://example.com` w przeglądarce

---

## 📚 Przydatne linki

- [Digital Ocean DNS Documentation](https://docs.digitalocean.com/products/networking/dns/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Certbot Documentation](https://certbot.eff.org/)
- [Nginx Documentation](https://nginx.org/en/docs/)

---

**Data utworzenia:** 2025-01-15  
**Kontekst:** Konfiguracja domeny z Let's Encrypt SSL na Digital Ocean Droplet

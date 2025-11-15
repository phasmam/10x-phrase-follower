Super — to idziemy najprostszą i **najbardziej poprawną** drogą:

- **wygenerujesz klucz SSH na Windows**,
- **zainstalujesz go na droplecie**,
- **użyjesz go jednocześnie dla GitHub Actions (DROPLET_SSH_KEY)** i dla **WinSCP / PuTTY**.

Czyli jedno źródło → dwie korzyści.

---

# ✔️ Krok 1 — wygeneruj klucz SSH w Windows

### Otwórz PowerShell (jako zwykły użytkownik, nie admin) i wpisz:

```powershell
ssh-keygen -t ed25519 -C "deploy-phrase-follower"
```

Dostaniesz pytania:

```
Enter file in which to save the key (C:\Users\TwojUser/.ssh/id_ed25519):
```

Wpisz:

```
C:\Users\TwojUser\.ssh\deploy-phrase-follower
```

(żeby klucz miał konkretną nazwę, nie nadpisujesz innych kluczy)

Potem: **Enter** (bez passphrase → wygodniejsze dla CI/CD)

Powstają dwa pliki:

```
C:\Users\TwojUser\.ssh\deploy-phrase-follower        ← PRYWATNY
C:\Users\TwojUser\.ssh\deploy-phrase-follower.pub    ← PUBLICZNY
```

---

# ✔️ Krok 2 — dodaj publiczny klucz na dropleta

Ponieważ łączysz się tylko przez web console, to:

1. Otwórz DigitalOcean → Droplet → **Access → Console**
2. W konsoli (jako root):

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
```

3. Otwórz lokalnie:

```
C:\Users\TwojUser\.ssh\deploy-phrase-follower.pub
```

Skopiuj całą zawartość (coś jak):

```
ssh-ed25519 AAAAC3... deploy-phrase-follower
```

4. Wklej to do `authorized_keys` w nano → **CTRL+O, Enter, CTRL+X**
5. Nadaj prawa:

```bash
chmod 600 ~/.ssh/authorized_keys
```

Gotowe — droplet będzie akceptował Twój klucz.

---

# ✔️ Krok 3 — przetestuj połączenie z Windows (terminal):

W PowerShell:

```powershell
ssh -i C:\Users\TwojUser\.ssh\deploy-phrase-follower root@IP_DROPLETA
```

Jeśli wejdziesz — wszystko jest OK.

---

# ✔️ Krok 4 — użycie w WinSCP

WinSCP potrzebuje **formatu PPK**, więc zrobisz:

1. Otwórz **PuTTYgen**
2. Kliknij **Load**
3. Wybierz:

```
C:\Users\TwojUser\.ssh\deploy-phrase-follower
```

4. PuTTYgen powie, że to OpenSSH format — OK.
5. Kliknij **Save private key** → zapisz jako:

```
deploy-phrase-follower.ppk
```

6. W WinSCP:
   - Host: IP dropleta
   - User: `root`
   - Private key file: `deploy-phrase-follower.ppk`

Teraz WinSCP działa.

---

# ✔️ Krok 5 — użycie w GitHub Secrets (`DROPLET_SSH_KEY`)

Otwórz:

```
C:\Users\TwojUser\.ssh\deploy-phrase-follower
```

To jest **PRYWATNY** klucz.

Skopiuj CAŁOŚĆ:

```
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

I wklej do GitHub Secrets → `DROPLET_SSH_KEY`.

⚠️ **Nie używaj wersji .ppk — GitHub potrzebuje OpenSSH, nie PuTTY.**

---

# ✔️ Podsumowanie

### Na Windows masz 3 pliki:

| plik                           | użycie                                    |
| ------------------------------ | ----------------------------------------- |
| **deploy-phrase-follower**     | → GitHub `DROPLET_SSH_KEY` + SSH terminal |
| **deploy-phrase-follower.pub** | → droplet (`authorized_keys`)             |
| **deploy-phrase-follower.ppk** | → WinSCP                                  |

### Sekrety do GitHub Actions

```
DROPLET_HOST = IP dropleta
DROPLET_USER = root
DROPLET_SSH_KEY = zawartość pliku deploy-phrase-follower (bez .pub)
```

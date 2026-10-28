# Salon tattoo Laura · demo web s rezervacemi

Kompletní mobilní web s galerií, veřejným kalendářem termínů, formulářem s obrázkovou přílohou a soukromým administračním panelem. **Žádné závislosti npm** – běží přímo na Node.js 20+.

## Nasazení GitHub → Render

1. Rozbal ZIP, nahraj **obsah** balíčku do kořene nového GitHub repozitáře (`server.mjs`, `package.json`, `public/`, `render.yaml`).
2. Na [render.com](https://render.com) klikni **New → Web Service** (ne Static Site; ta neumí API pro rezervace).
3. Propoj repozitář, nastav runtime **Node**, `Build Command`: `npm install`, `Start Command`: `npm start`. Na obrazovce Web Service **není pole Publish Directory**.
4. V **Environment** nastav `ADMIN_PASSWORD` na vlastní bezpečné heslo a `SESSION_SECRET` na dlouhý náhodný tajný klíč; nastav také `NODE_ENV=production`. **Heslo nikdy neukládej do GitHubu.**
5. Po deployi otevři `/` a `/admin.html`. Pro health monitor použij `/health`.

Lze použít i `render.yaml` pro Blueprint, který požádá o administrátorské heslo a vygeneruje tajný klíč.

### Adresy

| Adresa | Funkce |
|---|---|
| `/` | veřejný web, galerie a rezervace |
| `/admin.html` | přihlášení, rezervace, blokace, galerie, kontakty, provozní doba |
| `/health` | zdravotní kontrola monitoru |

### Co funguje v demu

- Veřejný kalendář pracuje s aktuálním dnem, pracovními dny, otevírací dobou a obsazenými intervaly.
- Návštěvník zvolí datum, začátek, předpokládanou délku 1–4 hodiny a odešle žádost s JPG/PNG/WebP do 2 MB.
- Žádosti mají stav **Čeká**, **Potvrzeno**, **K domluvě** nebo **Zamítnuto**. Rezervace nepřekryje potvrzenou zakázku. Současné nové žádosti na stejný čas jsou možné, protože čekající žádost **není** potvrzená rezervace.
- Laura může vložit vlastní zakázku/volno od–do, zobrazit přílohu jen po přihlášení, upravit galerii, otevřené dny, provozní dobu, texty i kontakty a barevnou variantu.
- E-mail zákaznici po potvrzení i upozornění pro Lauru: po konfiguraci **Resend API** (`RESEND_API_KEY`, `EMAIL_FROM`, e-mail salonu v administraci). Bez konfigurace zůstává notifikace **vypnutá** a systém to přiznává.
- Poskytnuté fotografie a vizualizace jsou označeny podle původu. Ilustrativní náhledy **nejsou vydávány za skutečně realizované tetování**.

### Zásadní omezení demo režimu

**Toto není bezpečné dlouhodobé ukládání klientských dat.** Server ukládá vše do `data/demo.json` na **dočasný disk Renderu**, včetně base64 fotografií a příloh. Po restartu, novém nasazení či uspání může dojít ke ztrátě údajů, fotografií i rezervací. V produkci musí být rezervační údaje ve skutečné databázi, přílohy v neveřejném úložišti, nastaveny retenční lhůty, zálohy, dostatečná ochrana osobních údajů a dokončeny GDPR informace.

Health monitor přes [UptimeRobot](https://uptimerobot.com) kontroluje `/health` třeba každých 5 minut podle dostupného tarifu; **nezaručí** trvalý běh nebo přežití dat.

### Nastavení e-mailů (volitelné)

Přidej v Render Environment:

```env
RESEND_API_KEY=re_....
EMAIL_FROM=Salon tattoo Laura <rezervace@overena-domena.cz>
```

Zkontroluj ověření odesílací domény u Resend. V admin nastavení ulož e-mail příjemce nových rezervací. Bez těchto proměnných web odpověď nefalšuje, žádný e-mail neodešle.

### Lokální spuštění

```bash
npm start
```

Otevři `http://localhost:3000` a `http://localhost:3000/admin.html`. Pro přihlášení před startem nastav `ADMIN_PASSWORD` a `SESSION_SECRET`.

Testy: `npm test`.

### Struktura projektu

```text
server.mjs            REST API, statické soubory, ověřování, rezervace, e-mailová integrace
package.json
render.yaml
public/
  index.html           veřejný web
  style.css
  app.js
  admin.html           administrace
  admin.css
  admin.js
  assets/              fotografie / ilustrace
 data/                 lokální testovací JSON (automaticky, v .gitignore)
tests/e2e.test.mjs     testy HTTP scénářů
```

### Budoucí migrace

Backend soustřeďuje úložiště v `loadState` / `save` a referencích `db`; pro produkci nahradit rezervace a blokace atomickými operacemi v MongoDB a soubory za neveřejné storage / Cloudinary. Úpravy není bezpečné provádět jen přesměrováním `DATA_FILE` – je nutná migrace, kontrola souběhu, zálohování a nastavení přístupových práv.

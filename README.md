# ProScouter backend

A real Node.js backend for the two-section ProScouter tool:

1. **Email Finder** — crawls up to 10,000 store URLs (homepage, then contact / privacy /
   checkout pages) and extracts contact emails.
2. **Verify & Reach** — checks up to 10,000 emails for valid syntax, a real DNS MX record,
   disposable domains, role-based addresses, and duplicates, then lets you export the clean
   list. Includes a client-side content scanner for spam-trigger words before you send.

The whole thing sits behind a single password — nobody can open the dashboard or call the
API without logging in first.

---

## 1. Install

```bash
cd proscouter-backend
npm install
```

## 2. Set your password

Passwords are never stored in plain text. Generate a hash:

```bash
npm run set-password -- "yourStrongPassword"
```

This prints a line like:

```
ADMIN_PASSWORD_HASH=$2a$10$abcd1234...
```

Copy `.env.example` to `.env`, then paste that line in:

```bash
cp .env.example .env
```

Also set `SESSION_SECRET` to a random string (this signs the login cookie):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output as `SESSION_SECRET` in `.env`.

## 3. Run it

```bash
npm start
```

Visit **http://localhost:3000** — you'll land on the login page first. Enter the password
you set in step 2 and you're into the dashboard.

To change the password later, just re-run `npm run set-password` with a new password and
update `.env`, then restart the server.

---

## How access control works

- `/login` and `POST /login` are the only routes anyone can reach without a session.
- Every other route — the dashboard page itself, and every `/api/...` endpoint — is behind
  `requireAuth` middleware (`lib/auth.js`). No password, no access, no matter which URL is
  hit directly.
- The session is a signed, `httpOnly` cookie, so it can't be read or forged from JavaScript
  in the browser. It expires after 8 hours of inactivity.
- There's a `Log out` button in the dashboard header, and `POST /logout` to end the session
  from anywhere.

This is single-password access (one shared login for whoever you give the password to) —
enough for a personal tool or a small team. If you later need separate logins per team
member with different permissions, that's a bigger change (a users table + per-user
sessions) — say the word if you want that built out.

---

## Deploying so you can reach it from anywhere

Any Node host works. Two easy options:

**Render / Railway (simplest)**
1. Push this folder to a GitHub repo.
2. Create a new Web Service pointing at the repo, build command `npm install`, start
   command `npm start`.
3. Add `SESSION_SECRET`, `ADMIN_PASSWORD_HASH`, and `NODE_ENV=production` as environment
   variables in the host's dashboard (don't commit `.env` — it's already git-ignored).
4. Add a **persistent disk** mounted at `/data` if the platform offers one, and change
   `DATA_DIR` in `lib/store.js` to point there — otherwise job history is wiped on every
   redeploy (a fresh crawl still works fine either way, you'd just lose old results).
5. Deploy. You'll get an HTTPS URL like `https://proscouter.onrender.com` — that's what you
   share/bookmark. The login page is what gates it.

**Your own VPS (DigitalOcean, etc.)**
1. `git clone` the repo onto the server, `npm install`, set up `.env`.
2. Run it behind a process manager so it restarts on crash/reboot: `pm2 start server.js`.
3. Put Nginx or Caddy in front for HTTPS (Caddy does this automatically with a domain
   name — just point a domain's DNS at the server and run `caddy reverse-proxy --to
   localhost:3000`).

Either way: **always run behind HTTPS in production** — set `NODE_ENV=production` so the
session cookie requires it. Without HTTPS, the password and session cookie travel in
plain text.

---

## What's real vs. what needs a paid add-on

| Feature | Status |
|---|---|
| URL/email input, 10,000 cap, CSV upload | Real |
| Crawling homepage + contact/privacy/checkout pages | Real (axios + cheerio) |
| Email extraction (mailto: links + regex) | Real |
| Concurrent crawling (15 sites at once) | Real |
| Syntax validation | Real |
| MX record lookup (domain can receive mail) | Real (Node's `dns` module) |
| Disposable domain / role-based / duplicate detection | Real |
| Excel / CSV export | Real (streamed from the server) |
| Password-protected access | Real |
| Content spam-trigger scanner | Real, runs in the browser |
| **Exact mailbox exists** (not just the domain) | Not included — wire in [ZeroBounce](https://www.zerobounce.net), [NeverBounce](https://neverbounce.com), or [Kickbox](https://kickbox.com); swap their API call into `lib/verify.js`'s `classifyEmail` |
| **True inbox-vs-spam placement** | Not included — this needs a seed-mailbox network; [GlockApps](https://glockapps.com) or [Mail-Tester](https://www.mail-tester.com) sell API access to real results. The in-app score is a content heuristic, not a lab test |
| Auto-rephrase with AI | Intentionally shows "Coming soon" — not built yet |
| Sending the emails | Not included — once verified, send through an ESP with a warmed-up domain (SendGrid, Mailgun, Amazon SES); sending cold from a brand-new domain will get flagged regardless of list quality |

---

## Project structure

```
proscouter-backend/
├── server.js          — routes, auth wiring, starts the app
├── lib/
│   ├── auth.js         — password check + requireAuth middleware
│   ├── store.js        — job storage (in-memory + JSON files on disk)
│   ├── limiter.js       — small concurrency limiter for the crawler
│   ├── crawler.js       — Section 1: fetches sites, extracts emails
│   ├── verify.js        — Section 2: syntax/MX/disposable/duplicate checks
│   └── export.js        — builds the .xlsx / .csv downloads
├── public/
│   ├── login.html        — password screen
│   └── dashboard.html     — the two-section UI, talks to the API above
├── scripts/set-password.js — generates the bcrypt hash for .env
└── data/jobs/             — job results persisted as JSON (auto-created)
```

## A note on scraping etiquette

Pulling published contact emails off business websites for B2B outreach is standard
practice (it's what Hunter.io, Apollo, etc. do). Two things worth keeping in mind as you
scale this up:
- Respect a site's `robots.txt` if you extend the crawler further — the current version
  only reads pages, it doesn't check `robots.txt` yet.
- Once you're sending, follow CAN-SPAM/GDPR basics: a real sender identity, a working
  unsubscribe link, and honoring opt-outs. The content checker already flags a missing
  unsubscribe line.

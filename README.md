# SeatKo: ticketing management

A ticketing platform you can rent out to event organizers (bands, churches, schools, promoters). Each organizer gets its own workspace for events, seat maps, QR tickets and check-in, and you bill them per ticket, per event or monthly. It has a React web app and a separate REST API.

```
seatko/
├─ api/   Express + SQLite REST API (auth, events, seating, sales, QR, check-in)
└─ web/   React (Vite) admin app, ticket pages, gate scanner
```

## Running it as a business (multiple organizers)

There are two kinds of accounts:

- **SeatKo owner** (you): signs in to the *SeatKo platform* pages.
  - **Organizers**: create an organizer and its first admin account, set its billing terms, suspend or reactivate it, reset staff passwords, and **Open their workspace** to help them.
  - **Payments**: review the GCash or bank payments organizers submit (with screenshot), then confirm or reject them.
  - **Platform settings**: your GCash or bank details, shown to organizers.
- **Organizer staff** (admin, manager, cashier, scanner): see only their own organizer's events, tickets, users and settings. Organizer admins also get a **Billing** page with their plan, balance, charges and a *Submit a payment* form.

Billing terms are set per organizer, so each customer can have the deal you agreed on:

| Model | What gets charged |
|---|---|
| Free | Nothing |
| Per-ticket fee | A fixed amount per ticket and/or a percentage of sales, with an optional number of free tickets per event. Complimentary tickets are never billed. Refunds credit the fee back. |
| Monthly subscription | A fixed amount every month from the chosen start month |
| Per-event fee | A fixed amount once per event, when it first goes on sale |

You can also add one-off charges or credits (setup fees, discounts) and record payments you received directly. Suspending an organizer blocks their staff from signing in and hides their events from website embeds; tickets already sold keep working.

The owner account is created on first start. Set `OWNER_EMAIL` / `OWNER_PASSWORD` in `api/.env`, or leave the password empty and read the generated one from `api/data/owner-password.txt`. An install from before multi-organizer support is migrated automatically: all existing data becomes the first organizer.

## Features

- **Users and roles**: admin, manager, cashier and scanner, with JWT sign-in. Admins can create, edit, deactivate and reset passwords. The system keeps at least one active admin at all times.
- **Events**: create, edit, duplicate and delete events, and upload a poster. Status moves through draft → on sale → sold out (automatic) → closed or cancelled.
- **Pricing tiers**: reserved-seat or general-admission tiers, each with its own price, color and capacity. You can pause or resume a tier.
- **Seat maps**: sections are built as rows × seats. You can resize a section and choose its default tier. To select seats on the map, click, drag, or click a row letter. Selected seats can be **blocked or unblocked**, or **re-priced** to another tier.
- **Box office**: pick seats on the map and add GA quantities. Apply promo codes and choose the payment method (cash, GCash, Maya, bank, card, comp). Tickets are issued immediately. Double-selling is prevented inside a database transaction.
- **Tickets with QR codes**: each ticket has a unique code (`XXXX-XXXX-XXXX`). Its QR code uses high error correction and has the **logo in the center**. Tickets can be printed, downloaded as PNG, or shared through a public buyer link (`/t/CODE`).
- **Replaceable logo**: admins upload a new logo under *Branding & settings*, and every QR code and ticket picks it up straight away. You can also change the QR color, ticket accent, footer text and currency.
- **Check-in**: scan with the phone camera, a USB/Bluetooth scanner or manual entry. It gives instant valid / already-used / void / wrong-event feedback with a sound, plus a live count and recent scans. Managers can undo a check-in.
- **Orders**: search orders, view details and refund a whole order (tickets are voided and seats released). You can also void single tickets or rename the ticket holder.
- **Promo codes**: percent or fixed amount, with an optional usage limit and expiry.
- **Reports**: revenue per day, by tier, payment method and staff member, plus promo usage and attendance. The attendee list exports to CSV.
- **Activity log**: every sale, refund, void, check-in and settings change, with who made it and when.

## Getting started

Requires Node 20+.

```bash
npm install              # installs api + web (npm workspaces)
cp api/.env.example api/.env   # then set JWT_SECRET
npm run seed             # optional: demo organizer (POIMEN) with a concert + staff accounts
npm run dev              # API on :4000, web on :5173
```

Open http://localhost:5173 and sign in:

| Role    | Email                  | Password      |
|---------|------------------------|---------------|
| SeatKo owner | owner@seatko.local | `OWNER_PASSWORD`, or see `api/data/owner-password.txt` |
| Admin   | admin@seatko.local     | admin123 (from `.env`) |
| Manager | manager@seatko.local   | password123 (seed) |
| Cashier | cashier@seatko.local   | password123 (seed) |
| Scanner | scanner@seatko.local   | password123 (seed) |

**Change these passwords before real use.**

### Production

```bash
npm run build     # builds web/dist
NODE_ENV=production JWT_SECRET=... npm start   # API serves the built app on :4000
```

You can also host `web/dist` somewhere else. Build it with `VITE_API_URL=https://your-api.example.com` and add that site's origin to `CORS_ORIGIN` in the API.

The camera scanner needs **HTTPS** (or localhost) on phones.

### GitHub Pages (web app only)

`.github/workflows/pages.yml` builds `web/` and publishes it to `https://<user>.github.io/<repo>/` on every push to `main`. Pages hosts static files only, so the API must run elsewhere:

1. Deploy `api/` to a host with HTTPS and a persistent disk (Render, Railway, Fly.io, a VPS…). Set `CORS_ORIGIN=https://rsmatic.github.io` there.
2. In the GitHub repo, go to **Settings → Secrets and variables → Actions → Variables** and add `VITE_API_URL` = your API address (e.g. `https://seatko-api.onrender.com`).
3. Re-run the **Deploy web app to GitHub Pages** workflow.

For the website embed, add `data-app-url="https://rsmatic.github.io/seatko"` so "View my ticket" opens the Pages app.

### Current deployment

- **Web app:** https://rsmatic.github.io/seatko/ (GitHub Pages, `VITE_API_URL` repo variable)
- **API:** https://seatko.54-227-48-13.sslip.io, the `seatko-api` Docker container on the shared EC2 host. It sits behind orderko's Caddy via `~/eaglemark/caddy/seatko.caddy`. Data is in the `seatko_seatko-data` volume.

To update the API after pushing to `main`:

```bash
ssh -i rsmatic.pem ec2-user@54.227.48.13
cd ~/seatko && git pull && sudo docker compose -f deploy/docker-compose.yml up -d --build
```

Back up the database with `sudo docker cp seatko-api:/app/api/data ./seatko-backup`.

## Show tickets on an organizer's website

The API serves an embed script that shows live prices, "X left" / sold-out status, a buy button and a "View my ticket" lookup on any website. For example, add it to the `#concert` section of the POIMEN site:

```html
<div data-seatko-event="1"
     data-buy-url="https://m.me/Poimenph"
     data-buy-label="Get tickets">
  <!-- fallback shown if the API can't be reached -->
  <p class="concert-note">Venue and ticket details will be announced soon.</p>
</div>
<script src="https://YOUR-SEATKO-HOST/embed.js" defer></script>
```

- `data-seatko-event` is the event ID. It's the number in the admin URL, e.g. `/events/1`.
- `data-buy-url` is where buyers go to purchase (Messenger, a form, etc.). Staff then sell the ticket at the box office and send the buyer their `/t/CODE` link.
- `data-app-url` is optional. Set it if the web app lives on a different host than the API, so "View my ticket" opens the right site.
- Only events that are on sale, sold out, closed or cancelled are public. Drafts stay hidden.
- The widget reuses the host page's `.btn` classes and CSS variables (`--accent`, `--display`, …).

Read-only JSON for building a custom layout: `GET /api/public/events` and `GET /api/public/events/:id`.

## Roles

| Capability | Admin | Manager | Cashier | Scanner |
|---|:-:|:-:|:-:|:-:|
| Users, branding/logo, activity log | ✓ | | | |
| Events, pricing, seat maps, promo codes, reports, refunds, voids, CSV | ✓ | ✓ | | |
| Complimentary tickets, exceed per-order limit | ✓ | ✓ | | |
| Sell tickets, view orders, rename holders | ✓ | ✓ | ✓ | |
| Check-in | ✓ | ✓ | | ✓ |

## API overview

All routes are under `/api`. Authenticated routes need `Authorization: Bearer <token>`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `GET /auth/me`, `POST /auth/password` |
| Users (admin) | `GET/POST /users`, `PATCH/DELETE /users/:id` |
| Settings | `GET /settings` (public), `PUT /settings`, `POST/DELETE /settings/logo` |
| Events | `GET/POST /events`, `GET/PATCH/DELETE /events/:id`, `POST /events/:id/duplicate`, `POST /events/:id/poster` |
| Tiers | `GET/POST /events/:id/tiers`, `PATCH/DELETE /events/:id/tiers/:tierId` |
| Seating | `GET /events/:id/seatmap`, `POST /events/:id/sections`, `PATCH/DELETE /events/:id/sections/:sid`, `POST /events/:id/seats/bulk` |
| Promo codes | `GET/POST /events/:id/promos`, `PATCH/DELETE /events/:id/promos/:pid` |
| Sales | `POST /events/:id/quote`, `POST /events/:id/orders`, `GET /events/:id/orders`, `GET /orders/:id`, `POST /orders/:id/refund` |
| Tickets | `GET /events/:id/tickets`, `GET /events/:id/tickets.csv`, `GET /tickets/:code`, `PATCH /tickets/:id`, `POST /tickets/:id/void`, `POST /tickets/:id/undo-checkin` |
| Check-in | `POST /checkin`, `GET /events/:id/checkins` |
| Reports | `GET /stats/overview`, `GET /events/:id/stats`, `GET /audit` |
| Public | `GET /public/tickets/:code`, `GET /public/qr/:code.svg`, `GET /public/qr-preview.svg` |

Money is stored as integer cents. The data lives in `api/data/seatko.db` (SQLite) and uploads in `api/uploads/`, so back up both folders.

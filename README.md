# MrKrishna Gateway

Node.js/Express UPI QR payment-link site with SQLite storage.

The `db.sqlite` file is created automatically when the server starts (and the `orders` table is initialized if missing). By default it is created beside `server.js`. If `DB_PATH` is set, it is created at that path; its parent directory is created automatically if needed. On Render, use a persistent disk path so the file survives redeploys.\n\n## Endpoints
- `GET /link?value=10`: create order and redirect to its unique `/pay/ORDER_ID` page.
- `GET /pay/ORDER_ID`: QR, amount, order ID, Check Payment button.
- `POST /api/check/ORDER_ID`: calls the gateway API, then stores the returned status locally.
- `GET /cheque?value=ORDER_ID`: reads SQLite only; it does not call the gateway.
- `GET /health`: health check.

## Environment variables
Set these in Render's Environment dashboard:
- `GATEWAY_API_KEY`: secret API key (never put it in frontend code).
- `UPI_ID`: receiving UPI ID.
- `UPI_PAYEE_NAME`: optional, defaults to MrKrishna Gateway.
- `DB_PATH=/var/data/db.sqlite`: required when persistent disk is mounted at `/var/data`.

## Deploy
1. Push these files to GitHub.
2. Create a Render web service from the repository.
3. Use `npm install` as build command and `npm start` as start command.
4. Attach a persistent disk mounted at `/var/data` and set `DB_PATH=/var/data/db.sqlite`.
5. Set `GATEWAY_API_KEY`, `UPI_ID`, and optionally `UPI_PAYEE_NAME` in Render environment settings.
6. Use Node 20 or newer.

## Local test
```sh
npm install
export GATEWAY_API_KEY='your-key'
export UPI_ID='your-upi-id@bank'
export DB_PATH='./db.sqlite'
npm start
```
Open `http://localhost:3000` or call `/link?value=10`.

## Notes
- QR contains order ID in `tn`, `tr`, and `tid`; UPI apps may handle/display these differently.
- Code expects gateway JSON with `status` equal to `success` or `failed`. Pending, invalid JSON, timeouts, and HTTP errors do not close the order. Confirm the real gateway response schema before production.
- The 15-minute cron runs only while this Node process is awake. It is not guaranteed during sleep/restarts; for reliable scheduling use an always-on instance or external scheduler.
- Render's free web service filesystem is ephemeral and persistent disks require a paid service. Do not deploy production payment records to ephemeral storage.
- Explicit gateway `failed` is treated as terminal. Confirm that this means final failure rather than a temporary state.
- Add rate limiting and protect link creation before public production use.

# Copilot Instructions - VietQR Payment System

## Architecture Overview

This is a **Next.js Pages Router** application for generating VietQR payment codes with real-time transaction confirmation via SePay webhook integration.

### Data Flow
1. **Frontend** ([pages/index.js](../pages/index.js)) → Fetches bank accounts from `/api/bankaccounts`
2. **Bank Selection** → User selects a bank (not specific account). Dropdown shows unique bank names only. Account is randomly selected and displayed immediately
3. **QR Generation** → Uses the pre-selected account, generates code with `SEVQR` prefix + 5 random chars, creates QR via `https://qr.sepay.vn/img`
4. **Polling** → Frontend polls `/api/check-transaction` every 3 seconds (30-min timeout)
5. **Webhook** → SePay POSTs to `/api/webhook` when payment received; matches by transaction content containing the SEVQR code

### Bank Selection Logic
- `uniqueBanks` - Extracts unique banks from all accounts by `bank_short_name`
- `filteredBanks` - Filters banks by search query
- `getRandomAccountForBank()` - Randomly selects an active account (`active === '1'`) when bank is selected (displayed below dropdown)

### Key Files
- [lib/transactions.js](../lib/transactions.js) - In-memory + JSON file persistence for transactions
- [pages/api/webhook.js](../pages/api/webhook.js) - Receives SePay webhook, validates API key via `Authorization: Apikey {key}` header
- [pages/api/check-transaction.js](../pages/api/check-transaction.js) - Polls for transaction confirmation by matching SEVQR code in content
- [data/transactions.json](../data/transactions.json) - Persistent transaction storage

## Development

```bash
npm install
npm run dev  # Starts on port 3000
```

**Environment**: Create `.env` with `SEPAY_API_KEY=your_key`

## Conventions

### Transaction Code Format
Codes are always `SEVQR` + 5 alphanumeric characters (e.g., `SEVQRE1JQF`). See `generateRandomCode()` in [pages/index.js](../pages/index.js#L79-L85).

### API Response Pattern
All API endpoints return `{ success: boolean, ...data }` or `{ error: string }`:
```javascript
// Success
return res.status(200).json({ success: true, confirmed: true, transaction: {...} })
// Error
return res.status(400).json({ success: false, error: 'Error message' })
```

### State Management
- Use React hooks (`useState`, `useEffect`, `useCallback`)
- Use `useRef` for timers/intervals to avoid stale closures
- Clean up intervals in `useEffect` return function

### Styling
- Single CSS file: [styles/globals.css](../styles/globals.css)
- CSS variables defined in `:root` (e.g., `--primary: #fe9738`)
- BEM-like naming: `.card__title`, `.qr-result__image`

## External Dependencies

### SePay API
- **Bank accounts**: `GET https://my.sepay.vn/userapi/bankaccounts/list` with Bearer token (cached 5 minutes server-side)
- **QR generation**: `https://qr.sepay.vn/img?acc={account}&bank={bank}&amount={amount}&des={code}`
- **Webhook auth**: SePay sends `Authorization: Apikey {SEPAY_API_KEY}` header

### Transaction Matching Logic
Webhook stores all transactions. Polling matches by:
1. `content` contains the SEVQR code (case-insensitive)
2. `transferType === 'in'` (incoming transfer)
3. `receivedAt` within last 30 minutes
4. Optional: `accountNumber` and `amount` match

## Production Deployment
Uses PM2 process manager with Nginx reverse proxy. See [README.md](../README.md) for VPS deployment steps.

# ATM System v2.0

A full-featured ATM simulation system for "National Bank" built with Node.js, Express, and SQLite.

## Features

- **Card & PIN Authentication** with auto-lock after 3 failed attempts
- **Multi-account support** — Savings and Current accounts with distinct business rules
- **Operations** — Balance inquiry, deposit, withdraw, transfer, PIN change, mini statement
- **ATM Cash Management** — Denomination tracking (Rs. 500/1000/5000), optimal change dispensing
- **Admin Panel** — ATM cash status, refill, browse customers/accounts/transactions
- **Three interfaces** — CLI, Web UI, and OOP demo
- **Session management** with 30-minute token expiry
- **Custom exception hierarchy** with 14+ typed exceptions

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Web Framework | Express.js |
| Database | SQLite (better-sqlite3) |
| Frontend | Vanilla HTML/CSS/JS |

## Getting Started

```bash
npm install
```

### Web Server

```bash
npm run server
```

Open [http://localhost:3000](http://localhost:3000)

### CLI

```bash
npm run cli
```

### OOP Demo (in-memory)

```bash
node main.js
```

## Demo Credentials

| Card Number | PIN | Linked Accounts |
|---|---|---|
| `4000000000000001` | `1234` | 10000001 (Savings), 10000002 (Current) |
| `4000000000000002` | `5678` | 10000003 (Savings) |
| `4000000000000003` | `9999` | 10000004 (Current) |

## Account Rules

| Rule | Savings | Current |
|---|---|---|
| Minimum Balance | Rs. 5,000 | None |
| Overdraft Limit | — | Rs. 50,000 |
| Withdrawal Fee | Rs. 50 | None |
| Transfer Fee | Rs. 100 | Rs. 50 |
| Max per Transaction | Rs. 50,000 | Rs. 100,000 |
| Daily Limit | Rs. 100,000 | Rs. 200,000 |

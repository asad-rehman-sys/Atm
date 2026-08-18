const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "atm.db");

let db;

function getDb() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma("journal_mode = WAL");
        db.pragma("foreign_keys = ON");
        initSchema();
    }
    return db;
}

function initSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS customers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS accounts (
            account_number TEXT PRIMARY KEY,
            holder_name TEXT NOT NULL,
            pin TEXT NOT NULL,
            balance REAL DEFAULT 0,
            account_type TEXT NOT NULL CHECK(account_type IN ('SAVINGS', 'CURRENT')),
            is_active INTEGER DEFAULT 1,
            daily_withdrawn REAL DEFAULT 0,
            daily_transferred REAL DEFAULT 0,
            last_activity_date TEXT,
            customer_id TEXT NOT NULL,
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        );

        CREATE TABLE IF NOT EXISTS cards (
            card_number TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL,
            pin TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            failed_attempts INTEGER DEFAULT 0,
            max_attempts INTEGER DEFAULT 3,
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        );

        CREATE TABLE IF NOT EXISTS card_accounts (
            card_number TEXT NOT NULL,
            account_number TEXT NOT NULL,
            PRIMARY KEY (card_number, account_number),
            FOREIGN KEY (card_number) REFERENCES cards(card_number),
            FOREIGN KEY (account_number) REFERENCES accounts(account_number)
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL CHECK(type IN ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER')),
            amount REAL NOT NULL,
            status TEXT DEFAULT 'PENDING',
            account_number TEXT NOT NULL,
            related_account_number TEXT,
            fee REAL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (account_number) REFERENCES accounts(account_number)
        );

        CREATE TABLE IF NOT EXISTS atm (
            id INTEGER PRIMARY KEY DEFAULT 1,
            name TEXT NOT NULL,
            location TEXT NOT NULL,
            cash_500 INTEGER DEFAULT 0,
            cash_1000 INTEGER DEFAULT 0,
            cash_5000 INTEGER DEFAULT 0
        );
    `);
}

// ─── Customer Queries ─────────────────────────────────────────
const customerQueries = {
    create: (id, name, email, phone) => {
        getDb().prepare(
            "INSERT INTO customers (id, name, email, phone) VALUES (?, ?, ?, ?)"
        ).run(id, name, email, phone);
    },
    getById: (id) => {
        return getDb().prepare("SELECT * FROM customers WHERE id = ?").get(id);
    },
    getAll: () => {
        return getDb().prepare("SELECT * FROM customers").all();
    },
};

// ─── Account Queries ──────────────────────────────────────────
const accountQueries = {
    create: (accountNumber, holderName, pin, accountType, customerId, balance = 0) => {
        const today = new Date().toDateString();
        getDb().prepare(
            `INSERT INTO accounts (account_number, holder_name, pin, balance, account_type, customer_id, last_activity_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(accountNumber, holderName, pin, balance, accountType, customerId, today);
    },
    getByNumber: (accountNumber) => {
        return getDb().prepare("SELECT * FROM accounts WHERE account_number = ?").get(accountNumber);
    },
    getAll: () => {
        return getDb().prepare("SELECT * FROM accounts").all();
    },
    updateBalance: (accountNumber, balance) => {
        getDb().prepare("UPDATE accounts SET balance = ? WHERE account_number = ?").run(balance, accountNumber);
    },
    updatePin: (accountNumber, pin) => {
        getDb().prepare("UPDATE accounts SET pin = ? WHERE account_number = ?").run(pin, accountNumber);
    },
    updateActive: (accountNumber, isActive) => {
        getDb().prepare("UPDATE accounts SET is_active = ? WHERE account_number = ?").run(isActive ? 1 : 0, accountNumber);
    },
    updateDaily: (accountNumber, dailyWithdrawn, dailyTransferred, lastActivityDate) => {
        getDb().prepare(
            "UPDATE accounts SET daily_withdrawn = ?, daily_transferred = ?, last_activity_date = ? WHERE account_number = ?"
        ).run(dailyWithdrawn, dailyTransferred, lastActivityDate, accountNumber);
    },
};

// ─── Card Queries ─────────────────────────────────────────────
const cardQueries = {
    create: (cardNumber, customerId, pin) => {
        getDb().prepare(
            "INSERT INTO cards (card_number, customer_id, pin) VALUES (?, ?, ?)"
        ).run(cardNumber, customerId, pin);
    },
    getByNumber: (cardNumber) => {
        return getDb().prepare("SELECT * FROM cards WHERE card_number = ?").get(cardNumber);
    },
    updateActive: (cardNumber, isActive) => {
        getDb().prepare("UPDATE cards SET is_active = ? WHERE card_number = ?").run(isActive ? 1 : 0, cardNumber);
    },
    updateFailedAttempts: (cardNumber, attempts) => {
        getDb().prepare("UPDATE cards SET failed_attempts = ? WHERE card_number = ?").run(attempts, cardNumber);
    },
    updatePin: (cardNumber, pin) => {
        getDb().prepare("UPDATE cards SET pin = ? WHERE card_number = ?").run(pin, cardNumber);
    },
};

// ─── Card-Account Link Queries ────────────────────────────────
const cardAccountQueries = {
    link: (cardNumber, accountNumber) => {
        getDb().prepare(
            "INSERT OR IGNORE INTO card_accounts (card_number, account_number) VALUES (?, ?)"
        ).run(cardNumber, accountNumber);
    },
    getLinkedAccounts: (cardNumber) => {
        return getDb().prepare(
            `SELECT a.* FROM accounts a
             JOIN card_accounts ca ON a.account_number = ca.account_number
             WHERE ca.card_number = ?`
        ).all(cardNumber);
    },
    isLinked: (cardNumber, accountNumber) => {
        const row = getDb().prepare(
            "SELECT 1 FROM card_accounts WHERE card_number = ? AND account_number = ?"
        ).get(cardNumber, accountNumber);
        return !!row;
    },
};

// ─── Transaction Queries ──────────────────────────────────────
const transactionQueries = {
    create: (transactionId, type, amount, status, accountNumber, relatedAccountNumber = null, fee = 0) => {
        getDb().prepare(
            `INSERT INTO transactions (transaction_id, type, amount, status, account_number, related_account_number, fee)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(transactionId, type, amount, status, accountNumber, relatedAccountNumber, fee);
    },
    getByAccount: (accountNumber, limit = 20) => {
        return getDb().prepare(
            "SELECT * FROM transactions WHERE account_number = ? ORDER BY created_at DESC LIMIT ?"
        ).all(accountNumber, limit);
    },
    getAll: () => {
        return getDb().prepare("SELECT * FROM transactions ORDER BY created_at DESC").all();
    },
};

// ─── ATM Queries ──────────────────────────────────────────────
const atmQueries = {
    get: () => {
        return getDb().prepare("SELECT * FROM atm WHERE id = 1").get();
    },
    updateCash: (cash500, cash1000, cash5000) => {
        const existing = getDb().prepare("SELECT * FROM atm WHERE id = 1").get();
        if (existing) {
            getDb().prepare(
                "UPDATE atm SET cash_500 = ?, cash_1000 = ?, cash_5000 = ? WHERE id = 1"
            ).run(cash500, cash1000, cash5000);
        } else {
            getDb().prepare(
                "INSERT INTO atm (id, name, location, cash_500, cash_1000, cash_5000) VALUES (1, 'ATM-001', 'Main Branch', ?, ?, ?)"
            ).run(cash500, cash1000, cash5000);
        }
    },
    init: (name, location, denominations) => {
        const existing = getDb().prepare("SELECT * FROM atm WHERE id = 1").get();
        if (!existing) {
            getDb().prepare(
                "INSERT INTO atm (id, name, location, cash_500, cash_1000, cash_5000) VALUES (1, ?, ?, ?, ?, ?)"
            ).run(name, location, denominations[500] || 0, denominations[1000] || 0, denominations[5000] || 0);
        }
    },
};

// ─── Seed Data ────────────────────────────────────────────────
function seedData() {
    const existing = customerQueries.getAll();
    if (existing.length > 0) return;

    console.log("[DB] Seeding demo data...");

    customerQueries.create("CUST-1001", "Ali Khan", "ali@email.com", "0301-1234567");
    customerQueries.create("CUST-1002", "Sara Malik", "sara@email.com", "0321-7654321");
    customerQueries.create("CUST-1003", "Ahmed Raza", "ahmed@email.com", "0333-9998877");

    accountQueries.create("10000001", "Ali Khan", "1234", "SAVINGS", "CUST-1001", 75000);
    accountQueries.create("10000002", "Ali Khan", "1234", "CURRENT", "CUST-1001", 150000);
    accountQueries.create("10000003", "Sara Malik", "5678", "SAVINGS", "CUST-1002", 50000);
    accountQueries.create("10000004", "Ahmed Raza", "9999", "CURRENT", "CUST-1003", 200000);

    cardQueries.create("4000000000000001", "CUST-1001", "1234");
    cardQueries.create("4000000000000002", "CUST-1002", "5678");
    cardQueries.create("4000000000000003", "CUST-1003", "9999");

    cardAccountQueries.link("4000000000000001", "10000001");
    cardAccountQueries.link("4000000000000001", "10000002");
    cardAccountQueries.link("4000000000000002", "10000003");
    cardAccountQueries.link("4000000000000003", "10000004");

    atmQueries.init("ATM-001", "Main Branch", { 500: 20, 1000: 30, 5000: 10 });

    // Seed some sample transactions
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    transactionQueries.create("TXN-9001", "DEPOSIT", 25000, "SUCCESS", "10000001", null, 0);
    transactionQueries.create("TXN-9002", "WITHDRAWAL", 10000, "SUCCESS", "10000001", null, 50);
    transactionQueries.create("TXN-9003", "TRANSFER", 5000, "SUCCESS", "10000001", "10000003", 100);
    transactionQueries.create("TXN-9004", "DEPOSIT", 15000, "SUCCESS", "10000003", null, 0);
    transactionQueries.create("TXN-9005", "WITHDRAWAL", 8000, "SUCCESS", "10000003", null, 50);

    console.log("[DB] Demo data seeded successfully.");
}

module.exports = {
    getDb,
    seedData,
    customerQueries,
    accountQueries,
    cardQueries,
    cardAccountQueries,
    transactionQueries,
    atmQueries,
};

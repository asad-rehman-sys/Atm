const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const {
    seedData,
    customerQueries,
    accountQueries,
    cardQueries,
    cardAccountQueries,
    transactionQueries,
    atmQueries,
} = require("./database");
const {
    ATMError,
    InvalidPINError,
    CardBlockedError,
    InsufficientBalanceError,
    InsufficientATMFundsError,
    InvalidAmountError,
    AccountInactiveError,
    DailyLimitExceededError,
    InvalidAccountError,
    SameAccountTransferError,
    MinimumBalanceError,
    DenominationError,
    OverdraftLimitExceededError,
} = require("./exceptions");
const { SavingsAccount, CurrentAccount } = require("./account");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "frontend")));

// ─── In-Memory Session Store ──────────────────────────────────
const sessions = new Map();

function createSession(cardNumber, customerId) {
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, {
        cardNumber,
        customerId,
        authenticated: false,
        selectedAccount: null,
        createdAt: Date.now(),
    });
    return token;
}

function getSession(token) {
    const session = sessions.get(token);
    if (!session) return null;
    if (Date.now() - session.createdAt > 30 * 60 * 1000) {
        sessions.delete(token);
        return null;
    }
    return session;
}

function destroySession(token) {
    sessions.delete(token);
}

// ─── Auth Middleware ───────────────────────────────────────────
function requireAuth(req, res, next) {
    const token = req.headers["x-session-token"];
    if (!token) {
        return res.status(401).json({ error: "No session token provided." });
    }
    const session = getSession(token);
    if (!session) {
        return res.status(401).json({ error: "Session expired. Please insert card again." });
    }
    if (!session.authenticated) {
        return res.status(401).json({ error: "Not authenticated." });
    }
    req.session = session;
    req.sessionToken = token;
    next();
}

// ─── Account Type Helpers ─────────────────────────────────────
function getAccountLimits(accountType) {
    if (accountType === "SAVINGS") {
        return {
            minBalance: SavingsAccount.MINIMUM_BALANCE,
            maxPerTxn: SavingsAccount.MAX_WITHDRAWAL_PER_TXN,
            dailyLimit: SavingsAccount.DAILY_WITHDRAWAL_LIMIT,
            minWithdrawal: SavingsAccount.MIN_WITHDRAWAL,
            withdrawalFee: 50,
            transferFee: 100,
            overdraftLimit: 0,
        };
    } else {
        return {
            minBalance: 0,
            maxPerTxn: CurrentAccount.MAX_WITHDRAWAL_PER_TXN,
            dailyLimit: CurrentAccount.DAILY_WITHDRAWAL_LIMIT,
            minWithdrawal: CurrentAccount.MIN_WITHDRAWAL,
            withdrawalFee: 0,
            transferFee: 50,
            overdraftLimit: CurrentAccount.OVERDRAFT_LIMIT,
        };
    }
}

function getAvailableForWithdrawal(account) {
    const limits = getAccountLimits(account.account_type);
    if (account.account_type === "SAVINGS") {
        return Math.max(0, account.balance - limits.minBalance);
    }
    return account.balance + limits.overdraftLimit;
}

// ─── ATM Cash Helpers ─────────────────────────────────────────
function getAtmCash() {
    const atm = atmQueries.get();
    if (!atm) return { 500: 0, 1000: 0, 5000: 0, total: 0 };
    const total = atm.cash_500 * 500 + atm.cash_1000 * 1000 + atm.cash_5000 * 5000;
    return { 500: atm.cash_500, 1000: atm.cash_1000, 5000: atm.cash_5000, total };
}

function dispenseCash(amount) {
    const atm = atmQueries.get();
    if (!atm) throw new InsufficientATMFundsError(0, amount);

    let remaining = amount;
    const dispensed = { 500: 0, 1000: 0, 5000: 0 };
    const notes = [5000, 1000, 500];
    const cash = { 500: atm.cash_500, 1000: atm.cash_1000, 5000: atm.cash_5000 };

    for (const note of notes) {
        const needed = Math.floor(remaining / note);
        const take = Math.min(needed, cash[note]);
        dispensed[note] = take;
        remaining -= take * note;
    }

    if (remaining > 0) throw new DenominationError();

    atmQueries.updateCash(
        cash[500] - dispensed[500],
        cash[1000] - dispensed[1000],
        cash[5000] - dispensed[5000]
    );

    return dispensed;
}

function resetDailyIfNeeded(account) {
    const today = new Date().toDateString();
    if (account.last_activity_date !== today) {
        accountQueries.updateDaily(account.account_number, 0, 0, today);
        account.daily_withdrawn = 0;
        account.daily_transferred = 0;
        account.last_activity_date = today;
    }
    return account;
}

// ─── Routes ───────────────────────────────────────────────────

// Health check
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Card Insertion ──
app.post("/api/card/insert", (req, res) => {
    try {
        const { cardNumber } = req.body;
        if (!cardNumber) {
            return res.status(400).json({ error: "Card number is required." });
        }

        const card = cardQueries.getByNumber(cardNumber);
        if (!card) {
            return res.status(404).json({ error: "Invalid card number." });
        }
        if (!card.is_active) {
            return res.status(403).json({ error: "Card is BLOCKED. Contact your bank.", blocked: true });
        }

        const token = createSession(cardNumber, card.customer_id);
        const linkedAccounts = cardAccountQueries.getLinkedAccounts(cardNumber);

        res.json({
            success: true,
            sessionToken: token,
            maskedCard: "****-****-****-" + cardNumber.slice(-4),
            linkedAccounts: linkedAccounts.map((a) => ({
                accountNumber: a.account_number,
                accountType: a.account_type,
                balance: a.balance,
                holderName: a.holder_name,
            })),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── PIN Validation ──
app.post("/api/card/pin", (req, res) => {
    try {
        const token = req.headers["x-session-token"];
        const session = getSession(token);
        if (!session) {
            return res.status(401).json({ error: "Session expired." });
        }

        const { pin } = req.body;
        if (!pin) {
            return res.status(400).json({ error: "PIN is required." });
        }

        const card = cardQueries.getByNumber(session.cardNumber);
        if (!card) {
            return res.status(404).json({ error: "Card not found." });
        }

        if (!card.is_active) {
            return res.status(403).json({ error: "Card is BLOCKED.", blocked: true });
        }

        if (String(pin) === card.pin) {
            cardQueries.updateFailedAttempts(card.card_number, 0);
            session.authenticated = true;
            return res.json({ success: true, message: "Authentication successful." });
        }

        const newAttempts = card.failed_attempts + 1;
        if (newAttempts >= card.max_attempts) {
            cardQueries.updateActive(card.card_number, false);
            cardQueries.updateFailedAttempts(card.card_number, 0);
            return res.json({
                success: false,
                blocked: true,
                message: "Card blocked after 3 failed attempts.",
            });
        }

        cardQueries.updateFailedAttempts(card.card_number, newAttempts);
        res.json({
            success: false,
            attemptsRemaining: card.max_attempts - newAttempts,
            message: `Invalid PIN. ${card.max_attempts - newAttempts} attempt(s) remaining.`,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Select Account ──
app.post("/api/account/select", requireAuth, (req, res) => {
    try {
        const { accountNumber } = req.body;
        const linked = cardAccountQueries.getLinkedAccounts(req.session.cardNumber);
        const account = linked.find((a) => a.account_number === accountNumber);
        if (!account) {
            return res.status(400).json({ error: "Account not linked to this card." });
        }
        req.session.selectedAccount = accountNumber;
        res.json({ success: true, message: `Account ${accountNumber} selected.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Check Balance ──
app.get("/api/account/balance", requireAuth, (req, res) => {
    try {
        const account = accountQueries.getByNumber(req.session.selectedAccount);
        if (!account) {
            return res.status(404).json({ error: "Account not found." });
        }
        if (!account.is_active) {
            return res.status(403).json({ error: "Account is inactive." });
        }

        const limits = getAccountLimits(account.account_type);
        const available = getAvailableForWithdrawal(account);

        res.json({
            accountNumber: account.account_number,
            accountType: account.account_type,
            holderName: account.holder_name,
            balance: account.balance,
            availableForWithdrawal: available,
            limits: {
                maxPerTxn: limits.maxPerTxn,
                dailyLimit: limits.dailyLimit,
                dailyWithdrawn: account.daily_withdrawn,
                dailyRemaining: limits.dailyLimit - account.daily_withdrawn,
                minBalance: limits.minBalance,
                overdraftLimit: limits.overdraftLimit,
            },
            fees: {
                withdrawalFee: limits.withdrawalFee,
                transferFee: limits.transferFee,
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Deposit ──
app.post("/api/account/deposit", requireAuth, (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || typeof amount !== "number" || amount <= 0) {
            return res.status(400).json({ error: "Deposit amount must be a positive number." });
        }

        const account = accountQueries.getByNumber(req.session.selectedAccount);
        if (!account) return res.status(404).json({ error: "Account not found." });
        if (!account.is_active) return res.status(403).json({ error: "Account is inactive." });

        const newBalance = account.balance + amount;
        accountQueries.updateBalance(account.account_number, newBalance);

        const txnId = `TXN-${Date.now()}`;
        transactionQueries.create(txnId, "DEPOSIT", amount, "SUCCESS", account.account_number);

        res.json({
            success: true,
            transactionId: txnId,
            amount,
            newBalance,
            accountNumber: account.account_number,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Withdraw ──
app.post("/api/account/withdraw", requireAuth, (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || typeof amount !== "number" || amount <= 0) {
            return res.status(400).json({ error: "Withdrawal amount must be a positive number." });
        }

        let account = accountQueries.getByNumber(req.session.selectedAccount);
        if (!account) return res.status(404).json({ error: "Account not found." });
        if (!account.is_active) return res.status(403).json({ error: "Account is inactive." });

        account = resetDailyIfNeeded(account);

        const limits = getAccountLimits(account.account_type);

        // Validate
        if (amount < limits.minWithdrawal) {
            return res.status(400).json({ error: `Minimum withdrawal is Rs. ${limits.minWithdrawal.toLocaleString("en-IN")}.` });
        }
        if (amount > limits.maxPerTxn) {
            return res.status(400).json({ error: `Maximum withdrawal per transaction is Rs. ${limits.maxPerTxn.toLocaleString("en-IN")}.` });
        }
        if (account.daily_withdrawn + amount > limits.dailyLimit) {
            return res.status(400).json({ error: `Daily withdrawal limit of Rs. ${limits.dailyLimit.toLocaleString("en-IN")} exceeded.` });
        }

        const totalNeeded = amount + limits.withdrawalFee;

        if (account.account_type === "SAVINGS") {
            if (account.balance - totalNeeded < limits.minBalance) {
                return res.status(400).json({ error: `Minimum balance of Rs. ${limits.minBalance.toLocaleString("en-IN")} must be maintained.` });
            }
        } else {
            if (totalNeeded > account.balance + limits.overdraftLimit) {
                return res.status(400).json({ error: `Overdraft limit exceeded. Available: Rs. ${(account.balance + limits.overdraftLimit).toLocaleString("en-IN")}.` });
            }
        }

        if (totalNeeded > account.balance) {
            return res.status(400).json({ error: `Insufficient balance. Available: Rs. ${account.balance.toLocaleString("en-IN")}, Required: Rs. ${totalNeeded.toLocaleString("en-IN")} (incl. fee).` });
        }

        // ATM cash check
        const atmCash = getAtmCash();
        if (amount > atmCash.total) {
            return res.status(400).json({ error: `ATM has insufficient cash. Available: Rs. ${atmCash.total.toLocaleString("en-IN")}.` });
        }

        if (amount % 500 !== 0) {
            return res.status(400).json({ error: "Amount must be a multiple of 500." });
        }

        // Execute
        const newBalance = account.balance - totalNeeded;
        accountQueries.updateBalance(account.account_number, newBalance);
        accountQueries.updateDaily(
            account.account_number,
            account.daily_withdrawn + amount,
            account.daily_transferred,
            account.last_activity_date
        );

        const dispensed = dispenseCash(amount);

        const txnId = `TXN-${Date.now()}`;
        transactionQueries.create(txnId, "WITHDRAWAL", amount, "SUCCESS", account.account_number, null, limits.withdrawalFee);

        res.json({
            success: true,
            transactionId: txnId,
            amount,
            fee: limits.withdrawalFee,
            totalDebited: totalNeeded,
            newBalance,
            dispensed,
            accountNumber: account.account_number,
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── Transfer ──
app.post("/api/account/transfer", requireAuth, (req, res) => {
    try {
        const { receiverAccountNumber, amount } = req.body;
        if (!amount || typeof amount !== "number" || amount <= 0) {
            return res.status(400).json({ error: "Transfer amount must be a positive number." });
        }
        if (!receiverAccountNumber) {
            return res.status(400).json({ error: "Receiver account number is required." });
        }

        const senderAccountNumber = req.session.selectedAccount;
        if (senderAccountNumber === receiverAccountNumber) {
            return res.status(400).json({ error: "Cannot transfer to the same account." });
        }

        let sender = accountQueries.getByNumber(senderAccountNumber);
        const receiver = accountQueries.getByNumber(receiverAccountNumber);
        if (!sender) return res.status(404).json({ error: `Sender account ${senderAccountNumber} not found.` });
        if (!receiver) return res.status(404).json({ error: `Receiver account ${receiverAccountNumber} not found.` });
        if (!sender.is_active) return res.status(403).json({ error: "Sender account is inactive." });
        if (!receiver.is_active) return res.status(403).json({ error: "Receiver account is inactive." });

        sender = resetDailyIfNeeded(sender);

        const limits = getAccountLimits(sender.account_type);
        const totalNeeded = amount + limits.transferFee;

        if (sender.account_type === "SAVINGS") {
            if (sender.balance - totalNeeded < limits.minBalance) {
                return res.status(400).json({ error: `Minimum balance of Rs. ${limits.minBalance.toLocaleString("en-IN")} must be maintained.` });
            }
        } else {
            if (totalNeeded > sender.balance + limits.overdraftLimit) {
                return res.status(400).json({ error: `Overdraft limit exceeded.` });
            }
        }

        if (totalNeeded > sender.balance) {
            return res.status(400).json({ error: `Insufficient balance. Available: Rs. ${sender.balance.toLocaleString("en-IN")}, Required: Rs. ${totalNeeded.toLocaleString("en-IN")} (incl. fee).` });
        }

        // Execute
        const newSenderBalance = sender.balance - totalNeeded;
        const newReceiverBalance = receiver.balance + amount;

        accountQueries.updateBalance(senderAccountNumber, newSenderBalance);
        accountQueries.updateBalance(receiverAccountNumber, newReceiverBalance);
        accountQueries.updateDaily(
            senderAccountNumber,
            sender.daily_withdrawn,
            sender.daily_transferred + amount,
            sender.last_activity_date
        );

        const txnId = `TXN-${Date.now()}`;
        transactionQueries.create(txnId, "TRANSFER", amount, "SUCCESS", senderAccountNumber, receiverAccountNumber, limits.transferFee);
        transactionQueries.create(`${txnId}-R`, "TRANSFER", amount, "SUCCESS", receiverAccountNumber, senderAccountNumber, 0);

        res.json({
            success: true,
            transactionId: txnId,
            amount,
            fee: limits.transferFee,
            senderNewBalance: newSenderBalance,
            receiverNewBalance: newReceiverBalance,
            senderAccount: senderAccountNumber,
            receiverAccount: receiverAccountNumber,
            receiverName: receiver.holder_name,
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ── Change PIN ──
app.post("/api/account/change-pin", requireAuth, (req, res) => {
    try {
        const { oldPin, newPin } = req.body;
        if (!oldPin || !newPin) {
            return res.status(400).json({ error: "Both old and new PIN are required." });
        }
        if (!/^\d{4}$/.test(String(newPin))) {
            return res.status(400).json({ error: "New PIN must be exactly 4 digits." });
        }

        const card = cardQueries.getByNumber(req.session.cardNumber);
        if (!card) return res.status(404).json({ error: "Card not found." });

        if (String(oldPin) !== card.pin) {
            return res.status(400).json({ error: "Current PIN is incorrect." });
        }

        cardQueries.updatePin(card.card_number, String(newPin));

        // Also update the account PIN
        accountQueries.updatePin(req.session.selectedAccount, String(newPin));

        res.json({ success: true, message: "PIN changed successfully." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Mini Statement ──
app.get("/api/account/statement", requireAuth, (req, res) => {
    try {
        const account = accountQueries.getByNumber(req.session.selectedAccount);
        if (!account) return res.status(404).json({ error: "Account not found." });

        const txns = transactionQueries.getByAccount(req.session.selectedAccount, 5);

        res.json({
            accountNumber: account.account_number,
            accountType: account.account_type,
            balance: account.balance,
            transactions: txns.map((t) => ({
                transactionId: t.transaction_id,
                type: t.type,
                amount: t.amount,
                fee: t.fee,
                status: t.status,
                relatedAccount: t.related_account_number,
                date: t.created_at,
            })),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Eject Card / Logout ──
app.post("/api/card/eject", (req, res) => {
    const token = req.headers["x-session-token"];
    if (token) destroySession(token);
    res.json({ success: true, message: "Card ejected." });
});

// ── ATM Status (Admin) ──
app.get("/api/admin/atm-status", (req, res) => {
    const cash = getAtmCash();
    res.json({
        name: "ATM-001",
        location: "Main Branch",
        denominations: { 500: cash[500], 1000: cash[1000], 5000: cash[5000] },
        totalCash: cash.total,
    });
});

// ── Admin: All Accounts ──
app.get("/api/admin/accounts", (req, res) => {
    const accounts = accountQueries.getAll();
    res.json({ accounts });
});

// ── Admin: All Transactions ──
app.get("/api/admin/transactions", (req, res) => {
    const txns = transactionQueries.getAll();
    res.json({ transactions: txns });
});

// ── Admin: Refill ATM ──
app.post("/api/admin/refill", (req, res) => {
    try {
        const { denominations } = req.body;
        const current = getAtmCash();
        atmQueries.updateCash(
            current[500] + (denominations[500] || 0),
            current[1000] + (denominations[1000] || 0),
            current[5000] + (denominations[5000] || 0)
        );
        const updated = getAtmCash();
        res.json({ success: true, totalCash: updated.total, denominations: { 500: updated[500], 1000: updated[1000], 5000: updated[5000] } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Serve Frontend ──
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

// ─── Start Server ─────────────────────────────────────────────
seedData();

app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║  ATM System Server Running               ║`);
    console.log(`║  http://localhost:${PORT}                   ║`);
    console.log(`╚══════════════════════════════════════════╝`);
    console.log(`\nDemo Cards:`);
    console.log(`  Card: 4000000000000001 | PIN: 1234 | Accounts: 10000001, 10000002`);
    console.log(`  Card: 4000000000000002 | PIN: 5678 | Accounts: 10000003`);
    console.log(`  Card: 4000000000000003 | PIN: 9999 | Accounts: 10000004\n`);
});

const readline = require("readline");
const path = require("path");
const {
    seedData,
    customerQueries,
    accountQueries,
    cardQueries,
    cardAccountQueries,
    transactionQueries,
    atmQueries,
} = require("./database");
const { SavingsAccount, CurrentAccount } = require("./account");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function ask(question) {
    return new Promise((resolve) => rl.question(question, resolve));
}

function clear() {
    console.clear();
}

function pause() {
    return ask("\n  Press Enter to continue...");
}

function header(title) {
    clear();
    console.log("  ╔══════════════════════════════════════════════╗");
    console.log(`  ║  ${title.padEnd(44)}║`);
    console.log("  ╚══════════════════════════════════════════════╝");
    console.log();
}

function success(msg) {
    console.log(`\n  ✔ ${msg}`);
}

function error(msg) {
    console.log(`\n  ✘ ${msg}`);
}

function formatRs(n) {
    return "Rs. " + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

// ─── Account Limits ───────────────────────────────────────────
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
    }
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

function getAvailableForWithdrawal(account) {
    const limits = getAccountLimits(account.account_type);
    if (account.account_type === "SAVINGS") {
        return Math.max(0, account.balance - limits.minBalance);
    }
    return account.balance + limits.overdraftLimit;
}

function getAtmCash() {
    const atm = atmQueries.get();
    if (!atm) return { 500: 0, 1000: 0, 5000: 0, total: 0 };
    const total = atm.cash_500 * 500 + atm.cash_1000 * 1000 + atm.cash_5000 * 5000;
    return { 500: atm.cash_500, 1000: atm.cash_1000, 5000: atm.cash_5000, total };
}

function dispenseCash(amount) {
    const atm = atmQueries.get();
    if (!atm) throw new Error("ATM not initialized.");

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

    if (remaining > 0) throw new Error("Cannot dispense with available denominations.");

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

// ─── Session State ────────────────────────────────────────────
let session = {
    cardNumber: null,
    customerId: null,
    authenticated: false,
    selectedAccount: null,
};

function resetSession() {
    session = { cardNumber: null, customerId: null, authenticated: false, selectedAccount: null };
}

// ─── Main Menu ────────────────────────────────────────────────
async function mainMenu() {
    while (true) {
        header("ATM SYSTEM");
        console.log("  1. Insert Card");
        console.log("  2. Admin Menu");
        console.log("  3. Exit");
        console.log();

        const choice = await ask("  Select option: ");

        switch (choice.trim()) {
            case "1":
                await insertCardFlow();
                break;
            case "2":
                await adminMenu();
                break;
            case "3":
                header("GOODBYE");
                console.log("  Thank you for using ATM System.\n");
                rl.close();
                return;
            default:
                error("Invalid option.");
                await pause();
        }
    }
}

// ─── Insert Card ──────────────────────────────────────────────
async function insertCardFlow() {
    header("INSERT CARD");
    const cardNumber = await ask("  Enter card number: ");

    const card = cardQueries.getByNumber(cardNumber.trim());
    if (!card) {
        error("Invalid card number.");
        await pause();
        return;
    }
    if (!card.is_active) {
        error("Card is BLOCKED. Contact your bank.");
        await pause();
        return;
    }

    session.cardNumber = card.card_number;
    session.customerId = card.customer_id;
    session.authenticated = false;
    session.selectedAccount = null;

    success("Card inserted: ****-****-****-" + card.card_number.slice(-4));
    await pinFlow(card);
}

// ─── PIN Authentication ───────────────────────────────────────
async function pinFlow(card) {
    let attempts = 0;
    const maxAttempts = card.max_attempts;

    while (attempts < maxAttempts) {
        header("ENTER PIN");
        console.log(`  Card: ****-****-****-${card.card_number.slice(-4)}`);
        console.log(`  Attempts remaining: ${maxAttempts - attempts}`);
        console.log();

        const pin = await ask("  Enter 4-digit PIN: ");

        if (String(pin.trim()) === card.pin) {
            cardQueries.updateFailedAttempts(card.card_number, 0);
            session.authenticated = true;
            success("Authentication successful!");
            await pause();
            await selectAccountFlow();
            return;
        }

        attempts++;
        const newAttempts = card.failed_attempts + (attempts === 1 ? 1 : 0);

        if (attempts >= maxAttempts) {
            cardQueries.updateActive(card.card_number, false);
            cardQueries.updateFailedAttempts(card.card_number, 0);
            error("Card blocked after 3 failed attempts. Contact your bank.");
            await pause();
            resetSession();
            return;
        }

        cardQueries.updateFailedAttempts(card.card_number, attempts);
        error(`Invalid PIN. ${maxAttempts - attempts} attempt(s) remaining.`);
        await pause();
    }
}

// ─── Select Account ───────────────────────────────────────────
async function selectAccountFlow() {
    const linked = cardAccountQueries.getLinkedAccounts(session.cardNumber);

    if (linked.length === 0) {
        error("No accounts linked to this card.");
        await pause();
        resetSession();
        return;
    }

    header("SELECT ACCOUNT");
    linked.forEach((acc, i) => {
        const bal = formatRs(acc.balance);
        console.log(`  ${i + 1}. ${acc.account_number} (${acc.account_type}) - ${bal}`);
    });
    console.log(`  0. Cancel`);
    console.log();

    const choice = await ask("  Select account: ");
    const idx = parseInt(choice.trim()) - 1;

    if (choice.trim() === "0") {
        resetSession();
        return;
    }

    if (isNaN(idx) || idx < 0 || idx >= linked.length) {
        error("Invalid selection.");
        await pause();
        await selectAccountFlow();
        return;
    }

    session.selectedAccount = linked[idx].account_number;
    success(`Account ${linked[idx].account_number} selected.`);
    await pause();
    await atmOperations();
}

// ─── ATM Operations ───────────────────────────────────────────
async function atmOperations() {
    while (session.authenticated && session.selectedAccount) {
        const account = accountQueries.getByNumber(session.selectedAccount);
        if (!account) {
            error("Account not found.");
            await pause();
            resetSession();
            return;
        }

        header("ATM OPERATIONS");
        console.log(`  Account: ${account.account_number} (${account.account_type})`);
        console.log(`  Balance: ${formatRs(account.balance)}`);
        console.log();
        console.log("  1. Check Balance");
        console.log("  2. Deposit");
        console.log("  3. Withdraw");
        console.log("  4. Transfer");
        console.log("  5. Mini Statement");
        console.log("  6. Change PIN");
        console.log("  7. Eject Card");
        console.log();

        const choice = await ask("  Select option: ");

        switch (choice.trim()) {
            case "1":
                await checkBalanceFlow();
                break;
            case "2":
                await depositFlow();
                break;
            case "3":
                await withdrawFlow();
                break;
            case "4":
                await transferFlow();
                break;
            case "5":
                await statementFlow();
                break;
            case "6":
                await changePinFlow();
                break;
            case "7":
                await ejectCardFlow();
                return;
            default:
                error("Invalid option.");
                await pause();
        }
    }
}

// ─── Check Balance ────────────────────────────────────────────
async function checkBalanceFlow() {
    const account = accountQueries.getByNumber(session.selectedAccount);
    const limits = getAccountLimits(account.account_type);
    const available = getAvailableForWithdrawal(account);

    header("ACCOUNT BALANCE");
    console.log(`  Account Number:    ${account.account_number}`);
    console.log(`  Account Type:      ${account.account_type}`);
    console.log(`  Holder:            ${account.holder_name}`);
    console.log();
    console.log(`  Current Balance:   ${formatRs(account.balance)}`);
    console.log(`  Available to Withdraw: ${formatRs(available)}`);
    console.log();
    console.log(`  --- Limits ---`);
    console.log(`  Max per Txn:       ${formatRs(limits.maxPerTxn)}`);
    console.log(`  Daily Limit:       ${formatRs(limits.dailyLimit)}`);
    console.log(`  Daily Withdrawn:   ${formatRs(account.daily_withdrawn)}`);
    console.log(`  Daily Remaining:   ${formatRs(limits.dailyLimit - account.daily_withdrawn)}`);
    if (account.account_type === "SAVINGS") {
        console.log(`  Min Balance:       ${formatRs(limits.minBalance)}`);
    } else {
        console.log(`  Overdraft Limit:   ${formatRs(limits.overdraftLimit)}`);
    }
    console.log(`  Withdrawal Fee:    ${formatRs(limits.withdrawalFee)}`);
    console.log(`  Transfer Fee:      ${formatRs(limits.transferFee)}`);

    await pause();
}

// ─── Deposit ──────────────────────────────────────────────────
async function depositFlow() {
    header("DEPOSIT");
    const amountStr = await ask("  Enter deposit amount: ");
    const amount = Number(amountStr.trim());

    if (!amount || amount <= 0 || isNaN(amount)) {
        error("Deposit amount must be a positive number.");
        await pause();
        return;
    }

    const account = accountQueries.getByNumber(session.selectedAccount);
    if (!account.is_active) {
        error("Account is inactive.");
        await pause();
        return;
    }

    const newBalance = account.balance + amount;
    accountQueries.updateBalance(account.account_number, newBalance);

    const txnId = `TXN-${Date.now()}`;
    transactionQueries.create(txnId, "DEPOSIT", amount, "SUCCESS", account.account_number);

    header("DEPOSIT SUCCESSFUL");
    console.log(`  Transaction ID:  ${txnId}`);
    console.log(`  Amount:          ${formatRs(amount)}`);
    console.log(`  New Balance:     ${formatRs(newBalance)}`);

    await pause();
}

// ─── Withdraw ─────────────────────────────────────────────────
async function withdrawFlow() {
    header("WITHDRAW");
    let account = accountQueries.getByNumber(session.selectedAccount);
    account = resetDailyIfNeeded(account);

    const limits = getAccountLimits(account.account_type);
    const available = getAvailableForWithdrawal(account);

    console.log(`  Available for withdrawal: ${formatRs(available)}`);
    console.log(`  Withdrawal fee: ${formatRs(limits.withdrawalFee)}`);
    console.log();

    const amountStr = await ask("  Enter withdrawal amount: ");
    const amount = Number(amountStr.trim());

    if (!amount || amount <= 0 || isNaN(amount)) {
        error("Amount must be a positive number.");
        await pause();
        return;
    }

    if (amount % 500 !== 0) {
        error("Amount must be a multiple of 500.");
        await pause();
        return;
    }

    if (amount < limits.minWithdrawal) {
        error(`Minimum withdrawal is ${formatRs(limits.minWithdrawal)}.`);
        await pause();
        return;
    }

    if (amount > limits.maxPerTxn) {
        error(`Maximum withdrawal per transaction is ${formatRs(limits.maxPerTxn)}.`);
        await pause();
        return;
    }

    if (account.daily_withdrawn + amount > limits.dailyLimit) {
        error(`Daily withdrawal limit of ${formatRs(limits.dailyLimit)} exceeded.`);
        await pause();
        return;
    }

    const totalNeeded = amount + limits.withdrawalFee;

    if (account.account_type === "SAVINGS") {
        if (account.balance - totalNeeded < limits.minBalance) {
            error(`Minimum balance of ${formatRs(limits.minBalance)} must be maintained.`);
            await pause();
            return;
        }
    } else {
        if (totalNeeded > account.balance + limits.overdraftLimit) {
            error(`Overdraft limit exceeded. Available: ${formatRs(account.balance + limits.overdraftLimit)}.`);
            await pause();
            return;
        }
    }

    if (totalNeeded > account.balance) {
        error(`Insufficient balance. Available: ${formatRs(account.balance)}, Required: ${formatRs(totalNeeded)} (incl. fee).`);
        await pause();
        return;
    }

    const atmCash = getAtmCash();
    if (amount > atmCash.total) {
        error(`ATM has insufficient cash. Available: ${formatRs(atmCash.total)}.`);
        await pause();
        return;
    }

    const newBalance = account.balance - totalNeeded;
    accountQueries.updateBalance(account.account_number, newBalance);
    accountQueries.updateDaily(
        account.account_number,
        account.daily_withdrawn + amount,
        account.daily_transferred,
        account.last_activity_date
    );

    let dispensed;
    try {
        dispensed = dispenseCash(amount);
    } catch (e) {
        error(e.message);
        await pause();
        return;
    }

    const txnId = `TXN-${Date.now()}`;
    transactionQueries.create(txnId, "WITHDRAWAL", amount, "SUCCESS", account.account_number, null, limits.withdrawalFee);

    header("WITHDRAWAL SUCCESSFUL");
    console.log(`  Transaction ID:  ${txnId}`);
    console.log(`  Amount:          ${formatRs(amount)}`);
    console.log(`  Fee:             ${formatRs(limits.withdrawalFee)}`);
    console.log(`  Total Debited:   ${formatRs(totalNeeded)}`);
    console.log(`  New Balance:     ${formatRs(newBalance)}`);
    console.log();
    console.log(`  Cash Dispensed:`);
    if (dispensed[5000] > 0) console.log(`    5000 x ${dispensed[5000]}`);
    if (dispensed[1000] > 0) console.log(`   1000 x ${dispensed[1000]}`);
    if (dispensed[500] > 0) console.log(`    500 x ${dispensed[500]}`);

    await pause();
}

// ─── Transfer ─────────────────────────────────────────────────
async function transferFlow() {
    header("TRANSFER");
    const sender = accountQueries.getByNumber(session.selectedAccount);
    const senderLimits = getAccountLimits(sender.account_type);

    console.log(`  From: ${sender.account_number} (${sender.account_type}) - ${formatRs(sender.balance)}`);
    console.log();

    const receiverNumber = await ask("  Enter receiver account number: ");
    const amountStr = await ask("  Enter transfer amount: ");
    const amount = Number(amountStr.trim());

    if (!amount || amount <= 0 || isNaN(amount)) {
        error("Transfer amount must be a positive number.");
        await pause();
        return;
    }

    if (sender.account_number === receiverNumber.trim()) {
        error("Cannot transfer to the same account.");
        await pause();
        return;
    }

    const receiver = accountQueries.getByNumber(receiverNumber.trim());
    if (!receiver) {
        error(`Receiver account ${receiverNumber.trim()} not found.`);
        await pause();
        return;
    }

    if (!receiver.is_active) {
        error("Receiver account is inactive.");
        await pause();
        return;
    }

    const totalNeeded = amount + senderLimits.transferFee;

    if (sender.account_type === "SAVINGS") {
        if (sender.balance - totalNeeded < senderLimits.minBalance) {
            error(`Minimum balance of ${formatRs(senderLimits.minBalance)} must be maintained.`);
            await pause();
            return;
        }
    } else {
        if (totalNeeded > sender.balance + senderLimits.overdraftLimit) {
            error("Overdraft limit exceeded.");
            await pause();
            return;
        }
    }

    if (totalNeeded > sender.balance) {
        error(`Insufficient balance. Available: ${formatRs(sender.balance)}, Required: ${formatRs(totalNeeded)} (incl. fee).`);
        await pause();
        return;
    }

    const newSenderBalance = sender.balance - totalNeeded;
    const newReceiverBalance = receiver.balance + amount;

    accountQueries.updateBalance(sender.account_number, newSenderBalance);
    accountQueries.updateBalance(receiver.account_number, newReceiverBalance);
    accountQueries.updateDaily(
        sender.account_number,
        sender.daily_withdrawn,
        sender.daily_transferred + amount,
        sender.last_activity_date
    );

    const txnId = `TXN-${Date.now()}`;
    transactionQueries.create(txnId, "TRANSFER", amount, "SUCCESS", sender.account_number, receiver.account_number, senderLimits.transferFee);
    transactionQueries.create(`${txnId}-R`, "TRANSFER", amount, "SUCCESS", receiver.account_number, sender.account_number, 0);

    header("TRANSFER SUCCESSFUL");
    console.log(`  Transaction ID:      ${txnId}`);
    console.log(`  Amount:              ${formatRs(amount)}`);
    console.log(`  Fee:                 ${formatRs(senderLimits.transferFee)}`);
    console.log(`  Sender New Balance:  ${formatRs(newSenderBalance)}`);
    console.log(`  Receiver:            ${receiver.account_number} (${receiver.holder_name})`);
    console.log(`  Receiver New Bal:    ${formatRs(newReceiverBalance)}`);

    await pause();
}

// ─── Mini Statement ───────────────────────────────────────────
async function statementFlow() {
    const account = accountQueries.getByNumber(session.selectedAccount);
    const txns = transactionQueries.getByAccount(session.selectedAccount, 10);

    header("MINI STATEMENT");
    console.log(`  Account: ${account.account_number} (${account.account_type})`);
    console.log(`  Balance: ${formatRs(account.balance)}`);
    console.log();

    if (txns.length === 0) {
        console.log("  No transactions found.");
    } else {
        console.log("  " + "-".repeat(60));
        console.log(`  ${"ID".padEnd(16)} ${"Type".padEnd(12)} ${"Amount".padStart(14)} ${"Fee".padStart(8)} ${"Status"}`);
        console.log("  " + "-".repeat(60));

        for (const t of txns) {
            const sign = t.type === "DEPOSIT" ? "+" : "-";
            const amt = `${sign}${formatRs(t.amount)}`;
            let extra = "";
            if (t.type === "TRANSFER" && t.related_account_number) {
                extra = t.account_number === account.account_number
                    ? ` -> ${t.related_account_number}`
                    : ` <- ${t.related_account_number}`;
            }
            console.log(`  ${t.transaction_id.padEnd(16)} ${t.type.padEnd(12)} ${amt.padStart(14)} ${formatRs(t.fee).padStart(8)} ${t.status}${extra}`);
        }

        console.log("  " + "-".repeat(60));
    }

    await pause();
}

// ─── Change PIN ───────────────────────────────────────────────
async function changePinFlow() {
    header("CHANGE PIN");
    const oldPin = await ask("  Enter current PIN: ");
    const newPin = await ask("  Enter new 4-digit PIN: ");
    const confirmPin = await ask("  Confirm new PIN: ");

    if (newPin.trim() !== confirmPin.trim()) {
        error("New PINs do not match.");
        await pause();
        return;
    }

    if (!/^\d{4}$/.test(newPin.trim())) {
        error("New PIN must be exactly 4 digits.");
        await pause();
        return;
    }

    const card = cardQueries.getByNumber(session.cardNumber);
    if (!card) {
        error("Card not found.");
        await pause();
        return;
    }

    if (String(oldPin.trim()) !== card.pin) {
        error("Current PIN is incorrect.");
        await pause();
        return;
    }

    cardQueries.updatePin(card.card_number, String(newPin.trim()));
    accountQueries.updatePin(session.selectedAccount, String(newPin.trim()));

    success("PIN changed successfully!");
    await pause();
}

// ─── Eject Card ───────────────────────────────────────────────
async function ejectCardFlow() {
    header("EJECT CARD");
    console.log("  Please take your card.");
    console.log();
    success("Card ejected. Thank you!");
    resetSession();
    await pause();
}

// ─── Admin Menu ───────────────────────────────────────────────
async function adminMenu() {
    while (true) {
        header("ADMIN MENU");
        console.log("  1. ATM Cash Status");
        console.log("  2. Refill ATM");
        console.log("  3. All Accounts");
        console.log("  4. All Customers");
        console.log("  5. All Transactions");
        console.log("  0. Back");
        console.log();

        const choice = await ask("  Select option: ");

        switch (choice.trim()) {
            case "1":
                await adminAtmStatus();
                break;
            case "2":
                await adminRefill();
                break;
            case "3":
                await adminAllAccounts();
                break;
            case "4":
                await adminAllCustomers();
                break;
            case "5":
                await adminAllTransactions();
                break;
            case "0":
                return;
            default:
                error("Invalid option.");
                await pause();
        }
    }
}

async function adminAtmStatus() {
    const cash = getAtmCash();
    header("ATM CASH STATUS");
    console.log(`  Name:     ATM-001`);
    console.log(`  Location: Main Branch`);
    console.log();
    console.log(`  Denomination  Count    Value`);
    console.log(`  ------------  -----    -------------------`);
    console.log(`  500           ${String(cash[500]).padStart(5)}    ${formatRs(cash[500] * 500).padStart(18)}`);
    console.log(`  1000          ${String(cash[1000]).padStart(5)}    ${formatRs(cash[1000] * 1000).padStart(18)}`);
    console.log(`  5000          ${String(cash[5000]).padStart(5)}    ${formatRs(cash[5000] * 5000).padStart(18)}`);
    console.log(`  ------------  -----    -------------------`);
    console.log(`  Total Cash:             ${formatRs(cash.total)}`);
    await pause();
}

async function adminRefill() {
    header("REFILL ATM");
    const cash = getAtmCash();
    console.log(`  Current cash: ${formatRs(cash.total)}`);
    console.log();

    const c500 = await ask(`  Add 500 notes (current: ${cash[500]}): `);
    const c1000 = await ask(`  Add 1000 notes (current: ${cash[1000]}): `);
    const c5000 = await ask(`  Add 5000 notes (current: ${cash[5000]}): `);

    const add500 = parseInt(c500.trim()) || 0;
    const add1000 = parseInt(c1000.trim()) || 0;
    const add5000 = parseInt(c5000.trim()) || 0;

    if (add500 < 0 || add1000 < 0 || add5000 < 0) {
        error("Cannot add negative values.");
        await pause();
        return;
    }

    atmQueries.updateCash(
        cash[500] + add500,
        cash[1000] + add1000,
        cash[5000] + add5000
    );

    const updated = getAtmCash();
    success(`ATM refilled. New total: ${formatRs(updated.total)}`);
    await pause();
}

async function adminAllAccounts() {
    const accounts = accountQueries.getAll();
    header("ALL ACCOUNTS");

    if (accounts.length === 0) {
        console.log("  No accounts found.");
    } else {
        console.log("  " + "-".repeat(70));
        console.log(`  ${"Number".padEnd(12)} ${"Type".padEnd(10)} ${"Holder".padEnd(22)} ${"Balance".padStart(16)}`);
        console.log("  " + "-".repeat(70));
        for (const a of accounts) {
            const bal = formatRs(a.balance).padStart(16);
            console.log(`  ${a.account_number.padEnd(12)} ${a.account_type.padEnd(10)} ${a.holder_name.padEnd(22)} ${bal}`);
        }
        console.log("  " + "-".repeat(70));
        console.log(`  Total accounts: ${accounts.length}`);
    }

    await pause();
}

async function adminAllCustomers() {
    const customers = customerQueries.getAll();
    header("ALL CUSTOMERS");

    if (customers.length === 0) {
        console.log("  No customers found.");
    } else {
        for (const c of customers) {
            const accounts = accountQueries.getAll().filter((a) => a.customer_id === c.id);
            const cards = [];
            console.log(`  ${c.id} | ${c.name} | ${c.email} | ${c.phone}`);
            console.log(`    Accounts: ${accounts.map((a) => `${a.account_number} (${a.account_type})`).join(", ") || "None"}`);
            console.log();
        }
    }

    await pause();
}

async function adminAllTransactions() {
    const txns = transactionQueries.getAll();
    header("ALL TRANSACTIONS");

    if (txns.length === 0) {
        console.log("  No transactions found.");
    } else {
        console.log("  " + "-".repeat(80));
        console.log(`  ${"ID".padEnd(16)} ${"Type".padEnd(12)} ${"Amount".padStart(12)} ${"Fee".padStart(8)} ${"Account".padEnd(12)} ${"Status"}`);
        console.log("  " + "-".repeat(80));
        for (const t of txns) {
            console.log(`  ${t.transaction_id.padEnd(16)} ${t.type.padEnd(12)} ${formatRs(t.amount).padStart(12)} ${formatRs(t.fee).padStart(8)} ${t.account_number.padEnd(12)} ${t.status}`);
        }
        console.log("  " + "-".repeat(80));
        console.log(`  Total transactions: ${txns.length}`);
    }

    await pause();
}

// ─── Start ────────────────────────────────────────────────────
seedData();
mainMenu();

const readline = require("readline");
const Bank = require("./bank");
const ATM = require("./atm");
const {
    DepositTransaction,
    WithdrawalTransaction,
    TransferTransaction,
} = require("./transaction");
const {
    ATMError,
    InvalidAmountError,
    InvalidPINFormatError,
    CardNotInsertedException,
} = require("./exceptions");

// ─── Setup ───────────────────────────────────────────────────────
const bank = new Bank("National Bank");
const atm = new ATM("ATM-001", "Main Branch");

atm.loadCash({ 500: 20, 1000: 30, 5000: 10 });

const cust1 = bank.createCustomer("Ali Khan", "ali@email.com", "0301-1234567");
const cust2 = bank.createCustomer("Sara Malik", "sara@email.com", "0321-7654321");
const cust3 = bank.createCustomer("Ahmed Raza", "ahmed@email.com", "0333-9998877");

const acc1 = bank.createSavingsAccount(cust1.customerId, 75000, "1234");
const acc2 = bank.createCurrentAccount(cust1.customerId, 150000, "1234");
const acc3 = bank.createSavingsAccount(cust2.customerId, 50000, "5678");
const acc4 = bank.createCurrentAccount(cust3.customerId, 200000, "9999");

const card1 = bank.issueCard(cust1.customerId, "1234", [
    acc1.accountNumber,
    acc2.accountNumber,
]);
const card2 = bank.issueCard(cust2.customerId, "5678", [acc3.accountNumber]);
const card3 = bank.issueCard(cust3.customerId, "9999", [acc4.accountNumber]);

// ─── Readline ────────────────────────────────────────────────────
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
    });
}

// ─── Helpers ─────────────────────────────────────────────────────
function fmt(amount) {
    return amount.toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

function pause() {
    return ask("\nPress Enter to continue...");
}

function printHeader() {
    console.log("\n╔══════════════════════════════════════╗");
    console.log("║         WELCOME TO THE ATM           ║");
    console.log("╚══════════════════════════════════════╝");
}

function printMenu() {
    console.log("\n╔══════════════════════════════════════╗");
    console.log("║              ATM MENU                ║");
    console.log("╠══════════════════════════════════════╣");
    console.log("║  1. Check Balance                    ║");
    console.log("║  2. Deposit                          ║");
    console.log("║  3. Withdraw                         ║");
    console.log("║  4. Transfer Money                   ║");
    console.log("║  5. Change PIN                       ║");
    console.log("║  6. Mini Statement                   ║");
    console.log("║  7. Switch Account                   ║");
    console.log("║  8. Exit                             ║");
    console.log("╚══════════════════════════════════════╝");
}

// ─── ATM Menu Handlers ──────────────────────────────────────────
async function handleCheckBalance(account) {
    const balance = account.checkBalance();
    console.log(`\n  Account: ${account.accountNumber}`);
    console.log(`  Type:    ${account.accountType}`);
    console.log(`  Balance: Rs. ${fmt(balance)}`);
    if (account.accountType === "CURRENT") {
        const overdraft = 50000;
        console.log(`  Overdraft Limit: Rs. ${fmt(overdraft)}`);
        console.log(`  Available: Rs. ${fmt(balance + overdraft)}`);
    }
}

async function handleDeposit(account) {
    const amountStr = await ask("  Enter deposit amount: Rs. ");
    const amount = Number(amountStr);
    if (isNaN(amount) || amount <= 0) {
        throw new InvalidAmountError("Deposit amount must be a positive number.");
    }

    const txn = new DepositTransaction(amount, account);
    txn.execute();

    console.log("\n  ─── Deposit Successful ───");
    console.log(`  Amount:         Rs. ${fmt(amount)}`);
    console.log(`  Transaction ID: ${txn.transactionId}`);
    console.log(`  New Balance:    Rs. ${fmt(account.balance)}`);
}

async function handleWithdraw(account) {
    console.log(`\n  Available for withdrawal: Rs. ${fmt(account.getAvailableForWithdrawal())}`);
    console.log(`  Daily limit remaining:    Rs. ${fmt(account.getDailyWithdrawalLimit() - account.dailyWithdrawn)}`);
    console.log(`  Transaction fee:          Rs. ${fmt(account.getWithdrawalFee())}`);

    const amountStr = await ask("  Enter withdrawal amount: Rs. ");
    const amount = Number(amountStr);
    if (isNaN(amount) || amount <= 0) {
        throw new InvalidAmountError("Withdrawal amount must be a positive number.");
    }

    const txn = new WithdrawalTransaction(amount, account);

    try {
        txn.execute();
    } catch (err) {
        txn._markFailed();
        throw err;
    }

    const dispensed = atm.dispenseCash(amount);

    console.log("\n  ─── Withdrawal Successful ───");
    console.log(`  Amount:         Rs. ${fmt(amount)}`);
    if (account.getWithdrawalFee() > 0) {
        console.log(`  Fee:            Rs. ${fmt(account.getWithdrawalFee())}`);
        console.log(`  Total Debited:  Rs. ${fmt(amount + account.getWithdrawalFee())}`);
    }
    console.log(`  Transaction ID: ${txn.transactionId}`);
    console.log(`  New Balance:    Rs. ${fmt(account.balance)}`);
    console.log("\n  Cash dispensed:");
    if (dispensed[5000] > 0) console.log(`    5000 x ${dispensed[5000]}`);
    if (dispensed[1000] > 0) console.log(`   1000 x ${dispensed[1000]}`);
    if (dispensed[500] > 0) console.log(`    500 x ${dispensed[500]}`);
}

async function handleTransfer(account) {
    const receiverNum = await ask("  Enter receiver account number: ");
    const amountStr = await ask("  Enter transfer amount: Rs. ");
    const amount = Number(amountStr);
    if (isNaN(amount) || amount <= 0) {
        throw new InvalidAmountError("Transfer amount must be a positive number.");
    }

    bank.validateTransfer(account.accountNumber, receiverNum, amount);

    const receiver = bank.getAccount(receiverNum);

    console.log(`\n  Transfer to: ${receiver.accountHolder} (${receiver.accountNumber})`);
    console.log(`  Amount: Rs. ${fmt(amount)}`);
    if (account.getTransferFee() > 0) {
        console.log(`  Fee: Rs. ${fmt(account.getTransferFee())}`);
    }
    const confirm = await ask("  Confirm? (y/n): ");
    if (confirm.toLowerCase() !== "y") {
        console.log("  Transfer cancelled.");
        return;
    }

    const txn = new TransferTransaction(amount, account, receiver);
    txn.execute();

    console.log("\n  ─── Transfer Successful ───");
    console.log(`  Transaction ID: ${txn.transactionId}`);
    console.log(`  From: ${account.accountNumber} -> Rs. ${fmt(account.balance)}`);
    console.log(`  To:   ${receiver.accountNumber} -> Rs. ${fmt(receiver.balance)}`);
}

async function handleChangePin(account) {
    const oldPin = await ask("  Enter current PIN: ");
    const newPin = await ask("  Enter new PIN (4 digits): ");
    const confirmPin = await ask("  Confirm new PIN: ");

    if (newPin !== confirmPin) {
        console.log("  PINs do not match. Try again.");
        return;
    }

    if (!/^\d{4}$/.test(newPin)) {
        throw new InvalidPINFormatError("New PIN must be exactly 4 digits.");
    }

    const success = account.changePin(oldPin, newPin);
    if (success) {
        console.log("  PIN changed successfully.");
    } else {
        console.log("  Current PIN is incorrect.");
    }
}

function handleMiniStatement(account) {
    const txns = account.getMiniStatement(5);
    console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
    console.log("║                        MINI STATEMENT                               ║");
    console.log("╠══════════════════════════════════════════════════════════════════════╣");
    console.log(`  Account: ${account.accountNumber}  |  Type: ${account.accountType}`);
    console.log("╠══════════════════════════════════════════════════════════════════════╣");
    if (txns.length === 0) {
        console.log("  No transactions found.");
    } else {
        console.log("  " + "ID".padEnd(12) + "| " + "Date".padEnd(14) + "| " + "Type".padEnd(12) + "| " + "Amount".padStart(14) + " | Status");
        console.log("  " + "-".repeat(70));
        for (const txn of txns) {
            console.log("  " + txn.toString());
        }
    }
    console.log("╠══════════════════════════════════════════════════════════════════════╣");
    console.log(`  Current Balance: Rs. ${fmt(account.balance)}`);
    console.log("╚══════════════════════════════════════════════════════════════════════╝");
}

async function handleSwitchAccount(card, currentAccount) {
    const linked = card.linkedAccountNumbers;
    if (linked.length <= 1) {
        console.log("  Only one account linked. Cannot switch.");
        return currentAccount;
    }

    console.log("\n  Linked Accounts:");
    const customer = bank.getCustomerByCard(card.cardNumber);
    for (let i = 0; i < linked.length; i++) {
        const acc = bank.getAccount(linked[i]);
        const marker = acc.accountNumber === currentAccount.accountNumber ? " <-- current" : "";
        console.log(`    ${i + 1}. ${acc.accountNumber} (${acc.accountType}) - Rs. ${fmt(acc.balance)}${marker}`);
    }

    const choice = await ask("  Select account number: ");
    const selected = bank.getAccount(choice);
    if (!card.linkedAccountNumbers.includes(selected.accountNumber)) {
        console.log("  Invalid selection.");
        return currentAccount;
    }
    atm.selectAccount(selected.accountNumber);
    console.log(`  Switched to account ${selected.accountNumber} (${selected.accountType})`);
    return selected;
}

// ─── Main ATM Flow ──────────────────────────────────────────────
async function runATM() {
    printHeader();
    console.log("\nAvailable cards for demo:");
    console.log(`  Card: ${card1.maskedCardNumber} | PIN: 1234 | Accounts: ${card1.linkedAccountNumbers.join(", ")}`);
    console.log(`  Card: ${card2.maskedCardNumber} | PIN: 5678 | Accounts: ${card2.linkedAccountNumbers.join(", ")}`);
    console.log(`  Card: ${card3.maskedCardNumber} | PIN: 9999 | Accounts: ${card3.linkedAccountNumbers.join(", ")}`);

    while (true) {
        console.log("\n────────────────────────────────────────");
        const action = await ask("Insert card? (card number / 'quit' / 'admin'): ");

        if (action.toLowerCase() === "quit") {
            console.log("\nThank you for using the ATM. Goodbye!");
            rl.close();
            return;
        }

        if (action.toLowerCase() === "admin") {
            atm.showCashStatus();
            bank.showAllAccounts();
            continue;
        }

        const card = bank.getCard(action);
        if (!card) {
            console.log("  Invalid card number. Please try again.");
            continue;
        }

        if (!card.isActive) {
            console.log(`  Card ${card.maskedCardNumber} is BLOCKED. Contact your bank.`);
            continue;
        }

        atm.insertCard(card);
        console.log(`  Card ${card.maskedCardNumber} inserted.`);

        // ── PIN Authentication ──
        let authenticated = false;
        while (!authenticated) {
            const pin = await ask("  Enter PIN: ");
            const result = atm.authenticate(pin);
            console.log(`  ${result.message}`);
            if (result.success) {
                authenticated = true;
            } else if (result.blocked) {
                console.log("  Card has been BLOCKED. Ejecting card...");
                atm.ejectCard();
                break;
            }
        }

        if (!authenticated) continue;

        // ── Account Selection ──
        const linkedAccounts = bank.getLinkedAccounts(card.cardNumber);
        let currentAccount;

        if (linkedAccounts.length === 1) {
            currentAccount = linkedAccounts[0];
            atm.selectAccount(currentAccount.accountNumber);
            console.log(`\n  Using account: ${currentAccount.accountNumber} (${currentAccount.accountType})`);
        } else {
            console.log("\n  Select account to use:");
            for (let i = 0; i < linkedAccounts.length; i++) {
                const acc = linkedAccounts[i];
                console.log(`    ${i + 1}. ${acc.accountNumber} (${acc.accountType}) - Rs. ${fmt(acc.balance)}`);
            }
            const accChoice = await ask("  Enter choice: ");
            const idx = parseInt(accChoice) - 1;
            if (idx < 0 || idx >= linkedAccounts.length) {
                console.log("  Invalid selection. Ejecting card...");
                atm.ejectCard();
                continue;
            }
            currentAccount = linkedAccounts[idx];
            atm.selectAccount(currentAccount.accountNumber);
            console.log(`\n  Using account: ${currentAccount.accountNumber} (${currentAccount.accountType})`);
        }

        // ── ATM Menu Loop ──
        let menuActive = true;
        while (menuActive) {
            printMenu();
            const choice = await ask("  Select option: ");

            try {
                switch (choice) {
                    case "1":
                        await handleCheckBalance(currentAccount);
                        break;
                    case "2":
                        await handleDeposit(currentAccount);
                        break;
                    case "3":
                        await handleWithdraw(currentAccount);
                        break;
                    case "4":
                        await handleTransfer(currentAccount);
                        break;
                    case "5":
                        await handleChangePin(currentAccount);
                        break;
                    case "6":
                        handleMiniStatement(currentAccount);
                        break;
                    case "7":
                        currentAccount = await handleSwitchAccount(card, currentAccount);
                        break;
                    case "8":
                        menuActive = false;
                        console.log("\n  Transaction complete. Ejecting card...");
                        atm.ejectCard();
                        console.log("  Thank you for using the ATM!");
                        break;
                    default:
                        console.log("  Invalid option. Please select 1-8.");
                }
            } catch (err) {
                if (err instanceof ATMError) {
                    console.log(`\n  [ERROR] ${err.message}`);
                } else {
                    console.log(`\n  [ERROR] ${err.message}`);
                }
            }

            if (menuActive) {
                await pause();
            }
        }
    }
}

// ─── Entry Point ────────────────────────────────────────────────
runATM();

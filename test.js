const Bank = require("./bank");
const ATM = require("./atm");
const {
    DepositTransaction,
    WithdrawalTransaction,
    TransferTransaction,
} = require("./transaction");
const {
    InsufficientBalanceError,
    DailyLimitExceededError,
    InvalidAmountError,
    AccountInactiveError,
    MinimumBalanceError,
    OverdraftLimitExceededError,
    InvalidPINError,
    CardBlockedError,
    InvalidAccountError,
    SameAccountTransferError,
    InsufficientATMFundsError,
    DenominationError,
} = require("./exceptions");

let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  PASS: ${testName}`);
        passed++;
    } else {
        console.log(`  FAIL: ${testName}`);
        failed++;
    }
}

function assertThrows(fn, ErrorType, testName) {
    try {
        fn();
        console.log(`  FAIL: ${testName} (no error thrown)`);
        failed++;
    } catch (err) {
        if (err instanceof ErrorType) {
            console.log(`  PASS: ${testName}`);
            passed++;
        } else {
            console.log(`  FAIL: ${testName} (wrong error: ${err.constructor.name})`);
            failed++;
        }
    }
}

// ─── Setup ───────────────────────────────────────────────────
console.log("\n===== SETTING UP TEST DATA =====");
const bank = new Bank("Test Bank");
const atm = new ATM("ATM-01", "Test Location");
atm.loadCash({ 500: 20, 1000: 30, 5000: 10 });

const cust1 = bank.createCustomer("Ali Khan", "ali@test.com", "0301-1111111");
const cust2 = bank.createCustomer("Sara Malik", "sara@test.com", "0321-2222222");

const acc1 = bank.createSavingsAccount(cust1.customerId, 75000, "1234");
const acc2 = bank.createCurrentAccount(cust1.customerId, 150000, "1234");
const acc3 = bank.createSavingsAccount(cust2.customerId, 50000, "5678");

const card1 = bank.issueCard(cust1.customerId, "1234", [
    acc1.accountNumber,
    acc2.accountNumber,
]);
const card2 = bank.issueCard(cust2.customerId, "5678", [acc3.accountNumber]);

console.log(`  Customer 1: ${cust1.customerId} (${cust1.name})`);
console.log(`  Customer 2: ${cust2.customerId} (${cust2.name})`);
console.log(`  Savings 1:  ${acc1.accountNumber} (Rs. ${acc1.balance})`);
console.log(`  Current 1:  ${acc2.accountNumber} (Rs. ${acc2.balance})`);
console.log(`  Savings 2:  ${acc3.accountNumber} (Rs. ${acc3.balance})`);
console.log(`  Card 1:     ${card1.maskedCardNumber}`);
console.log(`  Card 2:     ${card2.maskedCardNumber}`);

// ─── Test: Card Authentication ──────────────────────────────
console.log("\n===== TEST: Card Authentication =====");
atm.insertCard(card1);
assert(atm.insertedCard === card1, "Card inserted successfully");

const badPin = atm.authenticate("0000");
assert(!badPin.success, "Wrong PIN fails authentication");
assert(badPin.attemptsRemaining === 2, "2 attempts remaining after first failure");

const badPin2 = atm.authenticate("0000");
assert(!badPin2.success, "Second wrong PIN fails");
assert(badPin2.attemptsRemaining === 1, "1 attempt remaining after second failure");

const badPin3 = atm.authenticate("0000");
assert(!badPin3.success, "Third wrong PIN fails");
assert(badPin3.blocked === true, "Card blocked after 3 failures");
assert(!card1.isActive, "Card is now inactive");

// Reset card for further tests
card1.unblock();
atm.ejectCard();
atm.insertCard(card1);

const correctPin = atm.authenticate("1234");
assert(correctPin.success, "Correct PIN authenticates");

// ─── Test: Account Operations ───────────────────────────────
console.log("\n===== TEST: Savings Account Operations =====");

const initialBalance = acc1.balance;
assert(initialBalance === 75000, "Initial balance is 75000");

// Deposit
const depTxn = new DepositTransaction(20000, acc1);
depTxn.execute();
assert(acc1.balance === 95000, "Deposit of 20000 successful (balance = 95000)");
assert(depTxn.status === "SUCCESS", "Deposit transaction marked SUCCESS");

// Withdraw
const witTxn = new WithdrawalTransaction(10000, acc1);
witTxn.execute();
// 95000 - 10000 (amount) - 50 (fee) = 84950
assert(acc1.balance === 84950, "Withdrawal of 10000 successful (balance = 84950 after fee)");

// Invalid withdrawal - too small
assertThrows(
    () => new WithdrawalTransaction(100, acc1).execute(),
    InvalidAmountError,
    "Withdrawal below min 500 fails"
);

// Invalid withdrawal - negative
assertThrows(
    () => new DepositTransaction(-500, acc1).execute(),
    InvalidAmountError,
    "Negative deposit fails"
);

// Check balance
assert(acc1.checkBalance() === 84950, "checkBalance returns correct value");

// Mini statement
const stmt = acc1.getMiniStatement(5);
assert(stmt.length === 2, "Mini statement has 2 transactions");
assert(stmt[1] instanceof DepositTransaction, "First txn in statement is deposit");
assert(stmt[0] instanceof WithdrawalTransaction, "Second txn in statement is withdrawal");

// ─── Test: Savings Account Limits ───────────────────────────
console.log("\n===== TEST: Savings Account Limits =====");

// Reset savings account to clean state for limit tests
const testSavings = bank.createSavingsAccount(cust2.customerId, 200000, "1111");

// Withdrawal below minimum balance
const minBalSavings = bank.createSavingsAccount(cust2.customerId, 20000, "2222");
new WithdrawalTransaction(10000, minBalSavings).execute();
assertThrows(
    () => new WithdrawalTransaction(10000, minBalSavings).execute(),
    MinimumBalanceError,
    "Withdrawal that breaks min balance fails"
);

// Daily limit test
// Daily limit test (savings: 100k daily, 50k per txn)
const limitSavings = bank.createSavingsAccount(cust2.customerId, 500000, "2222");
new WithdrawalTransaction(50000, limitSavings).execute();
new WithdrawalTransaction(50000, limitSavings).execute();
assertThrows(
    () => new WithdrawalTransaction(5000, limitSavings).execute(),
    DailyLimitExceededError,
    "Daily withdrawal limit exceeded (100k)"
);

// Max per transaction test
const maxSavings = bank.createSavingsAccount(cust2.customerId, 500000, "3333");
assertThrows(
    () => new WithdrawalTransaction(60000, maxSavings).execute(),
    InvalidAmountError,
    "Withdrawal above max per txn (50000) fails"
);

// ─── Test: Current Account Operations ────────────────────────
console.log("\n===== TEST: Current Account Operations =====");

assert(acc2.balance === 150000, "Current account initial balance is 150000");
assert(acc2.accountType === "CURRENT", "Account type is CURRENT");
assert(acc2.getAvailableForWithdrawal() === 200000, "Available = balance + 50000 overdraft");

// Withdrawal using overdraft
const currentTest = bank.createCurrentAccount(cust1.customerId, 5000, "4444");
const witCurrent = new WithdrawalTransaction(10000, currentTest);
witCurrent.execute();
// 5000 - 10000 - 0 (fee) = -5000
assert(currentTest.balance === -5000, "Current account can go negative via overdraft (balance = -5000)");

// Overdraft exceeded
const currentTest2 = bank.createCurrentAccount(cust1.customerId, 10000, "5555");
assertThrows(
    () => new WithdrawalTransaction(65000, currentTest2).execute(),
    OverdraftLimitExceededError,
    "Overdraft limit exceeded for current account"
);

// ─── Test: Transfer ─────────────────────────────────────────
console.log("\n===== TEST: Transfer =====");

const transferFrom = bank.createSavingsAccount(cust1.customerId, 100000, "6666");
const transferTo = bank.createSavingsAccount(cust2.customerId, 50000, "7777");

bank.validateTransfer(transferFrom.accountNumber, transferTo.accountNumber, 20000);
const transferTxn = new TransferTransaction(20000, transferFrom, transferTo);
transferTxn.execute();

assert(transferFrom.balance === 79900, "Sender balance decreased (100000 - 20000 - 100 fee = 79900)");
assert(transferTo.balance === 70000, "Receiver balance increased (50000 + 20000 = 70000)");

// Same account transfer
assertThrows(
    () => bank.validateTransfer(transferFrom.accountNumber, transferFrom.accountNumber, 1000),
    SameAccountTransferError,
    "Same account transfer fails"
);

// Invalid account transfer
assertThrows(
    () => bank.validateTransfer(transferFrom.accountNumber, "99999999", 1000),
    InvalidAccountError,
    "Transfer to invalid account fails"
);

// ─── Test: ATM Cash Management ──────────────────────────────
console.log("\n===== TEST: ATM Cash Management =====");

const cashATM = new ATM("ATM-CASH", "Test");
cashATM.loadCash({ 500: 2, 1000: 1, 5000: 1 });
// Total: 1000 + 1000 + 5000 = 7000
assert(cashATM.totalCash === 7000, "ATM total cash is 7000");

const dispensed = cashATM.dispenseCash(1500);
assert(dispensed[1000] === 1, "Dispensed 1x1000");
assert(dispensed[500] === 1, "Dispensed 1x500");
assert(cashATM.totalCash === 5500, "ATM cash reduced to 5500");

assertThrows(
    () => cashATM.dispenseCash(100000),
    InsufficientATMFundsError,
    "ATM insufficient funds error"
);

assertThrows(
    () => cashATM.dispenseCash(300),
    DenominationError,
    "Non-500 multiple fails"
);

// ─── Test: PIN Management ───────────────────────────────────
console.log("\n===== TEST: PIN Management =====");

assert(acc1.changePin("1234", "5678") === true, "PIN change with correct old PIN succeeds");
assert(acc1.changePin("1234", "9999") === false, "PIN change with wrong old PIN fails");
assert(acc1.changePin("5678", "abcd") === false, "Non-numeric PIN fails");

// ─── Test: Account Activation/Deactivation ──────────────────
console.log("\n===== TEST: Account Deactivation =====");

const deactivateTest = bank.createSavingsAccount(cust1.customerId, 10000, "8888");
deactivateTest.deactivate();
assert(!deactivateTest.isActive, "Account deactivated");

assertThrows(
    () => new DepositTransaction(5000, deactivateTest).execute(),
    AccountInactiveError,
    "Deposit to inactive account fails"
);

assertThrows(
    () => new WithdrawalTransaction(1000, deactivateTest).execute(),
    AccountInactiveError,
    "Withdrawal from inactive account fails"
);

assertThrows(
    () => deactivateTest.checkBalance(),
    AccountInactiveError,
    "Balance check on inactive account fails"
);

deactivateTest.activate();
assert(deactivateTest.isActive, "Account reactivated");
new DepositTransaction(5000, deactivateTest).execute();
assert(deactivateTest.balance === 15000, "Deposit works after reactivation");

// ─── Test: Polymorphism ─────────────────────────────────────
console.log("\n===== TEST: Polymorphism =====");

const savings = bank.createSavingsAccount(cust1.customerId, 100000, "0001");
const current = bank.createCurrentAccount(cust1.customerId, 100000, "0002");

assert(savings.calculateWithdrawalLimit() === 50000, "Savings withdrawal limit = 50000");
assert(current.calculateWithdrawalLimit() === 100000, "Current withdrawal limit = 100000");
assert(savings.getAvailableForWithdrawal() === 95000, "Savings available = balance - 5000 min");
assert(current.getAvailableForWithdrawal() === 150000, "Current available = balance + 50000 overdraft");
assert(savings.getWithdrawalFee() === 50, "Savings withdrawal fee = 50");
assert(current.getWithdrawalFee() === 0, "Current withdrawal fee = 0");
assert(savings.getTransferFee() === 100, "Savings transfer fee = 100");
assert(current.getTransferFee() === 50, "Current transfer fee = 50");

// ─── Test: Encapsulation ────────────────────────────────────
console.log("\n===== TEST: Encapsulation =====");

const encAccount = bank.createSavingsAccount(cust1.customerId, 50000, "1111");
assert(encAccount._balance === 50000, "Internal _balance accessible (JS limitation)");
assert(typeof encAccount.balance === "number", "Public getter works");
encAccount._deposit(5000);
assert(encAccount.balance === 55000, "Balance changed only through _deposit()");

// ─── Summary ────────────────────────────────────────────────
console.log("\n========================================");
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log("========================================");

if (failed > 0) {
    process.exit(1);
} else {
    console.log("  All tests passed!\n");
}

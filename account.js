const {
    InsufficientBalanceError,
    InvalidAmountError,
    AccountInactiveError,
    DailyLimitExceededError,
    MinimumBalanceError,
    OverdraftLimitExceededError,
} = require("./exceptions");

class Account {
    static _nextNumber = 10000000;

    static AccountType = Object.freeze({
        SAVINGS: "SAVINGS",
        CURRENT: "CURRENT",
    });

    constructor(accountHolder, pin, accountType) {
        if (new.target === Account) {
            throw new Error("Cannot instantiate abstract class Account directly.");
        }
        Account._nextNumber += 1;
        this._accountNumber = String(Account._nextNumber);
        this._accountHolder = accountHolder;
        this._balance = 0;
        this._pin = String(pin).padStart(4, "0");
        this._isActive = true;
        this._accountType = accountType;
        this._transactions = [];
        this._dailyWithdrawn = 0;
        this._dailyTransferred = 0;
        this._lastActivityDate = new Date().toDateString();
        this._transactionFee = 0;
        this._withdrawalFee = 0;
        this._transferFee = 0;
    }

    get accountNumber() {
        return this._accountNumber;
    }

    get accountHolder() {
        return this._accountHolder;
    }

    get balance() {
        return this._balance;
    }

    get accountType() {
        return this._accountType;
    }

    get isActive() {
        return this._isActive;
    }

    get transactions() {
        return [...this._transactions];
    }

    get dailyWithdrawn() {
        this._resetDailyIfNeeded();
        return this._dailyWithdrawn;
    }

    get dailyTransferred() {
        this._resetDailyIfNeeded();
        return this._dailyTransferred;
    }

    _resetDailyIfNeeded() {
        const today = new Date().toDateString();
        if (this._lastActivityDate !== today) {
            this._dailyWithdrawn = 0;
            this._dailyTransferred = 0;
            this._lastActivityDate = today;
        }
    }

    _validateActive() {
        if (!this._isActive) {
            throw new AccountInactiveError(this._accountNumber);
        }
    }

    _validateAmount(amount) {
        if (typeof amount !== "number" || isNaN(amount) || amount <= 0) {
            throw new InvalidAmountError("Amount must be a positive number.");
        }
    }

    _deposit(amount) {
        this._validateActive();
        this._validateAmount(amount);
        this._balance += amount;
        return this._balance;
    }

    _withdraw(amount) {
        this._validateActive();
        this._validateAmount(amount);
        if (amount > this._balance) {
            throw new InsufficientBalanceError(this._balance, amount);
        }
        this._balance -= amount;
        return this._balance;
    }

    _addTransaction(transaction) {
        this._transactions.push(transaction);
    }

    changePin(oldPin, newPin) {
        this._validateActive();
        const oldStr = String(oldPin).padStart(4, "0");
        const newStr = String(newPin).padStart(4, "0");
        if (oldStr !== this._pin) {
            return false;
        }
        if (!/^\d{4}$/.test(newStr)) {
            return false;
        }
        this._pin = newPin;
        return true;
    }

    checkBalance() {
        this._validateActive();
        return this._balance;
    }

    getMiniStatement(count = 5) {
        const recent = this._transactions.slice(-count).reverse();
        return recent;
    }

    deactivate() {
        this._isActive = false;
    }

    activate() {
        this._isActive = true;
    }

    calculateWithdrawalLimit() {
        throw new Error("calculateWithdrawalLimit() must be implemented by subclass.");
    }

    getAvailableForWithdrawal() {
        throw new Error("getAvailableForWithdrawal() must be implemented by subclass.");
    }

    getWithdrawalFee() {
        return this._withdrawalFee;
    }

    getTransferFee() {
        return this._transferFee;
    }
}

class SavingsAccount extends Account {
    static MINIMUM_BALANCE = 5000;
    static MAX_WITHDRAWAL_PER_TXN = 50000;
    static DAILY_WITHDRAWAL_LIMIT = 100000;
    static MIN_WITHDRAWAL = 500;

    constructor(accountHolder, pin) {
        super(accountHolder, pin, Account.AccountType.SAVINGS);
        this._withdrawalFee = 50;
        this._transferFee = 100;
    }

    calculateWithdrawalLimit() {
        return SavingsAccount.MAX_WITHDRAWAL_PER_TXN;
    }

    getAvailableForWithdrawal() {
        const available = this._balance - SavingsAccount.MINIMUM_BALANCE;
        return Math.max(0, available);
    }

    getDailyWithdrawalLimit() {
        return SavingsAccount.DAILY_WITHDRAWAL_LIMIT;
    }

    _withdraw(amount, feeOverride) {
        this._validateActive();
        this._validateAmount(amount);

        if (amount < SavingsAccount.MIN_WITHDRAWAL) {
            throw new InvalidAmountError(
                `Minimum withdrawal is Rs. ${SavingsAccount.MIN_WITHDRAWAL.toLocaleString("en-IN")}.`
            );
        }

        if (amount > SavingsAccount.MAX_WITHDRAWAL_PER_TXN) {
            throw new InvalidAmountError(
                `Maximum withdrawal per transaction is Rs. ${SavingsAccount.MAX_WITHDRAWAL_PER_TXN.toLocaleString("en-IN")}.`
            );
        }

        this._resetDailyIfNeeded();
        if (this._dailyWithdrawn + amount > SavingsAccount.DAILY_WITHDRAWAL_LIMIT) {
            throw new DailyLimitExceededError("withdrawal", SavingsAccount.DAILY_WITHDRAWAL_LIMIT);
        }

        const fee = feeOverride !== undefined ? feeOverride : this._withdrawalFee;
        const totalNeeded = amount + fee;

        if (this._balance - totalNeeded < SavingsAccount.MINIMUM_BALANCE) {
            throw new MinimumBalanceError(SavingsAccount.MINIMUM_BALANCE);
        }

        if (totalNeeded > this._balance) {
            throw new InsufficientBalanceError(this._balance, totalNeeded);
        }

        this._balance -= totalNeeded;
        this._dailyWithdrawn += amount;
        return this._balance;
    }

    _deposit(amount) {
        this._validateActive();
        this._validateAmount(amount);
        this._balance += amount;
        return this._balance;
    }
}

class CurrentAccount extends Account {
    static OVERDRAFT_LIMIT = 50000;
    static MAX_WITHDRAWAL_PER_TXN = 100000;
    static DAILY_WITHDRAWAL_LIMIT = 200000;
    static MIN_WITHDRAWAL = 500;

    constructor(accountHolder, pin) {
        super(accountHolder, pin, Account.AccountType.CURRENT);
        this._withdrawalFee = 0;
        this._transferFee = 50;
    }

    calculateWithdrawalLimit() {
        return CurrentAccount.MAX_WITHDRAWAL_PER_TXN;
    }

    getAvailableForWithdrawal() {
        return this._balance + CurrentAccount.OVERDRAFT_LIMIT;
    }

    getDailyWithdrawalLimit() {
        return CurrentAccount.DAILY_WITHDRAWAL_LIMIT;
    }

    _withdraw(amount, feeOverride) {
        this._validateActive();
        this._validateAmount(amount);

        if (amount < CurrentAccount.MIN_WITHDRAWAL) {
            throw new InvalidAmountError(
                `Minimum withdrawal is Rs. ${CurrentAccount.MIN_WITHDRAWAL.toLocaleString("en-IN")}.`
            );
        }

        if (amount > CurrentAccount.MAX_WITHDRAWAL_PER_TXN) {
            throw new InvalidAmountError(
                `Maximum withdrawal per transaction is Rs. ${CurrentAccount.MAX_WITHDRAWAL_PER_TXN.toLocaleString("en-IN")}.`
            );
        }

        this._resetDailyIfNeeded();
        if (this._dailyWithdrawn + amount > CurrentAccount.DAILY_WITHDRAWAL_LIMIT) {
            throw new DailyLimitExceededError("withdrawal", CurrentAccount.DAILY_WITHDRAWAL_LIMIT);
        }

        const fee = feeOverride !== undefined ? feeOverride : this._withdrawalFee;
        const totalNeeded = amount + fee;
        if (totalNeeded > this._balance + CurrentAccount.OVERDRAFT_LIMIT) {
            throw new OverdraftLimitExceededError(
                this._balance,
                CurrentAccount.OVERDRAFT_LIMIT,
                totalNeeded
            );
        }

        this._balance -= totalNeeded;
        this._dailyWithdrawn += amount;
        return this._balance;
    }

    _deposit(amount) {
        this._validateActive();
        this._validateAmount(amount);
        this._balance += amount;
        return this._balance;
    }
}

module.exports = { Account, SavingsAccount, CurrentAccount };

class ATMError extends Error {
    constructor(message) {
        super(message);
        this.name = "ATMError";
    }
}

class InvalidPINError extends ATMError {
    constructor(attemptsRemaining = 0) {
        const msg =
            attemptsRemaining > 0
                ? `Invalid PIN. ${attemptsRemaining} attempt(s) remaining.`
                : "Invalid PIN. No attempts remaining. Card blocked.";
        super(msg);
        this.name = "InvalidPINError";
        this.attemptsRemaining = attemptsRemaining;
    }
}

class CardBlockedError extends ATMError {
    constructor(cardNumber = "") {
        super(`Card ${cardNumber} is blocked. Contact your bank.`);
        this.name = "CardBlockedError";
    }
}

class InsufficientBalanceError extends ATMError {
    constructor(balance = 0, amount = 0) {
        super(
            `Insufficient balance. Available: Rs. ${balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}, Requested: Rs. ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
        );
        this.name = "InsufficientBalanceError";
    }
}

class InsufficientATMFundsError extends ATMError {
    constructor(atmCash = 0, amount = 0) {
        super(
            `ATM has insufficient cash. Available: Rs. ${atmCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}, Requested: Rs. ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
        );
        this.name = "InsufficientATMFundsError";
    }
}

class InvalidAmountError extends ATMError {
    constructor(message = "Invalid amount.") {
        super(message);
        this.name = "InvalidAmountError";
    }
}

class AccountInactiveError extends ATMError {
    constructor(accountNumber = "") {
        super(`Account ${accountNumber} is inactive/blocked.`);
        this.name = "AccountInactiveError";
    }
}

class DailyLimitExceededError extends ATMError {
    constructor(limitType = "withdrawal", limit = 0) {
        super(
            `Daily ${limitType} limit of Rs. ${limit.toLocaleString("en-IN", { minimumFractionDigits: 2 })} exceeded.`
        );
        this.name = "DailyLimitExceededError";
    }
}

class InvalidAccountError extends ATMError {
    constructor(accountNumber = "") {
        super(`Account ${accountNumber} not found.`);
        this.name = "InvalidAccountError";
    }
}

class SameAccountTransferError extends ATMError {
    constructor() {
        super("Cannot transfer to the same account.");
        this.name = "SameAccountTransferError";
    }
}

class MinimumBalanceError extends ATMError {
    constructor(minimum = 0) {
        super(
            `Minimum balance of Rs. ${minimum.toLocaleString("en-IN", { minimumFractionDigits: 2 })} must be maintained.`
        );
        this.name = "MinimumBalanceError";
    }
}

class DenominationError extends ATMError {
    constructor() {
        super("Amount cannot be dispensed with available denominations. Try a multiple of 500.");
        this.name = "DenominationError";
    }
}

class CardNotInsertedException extends ATMError {
    constructor() {
        super("No card inserted. Please insert your card first.");
        this.name = "CardNotInsertedException";
    }
}

class InvalidPINFormatError extends ATMError {
    constructor(message = "PIN must be exactly 4 digits.") {
        super(message);
        this.name = "InvalidPINFormatError";
    }
}

class OverdraftLimitExceededError extends ATMError {
    constructor(balance = 0, overdraftLimit = 0, amount = 0) {
        const available = balance + overdraftLimit;
        super(
            `Overdraft limit exceeded. Available (balance + overdraft): Rs. ${available.toLocaleString("en-IN", { minimumFractionDigits: 2 })}, Requested: Rs. ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
        );
        this.name = "OverdraftLimitExceededError";
    }
}

module.exports = {
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
    CardNotInsertedException,
    InvalidPINFormatError,
    OverdraftLimitExceededError,
};

const TransactionStatus = Object.freeze({
    SUCCESS: "SUCCESS",
    FAILED: "FAILED",
    PENDING: "PENDING",
});

class Transaction {
    static _nextId = 1000;

    constructor(amount, accountNumber) {
        if (new.target === Transaction) {
            throw new Error("Cannot instantiate abstract class Transaction directly.");
        }
        Transaction._nextId += 1;
        this._transactionId = `TXN-${Transaction._nextId}`;
        this._amount = amount;
        this._accountNumber = accountNumber;
        this._date = new Date();
        this._status = TransactionStatus.PENDING;
    }

    get transactionId() {
        return this._transactionId;
    }

    get amount() {
        return this._amount;
    }

    get date() {
        return this._date;
    }

    get status() {
        return this._status;
    }

    get accountNumber() {
        return this._accountNumber;
    }

    _markSuccess() {
        this._status = TransactionStatus.SUCCESS;
    }

    _markFailed() {
        this._status = TransactionStatus.FAILED;
    }

    execute() {
        throw new Error("execute() must be implemented by subclass.");
    }

    getType() {
        throw new Error("getType() must be implemented by subclass.");
    }

    getSign() {
        throw new Error("getSign() must be implemented by subclass.");
    }

    _formatDate() {
        const d = this._date;
        const months = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
        ];
        const dd = String(d.getDate()).padStart(2, "0");
        const mon = months[d.getMonth()];
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return `${dd}-${mon} ${hh}:${mm}`;
    }

    toString() {
        const amt = this._amount.toLocaleString("en-IN", { minimumFractionDigits: 2 });
        return `${this._transactionId} | ${this._formatDate()} | ${this.getType().padEnd(12)} | ${this.getSign()}${amt.padStart(14)} | ${this._status}`;
    }
}

class DepositTransaction extends Transaction {
    constructor(amount, account) {
        super(amount, account.accountNumber);
        this._account = account;
    }

    getType() {
        return "DEPOSIT";
    }

    getSign() {
        return "+";
    }

    execute() {
        this._account._deposit(this._amount);
        this._account._addTransaction(this);
        this._markSuccess();
        return true;
    }
}

class WithdrawalTransaction extends Transaction {
    constructor(amount, account) {
        super(amount, account.accountNumber);
        this._account = account;
    }

    getType() {
        return "WITHDRAWAL";
    }

    getSign() {
        return "-";
    }

    execute() {
        this._account._withdraw(this._amount);
        this._account._addTransaction(this);
        this._markSuccess();
        return true;
    }
}

class TransferTransaction extends Transaction {
    constructor(amount, senderAccount, receiverAccount) {
        super(amount, senderAccount.accountNumber);
        this._senderAccount = senderAccount;
        this._receiverAccount = receiverAccount;
    }

    get receiverAccountNumber() {
        return this._receiverAccount.accountNumber;
    }

    getType() {
        return "TRANSFER";
    }

    getSign() {
        return "-";
    }

    execute() {
        this._senderAccount._withdraw(this._amount, this._senderAccount._transferFee);
        this._receiverAccount._deposit(this._amount);

        this._senderAccount._addTransaction(this);

        const creditTxn = new TransferCreditTransaction(
            this._amount,
            this._receiverAccount,
            this._senderAccount
        );
        creditTxn._markSuccess();
        this._receiverAccount._addTransaction(creditTxn);

        this._markSuccess();
        return true;
    }

    toString() {
        const amt = this._amount.toLocaleString("en-IN", { minimumFractionDigits: 2 });
        return `${this._transactionId} | ${this._formatDate()} | TRANSFER     | -${amt.padStart(13)} | To: ${this._receiverAccount.accountNumber} | ${this._status}`;
    }
}

class TransferCreditTransaction extends Transaction {
    constructor(amount, receiverAccount, senderAccount) {
        super(amount, receiverAccount.accountNumber);
        this._receiverAccount = receiverAccount;
        this._senderAccount = senderAccount;
    }

    getType() {
        return "TRANSFER";
    }

    getSign() {
        return "+";
    }

    execute() {
        return true;
    }

    toString() {
        const amt = this._amount.toLocaleString("en-IN", { minimumFractionDigits: 2 });
        return `${this._transactionId} | ${this._formatDate()} | TRANSFER     | +${amt.padStart(13)} | From: ${this._senderAccount.accountNumber} | ${this._status}`;
    }
}

module.exports = {
    Transaction,
    TransactionStatus,
    DepositTransaction,
    WithdrawalTransaction,
    TransferTransaction,
    TransferCreditTransaction,
};

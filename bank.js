const Customer = require("./customer");
const Card = require("./card");
const { SavingsAccount, CurrentAccount } = require("./account");
const { InvalidAccountError, SameAccountTransferError } = require("./exceptions");

class Bank {
    constructor(name) {
        this._name = name;
        this._customers = new Map();
        this._accounts = new Map();
        this._cards = new Map();
    }

    get name() {
        return this._name;
    }

    createCustomer(name, email, phone) {
        const customer = new Customer(name, email, phone);
        this._customers.set(customer.customerId, customer);
        return customer;
    }

    createSavingsAccount(customerId, initialDeposit = 0, pin) {
        const customer = this._customers.get(customerId);
        if (!customer) {
            throw new Error(`Customer ${customerId} not found.`);
        }
        const account = new SavingsAccount(customer.name, pin);
        if (initialDeposit > 0) {
            account._deposit(initialDeposit);
        }
        this._accounts.set(account.accountNumber, account);
        customer.addAccount(account.accountNumber);
        return account;
    }

    createCurrentAccount(customerId, initialDeposit = 0, pin) {
        const customer = this._customers.get(customerId);
        if (!customer) {
            throw new Error(`Customer ${customerId} not found.`);
        }
        const account = new CurrentAccount(customer.name, pin);
        if (initialDeposit > 0) {
            account._deposit(initialDeposit);
        }
        this._accounts.set(account.accountNumber, account);
        customer.addAccount(account.accountNumber);
        return account;
    }

    issueCard(customerId, pin, linkedAccountNumbers = []) {
        const customer = this._customers.get(customerId);
        if (!customer) {
            throw new Error(`Customer ${customerId} not found.`);
        }
        const card = new Card(customerId, pin);
        for (const accNum of linkedAccountNumbers) {
            const account = this._accounts.get(accNum);
            if (account) {
                card.linkAccount(accNum);
            }
        }
        this._cards.set(card.cardNumber, card);
        customer.addCard(card);
        return card;
    }

    getAccount(accountNumber) {
        const account = this._accounts.get(accountNumber);
        if (!account) {
            throw new InvalidAccountError(accountNumber);
        }
        return account;
    }

    getCustomer(customerId) {
        return this._customers.get(customerId) || null;
    }

    getCard(cardNumber) {
        return this._cards.get(cardNumber) || null;
    }

    getCustomerByCard(cardNumber) {
        const card = this._cards.get(cardNumber);
        if (!card) return null;
        return this._customers.get(card.customerId) || null;
    }

    getLinkedAccounts(cardNumber) {
        const card = this._cards.get(cardNumber);
        if (!card) return [];
        return card.linkedAccountNumbers
            .map((num) => this._accounts.get(num))
            .filter(Boolean);
    }

    validateTransfer(senderAccountNumber, receiverAccountNumber, amount) {
        if (senderAccountNumber === receiverAccountNumber) {
            throw new SameAccountTransferError();
        }
        const sender = this._accounts.get(senderAccountNumber);
        const receiver = this._accounts.get(receiverAccountNumber);
        if (!sender) throw new InvalidAccountError(senderAccountNumber);
        if (!receiver) throw new InvalidAccountError(receiverAccountNumber);
    }

    showAllAccounts() {
        console.log(`\n===== ${this._name} - ALL ACCOUNTS =====`);
        for (const [num, acc] of this._accounts) {
            const balance = acc.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 });
            console.log(`  ${num} | ${acc.accountType.padEnd(8)} | ${acc.accountHolder.padEnd(20)} | Rs. ${balance}`);
        }
        console.log("========================================\n");
    }

    showAllCustomers() {
        console.log(`\n===== ${this._name} - ALL CUSTOMERS =====`);
        for (const [id, cust] of this._customers) {
            console.log(`  ${id} | ${cust.name.padEnd(20)} | ${cust.email} | ${cust.phone}`);
            console.log(`         Accounts: ${cust.accountNumbers.join(", ") || "None"}`);
            console.log(`         Cards: ${cust.cards.map((c) => c.maskedCardNumber).join(", ") || "None"}`);
        }
        console.log("==========================================\n");
    }
}

module.exports = Bank;

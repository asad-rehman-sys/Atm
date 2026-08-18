class Customer {
    static _nextId = 1000;

    constructor(name, email, phone) {
        Customer._nextId += 1;
        this._customerId = `CUST-${Customer._nextId}`;
        this._name = name;
        this._email = email;
        this._phone = phone;
        this._cards = [];
        this._accountNumbers = [];
    }

    get customerId() {
        return this._customerId;
    }

    get name() {
        return this._name;
    }

    get email() {
        return this._email;
    }

    get phone() {
        return this._phone;
    }

    get cards() {
        return [...this._cards];
    }

    get accountNumbers() {
        return [...this._accountNumbers];
    }

    addCard(card) {
        if (!this._cards.find((c) => c.cardNumber === card.cardNumber)) {
            this._cards.push(card);
        }
    }

    removeCard(cardNumber) {
        this._cards = this._cards.filter((c) => c.cardNumber !== cardNumber);
    }

    getCard(cardNumber) {
        return this._cards.find((c) => c.cardNumber === cardNumber) || null;
    }

    addAccount(accountNumber) {
        if (!this._accountNumbers.includes(accountNumber)) {
            this._accountNumbers.push(accountNumber);
        }
    }

    removeAccount(accountNumber) {
        this._accountNumbers = this._accountNumbers.filter(
            (a) => a !== accountNumber
        );
    }
}

module.exports = Customer;

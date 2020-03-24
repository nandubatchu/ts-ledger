// LedgerSystem class
const BigNumber = require('bignumber.js');
const DB = require("./database").InMemoryData;
const FIFOQueue = require("./queue");
const sleep = require('./utils').sleep;
const OperationTypes = {
    TRANSFER: "TRANSFER"
}
const OperationStatus = {
    INIT: "INIT",
    PROCESSING: "PROCESSING",
    APPLIED: "APPLIED",
}
const Entities = {
    OPERATIONS: "operations",
    ACCOUNTS: "accounts",
    ENTRIES: "entries"
}
class LedgerSystem {
    // singleton class
    constructor () {
        this.db = new DB();
        this.postingQueue = new FIFOQueue(this.db.operations.filter(operation => [OperationStatus.INIT, OperationStatus.PROCESSING].includes(operation.status)).map((operation) => {
            return async () => {
                await this.postOperationEntries(operation.id, operation.entries)
            }
        }));
    }
    getOperation(id) {
        return this.db.get(Entities.OPERATIONS, id);
    }
    async postOperationEntries(operationId, entries) {
        await sleep(2000);   // To test the background queue
        this.db.update(Entities.OPERATIONS, operationId, {status: OperationStatus.PROCESSING})
        this.db.insertMany(Entities.ENTRIES, entries);
        this.db.update(Entities.OPERATIONS, operationId, {status: OperationStatus.APPLIED})
    }
    postOperation(operation) {
        operation.status = OperationStatus.INIT;
        const operationId = this.db.insert(Entities.OPERATIONS, operation);
        this.postingQueue.enqueueTask(async () => {
            await this.postOperationEntries(operationId, operation.entries);
        });
        return operationId;
    }
    async postOperationAsync(operation) {
        return new Promise((resolve, reject) => {
            operation.status = OperationStatus.INIT;
            const operationId = this.db.insert(Entities.OPERATIONS, operation);
            this.postingQueue.enqueueTask(async () => {
                await this.postOperationEntries(operationId, operation.entries);
                resolve(operationId);
            });
        })
    }
    postTransferOperation(transferData, async) {
        const operation = {
            operationType: OperationTypes.TRANSFER,
            memo: transferData.memo,
            entries: [
                {
                    accountId: transferData.fromAccountId,
                    assetId: transferData.assetId,
                    value: (-BigNumber(transferData.value)).toString()
                },
                {
                    accountId: transferData.toAccountId,
                    assetId: transferData.assetId,
                    value: transferData.value
                }
            ]
        }
        if (async) {
            return this.postOperationAsync(operation);
        } else {
            return this.postOperation(operation);
        }
    }
    createAccount(accountInfo) {
        return this.db.insert(Entities.ACCOUNTS, accountInfo);
    }
    getAccount(id) {
        const account = this.db.get(Entities.ACCOUNTS, id);
        if (account) {
            account.balances = this.getAccountBalances(id);
        }
        return account;
    }
    getAccountBalances(id) {
        const accountEntries = this.db.getAll(Entities.ENTRIES, id);
        let accountBalances = {};
        for (const entry of accountEntries) {
            const oldBalance = accountBalances[entry.assetId] || "0"
            accountBalances[entry.assetId] = BigNumber(oldBalance).plus(BigNumber(entry.value)).toString()
        }
        return accountBalances;
    }
}

module.exports = LedgerSystem;
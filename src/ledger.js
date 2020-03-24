// LedgerSystem class
const BigNumber = require('bignumber.js');
const Data = require("./database");
const FIFOQueue = require("./queue");
const sleep = require('./utils').sleep;
const groupBy = require('./utils').groupBy;
const OperationTypes = {
    TRANSFER: "TRANSFER"
}
const OperationStatus = {
    INIT: "INIT",
    PROCESSING: "PROCESSING",
    APPLIED: "APPLIED",
    REJECTED: "REJECTED"
}
const Entities = {
    OPERATIONS: "operations",
    ACCOUNTS: "accounts",
    ENTRIES: "entries"
}
class LedgerSystem {
    // singleton class
    constructor (databaseConfig) {
        this.db = new Data[databaseConfig.class](databaseConfig);
        this.postingQueue = new FIFOQueue(this.db.getAll(Entities.OPERATIONS).filter(operation => [OperationStatus.INIT, OperationStatus.PROCESSING].includes(operation.status)).sort((a, b) => a.id - b.id).map((operation) => {
            return async () => {
                await this.postOperationEntries(operation.id, operation.entries)
            }
        }));
    }
    validateEntries(entries) {
        const accountGroupedEntries = groupBy(entries, "accountId");
        Object.keys(accountGroupedEntries).forEach((accountId) => {
            const account = this.db.get(Entities.ACCOUNTS, accountId);
            if (account && account.restrictions) {
                const accountEntries = accountGroupedEntries[accountId];
                const accountBalances = this.getAccountBalances(accountId);
                const assetGroupedEntries = groupBy(accountEntries, "assetId");
                Object.keys(assetGroupedEntries).forEach((assetId) => {
                    const assetBalance = accountBalances[assetId] || "0";
                    let newEntriesSum
                    if (assetGroupedEntries[assetId].length > 1) {
                        newEntriesSum = assetGroupedEntries[assetId].reduce((r, i) => (BigNumber(r.value || r).plus(BigNumber(i.value))).toString());
                    } else {
                        newEntriesSum = assetGroupedEntries[assetId][0].value;
                    }
                    if (account.restrictions && account.restrictions.minimumCreditBalance && (BigNumber(newEntriesSum).plus(BigNumber(assetBalance))).isLessThan(BigNumber(account.restrictions.minimumCreditBalance))) {
                        throw new Error(`Minimum credit balance required on account ${accountId} is ${account.restrictions.minimumCreditBalance} ${assetId} | Current account balance: ${assetBalance} ${assetId}`);
                    }
                })
            }
        })
    }
    getOperation(id) {
        return this.db.get(Entities.OPERATIONS, id);
    }
    async postOperationEntries(operationId, entries) {
        await sleep(2000);   // To test the background queue
        this.db.update(Entities.OPERATIONS, operationId, {status: OperationStatus.PROCESSING})
        // validate the entries using balance restrictions
        try {
            this.validateEntries(entries);
        } catch (error) {
            this.db.update(Entities.OPERATIONS, operationId, {status: OperationStatus.REJECTED, rejectionReason: error.message});
            return;
        }
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
            accountBalances[entry.assetId] = BigNumber(accountBalances[entry.assetId] || "0").plus(BigNumber(entry.value)).toString()
        }
        return accountBalances;
    }
}

module.exports = LedgerSystem;
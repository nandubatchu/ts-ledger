// LedgerSystem class
import BigNumber from "bignumber.js";
import * as dataConnectors from "./data-connectors";
import { FIFOQueue } from "./queue";
import { sleep, groupBy } from "./utils";
import { IPostingEntry, BaseDataConnector, IOperation, OperationStatus, OperationType} from "./base-data-connector";
import { IOperationRequest, ITransferRequest, IAccountRequest, IPostingEntryRequest } from "./index";
import { logger } from "./logger";
export class LedgerSystem {
    private dataConnector: BaseDataConnector;
    private postingQueue!: FIFOQueue;
    private initPromise: Promise<void>;
    constructor (databaseConfig: {class: dataConnectors.DataConnectorType}) {
        this.dataConnector = new dataConnectors[databaseConfig.class](databaseConfig);
        this.initPromise = this.init();
    }
    private async init() {
        const pendingTaskQueue = await this.getPendingOperations()
            .then((pendingOperations) => pendingOperations.map((operation) => this.getOperationTask(operation)))
        this.postingQueue = new FIFOQueue(pendingTaskQueue);
    }
    private async getPendingOperations() {
        return this.dataConnector.getAllOperationsByStatus([OperationStatus.INIT, OperationStatus.PROCESSING])
            .then((pendingOperations) => {
                return pendingOperations.sort((operationA: IOperation, operationB: IOperation) => operationB.id!.localeCompare(operationA.id!))
            });
    }
    private getOperationTask(operation: IOperation) {
        return async () => {
            await this.postOperationEntries(operation.id!, operation.entries)
        }
    }
    private async validateEntries(entries: IPostingEntryRequest[]) {
        const accountGroupedEntries = groupBy(entries, "accountId");
        logger.info(accountGroupedEntries)
        for (const accountId of Object.keys(accountGroupedEntries)) {
            const account = await this.dataConnector.getAccount(accountId);
            if (account && account.restrictions) {
                const accountEntries = accountGroupedEntries[accountId];
                const accountBalances = this.getAccountBalances(accountId);
                const assetGroupedEntries = groupBy(accountEntries, "assetId");
                Object.keys(assetGroupedEntries).forEach((assetId) => {
                    const assetBalance = (accountBalances as any)[assetId] || "0";
                    let newEntriesSum
                    if (assetGroupedEntries[assetId].length > 1) {
                        newEntriesSum = assetGroupedEntries[assetId].reduce((r: string|IPostingEntry, i: IPostingEntry) => (new BigNumber(typeof r === "string" ? r : r.value).plus(new BigNumber(i.value))).toString());
                    } else {
                        newEntriesSum = assetGroupedEntries[assetId][0].value;
                    }
                    if (account.restrictions && account.restrictions.minBalance && (new BigNumber(newEntriesSum).plus(new BigNumber(assetBalance))).isLessThan(new BigNumber(account.restrictions.minBalance))) {
                        throw new Error(`Minimum credit balance required on account ${accountId} is ${account.restrictions.minBalance} ${assetId} | Current account balance: ${assetBalance} ${assetId}`);
                    }
                })
            }
        }
    }
    public async getOperation(operationId: string) {
        return this.dataConnector.getOperation(operationId);
    }
    private async postOperationEntries(operationId: string, entriesRequests: IPostingEntryRequest[]) {
        await sleep(2000);   // To test the background queue
        await this.dataConnector.updateOperationStatus(operationId, OperationStatus.PROCESSING);
        // validate the entries using balance restrictions
        try {
            await this.validateEntries(entriesRequests);
        } catch (error) {
            await this.dataConnector.updateOperationStatus(operationId, OperationStatus.REJECTED, error.message)
            return;
        }
        const entries = entriesRequests.map((entryRequest) => Object.assign({operationId}, entryRequest) as IPostingEntry);
        await this.dataConnector.insertMultipleEntries(entries);
        await this.dataConnector.updateOperationStatus(operationId, OperationStatus.APPLIED);
    }
    public async postOperation(operationRequest: IOperationRequest, sync?: boolean): Promise<string> {
        await this.initPromise;
        const operation: IOperation = Object.assign({status: OperationStatus.INIT}, operationRequest);
        return new Promise(async (resolve, reject) => {
            const operationId = (await this.dataConnector.insertOperation(operation)).id as string;
            this.postingQueue.enqueueTask(async () => {
                await this.postOperationEntries(operationId, operation.entries);
                if (sync) {
                    resolve(operationId);
                }
            });
            if (!sync) {
                resolve(operationId);
            }
        })
    }
    public async postTransferOperation(transferData: ITransferRequest, sync?: boolean) {
        const operation = {
            type: OperationType.TRANSFER,
            memo: transferData.memo,
            entries: [
                {
                    accountId: transferData.fromAccountId,
                    assetId: transferData.assetId,
                    value: (-new BigNumber(transferData.value)).toString()
                },
                {
                    accountId: transferData.toAccountId,
                    assetId: transferData.assetId,
                    value: transferData.value
                }
            ]
        }
        return this.postOperation(operation, sync);
    }
    public async createAccount(account: IAccountRequest) {
        return this.dataConnector.insertAccount(account);
    }
    public async getAccount(accountId: string) {
        const account = await this.dataConnector.getAccount(accountId);
        let balances = {};
        if (account) {
            balances = await this.getAccountBalances(accountId);
        }
        return Object.assign(account, {balances});
    }
    public async getAccountBalances(accountId: string) {
        const accountEntries = await this.dataConnector.getAccountEntries(accountId);
        const accountBalances: {[assetId: string]: string} = {};
        for (const entry of accountEntries) {
            accountBalances[entry.assetId] = new BigNumber(accountBalances[entry.assetId] || "0").plus(new BigNumber(entry.value)).toString()
        }
        return accountBalances;
    }
}

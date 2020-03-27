// LedgerSystem class
import BigNumber from "bignumber.js";
import * as dataConnectors from "./data-connectors";
import { FIFOQueue } from "./queue";
import { sleep, groupBy } from "./utils";
import { IPostingEntry, BaseDataConnector, IOperation, OperationStatus, OperationType} from "./base-data-connector";
export interface IPostingEntryRequest {
    bookId: string,
    assetId: string,
    value: string,
}
export interface IOperationRequest {
    type: OperationType,
    memo: string,
    entries: IPostingEntryRequest[],
}
export interface ITransferRequest {
    fromBookId: string,
    toBookId: string,
    assetId: string,
    value: string,
    memo: string,
}
export interface IBookRequest {
    name: string,
    metadata?: {},
    restrictions?: {
        minBalance?: string;
    }
}
export interface IBookBalances {
    [assetId: string]: string,
}
export class LedgerSystem {
    private dataConnector: BaseDataConnector;
    private postingQueue!: FIFOQueue;
    private initPromise: Promise<void>;
    constructor (storageConfig: {class: dataConnectors.DataConnectorType}) {
        this.dataConnector = new dataConnectors[storageConfig.class](storageConfig);
        this.initPromise = this.init();
    }
    private async init() {
        // initialisation of the postingQueue
        const pendingTaskQueue = await this.getPendingOperations()
            .then((pendingOperations) => pendingOperations.map((operation) => this.getOperationTask(operation)))
        this.postingQueue = new FIFOQueue(pendingTaskQueue);
    }
    private async getPendingOperations() {
        return this.dataConnector.getAllOperationsByStatus([OperationStatus.INIT, OperationStatus.PROCESSING])
            .then((pendingOperations) => {
                return pendingOperations.sort((operationA: IOperation, operationB: IOperation) => operationA.id!.localeCompare(operationB.id!))
            });
    }
    private getOperationTask(operation: IOperation) {
        return async () => {
            await this.postOperationEntries(operation.id!, operation.entries)
        }
    }
    private async validateEntries(entries: IPostingEntryRequest[]) {
        // empty entries
        if (entries.length === 0) {
            throw new Error(`No entries specified!`);
        }
        // entries values to sum-up to zero
        const zeroSum: string = (entries as any).reduce((r: string|IPostingEntryRequest, i: IPostingEntryRequest) => new BigNumber(typeof r === "string" ? r : r.value).plus(new BigNumber(i.value)).toString())
        if (!new BigNumber(zeroSum).isEqualTo(new BigNumber("0"))) {
            throw new Error(`Entries do not add up to be zeroSum!`);
        }
        // apply any book restrictions available
        const bookGroupedEntries = groupBy(entries, "bookId");
        for (const bookId of Object.keys(bookGroupedEntries)) {
            const book = await this.dataConnector.getBook(bookId);
            if (book && book.restrictions) {
                const bookEntries = bookGroupedEntries[bookId];
                const bookBalances = await this.getBookBalances(bookId);
                const assetGroupedEntries = groupBy(bookEntries, "assetId");
                Object.keys(assetGroupedEntries).forEach((assetId) => {
                    const assetBalance = (bookBalances as any)[assetId] || "0";
                    let newEntriesSum
                    if (assetGroupedEntries[assetId].length > 1) {
                        newEntriesSum = assetGroupedEntries[assetId].reduce((r: string|IPostingEntry, i: IPostingEntry) => (new BigNumber(typeof r === "string" ? r : r.value).plus(new BigNumber(i.value))).toString());
                    } else {
                        newEntriesSum = assetGroupedEntries[assetId][0].value;
                    }
                    if (book.restrictions && book.restrictions.minBalance && (new BigNumber(newEntriesSum).plus(new BigNumber(assetBalance))).isLessThan(new BigNumber(book.restrictions.minBalance))) {
                        throw new Error(`Minimum credit balance required on book ${bookId} is ${book.restrictions.minBalance} ${assetId} | Current book balance: ${assetBalance} ${assetId}`);
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
        // TODO: validate the operation
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
                    bookId: transferData.fromBookId,
                    assetId: transferData.assetId,
                    value: (-new BigNumber(transferData.value)).toString()
                },
                {
                    bookId: transferData.toBookId,
                    assetId: transferData.assetId,
                    value: transferData.value
                }
            ]
        }
        return this.postOperation(operation, sync);
    }
    public async createBook(book: IBookRequest) {
        return this.dataConnector.insertBook(book);
    }
    public async getBook(bookId: string) {
        const book = await this.dataConnector.getBook(bookId);
        let balances = {};
        if (book) {
            balances = await this.getBookBalances(bookId);
        }
        return Object.assign(book, {balances});
    }
    public async getBookBalances(bookId: string) {
        const bookEntries = await this.dataConnector.getBookEntries(bookId);
        const bookBalances: {[assetId: string]: string} = {};
        for (const entry of bookEntries) {
            bookBalances[entry.assetId] = new BigNumber(bookBalances[entry.assetId] || "0").plus(new BigNumber(entry.value)).toString()
        }
        return bookBalances;
    }
}

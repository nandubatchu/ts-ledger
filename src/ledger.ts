import BigNumber from "bignumber.js";
import { BaseDataConnector, IOperation, OperationStatus, OperationType} from "./base-data-connector";
import { IFIFOClient } from "./ws-fifo-client";
export interface IPostingEntryRequest {
    bookId: string,
    assetId: string,
    value: string,
}
export interface IOperationRequest {
    type: OperationType,
    memo: string,
    entries: IPostingEntryRequest[],
    metadata?: {[key: string]: any},
}
export interface ITransferRequest {
    fromBookId: string,
    toBookId: string,
    assetId: string,
    value: string,
    memo: string,
    metadata?: {[key: string]: any},
}
export interface IBookRequest {
    name: string,
    metadata?: {},
    restrictions?: {
        minBalance?: string;
    }
}
export class LedgerApiHelper {
    private dataConnector: BaseDataConnector;
    public queueClient?: IFIFOClient;
    constructor (dataConnector: BaseDataConnector, queueClient: IFIFOClient) {
        this.dataConnector = dataConnector;
        this.queueClient = queueClient;
    }
    public async getOperation(operationId: string) {
        return this.dataConnector.getOperation(operationId);
    }
    public async postOperation(operationRequest: IOperationRequest, sync?: boolean): Promise<string> {
        if (!this.queueClient) {
            throw new Error("Missing postingQueue");
        }
        const operation: IOperation = Object.assign({status: OperationStatus.INIT}, operationRequest);
        return new Promise(async (resolve, reject) => {
            const operationId = (await this.dataConnector.insertOperation(operation)).id as string;
            await this.queueClient!.submitTask(operationId);
            if (!sync) {
                resolve(operationId);
            } else {
                const taskCompletionCallback = (taskId: any) => {
                    if (sync && taskId === operationId) {
                        this.queueClient!.removeListener("taskCompleted", taskCompletionCallback);
                        resolve(operationId)
                    }
                }
                this.queueClient!.on("taskCompleted", taskCompletionCallback)
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
            ],
            metadata: transferData.metadata,
        }
        return this.postOperation(operation, sync);
    }
    public async createBook(book: IBookRequest) {
        return this.dataConnector.insertBook(book);
    }
    public async getBook(bookId: string) {
        const book = await this.dataConnector.getBook(bookId);
        if (!book) {
            return;
        }
        const balances = await this.getBookBalances(bookId);
        return Object.assign(book, {balances});
    }
    public getBookBalances = async (bookId: string) => this.dataConnector.getBookBalances(bookId);
    public async getBookOperations(bookId: string, metadataFilter?: {[key: string]: any}) {
        const bookEntries = await this.dataConnector.getBookEntries(bookId);
        let bookOperationIds = bookEntries.map((postingEntry) => postingEntry.operationId);
        bookOperationIds = [...new Set(bookOperationIds)];  // remove duplicate ids
        const bookOperations = await this.dataConnector.getOperationsByIds(bookOperationIds);
        return metadataFilter ? bookOperations.filter((operation) => {
            const keys = Object.keys(metadataFilter).filter((key) => metadataFilter[key] !== undefined);
            return keys.some((key) => operation.metadata && operation.metadata[key] === metadataFilter[key]);
        }) : bookOperations
    }
}

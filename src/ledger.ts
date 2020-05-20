import BigNumber from "bignumber.js";
import { EventEmitter } from "events";
import { BaseDataConnector, IOperation, OperationStatus, OperationType, IMetadataFilter} from "./base-data-connector";
export interface IPostingEntryRequest {
    bookId: string,
    assetId: string,
    value: string,
    metadata?: {[key: string]: any},
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
const DEFAULT_BOOK_ID = "1";
export class LedgerApiHelper extends EventEmitter {
    private dataConnector: BaseDataConnector;
    private initPromise: Promise<void>;
    constructor (dataConnector: BaseDataConnector) {
        super();
        this.dataConnector = dataConnector;
        this.initPromise = this.init();
    }
    private async init() {
        // create default_book if it does not exist
        const book = await this.dataConnector.getBook(DEFAULT_BOOK_ID);
        if (!book) {
            await this.dataConnector.insertBook({
                name: "default_book",
                metadata: {},
            })
        }
    }
    public async getOperation(operationId: string) {
        return this.dataConnector.getOperation(operationId);
    }
    public async postOperation(operationRequest: IOperationRequest, sync?: boolean): Promise<string> {
        const operation: IOperation = Object.assign({status: OperationStatus.INIT}, operationRequest);
        return new Promise(async (resolve, reject) => {
            const operationId = (await this.dataConnector.insertOperation(operation)).id as string;
            if (!sync) {
                resolve(operationId);
            } else {
                const taskCompletionCallback = (taskId: any) => {
                    if (sync && taskId === operationId) {
                        this.removeListener("taskCompleted", taskCompletionCallback);
                        resolve(operationId)
                    }
                }
                this.on("taskCompleted", taskCompletionCallback)
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
                    value: new BigNumber(transferData.value).multipliedBy(new BigNumber("-1")).toString()
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
    public getBookBalances = async (bookId: string, metadataFilter?: IMetadataFilter) => this.dataConnector.getBookBalances(bookId, metadataFilter);
    public async getBookOperations(bookId: string, metadataFilter?: {[key: string]: any}) {
        const bookEntries = await this.dataConnector.getBookEntries(bookId);
        let bookOperationIds = bookEntries.map((postingEntry) => postingEntry.operationId);
        bookOperationIds = [...new Set(bookOperationIds)];  // remove duplicate ids
        const bookOperations = await this.dataConnector.getOperationsByIds(bookOperationIds);
        return metadataFilter ? bookOperations.filter((operation) => {
            const keys = Object.keys(metadataFilter).filter((key) => metadataFilter[key] !== undefined);
            return keys.every((key) => operation.metadata && operation.metadata[key] === metadataFilter[key]);
        }) : bookOperations
    }
}

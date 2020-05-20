import BigNumber from "bignumber.js";
import { IPostingEntryRequest } from "./ledger";
import { logger } from "./logger";
import { sleep } from "./utils";

export interface IEntityData {
    id?: string;
    createdAt?: number;
    updatedAt?: number;
}
export interface IPostingEntry extends IEntityData {
    operationId: string;
    bookId: string;
    assetId: string;
    value: string;
    metadata?: {[key: string]: any};
}
export enum OperationType {
    TRANSFER = "TRANSFER",
}
export enum OperationStatus {
    INIT = "INIT",
    PROCESSING = "PROCESSING",
    APPLIED = "APPLIED",
    REJECTED = "REJECTED",
}
export interface IOperation extends IEntityData {
    type: OperationType;
    memo: string;
    entries: IPostingEntryRequest[];
    status: OperationStatus;
    rejectionReason?: string;
    metadata?: {[key: string]: any};
}
export interface IBook extends IEntityData {
    name: string;
    metadata?: object;
    restrictions?: {
        minBalance?: string;
    };
}
export interface IBookBalances {
    [assetId: string]: string,
}
export enum EntityType {
    OPERATIONS = "OPERATIONS",
    BOOKS = "BOOKS",
    ENTRIES = "ENTRIES",
}
export type EntityData = IPostingEntry|IOperation|IBook;
export interface IEntityFilter {
    [field: string]: string|string[];
}
export interface IMetadataFilter {
    [field: string]: any;
}
export abstract class BaseDataConnector {
    protected config?: any;
    constructor(config?: any) {this.config = config};
    public abstract async insert(entity: EntityType, row: EntityData): Promise<EntityData>;
    public abstract async insertMany(entity: EntityType, rows: EntityData[]): Promise<EntityData[]>;
    public abstract async get(entity: EntityType, id: string): Promise<EntityData>;
    public abstract async getAll(entity: EntityType, filter?: IEntityFilter, orderBy?: [string, boolean], count?: number): Promise<EntityData[]>;
    public abstract async update(entity: EntityType, id: string, newData: any): Promise<EntityData>;
    public async insertOperation(operation: IOperation): Promise<IOperation> {
        return this.insert(EntityType.OPERATIONS, operation) as Promise<IOperation>;
    }
    public async insertBook(book: IBook): Promise<IBook> {
        return this.insert(EntityType.BOOKS, book) as Promise<IBook>;
    }
    public async insertEntry(entry: IPostingEntry): Promise<IPostingEntry> {
        return this.insert(EntityType.ENTRIES, entry) as Promise<IPostingEntry>;
    }
    public async insertMultipleEntries(entries: IPostingEntry[]): Promise<IPostingEntry[]> {
        return this.insertMany(EntityType.ENTRIES, entries) as Promise<IPostingEntry[]>
    }
    public async getOperation(operationId: string): Promise<IOperation> {
        return this.get(EntityType.OPERATIONS, operationId) as Promise<IOperation>;
    }
    public async getOperationsByIds(operationIds: string[]): Promise<IOperation[]> {
        return this.getAll(EntityType.OPERATIONS, {id: operationIds}) as Promise<IOperation[]>
    }
    public async getAllOperationsByStatus(statuses: OperationStatus[]): Promise<IOperation[]> {
        return this.getAll(EntityType.OPERATIONS, {status: statuses}) as Promise<IOperation[]>
    }
    public async getFirstInPendingOperation(): Promise<IOperation|undefined> {
        return (await this.getAll(EntityType.OPERATIONS, {status: [OperationStatus.INIT, OperationStatus.PROCESSING]}, ["id", false], 1) as IOperation[])[0]
    }
    public async getBookEntries(bookId: string): Promise<IPostingEntry[]> {
        return this.getAll(EntityType.ENTRIES, {bookId}) as Promise<IPostingEntry[]>;
    }
    public async getBook(bookId: string): Promise<IBook> {
        return this.get(EntityType.BOOKS, bookId) as Promise<IBook>;
    }
    public async updateOperationStatus(operationId: string, status: OperationStatus, rejectionReason?: string): Promise<IOperation> {
        return this.update(EntityType.OPERATIONS, operationId, {status, rejectionReason}) as Promise<IOperation>;
    }
    public async getBookBalances(bookId: string, metadataFilter?: IMetadataFilter): Promise<any> {
        const bookBalances: IBookBalances = {};
        let bookEntries = await this.getBookEntries(bookId);
        if (metadataFilter) {
            bookEntries = bookEntries.filter((entry) => {
                if (!entry.metadata) {
                    return false;
                }
                const keys = Object.keys(metadataFilter).filter((key) => metadataFilter[key] !== undefined);
                return keys.every((key) => entry.metadata && entry.metadata[key] === metadataFilter[key]);
            })
        }
        bookEntries.forEach((entry) => {
            bookBalances[entry.assetId] = new BigNumber(bookBalances[entry.assetId] || "0").plus(new BigNumber(entry.value)).toString()
        })
        return bookBalances
    }
    public async applyOperation(operationId: string): Promise<IOperation> {
        let operation = await this.getOperation(operationId);
        const entries = operation.entries.map((entryRequest) => Object.assign({operationId, metadata: operation.metadata}, entryRequest) as IPostingEntry);
        await this.insertMultipleEntries(entries);
        operation = await this.updateOperationStatus(operationId, OperationStatus.APPLIED);
        return operation;
    }
    public async applyFirstInOperation(entriesValidator: (entries: IPostingEntryRequest[]) => Promise<void>): Promise<string|undefined> {
        // Get the first-in-pending operation
        const pendingFirstInOperation = await this.getFirstInPendingOperation();
        const operationId = pendingFirstInOperation && pendingFirstInOperation.id;
        if (operationId) {
            // If there is a pending operation found, try to apply the corresponding posting entries
            logger.info(`Applying operation ${operationId}`)
            // Mark the operation status to be processing
            const operation = await this.updateOperationStatus(operationId, OperationStatus.PROCESSING);
            // TODO: validate that operation is not applied already into entries
            try {
                // validate the integrity of the entries provided
                await entriesValidator(operation.entries);
            } catch (error) {
                // reject the operation with proper rejectionReason
                await this.updateOperationStatus(operationId, OperationStatus.REJECTED, error.message)
                return operationId;
            }
            // apply the entries
            await this.applyOperation(operationId);
            await sleep(2000);  // To test the background queue
        }
        return operationId
    }
}
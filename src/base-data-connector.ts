import { IPostingEntryRequest } from "./ledger";

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
export enum EntityType {
    OPERATIONS = "OPERATIONS",
    BOOKS = "BOOKS",
    ENTRIES = "ENTRIES",
}
export type EntityData = IPostingEntry|IOperation|IBook;
export interface IEntityFilter {
    [field: string]: string|string[];
}
export abstract class BaseDataConnector {
    protected config?: any;
    constructor(config?: any) {this.config = config};
    public abstract async insert(entity: EntityType, row: EntityData): Promise<EntityData>;
    public abstract async insertMany(entity: EntityType, rows: EntityData[]): Promise<EntityData[]>;
    public abstract async get(entity: EntityType, id: string): Promise<EntityData>;
    public abstract async getAll(entity: EntityType, filter?: IEntityFilter): Promise<EntityData[]>;
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
    public async getBookEntries(bookId: string): Promise<IPostingEntry[]> {
        return this.getAll(EntityType.ENTRIES, {bookId}) as Promise<IPostingEntry[]>;
    }
    public async getBook(bookId: string): Promise<IBook> {
        return this.get(EntityType.BOOKS, bookId) as Promise<IBook>;
    }
    public async updateOperationStatus(operationId: string, status: OperationStatus, rejectionReason?: string): Promise<IOperation> {
        return this.update(EntityType.OPERATIONS, operationId, {status, rejectionReason}) as Promise<IOperation>;
    }
}
import fakes from "./fakes.json";
import { BaseDataConnector, EntityType, IOperation, IPostingEntry, IBook, EntityData, IEntityFilter } from "./base-data-connector";
export class InMemoryDataConnector extends BaseDataConnector {
    private operations: IOperation[];
    private entries: IPostingEntry[];
    private books: IBook[];
    constructor(config?: any) {
        super(config);
        this.operations = fakes.operations as IOperation[];
        this.entries = fakes.entries;
        this.books = fakes.books;
    }
    private getEntityList = (entity: EntityType): any[] => {
        switch (entity) {
            case EntityType.OPERATIONS:
                return this.operations;
            case EntityType.BOOKS:
                return this.books;
            case EntityType.ENTRIES:
                return this.entries;
            default:
                throw new Error("Entity not supported");
        }
    }
    async insert(entity: EntityType, data: EntityData): Promise<EntityData> {
        const length = this.getEntityList(entity).length;
        data.id = (length + 1).toString();
        data.createdAt = new Date().getTime();
        this.getEntityList(entity).push(data);
        return data;
    }
    async insertMany(entity: EntityType, dataArray: any[]): Promise<EntityData[]> {
        let length = this.getEntityList(entity).length;
        for (const row of dataArray) {
            row.id = (length + 1).toString();
            row.createdAt = new Date().getTime();
            length++;
        }
        this.entries = this.getEntityList(entity).concat(dataArray)
        return dataArray;
    }
    async get(entity: EntityType, id: string): Promise<EntityData> {
        return this.getEntityList(entity).find((e: EntityData) => e.id === id);
    }
    async getAll(entity: EntityType, filter?: IEntityFilter): Promise<EntityData[]> {
        if (filter) {
            return this.getEntityList(entity).filter((row: EntityData) => {
                return Object.keys(filter).every((key: string) => {
                    if (typeof filter[key] === "string") {
                        return filter[key] === (row as any)[key];
                    } else {
                        return filter[key].includes((row as any)[key]);
                    }
                });
            })
        } else {
            return this.getEntityList(entity);
        }
    }
    async update(entity: EntityType, id: string, newData: any): Promise<EntityData> {
        newData = Object.assign(newData, {updatedAt: new Date().getTime()});
        const rowIndex = this.getEntityList(entity).findIndex((e: EntityData) => e.id === id);
        this.getEntityList(entity)[rowIndex] = Object.assign(this.getEntityList(entity)[rowIndex], newData);
        return this.getEntityList(entity)[rowIndex];
    }
}
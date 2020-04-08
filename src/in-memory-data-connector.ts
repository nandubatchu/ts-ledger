import fakes from "./fakes.json";
import { BaseDataConnector, EntityType, IOperation, IPostingEntry, IBook, EntityData, IEntityFilter } from "./base-data-connector";
export class InMemoryDataConnector extends BaseDataConnector {
    private operations: IOperation[];
    private entries: IPostingEntry[];
    private books: IBook[];
    constructor(config?: any) {
        super(config);
        this.operations = fakes.OPERATIONS as IOperation[];
        this.entries = fakes.ENTRIES;
        this.books = fakes.BOOKS;
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
    public async insert(entity: EntityType, data: EntityData): Promise<EntityData> {
        const length = this.getEntityList(entity).length;
        data.id = (length + 1).toString();
        data.createdAt = new Date().getTime();
        this.getEntityList(entity).push(data);
        return data;
    }
    public async insertMany(entity: EntityType, dataArray: any[]): Promise<EntityData[]> {
        let length = this.getEntityList(entity).length;
        for (const row of dataArray) {
            row.id = (length + 1).toString();
            row.createdAt = new Date().getTime();
            length++;
        }
        this.entries = this.getEntityList(entity).concat(dataArray)
        return dataArray;
    }
    public async get(entity: EntityType, id: string): Promise<EntityData> {
        return this.getEntityList(entity).find((e: EntityData) => e.id === id);
    }
    public async getAll(entity: EntityType, filter?: IEntityFilter, orderBy?: [string, boolean], count?: number): Promise<EntityData[]> {
        let filtered: EntityData[];
        let ordered: EntityData[];
        if (filter) {
            filtered = this.getEntityList(entity).filter((row: EntityData) => {
                return Object.keys(filter).every((key: string) => {
                    if (typeof filter[key] === "string") {
                        return filter[key] === (row as any)[key];
                    } else {
                        return filter[key].includes((row as any)[key]);
                    }
                });
            })
        } else {
            filtered = this.getEntityList(entity);
        }
        if (orderBy) {
            filtered.sort((a: any, b: any) => a[orderBy[0]] - b[orderBy[0]])
            if (orderBy[1]) {
                filtered.reverse();
            }
            ordered = filtered;
        } else {
            ordered = filtered;
        }
        return count ? ordered.slice(0, count) : ordered;
    }
    public async update(entity: EntityType, id: string, newData: any): Promise<EntityData> {
        newData = Object.assign(newData, {updatedAt: new Date().getTime()});
        const rowIndex = this.getEntityList(entity).findIndex((e: EntityData) => e.id === id);
        this.getEntityList(entity)[rowIndex] = Object.assign(this.getEntityList(entity)[rowIndex], newData);
        return this.getEntityList(entity)[rowIndex];
    }
}
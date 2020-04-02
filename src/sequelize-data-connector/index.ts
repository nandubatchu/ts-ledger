import { Sequelize } from "sequelize";
import { BaseDataConnector, EntityType, EntityData, IEntityFilter } from "../base-data-connector";
import { logger } from "../logger";
import { sequelize } from "./connection";
import { Book } from "./models/book";
import { Operation } from "./models/operation";
import { PostingEntry } from "./models/posting-entry";

export class SequelizeDataConnector extends BaseDataConnector {
    private sequelize: Sequelize;
    private initPromise: Promise<void>;
    private entityModelMap = {
        [EntityType.BOOKS]: Book,
        [EntityType.OPERATIONS]: Operation,
        [EntityType.ENTRIES]: PostingEntry,
    }
    constructor() {
        super();
        this.sequelize = sequelize;
        this.initPromise = this.init()
    }
    private async init() {
        try {
            await this.sequelize.authenticate();
            logger.info("Sequelize connection established successfully!");
        } catch (error) {
            logger.error("Sequelize connection error:", error);
        }
        if (this.sequelize.config.database.includes("memory")) {
            await sequelize.sync({ force: true });
            logger.info("Force sync done for in-memory database!");
        }
    }
    public async insert(entity: EntityType, row: EntityData): Promise<EntityData> {
        await this.initPromise;
        const model = this.entityModelMap[entity];
        // @ts-ignore
        const rowCreated = await model.create(row);
        return rowCreated;
    }
    public async insertMany(entity: EntityType, rows: EntityData[]): Promise<EntityData[]> {
        await this.initPromise;
        const model = this.entityModelMap[entity];
        // @ts-ignore
        const rowsCreated = await model.bulkCreate(rows);
        return rowsCreated;
    }
    public async get(entity: EntityType, id: string): Promise<EntityData> {
        await this.initPromise;
        const model = this.entityModelMap[entity];
        // @ts-ignore
        const rowFound = await model.findByPk(id);
        return rowFound
    }
    public async getAll(entity: EntityType, filter?: IEntityFilter): Promise<EntityData[]> {
        await this.initPromise;
        const model = this.entityModelMap[entity];
        // @ts-ignore
        // TODO: filters
        const rowsFound = await model.findAll({ where: filter });
        return rowsFound;
    }
    public async update(entity: EntityType, id: string, newData: any): Promise<EntityData> {
        await this.initPromise;
        const model = this.entityModelMap[entity];
        // @ts-ignore
        const [updatedRowId] = await model.update(newData, {where: {id}});
        // @ts-ignore
        const updatedRow = await model.findByPk(updatedRowId);
        return updatedRow;
    }
}
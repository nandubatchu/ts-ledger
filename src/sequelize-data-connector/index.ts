import { Sequelize, Transaction } from "sequelize";
import { BaseDataConnector, EntityType, EntityData, IEntityFilter, OperationStatus } from "../base-data-connector";
import { logger } from "../logger";
import { sequelize } from "./connection";
import { Book } from "./models/book";
import { Operation } from "./models/operation";
import { PostingEntry } from "./models/posting-entry";
import { IPostingEntryRequest } from "../ledger";
import { sleep } from "../utils";

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
        return rowCreated.dataValues;
    }
    public async insertMany(entity: EntityType, rows: EntityData[]): Promise<EntityData[]> {
        await this.initPromise;
        const model = this.entityModelMap[entity];
        // @ts-ignore
        const rowsCreated = await model.bulkCreate(rows);
        return rowsCreated.map((row: { dataValues: any; }) => row.dataValues);
    }
    public async get(entity: EntityType, id: string): Promise<EntityData> {
        await this.initPromise;
        const model = this.entityModelMap[entity];
        // @ts-ignore
        const rowFound = await model.findByPk(id);
        return rowFound && rowFound.dataValues
    }
    public async getAll(entity: EntityType, filter?: IEntityFilter): Promise<EntityData[]> {
        await this.initPromise;
        const model = this.entityModelMap[entity];
        // @ts-ignore
        const rowsFound = await model.findAll({ where: filter });
        return rowsFound && rowsFound.map((row: { dataValues: any; }) => row.dataValues);
    }
    public async update(entity: EntityType, id: string, newData: any): Promise<EntityData> {
        await this.initPromise;
        const model = this.entityModelMap[entity];
        // @ts-ignore
        const [num, [updatedRow]] = await model.update(newData, {where: {id}, returning: true});
        return updatedRow.dataValues;
    }
    public async applyFirstInOperation(entriesValidator: (entries: IPostingEntryRequest[]) => Promise<void>): Promise<string|undefined> {
        try {
            const finalOperationId = await this.sequelize.transaction({
                isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE,
            }, async (transaction) => {
                let operationId: string|undefined;
                // @ts-ignore
                // Get the first-in-pending operation
                const operation = await Operation.findOne({where: {status: OperationStatus.INIT}, order: [['id', 'ASC']], transaction});
                try {
                    if (operation) {
                        // If there is a pending operation found, try to apply the corresponding posting entries
                        operationId = operation.dataValues.id;
                        logger.info(`Trying to apply operation ${operationId}`)
                        // @ts-ignore
                        // Mark the operation status to be processing
                        const [num, [updatedOperation]] = await Operation.update({status: OperationStatus.PROCESSING}, {where: {id: operationId}, returning: true, transaction});
                        // validate the integrity of the entries provided
                        await entriesValidator(operation.entries);
                        // @ts-ignore
                        // apply the entries
                        await PostingEntry.bulkCreate(updatedOperation.dataValues.entries.map((entry) => Object.assign({operationId, meatadata: updatedOperation.dataValues.metadata}, entry)), {transaction});
                        // @ts-ignore
                        // Mark the operation status to be applied
                        await Operation.update({status: OperationStatus.APPLIED}, {where: {id: operationId}, returning: true, transaction});
                        await sleep(1000);  // To test the background queue
                        logger.info(`Applied operation ${operationId}`);
                    }
                } catch (error) {
                    // @ts-ignore
                    // On transaction rollback, reject the operation with proper locking error
                    await Operation.update({status: OperationStatus.REJECTED, rejectionReason: `${error}`}, {where: {id: operationId}, returning: true, transaction});
                    logger.info(`Rejected operation ${operationId}`);
                }
                return operationId;
            })
            return finalOperationId;
        } catch (error) {
            logger.info(`Operation rolled back, couldn't acquire lock`);
        }
    }
}
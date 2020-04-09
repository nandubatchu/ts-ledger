import express from "express";
import request from "request";
import dotenv from "dotenv";
import { sleep, groupBy } from "./utils";
import { OperationStatus, IPostingEntry, BaseDataConnector } from "./base-data-connector";
import { IPostingEntryRequest } from "./ledger";
import BigNumber from "bignumber.js";
import { logger } from "./logger";
import { SequelizeDataConnector } from "./sequelize-data-connector";
dotenv.config();

export const workerApp = express(); // exported for testing purpose

export class OperationWorkerHelper {
    public callbackHosts: Set<string> = new Set((process.env.REMOTE_API_SERVERS && process.env.REMOTE_API_SERVERS.split(",")) || []);
    private dataConnector: BaseDataConnector;
    constructor(dataConnector: BaseDataConnector) {
        this.dataConnector = dataConnector;
        this.clearQueue();
    }
    private clearQueue = async () => {
        const pendingOperation = await this.dataConnector.getFirstInPendingOperation();
        const taskId = pendingOperation && pendingOperation.id;
        if (taskId) {
            const task = this.getOperationTask(taskId);
            if (task) {
                await task();
                this.callbackHosts.forEach(async (host) => {
                    request.post({
                        uri: host,
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            "jsonrpc": "2.0",
                            "method": "notifyOperationCompletion",
                            "params": [taskId],
                            "id": 1
                        }),
                    })
                })
            }
        }
        await sleep(100);   // TODO: optimise the frequency of queue
        await this.clearQueue();
    }

    public getOperationTask = (operationId: string) => async () => this.postOperationEntries(operationId);

    private async postOperationEntries(operationId: string) {
        await sleep(100);   // To test the background queue
        const operation = await this.dataConnector.updateOperationStatus(operationId, OperationStatus.PROCESSING);
        // TODO: validate that operation is not applied already into entries
        // validate the entries using balance restrictions
        try {
            await this.validateEntries(operation.entries);
        } catch (error) {
            await this.dataConnector.updateOperationStatus(operationId, OperationStatus.REJECTED, error.message)
            return;
        }
        await this.dataConnector.applyOperation(operationId);
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
            if (!book) {
                throw new Error(`Book ID (${bookId}) is invalid!`);
            }
            if (book && book.restrictions) {
                const bookEntries = bookGroupedEntries[bookId];
                const bookBalances = await this.dataConnector.getBookBalances(bookId);
                const assetGroupedEntries = groupBy(bookEntries, "assetId");
                Object.keys(assetGroupedEntries).forEach((assetId) => {
                    const assetBalance = bookBalances[assetId] || "0";
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
}

// initialise the worker class
const operationWorkerHelper = new OperationWorkerHelper(new SequelizeDataConnector());

// defining the http interface of the worker instance
workerApp.use(express.json());

workerApp.get('/test', (req, res) => {
    // health-check
    res.send({'success': true})
})

workerApp.get('/register-callbacks', (req, res) => {
    operationWorkerHelper.callbackHosts.add(req.query.callbackHost);
    res.send({'success': true})
})

// start the http server
const port = process.env.WORKER_PORT;
workerApp.listen(port, () => {
    logger.info(`Worker listening on port ${port}!`)
})
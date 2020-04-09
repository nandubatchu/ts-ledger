import express from "express";
import jayson from "jayson";
import dotenv from "dotenv";
import { logger } from "./logger";
import { LedgerApiHelper, IOperationRequest, ITransferRequest, IBookRequest } from "./ledger";
import { IOperation, IBook, IBookBalances } from "./base-data-connector";
import { rpcErrors } from "./errors";
import request from "request";
import { SequelizeDataConnector } from "./sequelize-data-connector";
dotenv.config();

export const app = express(); // exported for testing purpose
export const dataConnector = new SequelizeDataConnector();

// LedgerApiHelper used by the API server for reading data and pushing operations to the queue
export const ledgerApiHelper = new LedgerApiHelper(dataConnector);

const rpcMethods  = {
    getOperation: async (args: [string], callback: (error?: jayson.JSONRPCError | null, result?: IOperation) => void) => {
        const [operationId] = args;
        const operation = await ledgerApiHelper.getOperation(operationId);
        if (!operation) {
            callback(rpcErrors.OperationNotFound);
        }
        callback(null, operation);
    },
    postOperation: async (args: [IOperationRequest, boolean|undefined], callback: (error?: jayson.JSONRPCError | null, result?: IOperation) => void) => {
        const [operationRequest, sync] = args;
        const operationId = await ledgerApiHelper.postOperation(operationRequest, sync);
        const operation = await ledgerApiHelper.getOperation(operationId);
        callback(null, operation);
    },
    postTransfer: async (args: [ITransferRequest, boolean|undefined], callback: (error?: jayson.JSONRPCError | null, result?: IOperation) => void) => {
        const [transferRequest, sync] = args;
        const operationId = await ledgerApiHelper.postTransferOperation(transferRequest, sync);
        const operation = await ledgerApiHelper.getOperation(operationId);
        callback(null, operation);
    },
    createBook: async (args: [IBookRequest], callback: (error?: jayson.JSONRPCError | null, result?: IBook) => void) => {
        const [bookRequest] = args;
        const book = await ledgerApiHelper.createBook(bookRequest);
        callback(null, book);
    },
    getBook: async (args: [string], callback: (error?: jayson.JSONRPCError | null, result?: IBook) => void) => {
        const [bookId] = args;
        const book = await ledgerApiHelper.getBook(bookId);
        if (!book) {
            callback(rpcErrors.BookNotFound);
        }
        callback(null, book);
    },
    getBalances: async (args: [string, string, {[key: string]: any}], callback: (error?: jayson.JSONRPCError | null, result?: IBookBalances) => void) => {
        const [bookId, assetId, metadataFilter] = args;
        const bookBalances = await ledgerApiHelper.getBookBalances(bookId, metadataFilter);
        if (assetId) {
            // TODO: need to move this logic to the database layer
            const balances: IBookBalances = {}
            balances[assetId] = bookBalances[assetId];
            callback(null, balances)
        } else {
            callback(null, bookBalances)
        }
    },
    getOperations: async (args: [string, object], callback: (error?: jayson.JSONRPCError | null, result?: IOperation[]) => void) => {
        const [bookId, metadataFilter] = args;
        const bookOperations = await ledgerApiHelper.getBookOperations(bookId, metadataFilter);
        callback(null, bookOperations);
    },
    notifyOperationCompletion: async (args: [string], callback: (error?: jayson.JSONRPCError | null, result?: string) => void) => {
        const [taskId] = args;
        ledgerApiHelper.emit("taskCompleted", taskId);
        callback(null, taskId);
    }
};

app.use(express.json());

app.get('/test', (req, res) => {
    // health-check
    res.send({'success': true})
})

app.use(new jayson.Server(rpcMethods).middleware())

const port = process.env.API_PORT;

const registerCallback = async (workerHost: string) => {
    return new Promise((resolve, reject) => {
        const healthCheckTimeout = setInterval(() => {
            request.get(`${workerHost}/test`, (err, res, body) => {
                if (err) {
                    logger.error(err);
                } else {
                    body = body && JSON.parse(body);
                    if (body && body.success) {
                        clearInterval(healthCheckTimeout);
                        request.get(`${workerHost}/register-callbacks?callbackHost=http://${process.env.HOST_IP}:${port}`, (e, r, b) => {
                            if (e) {
                                logger.error(e);
                            } else {
                                b = b && JSON.parse(b);
                                if (b && b.success) {
                                    logger.info("Registered successfully for callbacks from worker!");
                                    resolve();
                                }
                            }
                        })
                    }
                }
            })
        }, 500)
    });
}

const workerEndpoint = process.env.REMOTE_WORKER_URL;
if (!workerEndpoint) {
    throw new Error("REMOTE_WORKER_URL not set!")
}
registerCallback(workerEndpoint).then(() => {
    app.listen(port, async () => {
        logger.info(`API server listening on port ${port}!`);
    })
})

import express from "express";
import jayson from "jayson";
import dotenv from "dotenv";
import { v4 as uuid } from "uuid";
import { logger } from "./logger";
import { LedgerApiHelper, IOperationRequest, ITransferRequest, IBookRequest } from "./ledger";
import { IOperation, IBook, IBookBalances } from "./base-data-connector";
import { rpcErrors, JSONRPCError } from "./errors";
import request from "request";
import { SequelizeDataConnector } from "./sequelize-data-connector";
dotenv.config();

export const app = express(); // exported for testing purpose
export const dataConnector = new SequelizeDataConnector();

// LedgerApiHelper used by the API server for reading data and pushing operations to the queue
export const ledgerApiHelper = new LedgerApiHelper(dataConnector);

const rpcMethods: {[methodName: string]: jayson.MethodLike} = {
    getOperation: async (args: [string], callback: (error?: jayson.JSONRPCError | null, result?: IOperation) => void) => {
        const requestId = uuid();
        logger.info(`${requestId}: getOperation ${JSON.stringify(args)}`)
        try {
            const [operationId] = args;
            const operation = await ledgerApiHelper.getOperation(operationId);
            if (!operation) {
                logger.info(`${requestId}: not found`)
                callback(JSONRPCError.fromCode(rpcErrors.NotFound, ["operation", operationId]));
            } else {
                logger.info(`${requestId}: ${JSON.stringify(operation)}`)
                callback(null, operation);
            }
        } catch (error) {
            logger.error(error.stack);
            callback(JSONRPCError.fromCode(rpcErrors.InternalError));
        }
    },
    postOperation: async (args: [IOperationRequest, boolean|undefined], callback: (error?: jayson.JSONRPCError | null, result?: IOperation) => void) => {
        const requestId = uuid();
        logger.info(`${requestId}: postOperation ${JSON.stringify(args)}`)
        try {
            const [operationRequest, sync] = args;
            const operationId = await ledgerApiHelper.postOperation(operationRequest, sync);
            const operation = await ledgerApiHelper.getOperation(operationId);
            logger.info(`${requestId}: ${JSON.stringify(operation)}`)
            callback(null, operation);
        } catch (error) {
            logger.error(error.stack);
            callback(JSONRPCError.fromCode(rpcErrors.InternalError));
        }
    },
    postTransfer: async (args: [ITransferRequest, boolean|undefined], callback: (error?: jayson.JSONRPCError | null, result?: IOperation) => void) => {
        const requestId = uuid();
        logger.info(`${requestId}: postTransfer ${JSON.stringify(args)}`)
        try {
            const [transferRequest, sync] = args;
            const operationId = await ledgerApiHelper.postTransferOperation(transferRequest, sync);
            const operation = await ledgerApiHelper.getOperation(operationId);
            logger.info(`${requestId}: ${JSON.stringify(operation)}`)
            callback(null, operation);
        } catch (error) {
            logger.error(error.stack);
            callback(JSONRPCError.fromCode(rpcErrors.InternalError));
        }
    },
    createBook: async (args: [IBookRequest], callback: (error?: jayson.JSONRPCError | null, result?: IBook) => void) => {
        const requestId = uuid();
        logger.info(`${requestId}: createBook ${JSON.stringify(args)}`)
        try {
            const [bookRequest] = args;
            const book = await ledgerApiHelper.createBook(bookRequest);
            logger.info(`${requestId}: ${JSON.stringify(book)}`)
            callback(null, book);
        } catch (error) {
            logger.error(error.stack);
            callback(JSONRPCError.fromCode(rpcErrors.InternalError));
        }
    },
    getBook: async (args: [string], callback: (error?: jayson.JSONRPCError | null, result?: IBook) => void) => {
        const requestId = uuid();
        logger.info(`${requestId}: getBook ${JSON.stringify(args)}`)
        try {
            const [bookId] = args;
            const book = await ledgerApiHelper.getBook(bookId);
            if (!book) {
                logger.info(`${requestId}: not found`)
                callback(JSONRPCError.fromCode(rpcErrors.NotFound, ["book", bookId]));
            } else {
                logger.info(`${requestId}: ${JSON.stringify(book)}`)
                callback(null, book);
            }
        } catch (error) {
            logger.error(error.stack);
            callback(JSONRPCError.fromCode(rpcErrors.InternalError));
        }
    },
    getBalances: async (args: [string, string, {[key: string]: any}], callback: (error?: jayson.JSONRPCError | null, result?: IBookBalances) => void) => {
        const requestId = uuid();
        logger.info(`${requestId}: getBalances ${JSON.stringify(args)}`)
        try {
            const [bookId, assetId, metadataFilter] = args;
            const bookBalances = await ledgerApiHelper.getBookBalances(bookId, metadataFilter);
            if (assetId) {
                // TODO: need to move this logic to the database layer
                const balances: IBookBalances = {}
                balances[assetId] = bookBalances[assetId];
                logger.info(`${requestId}: ${JSON.stringify(balances)}`)
                callback(null, balances)
            } else {
                logger.info(`${requestId}: ${JSON.stringify(bookBalances)}`)
                callback(null, bookBalances)
            }
        } catch (error) {
            logger.error(error.stack);
            callback(JSONRPCError.fromCode(rpcErrors.InternalError));
        }
    },
    getOperations: async (args: [string, object], callback: (error?: jayson.JSONRPCError | null, result?: IOperation[]) => void) => {
        const requestId = uuid();
        logger.info(`${requestId}: getOperations ${JSON.stringify(args)}`)
        try {
            const [bookId, metadataFilter] = args;
            const bookOperations = await ledgerApiHelper.getBookOperations(bookId, metadataFilter);
            logger.info(`${requestId}: ${JSON.stringify(bookOperations)}`)
            callback(null, bookOperations);
        } catch (error) {
            logger.error(error.stack);
            callback(JSONRPCError.fromCode(rpcErrors.InternalError));
        }
    },
    notifyOperationCompletion: async (args: [string], callback: (error?: jayson.JSONRPCError | null, result?: string) => void) => {
        const requestId = uuid();
        logger.info(`${requestId}: notifyOperationCompletion ${JSON.stringify(args)}`)
        try {
            const [taskId] = args;
            ledgerApiHelper.emit("taskCompleted", taskId);
            logger.info(`${requestId}: ${taskId}`)
            callback(null, taskId);
        } catch (error) {
            logger.error(error.stack);
            callback(JSONRPCError.fromCode(rpcErrors.InternalError));
        }
    }
};

app.use(express.json());

app.get('/test', (req, res) => {
    // health-check
    res.send({'success': true})
})

app.use(new jayson.Server(rpcMethods).middleware())

const port = process.env.API_PORT || 3000;

const registerCallback = async (workerHost: string) => {
    return new Promise((resolve, reject) => {
        const healthCheckTimeout = setInterval(() => {
            request.get(`${workerHost}/test`, (err, res, body) => {
                if (err) {
                    logger.error(err.message);
                } else {
                    body = body && JSON.parse(body);
                    if (body && body.success) {
                        clearInterval(healthCheckTimeout);
                        request.get(`${workerHost}/register-callbacks?callbackHost=http://${process.env.HOST_IP || "localhost"}:${port}`, (e, r, b) => {
                            if (e) {
                                logger.error(e.message);
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

const workerEndpoint = process.env.REMOTE_WORKER_URL || "http://localhost:9000";
if (!workerEndpoint) {
    throw new Error("REMOTE_WORKER_URL not set!")
}
registerCallback(workerEndpoint).then(() => {
    app.listen(port, async () => {
        logger.info(`API server listening on port ${port}!`);
    })
})

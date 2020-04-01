import express from "express";
import jayson from "jayson";
import dotenv from "dotenv";
import { logger } from "./logger";
import configurations from "./config.json";
import { LedgerApiHelper, IOperationRequest, ITransferRequest, IBookRequest } from "./ledger";
import { IOperation, IBook, IBookBalances } from "./base-data-connector";
import { rpcErrors } from "./errors";
import * as dataConnectors from "./data-connectors";
import { WsFIFOServer } from "./ws-fifo-server";
import { LedgerQueueWorker } from "./ledger-queue-worker";
import { WsFIFOClient } from "./ws-fifo-client";

dotenv.config();
const environment: string = process.env.NODE_ENV || "local";
const config = (configurations as {[environment: string]: any})[environment];
export const app = express(); // exported for testing purpose

const storageConfig = config.DATABASE_CONFIG[config.DATABASE];
export const dataConnector = new (dataConnectors as any)[storageConfig.class](storageConfig);

// Spinning up FIFO queue server maintaining and notifying the queue status
// TODO: separate the execution of the LedgerQueueServer from API server
export const ledgerQueueServer = new WsFIFOServer(dataConnector);

// LedgerQueueWoker applying operations to the posting entries
// TODO: separate the execution of the LedgerQueueWorker from API server
export const ledgerQueueWorker = new LedgerQueueWorker(dataConnector, new WsFIFOClient());

// LedgerApiHelper used by the API server for reading data and pushing operations to the queue
export const ledgerApiHelper = new LedgerApiHelper(dataConnector, new WsFIFOClient());

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
    getBalances: async (args: [string, string], callback: (error?: jayson.JSONRPCError | null, result?: IBookBalances) => void) => {
        const [bookId, assetId] = args;
        const bookBalances = await ledgerApiHelper.getBookBalances(bookId);
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
    }
};

app.use(express.json());

app.get('/test', (req, res) => {
    // health-check
    res.send({'success': true})
})

app.use(new jayson.Server(rpcMethods).middleware())

const port = config.API_PORT || 3000;
app.listen(port, () => {
    logger.info(`API server istening on port ${port}!`)
})


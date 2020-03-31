import express from "express";
import jayson from "jayson";
import dotenv from "dotenv";
import { logger } from "./logger";
import configurations from "./config.json";
import { LedgerSystem, IOperationRequest, ITransferRequest, IBookRequest, IBookBalances } from "./ledger";
import { IOperation, IBook } from "./base-data-connector";
import { rpcErrors } from "./errors";

dotenv.config();
const environment: string = process.env.NODE_ENV || "local";
const config = (configurations as {[environment: string]: any})[environment];
export const app = express(); // exported for testing purpose

export const ledgerSystem = new LedgerSystem(config.DATABASE_CONFIG[config.DATABASE]);

const rpcMethods  = {
    getOperation: async (args: [string], callback: (error?: jayson.JSONRPCError | null, result?: IOperation) => void) => {
        const [operationId] = args;
        const operation = await ledgerSystem.getOperation(operationId);
        if (!operation) {
            callback(rpcErrors.OperationNotFound);
        }
        callback(null, operation);
    },
    postOperation: async (args: [IOperationRequest, boolean|undefined], callback: (error?: jayson.JSONRPCError | null, result?: IOperation) => void) => {
        const [operationRequest, sync] = args;
        const operationId = await ledgerSystem.postOperation(operationRequest, sync);
        const operation = await ledgerSystem.getOperation(operationId);
        callback(null, operation);
    },
    postTransfer: async (args: [ITransferRequest, boolean|undefined], callback: (error?: jayson.JSONRPCError | null, result?: IOperation) => void) => {
        const [transferRequest, sync] = args;
        const operationId = await ledgerSystem.postTransferOperation(transferRequest, sync);
        const operation = await ledgerSystem.getOperation(operationId);
        callback(null, operation);
    },
    createBook: async (args: [IBookRequest], callback: (error?: jayson.JSONRPCError | null, result?: IBook) => void) => {
        const [bookRequest] = args;
        const book = await ledgerSystem.createBook(bookRequest);
        callback(null, book);
    },
    getBook: async (args: [string], callback: (error?: jayson.JSONRPCError | null, result?: IBook) => void) => {
        const [bookId] = args;
        const book = await ledgerSystem.getBook(bookId);
        if (!book) {
            callback(rpcErrors.BookNotFound);
        }
        callback(null, book);
    },
    getBalances: async (args: [string, string, {[key: string]: any}], callback: (error?: jayson.JSONRPCError | null, result?: IBookBalances) => void) => {
        const [bookId, assetId, metadataFilter] = args;
        const bookBalances = await ledgerSystem.getBookBalances(bookId, metadataFilter);
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
        const bookOperations = await ledgerSystem.getBookOperations(bookId, metadataFilter);
        callback(null, bookOperations);
    }
};

app.use(express.json());

app.get('/test', (req, res) => {
    res.send({'success': true})
})

app.use(new jayson.Server(rpcMethods).middleware())

const port = config.API_PORT || 3000;
app.listen(port, () => {
    logger.info(`API server istening on port ${port}!`)
})


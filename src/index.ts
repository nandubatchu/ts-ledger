import express from "express";
import jayson from "jayson";
import dotenv from "dotenv";
import { logger } from "./logger";
import { ITransferRequest, IOperationRequest, IOperation, IAccountRequest, IAccount, IAccountBalances } from "./interfaces";
import configurations from "./config.json";
import LedgerSystem from "./ledger";

dotenv.config();
const environment: string = process.env.NODE_ENV || "local";
const config = (configurations as {[environment: string]: any})[environment];
const app = express();

const ledgerSystem = new LedgerSystem(config.DATABASE_CONFIG[config.DATABASE]);
const rpcMethods  = {
    getOperation: (args: [string], callback: (error?: jayson.JSONRPCError | null, result?: IOperation) => void) => {
        const [operationId] = args;
        const operation = ledgerSystem.getOperation(operationId);
        callback(null, operation);
    },
    postOperation: async (args: [IOperationRequest, boolean|undefined], callback: (error?: jayson.JSONRPCError | null, result?: IOperation) => void) => {
        const [operationRequest, sync] = args;
        const operationId = await ledgerSystem.postOperation(operationRequest, sync);
        const operation = ledgerSystem.getOperation(operationId);
        callback(null, operation);
    },
    postTransfer: async (args: [ITransferRequest, boolean|undefined], callback: (error?: jayson.JSONRPCError | null, result?: IOperation) => void) => {
        const [transferRequest, sync] = args;
        const operationId = await ledgerSystem.postTransferOperation(transferRequest, sync);
        const operation = ledgerSystem.getOperation(operationId);
        callback(null, operation);
    },
    createAccount: (args: [IAccountRequest], callback: (error?: jayson.JSONRPCError | null, result?: IAccount) => void) => {
        const [accountRequest] = args;
        const accountId = ledgerSystem.createAccount(accountRequest);
        const account = ledgerSystem.getAccount(accountId);
        callback(null, account);
    },
    getAccount: (args: [string], callback: (error?: jayson.JSONRPCError | null, result?: IAccount) => void) => {
        const [accountId] = args;
        const account = ledgerSystem.getAccount(accountId);
        callback(null, account);
    },
    getBalances: (args: [string, string], callback: (error?: jayson.JSONRPCError | null, result?: IAccountBalances) => void) => {
        const [accountId, assetId] = args;
        const accountBalances = ledgerSystem.getAccountBalances(accountId) as IAccountBalances;
        if (assetId) {
            // TODO: need to move this logic to the database layer
            const balances: IAccountBalances = {}
            balances[assetId] = accountBalances[assetId];
            callback(null, balances)
        } else {
            callback(null, accountBalances)
        }
    },
};

app.use(express.json());
app.use(new jayson.Server(rpcMethods).middleware())

const port = config.API_PORT || 3000;
app.listen(port, () => {
    logger.info(`API server istening on port ${port}!`)
})
module.exports = app    // for testing purpose

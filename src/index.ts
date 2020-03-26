import express from "express";
import jayson from "jayson";
import dotenv from "dotenv";
import { logger } from "./logger";
import configurations from "./config.json";
import { LedgerSystem } from "./ledger";
import { IOperation, IAccount, OperationType } from "./base-data-connector";

dotenv.config();
const environment: string = process.env.NODE_ENV || "local";
const config = (configurations as {[environment: string]: any})[environment];
export const app = express(); // exported for testing purpose

const ledgerSystem = new LedgerSystem(config.DATABASE_CONFIG[config.DATABASE]);
export interface IPostingEntryRequest {
    accountId: string,
    assetId: string,
    value: string,
}
export interface IOperationRequest {
    type: OperationType,
    memo: string,
    entries: IPostingEntryRequest[],
}
export interface ITransferRequest {
    fromAccountId: string,
    toAccountId: string,
    assetId: string,
    value: string,
    memo: string,
}
export interface IAccountRequest {
    name: string,
    metadata?: {},
    restrictions?: {
        minBalance?: string;
    }
}
export interface IAccountBalances {
    [assetId: string]: string,
}
const rpcMethods  = {
    getOperation: async (args: [string], callback: (error?: jayson.JSONRPCError | null, result?: IOperation) => void) => {
        const [operationId] = args;
        const operation = await ledgerSystem.getOperation(operationId);
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
    createAccount: async (args: [IAccountRequest], callback: (error?: jayson.JSONRPCError | null, result?: IAccount) => void) => {
        const [accountRequest] = args;
        const account = await ledgerSystem.createAccount(accountRequest);
        callback(null, account);
    },
    getAccount: async (args: [string], callback: (error?: jayson.JSONRPCError | null, result?: IAccount) => void) => {
        const [accountId] = args;
        const account = await ledgerSystem.getAccount(accountId);
        callback(null, account);
    },
    getBalances: async (args: [string, string], callback: (error?: jayson.JSONRPCError | null, result?: IAccountBalances) => void) => {
        const [accountId, assetId] = args;
        const accountBalances = await ledgerSystem.getAccountBalances(accountId);
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


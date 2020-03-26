export interface IEntryRequest {
    accountId: string,
    assetId: string,
    value: string,
}
export interface IOperationRequest {
    operationType: string,
    memo: string,
    entries: IEntryRequest[],
}
export interface IEntry {
    id: string
    accountId: string,
    assetId: string,
    value: string,
    createdAt: string,
}
export interface IOperation {
    id: string,
    operationType: string,
    memo: string,
    entries: IEntry[],
    status: string,
    createdAt: number,
    updatedAt: number,
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
        minBalance?: string
        maxBalance?: string
    }
}
export interface IAccountBalances {
    [assetId: string]: string,
}
export interface IAccount {
    name: string,
    metadata?: {},
    restrictions?: {
        minBalance?: string
        maxBalance?: string
    },
    balances: IAccountBalances,
}
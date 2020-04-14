import jayson from "jayson";
export enum rpcErrors {
    NotFound = 404,
    InternalError = 500,
}

export const errorTemplates: {[errorType in rpcErrors]: (...args: any[]) => string} = {
    404: (entityType: string, entityId: string) => `${entityType} (${entityId}) does not exist!`,
    500 : () => `Internal error`,
}

export class JSONRPCError implements jayson.JSONRPCError {
    public code: number;
    public message: string;
    constructor(errorCode: rpcErrors, args: any[] = []) {
        this.code = errorCode;
        this.message = errorTemplates[errorCode](...args);
    }
    static fromCode = (code: rpcErrors, args?: any[]) => new JSONRPCError(code, args)
}
export const rpcErrors: {[errorType: string]: {code: number, message: string}} = {
    NotImplemented: {
        code: 0,
        message: "Method not implemented!",
    },
    OperationNotFound: {
        code: 1,
        message: "Requested operation not found!",
    },
    BookNotFound: {
        code: 1,
        message: "Requested book not found!",
    }
}
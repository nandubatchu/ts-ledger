import WebSocket from "ws";
import { v4 as uuidv4 } from 'uuid';
import { BaseDataConnector, OperationStatus, IOperation } from "./base-data-connector";
export class WsFIFOServer {
    private socket!: WebSocket.Server;
    private q!: string[];
    private dataConnector: BaseDataConnector;
    private clients: {[id: string]: WebSocket} = {};
    constructor(dataConnector: BaseDataConnector) {
        this.dataConnector = dataConnector;
        this.init();
    }
    private init = async () => {
        this.q = await this.getPendingTaskIds() as string[];
        const wss = new WebSocket.Server({ port: 8080 });
        this.socket = wss;
        this.socket.on("connection", this.connectionHandler);
    }
    private connectionHandler = (ws: WebSocket) => {
        const clientId = uuidv4();
        this.clients[clientId] = ws;
        ws.on("message", (message: any) => {
            message = JSON.parse(message.toString());
            if (message.method === "getTask") {
                message.response = this.q.shift()
                ws.send(Buffer.from(JSON.stringify(message)));
            } else if (message.method === "submitTask") {
                this.q.push(message.requestData);
                message.response = message.requestData;
                ws.send(Buffer.from(JSON.stringify(message)))
            } else if (message.method === "notify") {
                Object.values(this.clients).forEach((client: WebSocket) => {
                    client.send(Buffer.from(JSON.stringify(message)))
                })
            }
        });
        ws.on("close", () => {
            delete this.clients[clientId];
        })
    }
    private getPendingTaskIds = async () => {
        return this.dataConnector.getAllOperationsByStatus([OperationStatus.INIT, OperationStatus.PROCESSING])
            .then((pendingOperations) => {
                return pendingOperations.sort((operationA: IOperation, operationB: IOperation) => operationA.id!.localeCompare(operationB.id!)).map((operation) => operation.id)
            });
    }
}

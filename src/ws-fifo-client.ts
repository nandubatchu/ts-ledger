import WebSocket from "ws";
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from "events";
import { sleep } from "./utils";

export type TaskProvider = (taskId: string) => () => Promise<void>;

export interface IFIFOClient extends EventEmitter {
    submitTask: (taskId: string) => Promise<void>;
    clearQueue: (taskProvider: TaskProvider, frequency?: number) => Promise<void>;
}

export class WsFIFOClient extends EventEmitter implements IFIFOClient {
    private initPromise: Promise<unknown>
    private socket: WebSocket;
    constructor(fifoHost?: string) {
        super();
        this.socket = new WebSocket(fifoHost || "ws://localhost:8080");
        this.initPromise = this.init();
    }
    private init = async () => {
        return new Promise((resolve, reject) => {
            this.socket.on('open', function open() {
                resolve();
            });
            this.socket.on('message', (message: any) => {
                message = JSON.parse(message.toString());
                if (message.method && message.method === "notify") {
                    this.emit(message.requestData.event, message.requestData.data);
                }
                this.emit("message", message)
            })
        })
    }
    private sendRequest = (method: string, data?: any) => {
        const requestId: string = uuidv4();
        return new Promise((resolve, reject) => {
            const request = {method, requestId, requestData: data};
            this.socket.send(Buffer.from(JSON.stringify(request)))
            const responseCallback = (message: any) => {
                if (message.method && message.method === method && message.requestId === requestId) {
                    this.removeListener("message", responseCallback);
                    resolve(message.response);
                }
            }
            this.on('message', responseCallback);
        })
    }
    public submitTask = async (taskId: string) => {
        await this.initPromise;
        await this.sendRequest("submitTask", taskId);
    }
    public clearQueue = async (taskProvider: TaskProvider, frequency: number = 10) => {
        await this.initPromise;
        const taskId = await this.sendRequest("getTask") as string;
        if (taskId) {
            const task = taskProvider(taskId);
            if (task) {
                await task();
                await this.sendRequest("notify", {event: "taskCompleted", data: taskId});
                // this.emit("taskCompleted", taskId);
            }
        }
        await sleep(frequency);
        this.clearQueue(taskProvider);
    }
}

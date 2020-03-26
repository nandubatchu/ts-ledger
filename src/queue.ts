import { sleep } from "./utils";
export class FIFOQueue {
    private taskQueue: (() => Promise<void>)[];
    constructor(pendingTasks?: (() => Promise<void>)[]) {
        this.taskQueue = pendingTasks || [];
        this.clearQueue();
    }
    async clearQueue() {
        const task = this.taskQueue.shift()
        if (task) {
            await task();
        }
        await sleep(1);
        this.clearQueue();
    }
    enqueueTask(task: () => Promise<void>) {
        this.taskQueue.push(task);
    }
}

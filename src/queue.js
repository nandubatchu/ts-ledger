const sleep = require('./utils').sleep;
class FIFOQueue {
    constructor() {
        this.taskQueue = [];
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
    enqueueTask(task) {
        this.taskQueue.push(task);
    }
}
module.exports = FIFOQueue;
const sleep = require('./utils').sleep;
const FIFOQueue = require("./queue");

const q = new FIFOQueue();

q.enqueueTask(async () => {
    console.log("1");
    sleep(10000).then(() => console.log("1 done"));
})
q.enqueueTask(async () => {
    console.log("2");
    sleep(5000).then(() => console.log("2 done"));
})
const sleep = async (ms) => {
    return await new Promise(resolve => setTimeout(resolve, ms));
}
module.exports = {
    sleep
}
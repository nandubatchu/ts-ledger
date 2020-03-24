const sleep = async (ms) => {
    return await new Promise(resolve => setTimeout(resolve, ms));
}
const groupBy = (items, key) => items.reduce(
    (result, item) => ({
        ...result,
        [item[key]]: [
            ...(result[item[key]] || []),
            item,
        ],
    }),
    {},
);
module.exports = {
    sleep,
    groupBy
}
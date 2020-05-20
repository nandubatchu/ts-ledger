export const sleep = async (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}
export const groupBy = (items: any[], key: string|number) => items.reduce(
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
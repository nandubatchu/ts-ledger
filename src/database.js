const fakes = require("./fakes.json");
class InMemoryData {
    constructor() {
        this.operations = fakes.operations;
        this.entries = fakes.entries;
        this.accounts = fakes.accounts;
    }
    insert(tableName, row) {
        const length = this[tableName].length;
        row.id = (length + 1).toString();
        row.createdAt = new Date().getTime();
        this[tableName].push(row);
        return row.id;
    }
    insertMany(tableName, rows) {
        let length = this[tableName].length;
        const ids = []
        for (const row of rows) {
            row.id = (length + 1).toString();
            row.createdAt = new Date().getTime();
            ids.push(row.id);
            length++;
        }
        this[tableName] = this[tableName].concat(rows)
        return ids
    }
    get(tableName, id) {
        if (id) {
            return this[tableName].find(e => e.id === id);
        } else {
            return this[tableName];
        }
    }
    getAll(tableName, id) {
        return this[tableName].filter(e => e.accountId === id);
    }
    update(tableName, id, data) {
        data = Object.assign(data, {updatedAt: new Date().getTime()})
        const rowIndex = this[tableName].findIndex(e => e.id === id);
        this[tableName][rowIndex] = Object.assign(this[tableName][rowIndex], data);
        return id;
    }
}

class PostgresData {

}

module.exports = {
    InMemoryData,
    PostgresData
}
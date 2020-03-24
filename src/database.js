const fakes = require("./fakes.json");
class Data {
    constructor(config) {}
    insert() {}
    insertMany() {}
    get() {}
    getAll() {}
    update() {}
}
class InMemoryData extends Data {
    constructor(config) {
        super(config);
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
        return this[tableName].find(e => e.id === id);
    }
    getAll(tableName, id) {
        if (id) {
            return this[tableName].filter(e => e.accountId === id);
        } else {
            return this[tableName];
        }
    }
    update(tableName, id, data) {
        data = Object.assign(data, {updatedAt: new Date().getTime()})
        const rowIndex = this[tableName].findIndex(e => e.id === id);
        this[tableName][rowIndex] = Object.assign(this[tableName][rowIndex], data);
        return id;
    }
}

class SQLiteData extends Data {}

class PostgresData extends Data {}

module.exports = {
    InMemoryData,
    SQLiteData,
    PostgresData
}
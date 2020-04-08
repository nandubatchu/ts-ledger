import { sequelize } from "../connection";
import { DataTypes } from "sequelize";

export const PostingEntry = sequelize.define('posting_entry', {
    operationId: { type: DataTypes.STRING, allowNull: false },
    bookId: { type: DataTypes.STRING, allowNull: false },
    assetId: { type: DataTypes.STRING, allowNull: false },
    value: { type: DataTypes.STRING, allowNull: false },
    metadata: { type: DataTypes.JSON, allowNull: true },
});

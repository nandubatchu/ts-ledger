import { sequelize } from "../connection";
import { DataTypes } from "sequelize";

export const Operation = sequelize.define('operation', {
    type: { type: DataTypes.ENUM, values: ["TRANSFER"] },
    memo: { type: DataTypes.STRING, allowNull: true },
    entries: { type: DataTypes.JSON },
    status: { type: DataTypes.ENUM, values: ["INIT", "PROCESSING", "APPLIED", "REJECTED"] },
    rejectionReason: { type: DataTypes.STRING, allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true },
});

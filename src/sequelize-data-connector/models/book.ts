import { sequelize } from "../connection";
import { DataTypes } from "sequelize";

export const Book = sequelize.define('book', {
    name: { type: DataTypes.STRING },
    metadata: { type: DataTypes.JSON, allowNull: true },
    restrictions: { type: DataTypes.JSON, allowNull: true },
});

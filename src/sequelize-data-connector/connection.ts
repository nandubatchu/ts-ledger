import { Sequelize } from "sequelize";
import dotenv from "dotenv";
import { logger } from "../logger";
dotenv.config();

const connectionString = process.env.DB_CONNECTION_STRING;
if (!connectionString) {
    throw new Error("DB_CONNECTION_STRING environment variable not set!");
}
export const sequelize = new Sequelize(connectionString, {logging: msg => logger.debug(msg)});

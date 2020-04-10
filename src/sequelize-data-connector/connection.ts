import { Sequelize } from "sequelize";
import dotenv from "dotenv";
import { logger } from "../logger";
dotenv.config();

export const sequelize = new Sequelize(process.env.DB_CONNECTION_STRING || "sqlite::memory:", {logging: msg => logger.debug(msg)});

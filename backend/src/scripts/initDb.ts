import dotenv from "dotenv";
dotenv.config();
import { initSchema } from "../lib/db";

initSchema();
console.log("Database schema initialized.");

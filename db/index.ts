import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "@/db/schema";

// Create a dummy connection pool for build time that won't actually connect
const pool = mysql.createPool({
	uri: process.env.DATABASE_URL || "mysql://root:password@localhost:3306/test",
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0,
});

export const db = drizzle(pool, { schema, mode: "default" });

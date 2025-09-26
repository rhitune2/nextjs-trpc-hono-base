import { defineConfig } from "drizzle-kit";
import "dotenv/config";


export default defineConfig({
	schema: "./db/schema",
	out: "./db/migrations",
	dialect: "mysql",
	dbCredentials: {
		url: process.env.DATABASE_URL || "",
	},
});

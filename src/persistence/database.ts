import { Pool } from "pg";

export const createDatabasePool = (connectionString: string): Pool => new Pool({ connectionString });

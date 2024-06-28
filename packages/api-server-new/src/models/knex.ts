import { DB_DATABASE, DB_HOST, DB_PASS, DB_PORT, DB_USER } from "../config";
import createConnection from 'knex';

export const knex = createConnection({
  client: 'mysql2',
  connection: {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: DB_DATABASE,
  },
});
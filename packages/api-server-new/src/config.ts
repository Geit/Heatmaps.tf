export const DB_HOST = process.env.DB_HOST || 'localhost';
export const DB_PORT = process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306;
export const DB_USER = process.env.DB_USER || 'heatmaps';
export const DB_DATABASE = process.env.DB_DATABASE || 'heatmaps';
export const DB_PASS = process.env.DB_PASS;


export const PORT = process.env.PORT ? parseInt(process.env.PORT) : 37681;
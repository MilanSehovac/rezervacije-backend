require('dotenv').config();

const fromEnv = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  dialect: 'mysql',
};

module.exports = {
  development: fromEnv,
  test: fromEnv,
  production: fromEnv,
};

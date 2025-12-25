require('dotenv').config();
const express = require('express');
const cors = require('cors');
const port = process.env.PORT;
const app = express();
const { sequelize } = require('./models');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected');
  } catch (err) {
    console.error(err);
  }
})();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}))

app.use('/api/users', require('./Routes/userRoutes'))
app.use('/api/salons', require('./Routes/salonRoutes'))

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
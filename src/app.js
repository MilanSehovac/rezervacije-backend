require('dotenv').config();
const express = require('express');
const cors = require('cors');
const port = process.env.PORT;
const app = express();
const { sequelize } = require('./models');
const cookieParser = require('cookie-parser');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected');
  } catch (err) {
    console.error(err);
  }
})();

app.use(cors({
  origin: `http://localhost:3000`,
  credentials:true
}));
app.use(express.json());
app.use(express.urlencoded({extended: true}))
app.use(cookieParser());

app.use('/api/users', require('./Routes/userRoutes'))
app.use('/api/salon', require('./Routes/salonRoutes'))
app.use('/api/bookings', require('./Routes/bookingRoutes'))

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
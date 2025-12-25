require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const port = process.env.PORT;
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}))

connectDB();

app.use('/api/users', require('./Routes/userRoutes'))
app.use('/api/salons', require('./Routes/salonRoutes'))

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
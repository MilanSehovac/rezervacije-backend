require('dotenv').config();
const mongoose = require('mongoose');

const uri = process.env.MONGO_URI;
const dbName = process.env.DATABASE_NAME;

const connectDB = async () => {
  try {
    await mongoose.connect(uri, {
      dbName: dbName,
    });
    console.log("Connected to MongoDB!");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

module.exports = connectDB;
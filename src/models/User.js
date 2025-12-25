const mongoose = require('mongoose')
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;

const userSchema = new mongoose.Schema({
    firstName: { 
      type: String, 
      required: true,
      trim: true,
    },
    lastName: { 
      type: String, 
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      validate: {
        validator: function(v) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: props => `${props.value} is not a valid email!`
      }
    },
    password: {
      type: String,
      required: true,
      select: false,
      minlength: [8, 'Password must be at least 8 characters'],
    },
    phoneNumber: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^\+?\d{10,15}$/.test(v);
        },
        message: props => `${props.value} is not a valid phone number!`
      }
    },
    userType: { 
      type: Number, 
      required: true,
      enum: [1, 2]
    },
    salonId: { type: Number, required: false },
  }, { timestamps: true });

  userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    try {
      const hashed = await bcrypt.hash(this.password, SALT_ROUNDS);
      this.password = hashed;
      next();
    } catch (error) {
      next(error);
    }
  });
  
  userSchema.methods.comparePassword = async function (plainPassword) {
    return await bcrypt.compare(plainPassword, this.password);
  };

module.exports = mongoose.model('User', userSchema)
const mongoose = require('mongoose')

const salonSchema = new mongoose.Schema({
    name: {type: String, required: true},
    description: {type: String, required: true},
    address: {type: String, required: true},
    city: {type: String, required: true},
    state: {type: String, required: true},
    category: {type: String, required: true},
    image: {type: String, required: true},
    rating: {type: Number, required: true},
    reviewCount: {type: Number, required: true},
    phone: {type: String, required: true},
    services: {type: [String], required: true},
    specialties: {type: [String], required: true},
    isOpen: {type: Boolean, required: true},
    distance: {type: String, required: true}
})
const Salon = require('../models/Salon')

exports.createSalon = async (req, res) => {
    try {
        const salon = await Salon.create(req.body)
        res.status(201).json(salon)
    } catch (error) {
        res.send('Error creating salon: ' + error)
    }
}
exports.getSalon = async (req, res) => {
    try {
        const salons = await Salon.find()
        res.json(salons)
    } catch (error) {
        res.send('Error getting salons: ' + error)
    }
}

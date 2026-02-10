exports.salonOwnerOnly = async (req, res, next) => {
    const salon = await Salon.findOne({ where: { owner_id: req.user.id }});
    if (!salon) return res.status(403).json({ message: 'No salon found' });
    next();
};
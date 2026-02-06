const jwt = require('jsonwebtoken');

exports.authenticate = (req, res, next) => {
    try {
        const token = req.cookies?.refreshToken;
        if(!token) return res.status(401).json({error: 'No token'})

        const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
        req.user = { id: payload.id }
        next();
    } catch (err) {
        console.error(err);
        res.status(401).json({error: 'Invalid token'})
    }
}
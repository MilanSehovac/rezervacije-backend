const jwt = require('jsonwebtoken');

exports.authenticate = (req, res, next) => {
    try {
        const token = req.cookies?.refreshToken;
        if(!token) return res.status(401).json({error: 'No token'})

        const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
        req.user = { id: payload.id }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
}

// Identifies the caller when a valid cookie is present, but never rejects the request.
exports.optionalAuthenticate = (req, res, next) => {
    try {
        const token = req.cookies?.refreshToken;
        if (token) {
            const payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
            req.user = { id: payload.id }
        }
    } catch {
        // invalid or expired cookie: treat as anonymous
    }
    next();
}

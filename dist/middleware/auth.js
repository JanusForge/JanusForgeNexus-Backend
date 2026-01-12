import jwt from 'jsonwebtoken';
export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }
    try {
        const secret = process.env.JWT_ACCESS_SECRET;
        if (!secret) {
            throw new Error('JWT secret not configured');
        }
        const decoded = jwt.verify(token, secret);
        req.user = decoded;
        next();
    }
    catch (error) {
        return res.status(403).json({ message: 'Invalid or expired token' });
    }
};
// Middleware to check user tier
export const requireTier = (requiredTier) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        // Fix: Update tier hierarchy to match UserTier enum
        const tierHierarchy = {
            'FREE': 0,
            'BASIC': 1,
            'PROFESSIONAL': 2,
            'ENTERPRISE': 3
        };
        const userTierLevel = tierHierarchy[req.user.tier] || 0;
        const requiredTierLevel = tierHierarchy[requiredTier] || 0;
        if (userTierLevel < requiredTierLevel) {
            return res.status(403).json({
                message: `This feature requires ${requiredTier} tier or higher`,
                requiredTier,
                currentTier: req.user.tier
            });
        }
        next();
    };
};

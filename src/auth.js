const jwt = require('jsonwebtoken');
const config = require('./config');

/**
 * Generate a JWT for an authenticated agent.
 */
function signToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

/**
 * Express middleware — verifies Bearer token on every request.
 * Skips the /api/auth/login and /api/auth/forgot-password routes.
 */
function requireAuth(req, res, next) {
  // Public routes that don't need a token
  const publicPaths = ['/api/auth/login', '/api/auth/forgot-password', '/health'];
  if (publicPaths.includes(req.path)) return next();

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token em falta.' });
  }

  try {
    const token = header.slice(7);
    const decoded = jwt.verify(token, config.jwt.secret);
    req.agent = decoded; // { agentId, agentName, ... }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

module.exports = { signToken, requireAuth };

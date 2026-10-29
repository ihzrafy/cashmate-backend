const userService = require('../services/userService');

/**
 * Authentication middleware for Multi-Tenant SaaS.
 * Resolves user from Bearer header or ?auth= query param.
 */
function authMiddleware(req, res, next) {
  let token = null;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query.auth) {
    token = String(req.query.auth).trim();
  }

  if (token) {
    const user = userService.getUserByAuthToken(token);
    if (user) {
      req.user = user;
      return next();
    }
  }

  // Fallback to default owner if no token provided (for seamless single-dev / backward compatibility)
  const defaultOwner = userService.ensureDefaultOwner(process.env.SPREADSHEET_ID);
  req.user = defaultOwner;
  next();
}

/**
 * Strict authentication middleware (requires valid token)
 */
function strictAuthMiddleware(req, res, next) {
  let token = null;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query.auth) {
    token = String(req.query.auth).trim();
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token autentikasi tidak ditemukan. Buka bot Telegram dan ketik /web untuk mendapatkan link akses.'
    });
  }

  const user = userService.getUserByAuthToken(token);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Token autentikasi tidak valid atau telah kedaluwarsa.'
    });
  }

  req.user = user;
  next();
}

module.exports = {
  authMiddleware,
  strictAuthMiddleware
};

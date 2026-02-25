const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'david-mission-control-secret-2026';
const USERNAME = 'david';
const PASSWORD = 'Ansh@davidai';

const JWT_EXPIRY = '24h';

// Login - returns JWT token
function login(username, password) {
  if (username === USERNAME && password === PASSWORD) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    return { success: true, token };
  }
  return { success: false, error: 'Invalid credentials' };
}

// Verify JWT token
function verify(token) {
  try {
    return { valid: true, data: jwt.verify(token, JWT_SECRET) };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

// Auth middleware for Express
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  const result = verify(token);
  
  if (!result.valid) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  req.user = result.data;
  next();
}

module.exports = { login, verify, requireAuth, JWT_SECRET };

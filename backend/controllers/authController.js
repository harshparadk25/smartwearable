const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createUser, findUserByEmail, updateUser } = require('../storage/dataStore');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const signToken = (user) =>
  jwt.sign({ sub: user._id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

const toUserResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt
});

exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    if (!emailRegex.test(String(email).trim())) {
      return res.status(400).json({ message: 'Invalid email address' });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(String(password), 12);
    const user = await createUser({ name: String(name).trim(), email, passwordHash });
    const token = signToken(user);

    return res.status(201).json({ token, user: toUserResponse(user) });
  } catch (err) {
    return next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(String(password), user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const updated = await updateUser(user._id, { lastLoginAt: new Date().toISOString() });
    const token = signToken(updated || user);

    return res.json({ token, user: toUserResponse(updated || user) });
  } catch (err) {
    return next(err);
  }
};

exports.me = async (req, res) => {
  return res.json(toUserResponse(req.user));
};

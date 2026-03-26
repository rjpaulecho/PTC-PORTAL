const express = require('express');
const router = express.Router();

// Mock users
const users = [
  { username: 'admin', password: '1234', role: 'admin' },
  { username: 'student', password: '5678', role: 'student' }
];

// Login endpoint
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    res.json({ success: true, user: { username: user.username, role: user.role } });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

module.exports = router;

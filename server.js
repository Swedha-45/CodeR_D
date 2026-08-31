const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const XLSX = require('xlsx');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Set your Admin Credentials here
const ADMIN_USER = "admin";
const ADMIN_PASS = "faculty123";

// Updated Authentication Middleware
const requireAuth = (req, res, next) => {
  if (req.cookies && req.cookies.admin_session === 'authenticated') {
    return next();
  }
  
  // If request comes from an API call (fetch), send 401 instead of redirecting
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized. Please login again.' });
  }

  // If request comes from a browser navigation (page load), redirect to /login
  res.redirect('/login');
};

// SQLite Database Setup
const db = new sqlite3.Database('./club.db', (err) => {
  if (err) console.error('Database Error:', err);
  else console.log('Connected to SQLite Database.');
});

// Create Table and ensure 'reason' column exists
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      regNumber TEXT,
      fullName TEXT,
      mobile TEXT,
      email TEXT,
      department TEXT,
      year TEXT,
      club TEXT,
      position TEXT,
      reason TEXT,
      submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`ALTER TABLE registrations ADD COLUMN reason TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Column setup complete.');
    }
  });
});

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));

// PUBLIC: Student Form Page & API
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.post('/api/register', (req, res) => {
  const { regNumber, fullName, mobile, email, department, year, club, position, reason } = req.body;
  const sql = `INSERT INTO registrations (regNumber, fullName, mobile, email, department, year, club, position, reason) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  
  db.run(sql, [regNumber, fullName, mobile, email, department, year, club, position, reason], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'success', id: this.lastID });
  });
});

// LOGIN ROUTES
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    // Set authentication cookie
    res.cookie('admin_session', 'authenticated', { 
      httpOnly: true, 
      maxAge: 2 * 60 * 60 * 1000,
      sameSite: 'lax'
    });
    res.json({ status: 'success' });
  } else {
    res.status(401).json({ error: 'Invalid Credentials' });
  }
});

app.get('/logout', (req, res) => {
  res.clearCookie('admin_session');
  res.redirect('/login');
});

// PROTECTED ROUTES
app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/students', requireAuth, (req, res) => {
  db.all('SELECT * FROM registrations ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.delete('/api/students/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM registrations WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'success' });
  });
});

app.get('/api/export', requireAuth, (req, res) => {
  db.all('SELECT regNumber, fullName, mobile, email, department, year, club, position, reason, submittedAt FROM registrations', [], (err, rows) => {
    if (err) return res.status(500).send('Database export error');

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Registrations');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Club_Registrations.xlsx"');
    res.send(buffer);
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
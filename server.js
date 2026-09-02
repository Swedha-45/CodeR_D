const express = require('express');
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Admin Credentials (uses Environment Variables or defaults to admin / faculty123)
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "faculty123";

// MongoDB Atlas Connection Setup
const MONGO_URI ="mongodb+srv://swelee45_db_user:uT5QdMGm2YzvYMhJ@cluster0.h9qwo1e.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas successfully.'))
  .catch((err) => console.error('MongoDB Connection Error:', err));

// Define Student Registration Schema & Model
const registrationSchema = new mongoose.Schema({
  regNumber: String,
  fullName: String,
  mobile: String,
  email: String,
  department: String,
  year: String,
  club: String,
  position: String,
  reason: String,
  submittedAt: { type: Date, default: Date.now }
});

const Registration = mongoose.model('Registration', registrationSchema);

// Authentication Middleware
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

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));

// PUBLIC: Student Form Page & API
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.post('/api/register', async (req, res) => {
  try {
    const newStudent = new Registration(req.body);
    await newStudent.save();
    res.json({ status: 'success', id: newStudent._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AUTH STATUS ENDPOINT
app.get('/api/auth-status', (req, res) => {
  if (req.cookies && req.cookies.admin_session === 'authenticated') {
    res.json({ isAuthenticated: true });
  } else {
    res.json({ isAuthenticated: false });
  }
});

// LOGIN ROUTES
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
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

app.get('/api/students', requireAuth, async (req, res) => {
  try {
    const students = await Registration.find().sort({ submittedAt: -1 });
    // Format _id to id for seamless frontend table rendering
    const formatted = students.map(student => ({
      ...student._doc,
      id: student._id
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/students/:id', requireAuth, async (req, res) => {
  try {
    await Registration.findByIdAndDelete(req.params.id);
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/export', requireAuth, async (req, res) => {
  try {
    const students = await Registration.find({}, '-_id -__v').lean();
    
    const worksheet = XLSX.utils.json_to_sheet(students);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Registrations');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Club_Registrations.xlsx"');
    res.send(buffer);
  } catch (err) {
    res.status(500).send('Database export error');
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
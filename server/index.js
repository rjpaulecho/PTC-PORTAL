const express = require('express');
const cors = require('cors');
const authRoutes = require('./auth.routes');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);

// Dashboard data endpoint
app.get('/api/admin/dashboard', (req, res) => {
  // Mock data for now
  const dashboardData = {
    stats: {
      totalAdmissions: 245,
      approved: 200,
      pending: 12,
      rejected: 33,
      totalStudents: 1250,
      activeStudents: 1200,
      inactiveStudents: 50,
      examsScheduled: 8,
      upcomingExams: 3,
      ongoingExams: 1,
      completedExams: 4,
      announcements: 34,
      activeAnnouncements: 12,
      thisMonthAnnouncements: 8
    },
    recentActivity: [
      {
        type: 'success',
        icon: 'CheckCircle',
        title: '3 new admissions approved',
        description: '2 hours ago • Automated approval system'
      },
      {
        type: 'info',
        icon: 'Calendar',
        title: 'Entrance Exam scheduled for March 25, 2026',
        description: '4 hours ago • Mathematics Department'
      },
      {
        type: 'warning',
        icon: 'Megaphone',
        title: 'Announcement posted: "Semester Break Extended"',
        description: '1 day ago • Administration'
      },
      {
        type: 'primary',
        icon: 'UserCheck',
        title: '15 new students registered in the portal',
        description: '2 days ago • Registration system'
      }
    ]
  };
  res.json(dashboardData);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

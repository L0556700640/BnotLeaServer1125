const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// נתיב לקובץ הנתונים
const DATA_FILE = path.join(__dirname, 'data', 'students.json');

// יצירת תיקיית data אם לא קיימת
async function ensureDataDir() {
  const dataDir = path.join(__dirname, 'data');
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// קריאת נתונים מהקובץ
async function readData() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // אם הקובץ לא קיים, החזר מערך רקע
    return { students: [] };
  }
}

// כתיבת נתונים לקובץ
async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// פונקציה לבדיקת אם התלמידה כבר מילאה טופס היום
function hasFilledToday(lastFillDate) {
  if (!lastFillDate) return false;
  
  const today = new Date().toDateString();
  const lastDate = new Date(lastFillDate).toDateString();
  
  return today === lastDate;
}

// API: קבלת פרטי תלמידה לפי תעודת זהות
app.get('/api/student/:id', async (req, res) => {
  try {
    const studentId = req.params.id;
    const data = await readData();
    
    const student = data.students.find(s => s.id === studentId);
    
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'תלמידה לא נמצאה במערכת' 
      });
    }
    
    // בדיקה אם כבר מילאה היום
    const canFillToday = !hasFilledToday(student.lastFillDate);
    
    res.json({ 
      success: true, 
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        grade: student.grade,
        class: student.class,
        totalPoints: student.totalPoints,
        canFillToday
      }
    });
  } catch (error) {
    console.error('Error fetching student:', error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאה בשרת' 
    });
  }
});

// API: שמירת בחירות תלמידה
app.post('/api/submit', async (req, res) => {
  try {
    const { studentId, selections } = req.body;
    
    if (!studentId || !selections || !Array.isArray(selections)) {
      return res.status(400).json({ 
        success: false, 
        message: 'נתונים לא תקינים' 
      });
    }
    
    const data = await readData();
    const studentIndex = data.students.findIndex(s => s.id === studentId);
    
    if (studentIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'תלמידה לא נמצאה' 
      });
    }
    
    const student = data.students[studentIndex];
    
    // בדיקה אם כבר מילאה היום
    if (hasFilledToday(student.lastFillDate)) {
      return res.status(400).json({ 
        success: false, 
        message: 'כבר מילאת את הטופס היום' 
      });
    }
    
    // חישוב נקודות (5 נקודות לכל בחירה)
    const pointsToAdd = selections.length * 5;
    
    // עדכון נקודות לפי קטגוריה
    selections.forEach(category => {
      if (!student.pointsByCategory[category]) {
        student.pointsByCategory[category] = 0;
      }
      student.pointsByCategory[category] += 5;
    });
    
    // עדכון סה"כ נקודות ותאריך
    student.totalPoints += pointsToAdd;
    student.lastFillDate = new Date().toISOString();
    
    // שמירת הנתונים
    data.students[studentIndex] = student;
    await writeData(data);
    
    res.json({ 
      success: true, 
      message: 'הנתונים נשמרו בהצלחה',
      totalPoints: student.totalPoints,
      pointsAdded: pointsToAdd
    });
  } catch (error) {
    console.error('Error submitting data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאה בשמירת הנתונים' 
    });
  }
});

// API: קבלת כל הנתונים (למנהלים)
app.get('/api/admin/all-students', async (req, res) => {
  try {
    const data = await readData();
    res.json({ 
      success: true, 
      students: data.students 
    });
  } catch (error) {
    console.error('Error fetching all students:', error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאה בשרת' 
    });
  }
});

// API: הוספת תלמידה חדשה (למנהלים)
app.post('/api/admin/add-student', async (req, res) => {
  try {
    const { id, firstName, lastName, grade, className } = req.body;
    
    if (!id || !firstName || !lastName || !grade || !className) {
      return res.status(400).json({ 
        success: false, 
        message: 'חסרים פרטים' 
      });
    }
    
    const data = await readData();
    
    // בדיקה אם התלמידה כבר קיימת
    if (data.students.find(s => s.id === id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'תלמידה כבר קיימת במערכת' 
      });
    }
    
    // יצירת תלמידה חדשה
    const newStudent = {
      id,
      firstName,
      lastName,
      grade,
      class: className,
      totalPoints: 0,
      lastFillDate: null,
      pointsByCategory: {
        collar: 0,
        hair: 0,
        makeup: 0,
        shoes: 0,
        sweater: 0
      }
    };
    
    data.students.push(newStudent);
    await writeData(data);
    
    res.json({ 
      success: true, 
      message: 'תלמידה נוספה בהצלחה',
      student: newStudent
    });
  } catch (error) {
    console.error('Error adding student:', error);
    res.status(500).json({ 
      success: false, 
      message: 'שגיאה בהוספת תלמידה' 
    });
  }
});

// הפעלת השרת
app.listen(PORT, async () => {
  await ensureDataDir();
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📊 API endpoints:
  - GET  /api/student/:id
  - POST /api/submit
  - GET  /api/admin/all-students
  - POST /api/admin/add-student
  `);
});
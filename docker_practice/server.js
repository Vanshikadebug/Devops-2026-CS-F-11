const http = require('http');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const PORT = process.env.PORT || 3000;

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/student-portal';
mongoose.connect(MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

const studentSchema = new mongoose.Schema({
    id: String,
    name: String,
    mobile: String,
    email: String,
    branch: String,
    password: String
});

const Student = mongoose.model('Student', studentSchema);

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Handle POST /api/students to persist new student in MongoDB
    if (req.method === 'POST' && (req.url === '/api/students' || req.url === '/students.json')) {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const newStudentData = JSON.parse(body);

                // Generate ID if missing
                if (!newStudentData.id) {
                    const count = await Student.countDocuments();
                    const nextIdNum = count + 1;
                    newStudentData.id = `STU${String(nextIdNum).padStart(3, '0')}`;
                }

                const newStudent = new Student(newStudentData);
                await newStudent.save();
                
                const students = await Student.find({});

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    message: 'Student record successfully saved to database',
                    student: newStudent,
                    students: students
                }));
            } catch (error) {
                console.error('Error in POST /api/students:', error);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Failed to process and save student data.' }));
            }
        });
        return;
    }

    // Handle GET /api/students
    if (req.method === 'GET' && req.url === '/api/students') {
        try {
            const students = await Student.find({}, { _id: 0, __v: 0 }); // Exclude _id and __v for cleaner output
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(students));
        } catch (error) {
            console.error('Error in GET /api/students:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Failed to fetch student data.' }));
        }
        return;
    }

    // Serve static files
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Store doubts for each room
const roomDoubts = {};

// Helper function to get local IP address
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (127.0.0.1) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIPAddress();
const PORT = process.env.PORT || 3001;

// API endpoint to get server URL for clients
app.get('/api/server-info', (req, res) => {
  res.json({
    ip: LOCAL_IP,
    port: PORT,
    teacherUrl: `http://${LOCAL_IP}:${PORT}/teacher`,
    joinUrl: (roomId) => `http://${LOCAL_IP}:${PORT}/join/${roomId}`
  });
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Route for teacher board
app.get('/teacher', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
});

// Dynamic route for students to join a room
app.get('/join/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student.html'));
});

// Root route - redirect to teacher
app.get('/', (req, res) => {
  res.redirect('/teacher');
});

// Socket.io handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle joining a room
  socket.on('join_room', (data) => {
    const { roomId, role } = data;
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId} as ${role}`);
    
    // Send existing doubts to teacher if joining as teacher
    if (role === 'teacher' && roomDoubts[roomId]) {
      socket.emit('load_doubts', roomDoubts[roomId]);
    }
  });

  // Handle receiving a doubt from student
  socket.on('send_doubt', (data) => {
    const { roomId, doubt, studentName } = data;
    console.log(`Received doubt in room ${roomId}: ${doubt} from ${studentName}`);
    
    // Store the doubt
    if (!roomDoubts[roomId]) {
      roomDoubts[roomId] = [];
    }
    
    const newDoubt = {
      id: Date.now(),
      studentName,
      doubt,
      timestamp: new Date().toLocaleTimeString()
    };
    
    roomDoubts[roomId].push(newDoubt);
    
    // Broadcast to all in the room
    io.to(roomId).emit('receive_doubt', newDoubt);
  });

  // Handle clearing all doubts (teacher only)
  socket.on('clear_doubts', (data) => {
    const { roomId } = data;
    roomDoubts[roomId] = [];
    io.to(roomId).emit('doubts_cleared');
    console.log(`All doubts cleared in room ${roomId}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Server is running!`);
  console.log(`═══════════════════════════════════════`);
  console.log(`Local access:   http://localhost:${PORT}`);
  console.log(`Network access: http://${LOCAL_IP}:${PORT}`);
  console.log(`═══════════════════════════════════════`);
  console.log(`Teacher board: http://${LOCAL_IP}:${PORT}/teacher`);
  console.log(`Student join:  http://${LOCAL_IP}:${PORT}/join/class123`);
  console.log(`\n📱 For mobile testing, use the Network URL!`);
});


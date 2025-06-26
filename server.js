const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});


app.use(express.static('public'));

const users = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  users.set(socket.id, socket);

  // Send updated list of online users
  io.emit('online-users', Array.from(users.keys()));

  socket.on('offer', (data) => {
    io.to(data.to).emit('offer', { offer: data.offer, from: socket.id });
  });

  socket.on('answer', (data) => {
    io.to(data.to).emit('answer', { answer: data.answer, from: socket.id });
  });

  socket.on('candidate', (data) => {
    io.to(data.to).emit('candidate', { candidate: data.candidate, from: socket.id });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    users.delete(socket.id);
    io.emit('online-users', Array.from(users.keys()));
  });
});

// Optional: prevent favicon 404 error
app.get('/favicon.ico', (req, res) => res.status(204));

const PORT =8080;
http.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

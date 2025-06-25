const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

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
  });
});

const PORT = 8080;
http.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

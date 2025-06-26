const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

const users = {};

io.on('connection', (socket) => {
    console.log('New user connected');

    socket.on('new-user-joined', (username) => {
        users[socket.id] = { username, inCall: false };
        socket.broadcast.emit('user-joined', username);
        io.emit('update-user-list', getUsersList());
    });

    socket.on('send-message', (message) => {
        const username = users[socket.id]?.username;
        if (username) {
            socket.broadcast.emit('receive-message', { username, message });
        }
    });

    socket.on('typing', () => {
        const username = users[socket.id]?.username;
        if (username) {
            socket.broadcast.emit('user-typing', username);
        }
    });

    socket.on('stop-typing', () => {
        socket.broadcast.emit('user-stopped-typing');
    });

    // Video call handlers with proper error checking
    socket.on('call-user', (data) => {
        const caller = users[socket.id];
        const callee = users[data.to];
        
        if (!caller || !callee) {
            socket.emit('call-error', 'User not found');
            return;
        }
        
        if (caller.inCall || callee.inCall) {
            socket.emit('call-error', 'User is already in a call');
            return;
        }

        users[socket.id].inCall = true;
        users[data.to].inCall = true;
        
        io.to(data.to).emit('call-made', {
            offer: data.offer,
            socket: socket.id,
            caller: caller.username
        });
        
        io.emit('update-user-list', getUsersList());
    });

    socket.on('make-answer', (data) => {
        if (!users[data.to] || !users[socket.id]) {
            socket.emit('call-error', 'User not found');
            return;
        }
        
        io.to(data.to).emit('answer-made', {
            socket: socket.id,
            answer: data.answer
        });
    });

    socket.on('reject-call', (data) => {
        if (users[socket.id]) {
            users[socket.id].inCall = false;
        }
        if (users[data.from]) {
            users[data.from].inCall = false;
        }
        
        io.to(data.from).emit('call-rejected', {
            socket: socket.id
        });
        
        io.emit('update-user-list', getUsersList());
    });

    socket.on('end-call', (data) => {
        if (users[socket.id]) {
            users[socket.id].inCall = false;
        }
        if (users[data.to]) {
            users[data.to].inCall = false;
        }
        
        io.to(data.to).emit('call-ended', {
            socket: socket.id
        });
        
        io.emit('update-user-list', getUsersList());
    });

    socket.on('ice-candidate', (data) => {
        if (users[data.to]) {
            io.to(data.to).emit('ice-candidate', {
                candidate: data.candidate
            });
        }
    });

    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            socket.broadcast.emit('user-left', user.username);
            delete users[socket.id];
            io.emit('update-user-list', getUsersList());
        }
    });

    socket.on('request-user-list', () => {
        socket.emit('update-user-list', getUsersList());
    });
});

// Helper function to get users list
function getUsersList() {
    return Object.entries(users).reduce((acc, [id, user]) => {
        acc[id] = { username: user.username, inCall: user.inCall };
        return acc;
    }, {});
}

const PORT =8080;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
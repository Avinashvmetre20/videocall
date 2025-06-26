document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const usernameModal = document.getElementById('username-modal');
  const usernameInput = document.getElementById('username-input');
  const usernameSubmit = document.getElementById('username-submit');
  const messageInput = document.getElementById('message-input');
  const sendButton = document.getElementById('send-button');
  const messagesContainer = document.getElementById('messages');
  const typingIndicator = document.getElementById('typing-indicator');
  const userList = document.getElementById('user-list');
  const callModal = document.getElementById('call-modal');
  const callStatus = document.getElementById('call-status');
  const acceptCallBtn = document.getElementById('accept-call');
  const rejectCallBtn = document.getElementById('reject-call');
  const endCallBtn = document.getElementById('end-call');
  const localVideo = document.getElementById('local-video');
  const remoteVideo = document.getElementById('remote-video');
  const callButtonsContainer = document.getElementById('call-buttons');

  // Show username modal initially
  usernameModal.style.display = 'flex';
  callModal.style.display = 'none';

  // Connect to Socket.IO server
  const socket = io();

  let currentUsername = '';
  let peerConnection;
  let currentCall = null;
  let users = {};
  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  // Join chat when username is submitted
  usernameSubmit.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (username) {
      currentUsername = username;
      socket.emit('new-user-joined', username);
      usernameModal.style.display = 'none';
    }
  });

  // Send message when Send button is clicked
  sendButton.addEventListener('click', sendMessage);

  // Also allow Enter key to send message
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // Show typing indicator when user is typing
  messageInput.addEventListener('input', () => {
    if (messageInput.value.trim()) {
      socket.emit('typing');
    } else {
      socket.emit('stop-typing');
    }
  });

  // Call handlers
  acceptCallBtn.addEventListener('click', acceptCall);
  rejectCallBtn.addEventListener('click', rejectCall);
  endCallBtn.addEventListener('click', endCall);

  function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
      socket.emit('send-message', message);
      displayMessage(currentUsername, message, 'sent');
      messageInput.value = '';
      socket.emit('stop-typing');
    }
  }

  function displayMessage(username, message, type) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', type);

    const infoElement = document.createElement('div');
    infoElement.classList.add('message-info');
    infoElement.textContent = username;

    const textElement = document.createElement('div');
    textElement.textContent = message;

    messageElement.appendChild(infoElement);
    messageElement.appendChild(textElement);
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function displaySystemMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'system');
    messageElement.textContent = message;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Video call functions
  function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          to: currentCall,
          candidate: event.candidate
        });
      }
    };

    peerConnection.ontrack = (event) => {
      remoteVideo.srcObject = event.streams[0];
    };

    // Add local stream to peer connection
    localVideo.srcObject.getTracks().forEach(track => {
      peerConnection.addTrack(track, localVideo.srcObject);
    });
  }

  async function startCall(userId) {
    try {
      // Check if user is available
      if (!users[userId] || users[userId].inCall) {
        alert('User is not available for calling');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = stream;

      currentCall = userId;
      callStatus.textContent = `Calling ${users[userId].username}...`;
      callModal.style.display = 'flex';
      callButtonsContainer.style.display = 'none';
      endCallBtn.style.display = 'block';

      createPeerConnection();

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socket.emit('call-user', {
        to: userId,
        offer: peerConnection.localDescription
      });
    } catch (error) {
      console.error('Error starting call:', error);
      alert('Could not start call. Please check your camera and microphone permissions.');
    }
  }

  async function acceptCall() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = stream;

      createPeerConnection();
      await peerConnection.setRemoteDescription(currentCall.offer);

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit('make-answer', {
        to: currentCall.socket,
        answer: peerConnection.localDescription
      });

      callStatus.textContent = `In call with ${currentCall.caller}`;
      callButtonsContainer.style.display = 'none';
      endCallBtn.style.display = 'block';
    } catch (error) {
      console.error('Error accepting call:', error);
      alert('Could not accept call. Please check your camera and microphone permissions.');
    }
  }

  function rejectCall() {
    if (!currentCall) return;

    socket.emit('reject-call', {
      from: currentCall.socket
    });
    resetCallUI();
  }

  function endCall() {
    socket.emit('end-call', {
      to: currentCall.socket || currentCall
    });
    resetCallUI();
  }

  function resetCallUI() {
    callModal.style.display = 'none';
    currentCall = null;

    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    if (localVideo.srcObject) {
      localVideo.srcObject.getTracks().forEach(track => track.stop());
      localVideo.srcObject = null;
    }

    remoteVideo.srcObject = null;
  }

  // Socket.io event listeners
  socket.on('user-joined', (username) => {
    displaySystemMessage(`${username} joined the chat`);
  });

  socket.on('user-left', (username) => {
    displaySystemMessage(`${username} left the chat`);
  });

  socket.on('receive-message', ({ username, message }) => {
    displayMessage(username, message, 'received');
  });

  socket.on('user-typing', (username) => {
    typingIndicator.textContent = `${username} is typing...`;
  });

  socket.on('user-stopped-typing', () => {
    typingIndicator.textContent = '';
  });

  socket.on('request-user-list', () => {
    socket.emit('update-user-list', users);
  });

  socket.on('call-error', (message) => {
    alert(`Call error: ${message}`);
    resetCallUI();
  });

  socket.on('update-user-list', (usersData) => {
    users = usersData; // Store the complete users data
    userList.innerHTML = '';

    Object.entries(users).forEach(([userId, userData]) => {
      if (userData.username !== currentUsername) {
        const li = document.createElement('li');
        li.textContent = userData.username;

        // Add call button if user is not in a call
        if (!userData.inCall) {
          const callBtn = document.createElement('button');
          callBtn.className = 'call-btn';
          callBtn.innerHTML = '📞';
          callBtn.onclick = () => {
            if (!users[userId].inCall) {
              startCall(userId);
            } else {
              alert('User is currently in another call');
            }
          };
          li.appendChild(callBtn);
        } else {
          const statusSpan = document.createElement('span');
          statusSpan.className = 'call-status';
          statusSpan.textContent = ' (in call)';
          li.appendChild(statusSpan);
        }

        userList.appendChild(li);
      }
    });
  });

  // Video call events
  socket.on('call-made', (data) => {
    if (currentCall) {
      socket.emit('reject-call', { from: data.socket });
      return;
    }

    currentCall = {
      socket: data.socket,
      caller: data.caller,
      offer: data.offer
    };

    callStatus.textContent = `${data.caller} is calling...`;
    callModal.style.display = 'flex';
    callButtonsContainer.style.display = 'flex';
    endCallBtn.style.display = 'none';
  });

  socket.on('answer-made', (data) => {
    if (peerConnection) {
      peerConnection.setRemoteDescription(data.answer);
      callStatus.textContent = `In call with ${users[data.socket]?.username || 'Unknown'}`;
    }
  });

  socket.on('call-rejected', () => {
    alert('Call was rejected');
    resetCallUI();
    // Force update user list
    socket.emit('request-user-list');
  });

  socket.on('call-ended', () => {
    alert('Call ended');
    resetCallUI();
  });

  socket.on('ice-candidate', (data) => {
    if (peerConnection && data.candidate) {
      peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  });
});
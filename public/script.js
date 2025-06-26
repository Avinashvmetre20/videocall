document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const elements = {
    usernameModal: document.getElementById('username-modal'),
    usernameInput: document.getElementById('username-input'),
    usernameSubmit: document.getElementById('username-submit'),
    messageInput: document.getElementById('message-input'),
    sendButton: document.getElementById('send-button'),
    messagesContainer: document.getElementById('messages'),
    typingIndicator: document.getElementById('typing-indicator'),
    userList: document.getElementById('user-list'),
    callModal: document.getElementById('call-modal'),
    callStatus: document.getElementById('call-status'),
    acceptCallBtn: document.getElementById('accept-call'),
    rejectCallBtn: document.getElementById('reject-call'),
    endCallBtn: document.getElementById('end-call'),
    localVideo: document.getElementById('local-video'),
    remoteVideo: document.getElementById('remote-video'),
    callButtonsContainer: document.getElementById('call-buttons')
  };

  // Show username modal initially
  elements.usernameModal.style.display = 'flex';
  elements.callModal.style.display = 'none';

  // Connect to Socket.IO server
  const socket = io();

  let currentUsername = '';
  let peerConnection;
  let currentCall = null;
  let users = {};
  
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  // Event listeners
  elements.usernameSubmit.addEventListener('click', joinChat);
  elements.messageInput.addEventListener('keypress', (e) => e.key === 'Enter' && sendMessage());
  elements.sendButton.addEventListener('click', sendMessage);
  elements.messageInput.addEventListener('input', handleTyping);
  elements.acceptCallBtn.addEventListener('click', acceptCall);
  elements.rejectCallBtn.addEventListener('click', rejectCall);
  elements.endCallBtn.addEventListener('click', endCall);

  function joinChat() {
    const username = elements.usernameInput.value.trim();
    if (username) {
      currentUsername = username;
      socket.emit('new-user-joined', username);
      elements.usernameModal.style.display = 'none';
    }
  }

  function sendMessage() {
    const message = elements.messageInput.value.trim();
    if (message) {
      socket.emit('send-message', message);
      displayMessage(currentUsername, message, 'sent');
      elements.messageInput.value = '';
      socket.emit('stop-typing');
    }
  }

  function handleTyping() {
    if (elements.messageInput.value.trim()) {
      socket.emit('typing');
    } else {
      socket.emit('stop-typing');
    }
  }

  function displayMessage(username, message, type) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    messageElement.innerHTML = `
      <div class="message-info">${username}</div>
      <div>${message}</div>
    `;
    elements.messagesContainer.appendChild(messageElement);
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
  }

  function displaySystemMessage(message) {
    displayMessage('System', message, 'system');
  }

  // Video call functions
  async function startCall(userId) {
    try {
      if (!users[userId] || users[userId].inCall) {
        alert('User is not available for calling');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      elements.localVideo.srcObject = stream;

      currentCall = userId;
      elements.callStatus.textContent = `Calling ${users[userId].username}...`;
      elements.callModal.style.display = 'flex';
      elements.callButtonsContainer.style.display = 'none';
      elements.endCallBtn.style.display = 'block';

      createPeerConnection(stream);

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socket.emit('call-user', {
        to: userId,
        offer: peerConnection.localDescription
      });
    } catch (error) {
      console.error('Error starting call:', error);
      alert('Could not start call. Please check your permissions.');
      resetCallUI();
    }
  }

  function createPeerConnection(stream) {
    peerConnection = new RTCPeerConnection(rtcConfig);

    // Add local stream tracks
    stream.getTracks().forEach(track => {
      peerConnection.addTrack(track, stream);
    });

    // Remote stream handler
    peerConnection.ontrack = (event) => {
      if (!elements.remoteVideo.srcObject) {
        elements.remoteVideo.srcObject = event.streams[0];
      }
    };

    // ICE candidate handler
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && currentCall) {
        socket.emit('ice-candidate', {
          to: currentCall,
          candidate: event.candidate
        });
      }
    };

    // Connection state handling
    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === 'disconnected') {
        endCall();
      }
    };
  }

  async function acceptCall() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      elements.localVideo.srcObject = stream;

      createPeerConnection(stream);
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(currentCall.offer)
      );

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit('make-answer', {
        to: currentCall.socket,
        answer: peerConnection.localDescription
      });

      elements.callStatus.textContent = `In call with ${currentCall.caller}`;
      elements.callButtonsContainer.style.display = 'none';
      elements.endCallBtn.style.display = 'block';
    } catch (error) {
      console.error('Error accepting call:', error);
      alert('Could not accept call. Please check your permissions.');
      resetCallUI();
    }
  }

  function rejectCall() {
    if (!currentCall) return;
    socket.emit('reject-call', { from: currentCall.socket });
    resetCallUI();
  }

  function endCall() {
    if (!currentCall) return;
    socket.emit('end-call', { to: currentCall.socket || currentCall });
    resetCallUI();
  }

  function resetCallUI() {
    elements.callModal.style.display = 'none';
    
    // Stop all media tracks
    if (elements.localVideo.srcObject) {
      elements.localVideo.srcObject.getTracks().forEach(track => track.stop());
      elements.localVideo.srcObject = null;
    }
    
    elements.remoteVideo.srcObject = null;
    
    // Close peer connection
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    
    currentCall = null;
  }

  // Socket event handlers
  socket.on('user-joined', (username) => displaySystemMessage(`${username} joined`));
  socket.on('user-left', (username) => displaySystemMessage(`${username} left`));
  socket.on('receive-message', ({username, message}) => displayMessage(username, message, 'received'));
  socket.on('user-typing', (username) => elements.typingIndicator.textContent = `${username} is typing...`);
  socket.on('user-stopped-typing', () => elements.typingIndicator.textContent = '');
  socket.on('call-error', (message) => { alert(message); resetCallUI(); });

  socket.on('update-user-list', (usersData) => {
    users = usersData;
    elements.userList.innerHTML = '';
    
    Object.entries(users).forEach(([userId, userData]) => {
      if (userData.username !== currentUsername) {
        const li = document.createElement('li');
        li.textContent = userData.username;
        
        if (!userData.inCall) {
          const callBtn = document.createElement('button');
          callBtn.className = 'call-btn';
          callBtn.innerHTML = '📞';
          callBtn.onclick = () => startCall(userId);
          li.appendChild(callBtn);
        } else {
          const status = document.createElement('span');
          status.className = 'call-status';
          status.textContent = ' (in call)';
          li.appendChild(status);
        }
        
        elements.userList.appendChild(li);
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

    elements.callStatus.textContent = `${data.caller} is calling...`;
    elements.callModal.style.display = 'flex';
    elements.callButtonsContainer.style.display = 'flex';
    elements.endCallBtn.style.display = 'none';
  });

  socket.on('answer-made', async (data) => {
    if (peerConnection) {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.answer)
      );
      elements.callStatus.textContent = `In call with ${currentCall.caller}`;
    }
  });

  socket.on('call-rejected', () => {
    alert('Call was rejected');
    resetCallUI();
  });

  socket.on('call-ended', () => {
    alert('Call ended');
    resetCallUI();
  });

  socket.on('ice-candidate', async (data) => {
    if (peerConnection && data.candidate) {
      try {
        await peerConnection.addIceCandidate(
          new RTCIceCandidate(data.candidate)
        );
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    }
  });
});
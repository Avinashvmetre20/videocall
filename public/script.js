const socket = io();

let localStream;
let peerConnection;
let targetSocketId = "";

const servers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'relay1.expressturn.com:3480',
      username: '000000002066291654', // replace
      credential: '5cGnz0UAF77juPf6Ju+ZJ121btE=' // replace
    }
  ]
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const targetInput = document.getElementById('targetId');
const callBtn = document.getElementById('callBtn');
const myIdDisplay = document.getElementById('myId');
const usersList = document.getElementById('users');

// Show your socket ID
socket.on("connect", () => {
  myIdDisplay.innerText = socket.id;
});

// Show online users
socket.on("online-users", (userList) => {
  usersList.innerHTML = "";
  userList.forEach(id => {
    if (id !== socket.id) {
      const li = document.createElement("li");
      li.innerText = id;
      li.onclick = () => {
        targetInput.value = id;
      };
      usersList.appendChild(li);
    }
  });
});

// Get user media
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    localStream = stream;
    localVideo.srcObject = stream;
  })
  .catch(console.error);

// Receive offer
socket.on('offer', async ({ offer, from }) => {
  createPeerConnection(from);

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit('answer', { answer, to: from });
});

// Receive answer
socket.on('answer', async ({ answer }) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

// Receive ICE candidates
socket.on('candidate', async ({ candidate }) => {
  if (peerConnection) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }
});

// Call button click
callBtn.addEventListener('click', startCall);

// Create peer connection
function createPeerConnection(targetId) {
  peerConnection = new RTCPeerConnection(servers);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('candidate', { candidate: event.candidate, to: targetId });
    }
  };

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });
}

// Start call
async function startCall() {
  const targetId = targetInput.value.trim();
  if (!targetId) {
    return alert('Please enter a valid target socket ID');
  }

  createPeerConnection(targetId);

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit('offer', { offer, to: targetId });
}

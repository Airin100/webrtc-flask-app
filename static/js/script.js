const socket = io();
const username = document.getElementById("username").value;
const room = document.getElementById("room").value;
const password = document.getElementById("password").value;

let isHost = false;
let localStream;
let peers = {}; // sid: RTCPeerConnection

// Join request
socket.emit('join', { username, room, password });

// Handle approval/rejection
socket.on('lobby_wait', data => {
    alert(data.message);
});

socket.on('join_approved', () => {
    startMedia();
});

socket.on('join_rejected', data => {
    alert(data.message);
});

// Host-only: handle lobby requests
socket.on('host', data => {
    isHost = data.is_host;
});

socket.on('lobby_request', data => {
    const { sid, username } = data;
    const allow = confirm(`Allow ${username} to join?`);
    if (allow) {
        socket.emit('approve_user', { sid });
    } else {
        socket.emit('reject_user', { sid });
    }
});

socket.on('user_list', data => {
    console.log('Users:', data.users);
});

// WebRTC & Signaling
function startMedia() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
        localStream = stream;
        document.getElementById('localVideo').srcObject = stream;

        // Inform others about our stream
        for (let sid in peers) {
            callUser(sid);
        }
    });
}

function callUser(sid) {
    const pc = createPeerConnection(sid);
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        socket.emit('signal', { to: sid, signal: offer });
    });
    peers[sid] = pc;
}

function createPeerConnection(sid) {
    const pc = new RTCPeerConnection();

    pc.onicecandidate = e => {
        if (e.candidate) {
            socket.emit('signal', { to: sid, signal: { candidate: e.candidate } });
        }
    };

    pc.ontrack = e => {
        const video = document.createElement('video');
        video.srcObject = e.streams[0];
        video.autoplay = true;
        video.playsInline = true;
        document.getElementById('remoteVideos').appendChild(video);
    };

    return pc;
}

socket.on('signal', async data => {
    const from = data.from;
    const signal = data.signal;

    if (!peers[from]) {
        peers[from] = createPeerConnection(from);
    }
    const pc = peers[from];

    if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { to: from, signal: answer });
    } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
    } else if (signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
});

// Mute / Unmute
document.getElementById("muteBtn").onclick = () => {
    let audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    socket.emit('mute', { muted: !audioTrack.enabled });
};

// Video toggle
document.getElementById("videoBtn").onclick = () => {
    let videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    socket.emit('video_toggle', { video_on: videoTrack.enabled });
};

// Screen Share
document.getElementById("screenShareBtn").onclick = async () => {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];
    const sender = localStream.getVideoTracks()[0];

    for (let sid in peers) {
        let senderTrack = peers[sid].getSenders().find(s => s.track.kind === 'video');
        if (senderTrack) senderTrack.replaceTrack(screenTrack);
    }

    socket.emit('screen_share', { sharing: true });

    screenTrack.onended = () => {
        for (let sid in peers) {
            let senderTrack = peers[sid].getSenders().find(s => s.track.kind === 'video');
            if (senderTrack) senderTrack.replaceTrack(sender);
        }
        socket.emit('screen_share', { sharing: false });
    };
};

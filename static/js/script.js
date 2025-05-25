const socket = io();
const username = document.getElementById("username").value;
const room = document.getElementById("room").value;
const password = document.getElementById("password").value;

let isHost = false;
let localStream;
let peers = {};

socket.emit('join', { username, room, password });

socket.on('lobby_wait', data => alert(data.message));
socket.on('join_approved', () => startMedia());
socket.on('join_rejected', data => alert(data.message));

socket.on('host', data => isHost = data.is_host);

socket.on('lobby_request', data => {
    if (isHost) {
        const allow = confirm(`Allow ${data.username} to join?`);
        socket.emit(allow ? 'approve_user' : 'reject_user', { sid: data.sid });
    }
});

socket.on('user_list', data => console.log('Users:', data.users));

function startMedia() {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
        localStream = stream;
        document.getElementById('localVideo').srcObject = stream;

        for (let sid in peers) callUser(sid);
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
    pc.onicecandidate = e => e.candidate && socket.emit('signal', { to: sid, signal: { candidate: e.candidate } });
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

    if (!peers[from]) peers[from] = createPeerConnection(from);
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

document.getElementById("muteBtn").onclick = () => {
    let track = localStream.getAudioTracks()[0];
    track.enabled = !track.enabled;
    socket.emit('mute', { muted: !track.enabled });
};

document.getElementById("videoBtn").onclick = () => {
    let track = localStream.getVideoTracks()[0];
    track.enabled = !track.enabled;
    socket.emit('video_toggle', { video_on: track.enabled });
};

document.getElementById("screenShareBtn").onclick = async () => {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];
    const originalTrack = localStream.getVideoTracks()[0];

    for (let sid in peers) {
        const sender = peers[sid].getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
    }

    socket.emit('screen_share', { sharing: true });

    screenTrack.onended = () => {
        for (let sid in peers) {
            const sender = peers[sid].getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(originalTrack);
        }
        socket.emit('screen_share', { sharing: false });
    };
};

import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import Peer from 'peerjs';
import PuzzleBoard from '../components/PuzzleBoard';
import MiniGameBoard from '../components/MiniGameBoard';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || window.location.origin;
const socket = io(BACKEND_URL, {
  transports: ['polling']
});

function Room() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  const state = location.state || {};
  const { playerName, isHost, image, pieces, joinPassword, gameType = 'puzzle' } = state;

  const [peers, setPeers] = useState({});
  const [stream, setStream] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [error, setError] = useState('');
  
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [focusedVideo, setFocusedVideo] = useState(null);
  const [chat, setChat] = useState([]);
  const [chatText, setChatText] = useState('');

  const myVideoRef = useRef();
  const peerInstance = useRef(null);
  const streamRef = useRef(null);
  const initialized = useRef(false);
  const roomJoined = useRef(false);

  const effectiveGameType = roomData?.gameType || gameType;

  const joinGameRoom = (peerId = null) => {
    if (roomJoined.current) return;
    roomJoined.current = true;
    if (isHost) {
      socket.emit('create-room', { roomId, roomName: state.roomName || `${playerName}'s Room`, password: state.password || '', pieces, image, gameType, hostName: playerName, peerId }, (res) => {
        if (!res?.success) { roomJoined.current = false; setError(res?.message || 'Oda oluşturulamadı'); return; }
        setRoomData({ pieces, image, gameType, game: { status: 'lobby' }, players: [{ id: socket.id, name: playerName, peerId, score: 0 }] });
      });
    } else {
      socket.emit('join-room', { roomId, password: joinPassword, playerName, peerId }, (res) => {
        if (!res.success) { roomJoined.current = false; setError(res.message); return; }
        setRoomData(res.room);
        res.room.players.forEach(p => {
          if (p.id !== socket.id && p.peerId && peerInstance.current) connectToNewUser(p.peerId, streamRef.current);
        });
      });
    }
  };

  useEffect(() => {
    if (!playerName) {
      navigate('/');
      return;
    }
    
    if (initialized.current) return;
    initialized.current = true;

    if (socket.connected) joinGameRoom(null);
    else socket.once('connect', () => joinGameRoom(null));

    // Camera and PeerJS are optional; the room must not be blocked by media/signaling.
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setCameras(videoDevices);
      if (videoDevices.length > 0) {
        setSelectedCamera(videoDevices[0].deviceId);
        startMedia(videoDevices[0].deviceId);
      } else {
        startMedia();
      }
    });

    const startMedia = (deviceId = null) => {
      const constraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: true
      };

      navigator.mediaDevices.getUserMedia(constraints).then((mediaStream) => {
        // Default to disabled
        mediaStream.getAudioTracks().forEach(track => track.enabled = false);
        // Show the camera preview by default; microphone remains muted until enabled.
        mediaStream.getVideoTracks().forEach(track => track.enabled = true);
        
        setStream(mediaStream);
        streamRef.current = mediaStream;
        if (myVideoRef.current) {
          myVideoRef.current.srcObject = mediaStream;
        }

        if (peerInstance.current) {
           // We are switching camera, replace track for all existing calls
           const videoTrack = mediaStream.getVideoTracks()[0];
           Object.keys(peerInstance.current.connections).forEach(peerId => {
             const conns = peerInstance.current.connections[peerId];
             conns.forEach(c => {
               if(c.peerConnection) {
                 const sender = c.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                 if(sender && videoTrack) sender.replaceTrack(videoTrack);
               }
             });
           });
           return; // Already initialized PeerJS
        }

        // Initialize PeerJS
        const peer = new Peer(undefined, {
         host: new URL(BACKEND_URL).hostname,
         port: Number(new URL(BACKEND_URL).port || (new URL(BACKEND_URL).protocol === 'https:' ? 443 : 80)),
         secure: new URL(BACKEND_URL).protocol === 'https:',
         path: '/peerjs'
      });

      peer.on('open', (id) => {
        console.log('My peer ID is: ' + id);
        
         if (!roomJoined.current) joinGameRoom(id);
         else socket.emit('update-peer-id', { roomId, peerId: id });
      });

      peer.on('error', err => console.warn('PeerJS video unavailable:', err.type || err.message));

      peer.on('call', (call) => {
        call.answer(streamRef.current);
        call.on('stream', (userVideoStream) => {
          addPeerStream(call.peer, userVideoStream);
        });
      });

      peerInstance.current = peer;

      socket.on('user-joined', (user) => {
        console.log('User joined', user);
        // The new user will initiate the call to us, so we just wait for peer.on('call')
      });

      socket.on('user-left', (userId) => {
        // Need mapping of socketId to peerId to remove video
      });

      socket.on('room:players', players => setRoomData(prev => prev ? { ...prev, players } : prev));
      socket.on('chat:message', message => setChat(prev => [...prev.slice(-49), message]));

    }).catch(err => console.warn('Kamera/mikrofon kullanılamıyor; oda ses/görüntü olmadan devam ediyor.', err));
  };

  return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (peerInstance.current) peerInstance.current.destroy();
      socket.off('user-joined');
       socket.off('user-left');
       socket.off('room:players');
       socket.off('chat:message');
       socket.off('connect');
    };
  }, [roomId]);

  const switchCamera = (e) => {
    const deviceId = e.target.value;
    setSelectedCamera(deviceId);
    
    // Get new stream
    navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
      audio: true
    }).then(newStream => {
      // apply current toggle state
      newStream.getAudioTracks().forEach(track => track.enabled = audioEnabled);
      newStream.getVideoTracks().forEach(track => track.enabled = videoEnabled);
      
      setStream(newStream);
      streamRef.current = newStream;
      if (myVideoRef.current) myVideoRef.current.srcObject = newStream;
      
      if (peerInstance.current) {
         const videoTrack = newStream.getVideoTracks()[0];
         Object.keys(peerInstance.current.connections).forEach(peerId => {
           const conns = peerInstance.current.connections[peerId];
           conns.forEach(c => {
             if(c.peerConnection) {
               const sender = c.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
               if(sender && videoTrack) sender.replaceTrack(videoTrack);
             }
           });
         });
      }
    }).catch(err => console.error("Kamera değiştirme hatası", err));
  };

  const connectToNewUser = (peerId, currentStream) => {
    const call = peerInstance.current.call(peerId, currentStream);
    call.on('stream', (userVideoStream) => {
      addPeerStream(peerId, userVideoStream);
    });
    call.on('close', () => {
       setPeers(prev => {
         const newPeers = {...prev};
         delete newPeers[peerId];
         return newPeers;
       });
    });
  };

  const addPeerStream = (peerId, stream) => {
    setPeers(prev => {
      return { ...prev, [peerId]: stream };
    });
  };

  const toggleAudio = () => {
    if (stream) {
      stream.getAudioTracks()[0].enabled = !audioEnabled;
      setAudioEnabled(!audioEnabled);
    }
  };

  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks()[0].enabled = !videoEnabled;
      setVideoEnabled(!videoEnabled);
    }
  };

  if (error) {
    return <div style={{ padding: '50px', textAlign: 'center', color: '#fff' }}><h2>HATA: {error}</h2><button className="btn yellow" onClick={() => navigate('/')}>Geri Dön</button></div>;
  }

  if (!roomData) return <div style={{ color: '#fff', textAlign: 'center', padding: '50px' }}>Yükleniyor...</div>;

  return (
    <div className="room-container">
      
      {/* Left Area: Puzzle Canvas */}
      <div className="panel puzzle-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
        <div style={{ padding: '15px 20px', borderBottom: '3px solid #000', backgroundColor: '#f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Oda: {roomId}</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <span style={{ fontWeight: 'bold' }}>Parça: {roomData.pieces}</span>
          </div>
        </div>
        
         <div style={{ flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#e0e0e0' }}>
            {effectiveGameType === 'puzzle' ? <PuzzleBoard imageSrc={roomData.image} piecesCount={roomData.pieces} socket={socket} roomId={roomId} isHost={isHost} /> : <MiniGameBoard type={effectiveGameType} socket={socket} roomId={roomId} isHost={isHost} playerName={playerName} players={roomData.players} />}
        </div>
      </div>

      {/* Right Area: Sidebar (Video, Chat, Players) */}
      <div className="panel sidebar-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
        
         <h3 style={{ textAlign: 'center', borderBottom: '2px dashed #ccc', paddingBottom: '10px' }}>OYUNCULAR & SOHBET</h3>
         <div className="panel" style={{ padding: 12, maxHeight: 180, overflowY: 'auto' }}>
           {roomData.players?.map(p => <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{p.name}</span><b>{p.score || 0} puan</b></div>)}
         </div>
         <div className="panel" style={{ padding: 12 }}>
           <div style={{ maxHeight: 130, overflowY: 'auto', marginBottom: 8 }}>{chat.map((m, i) => <div key={i}><b>{m.name}:</b> {m.message}</div>)}</div>
           <form onSubmit={e => { e.preventDefault(); if (!chatText.trim()) return; socket.emit('chat:message', { roomId, message: chatText }); setChatText(''); }} style={{ display: 'flex', gap: 6 }}><input className="input-field" value={chatText} onChange={e => setChatText(e.target.value)} placeholder="Mesaj yaz..." /><button className="btn" type="submit" style={{ padding: '8px 12px' }}>➤</button></form>
         </div>
        
        <div className={Object.keys(peers).length > 0 || focusedVideo ? "players-grid" : "players-list"} style={{ display: focusedVideo ? 'block' : 'grid' }}>
          
          {/* Remote Videos (First) */}
          {Object.entries(peers).map(([peerId, peerStream]) => {
            const player = roomData?.players?.find(p => p.peerId === peerId);
            const displayName = player ? player.name : peerId;
            return (!focusedVideo || focusedVideo === peerId) && (
              <RemoteVideo 
                key={peerId} 
                stream={peerStream} 
                peerId={peerId} 
                displayName={displayName}
                isFocused={focusedVideo === peerId}
                onClick={() => setFocusedVideo(focusedVideo === peerId ? null : peerId)} 
              />
            );
          })}

          {/* Local Video (Last) */}
          {(!focusedVideo || focusedVideo === 'local') && (
            <div 
              onClick={() => setFocusedVideo(focusedVideo === 'local' ? null : 'local')}
              style={{ 
                border: '3px solid #000', 
                borderRadius: '12px', 
                overflow: 'hidden', 
                position: 'relative', 
                backgroundColor: '#000',
                cursor: 'pointer',
                height: focusedVideo ? '100%' : 'auto'
              }}
            >
              <video ref={myVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: 'scaleX(-1)' }} />
              <div style={{ position: 'absolute', bottom: 10, left: 10, color: '#fff', fontWeight: 'bold', textShadow: '1px 1px 2px #000' }}>Sen ({playerName})</div>
              
              <div style={{ position: 'absolute', top: 10, left: 10 }} onClick={e => e.stopPropagation()}>
                {cameras.length > 1 && (
                  <select value={selectedCamera} onChange={switchCamera} style={{ background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '4px', padding: '4px' }}>
                    {cameras.map(c => <option key={c.deviceId} value={c.deviceId}>{c.label || 'Kamera'}</option>)}
                  </select>
                )}
              </div>
              
              <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: '5px' }} onClick={e => e.stopPropagation()}>
                <button onClick={toggleAudio} style={{ background: audioEnabled ? 'var(--primary-blue)' : '#ff3d00', color: '#fff', border: '2px solid #000', borderRadius: '50%', padding: '5px', cursor: 'pointer' }}>
                   {audioEnabled ? <Mic size={16} /> : <MicOff size={16} />}
                </button>
                <button onClick={toggleVideo} style={{ background: videoEnabled ? 'var(--primary-blue)' : '#ff3d00', color: '#fff', border: '2px solid #000', borderRadius: '50%', padding: '5px', cursor: 'pointer' }}>
                   {videoEnabled ? <Video size={16} /> : <VideoOff size={16} />}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  );
}

// Helper component for remote videos
const RemoteVideo = ({ stream, peerId, displayName, isFocused, onClick }) => {
  const ref = useRef();
  
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div 
      onClick={onClick}
      style={{ 
        border: '3px solid #000', 
        borderRadius: '12px', 
        overflow: 'hidden', 
        position: 'relative', 
        backgroundColor: '#000',
        cursor: 'pointer',
        height: isFocused ? '100%' : 'auto'
      }}
    >
       <video ref={ref} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
       <div style={{ position: 'absolute', bottom: 10, left: 10, color: '#fff', fontWeight: 'bold', textShadow: '1px 1px 2px #000' }}>{displayName}</div>
    </div>
  );
};

export default Room;

import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import Peer from 'peerjs';
import { createSocket, peerOptions } from '../connection';
import PuzzleBoard from '../components/PuzzleBoard';
import MiniGameBoard from '../components/MiniGameBoard';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';

function Room() {
  const { roomId } = useParams();
  const { state = {} } = useLocation();
  const navigate = useNavigate();
  const [socket] = useState(createSocket);
  const [roomData, setRoomData] = useState(null);
  const [error, setError] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [streams, setStreams] = useState({});
  const [stream, setStream] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [focusedVideo, setFocusedVideo] = useState(null);
  const [chat, setChat] = useState([]);
  const [chatText, setChatText] = useState('');
  const mediaRef = useRef(null);
  const peerRef = useRef(null);
  const callsRef = useRef(new Map());
  const playersRef = useRef([]);
  const stateRef = useRef(state);
  const { playerName } = state || {};

  useEffect(() => {
    if (!playerName) { navigate('/'); return; }
    let disposed = false;
    let joined = false;
    let peerId = null;
    const calls = callsRef.current;
    const attachCall = call => {
      if (!call || calls.has(call.peer)) { call?.close(); return false; }
      calls.set(call.peer, call);
      call.on('stream', remote => {
        if (!disposed) setStreams(prev => ({ ...prev, [call.peer]: remote }));
      });
      const remove = () => {
        if (calls.get(call.peer) !== call) return;
        calls.delete(call.peer);
        if (!disposed) setStreams(prev => {
          const next = { ...prev }; delete next[call.peer]; return next;
        });
      };
      call.on('close', remove);
      call.on('error', remove);
      return true;
    };
    const syncCalls = () => {
      if (disposed || !peerId || !mediaRef.current) return;
      const remoteIds = new Set(playersRef.current.filter(p => p.id !== socket.id).map(p => p.peerId).filter(Boolean));
      for (const [id, call] of calls) if (!remoteIds.has(id)) call.close();
      for (const id of remoteIds) {
        // Exactly one caller per pair, including when both peers become ready late.
        if (peerId < id && !calls.has(id)) attachCall(peerRef.current.call(id, mediaRef.current));
      }
    };
    const updatePlayers = players => {
      playersRef.current = players;
      setRoomData(prev => prev ? { ...prev, players } : prev);
      setFocusedVideo(prev => prev && prev !== 'local' && !players.some(p => p.id === prev) ? null : prev);
      syncCalls();
    };
    const join = () => {
      joined = false;
      const options = stateRef.current;
      const event = options.isHost && !playersRef.current.length ? 'create-room' : 'join-room';
      socket.emit(event, {
        ...options, roomId, playerName, hostName: playerName,
        password: options.isHost ? options.password : options.joinPassword,
        peerId: mediaRef.current ? peerId : null
      }, res => {
        if (disposed) return;
        if (!res.success) { setError(res.message); return; }
        joined = true;
        setError('');
        setRoomData(res.room);
        updatePlayers(res.room.players);
        if (peerId && mediaRef.current) socket.emit('peer:ready', { roomId, peerId });
      });
    };
    const onMessage = message => setChat(prev => [...prev.slice(-49), message]);
    const onConnectionError = () => setError('Sunucuya bağlanılamadı. Bağlantı yeniden deneniyor.');
    socket.on('connect', join);
    socket.on('connect_error', onConnectionError);
    socket.on('room:players', updatePlayers);
    socket.on('chat:message', onMessage);
    socket.connect();

    // Room membership/chat never depend on media permission or signaling availability.
    let peer;
    try {
      peer = new Peer(undefined, peerOptions());
      peerRef.current = peer;
      peer.on('open', id => {
        if (disposed) return;
        peerId = id;
        if (joined && mediaRef.current) socket.emit('peer:ready', { roomId, peerId: id });
        syncCalls();
      });
      peer.on('call', call => {
        if (disposed || !mediaRef.current) { call.close(); return; }
        if (attachCall(call)) call.answer(mediaRef.current);
      });
      peer.on('error', err => {
        if (!disposed) setMediaError(`Ses/video bağlantısı kurulamadı: ${err.type}`);
      });
      peer.on('disconnected', () => {
        if (!disposed && !peer.destroyed) peer.reconnect();
      });
    } catch {
      setMediaError('Ses/video sunucusuna bağlanılamadı.');
    }

    const startMedia = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMediaError('Kamera/mikrofon için HTTPS ve desteklenen bir tarayıcı gerekli.');
        return;
      }
      let local;
      try { local = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); }
      catch {
        // A missing/denied camera must not also disable an available microphone.
        try { local = await navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch {
          try { local = await navigator.mediaDevices.getUserMedia({ video: true }); }
          catch {
            if (!disposed) setMediaError('Kamera/mikrofon kullanılamıyor. Oyun ve sohbet çalışmaya devam eder.');
            return;
          }
        }
      }
      if (disposed) { local.getTracks().forEach(track => track.stop()); return; }
      local.getTracks().forEach(track => { track.enabled = false; });
      mediaRef.current = local;
      setStream(local);
      if (joined && peerId) socket.emit('peer:ready', { roomId, peerId });
      syncCalls();
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!disposed) {
          setCameras(devices.filter(d => d.kind === 'videoinput'));
          setSelectedCamera(local.getVideoTracks()[0]?.getSettings().deviceId || '');
        }
      } catch { /* Device labels are optional. */ }
    };
    startMedia();

    return () => {
      disposed = true;
      socket.off('connect', join);
      socket.off('connect_error', onConnectionError);
      socket.off('room:players', updatePlayers);
      socket.off('chat:message', onMessage);
      socket.disconnect();
      calls.forEach(call => call.close());
      calls.clear();
      peer?.destroy();
      mediaRef.current?.getTracks().forEach(track => track.stop());
      mediaRef.current = null;
      playersRef.current = [];
    };
  }, [roomId, playerName, navigate, socket]);

  const switchCamera = async e => {
    const deviceId = e.target.value;
    let camera;
    try {
      camera = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
      if (!mediaRef.current) { camera.getTracks().forEach(track => track.stop()); return; }
      const track = camera.getVideoTracks()[0];
      track.enabled = videoEnabled;
      const old = mediaRef.current;
      const next = new MediaStream([...old.getAudioTracks(), track]);
      await Promise.all([...callsRef.current.values()].map(call => {
        const sender = call.peerConnection?.getSenders().find(s => s.track?.kind === 'video');
        return sender?.replaceTrack(track);
      }));
      old.getVideoTracks().forEach(t => t.stop());
      mediaRef.current = next;
      setStream(next);
      setSelectedCamera(deviceId);
    } catch {
      camera?.getTracks().forEach(track => track.stop());
      setMediaError('Kamera değiştirilemedi.');
    }
  };
  const toggleAudio = () => {
    const tracks = mediaRef.current?.getAudioTracks() || [];
    if (!tracks.length) return;
    tracks.forEach(track => { track.enabled = !audioEnabled; });
    setAudioEnabled(!audioEnabled);
  };
  const toggleVideo = () => {
    const tracks = mediaRef.current?.getVideoTracks() || [];
    if (!tracks.length) return;
    tracks.forEach(track => { track.enabled = !videoEnabled; });
    setVideoEnabled(!videoEnabled);
  };

  if (error) return <div className="panel"><h2>{error}</h2><button className="btn" onClick={() => navigate('/')}>Geri Dön</button></div>;
  if (!roomData) return <div style={{ color: '#fff', padding: 50 }}>Yükleniyor...</div>;
  const isHost = roomData.host === socket.id;
  const remotePlayers = roomData.players.filter(p => p.id !== socket.id);
  const gameType = roomData.gameType || 'puzzle';

  return <div className="room-container">
    <div className="panel puzzle-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
      <div style={{ padding: '15px 20px', borderBottom: '3px solid #000', background: '#f0f0f0', display: 'flex', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Oda: {roomId}</h2><b>Parça: {roomData.pieces}</b>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#e0e0e0' }}>
        {gameType === 'puzzle'
          ? <PuzzleBoard key={socket.id} imageSrc={roomData.image} piecesCount={roomData.pieces} socket={socket} roomId={roomId} isHost={isHost} />
          : <MiniGameBoard type={gameType} socket={socket} roomId={roomId} isHost={isHost} playerName={playerName} players={roomData.players} />}
      </div>
    </div>
    <div className="panel sidebar-panel" style={{ display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
      <h3 style={{ textAlign: 'center' }}>OYUNCULAR & SOHBET</h3>
      <div className="panel" style={{ padding: 12 }}>
        {roomData.players.map(p => <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{p.name}</span><b>{p.score || 0} puan</b></div>)}
      </div>
      <div className="panel" style={{ padding: 12 }}>
        <div data-testid="chat-messages" style={{ maxHeight: 130, overflowY: 'auto', marginBottom: 8 }}>{chat.map((m, i) => <div key={i}><b>{m.name}:</b> {m.message}</div>)}</div>
        <form onSubmit={e => { e.preventDefault(); if (!chatText.trim()) return; socket.emit('chat:message', { roomId, message: chatText }); setChatText(''); }} style={{ display: 'flex', gap: 6 }}>
          <input className="input-field" value={chatText} onChange={e => setChatText(e.target.value)} placeholder="Mesaj yaz..." /><button className="btn" type="submit" style={{ padding: '8px 12px' }}>➤</button>
        </form>
      </div>
      {mediaError && <small role="status">{mediaError}</small>}
      <div className={remotePlayers.length ? 'players-grid' : 'players-list'}>
        {remotePlayers.map(player => (!focusedVideo || focusedVideo === player.id) && <VideoTile key={player.id} stream={streams[player.peerId]} name={player.name} onClick={() => setFocusedVideo(focusedVideo === player.id ? null : player.id)} />)}
        {(!focusedVideo || focusedVideo === 'local') && <VideoTile stream={stream} muted name={`Sen (${playerName})`} onClick={() => setFocusedVideo(focusedVideo === 'local' ? null : 'local')}>
          <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 5 }} onClick={e => e.stopPropagation()}>
            {cameras.length > 1 && <select aria-label="Kamera seç" value={selectedCamera} onChange={switchCamera}>{cameras.map(c => <option key={c.deviceId} value={c.deviceId}>{c.label || 'Kamera'}</option>)}</select>}
            <button aria-label="Mikrofon" aria-pressed={audioEnabled} disabled={!stream?.getAudioTracks().length} onClick={toggleAudio} style={{ background: audioEnabled ? '#00aaff' : '#ff3d00' }}>{audioEnabled ? <Mic size={16} /> : <MicOff size={16} />}</button>
            <button aria-label="Kamera" aria-pressed={videoEnabled} disabled={!stream?.getVideoTracks().length} onClick={toggleVideo} style={{ background: videoEnabled ? '#00aaff' : '#ff3d00' }}>{videoEnabled ? <Video size={16} /> : <VideoOff size={16} />}</button>
          </div>
        </VideoTile>}
      </div>
    </div>
  </div>;
}

function VideoTile({ stream, muted = false, name, onClick, children }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null; }, [stream]);
  return <div data-testid="video-tile" onClick={onClick} style={{ border: '3px solid #000', borderRadius: 12, overflow: 'hidden', position: 'relative', background: '#000', minHeight: 150, cursor: 'pointer' }}>
    <video ref={ref} autoPlay muted={muted} playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: muted ? 'scaleX(-1)' : undefined }} />
    <div style={{ position: 'absolute', bottom: 10, left: 10, color: '#fff', fontWeight: 'bold' }}>{name}{!stream && ' · Kamera kapalı / bağlanıyor'}</div>
    {children}
  </div>;
}

export default Room;

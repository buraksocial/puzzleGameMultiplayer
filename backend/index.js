const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { ExpressPeerServer } = require('peer');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 5e7 // 50 MB
});

// Initialize PeerJS Server for WebRTC signaling
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/'
});
app.use('/peerjs', peerServer);

// In-memory data store for rooms
const rooms = {}; // Shared state for all game modes

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-room', (data, callback) => {
    const { roomId, roomName, password, pieces, image, hostName, peerId, gameType = 'puzzle' } = data;
    
    if (rooms[roomId]) return callback({ success: false, message: 'Room already exists' });
    rooms[roomId] = {
      id: roomId,
      name: roomName,
      password: password,
      pieces: pieces,
      image: image,
      gameType,
      host: socket.id,
      players: [{ id: socket.id, name: hostName, peerId: peerId, score: 0 }],
      game: { status: 'lobby', round: 0, drawerId: null, word: null, question: null, answers: {} }
    };
    
    socket.join(roomId);
    callback({ success: true, roomId, room: publicRoom(rooms[roomId]) });
    io.emit('room-list', getPublicRooms());
  });

  socket.on('get-rooms', (callback) => {
    callback(getPublicRooms());
  });

  socket.on('join-room', (data, callback) => {
    const { roomId, password, playerName, peerId } = data;
    const room = rooms[roomId];

    if (!room) {
      return callback({ success: false, message: 'Room not found' });
    }
    
    if (room.password && room.password !== password) {
      return callback({ success: false, message: 'Incorrect password' });
    }

    if (!room.players.some(p => p.id === socket.id)) {
      room.players.push({ id: socket.id, name: playerName, peerId: peerId, score: 0 });
    }
    socket.join(roomId);
    
    // Notify others in the room
    socket.to(roomId).emit('user-joined', { id: socket.id, name: playerName, peerId: peerId });
    
    callback({ 
      success: true, 
      room: publicRoom(room)
    });
    
    io.to(roomId).emit('room:players', room.players);
    io.emit('room-list', getPublicRooms());
  });

  socket.on('peer:ready', ({ roomId, peerId }) => {
    const room = rooms[roomId];
    const player = room?.players.find(p => p.id === socket.id);
    if (!player || typeof peerId !== 'string') return;
    player.peerId = peerId;
    io.to(roomId).emit('room:players', room.players);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove user from rooms
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        socket.to(roomId).emit('user-left', socket.id);
        
        // If room is empty, delete it
        if (room.players.length === 0) {
          delete rooms[roomId];
        } else if (room.host === socket.id) {
          // Reassign host
          room.host = room.players[0].id;
        }
        if (rooms[roomId]) io.to(roomId).emit('room:players', room.players);
        io.emit('room-list', getPublicRooms());
        break;
      }
    }
  });

  socket.on('chat:message', ({ roomId, message }) => {
    const room = rooms[roomId];
    if (!room || typeof message !== 'string') return;
    const player = room.players.find(p => p.id === socket.id);
    if (player) io.to(roomId).emit('chat:message', { name: player.name, message: message.slice(0, 300), id: socket.id });
  });

  socket.on('game:start', ({ roomId, game }) => {
    const room = rooms[roomId];
    if (!room || room.host !== socket.id) return;
    room.game = { ...room.game, ...game, status: 'playing', round: (room.game.round || 0) + 1 };
    io.to(roomId).emit('game:state', room.game);
  });

  socket.on('game:state', ({ roomId, game }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.game = { ...room.game, ...game };
    socket.to(roomId).emit('game:state', room.game);
  });

  socket.on('drawing:stroke', ({ roomId, stroke }) => socket.to(roomId).emit('drawing:stroke', stroke));
  socket.on('drawing:clear', ({ roomId }) => socket.to(roomId).emit('drawing:clear'));

  socket.on('game:score', ({ roomId, playerId, amount }) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === playerId);
    if (player) { player.score += Math.max(0, Number(amount) || 0); io.to(roomId).emit('room:players', room.players); }
  });

  socket.on('get-board', ({ roomId }, callback) => {
    const room = rooms[roomId];
    if (room && socket.rooms.has(roomId)) callback(room.piecesData || null);
  });

  socket.on('sync-board', (data, callback) => {
    const { roomId, pieces } = data;
    const room = rooms[roomId];
    if (!room || !socket.rooms.has(roomId) || !Array.isArray(pieces)) return;
    // First initialization wins; later mounts must not reset completed work.
    if (!room.piecesData && room.host === socket.id) room.piecesData = pieces;
    if (room.piecesData) io.to(roomId).emit('piece-moved', room.piecesData);
    callback?.(room.piecesData || null);
  });

  socket.on('update-piece', ({ roomId, piece }) => {
    const room = rooms[roomId];
    if (!room?.piecesData || !socket.rooms.has(roomId) || !piece) return;
    const current = room.piecesData.find(p => p.id === piece.id);
    if (!current || !Number.isFinite(piece.x) || !Number.isFinite(piece.y)) return;
    Object.assign(current, { x: piece.x, y: piece.y, isLocked: !!piece.isLocked });
    io.to(roomId).emit('piece-moved', room.piecesData);
  });

  socket.on('drag-piece', (data) => {
    const { roomId, id, x, y } = data;
    if (!socket.rooms.has(roomId) || !Number.isFinite(x) || !Number.isFinite(y)) return;
    socket.to(roomId).emit('piece-drag', { id, x, y });
  });

});

function getPublicRooms() {
  return Object.values(rooms).map(room => ({
    id: room.id,
    name: room.name,
    hasPassword: !!room.password,
    playerCount: room.players.length,
    pieces: room.pieces
    ,gameType: room.gameType
    ,game: room.game
  }));
}

function publicRoom(room) {
  const { password, ...data } = room;
  return data;
}

const PORT = process.env.PORT || 3001;
if (require.main === module) server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { server, io };

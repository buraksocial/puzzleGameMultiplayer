const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { ExpressPeerServer } = require('peer');

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || true }));
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
    callback({ success: true, roomId });
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

    room.players.push({ id: socket.id, name: playerName, peerId: peerId, score: 0 });
    socket.join(roomId);
    
    // Notify others in the room
    socket.to(roomId).emit('user-joined', { id: socket.id, name: playerName, peerId: peerId });
    
    callback({ 
      success: true, 
      room: {
        id: room.id,
        name: room.name,
        pieces: room.pieces,
         image: room.image,
         gameType: room.gameType,
         game: room.game,
        players: room.players
      } 
    });
    
    io.emit('room-list', getPublicRooms());
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

  socket.on('sync-board', (data) => {
    const { roomId, pieces } = data;
    if (rooms[roomId]) {
      rooms[roomId].piecesData = pieces;
      socket.to(roomId).emit('piece-moved', pieces);
    }
  });

  socket.on('update-board', (data) => {
    const { roomId, pieces } = data;
    if (rooms[roomId]) {
      rooms[roomId].piecesData = pieces;
      socket.to(roomId).emit('piece-moved', pieces);
    }
  });

  socket.on('drag-piece', (data) => {
    const { roomId, id, x, y } = data;
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

const PORT = process.env.PORT || 3534;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { io: connect } = require('socket.io-client');
const { spawn } = require('node:child_process');

let url;
let child;
const sockets = [];
before(async () => {
  child = spawn(process.execPath, ['-e', "const {server}=require('./index');server.listen(0,'127.0.0.1',()=>process.send(server.address().port));"], {
    cwd: __dirname, stdio: ['ignore', 'ignore', 'inherit', 'ipc']
  });
  const [port] = await once(child, 'message');
  url = `http://127.0.0.1:${port}`;
});
after(async () => {
  sockets.forEach(socket => socket.disconnect());
  child.kill();
  await once(child, 'exit');
});
async function client() {
  const socket = connect(url, { forceNew: true });
  sockets.push(socket);
  await once(socket, 'connect');
  return socket;
}
const request = (socket, event, payload) => socket.timeout(3000).emitWithAck(event, payload);
const next = (socket, event, matches = () => true) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`Missing ${event}`)), 3000);
  const listener = data => {
    if (!matches(data)) return;
    socket.off(event, listener);
    clearTimeout(timer);
    resolve(data);
  };
  socket.on(event, listener);
});

test('host and guest chat, per-piece sync, late join, peer updates and leave', async () => {
  const host = await client();
  const guest = await client();
  const roomId = 'regression';
  const created = await request(host, 'create-room', { roomId, hostName: 'Host', pieces: 2 });
  assert.equal(created.room.host, host.id);
  const playersEvent = next(host, 'room:players');
  const joined = await request(guest, 'join-room', { roomId, playerName: 'Guest' });
  assert.equal(joined.room.players.length, 2);
  assert.equal((await playersEvent).length, 2);
  for (const [sender, receiver, name] of [[guest, host, 'Guest'], [host, guest, 'Host']]) {
    const message = next(receiver, 'chat:message');
    const echo = next(sender, 'chat:message');
    sender.emit('chat:message', { roomId, message: `${name} says hello` });
    assert.equal((await message).name, name);
    await echo;
  }
  const initial = [{ id: 0, x: 1, y: 2, isLocked: false }, { id: 1, x: 3, y: 4, isLocked: false }];
  await request(host, 'sync-board', { roomId, pieces: initial });
  const hostUpdate = next(host, 'piece-moved', pieces => pieces[0].isLocked);
  guest.emit('update-piece', { roomId, piece: { id: 0, x: 100, y: 200, isLocked: true } });
  assert.equal((await hostUpdate)[0].isLocked, true);
  const guestUpdate = next(guest, 'piece-moved', pieces => pieces.every(p => p.isLocked));
  host.emit('update-piece', { roomId, piece: { id: 1, x: 300, y: 400, isLocked: true } });
  assert.ok((await guestUpdate).every(p => p.isLocked));
  // Reinitialization must not erase placed pieces.
  assert.ok((await request(host, 'sync-board', { roomId, pieces: initial })).every(p => p.isLocked));
  const late = await client();
  await request(late, 'join-room', { roomId, playerName: 'Late' });
  assert.ok((await request(late, 'get-board', { roomId })).every(p => p.isLocked));
  const peers = next(host, 'room:players', players => players.some(p => p.peerId === 'guest-peer'));
  guest.emit('peer:ready', { roomId, peerId: 'guest-peer' });
  assert.equal((await peers).find(p => p.id === guest.id).peerId, 'guest-peer');
  const left = next(host, 'room:players', players => players.length === 2);
  late.disconnect();
  assert.equal((await left).length, 2);
  const outsider = await client();
  outsider.emit('update-piece', { roomId, piece: { id: 0, x: 0, y: 0, isLocked: false } });
  assert.ok((await request(host, 'get-board', { roomId })).every(p => p.isLocked));
});

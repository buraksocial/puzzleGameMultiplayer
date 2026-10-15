import { test, expect } from '@playwright/test';

const image = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="red"/><circle cx="200" cy="200" r="120" fill="blue"/></svg>');
const roomName = () => `${test.info().title} [${test.info().repeatEachIndex}]`;

async function closePlayers(contexts) {
  for (const context of contexts) {
    for (const page of context.pages()) {
      if (!page.isClosed() && page.url().includes('/room/')) await page.goBack();
    }
    await context.close();
  }
}

async function createRoom(page) {
  await page.goto('/');
  await page.getByPlaceholder('Adını gir...').fill('Kurucu');
  await page.getByPlaceholder('Oda Adı', { exact: true }).fill(roomName());
  await page.locator('input[type=file]').setInputFiles({ name: 'puzzle.svg', mimeType: 'image/svg+xml', buffer: image });
  await page.getByRole('button', { name: 'ODAYI KUR VE BAŞLA!' }).click();
  await expect(page.locator('canvas')).toBeVisible();
}

async function joinRoom(page, name = 'Misafir') {
  await page.goto('/');
  await page.getByPlaceholder('Adını gir...').fill(name);
  await page.getByTestId('room-card').filter({ hasText: roomName() }).getByRole('button', { name: 'KATIL', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
}

async function board(page) {
  return page.evaluate(async () => {
    const { io } = await import('/node_modules/.vite/deps/socket__io-client.js');
    const socket = io(window.location.origin);
    await new Promise(resolve => socket.on('connect', resolve));
    const roomId = location.pathname.split('/').pop();
    await socket.timeout(5000).emitWithAck('join-room', { roomId, playerName: 'Observer' });
    const pieces = await socket.timeout(5000).emitWithAck('get-board', { roomId });
    socket.disconnect();
    return pieces;
  });
}

async function placePiece(page) {
  const pieces = await board(page);
  // Last piece is painted on top and is safe to pick even in a crowded tray.
  const piece = pieces.filter(p => !p.isLocked).at(-1);
  const box = await page.locator('canvas').boundingBox();
  const position = (x, y) => ({ x: box.x + x * box.width / 1600, y: box.y + y * box.height / 1200 });
  const from = position(piece.x + piece.w / 2, piece.y + piece.h / 2);
  const to = position(450 + piece.correctX + piece.w / 2, 50 + piece.correctY + piece.h / 2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  return piece.id;
}

test('two real browsers exchange chat, place pieces in both directions and receive media', async ({ browser }) => {
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({
    permissions: ['camera', 'microphone'], viewport: { width: 1500, height: 1000 }
  })));
  const [host, guest, late] = await Promise.all(contexts.map(context => context.newPage()));
  for (const page of [host, guest, late]) await page.addInitScript(() => {
    window.__mediaConnections = [];
    const Original = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends Original {
      constructor(...args) { super(...args); window.__mediaConnections.push(this); }
    };
  });
  const errors = [];
  for (const page of [host, guest, late]) page.on('pageerror', error => errors.push(error.message));
  try {
    await createRoom(host);
    await joinRoom(guest);
    for (const page of [host, guest]) {
      await expect(page.getByTestId('video-tile')).toHaveCount(2);
      await expect.poll(() => page.locator('video').evaluateAll(videos => videos.filter(v => !v.muted && v.srcObject?.getTracks().length === 2).length), { timeout: 20000 }).toBe(1);
    }
    await guest.getByPlaceholder('Mesaj yaz...').fill('Misafirden selam');
    await guest.getByPlaceholder('Mesaj yaz...').press('Enter');
    await expect(host.getByTestId('chat-messages')).toContainText('Misafirden selam');
    await host.getByPlaceholder('Mesaj yaz...').fill('Kurucudan selam');
    await host.getByPlaceholder('Mesaj yaz...').press('Enter');
    await expect(guest.getByTestId('chat-messages')).toContainText('Kurucudan selam');
    const guestPiece = await placePiece(guest);
    await expect.poll(async () => (await board(host)).find(p => p.id === guestPiece).isLocked).toBe(true);
    const hostPiece = await placePiece(host);
    await expect.poll(async () => (await board(guest)).find(p => p.id === hostPiece).isLocked).toBe(true);
    await expect.poll(async () => {
      const rendered = await Promise.all([host, guest].map(page => page.locator('canvas').evaluate(canvas => canvas.toDataURL())));
      return rendered[0] === rendered[1];
    }).toBe(true);
    await joinRoom(late, 'Sonradan');
    expect((await board(late)).filter(p => p.isLocked)).toHaveLength(2);
    await expect(host.getByTestId('video-tile')).toHaveCount(3);
    await late.goBack();
    await expect(host.getByTestId('video-tile')).toHaveCount(2);
    for (const page of [host, guest]) {
      await page.getByRole('button', { name: 'Kamera', exact: true }).click();
      await page.getByRole('button', { name: 'Mikrofon', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Kamera', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => page.locator('video').evaluateAll(videos => videos.find(v => !v.muted)?.readyState), { timeout: 15000 }).toBe(4);
      await expect.poll(() => page.evaluate(async () => {
        const reports = await Promise.all(window.__mediaConnections.filter(c => c.connectionState === 'connected').map(c => c.getStats()));
        const inbound = reports.flatMap(report => [...report.values()]).filter(stat => stat.type === 'inbound-rtp');
        return {
          audio: inbound.some(stat => stat.kind === 'audio' && stat.packetsReceived > 0),
          video: inbound.some(stat => stat.kind === 'video' && stat.framesDecoded > 0)
        };
      }), { timeout: 15000 }).toEqual({ audio: true, video: true });
    }
    expect(errors).toEqual([]);
  } finally { await closePlayers(contexts); }
});

test('pending permissions and unavailable signaling do not block guest chat or puzzle', async ({ browser }) => {
  const contexts = await Promise.all([0, 1].map(() => browser.newContext()));
  const [host, guest] = await Promise.all(contexts.map(context => context.newPage()));
  for (const page of [host, guest]) {
    await page.route('**/peerjs/**', route => route.abort());
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => new Promise(() => {});
    });
  }
  try {
    await createRoom(host);
    await joinRoom(guest);
    await expect(host.getByTestId('video-tile')).toHaveCount(2);
    await guest.getByPlaceholder('Mesaj yaz...').fill('Medya beklenirken mesaj');
    await guest.getByPlaceholder('Mesaj yaz...').press('Enter');
    await expect(host.getByTestId('chat-messages')).toContainText('Medya beklenirken mesaj');
    const id = await placePiece(guest);
    await expect.poll(async () => (await board(host)).find(p => p.id === id).isLocked).toBe(true);
    await expect.poll(async () => {
      const rendered = await Promise.all([host, guest].map(page => page.locator('canvas').evaluate(canvas => canvas.toDataURL())));
      return rendered[0] === rendered[1];
    }).toBe(true);
  } finally { await closePlayers(contexts); }
});

test('denied media permissions do not block membership, chat or participant tiles', async ({ browser }) => {
  const contexts = await Promise.all([0, 1].map(() => browser.newContext()));
  const [host, guest] = await Promise.all(contexts.map(context => context.newPage()));
  for (const page of [host, guest]) await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  });
  try {
    await createRoom(host);
    await joinRoom(guest);
    await expect(host.getByTestId('video-tile')).toHaveCount(2);
    await expect(guest.getByTestId('video-tile')).toHaveCount(2);
    await guest.getByPlaceholder('Mesaj yaz...').fill('İzinsiz sohbet');
    await guest.getByPlaceholder('Mesaj yaz...').press('Enter');
    await expect(host.getByTestId('chat-messages')).toContainText('İzinsiz sohbet');
    await expect(host.getByRole('status')).toContainText('Oyun ve sohbet çalışmaya devam eder');
  } finally { await closePlayers(contexts); }
});

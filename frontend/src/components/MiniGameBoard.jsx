import React, { useEffect, useRef, useState } from 'react';

const WORDS = ['kedi', 'uzay', 'pizza', 'gitar', 'gökkuşağı', 'robot', 'tatil', 'dondurma'];
const QUESTIONS = [
  { text: 'Dünyanın uydusu hangisidir?', options: ['Mars', 'Ay', 'Venüs', 'Güneş'], answer: 1 },
  { text: 'Bir haftada kaç gün vardır?', options: ['5', '6', '7', '8'], answer: 2 },
  { text: 'Su kaç derecede donar?', options: ['0°C', '10°C', '50°C', '100°C'], answer: 0 }
];

export default function MiniGameBoard({ type, socket, roomId, isHost, playerName, players = [] }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [game, setGame] = useState({ status: 'lobby', round: 0 });
  const [prompt, setPrompt] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const onState = value => { setGame(value); setSelected(null); };
    const onStroke = stroke => drawStroke(stroke);
    const onClear = () => clearCanvas();
    socket.on('game:state', onState);
    socket.on('drawing:stroke', onStroke);
    socket.on('drawing:clear', onClear);
    return () => { socket.off('game:state', onState); socket.off('drawing:stroke', onStroke); socket.off('drawing:clear', onClear); };
  }, [socket]);

  const clearCanvas = () => { const c = canvasRef.current; if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height); };
  const drawStroke = ({ from, to, color = '#111', width = 5 }) => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  };
  const point = e => { const r = canvasRef.current.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvasRef.current.width / r.width, y: (e.clientY - r.top) * canvasRef.current.height / r.height }; };
  const startDrawing = e => { if (!game.drawerId || game.drawerId !== socket.id) return; drawing.current = point(e); };
  const moveDrawing = e => {
    if (!drawing.current) return; const next = point(e); const stroke = { from: drawing.current, to: next, color: '#111', width: 6 }; drawStroke(stroke); socket.emit('drawing:stroke', { roomId, stroke }); drawing.current = next;
  };
  const start = () => {
    const nextPlayer = players[0];
    if (type === 'drawing' || type === 'gartic-phone') socket.emit('game:start', { roomId, game: { drawerId: nextPlayer?.id, word: WORDS[Math.floor(Math.random() * WORDS.length)], status: 'playing' } });
    if (type === 'quiz') socket.emit('game:start', { roomId, game: { question: QUESTIONS[0], questionIndex: 0, status: 'playing' } });
  };
  const answer = index => {
    setSelected(index); if (game.question && index === game.question.answer) socket.emit('game:score', { roomId, playerId: socket.id, amount: 100 });
  };
  const question = game.question || QUESTIONS[0];
  const drawer = players.find(p => p.id === game.drawerId);
  return <div style={{ height: '100%', padding: 20, display: 'flex', flexDirection: 'column', gap: 15 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h2>{type === 'drawing' ? '🎨 ÇİZİM VE TAHMİN' : type === 'quiz' ? '🧠 HIZLI QUIZ' : '📞 GARTIC PHONE'}</h2>
      {isHost && <button className="btn orange" onClick={start}>{game.status === 'playing' ? 'YENİ TUR' : 'OYUNU BAŞLAT'}</button>}
    </div>
    {game.status !== 'playing' && <p>Oyun başlamaya hazır. Oda sahibi başlattığında eğlence başlıyor!</p>}
    {(type === 'drawing' || type === 'gartic-phone') && <>
      <div className="panel" style={{ padding: 12, background: '#fff8d6' }}><b>{drawer ? `${drawer.name} çiziyor` : 'Çizici bekleniyor'}</b>{game.drawerId === socket.id && <span> — Kelime: <strong>{game.word}</strong></span>}</div>
      <canvas ref={canvasRef} width="1000" height="650" onPointerDown={startDrawing} onPointerMove={moveDrawing} onPointerUp={() => { drawing.current = false; }} onPointerLeave={() => { drawing.current = false; }} style={{ width: '100%', flex: 1, minHeight: 280, background: '#fff', border: '3px solid #000', borderRadius: 12, touchAction: 'none' }} />
      <input className="input-field" placeholder="Tahminini yaz ve Enter'a bas..." value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && prompt) { socket.emit('chat:message', { roomId, message: `🎯 ${prompt}` }); setPrompt(''); } }} />
    </>}
    {type === 'quiz' && <div className="panel" style={{ maxWidth: 700, margin: 'auto', width: '100%', textAlign: 'center' }}><h2>{question.text}</h2><div style={{ display: 'grid', gap: 12, marginTop: 25 }}>{question.options.map((option, i) => <button key={option} className={`btn ${selected === i ? (i === question.answer ? 'green' : 'orange') : ''}`} onClick={() => answer(i)}>{option}</button>)}</div></div>}
  </div>;
}

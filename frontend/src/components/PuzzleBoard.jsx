import React, { useRef, useEffect, useState } from 'react';

function PuzzleBoard({ imageSrc, piecesCount, socket, roomId, isHost }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  const [pieces, setPieces] = useState([]);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const imgRef = useRef(new Image());
  const piecesRef = useRef([]); // Mutable reference for animation loop
  const draggingPiece = useRef(null);
  const offset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const img = imgRef.current;
    img.onload = () => {
      initPuzzle(img);
      setImageLoaded(true);
    };
    img.src = imageSrc;
  }, [imageSrc, piecesCount]);

  useEffect(() => {
    // Listen for piece updates from other players
    socket.on('piece-moved', (updatedPieces) => {
      if (!isHost) {
        setPieces(updatedPieces);
        piecesRef.current = updatedPieces;
      }
    });

    socket.on('piece-drag', (data) => {
      const { id, x, y } = data;
      const index = piecesRef.current.findIndex(p => p.id === id);
      if (index !== -1) {
        piecesRef.current[index].x = x;
        piecesRef.current[index].y = y;
        setPieces([...piecesRef.current]);
      }
    });

    return () => {
      socket.off('piece-moved');
      socket.off('piece-drag');
    };
  }, [socket, isHost]);

  const initPuzzle = (img) => {
    // Calculate cols and rows
    const ratio = img.width / img.height;
    const cols = Math.round(Math.sqrt(piecesCount * ratio));
    const rows = Math.round(piecesCount / cols);
    
    // Board size: Keep a fixed virtual resolution
    const virtualWidth = 1600;
    const virtualHeight = 1200; // 800 for board + 400 for tray
    const boardAreaHeight = 800;

    // Scale image to fit within the board area with some padding
    const padding = 100;
    const scale = Math.min((virtualWidth - padding) / img.width, (boardAreaHeight - padding) / img.height);
    const scaledWidth = img.width * scale;
    const scaledHeight = img.height * scale;

    const offsetX = (virtualWidth - scaledWidth) / 2;
    const offsetY = (boardAreaHeight - scaledHeight) / 2;
    
    const sourcePieceWidth = img.width / cols;
    const sourcePieceHeight = img.height / rows;

    const pieceWidth = scaledWidth / cols;
    const pieceHeight = scaledHeight / rows;
    
    const newPieces = [];
    let idCounter = 0;
    
    const trayY = 800; // Tray starts at Y=800

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        newPieces.push({
          id: idCounter++,
          col, row,
          correctX: col * pieceWidth,
          correctY: row * pieceHeight,
          w: pieceWidth,
          h: pieceHeight,
          sourceX: col * sourcePieceWidth,
          sourceY: row * sourcePieceHeight,
          sourceW: sourcePieceWidth,
          sourceH: sourcePieceHeight,
          // Scatter in the tray area at the bottom
          x: Math.random() * (virtualWidth - pieceWidth),
          y: trayY + Math.random() * (virtualHeight - trayY - pieceHeight),
          isLocked: false
        });
      }
    }
    
    piecesRef.current = newPieces;
    setPieces(newPieces);

    if (isHost) {
      // Send initial state to room
      socket.emit('sync-board', { roomId, pieces: newPieces });
    }
  };

  useEffect(() => {
    if (!imageLoaded) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imgRef.current;
    
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw a ghost image in the center
      // Calculate board area (top 800px)
      const boardAreaHeight = 800;
      
      const padding = 100;
      const scale = Math.min((canvas.width - padding) / img.width, (boardAreaHeight - padding) / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;

      const offsetX = (canvas.width - scaledWidth) / 2;
      const offsetY = (boardAreaHeight - scaledHeight) / 2;
      
      // Draw ghost image
      ctx.globalAlpha = 0.15;
      ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
      ctx.globalAlpha = 1.0;
      
      // Draw Grid
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      // Calculate cols and rows for grid
      if (piecesRef.current.length > 0) {
        const p = piecesRef.current[0];
        const cols = Math.round(scaledWidth / p.w);
        const rows = Math.round(scaledHeight / p.h);
        
        for (let i = 0; i <= cols; i++) {
          ctx.moveTo(offsetX + i * p.w, offsetY);
          ctx.lineTo(offsetX + i * p.w, offsetY + scaledHeight);
        }
        for (let j = 0; j <= rows; j++) {
          ctx.moveTo(offsetX, offsetY + j * p.h);
          ctx.lineTo(offsetX + scaledWidth, offsetY + j * p.h);
        }
      }
      ctx.stroke();

      // Draw Tray divider
      ctx.strokeStyle = 'var(--primary-blue)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, boardAreaHeight);
      ctx.lineTo(canvas.width, boardAreaHeight);
      ctx.stroke();
      
      // Draw text for tray
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.font = '24px Nunito';
      ctx.fillText('PARÇALARI BURADAN AL', 20, boardAreaHeight + 30);
      
      // Draw pieces
      // Sort by locked status so locked pieces are at the bottom
      const sortedPieces = [...piecesRef.current].sort((a,b) => (a.isLocked === b.isLocked ? 0 : a.isLocked ? -1 : 1));
      
      for (const p of sortedPieces) {
        ctx.save();
        
        if (p.isLocked) {
           // If locked, draw at correct position relative to center
           ctx.drawImage(
             img,
             p.sourceX, p.sourceY, p.sourceW, p.sourceH, // Source
             offsetX + p.correctX, offsetY + p.correctY, p.w, p.h // Dest
           );
        } else {
           // Shadow
           ctx.shadowColor = 'rgba(0,0,0,0.5)';
           ctx.shadowBlur = 5;
           ctx.shadowOffsetX = 2;
           ctx.shadowOffsetY = 2;
           
           ctx.drawImage(
             img,
             p.sourceX, p.sourceY, p.sourceW, p.sourceH,
             p.x, p.y, p.w, p.h
           );
           
           // Stroke
           ctx.shadowColor = 'transparent';
           ctx.strokeStyle = '#fff';
           ctx.lineWidth = 2;
           ctx.strokeRect(p.x, p.y, p.w, p.h);
        }
        ctx.restore();
      }
    };
    
    let animationId;
    const loop = () => {
      draw();
      animationId = requestAnimationFrame(loop);
    };
    loop();
    
    return () => cancelAnimationFrame(animationId);
  }, [imageLoaded, pieces]); // pieces change will re-trigger but ref handles state mostly

  // Mouse Handlers
  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    
    // Find clicked piece (top most first, which is last in array)
    for (let i = piecesRef.current.length - 1; i >= 0; i--) {
      const p = piecesRef.current[i];
      
      let pX = p.isLocked ? p.x : p.x;
      let pY = p.isLocked ? p.y : p.y;
      
      if (mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h) {
        draggingPiece.current = p;
        offset.current = { x: mx - p.x, y: my - p.y };
        
        // If it was locked, unlock it so it can be moved again
        p.isLocked = false;
        
        // Move to top
        piecesRef.current.splice(i, 1);
        piecesRef.current.push(p);
        
        setPieces([...piecesRef.current]);
        break;
      }
    }
  };

  const handleMouseMove = (e) => {
    if (!draggingPiece.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    
    draggingPiece.current.x = mx - offset.current.x;
    draggingPiece.current.y = my - offset.current.y;
    
    // Send drag event for smooth movement across clients
    socket.emit('drag-piece', { roomId, id: draggingPiece.current.id, x: draggingPiece.current.x, y: draggingPiece.current.y });
  };

  const handleMouseUp = () => {
    if (!draggingPiece.current) return;
    
    const p = draggingPiece.current;
    
    const canvas = canvasRef.current;
    const img = imgRef.current;
    
    const boardAreaHeight = 800;
    const padding = 100;
    const scale = Math.min((canvas.width - padding) / img.width, (boardAreaHeight - padding) / img.height);
    const scaledWidth = img.width * scale;
    const scaledHeight = img.height * scale;

    const offsetX = (canvas.width - scaledWidth) / 2;
    const offsetY = (boardAreaHeight - scaledHeight) / 2;
    
    const targetX = offsetX + p.correctX;
    const targetY = offsetY + p.correctY;
    
    // Snap distance
    const dist = Math.hypot(p.x - targetX, p.y - targetY);
    if (dist < 40) { // generous snap distance
      p.isLocked = true;
      p.x = targetX;
      p.y = targetY;
    }
    
    draggingPiece.current = null;
    
    // Broadcast state
    setPieces([...piecesRef.current]);
    socket.emit('update-board', { roomId, pieces: piecesRef.current });
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'auto' }}>
      <canvas 
        ref={canvasRef} 
        width={1600} 
        height={1200} 
        style={{ 
          cursor: draggingPiece.current ? 'grabbing' : 'grab',
          width: '100%',
          height: 'auto',
          display: 'block',
          touchAction: 'none'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={e => {
          e.preventDefault();
          const touch = e.touches[0];
          handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
        }}
        onTouchMove={e => {
          e.preventDefault();
          const touch = e.touches[0];
          handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
        }}
        onTouchEnd={handleMouseUp}
      />
    </div>
  );
}

export default PuzzleBoard;

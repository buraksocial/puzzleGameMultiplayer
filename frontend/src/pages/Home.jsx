import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

const socket = io(import.meta.env.VITE_BACKEND_URL || window.location.origin, {
  transports: ['polling']
});

function Home() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [playerName, setPlayerName] = useState('');
  
  // Create Room State
  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState('');
  const [pieces, setPieces] = useState(50);
  const [image, setImage] = useState(null);
  const [gameType, setGameType] = useState('puzzle');
  
  // Join Room State
  const [joinPassword, setJoinPassword] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  useEffect(() => {
    socket.emit('get-rooms', (data) => {
      setRooms(data);
    });

    socket.on('room-list', (data) => {
      setRooms(data);
    });

    return () => {
      socket.off('room-list');
    };
  }, []);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const createRoom = () => {
    if (!playerName || !roomName || (gameType === 'puzzle' && !image)) {
      alert(gameType === 'puzzle' ? 'Lütfen adınızı, oda adını girin ve bir resim yükleyin.' : 'Lütfen adınızı ve oda adını girin.');
      return;
    }
    
    // We navigate to a generated roomId and let the Room component create it on the server
    const generatedRoomId = Math.random().toString(36).substring(2, 8);
    navigate(`/room/${generatedRoomId}`, { state: { playerName, isHost: true, roomName, password, image, pieces, gameType } });
  };

  const joinRoom = (roomId, hasPassword) => {
    if (!playerName) {
      alert('Lütfen önce bir kullanıcı adı belirleyin.');
      return;
    }
    
    if (hasPassword && selectedRoomId !== roomId) {
      setSelectedRoomId(roomId);
      return;
    }
    
    navigate(`/room/${roomId}`, { state: { playerName, isHost: false, joinPassword } });
  };

  return (
    <div className="home-container" style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ color: '#fff', fontSize: '4rem', textShadow: '0 4px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000', marginBottom: '10px' }}>
          PUZZLE.IO
        </h1>
        <p style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.2rem' }}>BİRLİKTE PUZZLE YAPIN, SOHBET EDİN!</p>
      </div>

      <div className="panel" style={{ display: 'flex', gap: '40px', flexDirection: 'row', flexWrap: 'wrap' }}>
        
        {/* Left Side: Profile / Name */}
        <div style={{ flex: '1', minWidth: '300px', borderRight: '2px solid #eee', paddingRight: '40px' }}>
          <h2 style={{ marginBottom: '20px', color: 'var(--primary-blue)', textAlign: 'center' }}>KİMLİĞİN</h2>
          
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <div style={{ width: '120px', height: '120px', backgroundColor: 'var(--primary-yellow)', borderRadius: '50%', border: '4px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '3rem' }}>😎</span>
            </div>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>KULLANICI ADIN:</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Adını gir..." 
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
            />
          </div>
        </div>

        {/* Right Side: Create or Join */}
        <div style={{ flex: '2', minWidth: '400px', display: 'flex', gap: '40px' }}>
          
          {/* Create Room */}
          <div style={{ flex: 1 }}>
            <h2 style={{ marginBottom: '20px', color: 'var(--primary-orange)', textAlign: 'center' }}>ODA KUR</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <input type="text" className="input-field" placeholder="Oda Adı" value={roomName} onChange={e=>setRoomName(e.target.value)} />
              <input type="password" className="input-field" placeholder="Şifre (İsteğe Bağlı)" value={password} onChange={e=>setPassword(e.target.value)} />
              <select className="input-field" value={gameType} onChange={e=>setGameType(e.target.value)}>
                <option value="puzzle">🧩 Puzzle</option>
                <option value="drawing">🎨 Çizim ve Tahmin</option>
                <option value="quiz">🧠 Quiz</option>
                <option value="gartic-phone">📞 Gartic Phone</option>
              </select>
              
              {gameType === 'puzzle' && <div>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Parça Sayısı: {pieces}</label>
                <select className="input-field" value={pieces} onChange={e=>setPieces(Number(e.target.value))}>
                  <option value={25}>25 Parça (Kolay)</option>
                  <option value={50}>50 Parça (Orta)</option>
                  <option value={100}>100 Parça (Zor)</option>
                  <option value={500}>500 Parça (Pro)</option>
                </select>
              </div>}

              {gameType === 'puzzle' && <div>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Puzzle Görseli Yükle:</label>
                <input type="file" accept="image/*" onChange={handleImageUpload} style={{ width: '100%' }} />
              </div>}

              {image && <img src={image} alt="Preview" style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #000' }} />}

              <button className="btn orange" style={{ width: '100%', marginTop: '10px' }} onClick={createRoom}>
                ODAYI KUR VE BAŞLA!
              </button>
            </div>
          </div>

          {/* Vertical Divider */}
          <div style={{ width: '2px', backgroundColor: '#eee', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: '#fff', padding: '10px', borderRadius: '50%', border: '2px solid #ddd', fontWeight: 'bold', color: '#888' }}>
              VEYA
            </div>
          </div>

          {/* Join Room */}
          <div style={{ flex: 1 }}>
            <h2 style={{ marginBottom: '20px', color: 'var(--primary-green)', textAlign: 'center' }}>ODALARA KATIL</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
              {rooms.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>Henüz açık oda yok. İlk sen kur!</div>
              ) : (
                rooms.map(room => (
                  <div key={room.id} style={{ border: '3px solid #000', borderRadius: '8px', padding: '15px', backgroundColor: '#f9f9f9', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{room.name}</span>
                      <span style={{ fontSize: '0.9rem', backgroundColor: 'var(--primary-blue)', color: '#fff', padding: '2px 8px', borderRadius: '10px' }}>{room.playerCount} Oyuncu</span>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#555' }}>
                      {room.gameType === 'puzzle' ? `🧩 ${room.pieces} Parça` : room.gameType === 'drawing' ? '🎨 Çizim' : room.gameType === 'quiz' ? '🧠 Quiz' : '📞 Gartic Phone'} {room.hasPassword ? '🔒 Şifreli' : '🔓 Açık'}
                    </div>
                    
                    {selectedRoomId === room.id && room.hasPassword && (
                      <input 
                        type="password" 
                        className="input-field" 
                        placeholder="Oda Şifresi" 
                        style={{ padding: '8px' }}
                        value={joinPassword}
                        onChange={e=>setJoinPassword(e.target.value)}
                      />
                    )}
                    
                    <button className="btn green" style={{ width: '100%', padding: '8px' }} onClick={() => joinRoom(room.id, room.hasPassword)}>
                      KATIL
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default Home;

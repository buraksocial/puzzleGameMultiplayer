# PlayRoom

Puzzle, çizim-tahmin, quiz ve Gartic Phone tarzı oyunları aynı odada oynayabileceğiniz gerçek zamanlı multiplayer oyun platformu.

## Özellikler

- Puzzle ortak oyun modu
- Çizim ve tahmin modu
- Quiz modu
- Gartic Phone başlangıç modu
- Oda oluşturma, şifre ve davet edilebilir oda kodu
- Socket.IO ile gerçek zamanlı oyun durumu
- Sohbet ve skor tablosu
- PeerJS ile kamera/mikrofon iletişimi

## Çalıştırma

```bash
cd backend
npm install
node index.js
```

Başka terminalde:

```bash
cd frontend
npm install
npm run dev
```

Frontend varsayılan olarak `http://localhost:5173`, backend `http://localhost:3001` üzerinde çalışır.

## GitHub'a gönderme

Bu klasörü ayrı bir Git repository olarak başlatıp remote ekleyin:

```bash
git init
git add .
git commit -m "Add multiplayer game platform"
git branch -M main
git remote add origin https://github.com/buraksocial/puzzleGameMultiplayer.git
git push -u origin main
```

## Production bağlantısı

Varsayılan olarak Socket.IO ve PeerJS, uygulamanın açıldığı public origin'i kullanır;
kullanıcının `localhost` adresine bağlanmaz. HTTPS sunucusunda `/socket.io/` ve
`/peerjs/` yollarını backend'e yönlendirin. Vite geliştirme sunucusu bunu otomatik yapar.

Mevcut HTTPS Nginx `server` bloğuna örnek:

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 120s;
}

location /peerjs/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 120s;
}
```

Backend farklı bir public adresteyse, frontend derlenmeden önce
`frontend/.env.local` içinde `VITE_SERVER_URL=https://api.example.com` tanımlayın.
PeerJS farklı bir yerdeyse ayrıca `VITE_PEER_URL=https://api.example.com/peerjs`
kullanılabilir. Kamera/mikrofon için HTTPS gereklidir (`localhost` geliştirme istisnasıdır).

Farklı ağlar veya kısıtlı NAT/firewall arkasında medya için bir TURN sunucusu gerekir.
`VITE_ICE_SERVERS`, WebRTC `iceServers` dizisini JSON olarak kabul eder; örnek:

```dotenv
VITE_ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com:3478","username":"temporary-user","credential":"temporary-password"}]'
```

Frontend değişkenleri public bundle'a girer: kalıcı TURN yönetim şifresi kullanmayın;
kısa ömürlü istemci kimlik bilgileri kullanın. Bu ayarlar değişince frontend'i yeniden derleyin
ve hem yeni frontend'i yayınlayın hem backend'i yeniden başlatın.

## Testler

```bash
cd backend
npm test
```

```bash
cd frontend
npm install
npx playwright install chromium
npm run test:e2e
npm run build
```

Tarayıcı testleri ayrı kullanıcı oturumları ve yapay kamera/mikrofon ile çift yönlü
sohbeti, her iki kullanıcının parça yerleştirmesini, canvas görüntülerinin eşitliğini,
geç katılımı, ayrılmayı, alınan ses paketlerini/video karelerini, medya izni reddini,
bekleyen izin isteğini ve erişilemeyen PeerJS sunucusunu kontrol eder.
Test sırasında 3001 ve 5178 portları boş olmalıdır. Gerçek cihazlar ve farklı ağlar
arasındaki TURN bağlantısı bu yerel testlerin kapsamı dışındadır.

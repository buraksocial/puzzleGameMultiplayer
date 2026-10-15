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

## Plesk deploy

Deploy scriptlerini Plesk sunucusunda, Git checkout'unun erişilebilir olduğu subscription kullanıcısıyla çalıştırın. `APP_DIR` Git checkout dizini olmalıdır. Varsayılan restart işaret dosyası `APP_DIR`'nin üst dizinindeki `tmp/restart.txt` olur; farklıysa `PLESK_RESTART_FILE` ile tam yolu verebilirsiniz:

```bash
APP_DIR=/var/www/vhosts/example.com/httpdocs \
bash bash/test-deploy.sh
```

Production için:

```bash
APP_DIR=/var/www/vhosts/example.com/httpdocs \
bash bash/production-deploy.sh
```

Test scripti varsayılan olarak `test`, production scripti `main` branch'ini deploy eder. İhtiyaç halinde `DEPLOY_BRANCH=...` ile branch değiştirilebilir. Test branch'i GitHub'da oluşturulmuş olmalıdır. Scriptler backend/frontend bağımlılıklarını kurar, frontend'i build eder ve Plesk'in `tmp/restart.txt` mekanizmasıyla Node.js uygulamasını yeniden başlatır. Yalnızca build adımlarını denemek için `SKIP_PLESK_RESTART=1` verilebilir.

Backend ve frontend için Plesk document root / Node.js uygulama ayarlarının ayrıca yapılandırılması gerekir. PeerJS kamera/mikrofon iletişimi için production'da HTTPS ve doğru public signaling adresi gerekir; mevcut istemcideki localhost adresleri public deployment öncesi environment variable'a taşınmalıdır.

Frontend varsayılan olarak `http://localhost:5173`, backend `http://localhost:3001` üzerinde çalışır.

Production build öncesi frontend için `VITE_BACKEND_URL=https://api.example.com` tanımlayın. Backend tarafında aynı frontend adresini `FRONTEND_URL` olarak tanımlayabilirsiniz.

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

> Not: Kamera, mikrofon ve PeerJS için production ortamında HTTPS ve backend adresinin environment variable olarak tanımlanması gerekir.

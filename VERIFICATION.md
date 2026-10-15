# Çok oyunculu oda düzeltmesi — doğrulama

Çalışma dizini: `/tmp/opencode/puzzle-room-sync`.
Orijinal `/home/bur4k/Masaüstü/Projeler/puzzleGame` klasörü değiştirilmedi.

## İstenen davranışlar

| Gereksinim | Yapılan doğrulama |
| --- | --- |
| Misafirin yerleştirdiği parçayı kurucu görmeli | Misafir gerçek canvas üzerinde fareyle parçayı doğru yere yerleştiriyor; kurucunun durumu ve iki canvas'ın piksel çıktısı kontrol ediliyor. |
| Kurucunun yerleştirdiği parçayı misafir görmeli | Aynı işlem ters yönde yapılıyor; iki canvas görüntüsü eşit olmalı. |
| Sohbet iki yönde çalışmalı | Ayrı tarayıcı oturumlarında misafir→kurucu ve kurucu→misafir mesajları görünür sohbet alanında kontrol ediliyor. |
| İki taraf birbirini ses/video bölümünde görmeli | Her iki kullanıcıda katılımcı kartları, uzak ses/video track'leri, alınan ses paketleri ve decode edilen video kareleri kontrol ediliyor. |

Ek kontroller: sonradan katılan kullanıcının yerleştirilmiş parçaları alması,
ayrılan kullanıcının kartının kaldırılması, kamera/mikrofon izni reddi ve izin
isteği beklerken/PeerJS erişilemezken sohbet ile puzzle'ın çalışması.

## Test komutları

```bash
cd backend && npm test
```

```bash
cd frontend && npm run test:e2e -- --repeat-each=2
```

```bash
cd frontend && npm run build
```

Tarayıcı testleri gerçek Chromium/WebRTC ile, ayrı kullanıcı oturumlarında ve
yapay kamera/mikrofon kaynaklarıyla çalışır. Üç senaryonun ikişer tekrarında
toplam 6 test geçti. Sunucu regresyon testi ve frontend production derlemesi de geçti.

## Canlı ortam sınırı

`https://puzzle.developer.org.tr/peerjs/` PeerJS sunucu bilgisini döndürüyor.
`https://puzzle.developer.org.tr/socket.io/?EIO=4&transport=polling` geçerli
Socket.IO handshake yanıtı döndürüyor. Bu kontroller yalnızca okuma amaçlıdır;
canlı odalara veya kullanıcı verilerine müdahale edilmedi.

Düzeltilmiş kod canlıya yüklenmedi: bu kopyada remote, yayın komutu veya sunucuya
erişim yapılandırması yok. Yayın için yeni frontend build'i ile backend kodunun
birlikte güncellenmesi gerekir. HTTPS/proxy/TURN ayarları `README.md` içindedir.
Farklı fiziksel cihazlar ve farklı ağlar arasındaki TURN bağlantısı yerel testlerle
doğrulanmış sayılmaz.

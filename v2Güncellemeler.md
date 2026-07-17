# Eternal Blades Bot — Güvenli Güncelleme

Bu pakette dört dosya bulunur:

- `index.js`
- `panels/linksPanel.js`
- `package.json`
- `package-lock.json`

Dosyaları aynı commit içinde GitHub'a yüklemek en güvenli yöntemdir.

## 1. GitHub dosyalarını değiştir

1. Mevcut `index.js` içeriğini tamamen sil ve yeni `index.js` içeriğini yapıştır.
2. `panels/linksPanel.js` içeriğini tamamen sil ve yeni dosyanın içeriğini yapıştır.
3. `package.json` içeriğini yeni sürümle değiştir.
4. Ana dizinde yeni bir `package-lock.json` oluştur ve verilen içeriği yapıştır.
5. Dört değişikliği aynı commit içinde kaydet.

`TOKEN` kod içine yazılmamalıdır. Railway Variables içindeki `TOKEN` kullanılmaya devam eder.

## 2. Railway ayarı

Railway servisinde şu variable'ı ekle:

```text
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30
```

Bu süre, deploy sırasında devam eden bir ticket/transcript işleminin güvenli biçimde tamamlanmasına zaman verir.

Restart Policy ayarı `On Failure` olarak kalabilir.

## 3. Gerekli Discord izinleri

### Links kanalı

- View Channel
- Send Messages
- Embed Links
- Read Message History

### Open-ticket panel kanalı

- View Channel
- Send Messages
- Embed Links
- Read Message History

### Support ve Collaboration transcript kanalları

- View Channel
- Send Messages
- Embed Links
- Read Message History
- Attach Files
- Create Public Threads
- Send Messages in Threads

### Ticket kategorisi

Botun rolünde `Manage Channels` izni bulunmalıdır.

## 4. Beklenen Railway logları

Başarılı başlangıçta buna benzer satırlar görünür:

```text
Eternal Blades#1049 online!
Staff role IDs validated successfully.
Existing links panel updated.
Existing ticket panel updated.
```

İlk panel gönderimiyse `New links panel sent.` veya `New ticket panel sent.` yazabilir.

Deploy sırasında eski süreç güvenli kapanırken:

```text
SIGTERM received. Eternal Blades is shutting down safely...
Eternal Blades shutdown completed.
```

## 5. Test sırası

1. Normal kullanıcıyla Support ticket aç.
2. Aynı kullanıcıyla ikinci Support ticket açmayı dene; engellenmeli.
3. Aynı kullanıcı Collaboration ticket açabilmeli.
4. Normal kullanıcı `CLOSE TICKET` düğmesine basınca reddedilmeli.
5. `Eternal Founder` rolü ticket kapatabilmeli.
6. `Community Manager` rolü ticket kapatabilmeli.
7. Support transcript doğru support-log kanalına gitmeli.
8. Collaboration transcript doğru collaboration-log kanalına gitmeli.
9. Transcript kartındaki `VIEW TRANSCRIPT` düğmesi doğru thread'i açmalı.
10. GitHub'da küçük bir commit yapıp Railway deployunu izle; güvenli SIGTERM kapanışı görülmeli.

## Yapılan temel düzeltmeler

- Staff kontrolü rol adına değil rol ID'sine geçirildi.
- Founder rol ID: `1506665451923443875`
- Community Manager rol ID: `1506668525874577489`
- Çift ticket oluşturma için işlem kilidi eklendi.
- Kanal cache'i ticket kontrolünden önce Discord'dan yenileniyor.
- Yarış durumunda bu istekle yeni oluşan duplicate kanal geri alınıyor; mevcut kanallar veri kaybını önlemek için otomatik silinmiyor.
- Ticket kapatma yalnız doğru kategori ve geçerli metadata ile çalışıyor.
- Ticket oluşturma yarıda hata verirse boş kanal geri alınıyor.
- Login ve eksik TOKEN hataları yakalanıyor.
- Unhandled rejection ve uncaught exception güvenli şekilde loglanıp süreç yeniden başlatılmaya bırakılıyor.
- SIGTERM/SIGINT için graceful shutdown eklendi.
- Bot kapanırken yeni ticket işlemi kabul edilmiyor.
- Ticket ve links paneli son 100 mesaj yerine tüm kanal geçmişinde aranıyor.
- Eski duplicate paneller temizleniyor.
- Discord kanal izinleri işlemden önce doğrulanıyor.
- Dependency sürümü sabitlendi ve `package-lock.json` eklendi.

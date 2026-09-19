# Eternal Blades Bot — Wallet Collection v1.1.0

Bu sürüm Ethereum / EVM wallet toplama sistemini mevcut Eternal Blades botuna ekler.

## Yetkili roller

Wallet gönderebilir:

- Legend of the Blades
- Blade Warden
- Blade Vanguard
- First Blades

`Blade Seeker` tek başına wallet gönderemez.

## Kanal ID'leri

```text
wallet-submission = 1550988251081211935
wallet-logs       = 1550988980554694727
```

`wallet-submission` üyelerin görebildiği fakat normal mesaj yazamadığı kanal olabilir.
`wallet-logs` yalnızca Eternal Founder, Community Manager ve Eternal Blades Bots tarafından görülmelidir.

## Railway PostgreSQL

Wallet kayıtları deploy/restart sonrasında kaybolmaması için PostgreSQL'de saklanır.
Railway projesine PostgreSQL servisi ekle ve bot servisinde `DATABASE_URL` variable'ının bulunduğunu kontrol et.

```text
DATABASE_URL=postgresql://...
```

Bu değeri GitHub'a yazma.

## İlk deploy

İlk başarılı deployda loglarda şunları görmelisin:

```text
Wallet PostgreSQL store is ready.
New wallet panel sent.
Wallet panel message ID: ...
Wallet collection system is ready. Blade Seeker is excluded from eligibility.
```

Sonra Railway Variables'a ekle:

```text
WALLET_PANEL_MESSAGE_ID=logda_yazan_mesaj_id
```

Redeploy sonrası:

```text
Existing wallet panel updated directly by message ID.
```

## Kullanıcı akışı

1. Yetkili role sahip üye `#wallet-submission` kanalındaki **Submit Wallet** butonuna basar.
2. Bot güncel rollerini Discord'dan tekrar kontrol eder.
3. Modal açılır ve 42 karakterlik `0x...` Ethereum/EVM public address istenir.
4. Bot formatı kontrol eder. Zero address reddedilir.
5. Aynı wallet başka Discord hesabına kayıtlıysa reddedilir.
6. Kullanıcının eski kaydı varsa yeni wallet ile güncellenir.
7. Başarılı kayıt PostgreSQL'e yazılır.
8. `#wallet-logs` kanalına staff log embed'i gönderilir.
9. Kullanıcı sonucu sadece kendisinin görebildiği ephemeral mesajla görür.

Bot hiçbir zaman seed phrase, private key veya recovery phrase istemez.

## Test listesi

1. `npm ci`
2. `npm run check`
3. Blade Seeker-only hesapla **Submit Wallet** dene → reddedilmeli.
4. First Blades hesabıyla geçerli `0x...` adres gönder → kabul edilmeli.
5. Aynı hesap farklı wallet gönder → eski kayıt update edilmeli.
6. İkinci Discord hesabıyla aynı wallet gönder → reddedilmeli.
7. Hatalı uzunluk veya hex dışı karakter gönder → reddedilmeli.
8. Zero address gönder → reddedilmeli.
9. `wallet-logs` kanalında yeni/update kayıtlarını kontrol et.
10. Redeploy yap ve aynı wallet kayıtlarının PostgreSQL'de kaldığını doğrula.
11. `WALLET_PANEL_MESSAGE_ID` ayarlı deployda duplicate panel oluşmadığını doğrula.

## Değiştirilen / eklenen dosyalar

```text
index.js
package.json
package-lock.json
README.md
KURULUM-VE-TEST.md
config/wallet.js                 (yeni)
panels/walletPanel.js            (yeni)
services/walletStore.js          (yeni)
services/walletService.js        (yeni)
```

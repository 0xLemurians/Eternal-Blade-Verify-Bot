# Eternal Blades Bot — Ölçeklenebilir Panel Güncellemesi v1.0.2

Bu sürümde panel mesajlarını bulmak için kanalın tüm geçmişi artık indirilmez.

## Değiştirilecek dosyalar

- `index.js`
- `panels/linksPanel.js`
- `utils/panelMessage.js` (yeni dosya)
- `package.json`
- `package-lock.json`

Dosya yapısı şöyle olmalıdır:

```text
Eternal-Blade-Verify-Bot/
├── index.js
├── package.json
├── package-lock.json
├── panels/
│   └── linksPanel.js
└── utils/
    └── panelMessage.js
```

## Panel sistemi nasıl çalışır?

1. Railway'de panel mesaj ID'si ayarlıysa bot doğrudan o tek mesajı getirip günceller.
2. ID henüz ayarlı değilse yalnızca son 100 mesajı tek sefer tarar.
3. Paneli bulursa Railway loguna mesaj ID'sini yazar.
4. Son 100 mesajda panel yok ama daha eski mesajlar varsa yeni panel göndermez; duplicate oluşmasını engeller.
5. Ticket transcript'i kapanırken ticket kanalındaki tüm mesajları çekmeye devam eder. Bu gereklidir; panel taramasıyla aynı şey değildir.

## İlk deploydan sonra eklenecek Railway variables

Deploy Logs içinde şu satırları bul:

```text
Ticket panel message ID: 123456789012345678
Links panel message ID: 123456789012345679
```

Railway → Variables bölümüne şu iki variable'ı ekle:

```text
TICKET_PANEL_MESSAGE_ID=logda yazan ticket panel ID
LINKS_PANEL_MESSAGE_ID=logda yazan links panel ID
```

Bunlar eklendikten sonraki deploylarda log şöyle görünür:

```text
Existing ticket panel updated directly by message ID.
Existing links panel updated directly by message ID.
```

Bu aşamadan sonra panel kanallarında binlerce mesaj olsa bile bot bütün geçmişi taramaz.

## Diğer Railway variables

```text
TOKEN=Discord bot tokenı
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30
```

`TOKEN` kesinlikle GitHub koduna yazılmamalıdır.

## Node sürümü

`package.json` artık şunu içerir:

```json
"engines": {
  "node": ">=18.0.0"
}
```

Railway böylece Node 18 veya daha yeni bir sürüm kullanır.

## Gerekli Discord izinleri

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

### Transcript kanalları

- View Channel
- Send Messages
- Embed Links
- Read Message History
- Attach Files
- Create Public Threads
- Send Messages in Threads

### Ticket kategorisi

Bot rolünde `Manage Channels` izni bulunmalıdır.

## Başarılı başlangıç logları

İlk deployda:

```text
Eternal Blades#1049 online!
Staff role IDs validated successfully.
Existing ticket panel updated from the recent-message fallback.
Ticket panel message ID: ...
Existing links panel updated from the recent-message fallback.
Links panel message ID: ...
```

Panel ID variables eklendikten sonra:

```text
Eternal Blades#1049 online!
Staff role IDs validated successfully.
Existing ticket panel updated directly by message ID.
Existing links panel updated directly by message ID.
```

## Test sırası

1. Normal kullanıcıyla Support ticket aç.
2. Aynı kullanıcıyla ikinci Support ticket açmayı dene; engellenmeli.
3. Aynı kullanıcı Collaboration ticket açabilmeli.
4. Normal kullanıcı `CLOSE TICKET` düğmesine basınca reddedilmeli.
5. Founder ve Community Manager rolleri ticket kapatabilmeli.
6. Support ve Collaboration transcriptleri doğru kanallara düşmeli.
7. `VIEW TRANSCRIPT` düğmesi doğru thread'i açmalı.
8. Railway'e iki panel mesaj ID variable'ını ekle.
9. Redeploy yap.
10. Loglarda iki panelin de `directly by message ID` ile güncellendiğini doğrula.

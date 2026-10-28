# Module 6 wiring

## server.js
```js
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const initChat = require('./sockets/chatSocket');
const startReminderJob = require('./jobs/reminderJob');

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173' } });
initChat(io);

// after mongoose connects:
startReminderJob();

server.listen(process.env.PORT || 5000);   // listen on `server`, NOT `app`
```

## app.js
```js
app.use('/api/chat', require('./routes/chatRoutes'));
```

## Session model: add
```js
reminderSent: { type: Boolean, default: false },
followupSent: { type: Boolean, default: false },
```

## Fire events from existing code
```js
const { notify, EVENTS } = require('../services/notificationService');

// schedulingController, after booking saved:
notify.emit(EVENTS.BOOKING_CONFIRMED, { email: client.email, phone: client.phone, clientName: client.name, when: session.startTime.toISOString() });

// paymentController / webhook, after status -> paid:
notify.emit(EVENTS.PAYMENT_SUCCESS, { email: client.email, phone: client.phone, amount: payment.amount });
```

## .env (optional, for real email)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=app_password
MAIL_FROM=Unfazed <you@gmail.com>
CLIENT_URL=http://localhost:5173

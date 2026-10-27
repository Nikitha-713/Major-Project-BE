require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const Session = require('./models/Session');
const { releaseExpiredHolds, expireOldPackages } = require('./services/paymentService');
const { initSockets } = require('./sockets');

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB();
    await Session.syncIndexes();

    setInterval(() => {
      Promise.all([releaseExpiredHolds(), expireOldPackages()]).catch((err) =>
        console.error('Sweep failed:', err.message)
      );
    }, 60 * 1000);

    const server = http.createServer(app);
    const io = initSockets(server);
    app.set('io', io); // REST controllers can reach io via req.app.get('io')

    server.listen(PORT, () => console.log(`API + Socket.io running on http://localhost:${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
})();
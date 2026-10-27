require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const Session = require('./models/Session');
const { releaseExpiredHolds, expireOldPackages } = require('./services/paymentService');

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB();
    // The double-booking index changed in Module 4 (it now keys on `holdsSlot`).
    await Session.syncIndexes();

    // Every minute: free unpaid slot holds and expire old package credits.
    setInterval(() => {
      Promise.all([releaseExpiredHolds(), expireOldPackages()]).catch((err) => console.error('Sweep failed:', err.message));
    }, 60 * 1000);

    app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
})();

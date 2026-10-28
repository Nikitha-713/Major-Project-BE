const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const requireFeature = require('../middleware/entitlementMiddleware');
const {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
} = require('../controllers/clientController');

// All client routes require a logged-in therapist
router.use(auth);

router.get('/', getClients);
router.get('/:id', getClientById);

// Gated: the therapist's plan decides how many ACTIVE clients they can have.
router.post('/', requireFeature('active_clients'), createClient);

router.put('/:id', updateClient);
router.delete('/:id', deleteClient);

module.exports = router;

const Client = require('../models/Client');
const Session = require('../models/Session');
const SessionNote = require('../models/SessionNote');
const { TEMPLATES, list: listTemplates } = require('../config/noteTemplates');
const { sanitizeDoc, emptyDoc } = require('../utils/richText');
const { forTherapist, forClient } = require('../services/noteSerializer');

const TOKEN_RE = /^[a-f0-9]{64}$/;
const noStore = (res) => res.set('Cache-Control', 'no-store'); // health information: never cached

// Turns what the browser sent into the exact sections of the chosen template, sanitized.
function buildSections(format, incoming) {
  const template = TEMPLATES[format];
  const byKey = new Map((incoming || []).map((s) => [s && s.key, s && s.content]));
  const sections = [];
  let anyText = false;
  for (const def of template.sections) {
    const raw = byKey.get(def.key);
    if (raw === undefined || raw === null) {
      sections.push({ key: def.key, content: emptyDoc() });
      continue;
    }
    const { doc, isEmpty } = sanitizeDoc(raw);
    if (!isEmpty) anyText = true;
    sections.push({ key: def.key, content: doc });
  }
  if (!anyText) throw Object.assign(new Error('Write something in the note before saving'), { status: 400 });
  return sections;
}

// Session must exist and belong to this therapist AND this client.
async function checkSession(therapistId, clientId, sessionId) {
  if (!sessionId) return undefined;
  const session = await Session.findOne({ _id: sessionId, therapist: therapistId, client: clientId }).select('_id');
  if (!session) throw Object.assign(new Error('That session does not belong to this client'), { status: 400 });
  return session._id;
}

exports.getTemplates = (req, res) => res.json({ templates: listTemplates() });

exports.listNotes = async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const filter = { therapist: req.therapist._id };
    if (req.query.client) filter.client = req.query.client;
    if (req.query.session) filter.session = req.query.session;
    if (['private', 'shared'].includes(req.query.type)) filter.type = req.query.type;

    const notes = await SessionNote.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('client', 'name')
      .populate('session', 'startTime serviceTitle')
      .lean();
    noStore(res);
    res.json({ notes: notes.map(forTherapist) });
  } catch (err) {
    next(err);
  }
};

exports.getNote = async (req, res, next) => {
  try {
    const note = await SessionNote.findOne({ _id: req.params.id, therapist: req.therapist._id })
      .populate('client', 'name')
      .populate('session', 'startTime serviceTitle')
      .lean();
    if (!note) return res.status(404).json({ message: 'Note not found' });
    noStore(res);
    res.json({ note: forTherapist(note) });
  } catch (err) {
    next(err);
  }
};

exports.createNote = async (req, res, next) => {
  try {
    // Module 7 will gate structured templates (SOAP/DAP) through the Entitlement Service here.
    const { client: clientId, session: sessionId, type = 'private', format = 'freeform', title = '', sections } = req.body;

    const client = await Client.findOne({ _id: clientId, therapist: req.therapist._id }).select('name');
    if (!client) return res.status(404).json({ message: 'Client not found' });
    const session = await checkSession(req.therapist._id, client._id, sessionId);

    const note = await SessionNote.create({
      therapist: req.therapist._id,
      client: client._id,
      session,
      type,
      format,
      title,
      sections: buildSections(format, sections),
    });
    const full = await SessionNote.findById(note._id)
      .populate('client', 'name')
      .populate('session', 'startTime serviceTitle')
      .lean();
    res.status(201).json({ note: forTherapist(full) });
  } catch (err) {
    next(err);
  }
};

exports.updateNote = async (req, res, next) => {
  try {
    const note = await SessionNote.findOne({ _id: req.params.id, therapist: req.therapist._id });
    if (!note) return res.status(404).json({ message: 'Note not found' });

    // The format of a saved note is fixed: sections would no longer match.
    if (req.body.title !== undefined) note.title = req.body.title;
    if (req.body.type !== undefined) note.type = req.body.type;
    if (req.body.session !== undefined) note.session = await checkSession(req.therapist._id, note.client, req.body.session);
    if (req.body.sections !== undefined) note.sections = buildSections(note.format, req.body.sections);

    await note.save();
    const full = await SessionNote.findById(note._id)
      .populate('client', 'name')
      .populate('session', 'startTime serviceTitle')
      .lean();
    res.json({ note: forTherapist(full) });
  } catch (err) {
    next(err);
  }
};

exports.deleteNote = async (req, res, next) => {
  try {
    const note = await SessionNote.findOneAndDelete({ _id: req.params.id, therapist: req.therapist._id });
    if (!note) return res.status(404).json({ message: 'Note not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
};

// CLIENT-FACING. Reached through the secret portal link, no login. Returns shared notes only:
// the query is SessionNote.findSharedForClient (filters type: 'shared') and forClient() refuses
// anything else, so a private note has no path out of this function.
exports.listSharedForPortal = async (req, res, next) => {
  try {
    const { token } = req.params;
    const client = TOKEN_RE.test(token) ? await Client.findOne({ portalToken: token }).select('_id') : null;
    if (!client) return res.status(404).json({ message: 'This link is not valid' });

    const notes = await SessionNote.findSharedForClient(client._id).populate('session', 'startTime serviceTitle').lean();
    noStore(res);
    res.json({ notes: notes.map(forClient) });
  } catch (err) {
    next(err);
  }
};

const express = require('express')
const multer  = require('multer')
const path    = require('path')
const fs      = require('fs')

const router = express.Router()

const ASSETS_DIR = path.join(__dirname, '../../../data/assets')
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true })

const ALLOWED = new Set(['.png','.jpg','.jpeg','.gif','.svg','.webp','.bmp','.stl'])

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ASSETS_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}_${safe}`)
  },
})

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, ALLOWED.has(ext))
  },
  limits: { fileSize: 100 * 1024 * 1024 },
})

// GET /api/assets — list all
router.get('/', (_req, res) => {
  const files = fs.readdirSync(ASSETS_DIR)
    .filter(n => ALLOWED.has(path.extname(n).toLowerCase()))
    .map(name => {
      const stat = fs.statSync(path.join(ASSETS_DIR, name))
      const ext  = path.extname(name).toLowerCase()
      return {
        name,
        url: `/api/assets/file/${encodeURIComponent(name)}`,
        size: stat.size,
        mtime: stat.mtimeMs,
        type: ext === '.stl' ? 'stl' : 'image',
      }
    })
    .sort((a, b) => b.mtime - a.mtime)
  res.json(files)
})

// POST /api/assets/upload
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file or unsupported type' })
  const ext  = path.extname(req.file.filename).toLowerCase()
  res.json({
    name: req.file.filename,
    url:  `/api/assets/file/${encodeURIComponent(req.file.filename)}`,
    size: req.file.size,
    type: ext === '.stl' ? 'stl' : 'image',
  })
})

// DELETE /api/assets/:name
router.delete('/:name', (req, res) => {
  const filePath = path.join(ASSETS_DIR, path.basename(req.params.name))
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' })
  fs.unlinkSync(filePath)
  res.json({ ok: true })
})

// GET /api/assets/file/:name — serve file
router.get('/file/:name', (req, res) => {
  const filePath = path.join(ASSETS_DIR, path.basename(req.params.name))
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found')
  res.sendFile(filePath)
})

module.exports = router

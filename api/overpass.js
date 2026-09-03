// api/overpass.js — Vercel Serverless Function to proxy Overpass API requests
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    let query = req.body?.query
    if (typeof req.body === 'string') {
      try {
        query = JSON.parse(req.body).query
      } catch {
        query = req.body
      }
    }

    if (!query) {
      res.status(400).json({ error: 'Missing query parameter in request body' })
      return
    }

    const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SafetyGuardian/1.0 (https://safetyguardian.app)',
      },
      body: `data=${encodeURIComponent(query)}`,
    })

    if (!overpassRes.ok) {
      const errText = await overpassRes.text()
      res.status(overpassRes.status).send(errText)
      return
    }

    const data = await overpassRes.json()
    res.status(200).json(data)
  } catch (error) {
    console.error('[Overpass Proxy Error]', error)
    res.status(500).json({ error: error.message || 'Failed to proxy request to Overpass' })
  }
}

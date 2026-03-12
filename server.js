const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_VERSION = process.env.NOTION_VERSION || '2022-06-28';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const STATUS = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  DROPPED: '하차/취소'
};

function notionHeaders() {
  if (!NOTION_TOKEN) return null;
  return {
    Authorization: `Bearer ${NOTION_TOKEN}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json'
  };
}

function hasNotionConfig() {
  return Boolean(NOTION_TOKEN && NOTION_DATABASE_ID);
}

function textProp(value) {
  return { rich_text: [{ text: { content: value || '' } }] };
}

function getTitle(prop) {
  return prop?.title?.[0]?.plain_text || '';
}

function getRich(prop) {
  return prop?.rich_text?.[0]?.plain_text || '';
}

function getDate(prop) {
  return prop?.date?.start || '';
}

function getSelect(prop) {
  return prop?.select?.name || prop?.status?.name || '';
}

function toClientItem(page) {
  const p = page.properties || {};
  return {
    Title: getTitle(p.Title),
    Type: getSelect(p.Type),
    Status: getSelect(p.Status),
    StartDate: getDate(p.StartDate),
    EndDate: getDate(p.EndDate),
    Memo: getRich(p.Memo),
    SourceId: getRich(p.SourceId),
    Author: getRich(p.Author),
    Director: getRich(p.Director),
    CoverUrl: p.CoverUrl?.url || '',
    PosterUrl: p.PosterUrl?.url || ''
  };
}

async function notionQuery(filter, sorts = []) {
  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
    method: 'POST',
    headers: notionHeaders(),
    body: JSON.stringify({ filter, sorts, page_size: 50 })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion query failed: ${body}`);
  }
  return res.json();
}

async function notionCreate(properties) {
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: notionHeaders(),
    body: JSON.stringify({ parent: { database_id: NOTION_DATABASE_ID }, properties })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion create failed: ${body}`);
  }
  return res.json();
}

function buildProperties(type, title, sourceId, payload, userOverrides) {
  const isBook = type === 'book';
  return {
    Title: { title: [{ text: { content: title } }] },
    Type: { select: { name: isBook ? 'Book' : 'Movie' } },
    Status: { select: { name: STATUS.NOT_STARTED } },
    StartDate: userOverrides?.startDate ? { date: { start: userOverrides.startDate } } : { date: null },
    Memo: textProp(userOverrides?.memo || ''),
    SourceId: textProp(sourceId || ''),
    CoverUrl: { url: isBook ? payload.image || null : null },
    PosterUrl: { url: !isBook ? payload.image || null : null },
    Author: textProp(isBook ? payload.author || '' : ''),
    Director: textProp(!isBook ? payload.director || '' : ''),
    PublishedDate: isBook && payload.date ? { date: { start: payload.date } } : { date: null },
    ReleaseDate: !isBook && payload.date ? { date: { start: payload.date } } : { date: null }
  };
}

app.get('/api/search/books', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json({ items: [] });

  const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=10`);
  const data = await r.json();

  const items = (data.items || []).map((book) => {
    const info = book.volumeInfo || {};
    return {
      sourceId: book.id,
      title: info.title,
      author: (info.authors || []).join(', '),
      date: info.publishedDate?.slice(0, 10) || '',
      image: info.imageLinks?.thumbnail || ''
    };
  });

  res.json({ items });
});

app.get('/api/search/movies', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json({ items: [] });

  const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=movie&limit=10`);
  const data = await r.json();

  const items = (data.results || []).map((movie) => ({
    sourceId: String(movie.trackId),
    title: movie.trackName,
    director: movie.artistName,
    date: movie.releaseDate?.slice(0, 10) || '',
    image: movie.artworkUrl100?.replace('100x100', '600x600') || ''
  }));

  res.json({ items });
});

app.post('/api/items/add', async (req, res) => {
  try {
    if (!hasNotionConfig()) {
      return res.status(400).json({ error: 'NOTION_TOKEN / NOTION_DATABASE_ID 환경변수가 필요합니다.' });
    }

    const { type, title, sourceId, payload, userOverrides } = req.body;

    const filter = {
      and: [
        { property: 'Type', select: { equals: type === 'book' ? 'Book' : 'Movie' } },
        {
          or: [
            { property: 'SourceId', rich_text: { equals: sourceId || '' } },
            { property: 'Title', title: { equals: title } }
          ]
        }
      ]
    };

    const existing = await notionQuery(filter);
    if (existing.results.length > 0) {
      return res.json({ alreadyExists: true });
    }

    const properties = buildProperties(type, title, sourceId, payload, userOverrides);
    await notionCreate(properties);

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/items/in-progress-book', async (_req, res) => {
  try {
    if (!hasNotionConfig()) return res.json({ item: null });

    const data = await notionQuery({
      and: [
        { property: 'Type', select: { equals: 'Book' } },
        { property: 'Status', select: { equals: STATUS.IN_PROGRESS } }
      ]
    });
    res.json({ item: data.results[0] ? toClientItem(data.results[0]) : null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/items/latest-watched-movie', async (_req, res) => {
  try {
    if (!hasNotionConfig()) return res.json({ item: null });

    const data = await notionQuery(
      {
        and: [
          { property: 'Type', select: { equals: 'Movie' } },
          { property: 'Status', select: { equals: STATUS.DONE } }
        ]
      },
      [{ property: 'EndDate', direction: 'descending' }]
    );

    res.json({ item: data.results[0] ? toClientItem(data.results[0]) : null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/items/random-not-started-movie', async (_req, res) => {
  try {
    if (!hasNotionConfig()) return res.json({ item: null });

    const data = await notionQuery({
      and: [
        { property: 'Type', select: { equals: 'Movie' } },
        { property: 'Status', select: { equals: STATUS.NOT_STARTED } }
      ]
    });

    if (!data.results.length) return res.json({ item: null });
    const picked = data.results[Math.floor(Math.random() * data.results.length)];
    res.json({ item: toClientItem(picked) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`List_BnM app listening on http://localhost:${PORT}`);
});

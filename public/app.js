const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
const searchBtn = document.getElementById('searchBtn');
const queryInput = document.getElementById('query');
const categoryInput = document.getElementById('category');
const searchResults = document.getElementById('searchResults');
const searchMessage = document.getElementById('searchMessage');
const inProgressBook = document.getElementById('inProgressBook');
const latestMovie = document.getElementById('latestMovie');
const randomMovie = document.getElementById('randomMovie');
const refreshRandom = document.getElementById('refreshRandom');

tabs.forEach((tab) => {
  tab.addEventListener('click', async () => {
    tabs.forEach((t) => t.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    const target = document.getElementById(tab.dataset.tab);
    target.classList.add('active');
    if (tab.dataset.tab === 'list') await loadListWidgets();
  });
});

searchBtn.addEventListener('click', searchItems);
refreshRandom.addEventListener('click', loadRandomMovie);

function safe(val, fallback = '-') {
  return val || fallback;
}

function cardTemplate(item, type) {
  const image = item.image || 'https://placehold.co/400x600?text=No+Image';
  const sub = type === 'book' ? `저자: ${safe(item.author)}` : `감독: ${safe(item.director)}`;
  return `
    <article class="card">
      <img src="${image}" alt="${item.title}" />
      <div class="content">
        <h3>${item.title}</h3>
        <p>${sub}</p>
        <p>${safe(item.date)}</p>
      </div>
      <button data-item='${JSON.stringify(item)}' data-type='${type}'>Notion에 추가</button>
    </article>
  `;
}

async function searchItems() {
  const q = queryInput.value.trim();
  const type = categoryInput.value;
  if (!q) return;
  searchMessage.textContent = '검색 중...';
  searchResults.innerHTML = '';

  const endpoint = type === 'book' ? `/api/search/books?q=${encodeURIComponent(q)}` : `/api/search/movies?q=${encodeURIComponent(q)}`;
  const res = await fetch(endpoint);
  const data = await res.json();

  if (!data.items?.length) {
    searchMessage.textContent = '검색 결과가 없습니다.';
    return;
  }

  searchMessage.textContent = `${data.items.length}개 검색됨`;
  searchResults.innerHTML = data.items.map((item) => cardTemplate(item, type)).join('');

  searchResults.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => addToNotion(btn));
  });
}

async function addToNotion(button) {
  const item = JSON.parse(button.dataset.item);
  const type = button.dataset.type;
  const startDate = prompt('시작일(선택, YYYY-MM-DD)');
  const memo = prompt('메모(선택)');

  const res = await fetch('/api/items/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      title: item.title,
      sourceId: item.sourceId,
      payload: item,
      userOverrides: { startDate, memo }
    })
  });
  const data = await res.json();

  if (data.alreadyExists) {
    searchMessage.textContent = '이미 Notion 리스트에 있습니다.';
    return;
  }
  if (data.error) {
    searchMessage.textContent = `오류: ${data.error}`;
    return;
  }
  searchMessage.textContent = 'Notion DB에 저장되었습니다.';
}

function renderDetailCard(target, item, type) {
  if (!item) {
    target.innerHTML = '<p>데이터 없음</p>';
    return;
  }
  const image = (type === 'book' ? item.CoverUrl : item.PosterUrl) || 'https://placehold.co/400x600?text=No+Image';
  const meta = type === 'book'
    ? `저자: ${safe(item.Author)} / 상태: ${safe(item.Status)}`
    : `감독: ${safe(item.Director)} / 상태: ${safe(item.Status)}`;

  target.innerHTML = `
    <article class="card detail">
      <img src="${image}" alt="${item.Title}" />
      <div class="content">
        <h3>${item.Title}</h3>
        <p>${meta}</p>
        <p>시작일: ${safe(item.StartDate)} / 종료일: ${safe(item.EndDate)}</p>
        <span class="badge">카드 클릭 시 상세 메모</span>
      </div>
    </article>
  `;

  target.querySelector('.detail').addEventListener('click', () => {
    alert(item.Memo || '메모가 없습니다.');
  });
}

async function loadListWidgets() {
  const [bookRes, movieRes] = await Promise.all([
    fetch('/api/items/in-progress-book'),
    fetch('/api/items/latest-watched-movie')
  ]);

  const bookData = await bookRes.json();
  const movieData = await movieRes.json();

  renderDetailCard(inProgressBook, bookData.item, 'book');
  renderDetailCard(latestMovie, movieData.item, 'movie');
  await loadRandomMovie();
}

async function loadRandomMovie() {
  const res = await fetch('/api/items/random-not-started-movie');
  const data = await res.json();
  renderDetailCard(randomMovie, data.item, 'movie');
}

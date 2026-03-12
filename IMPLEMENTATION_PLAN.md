# List_BnM 구현 가능성 및 MVP 설계

## 결론
요청한 기능은 **충분히 구현 가능**합니다.

핵심은 아래 3개입니다.
1. Notion DB를 단일 소스로 사용
2. 검색 API(책/영화) + Notion 중복검사
3. List 탭에서 상태 기반 카드/랜덤 추천 노출

---

## 1) 전체 기능 요구사항 정리

### 탭 구성
- **검색(Search) 탭**
  - 카테고리 선택: `책` / `영화`
  - 외부 검색 API 호출
    - 책: Google Books API 또는 Naver Book API
    - 영화: TMDB API 또는 OMDb API
  - 검색 결과 선택 시 Notion DB 중복 검사
    - 이미 있으면: "이미 리스트에 있음" 안내
    - 없으면: 표지/포스터/감독/저자/출간일/개봉일 등 자동 채움 후 생성
  - 부족한 데이터가 있을 경우 사용자 입력 보강(예: 감상 시작일, 메모)

- **리스트(List) 탭**
  - 진행중인 책 1권(또는 여러 권) 표지 카드 노출
  - 최근 본 영화 포스터 카드 노출
  - 카드 클릭 시 상세정보(메모, 평점, 날짜, 장르 등) 표시
  - `Not started` 영화 랜덤 1편 추천 + 새로고침 시 랜덤 변경

### 상태(Status) 값
- `Not started`
- `In progress`
- `Done`
- `하차/취소`

---

## 2) Notion 데이터베이스 권장 스키마

단일 DB에 `Type` 속성으로 책/영화를 구분하는 방식을 추천합니다.

### 공통 속성
- `Title` (title)
- `Type` (select: Book, Movie)
- `Status` (status 또는 select)
- `StartDate` (date)
- `EndDate` (date)
- `Rating` (number)
- `Memo` (rich_text)
- `SourceId` (rich_text, 외부 API 고유 ID)
- `CreatedAt` (created_time)
- `UpdatedAt` (last_edited_time)

### 책 전용 속성
- `Author` (rich_text)
- `Publisher` (rich_text)
- `PublishedDate` (date 또는 rich_text)
- `ISBN` (rich_text)
- `CoverUrl` (url)
- `PageCount` (number)

### 영화 전용 속성
- `Director` (rich_text)
- `ReleaseDate` (date)
- `Runtime` (number)
- `PosterUrl` (url)
- `TMDB_ID` (rich_text)
- `Genres` (multi_select)

---

## 3) 백엔드 API 설계 (예시)

### 검색
- `GET /api/search/books?q=...`
- `GET /api/search/movies?q=...`

### 추가(중복검사 포함)
- `POST /api/items/add`
  - 입력: `{ type, externalId, title, userOverrides? }`
  - 처리:
    1. Notion `SourceId`/`Title`로 중복 조회
    2. 중복이면 `alreadyExists: true` 반환
    3. 아니면 외부 API 상세조회 후 Notion page 생성

### 리스트 조회
- `GET /api/items/in-progress-book`
  - `Type=Book AND Status=In progress`
- `GET /api/items/latest-watched-movie`
  - `Type=Movie AND Status=Done`, `EndDate` desc
- `GET /api/items/random-not-started-movie`
  - `Type=Movie AND Status=Not started` 중 랜덤

### 상세 조회
- `GET /api/items/:id`
  - Notion page 상세 속성 + 메모

---

## 4) 상태 매핑 규칙

외부에서 들어오는 상태값은 내부 enum으로 표준화 후 Notion에 저장합니다.

- `NOT_STARTED` -> `Not started`
- `IN_PROGRESS` -> `In progress`
- `DONE` -> `Done`
- `DROPPED` -> `하차/취소`

이 방식이면 앱 내부 로직(필터/랜덤/통계)과 Notion UI를 모두 일관되게 유지할 수 있습니다.

---

## 5) 화면 동작 시나리오

1. 검색 탭에서 `영화` 선택 후 "인터스텔라" 검색
2. 후보 선택
3. 서버가 Notion에서 중복 검사
4. 없으면 TMDB 상세조회 -> 포스터/감독/개봉일 자동입력 -> Notion 생성
5. List 탭에서
   - 진행중인 책 카드 표시
   - 최근 완료 영화 카드 표시
   - Not started 영화 랜덤 1편 추천
6. 랜덤 추천 새로고침 버튼 클릭 시 다른 후보 재추첨

---

## 6) 구현 우선순위 (MVP)

1. Notion 연동 + DB 스키마 확정
2. 책/영화 검색 API 연결
3. 중복검사 + 생성 API
4. List 탭 3개 위젯(진행중 책 / 최근 본 영화 / 랜덤 추천)
5. 상세 카드 UI
6. 사용자 보강입력(부족 데이터 수동 입력)

---

## 7) 기술 스택 예시

- Frontend: Next.js(React) + Tailwind
- Backend: Next.js Route Handler 또는 Express
- External API:
  - Book: Google Books
  - Movie: TMDB
- DB: Notion Database (Primary source)
- Cache(선택): Redis (랜덤추천/검색속도 개선)

---

## 8) 리스크 및 대응

- Notion API 속도/Rate limit
  - 대응: 검색결과/상세 캐싱, 필요한 필드만 조회
- 외부 API 데이터 누락
  - 대응: 사용자 보강 입력 폼 제공
- 중복 판별 정확도
  - 대응: `SourceId` 우선, title 정규화 보조

---

## 9) 결론

요구사항은 **MVP 기준 1~2주 내 구현 가능한 범위**입니다.
특히 "검색 후 Notion 자동 저장"과 "상태 기반 리스트/랜덤 추천"은 Notion 필터 + 외부 API 조합으로 안정적으로 만들 수 있습니다.

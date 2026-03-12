# List_BnM Web App (MVP)

Notion 연동 기반의 책/영화 관리 웹앱 MVP입니다.

## 기능
- Search 탭
  - 책/영화 카테고리 선택 검색
  - Notion DB 중복 체크 후 없으면 자동 저장
- List 탭
  - 진행 중인 책 카드
  - 최근 완료한 영화 카드
  - Not started 영화 랜덤 추천 + 새로고침

## 실행
```bash
npm install
cp .env.example .env
# .env에 Notion 토큰/DB ID 입력
npm start
```

브라우저: `http://localhost:3000`

## Notion DB 권장 속성
- `Title` (title)
- `Type` (select: Book/Movie)
- `Status` (status 또는 select: Not started/In progress/Done/하차/취소)
- `StartDate` (date)
- `EndDate` (date)
- `Memo` (rich_text)
- `SourceId` (rich_text)
- `CoverUrl` (url)
- `PosterUrl` (url)
- `Author` (rich_text)
- `Director` (rich_text)
- `PublishedDate` (date)
- `ReleaseDate` (date)

> 속성명이 다르면 `server.js`의 매핑 함수에서 조정하세요.

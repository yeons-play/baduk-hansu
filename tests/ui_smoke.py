# 바둑한수 화면 흐름 검사 (아이폰 크기) — 사용: npm run build && python3 tests/ui_smoke.py [스크린샷 폴더]
import os, sys, tempfile, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None
serve_dir = tempfile.mkdtemp()
os.symlink(os.path.join(ROOT, 'dist'), os.path.join(serve_dir, 'baduk-hansu'))


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 8781), functools.partial(Q, directory=serve_dir))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:8781/baduk-hansu/'
IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
DEVICES = [('아이패드 세로', IPAD, 820, 1180), ('아이패드 가로', IPAD, 1180, 820), ('아이폰', IOS, 390, 844)]
fails = []


def ok(name, cond, info=''):
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else '  → ' + str(info)))
    if not cond:
        fails.append(name)


def shot(p, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        p.screenshot(path=os.path.join(SHOTS, DEV + '-' + name + '.png'))


def close_key(p):
    # 연습에서 두 번 틀리면 뜨는 핵심 그림을 닫는다(차례로 눌러 정답을 찾는 검사용)
    if p.locator('.sheet [data-action="close-sheet"]').count():
        p.click('.sheet [data-action="close-sheet"]')
        p.wait_for_timeout(100)


def tap_point(p, x, y, size=9, board='.game .board-svg'):
    box = p.locator(board).bounding_box()
    M, VB = 28, 400
    st = (VB - 2 * M) / (size - 1)
    sx = box['x'] + (M + st * x) * box['width'] / VB
    sy = box['y'] + (M + st * y) * box['height'] / VB
    p.mouse.click(sx, sy)
    p.wait_for_timeout(150)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    for DEV, UA, W, H in DEVICES:
      print('──', DEV)
      ctx = b.new_context(user_agent=UA, viewport={'width': W, 'height': H}, device_scale_factor=2, has_touch=True, is_mobile=(UA == IOS))
      p = ctx.new_page()
      errors = []
      p.on('pageerror', lambda e: errors.append(str(e)))
      p.goto(URL)
      p.wait_for_timeout(600)
      shot(p, '1-home')
      ok('홈 화면 표시', p.locator('.wordmark').inner_text() == '바둑한수')
      ok('아래 탭 4개', p.locator('.tabbar button').count() == 4)

      p.click('[data-action="open-start"][data-mode="capture"]')
      p.wait_for_timeout(200)
      shot(p, '2-start-sheet')
      ok('시작 시트 열림', '따내기 바둑' in p.locator('.sheet h2').inner_text())
      ok('바둑판 크기 5·7·9줄 고르기', p.locator('[data-action="size"]').count() == 3)
      p.click('[data-action="size"][data-size="9"]'); p.wait_for_timeout(100)
      p.click('[data-action="start"]')
      p.wait_for_timeout(300)
      ok('첫 대국은 규칙 안내가 먼저 나옴', '놀이 방법' in p.locator('.sheet h2').inner_text())
      shot(p, '3-rules')
      p.click('[data-action="close-rules"]')
      p.wait_for_timeout(200)
      ok('대국 화면에서 아래 탭 숨김', p.locator('.tabbar').count() == 0)
      vh = p.evaluate('innerHeight')
      tb = p.locator('.tools').bounding_box()
      ok('스크롤 없이 도구 버튼까지 한 화면에 보임', tb['y'] + tb['height'] <= vh + 1, (tb, vh))
      bb = p.locator('.board-wrap').bounding_box()
      ok('바둑판이 충분히 큼(짧은 변의 55% 이상)', bb['width'] >= min(W, H) * 0.55, (bb['width'], W, H))

      tap_point(p, 4, 4)
      ok('첫 터치는 미리보기', p.locator('.confirm').count() == 1)
      shot(p, '4-preview')
      p.click('[data-action="confirm"]')
      p.wait_for_timeout(1000)
      stones = p.evaluate("document.querySelectorAll('.game .board-svg circle[fill^=\"url(#g\"]').length")
      ok('착수 후 AI가 응수 (돌 2개)', stones == 2, stones)

      # 같은 곳 두 번 누르기로 착수
      # 하양이가 무작위로 두므로 비어 있는 곳을 골라 시도
      for cx, cy in [(2, 2), (6, 6), (2, 6), (6, 2), (0, 8)]:
          tap_point(p, cx, cy)
          tap_point(p, cx, cy)
          p.wait_for_timeout(1000)
          stones = p.evaluate("document.querySelectorAll('.game .board-svg circle[fill^=\"url(#g\"]').length")
          if stones == 4:
              break
      ok('같은 곳 두 번 누르면 착수', stones == 4, stones)

      # 이미 돌이 있는 곳
      tap_point(p, 4, 4)
      ok('돌 있는 곳 누르면 안내', '벌써 돌이' in (p.locator('.toast').inner_text() if p.locator('.toast').count() else ''))

      p.click('[data-action="hint"]')
      p.wait_for_timeout(150)
      ok('힌트 표시', p.locator('.hint-ring').count() == 1)
      shot(p, '5-hint')

      p.click('[data-action="undo"]')
      p.wait_for_timeout(200)
      stones = p.evaluate("document.querySelectorAll('.game .board-svg circle[fill^=\"url(#g\"]').length")
      ok('무르기는 AI 수까지 함께 되돌림', stones == 2, stones)

      # 나가기 → 홈 → 이어두기
      p.click('[data-action="exit-game"]')
      p.wait_for_timeout(200)
      ok('나가기는 홈으로', p.locator('.home').count() == 1)
      ok('홈 버튼이 이어서 두기로 바뀜', '이어서' in p.locator('[data-action="open-start"][data-mode="capture"]').inner_text())
      p.reload()
      p.wait_for_timeout(500)
      p.click('[data-action="open-start"][data-mode="capture"]')
      p.click('[data-action="resume"]')
      p.wait_for_timeout(300)
      stones = p.evaluate("document.querySelectorAll('.game .board-svg circle[fill^=\"url(#g\"]').length")
      ok('새로고침 후 이어두기 복원', stones == 2, stones)
      ok('두 번째부터는 규칙 안내 생략', p.locator('.sheet').count() == 0)

      # 기권 → 결과
      p.click('[data-action="ask-resign"]')
      p.click('[data-action="resign"]')
      p.wait_for_timeout(200)
      ok('기권 후 결과 시트', p.locator('.result-title').count() == 1)
      shot(p, '6-result')
      p.click('[data-action="go-home"]')
      p.wait_for_timeout(200)
      ok('기록에 1패 반영', '1' in p.locator('.stat-row .stat').nth(2).inner_text())
      # 보호자 요약용 한 줄 기록: 도와줘 1번·되돌리기 1번(나갔다가 이어 두어도 이어서 셈)
      log = p.evaluate("JSON.parse(localStorage.getItem('baduk-game-log') || '[]')")
      ok('한 줄 기록에 도와줘·되돌리기 횟수', len(log) == 1 and log[0].get('hints') == 1 and log[0].get('undos') == 1 and log[0].get('level') == 1, log[:1])

      # 배우기 탭
      p.click('.tabbar [data-tab="learn"]')
      p.wait_for_timeout(200)
      ok('배우기 12강 목록', p.locator('.lessons .lesson').count() == 12)
      shot(p, '7-learn')

      # ── 강의 1강 끝까지 ──
      p.click('.tabbar [data-tab="home"]')
      p.wait_for_timeout(200)
      ok('홈에 오늘 배울 것(1강) 카드', '1' in p.locator('.learn-num').inner_text())
      p.click('.learn-card [data-action="lesson-open"]')
      p.wait_for_timeout(300)
      ok('1강 화면, 아래 탭 숨김', p.locator('.lesson-screen').count() == 1 and p.locator('.tabbar').count() == 0)
      ok('강의 제목에 바둑 용어', '교차점' in p.locator('.bar h1').inner_text())
      shot(p, '8-lesson1')
      def nxt():
          p.click('[data-action="lesson-next"]'); p.wait_for_timeout(200)
      nxt(); nxt()
      ok('누르기 단계는 다음 버튼 잠김', p.locator('[data-action="lesson-next"]').is_disabled())
      tap_point(p, 1, 1, board='.lesson-screen .board-svg')
      ok('틀린 점 누르면 다시 안내', p.locator('.feedback.no').count() == 1)
      tap_point(p, 4, 4, board='.lesson-screen .board-svg')
      ok('천원 누르면 정답', p.locator('.feedback.ok').count() == 1 and not p.locator('[data-action="lesson-next"]').is_disabled())
      shot(p, '9-lesson1-ok')
      nxt(); nxt()
      for x, y in [(2, 2), (6, 2), (2, 6), (6, 6)]:
          tap_point(p, x, y, board='.lesson-screen .board-svg')
      ok('별점 4곳 다 찾기', not p.locator('[data-action="lesson-next"]').is_disabled())
      nxt()
      p.click('[data-action="lesson-choose"][data-i="0"]'); p.wait_for_timeout(150)
      ok('오답 고르면 안내', p.locator('.choice.wrong').count() == 1)
      p.click('[data-action="lesson-choose"][data-i="1"]'); p.wait_for_timeout(150)
      nxt()
      ok('1강 끝 축하 화면', '1강 끝' in p.locator('.result-title').inner_text())
      shot(p, '10-lesson-done')
      p.click('.sheet [data-tab="learn"]'); p.wait_for_timeout(200)
      ok('목록에서 1강 완료·2강 열림', p.locator('.lesson.fin').count() == 1 and p.locator('button.lesson').count() == 2)
      shot(p, '11-lesson-list')
      # 3강 숨구멍 찾기 (1·2강을 끝낸 상태로 만들고 확인)
      p.evaluate("localStorage.setItem('baduk-lessons', JSON.stringify({v:1, done:[1,2]}))")
      p.click('.tabbar [data-tab="home"]'); p.wait_for_timeout(100)
      p.click('.tabbar [data-tab="learn"]'); p.wait_for_timeout(200)
      p.click('[data-action="lesson-open"][data-id="3"]'); p.wait_for_timeout(300)
      nxt()
      ok('3강은 5줄 작은 바둑판', p.locator('.lesson-screen .board-svg').get_attribute('aria-label') == '5줄 바둑판')
      tap_point(p, 3, 3, size=5, board='.lesson-screen .board-svg')
      ok('대각선은 숨구멍 아님', p.locator('.feedback.no').count() == 1)
      for x, y in [(2, 1), (1, 2), (3, 2), (2, 3)]:
          tap_point(p, x, y, size=5, board='.lesson-screen .board-svg')
      ok('숨구멍 4개 다 찾기', '4개' in p.locator('.feedback.ok').inner_text())
      shot(p, '12-lesson3-libs')
      p.click('[data-action="lesson-exit"]'); p.wait_for_timeout(200)
      # 설정
      p.click('.tabbar [data-tab="home"]'); p.wait_for_timeout(100)
      p.click('[data-action="settings"]'); p.wait_for_timeout(150)
      p.click('[data-action="toggle-voice"]'); p.wait_for_timeout(100)
      ok('읽어 주기 끄기 저장', p.evaluate("JSON.parse(localStorage.getItem('baduk-settings')).voice") is False)
      p.click('[data-action="toggle-voice"]'); p.wait_for_timeout(100)
      # 이름 바꾸기 — 받침 있는 이름은 '~이로 부를까요?' 버튼, 미리보기 조사, 저장 후 화면 전체에 반영
      p.click('[data-action="names-open"]'); p.wait_for_timeout(150)
      p.fill('.name-input[data-who="black"]', '민준'); p.wait_for_timeout(100)
      ok('받침 있는 이름은 ~이 추천', p.locator('[data-action="name-call"][data-who="black"]').count() == 1)
      ok('미리보기 조사 맞춤', p.locator('#name-preview').inner_text().startswith('민준이 하양이를'), p.locator('#name-preview').inner_text())
      p.click('[data-action="name-call"][data-who="black"]'); p.wait_for_timeout(150)
      ok('추천 누르면 민준이', p.locator('.name-input[data-who="black"]').input_value() == '민준이')
      p.fill('.name-input[data-who="white"]', '아빠'); p.wait_for_timeout(100)
      shot(p, '13-names')
      p.click('[data-action="names-save"]'); p.wait_for_timeout(150)
      ok('이름 저장', p.evaluate("JSON.parse(localStorage.getItem('baduk-settings')).names") == {'black': '민준이', 'white': '아빠'})
      ok('설정에 새 이름', '민준이 · 아빠' in p.locator('.name-now').inner_text())
      p.click('.sheet [data-action="close-sheet"]'); p.wait_for_timeout(100)
      p.click('[data-action="open-start"][data-mode="normal"]'); p.wait_for_timeout(150)
      sheet = p.locator('.sheet').inner_text()
      ok('시작 시트에 새 이름', '아빠와 진짜 바둑' in sheet and '하양이' not in sheet, sheet[:80])
      p.click('.sheet-backdrop', position={'x': 10, 'y': 10}); p.wait_for_timeout(100)
      p.click('[data-action="settings"]'); p.wait_for_timeout(150)
      p.click('[data-action="names-open"]'); p.wait_for_timeout(150)
      ok('이름 화면엔 원래 이름 그대로', p.locator('.name-input[data-who="black"]').input_value() == '민준이')
      p.click('[data-action="names-reset"]'); p.wait_for_timeout(100)
      p.click('[data-action="names-save"]'); p.wait_for_timeout(150)
      ok('원래 이름으로', 'names' not in p.evaluate("JSON.parse(localStorage.getItem('baduk-settings'))"))
      p.click('.sheet [data-action="close-sheet"]'); p.wait_for_timeout(100)

      # 4~6강 — 1~3강을 끝낸 상태로 만들고 핵심 단계만 진행 (7줄 바둑판)
      p.evaluate("localStorage.setItem('baduk-lessons', JSON.stringify({v: 1, done: [1, 2, 3]}))")
      p.click('.tabbar [data-tab="home"]'); p.wait_for_timeout(150)
      p.click('[data-action="open-start"][data-mode="capture"]'); p.wait_for_timeout(150)
      ok('6강 전에는 배우기 안내', p.locator('.sheet .nudge').count() == 1)
      p.click('.sheet .nudge [data-action="lesson-open"]'); p.wait_for_timeout(300)
      ok('안내에서 4강으로', '단수' in p.locator('.bar h1').inner_text())
      ok('4강은 7줄 바둑판', p.locator('.lesson-screen .board-svg').get_attribute('aria-label') == '7줄 바둑판')
      LB = '.lesson-screen .board-svg'
      def t7(x, y):
          tap_point(p, x, y, size=7, board=LB)
      def choose(i):
          p.click('[data-action="lesson-choose"][data-i="%d"]' % i); p.wait_for_timeout(150)
      def nxt_lesson():
          p.click('.sheet [data-action="lesson-open"]'); p.wait_for_timeout(300)
      nxt(); nxt(); choose(0); nxt()
      t7(4, 5)
      ok('4강: 단수 아닌 돌은 오답', p.locator('.feedback.no').count() == 1)
      t7(1, 1); t7(5, 1)
      ok('4강: 단수 돌 모두 찾기', p.locator('.feedback.ok').count() == 1)
      shot(p, '13-lesson4-find')
      nxt(); t7(4, 3)
      ok('4강: 단수 만들기', p.locator('.feedback.ok').count() == 1)
      nxt(); nxt(); choose(0); nxt()
      nxt_lesson()
      nxt(); t7(3, 4)
      ok('5강: 마지막 숨구멍 막아 잡기(돌이 사라짐)', p.locator('.feedback.ok').count() == 1 and p.locator(LB + ' circle[fill="url(#gw)"]').count() == 0)
      shot(p, '14-lesson5-capture')
      nxt(); t7(1, 1)
      ok('5강: 엉뚱한 곳은 오답', p.locator('.feedback.no').count() == 1)
      t7(0, 1); nxt(); t7(5, 3); nxt(); nxt()
      choose(1); ok('5강: 둘러싸인 곳은 놓을 수 없음', p.locator('.feedback.ok').count() == 1); nxt()
      choose(0); ok('5강: 잡는 수는 놓을 수 있음', p.locator('.feedback.ok').count() == 1); nxt()
      nxt_lesson()
      nxt(); t7(3, 1)
      ok('6강: 도망가기(숨구멍 쪽이 아니면 오답)', p.locator('.feedback.no').count() == 1)
      t7(3, 4); nxt()
      for x, y in [(2, 4), (4, 4), (3, 5)]:
          t7(x, y)
      nxt(); t7(3, 1)
      ok('6강: 잡아서 살리기', p.locator('.feedback.ok').count() == 1)
      nxt(); shot(p, '15-lesson6-ladder'); nxt(); choose(0); nxt()
      ok('6강 끝나면 7강으로', p.locator('.sheet [data-action="lesson-open"][data-id="7"]').count() == 1)
      ok('6강 끝나면 연습 문제 버튼', p.locator('.sheet [data-action="practice-open"]').count() == 1)
      nxt_lesson()
      # 7강 이어 주기와 끊기
      nxt(); nxt(); t7(3, 3)
      ok('7강: 이어 주기', p.locator('.feedback.ok').count() == 1)
      nxt(); nxt(); t7(2, 2)
      ok('7강: 끊는 자리가 아니면 오답', p.locator('.feedback.no').count() == 1)
      t7(3, 3); ok('7강: 끊기', p.locator('.feedback.ok').count() == 1)
      nxt(); choose(0); nxt()
      nxt_lesson()
      # 8강 내 집
      ok('8강 제목은 내 집', '내 집' in p.locator('.bar h1').inner_text())
      ok('8강: 집 표시(네모)', p.locator(LB + ' rect[rx="2"]').count() > 0)
      nxt(); t7(5, 5)
      ok('8강: 집이 아닌 곳은 오답', p.locator('.feedback.no').count() == 1)
      for x, y in [(0, 0), (1, 0), (0, 1), (1, 1)]:
          t7(x, y)
      ok('8강: 까망이 집 4곳 찾기', '4개' in p.locator('.feedback.ok').inner_text())
      shot(p, '16-lesson8-territory')
      nxt(); choose(1); ok('8강: 집 4개', p.locator('.feedback.ok').count() == 1)
      nxt(); nxt(); choose(0); ok('8강: 까망이 집이 더 많음', p.locator('.feedback.ok').count() == 1)
      nxt(); nxt()
      nxt_lesson()
      # 9강 두 개의 눈
      nxt(); choose(0); nxt(); nxt(); choose(1); nxt()
      t7(0, 0); ok('9강: 눈이 하나로 이어지면 오답', p.locator('.feedback.no').count() == 1)
      t7(0, 1); ok('9강: 눈 두 개 만들기', p.locator('.feedback.ok').count() == 1)
      shot(p, '17-lesson9-live')
      nxt(); choose(1); nxt()
      nxt_lesson()
      # 10강 되따기 금지
      nxt(); t7(3, 3); ok('10강: 따내기', p.locator('.feedback.ok').count() == 1)
      nxt(); choose(1); ok('10강: 바로 되따기는 안 됨', p.locator('.feedback.ok').count() == 1)
      nxt(); nxt(); choose(0); ok('10강: 한 번씩 두고 나면 됨', p.locator('.feedback.ok').count() == 1)
      nxt(); choose(0); nxt()
      nxt_lesson()
      # 11강 끝내기와 세기
      nxt(); nxt(); t7(0, 1); ok('11강: 집 안 하양이 돌 잡기', p.locator('.feedback.ok').count() == 1)
      nxt(); nxt(); choose(1); ok('11강: 돌+집 28점', '28점' in p.locator('.feedback.ok').inner_text())
      nxt(); nxt()
      nxt_lesson()
      # 12강 첫 바둑 한 판
      ok('12강은 9줄 바둑판', p.locator('.lesson-screen .board-svg').get_attribute('aria-label') == '9줄 바둑판')
      nxt(); nxt(); choose(0); nxt(); choose(0); nxt(); nxt()
      ok('12강 끝나면 진짜 바둑으로', p.locator('.sheet [data-action="open-start"][data-mode="normal"]').count() == 1)
      p.click('.sheet [data-action="open-start"][data-mode="normal"]'); p.wait_for_timeout(200)
      ok('진짜 바둑 시작 시트', '진짜 바둑' in p.locator('.sheet h2').inner_text() and p.locator('.sheet .nudge').count() == 0)
      p.click('.sheet [data-action="close-sheet"]'); p.wait_for_timeout(100)

      # 홈의 두 놀이 카드는 같은 크기
      cb = p.locator('.play-card.capture').bounding_box(); nb = p.locator('.play-card.normal').bounding_box()
      ok('따내기·진짜 바둑 카드 크기가 같음', abs(cb['width'] - nb['width']) < 2 and abs(cb['height'] - nb['height']) < 2, (cb, nb))

      # 진짜 바둑 13줄: 판 크기 고르기 → 13줄 판으로 시작
      p.click('.play-card.normal'); p.wait_for_timeout(150)
      ok('진짜 바둑 판 크기 9·13줄 고르기', p.locator('[data-action="normal-size"]').count() == 2)
      p.click('[data-action="normal-size"][data-size="13"]'); p.wait_for_timeout(100)
      p.click('[data-action="start"]'); p.wait_for_timeout(300)
      if p.locator('[data-action="close-rules"]').count(): p.click('[data-action="close-rules"]'); p.wait_for_timeout(150)
      ok('13줄 바둑판으로 시작', p.locator('.game .board-svg').get_attribute('aria-label') == '13줄 바둑판', p.locator('.game .board-svg').get_attribute('aria-label'))
      tb = p.locator('.tools').bounding_box()
      ok('13줄도 도구까지 한 화면', tb['y'] + tb['height'] <= p.evaluate('innerHeight') + 1)
      shot(p, '17b-real-13')
      tap_point(p, 6, 6, size=13); p.click('[data-action="confirm"]'); p.wait_for_timeout(1500)
      ok('13줄에서 하양이가 둠', p.evaluate("JSON.parse(localStorage.getItem('baduk-current-game')).moves.length") >= 2)
      p.click('[data-action="exit-game"]'); p.wait_for_timeout(200)
      ok('홈에 하던 13줄 판 표시', '13줄' in p.locator('.play-card.normal').inner_text())

      # 하양이 기권: 바로 끝내지 않고 '받을래요 / 끝까지 둘래요'를 묻는다 (크게 진 13줄 판에서 이어 두기)
      lost = ['.....X.OOX...', '.....X.OXXX..', '..XXXOOOOXX..', '...OXXXXX..X.', '..XXX...XX.XX', '..XOO....X..X',
              '..XXO.OXXXXXO', '..X.X.XXOOXX.', '.OX.X.XOOOOX.', '.XXX.X.OOXX..', '..X...XOXX...', '.OXXXXXOOX..O', '.O.....XXX...']
      board = [{'.': 0, 'X': 1, 'O': 2}[c] for row in lost for c in row]
      p.evaluate("""b => localStorage.setItem('baduk-current-game', JSON.stringify({v: 1, setup: {board: b, toMove: 2}, mode: 'normal', size: 13, level: 1, captureTarget: 1, moves: [], savedAt: ''}))""", board)
      p.evaluate("localStorage.setItem('baduk-seen-normal-rules', 'true')")
      p.reload(); p.wait_for_timeout(400)
      p.click('.play-card.normal'); p.wait_for_timeout(150)
      p.click('[data-action="resume"]'); p.wait_for_timeout(2500)
      offered = p.locator('[data-action="resign-accept"]').count() == 1
      for x, y in [(0, 0), (1, 0), (0, 1), (12, 12), (11, 12), (12, 11), (0, 12)]:
          if offered: break
          tap_point(p, x, y, size=13)
          if p.locator('[data-action="confirm"]').count() and p.locator('[data-action="confirm"]').is_enabled():
              p.click('[data-action="confirm"]'); p.wait_for_timeout(2500)
              offered = p.locator('[data-action="resign-accept"]').count() == 1
      ok('하양이 기권은 먼저 묻기', offered)
      shot(p, '17c-resign-offer')
      p.click('[data-action="resign-decline"]'); p.wait_for_timeout(1500)
      ok('더 둘래요 → 판이 이어짐', p.locator('.sheet').count() == 0 and p.locator('.game .board-svg').count() == 1)
      p.click('[data-action="exit-game"]'); p.wait_for_timeout(200)
      p.evaluate("""b => localStorage.setItem('baduk-current-game', JSON.stringify({v: 1, setup: {board: b, toMove: 2}, mode: 'normal', size: 13, level: 1, captureTarget: 1, moves: [], savedAt: ''}))""", board)
      p.reload(); p.wait_for_timeout(400)
      p.click('.play-card.normal'); p.wait_for_timeout(150)
      p.click('[data-action="resume"]'); p.wait_for_timeout(2500)
      offered = p.locator('[data-action="resign-accept"]').count() == 1
      for x, y in [(0, 0), (1, 0), (0, 1), (12, 12), (11, 12), (12, 11), (0, 12)]:
          if offered: break
          tap_point(p, x, y, size=13)
          if p.locator('[data-action="confirm"]').count() and p.locator('[data-action="confirm"]').is_enabled():
              p.click('[data-action="confirm"]'); p.wait_for_timeout(2500)
              offered = p.locator('[data-action="resign-accept"]').count() == 1
      p.click('[data-action="resign-accept"]'); p.wait_for_timeout(300)
      ok('받을래요 → 이겼어요 결과', '이겼어요' in p.locator('.sheet .result-title').inner_text(), p.locator('.sheet').inner_text()[:60] if p.locator('.sheet').count() else '')
      p.click('[data-action="go-home"]'); p.wait_for_timeout(200)

      # 진짜 바둑: 집 경계가 다 정해진 판을 이어서 두고, 넘기기 → 하양이도 넘김 → 집 세기 → 더 두기 → 끝내기
      moves = []
      for y in range(9):
          moves += [y * 9 + 3, y * 9 + 4]
      p.evaluate("""m => localStorage.setItem('baduk-current-game', JSON.stringify({v: 1, mode: 'normal', size: 9, level: 3, captureTarget: 1, moves: m, savedAt: ''}))""", moves)
      p.evaluate("localStorage.setItem('baduk-seen-normal-rules', 'true')")
      p.reload(); p.wait_for_timeout(400)
      ok('홈에 진짜 바둑 카드(하던 판 표시)', '하던' in p.locator('.play-card.normal').inner_text())
      p.click('.play-card.normal'); p.wait_for_timeout(150)
      p.click('[data-action="resume"]'); p.wait_for_timeout(300)
      ok('진짜 바둑 화면(넘기기 버튼 포함 도구 5개)', '진짜 바둑' in p.locator('.bar h1').inner_text() and p.locator('.tools button').count() == 5)
      vh = p.evaluate('innerHeight')
      tb = p.locator('.tools').bounding_box()
      ok('진짜 바둑도 도구까지 한 화면', tb['y'] + tb['height'] <= vh + 1, (tb, vh))
      shot(p, '18-real-game')
      p.click('[data-action="ask-pass"]'); p.wait_for_timeout(150)
      p.click('[data-action="pass"]'); p.wait_for_timeout(1200)
      ok('둘 다 넘기면 집 세기 화면', p.locator('.score-table').count() == 1)
      ok('집 세기: 까망이 36점, 하양이 52점(덤 7)', '36' in p.locator('.score-table').inner_text() and '52' in p.locator('.score-table').inner_text(), p.locator('.score-table').inner_text() if p.locator('.score-table').count() else '')
      shot(p, '19-score')
      ok('집 세기: 죽은 돌 없음 안내', '죽은 돌(사석)이 없어요' in p.locator('.sheet').inner_text())
      p.locator('.score-board').scroll_into_view_if_needed(); p.wait_for_timeout(150)
      tap_point(p, 3, 4, size=9, board='.score-board .board-svg')
      ok('돌을 누르면 죽은 돌로 바뀌고 점수가 다시 계산됨', '까망이 9개' in p.locator('.sheet').inner_text() and '36' not in p.locator('.score-table').inner_text(), p.locator('.score-table').inner_text())
      shot(p, '19b-score-dead')
      # 집 세기 화면에서 앱을 닫았다 열어도 판과 고른 죽은 돌이 남아 있음
      p.reload(); p.wait_for_timeout(400)
      ok('집 세기 중 앱을 닫아도 하던 판이 남음', '하던' in p.locator('.play-card.normal').inner_text())
      p.click('.play-card.normal'); p.wait_for_timeout(150)
      ok('새로 시작하면 하던 판이 지워진다고 안내', '지워져요' in p.locator('.sheet').inner_text())
      p.click('[data-action="resume"]'); p.wait_for_timeout(400)
      ok('이어서 하면 집 세기 화면 + 고른 죽은 돌 그대로', p.locator('.score-table').count() == 1 and '까망이 9개' in p.locator('.sheet').inner_text(), p.locator('.sheet').inner_text() if p.locator('.sheet').count() else '')
      p.locator('.score-board').scroll_into_view_if_needed(); p.wait_for_timeout(150)
      tap_point(p, 3, 4, size=9, board='.score-board .board-svg')
      ok('다시 누르면 산 돌로 돌아옴', '36' in p.locator('.score-table').inner_text() and '52' in p.locator('.score-table').inner_text())
      p.click('[data-action="resume-play"]'); p.wait_for_timeout(200)
      ok('더 둘래요 → 다시 까망이 차례', p.locator('.sheet').count() == 0 and not p.locator('[data-action="ask-pass"]').is_disabled())
      p.click('[data-action="ask-pass"]'); p.wait_for_timeout(150)
      p.click('[data-action="pass"]'); p.wait_for_timeout(1200)
      p.click('[data-action="finish-score"]'); p.wait_for_timeout(200)
      ok('끝내면 결과 시트', p.locator('.result-title').count() == 1)
      p.click('[data-action="go-home"]'); p.wait_for_timeout(150)

      # 문제 놀이: 강을 끝낸 만큼 연습이 열리고, 5문제를 풀면 끝
      p.evaluate("localStorage.setItem('baduk-lessons', JSON.stringify({v: 1, done: [1, 2, 3, 4, 5]}))")
      p.reload(); p.wait_for_timeout(400)
      p.click('.tabbar [data-tab="puzzle"]'); p.wait_for_timeout(200)
      ok('문제 놀이: 4·5강 연습만 열림', p.locator('[data-action="practice-open"]').count() == 2 and p.locator('.lessons .locked').count() == 4)
      shot(p, '20-puzzle-list')
      p.click('[data-action="practice-open"][data-i="1"]'); p.wait_for_timeout(300)
      ok('연습 화면 제목', '연습' in p.locator('.bar h1').inner_text())
      solved = 0
      for k in range(5):
          for q in range(49):
              tap_point(p, q % 7, q // 7, size=7, board='.lesson-screen .board-svg')
              close_key(p)
              if not p.locator('[data-action="lesson-next"]').is_disabled():
                  break
          if not p.locator('[data-action="lesson-next"]').is_disabled():
              solved += 1
              if k == 0: shot(p, '21-practice-solved')
              p.click('[data-action="lesson-next"]'); p.wait_for_timeout(250)
      ok('연습 5문제 다 풀기', solved == 5 and p.locator('.sheet .result-title').count() == 1, solved)
      ok('연습은 강의 진도에 안 들어감', p.evaluate("JSON.parse(localStorage.getItem('baduk-lessons')).done.length") == 5)
      ok('연습 횟수 저장', p.evaluate("JSON.parse(localStorage.getItem('baduk-practice')).done.capture") == 1)
      plog = p.evaluate("JSON.parse(localStorage.getItem('baduk-practice-log') || '{}')")
      ok('문제 기록: 오늘 잡기 5문제(한 번에 맞힌 수 포함)', sum(d.get('capture', [0, 0])[0] for d in plog.values()) == 5 and all(0 <= d['capture'][1] <= d['capture'][0] for d in plog.values() if 'capture' in d), plog)
      p.click('.sheet [data-action="tab"][data-tab="puzzle"]'); p.wait_for_timeout(200)
      ok('목록에 한 번 했어요 표시', '1번 했어요' in p.locator('.lessons').inner_text())
      # 사활 연습(9강 뒤): 죽이기 5문제
      p.evaluate("localStorage.setItem('baduk-lessons', JSON.stringify({v: 1, done: [1, 2, 3, 4, 5, 6, 7, 8, 9]}))")
      p.reload(); p.wait_for_timeout(400)
      p.click('.tabbar [data-tab="puzzle"]'); p.wait_for_timeout(200)
      ok('9강 뒤 사활 연습 열림', p.locator('[data-action="practice-open"]').count() == 6)
      p.click('[data-action="practice-open"][data-i="5"]'); p.wait_for_timeout(300)
      ok('죽이기 연습 화면', '두 집 막기' in p.locator('.bar h1').inner_text())
      shot(p, '23-kill-practice')
      solved = 0
      for k in range(5):
          for q in range(49):
              tap_point(p, q % 7, q // 7, size=7, board='.lesson-screen .board-svg')
              close_key(p)
              if not p.locator('[data-action="lesson-next"]').is_disabled():
                  break
          if not p.locator('[data-action="lesson-next"]').is_disabled():
              solved += 1
              p.click('[data-action="lesson-next"]'); p.wait_for_timeout(250)
      ok('죽이기 5문제 다 풀기', solved == 5 and p.locator('.sheet .result-title').count() == 1, solved)
      p.click('.sheet [data-action="tab"][data-tab="puzzle"]'); p.wait_for_timeout(200)
      p.click('.tabbar [data-tab="home"]'); p.wait_for_timeout(200)

      # 따내기 바둑에서 까망이가 놓을 곳이 없으면(모든 빈 점이 자살수) 넘기기 버튼이 생김
      eyes = {6, 8, 16, 18}
      moves = []
      for p_ in range(25):
          if p_ in eyes: continue
          moves += [-1, p_]
      p.evaluate("m => localStorage.setItem('baduk-current-game', JSON.stringify({v: 1, mode: 'capture', size: 5, level: 1, captureTarget: 1, moves: m, savedAt: ''}))", moves)
      p.evaluate("localStorage.setItem('baduk-seen-capture-rules', 'true')")
      p.reload(); p.wait_for_timeout(400)
      p.click('.play-card.capture'); p.wait_for_timeout(150)
      p.click('[data-action="resume"]'); p.wait_for_timeout(300)
      ok('따내기 바둑: 놓을 곳이 없으면 넘기기 버튼', p.locator('[data-action="ask-pass"]').count() == 1 and '놓을 곳이 없어요' in p.locator('.guide').inner_text())
      shot(p, '21b-capture-stuck')
      p.click('[data-action="ask-pass"]'); p.wait_for_timeout(150)
      ok('따내기 바둑 넘기기 안내 문구', '비겨요' in p.locator('.sheet').inner_text())
      p.click('[data-action="pass"]'); p.wait_for_timeout(1200)
      ok('넘긴 뒤 하양이가 이어 둠', p.locator('.result-title').count() == 1 or p.evaluate("JSON.parse(localStorage.getItem('baduk-current-game')).moves.length") > len(moves) + 1)
      if p.locator('[data-action="go-home"]').count(): p.click('[data-action="go-home"]')
      else: p.click('[data-action="exit-game"]')
      p.wait_for_timeout(200)

      # 실전 → 문제: 놓친 잡기 장면이 '내 문제'가 되고, 잘한 잡기는 칭찬(하양이 (2,2)는 (2,3)이 자살수라 못 도망감)
      P5 = lambda x, y: y * 5 + x
      seq = [(1, 2), (4, 0), (2, 1), (0, 4), (3, 2), (4, 1), (1, 3), (0, 0), (3, 3), (4, 4), (2, 4), (2, 2), (0, 2)]
      p.evaluate("m => localStorage.setItem('baduk-current-game', JSON.stringify({v: 1, mode: 'capture', size: 5, level: 1, captureTarget: 1, moves: m, savedAt: ''}))", [P5(x, y) for x, y in seq])
      p.reload(); p.wait_for_timeout(400)
      p.click('.play-card.capture'); p.wait_for_timeout(150)
      p.click('[data-action="resume"]'); p.wait_for_timeout(1500)
      tap_point(p, 2, 3, size=5); p.click('[data-action="confirm"]'); p.wait_for_timeout(600)
      ok('잡아서 이기면 칭찬(잡기 1번)', p.locator('.sheet .praise').count() == 1 and '잡기' in p.locator('.sheet .praise').inner_text())
      ok('결과 화면에 놓친 장면 다시 풀기', p.locator('.sheet [data-action="scene-retry"]').count() == 1)
      shot(p, '25-result-praise-scene')
      p.click('.sheet [data-action="scene-retry"]'); p.wait_for_timeout(300)
      ok('놓친 장면 문제(그 판 그대로 5줄)', p.locator('.lesson-screen .board-svg').get_attribute('aria-label') == '5줄 바둑판' and '놓친 장면' in p.locator('.lesson-card').inner_text())
      for x, y in [(4, 2), (4, 3)]:
          tap_point(p, x, y, size=5, board='.lesson-screen .board-svg'); p.wait_for_timeout(200)
      ok('두 번 틀리면 핵심 그림(5강)', p.locator('.sheet').count() == 1 and '5강' in p.locator('.sheet').inner_text())
      shot(p, '26-key-card')
      p.click('.sheet [data-action="close-sheet"]'); p.wait_for_timeout(150)
      tap_point(p, 2, 3, size=5, board='.lesson-screen .board-svg'); p.wait_for_timeout(200)
      ok('정답을 두면 다음으로', not p.locator('[data-action="lesson-next"]').is_disabled())
      p.click('[data-action="lesson-next"]'); p.wait_for_timeout(300)
      ok('이어서 같은 기술의 새 문제(7줄)', p.locator('.lesson-screen .board-svg').get_attribute('aria-label') == '7줄 바둑판')
      p.click('[data-action="lesson-exit"]'); p.wait_for_timeout(200)
      ok('틀렸던 장면은 내가 놓친 장면에 남음', '내가 놓친 장면' in p.locator('.lessons').inner_text())
      p.click('[data-action="scenes-open"]'); p.wait_for_timeout(300)
      tap_point(p, 2, 3, size=5, board='.lesson-screen .board-svg'); p.wait_for_timeout(200)
      p.click('[data-action="lesson-next"]'); p.wait_for_timeout(300)
      ok('한 번에 맞히면 목록에서 빠짐', p.evaluate("JSON.parse(localStorage.getItem('baduk-scenes') || '[]').length") == 0)
      p.click('.sheet [data-action="tab"][data-tab="puzzle"]'); p.wait_for_timeout(150)
      p.click('.tabbar [data-tab="home"]'); p.wait_for_timeout(150)

      # 하양이 기권: 까망이 돌만 판의 절반 넘게(위 다섯 줄) 있는 9줄 판(하양이는 계속 넘김) → 두 번 더 두면 하양이가 기권
      moves = []
      for p_ in range(45):
          if p_ in (10, 13, 16): continue  # 눈 세 개(눈 없는 벽은 실제로 살아 있지 않음)
          moves += [p_, -1]
      moves = moves[:-1]
      p.evaluate("m => localStorage.setItem('baduk-current-game', JSON.stringify({v: 1, mode: 'normal', size: 9, level: 1, captureTarget: 1, moves: m.concat([-1]), savedAt: ''}))", moves)
      p.reload(); p.wait_for_timeout(400)
      p.click('.play-card.normal'); p.wait_for_timeout(150)
      p.click('[data-action="resume"]'); p.wait_for_timeout(300)
      for x, y in [(2, 6), (6, 6), (4, 7)]:
          if p.locator('[data-action="resign-accept"]').count(): break
          tap_point(p, x, y); p.click('[data-action="confirm"]'); p.wait_for_timeout(2500)
      if p.locator('[data-action="resign-accept"]').count():
          p.click('[data-action="resign-accept"]'); p.wait_for_timeout(300)
      ok('크게 지면 하양이가 기권 → 이겼어요', p.locator('.result-title').count() == 1 and '기권' in p.locator('.sheet').inner_text(), p.locator('.sheet').inner_text() if p.locator('.sheet').count() else '')
      shot(p, '22-ai-resign')
      ok('결과 화면에 복습 버튼', p.locator('.sheet [data-action="review-open"]').count() == 1)
      p.click('.sheet [data-action="review-open"]'); p.wait_for_timeout(300)
      ok('방금 판 복습 화면(아래 탭 숨김)', p.locator('.review-screen').count() == 1 and p.locator('.tabbar').count() == 0)
      p.click('[data-action="rv-last"]'); p.wait_for_timeout(150)
      ok('끝으로 가면 마지막 수', p.locator('.rv-count b').inner_text() == p.locator('.rv-seek').get_attribute('max'))
      p.click('[data-action="tab"][data-tab="record"]'); p.wait_for_timeout(200)
      ok('기록 탭에 지난 판 목록', p.locator('[data-action="review-open"]').count() >= 1)
      ok('기록 목록에 하양이 단계', '★ 쉬워요' in p.locator('.lessons').inner_text())

      # 복습: 놓친 장면(잡을 수 있었는데 다른 곳에 둠) — 5줄 따내기 바둑 기록을 직접 넣고 확인
      P = lambda x, y: y * 5 + x
      rec = {'v': 1, 'id': 1, 'mode': 'capture', 'size': 5, 'level': 1, 'captureTarget': 3,
             'moves': [P(1, 2), P(4, 4), P(2, 1), P(4, 3), P(3, 2), P(2, 2), P(0, 0)],
             'outcome': 'loss', 'reason': 'resign', 'summary': '까망이 그만하기', 'endedAt': '2026-10-21T02:00:00.000Z'}
      p.evaluate("r => localStorage.setItem('baduk-history', JSON.stringify([r]))", rec)
      p.reload(); p.wait_for_timeout(400)
      p.click('.tabbar [data-tab="record"]'); p.wait_for_timeout(200)
      ok('기록 목록에 놓친 장면 수', '놓친 장면 1개' in p.locator('.lessons').inner_text())
      p.click('[data-action="review-open"][data-id="1"]'); p.wait_for_timeout(300)
      p.click('[data-action="rv-mistake"][data-dir="1"]'); p.wait_for_timeout(200)
      ok('다음 장면 → 잡을 수 있었어요 + 5강 다시 보기', '잡을 수 있었어요' in p.locator('.review-card').inner_text() and p.locator('.side [data-action="lesson-open"][data-id="5"]').count() == 1)
      ok('6수까지 둔 판에서 장면 표시', p.locator('.rv-count b').inner_text() == '6')
      shot(p, '24-review-mistake')
      p.locator('.rv-seek').fill('2'); p.wait_for_timeout(150)
      ok('슬라이더로 2수까지', p.locator('.rv-count b').inner_text() == '2')
      p.click('[data-action="tab"][data-tab="record"]'); p.wait_for_timeout(150)
      p.click('.tabbar [data-tab="home"]'); p.wait_for_timeout(150)

      # 보호자용 설정
      p.click('[data-action="settings"]'); p.wait_for_timeout(150)
      p.click('[data-action="rate"][data-rate="slow"]'); p.wait_for_timeout(100)
      ok('읽어 주기 천천히 저장', p.evaluate("JSON.parse(localStorage.getItem('baduk-settings')).rate") == 'slow')
      # 보호자용 기록 요약: 판 크기·단계별 대국, 도와줘·되돌리기, 문제 놀이 정답 비율
      p.click('details.parent summary'); p.wait_for_timeout(100)
      p.click('[data-action="summary-open"]'); p.wait_for_timeout(200)
      ok('보호자 기록 요약 열림', '기록 요약' in p.locator('.sheet h2').inner_text())
      ok('요약: 판 크기·단계별 대국 줄 여러 개', p.locator('.sheet .sum-table').first.locator('tbody tr').count() >= 2)
      txt = p.locator('.sheet').inner_text()
      ok('요약: 도와줘·되돌리기 판마다', '판마다 도와줘' in txt, txt[:200])
      ok('요약: 문제 놀이 기술별(잡기·두 집 막기)', '한 수로 잡기' in txt and '두 집 막기' in txt, txt[-400:])
      shot(p, '27-summary')
      p.click('[data-action="summary-days"][data-days="0"]'); p.wait_for_timeout(150)
      ok('요약: 전체 기간 고르기', p.locator('[data-action="summary-days"][data-days="0"]').get_attribute('aria-checked') == 'true')
      p.click('.sheet [data-action="close-sheet"]'); p.wait_for_timeout(100)
      ok('요약 닫기', p.locator('.sheet').count() == 0)
      p.click('[data-action="settings"]'); p.wait_for_timeout(150)
      p.click('details.parent summary'); p.click('[data-action="ask-reset-lessons"]'); p.wait_for_timeout(100)
      p.click('[data-action="reset-lessons"]'); p.wait_for_timeout(150)
      ok('강의 처음부터', p.evaluate("localStorage.getItem('baduk-lessons')") is None)

      # 아이폰: history API 미사용
      ok('아이폰에서 방문기록을 쌓지 않음', p.evaluate('history.length') <= 2, p.evaluate('history.length'))
      ok('스크립트 오류 없음', not errors, errors)

      # 가로 넘침 없음
      ok('가로 스크롤 없음', p.evaluate('document.documentElement.scrollWidth <= innerWidth'))
      ctx.close()
    b.close()

srv.shutdown()
print('\n실패 %d건' % len(fails) if fails else '\n모두 통과')
sys.exit(1 if fails else 0)

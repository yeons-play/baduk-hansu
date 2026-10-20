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

      p.click('[data-action="open-start"]')
      p.wait_for_timeout(200)
      shot(p, '2-start-sheet')
      ok('시작 시트 열림', '따내기 바둑' in p.locator('.sheet h2').inner_text())
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
      # 백돌이가 무작위로 두므로 비어 있는 곳을 골라 시도
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
      ok('홈 버튼이 이어서 두기로 바뀜', '이어서' in p.locator('[data-action="open-start"]').inner_text())
      p.reload()
      p.wait_for_timeout(500)
      p.click('[data-action="open-start"]')
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
      tap_point(p, 5, 5, board='.lesson-screen .board-svg')
      ok('대각선은 숨구멍 아님', p.locator('.feedback.no').count() == 1)
      for x, y in [(4, 3), (3, 4), (5, 4), (4, 5)]:
          tap_point(p, x, y, board='.lesson-screen .board-svg')
      ok('숨구멍 4개 다 찾기', '4개' in p.locator('.feedback.ok').inner_text())
      shot(p, '12-lesson3-libs')
      p.click('[data-action="lesson-exit"]'); p.wait_for_timeout(200)
      # 설정
      p.click('.tabbar [data-tab="home"]'); p.wait_for_timeout(100)
      p.click('[data-action="settings"]'); p.wait_for_timeout(150)
      p.click('[data-action="toggle-voice"]'); p.wait_for_timeout(100)
      ok('읽어 주기 끄기 저장', p.evaluate("JSON.parse(localStorage.getItem('baduk-settings')).voice") is False)
      p.click('[data-action="toggle-voice"]'); p.wait_for_timeout(100)
      p.click('.sheet [data-action="close-sheet"]'); p.wait_for_timeout(100)

      # 4~6강 — 1~3강을 끝낸 상태로 만들고 핵심 단계만 진행
      p.evaluate("localStorage.setItem('baduk-lessons', JSON.stringify({v: 1, done: [1, 2, 3]}))")
      p.click('.tabbar [data-tab="home"]'); p.wait_for_timeout(150)
      p.click('[data-action="open-start"]'); p.wait_for_timeout(150)
      ok('6강 전에는 배우기 안내', p.locator('.sheet .nudge').count() == 1)
      p.click('.sheet .nudge [data-action="lesson-open"]'); p.wait_for_timeout(300)
      ok('안내에서 4강으로', '단수' in p.locator('.bar h1').inner_text())
      LB = '.lesson-screen .board-svg'
      def choose(i):
          p.click('[data-action="lesson-choose"][data-i="%d"]' % i); p.wait_for_timeout(150)
      nxt(); nxt(); choose(0); nxt()
      tap_point(p, 6, 6, board=LB)
      ok('4강: 단수 아닌 돌은 오답', p.locator('.feedback.no').count() == 1)
      tap_point(p, 2, 2, board=LB); tap_point(p, 6, 2, board=LB)
      ok('4강: 단수 돌 모두 찾기', p.locator('.feedback.ok').count() == 1)
      shot(p, '13-lesson4-find')
      nxt(); tap_point(p, 5, 4, board=LB)
      ok('4강: 단수 만들기', p.locator('.feedback.ok').count() == 1)
      nxt(); nxt(); choose(0); nxt()
      p.click('.sheet [data-action="lesson-open"]'); p.wait_for_timeout(300)
      nxt(); tap_point(p, 4, 5, board=LB)
      ok('5강: 마지막 숨구멍 막아 잡기(돌이 사라짐)', p.locator('.feedback.ok').count() == 1 and p.locator(LB + ' circle[fill="url(#gw)"]').count() == 0)
      shot(p, '14-lesson5-capture')
      nxt(); tap_point(p, 1, 1, board=LB)
      ok('5강: 엉뚱한 곳은 오답', p.locator('.feedback.no').count() == 1)
      tap_point(p, 0, 1, board=LB); nxt(); tap_point(p, 6, 4, board=LB); nxt(); nxt()
      choose(1); ok('5강: 둘러싸인 곳은 놓을 수 없음', p.locator('.feedback.ok').count() == 1); nxt()
      choose(0); ok('5강: 잡는 수는 놓을 수 있음', p.locator('.feedback.ok').count() == 1); nxt()
      p.click('.sheet [data-action="lesson-open"]'); p.wait_for_timeout(300)
      nxt(); tap_point(p, 4, 2, board=LB)
      ok('6강: 도망가기(숨구멍 쪽이 아니면 오답)', p.locator('.feedback.no').count() == 1)
      tap_point(p, 4, 5, board=LB); nxt()
      for x, y in [(3, 5), (5, 5), (4, 6)]:
          tap_point(p, x, y, board=LB)
      nxt(); tap_point(p, 4, 2, board=LB)
      ok('6강: 잡아서 살리기', p.locator('.feedback.ok').count() == 1)
      nxt(); shot(p, '15-lesson6-ladder'); nxt(); choose(0); nxt()
      ok('6강 끝나면 따내기 바둑으로', p.locator('.sheet [data-action="open-start"]').count() == 1)
      p.click('.sheet [data-action="open-start"]'); p.wait_for_timeout(150)
      ok('6강 뒤에는 안내 없음', p.locator('.sheet .nudge').count() == 0)
      p.click('[data-action="target"][data-target="2"]'); p.wait_for_timeout(100)
      p.click('[data-action="start"]'); p.wait_for_timeout(300)
      ok('잡을 돌 2개로 시작', '2개' in p.locator('.goal').inner_text())
      p.click('[data-action="exit-game"]'); p.wait_for_timeout(150)
      # 보호자용 설정
      p.click('[data-action="settings"]'); p.wait_for_timeout(150)
      p.click('[data-action="rate"][data-rate="slow"]'); p.wait_for_timeout(100)
      ok('읽어 주기 천천히 저장', p.evaluate("JSON.parse(localStorage.getItem('baduk-settings')).rate") == 'slow')
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

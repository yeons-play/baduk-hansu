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
fails = []


def ok(name, cond, info=''):
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else '  → ' + str(info)))
    if not cond:
        fails.append(name)


def shot(p, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        p.screenshot(path=os.path.join(SHOTS, name + '.png'))


def tap_point(p, x, y, size=9):
    box = p.locator('.game .board-svg').bounding_box()
    M, VB = 28, 400
    st = (VB - 2 * M) / (size - 1)
    sx = box['x'] + (M + st * x) * box['width'] / VB
    sy = box['y'] + (M + st * y) * box['height'] / VB
    p.mouse.click(sx, sy)
    p.wait_for_timeout(150)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(user_agent=IOS, viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
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
    ok('시작 시트 열림', p.locator('.sheet h2').inner_text() == '따내기 바둑')
    p.click('[data-action="start"]')
    p.wait_for_timeout(300)
    ok('첫 대국은 규칙 안내가 먼저 나옴', p.locator('.sheet h2').inner_text() == '따내기 바둑 규칙')
    shot(p, '3-rules')
    p.click('[data-action="close-rules"]')
    p.wait_for_timeout(200)
    ok('대국 화면에서 아래 탭 숨김', p.locator('.tabbar').count() == 0)

    tap_point(p, 4, 4)
    ok('첫 터치는 미리보기', p.locator('.confirm').count() == 1)
    shot(p, '4-preview')
    p.click('[data-action="confirm"]')
    p.wait_for_timeout(1000)
    stones = p.evaluate("document.querySelectorAll('.game .board-svg circle[fill^=\"url(#g\"]').length")
    ok('착수 후 AI가 응수 (돌 2개)', stones == 2, stones)

    # 같은 곳 두 번 누르기로 착수
    tap_point(p, 2, 2)
    tap_point(p, 2, 2)
    p.wait_for_timeout(1000)
    stones = p.evaluate("document.querySelectorAll('.game .board-svg circle[fill^=\"url(#g\"]').length")
    ok('같은 곳 두 번 누르면 착수', stones == 4, stones)

    # 이미 돌이 있는 곳
    tap_point(p, 4, 4)
    ok('돌 있는 곳 누르면 안내', '이미 돌이' in (p.locator('.toast').inner_text() if p.locator('.toast').count() else ''))

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
    ok('배우기 12강 목록', p.locator('.lesson').count() == 12)
    shot(p, '7-learn')

    # 아이폰: history API 미사용
    ok('아이폰에서 방문기록을 쌓지 않음', p.evaluate('history.length') <= 2, p.evaluate('history.length'))
    ok('스크립트 오류 없음', not errors, errors)

    # 가로 넘침 없음
    ok('가로 스크롤 없음', p.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    b.close()

srv.shutdown()
print('\n실패 %d건' % len(fails) if fails else '\n모두 통과')
sys.exit(1 if fails else 0)

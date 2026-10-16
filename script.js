const widthLabel = document.querySelector('#viewport-width');
const deviceLabel = document.querySelector('#device-type');
const columnLabel = document.querySelector('#column-count');
const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
const themeButton = document.querySelector('#theme-toggle');

function updateViewport() {
  const width = window.innerWidth;
  widthLabel.textContent = width.toLocaleString('ko-KR');
  deviceLabel.textContent = width < 640 ? '모바일' : width < 1024 ? '태블릿' : '데스크톱';
  columnLabel.textContent = width < 640 ? '1' : width < 1024 ? '2' : '3';
  if (width >= 640) closeMenu();
}
function closeMenu() {
  navigation.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', '메뉴 열기');
}
menuButton.addEventListener('click', () => {
  const open = navigation.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
});
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navigation.classList.contains('open')) {
    closeMenu();
    menuButton.focus();
  }
});
document.addEventListener('click', event => {
  if (!navigation.contains(event.target) && !menuButton.contains(event.target)) closeMenu();
});
function applyTheme(dark) {
  document.body.classList.toggle('dark', dark);
  themeButton.setAttribute('aria-pressed', String(dark));
  themeButton.innerHTML = `${dark ? '라이트 모드' : '다크 모드'} <span aria-hidden="true">◐</span>`;
  document.querySelector('meta[name="theme-color"]').content = dark ? '#171820' : '#f7f8fa';
}
let savedTheme;
try { savedTheme = localStorage.getItem('flex-theme'); } catch { /* 저장을 허용하지 않는 브라우저에서도 동작합니다. */ }
applyTheme(savedTheme ? savedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
themeButton.addEventListener('click', () => {
  const dark = !document.body.classList.contains('dark');
  applyTheme(dark);
  try { localStorage.setItem('flex-theme', dark ? 'dark' : 'light'); } catch { /* 현재 탭의 테마는 유지합니다. */ }
});
window.addEventListener('resize', updateViewport);
updateViewport();

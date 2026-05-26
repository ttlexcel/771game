/* ==============================================
   난사데이 v2 — script.js
   - URL 입력 → Claude API로 기여도 파싱
   - 무기 사용/남은 갯수 동시 표시
   - 사용한 무기만큼 기여도 차감
   ============================================== */

// ── 전역 상태 ──────────────────────────────────
let weapons       = [];
let members       = [];
let memberState   = {};
// memberState[name] = {
//   basePoints: number,       // 크롤링/수동 입력된 원래 기여도
//   remaining:  number,       // 현재 남은 기여도 (무기 사용 시 차감)
//   usedWeapons: { 무기명: number },  // 사용한 무기 수
//   remainingWeapons: { 무기명: number } // 남은 무기 수 (remaining 기준)
// }

let crawledData   = null; // { 멤버명: 기여도값 } 파싱 결과 임시 저장

// ── DOMContentLoaded ─────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    await loadMembers();
});

// ══════════════════════════════════════════════
//  멤버 로드
// ══════════════════════════════════════════════
async function loadMembers() {
    const status = document.getElementById('memberLoadStatus');
    try {
        const res = await fetch('../../cignatureV2/member_order.json');
        if (!res.ok) throw new Error('not found');
        members = await res.json();
        status.textContent = `✅ ${members.length}명 로드 완료`;
        status.classList.remove('err');
    } catch {
        status.textContent = '❌ JSON 로드 실패 — 기본 멤버 사용';
        status.classList.add('err');
        members = [
            "[부장] 예란","[차장] 채보미","[과장] 이아린","[팀장] 푸글리",
            "[비서] 미래","[대리] 짐광환","[사원] 이리원","[선임] 파닥",
            "[주임] 이나율","[인턴] 김그루","[신입] 나래","[지배인] 김대봉",
            "[웨이터] 짖음","[웨이터] 아늑"
        ];
    }
}

// 탭 전환
function switchMemberTab(tab, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tabJson').style.display   = tab === 'json'   ? '' : 'none';
    document.getElementById('tabManual').style.display = tab === 'manual' ? '' : 'none';
}

// 직접 입력 적용
function applyManualMembers() {
    const raw = document.getElementById('manualMembers').value.trim();
    if (!raw) return;
    members = raw.split('\n').map(l => l.trim()).filter(Boolean);
    alert(`✅ ${members.length}명 적용 완료`);
}

// ══════════════════════════════════════════════
//  URL 크롤링 → Claude API 파싱
// ══════════════════════════════════════════════
async function crawlUrl() {
    const url    = document.getElementById('crawlUrl').value.trim();
    const status = document.getElementById('crawlStatus');
    const spinner = document.getElementById('crawlSpinner');
    const btnTxt  = document.querySelector('.btn-crawl .btn-txt');
    const preview = document.getElementById('crawlPreview');

    if (!url) {
        setStatus(status, '❗ URL을 입력해주세요.', 'err');
        return;
    }

    setStatus(status, '🔄 페이지 읽는 중...', 'info');
    spinner.style.display = '';
    btnTxt.textContent = '처리 중';

    try {
        // 1) 페이지 HTML 가져오기 (CORS 프록시 활용)
        let pageText = '';
        try {
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            const pageRes  = await fetch(proxyUrl);
            if (pageRes.ok) {
                const pageJson = await pageRes.json();
                // HTML → 텍스트 변환 (태그 제거)
                const tmp = document.createElement('div');
                tmp.innerHTML = pageJson.contents || '';
                pageText = tmp.innerText || tmp.textContent || '';
                pageText = pageText.replace(/\s+/g, ' ').trim().slice(0, 8000);
            }
        } catch {
            pageText = '(페이지 직접 접근 불가)';
        }

        setStatus(status, '🤖 AI가 기여도 파싱 중...', 'info');

        // 2) Claude API에 파싱 요청
        const memberList = members.join(', ');
        const prompt = `아래는 웹 페이지에서 가져온 텍스트입니다.
이 텍스트에서 다음 멤버들의 기여도(숫자) 값을 찾아서 JSON 형식으로만 반환해주세요.
JSON 외에 다른 텍스트는 절대 포함하지 마세요.

멤버 목록: ${memberList}

반환 형식 예시:
{"멤버명1": 12345, "멤버명2": 6789}

멤버 이름이 정확히 일치하지 않아도 비슷하면 매핑해주세요.
값을 찾을 수 없는 멤버는 0으로 표시하세요.

웹 페이지 텍스트:
${pageText}`;

        const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1000,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        if (!apiRes.ok) throw new Error(`API 오류: ${apiRes.status}`);

        const apiData = await apiRes.json();
        const rawText = apiData.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('');

        // JSON 추출
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('JSON 파싱 실패');

        crawledData = JSON.parse(jsonMatch[0]);

        // 미리보기 렌더링
        renderCrawlPreview(crawledData);
        setStatus(status, `✅ ${Object.keys(crawledData).length}명의 기여도를 파싱했습니다.`, 'ok');
        preview.style.display = '';

    } catch (err) {
        console.error(err);
        setStatus(status, `❌ 오류: ${err.message}`, 'err');
    } finally {
        spinner.style.display = 'none';
        btnTxt.textContent = '불러오기';
    }
}

function setStatus(el, msg, type) {
    el.textContent = msg;
    el.className = `crawl-status ${type}`;
}

function renderCrawlPreview(data) {
    const list = document.getElementById('crawlPreviewList');
    list.innerHTML = '';
    Object.entries(data).forEach(([name, val]) => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        item.innerHTML = `
            <span class="preview-item-name" title="${name}">${name}</span>
            <input type="number" class="preview-item-val" data-member="${name}" value="${val}">
        `;
        list.appendChild(item);
    });
}

// 파싱된 데이터 게임에 적용 (memberWeapons에 basePoints 설정)
function applyCrawledData() {
    const inputs = document.querySelectorAll('.preview-item-val');
    inputs.forEach(inp => {
        const member = inp.dataset.member;
        const val    = parseInt(inp.value) || 0;
        crawledData[member] = val;
    });
    alert(`✅ ${Object.keys(crawledData).length}명의 기여도 데이터가 적용됩니다.\n게임 시작 후 자동 반영됩니다.`);
}

// ══════════════════════════════════════════════
//  무기 설정 행 추가/제거
// ══════════════════════════════════════════════
function addWeaponRow() {
    const container = document.getElementById('weaponInputs');
    const row = document.createElement('div');
    row.className = 'weapon-input-row';
    row.innerHTML = `
        <input type="text"   class="weapon-name"    placeholder="무기 이름">
        <input type="number" class="weapon-count"   placeholder="기여도 가치">
        <input type="number" class="weapon-penalty" placeholder="벌금 (원)">
        <button class="btn-del" onclick="removeWeaponRow(this)">✕</button>
    `;
    container.appendChild(row);
}

function removeWeaponRow(btn) {
    btn.parentElement.remove();
}

// ══════════════════════════════════════════════
//  게임 시작
// ══════════════════════════════════════════════
function startGame() {
    if (members.length === 0) {
        alert('멤버 데이터가 없습니다.');
        return;
    }

    // 무기 읽기
    const rows = document.querySelectorAll('.weapon-input-row');
    weapons = [];
    rows.forEach(row => {
        const name    = row.querySelector('.weapon-name').value.trim();
        const count   = parseInt(row.querySelector('.weapon-count').value);
        const penalty = parseInt(row.querySelector('.weapon-penalty').value);
        if (name && count > 0 && penalty >= 0) {
            weapons.push({ name, count, penalty });
        }
    });
    weapons.sort((a, b) => b.count - a.count);

    if (weapons.length === 0) {
        alert('무기를 1개 이상 설정해주세요.');
        return;
    }

    // 멤버 상태 초기화
    memberState = {};
    members.forEach(m => {
        const base = (crawledData && crawledData[m]) ? crawledData[m] : 0;
        memberState[m] = {
            basePoints:        base,
            remaining:         base,
            usedWeapons:       {},
            remainingWeapons:  {}
        };
        weapons.forEach(w => {
            memberState[m].usedWeapons[w.name]       = 0;
            memberState[m].remainingWeapons[w.name]  = calcRemainingWeapons(base)[w.name] || 0;
        });
    });

    // 화면 전환
    document.getElementById('settingsPanel').style.display = 'none';
    document.getElementById('gameBoard').classList.add('active');

    renderMemberCards();
    updateMemberSelect();
    setupEnterKey();

    // 저장된 게임 체크
    const saved = localStorage.getItem('난사데이_v2_상태');
    if (saved && window.confirm('저장된 게임이 있습니다. 불러오시겠습니까?')) {
        loadGameState(JSON.parse(saved));
    }
}

// 기여도 → 무기 별 남은 갯수 계산 (그리디)
function calcRemainingWeapons(remaining) {
    const result = {};
    weapons.forEach(w => result[w.name] = 0);
    let rem = remaining;
    for (const w of weapons) {
        if (rem <= 0) break;
        const cnt = Math.floor(rem / w.count);
        result[w.name] = cnt;
        rem -= cnt * w.count;
    }
    return result;
}

// ══════════════════════════════════════════════
//  멤버 카드 렌더링
// ══════════════════════════════════════════════
function renderMemberCards() {
    const grid = document.getElementById('memberGrid');
    grid.innerHTML = '';
    members.forEach((m, i) => {
        const card = createMemberCard(m, i);
        grid.appendChild(card);
    });
}

function createMemberCard(member, idx) {
    const card = document.createElement('div');
    card.className = 'member-card';
    card.id = `card-${cssId(member)}`;
    card.style.animationDelay = `${idx * 30}ms`;

    // 이름 바
    const nameBar = document.createElement('div');
    nameBar.className = 'member-name-bar';
    nameBar.textContent = member;
    card.appendChild(nameBar);

    // 무기 섹션
    const weaponSection = document.createElement('div');
    weaponSection.className = 'weapon-section';

    // 무기를 2열씩 묶어 행으로
    const perRow = Math.ceil(weapons.length / 2);
    for (let r = 0; r < 2; r++) {
        const row = document.createElement('div');
        row.className = 'weapon-row';
        const start = r * perRow;
        const end   = Math.min(start + perRow, weapons.length);
        for (let i = start; i < end; i++) {
            row.appendChild(createWeaponItem(member, weapons[i]));
        }
        if (row.children.length > 0) weaponSection.appendChild(row);
    }
    card.appendChild(weaponSection);

    // 남은 기여도 바
    const totalBar = document.createElement('div');
    totalBar.className = 'total-bar';
    totalBar.innerHTML = `
        <div class="total-bar-label">남은 기여도</div>
        <div class="total-bar-value" id="tv-${cssId(member)}">0</div>
        <div class="total-bar-penalty" id="tp-${cssId(member)}"></div>
    `;
    card.appendChild(totalBar);

    return card;
}

function createWeaponItem(member, weapon) {
    const item = document.createElement('div');
    item.className = 'weapon-item';
    item.innerHTML = `
        <div class="wi-name">${weapon.name}</div>
        <div class="wi-counts">
            <span class="wi-remaining" id="wr-${cssId(member)}-${cssId(weapon.name)}">0</span>
            <span class="wi-divider">/</span>
            <span class="wi-used"    id="wu-${cssId(member)}-${cssId(weapon.name)}">0</span>
        </div>
    `;
    return item;
}

// ══════════════════════════════════════════════
//  멤버 선택 박스
// ══════════════════════════════════════════════
function updateMemberSelect() {
    ['memberSelectAdd', 'memberSelectRemove'].forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = '';
        members.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            sel.appendChild(opt);
        });
    });
    updateWeaponSelect();
}

function updateWeaponSelect() {
    const sel = document.getElementById('weaponSelect');
    sel.innerHTML = '';
    weapons.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.name;
        opt.textContent = w.name;
        sel.appendChild(opt);
    });
    updateCurrentWeaponCount();
}

function updateWeaponDisplay()       { updateCurrentWeaponCount(); }

function updateCurrentWeaponCount() {
    const member     = document.getElementById('memberSelectRemove').value;
    const weaponName = document.getElementById('weaponSelect').value;
    const remEl      = document.getElementById('currentWeaponCount');
    const useEl      = document.getElementById('currentWeaponUsed');
    if (!member || !weaponName || !memberState[member]) {
        remEl.textContent = '0';
        useEl.textContent = '0';
        return;
    }
    remEl.textContent = memberState[member].remainingWeapons[weaponName] ?? 0;
    useEl.textContent = memberState[member].usedWeapons[weaponName]      ?? 0;
}

// ══════════════════════════════════════════════
//  기여도 추가
// ══════════════════════════════════════════════
function addPointsFromControl() {
    const member = document.getElementById('memberSelectAdd').value;
    const input  = document.getElementById('pointsInput');
    const pts    = parseInt(input.value);

    if (!member)              { alert('멤버를 선택해주세요.'); return; }
    if (isNaN(pts) || pts <= 0) { alert('올바른 숫자를 입력해주세요.'); return; }

    memberState[member].remaining  += pts;
    memberState[member].basePoints += pts;

    // 남은 기여도로 무기 재계산 (사용한 무기 반영)
    recalcRemainingWeapons(member);
    updateCardDisplay(member);
    updateCurrentWeaponCount();

    input.value = '';
    input.focus();
    autoSave();
}

// ══════════════════════════════════════════════
//  무기 사용 (기여도 차감)
// ══════════════════════════════════════════════
function removeWeaponFromControl() {
    const member     = document.getElementById('memberSelectRemove').value;
    const weaponName = document.getElementById('weaponSelect').value;

    if (!member || !weaponName) { alert('멤버와 무기를 선택해주세요.'); return; }

    const state  = memberState[member];
    const weapon = weapons.find(w => w.name === weaponName);
    if (!weapon) return;

    if ((state.remainingWeapons[weaponName] || 0) <= 0) {
        alert(`${member}의 ${weaponName}이(가) 부족합니다.`);
        return;
    }

    // 사용 처리
    state.usedWeapons[weaponName]      = (state.usedWeapons[weaponName] || 0) + 1;
    state.remaining                   -= weapon.count;

    // 남은 무기 재계산
    recalcRemainingWeapons(member);
    updateCardDisplay(member);
    updateCurrentWeaponCount();
    autoSave();
}

// 남은 기여도로 무기 보유량 재계산 (사용량은 보존)
function recalcRemainingWeapons(member) {
    const rem = Math.max(0, memberState[member].remaining);
    const calc = calcRemainingWeapons(rem);
    weapons.forEach(w => {
        memberState[member].remainingWeapons[w.name] = calc[w.name] || 0;
    });
}

// ══════════════════════════════════════════════
//  카드 UI 업데이트
// ══════════════════════════════════════════════
function updateCardDisplay(member) {
    const state = memberState[member];
    const id    = cssId(member);

    // 각 무기 수치
    weapons.forEach(w => {
        const remEl = document.getElementById(`wr-${id}-${cssId(w.name)}`);
        const useEl = document.getElementById(`wu-${id}-${cssId(w.name)}`);
        if (!remEl || !useEl) return;

        const rem = state.remainingWeapons[w.name] || 0;
        const use = state.usedWeapons[w.name]      || 0;

        remEl.textContent = rem;
        useEl.textContent = use;

        // 색상 처리
        remEl.className = 'wi-remaining' + (rem === 0 ? ' depleted' : rem <= 2 ? ' low' : '');

        // 펄스 애니메이션
        bumpEl(remEl);
    });

    // 남은 기여도
    const tvEl = document.getElementById(`tv-${id}`);
    const tpEl = document.getElementById(`tp-${id}`);
    if (tvEl) {
        const rem = state.remaining;
        tvEl.textContent = rem.toLocaleString();
        tvEl.className = 'total-bar-value' + (rem < 0 ? ' negative' : rem === 0 ? ' zero' : '');
        bumpEl(tvEl);
    }
    if (tpEl) {
        // 벌금 계산: 사용된 무기 × 벌금
        let totalPenalty = 0;
        weapons.forEach(w => {
            totalPenalty += (state.usedWeapons[w.name] || 0) * w.penalty;
        });
        tpEl.textContent = totalPenalty > 0 ? `벌금 ${totalPenalty.toLocaleString()}원` : '';
    }
}

function bumpEl(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
}

// ══════════════════════════════════════════════
//  유틸
// ══════════════════════════════════════════════
function cssId(str) {
    return str.replace(/[\[\]\s]/g, '_');
}

function setupEnterKey() {
    const input = document.getElementById('pointsInput');
    if (input) input.addEventListener('keypress', e => {
        if (e.key === 'Enter') addPointsFromControl();
    });
}

// ══════════════════════════════════════════════
//  저장 / 불러오기
// ══════════════════════════════════════════════
function autoSave() {
    localStorage.setItem('난사데이_v2_상태', JSON.stringify({
        weapons, members, memberState, ts: new Date().toISOString()
    }));
}

function loadLastGame() {
    const saved = localStorage.getItem('난사데이_v2_상태');
    if (!saved) { alert('저장된 게임이 없습니다.'); return; }
    try {
        loadGameState(JSON.parse(saved));
        alert('✅ 게임을 불러왔습니다!');
    } catch (e) {
        alert('불러오기 실패: ' + e.message);
    }
}

function loadGameState(state) {
    weapons     = state.weapons;
    members     = state.members;
    memberState = state.memberState;
    renderMemberCards();
    updateMemberSelect();
    members.forEach(m => updateCardDisplay(m));
}

function resetGame() {
    if (!confirm('정말 처음으로 돌아가시겠습니까?')) return;
    document.getElementById('settingsPanel').style.display = '';
    document.getElementById('gameBoard').classList.remove('active');
    weapons     = [];
    memberState = {};
    crawledData = null;
    document.getElementById('crawlStatus').textContent  = '';
    document.getElementById('crawlPreview').style.display = 'none';
    document.getElementById('crawlUrl').value = '';
}

// =============================================
// popup.js
// =============================================

const HEADER_ROW = ['단어(W)', '의미(M)', '발음(P)', '품사(POS)', '예문(E)', '파생어(DER)', '유의어(SIM)', '동의어(S)', '반의어(A)', '설명(D)', '날짜(C)'];

let includeHeader = false;

// ── DOM refs ─────────────────────────────────
const listEl       = document.getElementById('word-list');
const countBadge   = document.getElementById('count-badge');
const btnCopyAll   = document.getElementById('btn-copy-all');
const btnClear     = document.getElementById('btn-clear');
const btnToggleHdr = document.getElementById('btn-toggle-header');
const previewNote  = document.getElementById('preview-note');
const toastEl      = document.getElementById('toast');

// ── 유틸 ─────────────────────────────────────
function entryToTSV(e) {
  const cols = [
    e.word, e.meaning, e.pronunciation, e.pos,
    e.example, e.derivative, e.synonym, '', e.antonym, '', '',
  ];
  return cols.map(v => {
    const s = (v || '').replace(/\t/g, ' ');
    return s.includes('\n') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join('\t');
}

function showToast(msg, dur = 2000) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), dur);
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {}).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    Object.assign(ta.style, { position: 'fixed', opacity: '0' });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  });
}

// ── 렌더링 ────────────────────────────────────
function renderList(list) {
  countBadge.textContent = list.length;
  btnCopyAll.disabled = list.length === 0;

  if (list.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📖</div>
        <div class="empty-text">아직 수집된 단어가 없어요</div>
        <div class="empty-hint">네이버 사전에서 <strong style="color:#9ca3af">+ 추가</strong> 버튼을 눌러보세요</div>
      </div>`;
    previewNote.style.display = 'none';
    return;
  }

  previewNote.style.display = 'block';
  listEl.innerHTML = list.map((e, i) => `
    <div class="word-item" data-idx="${i}">
      <div>
        <div class="word-en">${escHtml(e.word)}</div>
        ${e.pos ? `<div class="word-pos">${escHtml(e.pos)}</div>` : ''}
      </div>
      <div class="word-mean">${escHtml(e.meaning || '—')}</div>
      <div class="word-actions">
        <button class="btn-copy-row" data-idx="${i}">복사</button>
        <button class="btn-del-row"  data-idx="${i}">삭제</button>
      </div>
    </div>
  `).join('');

  // 개별 복사
  listEl.querySelectorAll('.btn-copy-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = +e.currentTarget.dataset.idx;
      copyText(entryToTSV(list[idx]));
      showToast(`"${list[idx].word}" 복사됨!`);
    });
  });

  // 개별 삭제
  listEl.querySelectorAll('.btn-del-row').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = +e.currentTarget.dataset.idx;
      const word = list[idx].word;
      list.splice(idx, 1);
      chrome.storage.local.set({ vocabList: list }, () => {
        renderList(list);
        chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', count: list.length });
        showToast(`"${word}" 삭제됨`);
      });
    });
  });
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── 전체 복사 ─────────────────────────────────
btnCopyAll.addEventListener('click', () => {
  chrome.storage.local.get({ vocabList: [] }, ({ vocabList }) => {
    const rows = vocabList.map(entryToTSV);
    if (includeHeader) rows.unshift(HEADER_ROW.join('\t'));
    copyText(rows.join('\n'));
    showToast(`${vocabList.length}개 단어 복사 완료! 스프레드시트에 붙여넣기 하세요.`, 2500);
  });
});

// ── 헤더 토글 ─────────────────────────────────
btnToggleHdr.addEventListener('click', () => {
  includeHeader = !includeHeader;
  btnToggleHdr.textContent = includeHeader ? '✓ 헤더 포함' : '헤더 포함';
  btnToggleHdr.style.color = includeHeader ? '#03C75A' : '';
  btnToggleHdr.style.borderColor = includeHeader ? '#03C75A' : '';
});

// ── 초기화 ────────────────────────────────────
btnClear.addEventListener('click', () => {
  if (!confirm('단어 목록을 전부 삭제할까요?')) return;
  chrome.storage.local.set({ vocabList: [] }, () => {
    renderList([]);
    chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', count: 0 });
    showToast('목록이 초기화됐어요');
  });
});

// ── 초기 로드 ─────────────────────────────────
chrome.storage.local.get({ vocabList: [] }, ({ vocabList }) => {
  renderList(vocabList);
});

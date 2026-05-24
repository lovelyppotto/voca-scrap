// =============================================
// 네이버 단어장 수집기 - content.js
// dict.naver.com 및 search.naver.com 지원
// =============================================

(function () {
  'use strict';

  // ── 페이지 판별 ──────────────────────────────
  const isDictPage = location.hostname.endsWith('.dict.naver.com') || location.hostname === 'dict.naver.com';
  const isSearchPage = location.hostname === 'search.naver.com';

  // ── 유틸 ─────────────────────────────────────
  function getText(el) {
    return el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
  }
  function getTexts(els) {
    return Array.from(els).map(e => getText(e)).filter(Boolean);
  }
  function clean(str) {
    return str.replace(/\t|\n/g, ' ').trim();
  }

  // ── 단어 데이터 추출 ──────────────────────────

  /**
   * dict.naver.com 영어사전 단어 상세 페이지에서 데이터 추출
   * URL 예: https://dict.naver.com/dict.search?query=spectator
   *         https://dict.naver.com/enendict/#/entry/enen/...
   */
  function extractFromDictPage() {
    const result = {
      word: '',
      meaning: '',
      pos: '',
      pronunciation: '',
      example: '',
      derivative: '',
      synonym: '',
      antonym: '',
    };

    // 표제어
    result.word =
      getText(document.querySelector('strong.word .u_word_dic')) ||
      getText(document.querySelector('strong.word')) ||
      getText(document.querySelector('.word_num_wrap .word')) ||
      getText(document.querySelector('h2.entry-title')) ||
      getText(document.querySelector('.entry_word')) ||
      getText(document.querySelector('.word_type1_header .word'));

    // 발음
    const pronEls = document.querySelectorAll('.phonetic_wrap .phonetic, .listen_list .listen_item .phonetic');
    if (pronEls.length) {
      result.pronunciation = getTexts(pronEls).join(' / ');
    }

    // 품사 + 의미 (여러 뜻 지원)
    const meaningBlocks = document.querySelectorAll(
      '.mean_list .mean_item, .lst_means .list_mean, .word_mean_wrap .word_mean'
    );

    const meanings = [];
    const posList = [];

    meaningBlocks.forEach(block => {
      const pos = getText(block.querySelector('.word_kind, .pos, .part_of_speech'));
      const mean = getText(block.querySelector('.mean, .mean_text, .meaning'));
      if (pos) posList.push(pos);
      if (mean) meanings.push(mean);
    });

    // fallback: 단순 셀렉터
    if (!meanings.length) {
      const simpleMeans = document.querySelectorAll('.mean_list li .mean, .word_list .mean');
      simpleMeans.forEach(el => meanings.push(getText(el)));
    }

    result.meaning = clean(meanings.slice(0, 3).join('; '));
    result.pos = clean([...new Set(posList)].join(', '));

    // 예문
    const exampleEls = document.querySelectorAll(
      '.example_wrap .example, .lst_example .example_lst li, .word_example .example'
    );
    const examples = getTexts(exampleEls).slice(0, 2);
    result.example = clean(examples.join(' / '));

    // 파생어
    const derivEls = document.querySelectorAll(
      '.relate_word_wrap .relate_word, .word_relation .relate_list li, .derivative_wrap li'
    );
    result.derivative = clean(getTexts(derivEls).slice(0, 5).join(', '));

    // 유의어
    const synEls = document.querySelectorAll(
      '.synonym_wrap li, .word_synonym li, [class*="synonym"] li'
    );
    result.synonym = clean(getTexts(synEls).slice(0, 5).join(', '));

    // 반의어
    const antEls = document.querySelectorAll(
      '.antonym_wrap li, .word_antonym li, [class*="antonym"] li'
    );
    result.antonym = clean(getTexts(antEls).slice(0, 5).join(', '));

    return result;
  }

  /**
   * search.naver.com?where=nen (영어사전 검색결과)에서 데이터 추출
   */
  function extractFromSearchPage() {
    const result = {
      word: '',
      meaning: '',
      pos: '',
      pronunciation: '',
      example: '',
      derivative: '',
      synonym: '',
      antonym: '',
    };

    // 검색 쿼리에서 단어 가져오기
    const urlParams = new URLSearchParams(location.search);
    result.word = urlParams.get('query') || '';

    const dictArea = document.querySelector(
      '#sp_nkindic_1, .dictionary_area, #nkindic_wrap, .eng_single'
    );
    if (!dictArea) return result;

    // 표제어 (검색결과에서 더 정확한 스펠 확인)
    const titleEl = dictArea.querySelector('.word, .word_type1, h3.title');
    if (titleEl) result.word = getText(titleEl);

    // 발음
    const pronEl = dictArea.querySelector('.phonetic, .listen_list .phonetic');
    if (pronEl) result.pronunciation = getText(pronEl);

    // 품사 + 뜻
    const meanItems = dictArea.querySelectorAll('.mean_item, .word_mean, li.mean_type1');
    const meanings = [];
    const posList = [];
    meanItems.forEach(item => {
      const pos = getText(item.querySelector('.word_kind, .pos, .sp_en'));
      const mean = getText(item.querySelector('.mean, .mean_text'));
      if (pos) posList.push(pos);
      if (mean) meanings.push(mean);
    });
    result.meaning = clean(meanings.slice(0, 3).join('; '));
    result.pos = clean([...new Set(posList)].join(', '));

    // 예문
    const exEls = dictArea.querySelectorAll('.example, .example_lst li');
    result.example = clean(getTexts(exEls).slice(0, 2).join(' / '));

    // 유의어/파생어
    const relEls = dictArea.querySelectorAll('.relate_word li, .synonym li');
    result.synonym = clean(getTexts(relEls).slice(0, 5).join(', '));

    return result;
  }

  // ── 메인 추출 함수 ────────────────────────────
  function extractWordData() {
    if (isDictPage) return extractFromDictPage();
    if (isSearchPage) return extractFromSearchPage();
    return null;
  }

  // ── 탭 형식 변환 ─────────────────────────────
  function toTSV(entry) {
    const cols = [
      entry.word,
      entry.meaning,
      entry.pos,
      entry.pronunciation,
      entry.example,
      entry.derivative,
      entry.synonym,
      entry.antonym,
    ];
    return cols.map(c => (c || '').replace(/\t/g, ' ')).join('\t');
  }

  // ── 플로팅 버튼 UI ────────────────────────────
  function createFloatingUI() {
    if (document.getElementById('vocab-collector-btn')) return;

    const container = document.createElement('div');
    container.id = 'vocab-collector-btn';
    container.innerHTML = `
      <button class="vc-btn vc-add" title="단어장에 추가">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>추가</span>
      </button>
      <button class="vc-btn vc-copy-one" title="바로 복사">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        <span>바로복사</span>
      </button>
      <div class="vc-toast" id="vc-toast"></div>
    `;
    document.body.appendChild(container);

    // 추가 버튼
    container.querySelector('.vc-add').addEventListener('click', () => {
      const data = extractWordData();
      if (!data || !data.word) {
        showToast('단어를 찾을 수 없어요 😢', 'error');
        return;
      }
      chrome.storage.local.get({ vocabList: [] }, (res) => {
        const list = res.vocabList;
        // 중복 체크
        if (list.some(e => e.word === data.word)) {
          showToast(`"${data.word}" 이미 추가됨`, 'warn');
          return;
        }
        list.push(data);
        chrome.storage.local.set({ vocabList: list }, () => {
          showToast(`"${data.word}" 추가됨 (${list.length}개)`, 'ok');
          updateBadge(list.length);
        });
      });
    });

    // 바로 복사 버튼
    container.querySelector('.vc-copy-one').addEventListener('click', () => {
      const data = extractWordData();
      if (!data || !data.word) {
        showToast('단어를 찾을 수 없어요 😢', 'error');
        return;
      }
      const tsv = toTSV(data);
      copyToClipboard(tsv);
      showToast(`"${data.word}" 복사됨!`, 'ok');
    });
  }

  function showToast(msg, type = 'ok') {
    const toast = document.getElementById('vc-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `vc-toast vc-toast--${type} vc-toast--show`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('vc-toast--show');
    }, 2200);
  }

  function updateBadge(count) {
    chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', count });
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    });
  }

  // ── 메시지 수신 (popup에서 호출) ─────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'EXTRACT') {
      sendResponse(extractWordData());
    }
  });

  // ── 초기화 ────────────────────────────────────
  function init() {
    // dict 상세 페이지이거나 검색결과 영어사전 섹션이 있을 때만 버튼 표시
    if (isDictPage || (isSearchPage && document.querySelector('#sp_nkindic_1, .dictionary_area, #nkindic_wrap, .eng_single'))) {
      createFloatingUI();
    }
  }

  // SPA 대응: URL 변경 감지
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(init, 800);
    }
  }).observe(document.body, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
  } else {
    setTimeout(init, 500);
  }
})();

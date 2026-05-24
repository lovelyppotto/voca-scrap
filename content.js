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
  // 한국어 바이그램 유사도 (예문-의미 매칭용)
  function korScore(query, target) {
    const stop = new Set(['하다', '이다', '있다', '없다', '되다', '않다', '주다']);
    const cq = query.replace(/[^가-힣]/g, '');
    const ct = target.replace(/[^가-힣]/g, '');
    let score = 0;
    for (let i = 0; i < cq.length - 1; i++) {
      const bg = cq.slice(i, i + 2);
      if (!stop.has(bg) && ct.includes(bg)) score++;
    }
    return score;
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

    // 표제어 (·는 사전 음절 구분자라 제거)
    result.word = (
      getText(document.querySelector('strong.word .u_word_dic')) ||
      getText(document.querySelector('strong.word')) ||
      getText(document.querySelector('.word_num_wrap .word')) ||
      getText(document.querySelector('h2.entry-title')) ||
      getText(document.querySelector('.entry_word')) ||
      getText(document.querySelector('.word_type1_header .word'))
    ).replace(/·/g, '');

    // 발음 (미국식 우선, 없으면 첫 번째 발음)
    const pronEl = document.querySelector('span.pronounce, .phonetic_wrap .phonetic');
    if (pronEl) {
      const pronText = getText(pronEl);
      const usMatch = pronText.match(/美\s*([^\s\]]+)/);
      if (usMatch) {
        result.pronunciation = usMatch[1];
      } else {
        const bracketMatch = pronText.match(/\[\s*([^\]]+)\s*\]/);
        result.pronunciation = bracketMatch ? bracketMatch[1].trim() : '';
      }
    }

    // 품사 (여러 품사 지원, 탭 네비게이션 기준)
    const posEls = document.querySelectorAll('em.part_speech[nclickcode], em.part_speech.myScrollNavQuick');
    const posList = [...new Set(getTexts(posEls))];
    result.pos = posList.map(p => `[${p}]`).join(' ');

    // 의미
    const CIRCLED = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
    const meanings = [];
    const entryMeans = document.querySelectorAll('.entry_mean_list .entry_mean_item p.meaning');
    if (entryMeans.length) {
      const seenMeanings = new Set();
      entryMeans.forEach((el) => {
        const text = getText(el);
        if (text && !seenMeanings.has(text)) {
          seenMeanings.add(text);
          meanings.push((CIRCLED[meanings.length] ?? `${meanings.length + 1}.`) + ' ' + text);
        }
      });
    } else {
      // entry_mean_list가 없을 때 Oxford 본문 영역으로 범위 제한
      const mainSection = document.querySelector('.mean_tray.important_words, .component_mean.important_words');
      const scope = mainSection || document;
      const seenFallback = new Set();
      scope.querySelectorAll('ul._means_level_dictionary > li.my_mean_item > ul > li.my_mean_item').forEach((item) => {
        const mean = getText(item.querySelector('span.mean[lang="ko"]'));
        if (mean && !seenFallback.has(mean)) {
          seenFallback.add(mean);
          meanings.push((CIRCLED[meanings.length] ?? `${meanings.length + 1}.`) + ' ' + mean);
        }
      });
    }
    result.meaning = clean(meanings.join('; '));

    // 예문 - Oxford 의미와 entry 의미를 바이그램 스코어로 매칭 후 1:1 배정
    const oxItems = [];
    document.querySelectorAll('ul._means_level_dictionary > li.my_mean_item > ul > li.my_mean_item').forEach(item => {
      const meaning = getText(item.querySelector('span.mean[lang="ko"]'));
      const exEl = item.querySelector('p.origin.my_origin span.text[lang="en"]');
      // is-closed된 div 안에 있어도 textContent로 읽힘
      const example = exEl ? exEl.textContent.replace(/\s+/g, ' ').trim() : '';
      oxItems.push({ meaning, example });
    });

    // 스코어 매트릭스 - entryMeans 대신 meanings 배열 기준 (fallback 경로도 커버)
    const stripNum = s => s.replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d.]+\s*/, '');
    const scoreList = [];
    meanings.forEach((m, i) => {
      const txt = stripNum(m);
      oxItems.forEach((ox, j) => {
        scoreList.push({ i, j, s: korScore(txt, ox.meaning) });
      });
    });

    // 각 entry가 동점으로 경합하는 oxford 수 계산 (적을수록 대안 없음 → 우선 배정)
    const entryScoreCount = {};
    scoreList.forEach(({ i, s }) => {
      if (!entryScoreCount[i]) entryScoreCount[i] = {};
      entryScoreCount[i][s] = (entryScoreCount[i][s] || 0) + 1;
    });

    // score 내림차순 → 대안 수 오름차순(대안 없는 entry 우선) → j 오름차순
    scoreList.sort((a, b) => {
      if (a.s !== b.s) return b.s - a.s;
      const au = entryScoreCount[a.i]?.[a.s] ?? 999;
      const bu = entryScoreCount[b.i]?.[b.s] ?? 999;
      if (au !== bu) return au - bu;
      return a.j - b.j || a.i - b.i;
    });

    // 그리디 1:1 매칭
    const assignedE = new Set(), assignedO = new Set();
    const exMap = {};
    for (const { i, j } of scoreList) {
      if (assignedE.has(i) || assignedO.has(j)) continue;
      exMap[i] = oxItems[j].example;
      assignedE.add(i);
      assignedO.add(j);
    }
    // 미매칭 항목은 순서대로 남은 Oxford 예문 배정
    let oxSeq = 0;
    meanings.forEach((_, i) => {
      if (exMap[i]) return;
      while (oxSeq < oxItems.length && assignedO.has(oxSeq)) oxSeq++;
      if (oxSeq < oxItems.length) exMap[i] = oxItems[oxSeq++].example;
    });

    const exampleParts = [];
    meanings.forEach((_, i) => {
      if (exMap[i]) exampleParts.push((CIRCLED[i] ?? `${i + 1}.`) + ' ' + exMap[i]);
    });
    result.example = exampleParts.join(';\n');

    // 파생형 (형용사/명사 등 품사 포함)
    const derivSection = document.querySelector('#_id_section_relation');
    if (derivSection) {
      const derivParts = [];
      derivSection.querySelectorAll('.inner').forEach(inner => {
        const pos = getText(inner.querySelector('em.tit'));
        const words = getTexts(inner.querySelectorAll('.cont .item[lang="en"]'));
        const POS_SHORT = { '형용사':'형', '명사':'명', '부사':'부', '동사':'동', '대명사':'대', '전치사':'전', '접속사':'접', '감탄사':'감', '관사':'관' };
        const shortPos = POS_SHORT[pos] ?? pos.slice(0, 1);
        words.forEach(w => derivParts.push(pos ? `[${shortPos}] ${w}` : w));
      });
      result.derivative = derivParts.join('; ');
    }

    // 유의어 (수동 입력)
    result.synonym = '';

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
      entry.word,          // W  단어
      entry.meaning,       // M  의미
      entry.pronunciation, // P  발음
      entry.pos,           // POS 품사
      entry.example,       // E  예문
      entry.derivative,    // DER 파생어
      entry.synonym,       // SIM 유의어
      '',                  // S  동의어 (수동 입력)
      entry.antonym,       // A  반의어
      '',                  // D  설명 (수동 입력)
      '',                  // C  날짜 (수동 입력)
    ];
    return cols.map(c => {
      const v = (c || '').replace(/\t/g, ' ');
      return v.includes('\n') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    }).join('\t');
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

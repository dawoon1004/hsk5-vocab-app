/**
 * 26초 (Skimmify) 모바일 앱 시나리오 100% 구현 메인 스크립트
 * - 다락원 HSK 5급 공식 어휘 1300 연동
 * - 규칙 적용:
 *   1) 실제 오늘 날짜와 실시간 연동 (주간 달력에 D1, D2 없이 깔끔하게 날짜만 표시)
 *   2) 오늘 분량의 학습만 노출 (내일 분량은 내일 자정 이후 자동 언락)
 *   3) 전날 학습이 완료되었다면 다음 날 새로운 학습 어휘(6단어)를 자동 생성하여 배정
 *   4) 스키밍 시 '절반 돌파' 카드 없이 1~6단어 쾌적한 원스톱 연속 진행
 *   5) 단어장 음성 자동재생 (단어 ➔ 예문 순차 발음, 플래시카드 앞면 즉시 재생, 듣기 모드 연속 자동재생)
 */

document.addEventListener('DOMContentLoaded', () => {
  // ---------------------------------------------------------------------------
  // 1. 상태 관리 변수 & 규칙 기반 날짜/진도 연동
  // ---------------------------------------------------------------------------
  const STORAGE_LEARNED = 'hsk5_learned_v4';
  const STORAGE_STARS = 'hsk5_stars_v4';
  const STORAGE_AUTOPLAY = 'hsk5_autoplay_v4';
  const STORAGE_MIZIGE = 'hsk5_mizige_v4';
  const STORAGE_ACTIVE_DAY = 'hsk5_active_day_index_v5';
  const STORAGE_LAST_STUDY_DATE = 'hsk5_last_study_date_v5';
  const STORAGE_COMPLETED_DAYS = 'hsk5_completed_days_v5';
  const STORAGE_COMPLETED_DATES = 'hsk5_completed_dates_v5';

  let learnedSet = new Set(JSON.parse(localStorage.getItem(STORAGE_LEARNED) || '[]'));
  let starSet = new Set(JSON.parse(localStorage.getItem(STORAGE_STARS) || '[]'));
  let isAutoPlay = localStorage.getItem(STORAGE_AUTOPLAY) !== 'false';
  let isMizigeActive = localStorage.getItem(STORAGE_MIZIGE) !== 'false';

  // 어휘 분할: 하루 6단어 기준
  const WORDS_PER_DAY = 6;
  const allVocab = HSK5_VOCAB;
  const totalDays = Math.ceil(allVocab.length / WORDS_PER_DAY);

  // 날짜 유틸리티
  const getToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const padZero = (n) => (n < 10 ? '0' + n : '' + n);

  const formatDateKey = (d) => {
    return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
  };

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  const formatDateLabel = (d) => {
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})`;
  };

  const isSameDay = (d1, d2) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  const today = getToday();
  const todayKey = formatDateKey(today);

  // 학습 완료 이력 불러오기
  let completedDays = new Set(JSON.parse(localStorage.getItem(STORAGE_COMPLETED_DAYS) || '[]'));
  let completedDates = new Set(JSON.parse(localStorage.getItem(STORAGE_COMPLETED_DATES) || '[]'));
  let lastStudyDate = localStorage.getItem(STORAGE_LAST_STUDY_DATE);
  let currentDay = parseInt(localStorage.getItem(STORAGE_ACTIVE_DAY) || '1', 10);

  // ---------------------------------------------------------------------------
  // [규칙 구현]: 전날 학습이 완료되었다면 다음 날 새로운 학습을 만들어서 보여주기
  // ---------------------------------------------------------------------------
  if (!lastStudyDate) {
    // 앱을 처음 시작한 날: Day 1으로 세팅
    currentDay = 1;
    localStorage.setItem(STORAGE_LAST_STUDY_DATE, todayKey);
    localStorage.setItem(STORAGE_ACTIVE_DAY, '1');
  } else if (lastStudyDate < todayKey) {
    // 날짜가 바뀌어서 새로운 날이 되었을 때
    const wasYesterdayCompleted = completedDates.has(lastStudyDate) || completedDays.has(currentDay);

    if (wasYesterdayCompleted) {
      // 전날 학습이 완료된 상태라면 ➔ 다음 날 새로운 학습(다음 6단어)으로 자동 생성!
      if (currentDay < totalDays) {
        currentDay += 1;
        localStorage.setItem(STORAGE_ACTIVE_DAY, currentDay);
      }
    }
    // 오늘 날짜로 갱신
    localStorage.setItem(STORAGE_LAST_STUDY_DATE, todayKey);
  }

  // 오늘 학습 완료 여부
  const isTodayCompleted = () => {
    return completedDates.has(todayKey) || completedDays.has(currentDay);
  };

  // 일차별 어휘 추출 (오늘 학습 분량 6단어)
  const getDayVocab = (day) => {
    const start = (day - 1) * WORDS_PER_DAY;
    const end = start + WORDS_PER_DAY;
    let slice = allVocab.slice(start, end);
    if (slice.length === 0) slice = allVocab.slice(0, WORDS_PER_DAY);
    return slice;
  };

  // 일차별 퀴즈 어휘 (오늘 6단어 + 이전 복습 2단어 = 총 8문제)
  const getDayQuizVocab = (day) => {
    const todayWords = getDayVocab(day);
    if (day > 1) {
      const prevPool = allVocab.slice(0, (day - 1) * WORDS_PER_DAY);
      const reviewWords = prevPool.slice(0, 2);
      return [...todayWords, ...reviewWords];
    }
    return allVocab.slice(0, Math.min(8, allVocab.length));
  };

  // ChineseSpeech 자동재생 상태 동기화
  ChineseSpeech.setAutoPlay(isAutoPlay);

  // 화면 상태
  let currentScreen = 'home';
  let toastTimer = null;

  // ---------------------------------------------------------------------------
  // 2. DOM 요소 캐싱
  // ---------------------------------------------------------------------------
  const toastPopup = document.getElementById('toastPopup');
  const toggleAutoPlayBtn = document.getElementById('toggleAutoPlayBtn');
  const autoPlayIcon = document.getElementById('autoPlayIcon');
  const toggleMizigeBtn = document.getElementById('toggleMizigeBtn');
  const navTabBtns = document.querySelectorAll('.nav-tab-btn');
  const screenViews = document.querySelectorAll('.screen-view');

  // 홈 상단 주간 달력 & 타이틀
  const weekDaysRow = document.getElementById('weekDaysRow');
  const dayHeaderTitle = document.getElementById('dayHeaderTitle');
  const todayStatusTag = document.getElementById('todayStatusTag');
  const daySubInfo = document.getElementById('daySubInfo');

  // 홈 태스크 카드
  const btnStartSkimFromHome = document.getElementById('btnStartSkimFromHome');
  const btnStartFlashFromHome = document.getElementById('btnStartFlashFromHome');
  const btnStartQuizFromHome = document.getElementById('btnStartQuizFromHome');
  const btnStartListenFromHome = document.getElementById('btnStartListenFromHome');
  const homeTaskSkim = document.getElementById('homeTaskSkim');
  const homeTaskFlash = document.getElementById('homeTaskFlash');
  const homeTaskQuiz = document.getElementById('homeTaskQuiz');
  const homeTaskListen = document.getElementById('homeTaskListen');
  const openGoalBtn = document.getElementById('openGoalBtn');
  const btnShowStreak = document.getElementById('btnShowStreak');
  const bottomNavItems = document.querySelectorAll('.bottom-tab-item');

  // 스키밍 화면 요소
  const skimIntroScreen = document.getElementById('skimIntroScreen');
  const skimCardsWrap = document.getElementById('skimCardsWrap');
  const btnBeginSkimmingCards = document.getElementById('btnBeginSkimmingCards');
  const btnExitSkim = document.getElementById('btnExitSkim');
  const skimTrashCount = document.getElementById('skimTrashCount');
  const skimProgressCount = document.getElementById('skimProgressCount');
  const skimCurrentCard = document.getElementById('skimCurrentCard');
  const btnSkimKnow = document.getElementById('btnSkimKnow');
  const btnSkimLearn = document.getElementById('btnSkimLearn');
  const skimFinishScreen = document.getElementById('skimFinishScreen');
  const btnGoToFlashcardFromSkim = document.getElementById('btnGoToFlashcardFromSkim');

  // 플래시카드 화면 요소
  const flashIntroScreen = document.getElementById('flashIntroScreen');
  const flashcardTrainingWrap = document.getElementById('flashcardTrainingWrap');
  const btnBeginFlashcard = document.getElementById('btnBeginFlashcard');
  const btnExitFlash = document.getElementById('btnExitFlash');
  const flashProgressText = document.getElementById('flashProgressText');
  const flashSegmentedTrack = document.getElementById('flashSegmentedTrack');
  const flashInteractiveCard = document.getElementById('flashInteractiveCard');
  const btnShowBack = document.getElementById('btnShowBack');
  const srsButtonsWrap = document.getElementById('srsButtonsWrap');
  const btnSrsHard = document.getElementById('btnSrsHard');
  const btnSrsMedium = document.getElementById('btnSrsMedium');
  const btnSrsEasy = document.getElementById('btnSrsEasy');

  // 결과 화면 요소
  const resReviewCount = document.getElementById('resReviewCount');
  const resAccuracy = document.getElementById('resAccuracy');
  const resTotalTime = document.getElementById('resTotalTime');
  const resSpeedPerCard = document.getElementById('resSpeedPerCard');
  const btnOpenReviewModal = document.getElementById('btnOpenReviewModal');
  const toggleMaskHanzi = document.getElementById('toggleMaskHanzi');
  const toggleMaskMeaning = document.getElementById('toggleMaskMeaning');
  const resultGroupedList = document.getElementById('resultGroupedList');
  const btnGoToListeningFromResult = document.getElementById('btnGoToListeningFromResult');
  const btnGoToQuizFromResult = document.getElementById('btnGoToQuizFromResult');
  const btnFinishLearning = document.getElementById('btnFinishLearning');
  const reviewSettingsModal = document.getElementById('reviewSettingsModal');
  const btnCloseReviewModal = document.getElementById('btnCloseReviewModal');
  const btnConfirmReviewSettings = document.getElementById('btnConfirmReviewSettings');

  // 듣기 모드 화면 요소
  const listenIntroScreen = document.getElementById('listenIntroScreen');
  const listenPlayerWrap = document.getElementById('listenPlayerWrap');
  const btnBeginListening = document.getElementById('btnBeginListening');
  const btnExitListening = document.getElementById('btnExitListening');
  const listenCounterText = document.getElementById('listenCounterText');
  const listenCardContent = document.getElementById('listenCardContent');
  const btnPlayerShuffle = document.getElementById('btnPlayerShuffle');
  const btnPlayerPrev = document.getElementById('btnPlayerPrev');
  const btnPlayerPlayPause = document.getElementById('btnPlayerPlayPause');
  const playPauseIcon = document.getElementById('playPauseIcon');
  const btnPlayerNext = document.getElementById('btnPlayerNext');
  const btnPlayerRepeat = document.getElementById('btnPlayerRepeat');

  // 퀴즈 화면 요소
  const quizIntroScreen = document.getElementById('quizIntroScreen');
  const quizSolvingWrap = document.getElementById('quizSolvingWrap');
  const btnBeginQuiz = document.getElementById('btnBeginQuiz');
  const btnExitQuiz = document.getElementById('btnExitQuiz');
  const quizItemCounter = document.getElementById('quizItemCounter');
  const quizTimerPill = document.getElementById('quizTimerPill');
  const quizTargetMeaning = document.getElementById('quizTargetMeaning');
  const quizSentenceBox = document.getElementById('quizSentenceBox');
  const quizOptionsGrid = document.getElementById('quizOptionsGrid');
  const quizResultView = document.getElementById('quizResultView');
  const quizFinalAccuracy = document.getElementById('quizFinalAccuracy');
  const quizSolvedCount = document.getElementById('quizSolvedCount');
  const quizTotalDuration = document.getElementById('quizTotalDuration');
  const quizWrongBadge = document.getElementById('quizWrongBadge');
  const quizCorrectBadge = document.getElementById('quizCorrectBadge');
  const quizReviewItems = document.getElementById('quizReviewItems');
  const btnFinishQuizToHome = document.getElementById('btnFinishQuizToHome');

  // 도감 & 스트릭 모달
  const btnExitList = document.getElementById('btnExitList');
  const listSearchInput = document.getElementById('listSearchInput');
  const filterChips = document.querySelectorAll('.filter-chip');
  const vocabCardsGrid = document.getElementById('vocabCardsGrid');
  const streakModal = document.getElementById('streakModal');
  const btnCloseStreak = document.getElementById('btnCloseStreak');

  // ---------------------------------------------------------------------------
  // 3. 헬퍼 유틸리티 함수
  // ---------------------------------------------------------------------------
  const showToast = (message) => {
    if (!toastPopup) return;
    toastPopup.textContent = message;
    toastPopup.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastPopup.classList.remove('show');
    }, 2200);
  };

  const stripHtml = (htmlStr) => {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = htmlStr;
    return tmp.textContent || tmp.innerText || '';
  };

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getVocabImageMarkup = (item, extraClass = '') => {
    if (item.image) {
      return `<img src="${item.image}" alt="${item.hanzi}" class="card-main-img ${extraClass}" />`;
    }
    if (item.svgIllust) {
      return `<div class="card-svg-fallback ${extraClass}" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:#18181B;">${item.svgIllust}</div>`;
    }
    return `
      <div style="width:100%; height:100%; background: linear-gradient(135deg, #18181B 0%, #27272A 100%); display:flex; flex-direction:column; align-items:center; justify-content:center; color:#FFFFFF;" class="${extraClass}">
        <span style="font-size:44px; font-weight:900; font-family:var(--font-hanzi); color:#A7F3D0;">${item.hanzi}</span>
        <span style="font-size:14px; color:#9CA3AF; margin-top:6px;">${item.pinyin} · ${item.meaning}</span>
      </div>
    `;
  };

  const saveState = () => {
    localStorage.setItem(STORAGE_LEARNED, JSON.stringify([...learnedSet]));
    localStorage.setItem(STORAGE_STARS, JSON.stringify([...starSet]));
    localStorage.setItem(STORAGE_AUTOPLAY, isAutoPlay);
    localStorage.setItem(STORAGE_MIZIGE, isMizigeActive);
    localStorage.setItem(STORAGE_COMPLETED_DAYS, JSON.stringify([...completedDays]));
    localStorage.setItem(STORAGE_COMPLETED_DATES, JSON.stringify([...completedDates]));
    localStorage.setItem(STORAGE_ACTIVE_DAY, currentDay);
    localStorage.setItem(STORAGE_LAST_STUDY_DATE, todayKey);
  };

  // ---------------------------------------------------------------------------
  // 4. 주간 달력 렌더링 (D1, D2 없이 깔끔하게 실제 요일 & 날짜 숫자만 표시)
  // ---------------------------------------------------------------------------
  const renderWeekDaysRow = () => {
    if (!weekDaysRow) return;

    // 실제 오늘이 속한 주의 일요일 구하기
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());

    let html = '';
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(sunday);
      dayDate.setDate(sunday.getDate() + i);

      const isThisToday = isSameDay(dayDate, today);
      const isPast = dayDate < today;
      const dateKey = formatDateKey(dayDate);
      const isPastCompleted = completedDates.has(dateKey);

      let colClasses = ['day-col'];
      if (isThisToday) colClasses.push('active-today');
      if (isPastCompleted) colClasses.push('is-past-completed');

      // 배지: 오늘 완료되었으면 체크(✓), 진행 중이면 연속 학습 일수(예: 1)
      let badgeHtml = '';
      if (isThisToday) {
        if (isTodayCompleted()) {
          badgeHtml = '<span class="today-badge" style="background:#10B981;">✓</span>';
        } else {
          badgeHtml = `<span class="today-badge">${completedDays.size + 1}</span>`;
        }
      }

      html += `
        <div class="${colClasses.join(' ')}">
          <span>${dayNames[i]}</span>
          <b class="${isThisToday ? 'today-num' : ''}">${dayDate.getDate()}</b>
          ${badgeHtml}
        </div>
      `;
    }

    weekDaysRow.innerHTML = html;
  };

  // 홈 대시보드 당일 어휘 및 상태 갱신
  const updateHomeUI = () => {
    renderWeekDaysRow();

    const todayVocab = getDayVocab(currentDay);
    const completed = isTodayCompleted();

    // 1. 헤더 텍스트 갱신
    if (dayHeaderTitle) {
      dayHeaderTitle.textContent = `Day ${currentDay}`;
    }

    if (todayStatusTag) {
      if (completed) {
        todayStatusTag.style.background = '#ECFDF5';
        todayStatusTag.style.color = '#059669';
        todayStatusTag.textContent = '✅ 오늘 학습 완료 (내일 새로운 단어 오픈)';
      } else {
        todayStatusTag.style.background = '#111827';
        todayStatusTag.style.color = '#FFFFFF';
        todayStatusTag.textContent = '오늘의 학습';
      }
    }

    if (daySubInfo) {
      const startNum = (currentDay - 1) * WORDS_PER_DAY + 1;
      const endNum = Math.min(allVocab.length, currentDay * WORDS_PER_DAY);
      const themeLabel = (todayVocab[0] && todayVocab[0].theme) ? todayVocab[0].theme : '1강 가정, 일상생활';
      daySubInfo.textContent = `${formatDateLabel(today)} · ${themeLabel} (${padZero(startNum)}~${padZero(endNum)}번)`;
    }

    // 2. 홈 태스크 썸네일 업데이트 (오늘 배정된 단어들로만 세팅)
    if (todayVocab[0] && homeTaskSkim) {
      const img = homeTaskSkim.querySelector('img');
      if (img && todayVocab[0].image) img.src = todayVocab[0].image;
    }
    if (todayVocab[1] && homeTaskFlash) {
      const img = homeTaskFlash.querySelector('img');
      if (img && todayVocab[1].image) img.src = todayVocab[1].image;
    }
    if (todayVocab[2] && homeTaskQuiz) {
      const img = homeTaskQuiz.querySelector('img');
      if (img && todayVocab[2].image) img.src = todayVocab[2].image;
    }
    if (todayVocab[3] && homeTaskListen) {
      const img = homeTaskListen.querySelector('img');
      if (img && todayVocab[3].image) img.src = todayVocab[3].image;
    }
  };

  // ---------------------------------------------------------------------------
  // 5. 전역 화면 전환 라우터 (Screen Switcher)
  // ---------------------------------------------------------------------------
  const switchScreen = (screenName) => {
    currentScreen = screenName;

    if (screenName !== 'listening') {
      stopListeningPlayer();
    }
    ChineseSpeech.stop();

    navTabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-screen') === screenName);
    });

    screenViews.forEach(view => {
      view.classList.remove('active');
    });

    const targetView = document.getElementById(`${screenName}View`);
    if (targetView) {
      targetView.classList.add('active');
    }

    bottomNavItems.forEach(item => {
      const match = item.getAttribute('data-screen') === screenName;
      item.classList.toggle('active', match);
    });

    if (screenName === 'home') {
      updateHomeUI();
    } else if (screenName === 'skim') {
      prepareSkimScreen();
    } else if (screenName === 'flashcard') {
      prepareFlashcardScreen();
    } else if (screenName === 'result') {
      renderResultScreen();
    } else if (screenName === 'listening') {
      prepareListeningScreen();
    } else if (screenName === 'quiz') {
      prepareQuizScreen();
    } else if (screenName === 'list') {
      renderVocabGrid();
    }
  };

  navTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-screen');
      if (target) switchScreen(target);
    });
  });

  bottomNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-screen');
      if (target) switchScreen(target);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. 음성 자동재생 및 米字格 토글
  // ---------------------------------------------------------------------------
  const updateAutoPlayUI = () => {
    if (toggleAutoPlayBtn) {
      toggleAutoPlayBtn.classList.toggle('active', isAutoPlay);
      toggleAutoPlayBtn.innerHTML = `<span>${isAutoPlay ? '🔊' : '🔈'}</span> 음성 자동재생: ${isAutoPlay ? 'ON' : 'OFF'}`;
    }
  };
  updateAutoPlayUI();

  if (toggleAutoPlayBtn) {
    toggleAutoPlayBtn.addEventListener('click', () => {
      isAutoPlay = !isAutoPlay;
      ChineseSpeech.setAutoPlay(isAutoPlay);
      saveState();
      updateAutoPlayUI();
      showToast(isAutoPlay ? '🔊 단어장 음성 자동재생을 켰어요!' : '🔈 단어장 음성 자동재생을 껐어요.');
    });
  }

  const updateMizigeUI = () => {
    if (isMizigeActive) {
      document.body.classList.add('mizige-active');
      if (toggleMizigeBtn) toggleMizigeBtn.classList.add('active');
    } else {
      document.body.classList.remove('mizige-active');
      if (toggleMizigeBtn) toggleMizigeBtn.classList.remove('active');
    }
  };
  updateMizigeUI();

  if (toggleMizigeBtn) {
    toggleMizigeBtn.addEventListener('click', () => {
      isMizigeActive = !isMizigeActive;
      saveState();
      updateMizigeUI();
      document.querySelectorAll('.word-hanzi').forEach(el => {
        el.classList.toggle('mizige-box', isMizigeActive);
      });
      showToast(isMizigeActive ? '田 米字格 한자 격자를 켰어요.' : '米字格 한자 격자를 껐어요.');
    });
  }

  if (openGoalBtn) {
    openGoalBtn.addEventListener('click', () => {
      showToast(`🎯 오늘(${formatDateLabel(today)}) 목표: Day ${currentDay} 필수 6단어 완벽 정복! 화이팅이에요 :)`);
    });
  }

  // ---------------------------------------------------------------------------
  // 7. 1단계: 스키밍 (⚡ 절반 돌파 방해 없이 원스톱 6단어 초고속 뇌 각인)
  // ---------------------------------------------------------------------------
  let skimList = [];
  let skimIndex = 0;
  let skimTrashVal = 0;

  const prepareSkimScreen = () => {
    skimList = [...getDayVocab(currentDay)];
    skimIndex = 0;
    skimTrashVal = 0;

    skimIntroScreen.style.display = 'flex';
    skimCardsWrap.style.display = 'none';
    skimFinishScreen.style.display = 'none';
  };

  if (btnBeginSkimmingCards) {
    btnBeginSkimmingCards.addEventListener('click', () => {
      skimIntroScreen.style.display = 'none';
      skimCardsWrap.style.display = 'flex';
      renderSkimCard();
    });
  }

  if (btnExitSkim) {
    btnExitSkim.addEventListener('click', () => {
      ChineseSpeech.stop();
      switchScreen('home');
    });
  }

  const renderSkimCard = () => {
    if (skimIndex >= skimList.length) {
      skimCardsWrap.style.display = 'none';
      skimFinishScreen.style.display = 'flex';
      ChineseSpeech.stop();
      return;
    }

    const item = skimList[skimIndex];
    if (!item) return;

    if (skimProgressCount) skimProgressCount.textContent = `${skimIndex + 1} / ${skimList.length}`;
    if (skimTrashCount) skimTrashCount.textContent = skimTrashVal;

    const isBookmarked = starSet.has(item.id);

    skimCurrentCard.innerHTML = `
      <div class="card-image-wrap">
        ${getVocabImageMarkup(item)}
        <button class="bookmark-float-btn ${isBookmarked ? 'active-bookmarked' : ''}" id="skimBookmarkBtn" title="북마크 저장">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>

      <div class="card-content-wrap">
        <div class="card-word-row">
          <div class="word-group">
            <span class="word-hanzi ${isMizigeActive ? 'mizige-box' : ''}">${item.hanzi}</span>
            <span class="word-pinyin">${item.pinyin}</span>
          </div>
          <button class="soundwave-pill-btn" id="skimWordAudioBtn" title="단어 발음 듣기">
            <span class="soundwave-bar bar-1"></span>
            <span class="soundwave-bar bar-2"></span>
            <span class="soundwave-bar bar-3"></span>
            <span class="soundwave-bar bar-4"></span>
          </button>
        </div>

        <div class="card-meaning-row">
          <span class="pos-tag">[${item.partOfSpeech}]</span>
          <span class="meaning-text">${item.meaning}</span>
        </div>

        ${item.mnemonic ? `
          <div class="card-mnemonic-box">
            <div class="mnemonic-badge">💡 초고속 연상 암기 비법</div>
            <div class="mnemonic-text">${item.mnemonic.replace(/\n/g, '<br>')}</div>
          </div>
        ` : ''}

        <div class="card-divider"></div>

        <div class="card-example-wrap">
          <div class="example-header-row">
            <div class="example-cn">${item.exampleCn}</div>
            <button class="soundwave-pill-btn" id="skimExampleAudioBtn" title="예문 발음 듣기">
              <span class="soundwave-bar bar-1"></span>
              <span class="soundwave-bar bar-2"></span>
              <span class="soundwave-bar bar-3"></span>
              <span class="soundwave-bar bar-4"></span>
            </button>
          </div>
          <div class="example-pinyin">${item.examplePinyin}</div>
          <div class="example-ko">${item.exampleKo}</div>
        </div>

        <div class="card-level-badge">
          <span>${item.theme || "HSK 5급"} No.${item.no} · 搭配: ${item.collocation}</span>
        </div>
      </div>
    `;

    const skimBookmarkBtn = document.getElementById('skimBookmarkBtn');
    if (skimBookmarkBtn) {
      skimBookmarkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (starSet.has(item.id)) {
          starSet.delete(item.id);
          skimBookmarkBtn.classList.remove('active-bookmarked');
          showToast(`'${item.hanzi}' 북마크를 해제했어요.`);
        } else {
          starSet.add(item.id);
          skimBookmarkBtn.classList.add('active-bookmarked');
          showToast(`'${item.hanzi}' 단어를 북마크에 담았어요! :)`);
        }
        saveState();
      });
    }

    const wordBtn = document.getElementById('skimWordAudioBtn');
    const exBtn = document.getElementById('skimExampleAudioBtn');

    if (wordBtn) {
      wordBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        wordBtn.classList.add('speaking');
        ChineseSpeech.speak(item.hanzi, 'zh-CN', 0.88, null, () => {
          wordBtn.classList.remove('speaking');
        });
      });
    }

    if (exBtn) {
      exBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exBtn.classList.add('speaking');
        ChineseSpeech.speak(stripHtml(item.exampleCn), 'zh-CN', 0.95, null, () => {
          exBtn.classList.remove('speaking');
        });
      });
    }

    // ★ 단어 발음 ➔ 예문 순차 자동재생
    if (isAutoPlay) {
      ChineseSpeech.stop();
      if (wordBtn) wordBtn.classList.add('speaking');

      ChineseSpeech.speakSequence([
        { text: item.hanzi, lang: 'zh-CN', rate: 0.88, delayAfter: 350 },
        { text: stripHtml(item.exampleCn), lang: 'zh-CN', rate: 0.95, delayAfter: 200 }
      ], (seqItem, idx) => {
        if (idx === 0) {
          if (wordBtn) wordBtn.classList.add('speaking');
          if (exBtn) exBtn.classList.remove('speaking');
        } else {
          if (wordBtn) wordBtn.classList.remove('speaking');
          if (exBtn) exBtn.classList.add('speaking');
        }
      }, () => {
        if (wordBtn) wordBtn.classList.remove('speaking');
        if (exBtn) exBtn.classList.remove('speaking');
      });
    }
  };

  // 절반 돌파 팝업 없이 부드럽게 원스톱 진행
  const proceedNextSkim = (wasKnown) => {
    ChineseSpeech.stop();
    if (wasKnown) {
      skimTrashVal++;
      learnedSet.add(skimList[skimIndex].id);
      saveState();
    }

    skimIndex++;
    renderSkimCard();
  };

  if (btnSkimKnow) btnSkimKnow.addEventListener('click', () => proceedNextSkim(true));
  if (btnSkimLearn) btnSkimLearn.addEventListener('click', () => proceedNextSkim(false));

  if (btnGoToFlashcardFromSkim) {
    btnGoToFlashcardFromSkim.addEventListener('click', () => switchScreen('flashcard'));
  }

  // ---------------------------------------------------------------------------
  // 8. 2단계: 플래시카드 암기 & SRS 반복 큐 (🃏 본격 암기)
  // ---------------------------------------------------------------------------
  let flashQueue = [];
  let flashCurrentDayVocab = [];
  let flashCurrentItem = null;
  let flashIsFront = true;
  let flashTotalReviews = 0;
  let flashStartTime = 0;
  let flashDurationSeconds = 0;
  let flashStats = { hard: [], medium: [], easy: [] };

  const prepareFlashcardScreen = () => {
    flashCurrentDayVocab = getDayVocab(currentDay);
    flashQueue = [...flashCurrentDayVocab];
    flashTotalReviews = 0;
    flashStats = { hard: [], medium: [], easy: [] };
    flashStartTime = Date.now();

    flashIntroScreen.style.display = 'flex';
    flashcardTrainingWrap.style.display = 'none';
  };

  if (btnBeginFlashcard) {
    btnBeginFlashcard.addEventListener('click', () => {
      flashIntroScreen.style.display = 'none';
      flashcardTrainingWrap.style.display = 'flex';
      flashStartTime = Date.now();
      loadNextFlashcard();
    });
  }

  if (btnExitFlash) {
    btnExitFlash.addEventListener('click', () => {
      ChineseSpeech.stop();
      switchScreen('home');
    });
  }

  const loadNextFlashcard = () => {
    if (flashQueue.length === 0) {
      flashDurationSeconds = Math.max(15, Math.round((Date.now() - flashStartTime) / 1000));
      ChineseSpeech.stop();
      
      // 플래시카드 완료 처리
      completedDays.add(currentDay);
      completedDates.add(todayKey);
      saveState();

      switchScreen('result');
      return;
    }

    flashCurrentItem = flashQueue.shift();
    flashIsFront = true;
    renderFlashcardUI();
  };

  const renderFlashcardUI = () => {
    const item = flashCurrentItem;
    if (!item) return;

    if (flashProgressText) {
      const doneCount = flashCurrentDayVocab.length - flashQueue.length;
      flashProgressText.textContent = `${Math.min(flashCurrentDayVocab.length, doneCount)} / ${flashCurrentDayVocab.length}`;
    }

    if (flashSegmentedTrack) {
      const pct = Math.min(100, Math.round(((flashCurrentDayVocab.length - flashQueue.length) / flashCurrentDayVocab.length) * 100));
      flashSegmentedTrack.innerHTML = `<div class="segmented-fill" style="width:${pct}%;"></div>`;
    }

    if (flashIsFront) {
      flashInteractiveCard.className = 'skimmify-card flash-interactive-card front-mode';
      flashInteractiveCard.innerHTML = `
        <div class="flash-front-badge">
          <span>Day ${currentDay} · ${item.theme || "HSK 5급"} No.${item.no}</span>
        </div>

        <div class="flash-front-center">
          <span class="flash-front-hanzi ${isMizigeActive ? 'mizige-box' : ''}">${item.hanzi}</span>
          <span class="flash-front-pos">[${item.partOfSpeech}]</span>
        </div>

        <div class="flash-guidance-tooltip">
          💡 한자를 보고 뜻과 예문을 마음속으로 떠올려보세요.<br>
          준비되면 아래 <strong>[뒷면 보기]</strong>를 눌러주세요!
        </div>
      `;

      btnShowBack.style.display = 'block';
      srsButtonsWrap.style.display = 'none';

      if (isAutoPlay) {
        ChineseSpeech.speak(item.hanzi, 'zh-CN', 0.88);
      }

    } else {
      flashInteractiveCard.className = 'skimmify-card flash-interactive-card';
      flashInteractiveCard.innerHTML = `
        <div class="card-image-wrap">
          ${getVocabImageMarkup(item)}
        </div>

        <div class="card-content-wrap">
          <div class="card-word-row">
            <div class="word-group">
              <span class="word-hanzi ${isMizigeActive ? 'mizige-box' : ''}">${item.hanzi}</span>
              <span class="word-pinyin">${item.pinyin}</span>
            </div>
            <button class="soundwave-pill-btn" id="flashWordSoundBtn" title="단어 발음 듣기">
              <span class="soundwave-bar bar-1"></span>
              <span class="soundwave-bar bar-2"></span>
              <span class="soundwave-bar bar-3"></span>
              <span class="soundwave-bar bar-4"></span>
            </button>
          </div>

          <div class="card-meaning-row">
            <span class="pos-tag">[${item.partOfSpeech}]</span>
            <span class="meaning-text">${item.meaning}</span>
          </div>

          ${item.mnemonic ? `
            <div class="card-mnemonic-box">
              <div class="mnemonic-badge">💡 초고속 연상 암기 비법</div>
              <div class="mnemonic-text">${item.mnemonic.replace(/\n/g, '<br>')}</div>
            </div>
          ` : ''}

          <div class="card-divider"></div>

          <div class="card-example-wrap">
            <div class="example-header-row">
              <div class="example-cn">${item.exampleCn}</div>
              <button class="soundwave-pill-btn" id="flashExSoundBtn" title="예문 발음 듣기">
                <span class="soundwave-bar bar-1"></span>
                <span class="soundwave-bar bar-2"></span>
                <span class="soundwave-bar bar-3"></span>
                <span class="soundwave-bar bar-4"></span>
              </button>
            </div>
            <div class="example-pinyin">${item.examplePinyin}</div>
            <div class="example-ko">${item.exampleKo}</div>
          </div>

          <div class="card-level-badge">
            <span>搭配: ${item.collocation}</span>
          </div>
        </div>
      `;

      btnShowBack.style.display = 'none';
      srsButtonsWrap.style.display = 'flex';

      const flashWordSoundBtn = document.getElementById('flashWordSoundBtn');
      const flashExSoundBtn = document.getElementById('flashExSoundBtn');

      if (flashWordSoundBtn) {
        flashWordSoundBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          ChineseSpeech.speak(item.hanzi, 'zh-CN', 0.88);
        });
      }
      if (flashExSoundBtn) {
        flashExSoundBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          ChineseSpeech.speak(stripHtml(item.exampleCn), 'zh-CN', 0.95);
        });
      }

      if (isAutoPlay) {
        ChineseSpeech.speak(item.hanzi, 'zh-CN', 0.88);
      }
    }
  };

  if (btnShowBack) {
    btnShowBack.addEventListener('click', () => {
      flashIsFront = false;
      renderFlashcardUI();
    });
  }

  if (flashInteractiveCard) {
    flashInteractiveCard.addEventListener('click', () => {
      if (flashIsFront) {
        flashIsFront = false;
        renderFlashcardUI();
      }
    });
  }

  if (btnSrsHard) {
    btnSrsHard.addEventListener('click', () => {
      flashTotalReviews++;
      if (!flashStats.hard.some(w => w.id === flashCurrentItem.id)) {
        flashStats.hard.push(flashCurrentItem);
      }
      flashQueue.push(flashCurrentItem);
      showToast(`'${flashCurrentItem.hanzi}' 잠시 후 다시 복습해요!`);
      loadNextFlashcard();
    });
  }

  if (btnSrsMedium) {
    btnSrsMedium.addEventListener('click', () => {
      flashTotalReviews++;
      if (!flashStats.hard.some(w => w.id === flashCurrentItem.id) &&
          !flashStats.medium.some(w => w.id === flashCurrentItem.id)) {
        flashStats.medium.push(flashCurrentItem);
      }
      loadNextFlashcard();
    });
  }

  if (btnSrsEasy) {
    btnSrsEasy.addEventListener('click', () => {
      flashTotalReviews++;
      if (!flashStats.hard.some(w => w.id === flashCurrentItem.id) &&
          !flashStats.medium.some(w => w.id === flashCurrentItem.id) &&
          !flashStats.easy.some(w => w.id === flashCurrentItem.id)) {
        flashStats.easy.push(flashCurrentItem);
      }
      learnedSet.add(flashCurrentItem.id);
      saveState();
      loadNextFlashcard();
    });
  }

  // ---------------------------------------------------------------------------
  // 9. 3단계: 플래시카드 학습 결과 화면 (📊 통계 & 마스킹 복습)
  // ---------------------------------------------------------------------------
  let maskHanzi = false;
  let maskMeaning = false;

  const renderResultScreen = () => {
    const todayWords = getDayVocab(currentDay);
    const totalWords = todayWords.length;
    const reviewCountVal = flashTotalReviews || totalWords;
    const easyCount = flashStats.easy.length || (totalWords - flashStats.hard.length);
    const accuracyPct = Math.round((Math.max(1, easyCount) / totalWords) * 100);
    const totalSec = flashDurationSeconds || 75;
    const speedPerWord = (totalSec / Math.max(1, reviewCountVal)).toFixed(1);

    if (resReviewCount) resReviewCount.textContent = reviewCountVal;
    if (resAccuracy) resAccuracy.textContent = `${accuracyPct}%`;
    if (resTotalTime) resTotalTime.textContent = formatTime(totalSec);
    if (resSpeedPerCard) resSpeedPerCard.textContent = `${speedPerWord}초`;

    renderGroupedResultList();
  };

  const renderGroupedResultList = () => {
    if (!resultGroupedList) return;

    const todayWords = getDayVocab(currentDay);
    let hardList = flashStats.hard;
    let medList = flashStats.medium;
    let easyList = flashStats.easy;

    if (hardList.length === 0 && medList.length === 0 && easyList.length === 0) {
      hardList = todayWords.length > 2 ? [todayWords[2]] : [];
      medList = todayWords.length > 4 ? [todayWords[4]] : [];
      easyList = todayWords.filter(w => !hardList.includes(w) && !medList.includes(w));
    }

    const renderGroupHtml = (title, icon, list, colorClass) => {
      if (!list || list.length === 0) return '';
      return `
        <div>
          <div class="group-header" style="${colorClass}">
            <span>${icon}</span>
            <span>${title} (${list.length})</span>
          </div>
          ${list.map(w => `
            <div class="result-word-row">
              <div class="res-word-left">
                <div style="width:44px; height:44px; border-radius:10px; overflow:hidden; flex-shrink:0;">
                  ${getVocabImageMarkup(w, 'res-thumb')}
                </div>
                <div>
                  <div class="res-hanzi ${maskHanzi ? 'masked-content' : ''}" style="${maskHanzi ? 'background:#E5E7EB; color:transparent; border-radius:4px; user-select:none;' : ''}">
                    ${w.hanzi} <small style="font-size:12px; font-weight:600; color:#9CA3AF;">${w.pinyin}</small>
                  </div>
                  <div class="res-meaning ${maskMeaning ? 'masked-content' : ''}" style="${maskMeaning ? 'background:#E5E7EB; color:transparent; border-radius:4px; user-select:none; margin-top:2px;' : ''}">
                    ${w.meaning}
                  </div>
                </div>
              </div>
              <div class="res-word-right">
                <button class="soundwave-pill-btn res-audio-btn" data-hanzi="${w.hanzi}" title="발음 듣기">
                  <span class="soundwave-bar bar-1"></span>
                  <span class="soundwave-bar bar-2"></span>
                  <span class="soundwave-bar bar-3"></span>
                  <span class="soundwave-bar bar-4"></span>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    };

    resultGroupedList.innerHTML = `
      ${renderGroupHtml('몰랐던 단어', '🔴', hardList, 'color:#EF4444;')}
      ${renderGroupHtml('헷갈렸던 단어', '⚫', medList, 'color:#111827;')}
      ${renderGroupHtml('쉬웠던 단어', '🟢', easyList, 'color:#10B981;')}
    `;

    resultGroupedList.querySelectorAll('.res-audio-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const hanzi = btn.getAttribute('data-hanzi');
        btn.classList.add('speaking');
        ChineseSpeech.speak(hanzi, 'zh-CN', 0.88, null, () => {
          btn.classList.remove('speaking');
        });
      });
    });
  };

  if (toggleMaskHanzi) {
    toggleMaskHanzi.addEventListener('click', () => {
      maskHanzi = !maskHanzi;
      toggleMaskHanzi.style.background = maskHanzi ? '#10B981' : '#111827';
      toggleMaskHanzi.textContent = maskHanzi ? '단어 보이기' : '단어 가리기';
      renderGroupedResultList();
      showToast(maskHanzi ? '단어를 가렸어요. 뜻을 보고 한자를 떠올려보세요!' : '단어를 다시 표시했어요.');
    });
  }

  if (toggleMaskMeaning) {
    toggleMaskMeaning.addEventListener('click', () => {
      maskMeaning = !maskMeaning;
      toggleMaskMeaning.style.background = maskMeaning ? '#10B981' : '#111827';
      toggleMaskMeaning.textContent = maskMeaning ? '뜻 보이기' : '뜻 가리기';
      renderGroupedResultList();
      showToast(maskMeaning ? '뜻을 가렸어요. 한자를 보고 뜻을 맞혀보세요!' : '뜻을 다시 표시했어요.');
    });
  }

  if (btnGoToListeningFromResult) {
    btnGoToListeningFromResult.addEventListener('click', () => switchScreen('listening'));
  }
  if (btnGoToQuizFromResult) {
    btnGoToQuizFromResult.addEventListener('click', () => switchScreen('quiz'));
  }
  if (btnFinishLearning) {
    btnFinishLearning.addEventListener('click', () => openStreakModal());
  }

  if (btnOpenReviewModal) {
    btnOpenReviewModal.addEventListener('click', () => {
      if (reviewSettingsModal) reviewSettingsModal.classList.add('show');
    });
  }
  if (btnCloseReviewModal) {
    btnCloseReviewModal.addEventListener('click', () => {
      if (reviewSettingsModal) reviewSettingsModal.classList.remove('show');
    });
  }
  if (btnConfirmReviewSettings) {
    btnConfirmReviewSettings.addEventListener('click', () => {
      if (reviewSettingsModal) reviewSettingsModal.classList.remove('show');
      const selected = document.querySelector('input[name="reviewMode"]:checked');
      if (selected && selected.value === 'listening') {
        switchScreen('listening');
      } else {
        switchScreen('flashcard');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 10. 4단계: 듣기 모드 (🎧 뮤직 플레이어 연속 자동재생)
  // ---------------------------------------------------------------------------
  let listenList = [];
  let listenIndex = 0;
  let isListeningPlaying = false;
  let isShuffle = false;
  let isRepeat = true;

  const prepareListeningScreen = () => {
    listenList = [...getDayVocab(currentDay)];
    listenIndex = 0;
    isListeningPlaying = false;
    listenIntroScreen.style.display = 'flex';
    listenPlayerWrap.style.display = 'none';
  };

  if (btnBeginListening) {
    btnBeginListening.addEventListener('click', () => {
      listenIntroScreen.style.display = 'none';
      listenPlayerWrap.style.display = 'flex';
      isListeningPlaying = true;
      updatePlayPauseIcon();
      playListeningCurrentWord();
    });
  }

  if (btnExitListening) {
    btnExitListening.addEventListener('click', () => {
      stopListeningPlayer();
      switchScreen('home');
    });
  }

  const stopListeningPlayer = () => {
    isListeningPlaying = false;
    ChineseSpeech.stop();
    updatePlayPauseIcon();
  };

  const updatePlayPauseIcon = () => {
    if (!playPauseIcon) return;
    if (isListeningPlaying) {
      playPauseIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
    } else {
      playPauseIcon.innerHTML = `<polygon points="6 4 20 12 6 20 6 4"></polygon>`;
    }
  };

  const playListeningCurrentWord = () => {
    if (!isListeningPlaying) return;

    const item = listenList[listenIndex];
    if (!item) return;

    if (listenCounterText) {
      listenCounterText.textContent = `${listenIndex + 1} / ${listenList.length}`;
    }

    listenCardContent.innerHTML = `
      <div class="card-image-wrap">
        ${getVocabImageMarkup(item)}
      </div>
      <div class="card-content-wrap">
        <div class="card-word-row">
          <div class="word-group">
            <span class="word-hanzi ${isMizigeActive ? 'mizige-box' : ''}">${item.hanzi}</span>
            <span class="word-pinyin">${item.pinyin}</span>
          </div>
          <button class="soundwave-pill-btn speaking" id="listenSpeakingIndicator">
            <span class="soundwave-bar bar-1"></span>
            <span class="soundwave-bar bar-2"></span>
            <span class="soundwave-bar bar-3"></span>
            <span class="soundwave-bar bar-4"></span>
          </button>
        </div>

        <div class="card-meaning-row">
          <span class="pos-tag">[${item.partOfSpeech}]</span>
          <span class="meaning-text">${item.meaning}</span>
        </div>

        ${item.mnemonic ? `
          <div class="card-mnemonic-box">
            <div class="mnemonic-badge">💡 초고속 연상 암기 비법</div>
            <div class="mnemonic-text">${item.mnemonic.replace(/\n/g, '<br>')}</div>
          </div>
        ` : ''}

        <div class="card-divider"></div>

        <div class="card-example-wrap">
          <div class="example-header-row">
            <div class="example-cn">${item.exampleCn}</div>
          </div>
          <div class="example-pinyin">${item.examplePinyin}</div>
          <div class="example-ko">${item.exampleKo}</div>
        </div>
      </div>
    `;

    const cleanMeaning = item.meaning.split(',')[0].replace(/\(.*?\)/g, '').trim();

    ChineseSpeech.speakSequence([
      { text: item.hanzi, lang: 'zh-CN', rate: 0.88, delayAfter: 450 },
      { text: cleanMeaning, lang: 'ko-KR', rate: 0.95, delayAfter: 450 },
      { text: stripHtml(item.exampleCn), lang: 'zh-CN', rate: 0.92, delayAfter: 1200 }
    ], null, () => {
      if (!isListeningPlaying) return;

      if (listenIndex < listenList.length - 1) {
        listenIndex++;
        playListeningCurrentWord();
      } else if (isRepeat) {
        listenIndex = 0;
        playListeningCurrentWord();
      } else {
        stopListeningPlayer();
        showToast(`🎧 오늘(${formatDateLabel(today)}) 단어를 모두 들었어요!`);
      }
    });
  };

  if (btnPlayerPlayPause) {
    btnPlayerPlayPause.addEventListener('click', () => {
      if (isListeningPlaying) {
        stopListeningPlayer();
        showToast('⏸️ 재생을 일시 정지했어요.');
      } else {
        isListeningPlaying = true;
        updatePlayPauseIcon();
        playListeningCurrentWord();
        showToast('▶️ 연속 재생을 시작해요~');
      }
    });
  }

  if (btnPlayerNext) {
    btnPlayerNext.addEventListener('click', () => {
      listenIndex = (listenIndex + 1) % listenList.length;
      if (isListeningPlaying) playListeningCurrentWord();
    });
  }

  if (btnPlayerPrev) {
    btnPlayerPrev.addEventListener('click', () => {
      listenIndex = (listenIndex - 1 + listenList.length) % listenList.length;
      if (isListeningPlaying) playListeningCurrentWord();
    });
  }

  if (btnPlayerShuffle) {
    btnPlayerShuffle.addEventListener('click', () => {
      isShuffle = !isShuffle;
      btnPlayerShuffle.classList.toggle('active', isShuffle);
      if (isShuffle) {
        listenList.sort(() => Math.random() - 0.5);
        showToast('🔀 무작위 셔플 모드를 켰어요.');
      } else {
        listenList = [...getDayVocab(currentDay)];
        showToast('순서대로 재생할게요.');
      }
      listenIndex = 0;
      if (isListeningPlaying) playListeningCurrentWord();
    });
  }

  if (btnPlayerRepeat) {
    btnPlayerRepeat.addEventListener('click', () => {
      isRepeat = !isRepeat;
      btnPlayerRepeat.classList.toggle('active', isRepeat);
      showToast(isRepeat ? '🔁 연속 반복 재생을 켰어요.' : '반복 재생을 껐어요.');
    });
  }

  // ---------------------------------------------------------------------------
  // 11. 5단계: 실전 기출 퀴즈 (🎯 8문항 빈칸 채우기)
  // ---------------------------------------------------------------------------
  let quizQuestions = [];
  let quizIndex = 0;
  let quizScore = 0;
  let quizTimerInterval = null;
  let quizSeconds = 0;
  let quizUserHistory = [];

  const prepareQuizScreen = () => {
    quizIntroScreen.style.display = 'flex';
    quizSolvingWrap.style.display = 'none';
    quizResultView.style.display = 'none';
    clearInterval(quizTimerInterval);
  };

  if (btnBeginQuiz) {
    btnBeginQuiz.addEventListener('click', () => {
      quizIntroScreen.style.display = 'none';
      quizSolvingWrap.style.display = 'flex';
      startQuizSession();
    });
  }

  if (btnExitQuiz) {
    btnExitQuiz.addEventListener('click', () => {
      clearInterval(quizTimerInterval);
      ChineseSpeech.stop();
      switchScreen('home');
    });
  }

  const startQuizSession = () => {
    quizIndex = 0;
    quizScore = 0;
    quizSeconds = 0;
    quizUserHistory = [];

    const targetWords = getDayQuizVocab(currentDay);

    quizQuestions = targetWords.map(item => {
      const cleanSentence = item.exampleCn.replace(/<strong>(.*?)<\/strong>/g, '______').replace(/<[^>]*>/g, '');
      const primaryMeaning = item.meaning.split(',')[0].replace(/\(.*?\)/g, '').trim();

      const distractors = allVocab
        .filter(w => w.id !== item.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

      const options = [item, ...distractors].sort(() => Math.random() - 0.5);

      return {
        target: item,
        meaning: primaryMeaning,
        sentence: cleanSentence,
        options: options
      };
    });

    if (quizTimerPill) quizTimerPill.textContent = '00:00';
    quizTimerInterval = setInterval(() => {
      quizSeconds++;
      if (quizTimerPill) quizTimerPill.textContent = formatTime(quizSeconds);
    }, 1000);

    renderCurrentQuizItem();
  };

  const renderCurrentQuizItem = () => {
    if (quizIndex >= quizQuestions.length) {
      finishQuizSession();
      return;
    }

    const q = quizQuestions[quizIndex];

    if (quizItemCounter) {
      quizItemCounter.textContent = `${quizIndex + 1} / ${quizQuestions.length}`;
    }

    if (quizTargetMeaning) {
      quizTargetMeaning.textContent = q.meaning;
    }

    if (quizSentenceBox) {
      quizSentenceBox.textContent = q.sentence;
    }

    const prefixes = ['A', 'B', 'C', 'D'];
    quizOptionsGrid.innerHTML = q.options.map((opt, idx) => `
      <button class="quiz-option-pill" data-id="${opt.id}" data-hanzi="${opt.hanzi}">
        <span class="opt-prefix">${prefixes[idx]}</span>
        <span class="opt-word">${opt.hanzi}</span>
      </button>
    `).join('');

    const optionBtns = quizOptionsGrid.querySelectorAll('.quiz-option-pill');
    optionBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const selectedId = parseInt(btn.getAttribute('data-id'), 10);
        const selectedHanzi = btn.getAttribute('data-hanzi');
        handleQuizAnswer(selectedId, selectedHanzi, q, optionBtns);
      });
    });
  };

  const handleQuizAnswer = (selectedId, selectedHanzi, q, optionBtns) => {
    optionBtns.forEach(b => b.disabled = true);
    const isCorrect = (selectedId === q.target.id);

    ChineseSpeech.speak(selectedHanzi, 'zh-CN', 0.88);

    if (isCorrect) {
      quizScore++;
      optionBtns.forEach(b => {
        if (parseInt(b.getAttribute('data-id'), 10) === selectedId) {
          b.classList.add('correct-choice');
        }
      });
    } else {
      optionBtns.forEach(b => {
        const bId = parseInt(b.getAttribute('data-id'), 10);
        if (bId === selectedId) {
          b.classList.add('wrong-choice');
        } else if (bId === q.target.id) {
          b.classList.add('correct-choice');
        }
      });
    }

    quizUserHistory.push({
      target: q.target,
      isCorrect: isCorrect,
      selectedHanzi: selectedHanzi
    });

    setTimeout(() => {
      quizIndex++;
      renderCurrentQuizItem();
    }, 850);
  };

  const finishQuizSession = () => {
    clearInterval(quizTimerInterval);
    quizSolvingWrap.style.display = 'none';
    quizResultView.style.display = 'block';

    const accuracy = Math.round((quizScore / quizQuestions.length) * 100);
    if (quizFinalAccuracy) quizFinalAccuracy.textContent = `${accuracy}%`;
    if (quizSolvedCount) quizSolvedCount.textContent = `${quizQuestions.length}`;
    if (quizTotalDuration) quizTotalDuration.textContent = formatTime(quizSeconds);

    const wrongCount = quizQuestions.length - quizScore;
    if (quizWrongBadge) quizWrongBadge.textContent = `❌ 오답 ${wrongCount}`;
    if (quizCorrectBadge) quizCorrectBadge.textContent = `✅ 정답 ${quizScore}`;

    // 퀴즈 완료 시 오늘 학습 완료로 등록
    completedDays.add(currentDay);
    completedDates.add(todayKey);
    saveState();

    if (quizReviewItems) {
      quizReviewItems.innerHTML = quizUserHistory.map((rec) => `
        <div class="result-word-row">
          <div class="res-word-left">
            <span style="font-size:16px;">${rec.isCorrect ? '✅' : '❌'}</span>
            <div style="width:40px; height:40px; border-radius:8px; overflow:hidden; flex-shrink:0;">
              ${getVocabImageMarkup(rec.target, 'res-thumb')}
            </div>
            <div>
              <div class="res-hanzi">${rec.target.hanzi} <small style="font-size:12px; color:#9CA3AF;">${rec.target.pinyin}</small></div>
              <div class="res-meaning">${rec.target.meaning}</div>
            </div>
          </div>
          <div class="res-word-right">
            <button class="soundwave-pill-btn quiz-rev-audio" data-hanzi="${rec.target.hanzi}" title="발음 듣기">
              <span class="soundwave-bar bar-1"></span>
              <span class="soundwave-bar bar-2"></span>
              <span class="soundwave-bar bar-3"></span>
              <span class="soundwave-bar bar-4"></span>
            </button>
          </div>
        </div>
      `).join('');

      quizReviewItems.querySelectorAll('.quiz-rev-audio').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const hanzi = btn.getAttribute('data-hanzi');
          btn.classList.add('speaking');
          ChineseSpeech.speak(hanzi, 'zh-CN', 0.88, null, () => {
            btn.classList.remove('speaking');
          });
        });
      });
    }
  };

  if (btnFinishQuizToHome) {
    btnFinishQuizToHome.addEventListener('click', () => {
      openStreakModal();
    });
  }

  // ---------------------------------------------------------------------------
  // 12. 6단계: 연속 학습 도감 등록 모달 (🔥 Streak Modal)
  // ---------------------------------------------------------------------------
  const openStreakModal = () => {
    if (streakModal) {
      streakModal.classList.add('show');
    }
  };

  if (btnCloseStreak) {
    btnCloseStreak.addEventListener('click', () => {
      if (streakModal) streakModal.classList.remove('show');
      switchScreen('home');
      showToast('🎉 오늘 학습을 성공적으로 마쳤어요! 내일 새로운 단어가 열려요 :)');
    });
  }

  if (btnShowStreak) {
    btnShowStreak.addEventListener('click', () => {
      openStreakModal();
    });
  }

  // ---------------------------------------------------------------------------
  // 13. 7단계: 전체 어휘 도감 (📚 Library Grid & 실시간 검색)
  // ---------------------------------------------------------------------------
  let currentFilter = 'all';
  let searchQuery = '';

  const renderVocabGrid = () => {
    if (!vocabCardsGrid) return;

    const filtered = allVocab.filter(item => {
      if (currentFilter === 'starred' && !starSet.has(item.id)) return false;
      if (currentFilter === 'learned' && !learnedSet.has(item.id)) return false;
      if (currentFilter === 'unlearned' && learnedSet.has(item.id)) return false;

      if (searchQuery.trim() !== '') {
        const q = searchQuery.trim().toLowerCase();
        const hanziMatch = item.hanzi.toLowerCase().includes(q);
        const pinyinMatch = item.pinyin.toLowerCase().includes(q);
        const meaningMatch = item.meaning.toLowerCase().includes(q);
        const colloMatch = item.collocation.toLowerCase().includes(q);
        return hanziMatch || pinyinMatch || meaningMatch || colloMatch;
      }
      return true;
    });

    if (filtered.length === 0) {
      vocabCardsGrid.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:40px 10px; color:#9CA3AF;">
          <p style="font-size:24px; margin-bottom:8px;">🔍</p>
          <p style="font-weight:700;">조건에 맞는 HSK 5급 단어를 찾지 못했어요.</p>
        </div>
      `;
      return;
    }

    vocabCardsGrid.innerHTML = filtered.map(item => {
      const isBookmarked = starSet.has(item.id);

      return `
        <div class="vocab-grid-item" data-id="${item.id}" style="background:#FFFFFF; border:1px solid #E5E7EB; border-radius:18px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 2px 8px rgba(0,0,0,0.03);">
          <div style="height:120px; position:relative; overflow:hidden;">
            ${getVocabImageMarkup(item)}
            <button class="bookmark-float-btn ${isBookmarked ? 'active-bookmarked' : ''}" data-action="star" data-id="${item.id}" style="bottom:8px; right:8px; width:30px; height:30px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </button>
          </div>
          <div style="padding:12px; display:flex; flex-direction:column; gap:4px; flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="word-hanzi ${isMizigeActive ? 'mizige-box' : ''}" style="font-size:20px;">${item.hanzi}</span>
              <button class="soundwave-pill-btn grid-audio-btn" data-hanzi="${item.hanzi}" style="height:26px; padding:0 8px;">
                <span class="soundwave-bar bar-1"></span>
                <span class="soundwave-bar bar-2"></span>
                <span class="soundwave-bar bar-3"></span>
                <span class="soundwave-bar bar-4"></span>
              </button>
            </div>
            <div style="font-size:12px; color:#9CA3AF; font-weight:600;">${item.pinyin} · [${item.partOfSpeech}]</div>
            <div style="font-size:13px; font-weight:700; color:#111827; margin-top:2px;">${item.meaning}</div>
            ${item.mnemonic ? `<div style="font-size:11.5px; color:#4F46E5; background:#EEF2FF; padding:4px 8px; border-radius:6px; margin-top:4px; line-height:1.4;">💡 ${item.mnemonic.split('\n')[0]}</div>` : ''}
            <div style="font-size:11px; color:#6B7280; margin-top:auto; padding-top:6px; border-top:1px dashed #F3F4F6;">
              搭配: ${item.collocation}
            </div>
          </div>
        </div>
      `;
    }).join('');

    vocabCardsGrid.querySelectorAll('.grid-audio-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const hanzi = btn.getAttribute('data-hanzi');
        btn.classList.add('speaking');
        ChineseSpeech.speak(hanzi, 'zh-CN', 0.88, null, () => {
          btn.classList.remove('speaking');
        });
      });
    });

    vocabCardsGrid.querySelectorAll('button[data-action="star"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.getAttribute('data-id'), 10);
        if (starSet.has(id)) {
          starSet.delete(id);
        } else {
          starSet.add(id);
        }
        saveState();
        renderVocabGrid();
      });
    });
  };

  if (listSearchInput) {
    listSearchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderVocabGrid();
    });
  }

  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.getAttribute('data-filter');
      renderVocabGrid();
    });
  });

  if (btnExitList) {
    btnExitList.addEventListener('click', () => {
      switchScreen('home');
    });
  }

  // ---------------------------------------------------------------------------
  // 14. 홈 대시보드 태스크 카드 시작 버튼 리스너 바인딩
  // ---------------------------------------------------------------------------
  if (btnStartSkimFromHome) btnStartSkimFromHome.addEventListener('click', () => switchScreen('skim'));
  if (homeTaskSkim) homeTaskSkim.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') switchScreen('skim');
  });

  if (btnStartFlashFromHome) btnStartFlashFromHome.addEventListener('click', () => switchScreen('flashcard'));
  if (homeTaskFlash) homeTaskFlash.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') switchScreen('flashcard');
  });

  if (btnStartQuizFromHome) btnStartQuizFromHome.addEventListener('click', () => switchScreen('quiz'));
  if (homeTaskQuiz) homeTaskQuiz.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') switchScreen('quiz');
  });

  if (btnStartListenFromHome) btnStartListenFromHome.addEventListener('click', () => switchScreen('listening'));
  if (homeTaskListen) homeTaskListen.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') switchScreen('listening');
  });

  // 초기화 실행
  updateHomeUI();
  switchScreen('home');
});

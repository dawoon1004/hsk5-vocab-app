/**
 * 중국어(zh-CN) 및 한국어(ko-KR) 음성 자동 재생 모듈
 * - 26초 앱 시나리오: 단어 자동 재생, 예문 자동 재생, 듣기 모드 순차 자동 재생 지원
 */

const ChineseSpeech = (() => {
  let synth = null;
  let chineseVoice = null;
  let koreanVoice = null;
  let currentRate = 0.92;
  let isSequencePlaying = false;
  let autoPlayEnabled = true;

  const init = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synth = window.speechSynthesis;
      loadVoices();
      if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
  };

  const loadVoices = () => {
    if (!synth) return;
    const voices = synth.getVoices();
    
    // 중국어 음성 (zh-CN)
    chineseVoice = voices.find(v => v.lang === 'zh-CN' || v.lang === 'zh_CN') ||
                   voices.find(v => v.lang.startsWith('zh')) || null;

    // 한국어 음성 (ko-KR)
    koreanVoice = voices.find(v => v.lang === 'ko-KR' || v.lang === 'ko_KR') ||
                  voices.find(v => v.lang.startsWith('ko')) || null;
  };

  const stop = () => {
    isSequencePlaying = false;
    if (synth && synth.speaking) {
      synth.cancel();
    }
  };

  const speak = (text, lang = 'zh-CN', rate = currentRate, onStart = null, onEnd = null) => {
    if (!synth) {
      if (onEnd) onEnd();
      return;
    }

    if (synth.speaking) {
      synth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = 1.0;

    if (lang.startsWith('zh') && chineseVoice) {
      utterance.voice = chineseVoice;
    } else if (lang.startsWith('ko') && koreanVoice) {
      utterance.voice = koreanVoice;
    }

    if (onStart) utterance.onstart = onStart;
    utterance.onend = () => {
      if (onEnd) onEnd();
    };
    utterance.onerror = () => {
      if (onEnd) onEnd();
    };

    synth.speak(utterance);
  };

  /**
   * 여러 개의 음성을 차례대로 자동 재생 (예: 중국어 단어 -> 한국어 뜻 -> 중국어 예문)
   * items: [{ text: '面临', lang: 'zh-CN', rate: 0.9, delayAfter: 300 }, ...]
   */
  const speakSequence = (items, onStepStart = null, onAllEnd = null) => {
    if (!items || items.length === 0) {
      if (onAllEnd) onAllEnd();
      return;
    }

    stop();
    isSequencePlaying = true;
    let idx = 0;

    const playNext = () => {
      if (!isSequencePlaying || idx >= items.length) {
        isSequencePlaying = false;
        if (onAllEnd) onAllEnd();
        return;
      }

      const item = items[idx];
      idx++;

      if (onStepStart) onStepStart(item, idx - 1);

      speak(item.text, item.lang || 'zh-CN', item.rate || currentRate, null, () => {
        if (!isSequencePlaying) return;
        const delay = item.delayAfter || 400;
        setTimeout(() => {
          if (isSequencePlaying) playNext();
        }, delay);
      });
    };

    playNext();
  };

  const setAutoPlay = (enabled) => {
    autoPlayEnabled = enabled;
  };

  const isAutoPlay = () => autoPlayEnabled;

  return {
    init,
    speak,
    speakSequence,
    stop,
    setAutoPlay,
    isAutoPlay
  };
})();

if (typeof window !== 'undefined') {
  ChineseSpeech.init();
}


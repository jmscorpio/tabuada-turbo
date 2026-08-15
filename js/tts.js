// js/tts.js
// Web Speech API nativa em pt-BR. Degrada graciosamente quando o
// dispositivo não tem nenhuma voz pt-BR: quem chama `falar`/`vozDisponivel`
// decide o que fazer (mostrar o texto, seguir sem áudio).

let vozesCache = null;
let vozPtBR = null;

function suportaSpeechSynthesis() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function encontrarVozPtBR(vozes) {
  return (
    vozes.find((v) => /^pt[-_]br$/i.test(v.lang)) ||
    vozes.find((v) => /^pt/i.test(v.lang)) ||
    null
  );
}

/** Resolve com a lista de vozes disponíveis, aguardando `voiceschanged`
 * quando necessário (com timeout de segurança para não travar a UI). */
export function carregarVozes({ timeoutMs = 1000 } = {}) {
  return new Promise((resolve) => {
    if (!suportaSpeechSynthesis()) {
      resolve([]);
      return;
    }

    const vozesAtuais = window.speechSynthesis.getVoices();
    if (vozesAtuais && vozesAtuais.length > 0) {
      vozesCache = vozesAtuais;
      resolve(vozesAtuais);
      return;
    }

    let jaResolveu = false;
    const finalizar = () => {
      if (jaResolveu) return;
      jaResolveu = true;
      const vozes = window.speechSynthesis.getVoices() || [];
      vozesCache = vozes;
      resolve(vozes);
    };

    window.speechSynthesis.addEventListener('voiceschanged', finalizar, { once: true });
    setTimeout(finalizar, timeoutMs);
  });
}

/** true se houver alguma voz pt-BR (ou pt-*) disponível no dispositivo. */
export async function vozDisponivel() {
  const vozes = vozesCache || (await carregarVozes());
  vozPtBR = encontrarVozPtBR(vozes);
  return !!vozPtBR;
}

/** Fala o texto em pt-BR. Resolve `true` se falou até o fim, `false` se
 * não havia suporte/voz (degradação silenciosa — quem chama decide a UI). */
export async function falar(texto, { rate = 0.95 } = {}) {
  if (!suportaSpeechSynthesis()) return false;
  if (!vozPtBR) await vozDisponivel();
  if (!vozPtBR) return false;

  return new Promise((resolve) => {
    const utterancia = new SpeechSynthesisUtterance(texto);
    utterancia.lang = 'pt-BR';
    utterancia.voice = vozPtBR;
    utterancia.rate = rate;
    utterancia.onend = () => resolve(true);
    utterancia.onerror = () => resolve(false);
    window.speechSynthesis.speak(utterancia);
  });
}

export function pararFala() {
  if (suportaSpeechSynthesis()) window.speechSynthesis.cancel();
}

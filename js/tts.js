// js/tts.js
// Web Speech API nativa em pt-BR. Degrada graciosamente quando o
// dispositivo não tem nenhuma voz pt-BR: quem chama `falar`/`vozDisponivel`
// decide o que fazer (mostrar o texto, seguir sem áudio).
//
// IMPORTANTE: só consideramos vozes LOCAIS (voice.localService === true).
// Vozes "de rede" (ex.: "Google português do Brasil" no Chrome) soam mais
// naturais, mas cada fala delas é uma requisição a um servidor — isso
// quebraria a garantia de "zero rede após o 1º carregamento" do app e
// pararia de funcionar offline. Por isso a melhoria de qualidade aqui vem
// de ESCOLHER MELHOR entre as vozes locais (e deixar o responsável
// escolher manualmente), não de usar uma voz de nuvem.

let vozesCache = null;
let vozAtual = null;
let vozPreferidaURI = null;

function suportaSpeechSynthesis() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Só vozes locais (sem requisição de rede a cada fala). */
function vozesLocais(vozes) {
  return vozes.filter((v) => v.localService !== false);
}

/** Pontua a qualidade aparente de uma voz pelo nome/idioma — heurística,
 * já que não existe uma propriedade padrão de "qualidade" entre navegadores.
 * Nomes como "Enhanced"/"Premium"/"Neural" indicam vozes de melhor
 * qualidade que o usuário baixou (ex.: Ajustes > Acessibilidade > Conteúdo
 * Falado > Vozes, no iOS). */
function pontuarVoz(voz) {
  let pontos = 0;
  if (/^pt[-_]br$/i.test(voz.lang)) pontos += 10;
  else if (/^pt/i.test(voz.lang)) pontos += 5;

  const nome = voz.name.toLowerCase();
  if (/(enhanced|aprimorad|premium|neural|natural|plus|siri)/.test(nome)) pontos += 8;
  if (/(compact|robot|espeak)/.test(nome)) pontos -= 3;

  return pontos;
}

/** Ordena as vozes pt-BR locais da "melhor" pra "pior" (heurística). */
export function listarVozesPtBR(vozes = vozesCache || []) {
  return vozesLocais(vozes)
    .filter((v) => /^pt/i.test(v.lang))
    .sort((a, b) => pontuarVoz(b) - pontuarVoz(a));
}

function encontrarMelhorVozPtBR(vozes) {
  const disponiveis = listarVozesPtBR(vozes);
  if (disponiveis.length === 0) return null;

  if (vozPreferidaURI) {
    const escolhida = disponiveis.find((v) => v.voiceURI === vozPreferidaURI);
    if (escolhida) return escolhida;
  }

  return disponiveis[0]; // melhor pontuada
}

/** Define a voz preferida (persistida fora daqui, em prefs) pelo voiceURI.
 * Passe `null` pra voltar à escolha automática (melhor pontuada). */
export function definirVozPreferida(voiceURI) {
  vozPreferidaURI = voiceURI || null;
  if (vozesCache) vozAtual = encontrarMelhorVozPtBR(vozesCache);
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

/** true se houver alguma voz pt-BR local disponível no dispositivo. */
export async function vozDisponivel() {
  const vozes = vozesCache || (await carregarVozes());
  vozAtual = encontrarMelhorVozPtBR(vozes);
  return !!vozAtual;
}

/** A voz local atualmente escolhida (após vozDisponivel()/falar()), ou null. */
export function obterVozAtual() {
  return vozAtual;
}

/** Fala o texto em pt-BR, na melhor voz local disponível (ou na escolhida
 * via definirVozPreferida). Resolve `true` se falou até o fim, `false` se
 * não havia suporte/voz (degradação silenciosa — quem chama decide a UI).
 * rate=1 (velocidade natural do motor) soa menos robótico que velocidades
 * artificialmente reduzidas — dá pra ajustar se precisar. */
export async function falar(texto, { rate = 1, pitch = 1 } = {}) {
  if (!suportaSpeechSynthesis()) return false;
  if (!vozAtual) await vozDisponivel();
  if (!vozAtual) return false;

  // evita duas falas sobrepostas se chamado em sequência rápida (só
  // cancela se já tiver algo tocando — cancelar à toa no Safari/iOS às
  // vezes engole a fala seguinte)
  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    pararFala();
  }

  return new Promise((resolve) => {
    const utterancia = new SpeechSynthesisUtterance(texto);
    utterancia.lang = vozAtual.lang;
    utterancia.voice = vozAtual;
    utterancia.rate = rate;
    utterancia.pitch = pitch;
    utterancia.onend = () => resolve(true);
    utterancia.onerror = () => resolve(false);
    window.speechSynthesis.speak(utterancia);
  });
}

export function pararFala() {
  if (suportaSpeechSynthesis()) window.speechSynthesis.cancel();
}

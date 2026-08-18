// js/db.js
// Wrapper próprio sobre IndexedDB — único módulo do app que toca `indexedDB`
// diretamente. Guarda o histórico de respostas, o estado de cada fato
// (agendamento do scheduler) e o resumo de cada sessão.
//
// Importante para testabilidade: a conexão é aberta de forma preguiçosa
// (memoizada na primeira chamada), nunca no escopo do módulo — assim um
// teste em Node consegue instalar um fake em `globalThis.indexedDB` antes
// de qualquer operação de fato acontecer.

const DB_NOME = 'tabuada-turbo-db';
const DB_VERSAO = 2;

const STORE_FATOS = 'fatos';
const STORE_RESPOSTAS = 'respostas';
const STORE_SESSOES = 'sessoes';
const STORE_DIVISOES = 'divisoes';

let conexaoPromise = null;

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function abrirConexao() {
  if (conexaoPromise) return conexaoPromise;

  conexaoPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FATOS)) {
        db.createObjectStore(STORE_FATOS, { keyPath: 'chave' });
      }
      if (!db.objectStoreNames.contains(STORE_RESPOSTAS)) {
        db.createObjectStore(STORE_RESPOSTAS, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_SESSOES)) {
        db.createObjectStore(STORE_SESSOES, { keyPath: 'id', autoIncrement: true });
      }
      // v2: store de divisão (Método das Estimativas). Guard `contains`
      // garante que um banco v1 em produção só ganha esta store nova, sem
      // recriar (e perder) as 3 de cima.
      if (!db.objectStoreNames.contains(STORE_DIVISOES)) {
        db.createObjectStore(STORE_DIVISOES, { keyPath: 'id', autoIncrement: true });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return conexaoPromise;
}

async function comStore(nomeStore, modo, fn) {
  const db = await abrirConexao();
  const tx = db.transaction([nomeStore], modo);
  const store = tx.objectStore(nomeStore);
  return fn(store);
}

// ---------- fatos ----------

export async function getFato(chave) {
  return comStore(STORE_FATOS, 'readonly', (store) => promisifyRequest(store.get(chave)));
}

export async function putFato(fatoState) {
  return comStore(STORE_FATOS, 'readwrite', (store) => promisifyRequest(store.put(fatoState)));
}

export async function getTodosFatos() {
  const resultado = await comStore(STORE_FATOS, 'readonly', (store) =>
    promisifyRequest(store.getAll())
  );
  return resultado || [];
}

// ---------- respostas ----------

export async function addResposta(resposta) {
  return comStore(STORE_RESPOSTAS, 'readwrite', (store) =>
    promisifyRequest(store.add(resposta))
  );
}

export async function getTodasRespostas() {
  const resultado = await comStore(STORE_RESPOSTAS, 'readonly', (store) =>
    promisifyRequest(store.getAll())
  );
  return resultado || [];
}

// ---------- sessões ----------

export async function addSessao(sessaoResumo) {
  return comStore(STORE_SESSOES, 'readwrite', (store) =>
    promisifyRequest(store.add(sessaoResumo))
  );
}

export async function getUltimasSessoes(n) {
  const todas = await comStore(STORE_SESSOES, 'readonly', (store) =>
    promisifyRequest(store.getAll())
  );
  const ordenadas = (todas || []).slice().sort((a, b) => a.id - b.id);
  return n ? ordenadas.slice(-n) : ordenadas;
}

// ---------- divisões ----------
// NÃO usa a store `sessoes` (essa alimenta o avanço de semana da tabuada).
// Cada problema de divisão concluído vira um registro aqui; o nível atual
// vive nas prefs (nivelDivisao), como o restante das configurações do app.

export async function addDivisao(registro) {
  return comStore(STORE_DIVISOES, 'readwrite', (store) =>
    promisifyRequest(store.add(registro))
  );
}

export async function getTodasDivisoes() {
  const resultado = await comStore(STORE_DIVISOES, 'readonly', (store) =>
    promisifyRequest(store.getAll())
  );
  return (resultado || []).slice().sort((a, b) => a.id - b.id);
}

// ---------- utilidades ----------

export async function exportarTudo() {
  const [fatos, respostas, sessoes, divisoes] = await Promise.all([
    getTodosFatos(),
    getTodasRespostas(),
    getUltimasSessoes(),
    getTodasDivisoes(),
  ]);
  return { fatos, respostas, sessoes, divisoes };
}

/** Limpa as 4 stores. Usado apenas em testes. */
export async function resetParaTestes() {
  const db = await abrirConexao();
  const tx = db.transaction([STORE_FATOS, STORE_RESPOSTAS, STORE_SESSOES, STORE_DIVISOES], 'readwrite');
  await Promise.all([
    promisifyRequest(tx.objectStore(STORE_FATOS).clear()),
    promisifyRequest(tx.objectStore(STORE_RESPOSTAS).clear()),
    promisifyRequest(tx.objectStore(STORE_SESSOES).clear()),
    promisifyRequest(tx.objectStore(STORE_DIVISOES).clear()),
  ]);
}

// js/config.js
// Constantes do sistema — fonte única da verdade. Nenhum outro módulo deve
// duplicar estes números; sempre importe daqui.

// Limiares de tempo de resposta (ms)
export const T_RAPIDO = 2000;   // acerto "fluente": maior boost de meia-vida
export const T_META = 3000;     // meta de fluência da sessão
export const T_ESTRELA = 1500;  // tempo médio por conta para 3 estrelas nos jogos
export const ESTRELA_2_MAX_MS = 2500; // tempo médio por conta para 2 estrelas

// Sessão
export const MAX_NOVOS_POR_SESSAO = 3;
export const WARMUP_MIN_FATOS = 8;
export const WARMUP_MAX_FATOS = 10;

// Spaced repetition
export const HALFLIFE_INICIAL = 1;     // dias
export const HALFLIFE_CAP = 30;        // dias
export const HALFLIFE_MIN_ERRO = 0.5;  // piso após erro
export const MS_POR_DIA = 86400000;

// Maturidade de um fato
export const MATURO_HALFLIFE_MIN = 7;  // dias
export const MATURO_ULTIMAS_N = 3;

// Incremental Rehearsal
export const IR_ESPACAMENTO_MIN = 7;
export const IR_ESPACAMENTO_MAX = 8;
export const IR_REPETICOES_NOVO = 3; // nº de reaparições do fato novo no bloco

// Agrupamento semanal / avanço automático
export const SEMANA_INICIAL = 1;
export const SEMANA_MAX = 6;
export const AVANCO_SEMANA_PCT = 0.85;
export const AVANCO_SEMANA_SESSOES = 3;

// Painel dos pais
export const PIN_RESPONSAVEL = '1234';
export const TABUADAS_CONHECIDAS_DEFAULT = [3];
export const STATUS_VERMELHO_TAXA_ERRO = 0.4; // >40% de erro recente

// Foco em números complexos: fatos cujos DOIS operandos estão nesta lista
// (ex.: 2×3, 1×10) são tratados como "fáceis" e ficam com prioridade mais
// baixa na fila de revisão — só entram na sessão se sobrar espaço depois
// dos fatos difíceis disponíveis (aparecem "excepcionalmente").
export const NUMEROS_FACEIS = [1, 2, 3, 10];

// Identidade do app
export const APP_NOME = 'Tabuada Turbo';
export const CACHE_VERSAO = 'v1';

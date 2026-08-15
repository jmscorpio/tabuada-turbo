// js/analytics.js
// Tracking LOCAL de tempo/resposta — camada de integração impura que une
// scheduler.js (lógica pura) + db.js (IndexedDB) + prefs (localStorage,
// mas a leitura/escrita de prefs em si continua sendo responsabilidade
// exclusiva de app.js: aqui só calculamos os deltas e devolvemos para quem
// chamou aplicar e persistir).

import * as db from './db.js';
import { registrarResposta as schedulerRegistrarResposta, deveAvancarSemana, isFatoMaduro } from './scheduler.js';
import {
  MATURO_HALFLIFE_MIN,
  AVANCO_SEMANA_SESSOES,
  STATUS_VERMELHO_TAXA_ERRO,
  MS_POR_DIA,
} from './config.js';

/** 'YYYY-MM-DD' no fuso local (evita bugs de fuso com toISOString, que é UTC). */
function dataISOLocal(timestampMs) {
  const d = new Date(timestampMs);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Registra uma resposta: atualiza o agendamento do fato via scheduler e
 * grava tanto o fato atualizado quanto a linha de histórico em `respostas`.
 * @param {{chave:string, correto:boolean, tempoMs:number, modo:string}} evento
 * @param {number} [agora]
 */
export async function registrarResposta({ chave, correto, tempoMs, modo }, agora = Date.now()) {
  const fatoAtual = await db.getFato(chave);
  if (!fatoAtual) {
    throw new Error(`analytics.registrarResposta: fato "${chave}" não existe no banco`);
  }
  const atualizado = schedulerRegistrarResposta(fatoAtual, { correto, tempoMs, agora });
  await db.putFato(atualizado);
  await db.addResposta({ chave, correto, tempoMs, timestamp: agora, modo });
  return atualizado;
}

/**
 * Calcula o novo streak de dias consecutivos a partir das prefs atuais.
 * Pura em relação ao relógio (recebe `agora`), mas não lê/grava localStorage
 * — quem chama decide se e como persistir o resultado.
 */
export function calcularStreak(prefsAtuais, agora = Date.now()) {
  const hoje = dataISOLocal(agora);
  if (prefsAtuais.ultimaDataAcesso === hoje) {
    return { streakDias: prefsAtuais.streakDias, ultimaDataAcesso: hoje, quebrou: false };
  }
  const ontem = dataISOLocal(agora - MS_POR_DIA);
  if (prefsAtuais.ultimaDataAcesso === ontem) {
    return { streakDias: prefsAtuais.streakDias + 1, ultimaDataAcesso: hoje, quebrou: false };
  }
  const quebrou = !!prefsAtuais.ultimaDataAcesso && prefsAtuais.streakDias > 0;
  return { streakDias: 1, ultimaDataAcesso: hoje, quebrou };
}

/**
 * Grava o resumo da sessão concluída e calcula os deltas de streak e de
 * avanço de semana. NÃO grava em localStorage — devolve os valores para
 * app.js persistir via salvarPrefs.
 * @param {{totalFatos:number, acertos:number, erros:number, tempoMedioMs:number, acertoSemanaPct:number, inicioSessao:number, fimSessao:number}} resumo
 * @param {{streakDias:number, ultimaDataAcesso:string|null, semanaAtual:number}} prefsAtuais
 */
export async function registrarSessaoConcluida(resumo, prefsAtuais, agora = Date.now()) {
  await db.addSessao({
    data: dataISOLocal(agora),
    inicio: resumo.inicioSessao,
    fim: resumo.fimSessao,
    totalFatos: resumo.totalFatos,
    acertos: resumo.acertos,
    erros: resumo.erros,
    acertoSemanaPct: resumo.acertoSemanaPct,
    semana: prefsAtuais.semanaAtual,
  });

  const streak = calcularStreak(prefsAtuais, agora);

  const ultimasSessoes = await db.getUltimasSessoes(AVANCO_SEMANA_SESSOES);
  const avanca = deveAvancarSemana(
    ultimasSessoes.map((s) => ({ acertoSemanaPct: s.acertoSemanaPct })),
    prefsAtuais.semanaAtual
  );
  const semanaAtual = avanca ? prefsAtuais.semanaAtual + 1 : prefsAtuais.semanaAtual;

  return {
    streakDias: streak.streakDias,
    ultimaDataAcesso: streak.ultimaDataAcesso,
    streakQuebrou: streak.quebrou,
    semanaAtual,
    avancouSemana: avanca,
  };
}

/**
 * Status por tabuada (1..10) para o painel dos pais:
 * - 'verde'    → todos os fatos daquela tabuada estão maduros.
 * - 'vermelho' → taxa de erro recente (últimas respostas registradas dos
 *                fatos da tabuada) acima de STATUS_VERMELHO_TAXA_ERRO.
 * - 'amarelo'  → em progresso, sem dificuldade acentuada.
 */
export async function calcularStatusPorTabuada() {
  const todosFatos = await db.getTodosFatos();
  const status = {};

  for (let tabuada = 1; tabuada <= 10; tabuada++) {
    const fatosDaTabuada = todosFatos.filter((f) => f.a === tabuada || f.b === tabuada);
    if (fatosDaTabuada.length === 0) {
      status[tabuada] = 'amarelo';
      continue;
    }

    const todosMaduros = fatosDaTabuada.every((f) => isFatoMaduro(f));
    if (todosMaduros) {
      status[tabuada] = 'verde';
      continue;
    }

    const respostasRecentes = fatosDaTabuada.flatMap((f) => f.ultimasRespostas || []);
    const totalRecentes = respostasRecentes.length;
    const erros = respostasRecentes.filter((r) => !r.correto).length;
    const taxaErro = totalRecentes > 0 ? erros / totalRecentes : 0;

    status[tabuada] = taxaErro > STATUS_VERMELHO_TAXA_ERRO ? 'vermelho' : 'amarelo';
  }

  return status;
}

/**
 * Agrega as respostas dos últimos 7 dias (incluindo hoje) para o gráfico
 * simples do painel dos pais.
 */
export async function calcularUltimos7Dias(agora = Date.now()) {
  const todasRespostas = await db.getTodasRespostas();
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    dias.push(dataISOLocal(agora - i * MS_POR_DIA));
  }

  const porDia = new Map(dias.map((d) => [d, { data: d, total: 0, acertos: 0 }]));
  for (const r of todasRespostas) {
    const dia = dataISOLocal(r.timestamp);
    const bucket = porDia.get(dia);
    if (bucket) {
      bucket.total += 1;
      if (r.correto) bucket.acertos += 1;
    }
  }

  return dias.map((d) => porDia.get(d));
}

/**
 * Re-semeia como maduros os fatos das tabuadas recém-marcadas como "já
 * sabidas" pelos pais (mesma lógica de seed usada na tabuada 3 no início).
 * @param {number[]} novasConhecidas
 */
export async function aplicarTabuadasConhecidas(novasConhecidas, agora = Date.now()) {
  const todosFatos = await db.getTodosFatos();
  const atualizados = [];

  for (const fato of todosFatos) {
    const pertenceATabuadaConhecida =
      novasConhecidas.includes(fato.a) || novasConhecidas.includes(fato.b);
    if (pertenceATabuadaConhecida && !fato.introduzido) {
      const seedado = {
        ...fato,
        halfLife: Math.max(fato.halfLife, MATURO_HALFLIFE_MIN),
        introduzido: true,
        nextReview: agora,
      };
      await db.putFato(seedado);
      atualizados.push(seedado);
    }
  }

  return atualizados;
}

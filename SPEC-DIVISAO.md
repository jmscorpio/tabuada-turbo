# Tabuada Turbo — SPEC Divisão (Método das Estimativas)

Você é um engenheiro de software front-end sênior com background em educação infantil.
Este repositório já contém o Tabuada Turbo (leia `SPEC.md` e `README.md` antes de
começar — as convenções de lá valem aqui). Sua tarefa é ADICIONAR ao app um módulo de
divisão pelo **Método das Estimativas** (divisões parciais / subtrações sucessivas),
exatamente como o livro do 4º ano da escola ensina, sem quebrar nada do que existe.

## OBJETIVO PEDAGÓGICO CENTRAL
Compreensão + raciocínio flexível, não velocidade. A criança resolve divisões
retirando do dividendo múltiplos do divisor que ela mesma escolhe ("estimativas"),
quantas vezes quiser, até o resto ficar menor que o divisor. NÃO existe um único
caminho correto: subtrair 60+60+42 vale tanto quanto subtrair 120+42. O progresso
esperado é a criança passar a "tirar quantidades maiores de cada vez". Diferente do
módulo de tabuada, AQUI NÃO HÁ PRESSÃO DE TEMPO NENHUMA: nada de cronômetro visível,
nada de meta de milissegundos.

## O MÉTODO — NOTAÇÃO EXATA DO LIVRO (reproduza fielmente na tela)
A conta é organizada na "chave". Exemplo do livro, 60 ÷ 5 com estimativas variadas:

```
  60 | 5
− 10 | 2 +
  50 |
− 20 | 4 +
  30 |
− 20 | 4 +
  10 |
− 10 | 2
   0 | 12
```

Regras visuais: dividendo no alto à esquerda; divisor no alto à direita da barra
vertical, com traço horizontal embaixo dele; cada subtração (o múltiplo retirado)
fica na coluna da esquerda, sob o dividendo, com o resto parcial logo abaixo; cada
estimativa (o "quantas vezes") fica na coluna da direita, sob o divisor, seguida de
`+`; a última estimativa não leva `+`; o quociente final é a SOMA da coluna de
estimativas, escrito embaixo dela; o resto final (0 ou menor que o divisor) fica na
base da coluna esquerda. Exemplo com resto, também do livro (58 ÷ 7 → 8, resto 2) e
o exemplo 45 ÷ 5 com estimativas "5×3=15, depois 5×6=30" → 3 + 6 = 9.

## CONSTANTES NOVAS (adicione em js/config.js, seção "Divisão")
- DIV_PROBLEMAS_POR_SESSAO = 5
- DIV_NIVEL_INICIAL = 1; DIV_NIVEL_MAX = 6
- DIV_AVANCO_JANELA = 5        → olha os últimos 5 problemas do nível
- DIV_AVANCO_MIN_LIMPOS = 4    → avança de nível com 4 deles resolvidos "limpos"
  (quociente e resto certos na primeira tentativa de fechamento)
- DIV_ESTRELA_FOLGA = 2        → 2 estrelas até par+2 passos (ver Estrelas)

## LÓGICA PURA (js/divisao.js — importável e testável em Node, como scheduler.js)
Sem I/O, sem DOM, sem relógio direto; `rng` sempre injetado.

1. `gerarProblema({ nivel, fatosState, rng })` → `{ dividendo, divisor, quociente, resto, nivel, enunciado }`
   - Níveis (calibrados pelos exercícios reais do livro e do caderno):
     - Nível 1: quociente 2..9, resto 0 (ex.: 42÷6). Porta de entrada: é a tabuada
       ao contrário.
     - Nível 2: quociente 2..9, resto 1..(divisor−1) (ex.: 58÷7 → 8, resto 2).
     - Nível 3: quociente 11..30, resto 0 (ex.: 80÷5 → 16; 120÷6 → 20).
     - Nível 4: quociente 11..30, com resto (ex.: 104÷6 → 17 r 2; 165÷6 → 27 r 3).
     - Nível 5: quociente 31..99, com e sem resto (ex.: 618÷7 → 88 r 2;
       574÷7 → 82; 223÷5 → 44 r 3) — aqui entram estimativas de 50× e 80×.
     - Nível 6: quociente 100..399, dividendo até 4 dígitos, com e sem resto
       (ex.: 352÷2 → 176; 1057÷3 → 352 r 1) — estimativas de 100×, 200×, 300×.
       O caderno do 4º ano chega até aqui; é o teto do app.
   - **Escolha do divisor guiada pelo domínio da multiplicação**: receba o
     `fatosState` do módulo de tabuada (já disponível via ctx) e sorteie o divisor
     entre 2..9 dando peso maior às tabuadas com todos os fatos maduros
     (`isFatoMaduro` do scheduler) e peso menor às em treino. Nunca use divisor 1;
     divisor 10 só no nível 3+.
   - O problema é gerado a partir do quociente e resto sorteados
     (dividendo = divisor × quociente + resto), nunca por tentativa e erro.
2. `validarEstimativa({ restoAtual, divisor, vezes })` → um de:
   - `{ ok: true, retirado: vezes * divisor, novoResto }` quando `vezes >= 1` e
     `vezes * divisor <= restoAtual`;
   - `{ ok: false, motivo: 'excede' }` quando passa do resto (feedback amigável,
     NÃO conta como erro — estimar alto e corrigir faz parte do método);
   - `{ ok: false, motivo: 'invalida' }` para 0, negativo ou não-número.
3. `estadoConta` reducer puro: aplicar estimativa aceita → acumula
   `{ vezes, retirado }[]`; `contaTerminada(estado)` quando resto < divisor.
4. `parDePassos(quociente)` = nº de parcelas da decomposição por valor posicional
   (27 → 20 + 7 → 2 passos; 12 → 10 + 2 → 2; 8 → 1; 176 → 100 + 70 + 6 → 3;
   352 → 300 + 50 + 2 → 3). É a referência de "estimativa grande" que o livro
   incentiva.
5. `calcularEstrelasDivisao(passosUsados, quociente)`:
   3⭐ se passos ≤ par; 2⭐ se ≤ par + DIV_ESTRELA_FOLGA; senão 1⭐ (nunca 0).
6. `deveAvancarNivel(ultimosProblemas, nivel)` conforme DIV_AVANCO_*; nunca passa de
   DIV_NIVEL_MAX; problemas de níveis anteriores não contam para o nível atual
   (mesma lição do avanço de semana da tabuada — sem cascata).
7. Enunciados: banco de ~15 modelos com placeholders, nos dois sentidos da divisão
   (repartir em N grupos iguais × quantos grupos de N cabem), com objetos do universo
   do livro (bombons, gibis, lápis, empadas, figurinhas, metros de corda, reais).
   `gerarProblema` preenche um modelo sorteado. Metade das vezes (rng) o problema
   vem "seco" (só a conta), metade com enunciado.

## LOOP DE RESOLUÇÃO (js/ui/dividir.js)
1. Mostra o enunciado (com botão 🔊 que o TTS lê, se houver voz — mesma degradação
   graciosa do resto do app) e a chave armada com dividendo e divisor.
2. A criança digita QUANTAS VEZES quer retirar o divisor (o "2" de "2 × 5") no
   teclado do app (reutilize o teclado numérico já existente; `inputmode="none"`
   como nas outras telas, para o teclado do iOS não abrir). Antes de confirmar,
   mostre a prévia "2 × 5 = 10".
3. Confirmou: a linha "− 10 | 2 +" entra na chave com animação curta e o resto
   parcial aparece. Se a estimativa excede o resto: mensagem gentil
   ("Opa, 6 × 7 = 42 é mais do que os 30 que restam — tenta um número menor!"),
   sem punição e sem registrar erro.
4. Quando o resto fica menor que o divisor, fase de fechamento: a criança digita o
   quociente total (a soma da coluna de estimativas) e, se houver, o resto. Se
   errar a soma, modo de correção como no Praticar: mostra as parcelas
   ("2 + 4 + 4 + 2 = ?") e pede para tentar de novo — registra que não fechou de
   primeira, mas nunca bloqueia.
5. Tela de resultado do problema: estrelas por passos (mostre "você resolveu em 3
   passos!"), e quando passos > par, incentivo no espírito do livro: "Da próxima,
   tenta tirar uma quantidade maior de uma vez — chega mais rápido!". Com resto,
   uma linha de interpretação: "Sobraram 2!".
6. Sessão = DIV_PROBLEMAS_POR_SESSAO problemas; tela final de parabéns com as
   estrelas da sessão, no mesmo estilo visual do Praticar.

## TABELA DE PITÁGORAS (consulta permitida — o livro incentiva)
Botão "📋 Tabela" sempre visível durante a conta abre um overlay com a tabela de
1 a 10, cada LINHA com uma cor de fundo diferente (como no livro). Tocar numa linha
e numa coluna destaca o cruzamento. Consultar não tira estrela nem registra nada:
consulta é estratégia legítima do método. Feche no X ou tocando fora.

## PERSISTÊNCIA (js/db.js)
- Suba `DB_VERSAO` para 2 e crie a store `divisoes` no `onupgradeneeded` (os guards
  `contains` existentes já tornam a migração segura para bancos v1 em produção).
- Cada problema concluído grava em `divisoes`: `{ timestamp, dividendo, divisor,
  quociente, resto, passos, par, estrelas, fechouDePrimeira, nivel, enunciado?, duracaoMs }`.
- **NÃO grave nada de divisão na store `sessoes`**: ela alimenta o avanço de semana
  da tabuada e não pode ser poluída. O nível atual de divisão vive nas prefs
  (`nivelDivisao`), persistido por app.js como as demais.
- Sessão de divisão concluída conta para o streak de dias (reuse
  `analytics.calcularStreak` + `salvarPrefs`), sem tocar no avanço de semana.

## TELAS / INTEGRAÇÃO
- Home: 5º card grande "Dividir ➗" (ajuste a grade para 5 cards sem quebrar o
  layout de 390px). Rota `#/dividir` no roteador de app.js.
- `exportar dados (JSON)` do painel dos pais passa a incluir a store `divisoes`.
- Painel dos pais, nova seção "Divisão": nível atual (com seletor manual 1–6),
  problemas resolvidos nos últimos 7 dias, média de passos vs. par das últimas 10
  contas (é o termômetro de "estimativas maiores") e % de fechamento de primeira.
- sw.js: adicione `js/divisao.js` e `js/ui/dividir.js` ao APP_SHELL e INCREMENTE a
  `CACHE_VERSAO` atual (senão os aparelhos ficam presos no cache antigo).

## STACK E RESTRIÇÕES (idênticas ao SPEC.md — NÃO MUDE)
Vanilla ES2022, sem framework, sem bundler, sem backend, sem CDN, sem fontes
externas, zero requisições de rede após o 1º carregamento (LGPD — criança), tema e
acessibilidade (WCAG AA, toque ≥ 44px, aria-label, aria-live) como no app atual.

## O QUE EU NÃO QUERO
- Cronômetro, meta de tempo ou qualquer pressão de velocidade na divisão.
- Punição por estimativa "pequena demais" — caminho longo é caminho válido.
- Forçar o algoritmo curto tradicional ou exigir a estimativa "ótima".
- Mexer no scheduler/sessão da tabuada além do que está listado aqui.
- Vidas, ranking, compras, notificações.

## IDEIAS FUTURAS — FORA DO ESCOPO DESTA ENTREGA (não implemente agora)
Deixe a arquitetura aberta para elas (banco de enunciados extensível, gerador por
nível parametrizável), mas NÃO as construa nesta entrega:
- Problemas de múltiplas etapas, como os do caderno: somar cédulas antes de
  repartir; subtrair o valor pago à vista e dividir o restante em prestações,
  comparando com um limite ("a prestação fica menor que 90 reais?"); dividir a
  economia pelo período e subtrair do salário. A divisão é uma etapa no meio de
  uma cadeia de operações e de uma comparação final.
- Desafio "segredo da sequência": um conjunto de divisões cujos quocientes formam
  um padrão a descobrir (no caderno: 352, 176, 88, 44, 22, 11 — cada um é a metade
  do anterior). Vira um ótimo minijogo de raciocínio na tela Jogar.
- Interpretação do resto em contexto ("sobraram 2 reais", "precisa de mais uma
  caixa"), com pergunta de compreensão após a conta.

## MODO DE TRABALHO
1. Leia SPEC.md, README.md e o código existente antes de escrever qualquer coisa.
2. `js/divisao.js` primeiro, com `tests/divisao.test.js` (node:test, rng
   determinístico, mesmo padrão dos testes atuais): geração respeita nível e pesos
   por tabuada madura; validador; par/estrelas; avanço de nível sem cascata;
   dividendo = divisor × quociente + resto sempre.
3. Depois a UI, reutilizando componentes/CSS existentes (pergunta-card, teclado,
   botões, feedback) — crie classes novas só para a chave da divisão.
4. Rode `node --test tests/*.test.js` a cada bloco; a suíte INTEIRA (tabuada
   incluída) tem que continuar verde.
5. Sirva com `python3 -m http.server 8000` e valide no navegador sem erros de console.
6. Atualize o README (nova seção "Dividir" + critérios manuais) por último.

## CRITÉRIOS DE PRONTO — AUTOMÁTICOS
- [ ] `node --test tests/*.test.js` passa com os testes novos E os antigos
- [ ] Uma sessão de divisão é completável de ponta a ponta no nível 1
- [ ] 60÷5 aceita tanto seis "2+" quanto "10, 2" quanto "12 direto" — todos válidos
- [ ] 58÷7 fecha com quociente 8 e resto 2; a UI pede e valida o resto
- [ ] 618÷7 (nível 5) é resolvível por caminhos diferentes (ex.: 50+30+8 ou 80+8)
      e fecha com quociente 88 e resto 2
- [ ] Estimativa que excede o resto é recusada com mensagem gentil e sem registro de erro
- [ ] Banco v1 existente migra para v2 sem perder dados de tabuada
- [ ] App recarrega offline com os arquivos novos no cache

## CRITÉRIOS MANUAIS (deixe listados no README para o responsável)
- [ ] No iPhone: a chave da divisão continua legível em conta de nível 6 (uma
      criança pode usar 8+ estimativas — a área da chave deve rolar verticalmente
      sem esconder o dividendo/divisor nem o teclado)
- [ ] Teclado do app funciona sem o teclado do iOS abrir por cima
- [ ] Tabela de Pitágoras abre, destaca o cruzamento e fecha sem travar a conta
- [ ] TTS lê o enunciado em pt-BR e degrada graciosamente sem voz

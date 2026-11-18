/* Exemplos de referência do padrão (seções 3.8, 4.6 e 8.7), adaptados às
 * decisões do Fred de 17/11/2026:
 *  - sem a linha de saudação (ele escreve);
 *  - sem nada da Sal Energia: os exemplos 3.8 usam usinas reais do mapeamento
 *    e os contatos da seção 10 (2C = Carol, Thopen = Iago, Renogrid = Vitor);
 *  - sem frases que anunciam cordialidade.
 * O texto (tom, estrutura, formatação) é o dos exemplos originais. */

// 3.8 — Exemplo 1: escopo, responsabilidade e HH extra (2C Energia)
const ex1 = `Para mantermos o alinhamento sobre a manutenção corretiva da drenagem na *UFV Sete Lagoas*, no cruzamento da vala com os cabos CC, detalho abaixo a atuação de cada parte:

*Responsabilidades da Empresa Contratada:*
• Execução da escavação e das obras da vala de drenagem.
• Movimentação segura dos cabos CC.
• Execução do envelopamento de concreto dos cabos, conforme previsto em projeto.

*Atuação da Grid:*
1. Acompanhar a atividade no local para orientar a equipe e garantir a segurança das instalações.
2. Desligar o inversor correspondente antes do início das intervenções nos cabos, assegurando que o trecho esteja totalmente sem energia para o trabalho da contratada. _(Lembrando que, caso os serviços ocorram em período noturno ou fora do horário comercial regular, precisaremos alinhar previamente os custos de homem-hora extra da nossa equipe, conforme previsto contratualmente.)_
3. Religar o inversor e validar a operação assim que a contratada concluir os trabalhos no trecho.

Diante disso, aguardo a confirmação da data exata da intervenção para que possamos programar e mobilizar nossa equipe técnica em campo.

Qualquer dúvida, sigo à disposição!`;

// 3.8 — Exemplo 2: diagnóstico com riscos e decisão, dividido em 2 caixas (Thopen)
const ex2a = `Em resposta ao seu questionamento sobre o Inversor 2.1 da *UFV Nova Londrina II*, apresentamos abaixo o diagnóstico técnico da falha identificada e o plano de ação proposto pela equipe da Grid:

*1. Diagnóstico Técnico:*
• Identificamos que a causa da baixa geração e da sinalização de falha no inversor decorre do fusível CC queimado na String 9 (Mesa 6, String 2).
• No momento, não há dispositivo fusível sobressalente disponível em estoque na usina para substituição imediata.
• Observação operacional: constatamos que já existem outros inversores na usina operando sem esse fusível de proteção específico — a exemplo do Inversor 3.1 —, condição pré-existente e não realizada pela Grid.`;

const ex2b = `*2. Plano de Ação para Normalização:*
Para restabelecer a operação plena do Inversor 2.1 com todas as 9 strings conectadas, a alternativa técnica imediata é realizar a ligação provisória sem o fusível CC.
• Riscos técnicos envolvidos: sem o fusível CC, o circuito dependerá exclusivamente das proteções internas do inversor. Em eventual surto nessa string, o inversor desarmará para garantir sua autoproteção.

*3. Próximos Passos (Alinhamento):*
Solicitamos a sua validação para definirmos o direcionamento operacional:
• *Opção A:* autorização para a Grid realizar a ligação provisória da String 9 sem o fusível CC, restabelecendo a capacidade total do inversor de imediato; ou
• *Opção B:* previsão de envio/disponibilização da nova peça para programarmos a substituição do componente.

Ficamos no aguardo de sua decisão para mobilizar a equipe técnica.
Qualquer dúvida, sigo à disposição!`;

// 3.8 — Exemplo 3: solicitação de acesso preventivo (2C Energia)
const ex3 = `Como parte do cronograma de manutenção preventiva mensal sob responsabilidade da Grid, solicitamos a liberação de acesso ao rack onde o nobreak está instalado na *UFV Araputanga*.

A intervenção tem como finalidade a inspeção técnica do equipamento, abrangendo a medição das tensões de entrada e saída, além da avaliação dos níveis de tensão do banco de baterias, assegurando o pleno funcionamento e a confiabilidade do sistema auxiliar.

Ficamos no aguardo da sua autorização para alinharmos o acesso junto à equipe em campo.
Seguimos à disposição!`;

// 3.8 — Exemplo 4: esclarecimento de fluxo/conduta (Renogrid)
const ex4 = `Quanto ao primeiro ponto, estamos plenamente de acordo com o fluxo operacional proposto. Apenas ressaltamos a importância de que a comunicação de insucesso no religamento remoto seja feita prontamente pelo COS ou pela equipe da Renogrid, viabilizando o acionamento e deslocamento célere da equipe Grid para atendimento presencial na *UFV Colíder I*.

Sobre o segundo ponto, compreendido e perfeitamente alinhado. Gostaríamos apenas de esclarecer que em momento algum houve a intenção de sobrepor ou desconsiderar as diretrizes do responsável local. Tratou-se de uma situação pontual e emergencial em campo, em que o técnico solicitou unicamente a abertura do portão a outro colaborador que estava acessível no local para agilizar o restabelecimento da operação.

Reiteramos nosso compromisso com os canais alinhados e seguimos à disposição.`;

// 4.6 — Exemplo modelo para técnico
const ex46 = `Conforme levantamento do PCM, as preventivas abaixo estão com prazo vencido no painel de atividades:

• 🔴 *UFV Colorado I* — preventiva mensal de inversores, vencida em 10/11
• 🟠 *UFV Sarandi* — inspeção termográfica, vencida em 14/11
• 🟡 *UFV Mandaguaçu* — limpeza de sala elétrica, vence em 19/11

Preciso que você me informe:
1. O motivo do atraso em Colorado I e Sarandi;
2. A data prevista de execução de cada uma.

Retorno ainda hoje, por favor.
Aguardo retorno.`;

// 8.7 — Texto de envio do relatório
const exEnvio = `Encaminhamos em anexo o Relatório de Ocorrência referente à condição da via de acesso à *UFV Tupi Paulista I*, com a cronologia da vistoria realizada em 16/11, os riscos identificados, as evidências fotográficas e as recomendações para recuperação do trecho.

Solicitamos, por gentileza, o posicionamento da 2C Energia quanto à recuperação do acesso, com previsão de execução. A Grid permanece à disposição para acompanhar a vistoria no local com a empresa contratada.

Seguimos à disposição.`;

// seção 6 — e-mail
const exEmail = {
  assunto: 'UFV Tupi Paulista I — Condição crítica da via de acesso',
  texto: `Encaminhamos em anexo o Relatório de Ocorrência da UFV Tupi Paulista I, com a cronologia da vistoria realizada em 16/11/2026, os riscos identificados no trecho de aclive e as evidências fotográficas do local.

A via apresenta processo erosivo ativo, com sulcos profundos nas trilhas de roda e ausência de drenagem, o que representa risco à equipe de O&M e à continuidade do atendimento à usina.

Solicitamos o posicionamento da 2C Energia quanto à recuperação do acesso, com previsão de execução.

Seguimos à disposição.

Atenciosamente,`,
};

// e-mail real enviado pelo Fred em 18/11/2026 (pedido de aprovação interno)
const exEmailCompra = {
  assunto: 'Solicitação de compra — CFTV — UFV Nova Xavantina I e II',
  texto: `Conforme solicitado pelo cliente Renogrid, solicito a aprovação para a compra de 6 switchs, para a normalização do sistema de CFTV das *UFV Nova Xavantina I* e *UFV Nova Xavantina II*, conforme proposta em anexo.

O custo total será incluído no BM da Renogrid com envio previsto para o dia 25/11/2026. As condições comerciais para esta aquisição são:

- Valor: R$ 3.474,00
- Pagamento: 03x no boleto (30/60/90 dias).
- Prazo de entrega: postagem em até 3 dias úteis.
- Frete: CIF

Fico no aguardo para seguir com o retorno ao cliente.

Atenciosamente,`,
};

const ENVIO_DIA_UTIL_MANHA = '2026-11-17T09:00:00-03:00';

module.exports = { ex1, ex2a, ex2b, ex3, ex4, ex46, exEnvio, exEmail, exEmailCompra, ENVIO_DIA_UTIL_MANHA };

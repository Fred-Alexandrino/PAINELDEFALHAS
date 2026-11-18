# Padrão de Comunicação e Geração de Relatórios — Grid Co. (O&M)

> **Para quem é este arquivo:** desenvolvedor (ou Claude Code) que vai implementar no dashboard da Central O&M a geração de mensagens (WhatsApp/e-mail) e de relatórios (Relatório de Ocorrência DOCX/PDF e Relatório de Evidências de OS do Nexus).
> **Fonte:** consolidado dos docs do Project "COMUNICAÇÃO GRID" (`instrucoes_comunicacao_clientes.txt`, `instrucoes_comunicacao_tecnicos.md`, `claude/padrao_relatorio_ocorrencia.md`, `mapeamento_ufvs_grid.md`) e das skills `grid-relatorio-ocorrencia` e `evidencias-os-nexus` (texto integral nos Anexos A e B).
> **Responsável pelo padrão:** Fred Alexandrino — Supervisor de O&M, Grid Co.
> **Versão:** 1.1 — 17/11/2026

> **Decisões do Fred em 17/11/2026 (valem sobre o restante do texto):**
> 1. **Cliente encerrado fora de tudo**: o antigo contrato do Ceará (5 UFVs) saiu do mapeamento, dos exemplos e das diretrizes. Os exemplos da seção 3.8 usam usinas do mapeamento atual.
> 2. **Usinas "Temporária"**: não se aplicam ao módulo de comunicação (regra removida da seção 10).
> 3. **Saudação**: na Central de Mensagens quem escreve a saudação é o Fred. A IA começa direto no corpo; os validadores não exigem saudação (avisam se a IA escrever uma). O encerramento é conferido só na **última** caixa.
> 4. **Cordialidade não se anuncia**: nada de "Solicitamos, de forma cordial, ...". A cordialidade aparece no tom e na escolha das palavras (validador avisa).
> 5. **E-mail**: o gerador entrega só **assunto + texto** (sem endereços de destinatários).
> 6. **Sem contato fixo de cliente**: com quem falar muda conforme o assunto (ex.: Iago, o coordenador Gabriel, Paula, Marcelo Galvão). A Central não direciona a mensagem de cliente para ninguém: o Fred escolhe o cliente e, se quiser, digita "Para quem". As regras de contato por cliente da seção 10 ficam sem efeito. Para técnico continua valendo o responsável da UFV.
> 7. **Usinas juntas** (mesmo local): Canarana I e II; União I e II; Nova Londrina I e II; Pharmas II, III e IV; Coração I e II; Guatambu I–IV; Aparecida do Taboado I e II (campo `conjunto` de `/mapeamento-ufvs`).
> 8. **Prints**: a Central aceita até 4 prints por mensagem; a IA lê o conteúdo sem citar a origem.
> 9. **Implementação (Fase 1)**: página **Central de Mensagens** no grupo Comunicação; módulo em JavaScript (`comunicacao/*.js`, sem TypeScript/React no projeto) e backend em `comunicacao_mensagens.py` (repo `painel-falhas`), IA via Gemini.
>
> **Decisões do Fred em 18/11/2026 (a partir do e-mail real de compra de switches de Nova Xavantina, comparando rascunho × sugestão × enviado):**
> 10. **E-mail termina em "Atenciosamente,"**: a assinatura vem do Outlook (imagem). Nome/cargo/empresa em texto ficam fora (validador avisa). Substitui a "assinatura completa" da seção 6.
> 11. **Pessoa verbal do rascunho**: se o Fred escreve "solicito", o texto fica na 1ª pessoa do singular.
> 12. **Prints entram no texto**: valor total, quantidades, prazos e condições lidos da proposta anexada (ex.: "- Valor: R$ 3.474,00").
> 13. **Condições comerciais em lista "- "** no e-mail; frete só com a modalidade (CIF/FOB; "SIF" = CIF), sem explicação entre parênteses nem acréscimos que o rascunho não traz.
> 14. **Pedido de aprovação** fecha ligando a espera ao próximo passo ("Fico no aguardo para seguir com o retorno ao cliente.").

Sugestão de lugar no repositório: `docs/PADRAO_COMUNICACAO_RELATORIOS_GRID.md`. Se o projeto usa Claude Code, referencie este arquivo no `CLAUDE.md` (ex.: "Antes de mexer em qualquer gerador de texto ou relatório, leia `docs/PADRAO_COMUNICACAO_RELATORIOS_GRID.md`").

---

## Sumário

1. Visão geral — o que o dashboard precisa gerar
2. Regra de ouro da entrega (texto para copiar)
3. Comunicação com CLIENTES
4. Comunicação com TÉCNICOS
5. Formatação WhatsApp — especificação exata
6. E-mail — especificação
7. Linguagem formal: o que nunca aparece em documento oficial
8. Relatório de Ocorrência (DOCX + PDF) — especificação completa
9. Relatório de Evidências de OS (Nexus) — especificação
10. Roteamento: usina → cliente → destinatários
11. Implementação no dashboard (arquitetura, modelos, validadores, prompt de IA, UI)
12. Checklists de QA
13. Prompt para pedir a implementação no chat (Claude Code / dashboard Central O&M)
- Anexo A — Skill `grid-relatorio-ocorrencia` (integral)
- Anexo B — Skill `evidencias-os-nexus` (integral)
- Anexo C — Script de referência do Relatório de Ocorrência (Node: `docx` + `sharp`)

---

## 1. Visão geral — o que o dashboard precisa gerar

| # | Saída | Destinatário | Canal / formato | Tom |
|---|---|---|---|---|
| 1 | Comunicado ao cliente | Cliente (Carol/2C, Iago/Thopen, Renogrid via Vitor + técnico etc.) | WhatsApp (texto) ou e-mail | Formal-cordial, político, contratual |
| 2 | Mensagem ao técnico | Técnico/eletricista/mantenedor da usina | WhatsApp (texto) | Direto, cordial, objetivo, sem tom punitivo |
| 3 | Relatório de Ocorrência | Cliente (e arquivo interno) | DOCX + PDF no padrão visual Grid | Formal, técnico, factual |
| 4 | Relatório de Evidências de OS | Anexo da OS no Nexus/Fracttal | PDF (reportlab) + pacote de fotos + `evidencias.json` | Formal, técnico, sem citar WhatsApp |
| 5 | Texto de envio do relatório | Cliente | Bloco de texto separado do arquivo | Formal-cordial |

Toda saída de texto tem **três camadas** que o dashboard deve manter separadas na UI e no modelo de dados:

```
introducao   → comentário curto do sistema/IA (NUNCA vai para o destinatário)
mensagens[]  → um ou mais textos prontos para copiar (cada um numa caixa com botão Copiar)
observacoes  → inconsistências, ambiguidades, sugestões (NUNCA vai para o destinatário)
```

---

## 2. Regra de ouro da entrega (texto para copiar)

Esta regra vale para **todo** o projeto e é a mais importante para a UI:

1. **Todo texto pronto para envio aparece numa caixa própria com botão "Copiar"** (no chat do Claude isso é um bloco de código ``` ```; no dashboard, um componente `CopyBox`).
2. **Vale mesmo quando acompanha outro entregável** (PDF, DOCX, planilha): o arquivo é entregue e, separadamente, o texto de envio vem na caixa de copiar.
3. **Introdução fica FORA da caixa** — antes dela, curta.
4. **Observações e inconsistências ficam DEPOIS da caixa**, nunca misturadas ao texto a copiar.
5. **Mais de uma mensagem = mais de uma caixa.** Comunicados longos ao cliente são divididos (ex.: caixa 1 = diagnóstico; caixa 2 = opções/encaminhamento).
6. **A cada ajuste pedido, reenviar o texto completo corrigido** (nunca só o trecho alterado). No dashboard: a edição gera uma nova versão inteira da mensagem; o histórico guarda as anteriores.
7. **A formatação de WhatsApp é preservada dentro da caixa** (`*negrito*`, `_itálico_`, bullets `•`). O botão Copiar copia o texto cru, sem HTML.
8. **Sem metalinguagem dentro da caixa:** nada de "Aqui está o texto:", "Segue a mensagem:", "Espero ter ajudado!".
9. Para WhatsApp: **só o texto pronto**, sem comentários — a não ser que exista inconsistência real nos dados (aí vai em `observacoes`).

Exemplo de renderização esperada no dashboard:

```
[introdução curta — opcional]
┌───────────────────────────────────────── [Copiar] ┐
│ Olá, Iago. Tudo bem?                              │
│ ...                                               │
└───────────────────────────────────────────────────┘
┌───────────────────────────────────────── [Copiar] ┐
│ (segunda mensagem, se houver)                     │
└───────────────────────────────────────────────────┘
⚠️ Observações: horário de início divergente entre a nota da OS (08h10) e o relato (08h40).
```

---

## 3. Comunicação com CLIENTES

### 3.1 Diretriz operacional (zero-shot, sem metalinguagem)
- Ao processar rascunho, anotação ou áudio de campo, a saída é **estritamente o texto pronto para envio**.
- **Filtro de bastidores:** eliminar conversas internas, desabafos, ruídos interpessoais, "reunião de corredor". A mensagem só contém:
  1. **Diagnóstico técnico**
  2. **Impacto / risco**
  3. **Ações da equipe**
  4. **Direcionamento / próximos passos**

### 3.2 Tom, postura e diplomacia
- **Tom político e cordial.** Quando o cliente fizer apontamento sobre canal de comunicação ou conduta em campo: validar o fluxo, acolher o apontamento e esclarecer os fatos **sem confronto e sem defensividade**.
- **Saudações padronizadas** (usar o primeiro nome do interlocutor):
  - "Boa tarde, [Nome]. Tudo bem?"
  - "Olá, [Nome]. Tudo bem?"
  - "Prezados, bom dia." (fornecedores ou mensagens coletivas)
  - Regra de período: até 11h59 → "Bom dia"; 12h00–17h59 → "Boa tarde"; 18h+ → "Boa noite". Se o horário de envio for incerto, usar "Olá".
- **Encerramentos corteses** (escolher um):
  - "Seguimos à disposição."
  - "Qualquer dúvida, sigo à disposição!"
  - "Fico à disposição para quaisquer esclarecimentos adicionais."

### 3.3 Gestão de prazos
- **Nunca prometer data fechada** quando a entrega depender de terceiros: concessionária, homologação, autorização do cliente, prazos de fabricante (Solis, Carmehil, Transfortech etc.). Usar "assim que houver retorno do fabricante", "previsão a confirmar".
- **Data proposta pelo cliente** (ex.: 01/09): validar se a janela é suficiente e reforçar que a equipe está empenhada em atender com celeridade.

### 3.4 Urgência e criticidade
- Falhas graves (proteção de QGBT inoperante, paralisação de geração, cobrança em nível de diretoria): tom **firme e estruturado**, enfatizando o risco técnico e a necessidade de **posicionamento urgente**.

### 3.5 Amparo contratual e escopo
- **Janela regular:** atividades presenciais inclusas no contrato em **dias úteis, das 07h às 17h**.
- **Trabalho extraordinário/noturno:** após 17h, madrugada, fim de semana ou feriado → incluir a ressalva de faturamento via **tabela de Homem-Hora (HH Extra / Noturno)** prevista na proposta contratual. Texto-padrão:
  > _(Lembrando que, caso os serviços ocorram em período noturno ou fora do horário comercial regular, precisaremos alinhar previamente os custos de homem-hora extra da nossa equipe, conforme previsto contratualmente.)_
- **Divisão de responsabilidades:**
  - **Grid:** monitoramento, acompanhamento técnico de segurança, manobras de abertura e religamento de inversores/trafos, validação final de laudos.
  - **Terceirizadas/contratadas do cliente:** execução civil (escavação, drenagem, envelopamento de cabos em concreto) e serviços especializados (ex.: tratamento de óleo por termovácuo).
- **Preventiva:** sempre introduzir como parte do _"cronograma de manutenção preventiva mensal sob responsabilidade da Grid"_.
- **Corretiva/emergencial:** pontuar a necessidade de alinhamento prévio ou solicitação de datas com antecedência.

### 3.6 Vocabulário e nomenclatura
- **Usinas:** sempre com designação formal "UFV <Nome>" (ex.: **UFV Nova Londrina II**, **UFV Tupi Paulista I**, **UFV Colíder I**). Algarismos romanos conforme o mapeamento (I, II, III, IV).
- **Equipamentos:** UFV, Trafo / Transformador de 2,5 MVA, Cabos CC, Strings, Fusível CC, Inversor (ex.: Inversor 2.1, Solis 110 kW), QGBT, Rack de comunicação, Datalogger, Conversores de mídia, Fibra óptica, CFTV (Speed Dome, Bullet, PTZ).
- **Faturamento:** **BM (Boletim de Medição)**; citar prazos de carência contratual quando aplicável.
- **Documentos anexados nunca vão "secos":** sempre explicar o conteúdo e a evidência. Ex.: _"encaminhamos em anexo a OS 11030 com as fotos da placa instalada e da retirada"_.

### 3.7 Estrutura padrão do comunicado ao cliente
1. **Saudação cordial**
2. **Contextualização / diagnóstico técnico** — equipamento + causa-raiz (se confirmada; se não, "em análise")
3. **Plano de ação / opções com riscos** — bullets ou letras (Opção A / Opção B), cada uma com risco técnico
4. **Alinhamento contratual** (se aplicável) — HH Extra, escopo da contratada
5. **Próximos passos e fechamento** — pedido expresso de aprovação, previsão ou aviso de acompanhamento

### 3.8 Exemplos reais (referência de tom — use como few-shot no prompt)

**Exemplo 1 — Escopo, responsabilidade e HH extra**
```
Olá, Carol. Tudo bem?

Para mantermos o alinhamento sobre a manutenção corretiva da drenagem na *UFV Sete Lagoas*, no cruzamento da vala com os cabos CC, detalho abaixo a atuação de cada parte:

*Responsabilidades da Empresa Contratada:*
• Execução da escavação e das obras da vala de drenagem.
• Movimentação segura dos cabos CC.
• Execução do envelopamento de concreto dos cabos, conforme previsto em projeto.

*Atuação da Grid:*
1. Acompanhar a atividade no local para orientar a equipe e garantir a segurança das instalações.
2. Desligar o inversor correspondente antes do início das intervenções nos cabos, assegurando que o trecho esteja totalmente sem energia para o trabalho da contratada. _(Lembrando que, caso os serviços ocorram em período noturno ou fora do horário comercial regular, precisaremos alinhar previamente os custos de homem-hora extra da nossa equipe, conforme previsto contratualmente.)_
3. Religar o inversor e validar a operação assim que a contratada concluir os trabalhos no trecho.

Diante disso, aguardo a confirmação da data exata da intervenção para que possamos programar e mobilizar nossa equipe técnica em campo.

Qualquer dúvida, sigo à disposição!
```

**Exemplo 2 — Diagnóstico com riscos e tomada de decisão** (ideal dividir em 2 caixas: diagnóstico | opções)
```
Olá, Iago. Tudo bem?

Em resposta ao seu questionamento sobre o Inversor 2.1 da *UFV Nova Londrina II*, apresentamos abaixo o diagnóstico técnico da falha identificada e o plano de ação proposto pela equipe da Grid:

*1. Diagnóstico Técnico:*
• Identificamos que a causa da baixa geração e da sinalização de falha no inversor decorre do fusível CC queimado na String 9 (Mesa 6, String 2).
• No momento, não há dispositivo fusível sobressalente disponível em estoque na usina para substituição imediata.
• Observação operacional: constatamos que já existem outros inversores na usina operando sem esse fusível de proteção específico — a exemplo do Inversor 3.1 —, condição pré-existente e não realizada pela Grid.
```
```
*2. Plano de Ação para Normalização:*
Para restabelecer a operação plena do Inversor 2.1 com todas as 9 strings conectadas, a alternativa técnica imediata é realizar a ligação provisória sem o fusível CC.
• Riscos técnicos envolvidos: sem o fusível CC, o circuito dependerá exclusivamente das proteções internas do inversor. Em eventual surto nessa string, o inversor desarmará para garantir sua autoproteção.

*3. Próximos Passos (Alinhamento):*
Solicitamos a sua validação para definirmos o direcionamento operacional:
• *Opção A:* autorização para a Grid realizar a ligação provisória da String 9 sem o fusível CC, restabelecendo a capacidade total do inversor de imediato; ou
• *Opção B:* previsão de envio/disponibilização da nova peça para programarmos a substituição do componente.

Ficamos no aguardo de sua decisão para mobilizar a equipe técnica.
Qualquer dúvida, sigo à disposição!
```

**Exemplo 3 — Solicitação de acesso preventivo**
```
Boa tarde, Carol. Tudo bem?

Como parte do cronograma de manutenção preventiva mensal sob responsabilidade da Grid, solicitamos a liberação de acesso ao rack onde o nobreak está instalado na *UFV Araputanga*.

A intervenção tem como finalidade a inspeção técnica do equipamento, abrangendo a medição das tensões de entrada e saída, além da avaliação dos níveis de tensão do banco de baterias, assegurando o pleno funcionamento e a confiabilidade do sistema auxiliar.

Ficamos no aguardo da sua autorização para alinharmos o acesso junto à equipe em campo.
Seguimos à disposição!
```

**Exemplo 4 — Esclarecimento político de fluxo/conduta**
```
Boa tarde, Vitor. Tudo bem?

Quanto ao primeiro ponto, estamos plenamente de acordo com o fluxo operacional proposto. Apenas ressaltamos a importância de que a comunicação de insucesso no religamento remoto seja feita prontamente pelo COS ou pela equipe da Renogrid, viabilizando o acionamento e deslocamento célere da equipe Grid para atendimento presencial na *UFV Colíder I*.

Sobre o segundo ponto, compreendido e perfeitamente alinhado. Gostaríamos apenas de esclarecer que em momento algum houve a intenção de sobrepor ou desconsiderar as diretrizes do responsável local. Tratou-se de uma situação pontual e emergencial em campo, em que o técnico solicitou unicamente a abertura do portão a outro colaborador que estava acessível no local para agilizar o restabelecimento da operação.

Reiteramos nosso compromisso com os canais alinhados e seguimos à disposição.
```
> Nota: exemplos de referência de tom, com usinas do mapeamento atual e os contatos da seção 10. Na Central de Mensagens a saudação é escrita pelo Fred; os testes usam estes textos sem a linha de saudação.

---

## 4. Comunicação com TÉCNICOS

### 4.1 Tom
- Direto, cordial, sem informalidade excessiva e sem dureza desnecessária.
- Português do Brasil. Trata pelo **primeiro nome**.
- **Sem ameaças, sem tom punitivo** — comunicar a exigência e a consequência de forma factual.
- Frases curtas, sem adjetivos e floreios.

### 4.2 Estrutura padrão (WhatsApp)
1. **Saudação + nome** — "Olá, [Nome]. Tudo bem?" ou "Bom dia, [Nome]."
2. **Fato objetivo com fonte** — "Conforme levantamento do PCM...", "Conforme painel de atividades..."
3. **Dados concretos** — datas, números, prazos **sem arredondar nem generalizar**. Várias usinas/itens → bullets "•".
4. **O que se espera** — lista numerada quando houver mais de uma pergunta/ação; direto ("Preciso que você...").
5. **Prazo explícito** — data ou "ainda hoje".
6. **Fechamento curto** — "Aguardo retorno."

### 4.3 Formatação específica
- `*negrito*` para nomes de usinas e destaques.
- `_itálico_` reservado para **status**.
- Emojis **com função**, nunca decorativos: 🔴 crítico, 🟠 alto, 🟡 médio; ✅ ok / ⚠️ alerta.
- **Sem assinatura fixa** no WhatsApp (e-mail leva assinatura formal).

### 4.4 Nunca fazer
- Linguagem agressiva, sarcástica, reprimenda pessoal.
- Jargão desnecessário ou explicação longa (o técnico já conhece o contexto).
- Mensagem genérica ("verifique tudo") — sempre usina + dado + prazo.
- **Presumir causa/culpa** — perguntar o motivo, não afirmar.
- Misturar assuntos não relacionados — **um comunicado por assunto**.

### 4.5 Agrupamento (regra de negócio para o gerador)
- **Uma mensagem por técnico**, nunca uma por usina: se o técnico responde por várias usinas, agrupar todas na mesma mensagem.
- Ordenar itens por **severidade** (mais crítico primeiro), depois por usina.

### 4.6 Exemplo modelo
```
Bom dia, Marcos. Tudo bem?

Conforme levantamento do PCM, as preventivas abaixo estão com prazo vencido no painel de atividades:

• 🔴 *UFV Colorado I* — preventiva mensal de inversores, vencida em 10/11
• 🟠 *UFV Sarandi* — inspeção termográfica, vencida em 14/11
• 🟡 *UFV Mandaguaçu* — limpeza de sala elétrica, vence em 19/11

Preciso que você me informe:
1. O motivo do atraso em Colorado I e Sarandi;
2. A data prevista de execução de cada uma.

Retorno ainda hoje, por favor.
Aguardo retorno.
```

---

## 5. Formatação WhatsApp — especificação exata

| Elemento | Sintaxe | Uso |
|---|---|---|
| Negrito | `*texto*` | Nomes de usinas, títulos de bloco, destaques |
| Itálico | `_texto_` | Status (técnicos); ressalvas contratuais (clientes) |
| Bullet | `• ` (U+2022 + espaço) | Listas de itens. Nunca `-` ou `*` como bullet |
| Numeração | `1. ` `2. ` | Ações/perguntas a responder |
| Emojis | 🔴🟠🟡✅⚠️ | Só com função de severidade/alerta |
| Quebras | linha em branco entre blocos | Saudação / corpo / pedido / fechamento |

Regras de sanitização (implementar em `formatWhatsApp()`):
- Não deixar `**duplo**` (Markdown) — converter para `*simples*`.
- Não deixar espaço entre o asterisco e a palavra (`* texto*` não renderiza no WhatsApp).
- Não usar cabeçalhos Markdown (`#`), tabelas ou links Markdown `[x](y)`.
- Remover espaços no fim das linhas e mais de uma linha em branco seguida.

---

## 6. E-mail — especificação

- Mais formal que o WhatsApp.
- Campos: **Assunto:** objetivo e com a usina (ex.: `UFV Tupi Paulista I — Condição crítica da via de acesso`).
- Corpo estruturado na mesma ordem do item 3.7.
- Fecha com **"Atenciosamente,"** e para aí: a assinatura (nome, cargo, Grid Co.) é a imagem do Outlook (decisão 10).
- Condições/itens em linhas com "- "; pessoa verbal igual à do rascunho (decisão 11).
- Anexos sempre citados e explicados no corpo.
- Ao formalizar ocorrência por e-mail: **omitir análise interna** e qualquer especulação de causa/culpa não confirmada; lembrar de alinhar com a coordenação antes do envio.

---

## 7. Linguagem formal: o que nunca aparece em documento oficial

Vale para Relatório de Ocorrência, Relatório de Evidências de OS e textos formais:

- **Nunca citar** WhatsApp, grupo, mensagens, áudios, vídeos, prints, "conforme conversa", nem frases literais entre aspas de pessoas.
- Orientações atribuídas **à área, não à pessoa**:
  - "De acordo com a engenharia, ..." (Aury Albuquerque)
  - "De acordo com a automação, ..." (Igor Saldanha)
  - Demais: COS, supervisão de O&M, PCM.
- Equipe descrita por **função** no corpo técnico (técnico, eletricista, mantenedor). Exceção: o campo `responsavel` do Relatório de Ocorrência usa **nomes reais** de quem atendeu, e a legenda de foto pode trazer "Registro: <nome>".
- **Nunca inventar** datas, nomes, causas ou culpados. Sem confirmação → "sob investigação", "a confirmar" ou "A definir".
- Evidências: **apenas fotos de campo/equipamento** (nada de print de conversa ou transcrição).
- Escopo temporal (OS): só entra o que aconteceu **até a normalização**.

Lista de termos proibidos para validador (case-insensitive): `whatsapp`, `zap`, `grupo`, `áudio`, `audio`, `print`, `mensagem do`, `conforme conversa`, `mandou no`, `falou no`.

---

## 8. Relatório de Ocorrência (DOCX + PDF) — especificação completa

### 8.1 Quando gerar
Furtos, curtos-circuitos, incêndios, danos a equipamentos, condições críticas de infraestrutura (ex.: via de acesso), acesso negado, danos de terceiros. **Todo relatório para cliente sai neste padrão**, definido no relatório da UFV Nova Xavantina II (16–17/11/2026). **Nunca layout genérico.**

### 8.2 Tokens de design (usar como constantes no código)
```ts
export const GRID_THEME = {
  navy:       '#1C1F3B', // capa, barras de seção, cabeçalho de tabela, títulos
  green:      '#8DC63F', // faixa da capa, aba das barras, traço da cronologia, destaques
  greenLight: '#EEF5DA', // fundo dos callouts
  greyZebra:  '#F3F4F7', // linhas alternadas das tabelas
  greyLilac:  '#9A9DB8', // rótulos da capa ("RELATÓRIO DE OCORRÊNCIA", CLIENTE/USINA...)
  ruleGrey:   '#D9DBE3', // linhas de cabeçalho/rodapé e bordas de tabela
  textMuted:  '#777777', // rodapé, legenda secundária das fotos
  critical:   '#C62828', // itens críticos na cronologia e status Crítico/Alto
  criticalBg: '#FDECEA', // fundo dos itens críticos na cronologia
  font:       'Calibri', // igual no Word e no PDF
  page:       'A4',      // 11906 x 16838 twips
};

export const STATUS_COLORS = {
  'Concluído': '#2E7D32', 'Recuperado': '#2E7D32',
  'Pendente': '#B26A00', 'Médio': '#B26A00', 'Aguardando cliente': '#B26A00', 'Substituição necessária': '#B26A00',
  'Em andamento': '#1565C0',
  'Crítico': '#C62828', 'Alto': '#C62828',
};
```

### 8.3 Estrutura visual
**Capa (página inteira):**
- Fundo azul-marinho de página inteira com **faixa verde vertical à esquerda** e **arcos decorativos** no canto inferior direito. Implementado como **imagem PNG flutuante atrás do texto** (`behindDocument: true`). **Nunca** usar tabela com altura de página (gera página em branco).
- Topo: ícone Grid + "Grid Co." (branco, negrito) + "Operação & Manutenção" (verde, abaixo).
- Bloco central, nesta ordem:
  1. "RELATÓRIO DE OCORRÊNCIA" — cinza-lilás, negrito, pequeno
  2. Título branco terminando em travessão (ex.: "Condição Crítica do Acesso —")
  3. **NOME DA UFV** — verde, caixa-alta, grande, com linha verde abaixo
  4. Subtítulo cinza caixa-alta (ex.: "VIA DE ACESSO À USINA E SEGURANÇA DA EQUIPE DE O&M")
  5. Frase-resumo em negrito branco
  6. Data/período da ocorrência em verde
  7. Rodapé da capa: `CLIENTE` / `USINA` / `DATA DO RELATÓRIO` / `RESPONSÁVEL TÉCNICO` (rótulo cinza-lilás + valor branco)

**Páginas internas:**
- **Cabeçalho:** ícone + `RELATÓRIO DE OCORRÊNCIA | <título> — <usina>` com linha cinza abaixo.
- **Rodapé:** `Grid Co. | <usina> | Revisão 01 | <mês ano>` + nº da página à direita (começa em 2).
- **Barras de seção:** aba verde estreita + barra azul-marinho com título branco em caixa-alta; **numeração automática** (contador — nunca número fixo).
- **Callouts:** aba verde + fundo verde-claro; rótulo em negrito azul ("ENQUADRAMENTO —", "RESUMO —").
- **Cronologia:** linha do tempo de 2 colunas — data/hora à direita da coluna 1 com traço vertical verde; itens críticos com traço e data em vermelho e fundo rosado.
- **Tabelas:** cabeçalho azul-marinho com texto branco, linhas zebradas, **última coluna = status colorido** e centralizado.
- **Evidências:** **uma foto por página**, centralizada (máx. ~600×680 px), orientação corrigida (EXIF), legenda curta em negrito azul + linha cinza `data | Registro: <nome> | <usina>`.
- **Fecho:** Ponto de Atenção (callout + pedido cordial) → Conclusão → local/data → linha de assinatura → **Fred Alexandrino** / Supervisor de O&M — Grid Co.

### 8.4 Ordem das seções (numeração dinâmica)
1. **Objetivo do documento** (+ callout ENQUADRAMENTO)
2. **Cronologia da ocorrência**
3. **Condições e riscos identificados** ou **Equipamentos e danos identificados** (tabela Item | Situação | Criticidade/Status)
4. **Ações realizadas e pendências** (tabela Data | Ação | Status)
5. **Evidências fotográficas** (só se houver fotos)
6. **Ponto de atenção — <tema>** (versão cliente, callout verde) **ou** **Análise preliminar** (uso interno, caixa âmbar — nunca vai ao cliente sem revisão)
7. **Conclusão** + local/data + assinatura

Se uma seção opcional não existir, as seguintes renumeram sozinhas.

### 8.5 Modelo de dados (TypeScript)
```ts
type Status = 'Concluído'|'Recuperado'|'Pendente'|'Em andamento'|'Aguardando cliente'
            |'Substituição necessária'|'Crítico'|'Alto'|'Médio';

interface Run { text: string; bold?: boolean; color?: string }
interface Paragrafo { runs: Run[] }

interface RelatorioOcorrencia {
  usina: string;                 // "UFV Tupi Paulista I"
  cidadeUf?: string;             // "Tupi Paulista/SP" (vem do mapeamento)
  cliente?: string;              // "2C Energia"
  tituloOcorrencia: string;      // "Condição crítica da via de acesso"
  tituloCapa: string;            // "Condição Crítica do Acesso —"
  subtituloCapa: string;         // caixa-alta
  fraseResumo: string;
  data: string;                  // data ou intervalo da ocorrência, ex. "Vistoria de campo em 16/11/2026"
  dataAssinatura: string;        // "17 de novembro de 2026" (pode diferir da ocorrência)
  localAssinatura: string;       // "Tupi Paulista (SP)"
  responsavel: string;           // NOMES REAIS de quem atendeu em campo
  responsavelTecnico: string;    // "Fred Alexandrino — Supervisor de O&M"
  revisao: number;               // 1 → "Revisão 01"; incrementa a cada reemissão

  objetivo: string;
  enquadramento: string;

  cronologia: { hora: string; texto: string; critico?: boolean }[];
  tituloTabelaRiscos?: string;   // "CONDIÇÕES E RISCOS IDENTIFICADOS" | "EQUIPAMENTOS E DANOS IDENTIFICADOS"
  danos: { item: string; situacao: string; status: Status }[];
  acoes: { data: string; acao: string; status: Status }[];

  evidencias?: { path: string; legenda: string; data: string; registro?: string; local: string }[];

  // escolher UMA das variantes:
  analisePreliminar?: Paragrafo[];            // interno (âmbar)
  tituloSecao5?: string;                      // "PONTO DE ATENÇÃO — RECUPERAÇÃO DO ACESSO"
  enquadramentoTecnico?: string;              // callout RESUMO
  questaoTecnica?: Paragrafo[];               // versão cliente (verde), pode ter bullets
  recomendacoes?: string[];                   // bullets dentro do ponto de atenção

  conclusaoParagrafos: Paragrafo[];
}
```

### 8.6 Regras de conteúdo
- **Nomes reais** em `responsavel` (nunca "Equipe de campo Grid Co." se o nome é conhecido ou pode ser perguntado). Use o mapeamento (seção 10) para sugerir.
- **Nunca inventar** causa raiz, datas ou culpados. Campo vazio obrigatório → bloquear geração ou preencher "A definir" com aviso.
- **Atualização = edição**, não recriação: corrigir os dados do caso existente, incrementar `revisao`, regenerar.
- **Sempre regenerar e conferir visualmente** (render do PDF) após qualquer edição.
- **Legendas de foto objetivas:** "Painel com disjuntor geral íntegro" e não "Painel adjacente com disjuntor geral íntegro, ao fundo o quadro danificado".
- **Versão cliente:** sem análise interna âmbar e sem especulação de causa/culpa.
- **Ponto de atenção cordial no tom, sem anunciar:** "Solicitamos o posicionamento ..."; "A Grid permanece à disposição para acompanhar a vistoria no local com a empresa contratada." Nunca escrever "de forma cordial", "gentilmente" ou equivalentes.
- **Responsabilidade de execução civil** é sempre atribuída à contratada do cliente ("a critério da contratada responsável pela execução civil").

### 8.7 Pipeline de geração (backend)
1. Validar `RelatorioOcorrencia` (schema + validadores da seção 11.4).
2. Gerar assets: `capa_bg.png` (1240×1754) e `logo_icon.png` (200×200) via `sharp` a partir de SVG (Anexo C, parte 1). Pode ser feito uma vez e cacheado.
3. Montar o DOCX com o pacote `docx` (Anexo C, parte 2) — duas seções: capa (margens próprias, sem cabeçalho/rodapé) e corpo (cabeçalho/rodapé, `pageNumbers.start = 2`).
4. Converter para PDF com LibreOffice headless: `soffice --headless --convert-to pdf arquivo.docx`.
5. Renderizar miniaturas para conferência: `pdftoppm -jpeg -r 100 arquivo.pdf pagina` — mostrar no dashboard antes de liberar o download.
6. Nome dos arquivos: `Relatorio_Ocorrencia_<UFV_sem_espacos>_<AAAA-MM-DD>_R<NN>.docx|pdf`.
7. Gerar também o **texto de envio** ao cliente (seção 3) em `CopyBox` separado.

Texto de envio padrão do relatório (adaptar):
```
Olá, Carol. Tudo bem?

Encaminhamos em anexo o Relatório de Ocorrência referente à condição da via de acesso à *UFV Tupi Paulista I*, com a cronologia da vistoria realizada em 16/11, os riscos identificados, as evidências fotográficas e as recomendações para recuperação do trecho.

Solicitamos, por gentileza, o posicionamento da 2C Energia quanto à recuperação do acesso, com previsão de execução. A Grid permanece à disposição para acompanhar a vistoria no local com a empresa contratada.

Seguimos à disposição.
```

---

## 9. Relatório de Evidências de OS (Nexus) — especificação

Usado para preencher uma OS no Nexus (Fazer OS). Fluxo completo no Anexo B. O que o dashboard precisa implementar:

### 9.1 Estrutura do PDF `01_Relatorio_evidencias_OSNNNNN_<Usina>.pdf` (reportlab)
1. **Identificação** — OS, cliente/usina, ativo/código, início do evento, normalização, indisponibilidade, chamado concessionária
2. **Descrição da ocorrência** — incorporando as notas da OS (COS/Fracttal)
3. **Diagnóstico e estratégia**
4. **Equipe, recursos e documentação técnica** (equipe por função)
5. **Medidas de segurança**
6. **Cronologia hora a hora** citando as fotos ("Foto 3")
7. **Resultado**
8. **Registro fotográfico** — grade de 3 por linha, "Foto N – legenda técnica (hora)": equipamento, identificação, placas dos painéis, potência

### 9.2 Pacote
- Fotos renomeadas: `NN_<descricao>_<dd-mm>_<HHhMM>.jpg` (ex.: `03_disjuntor_QGBT_trip_14-11_09h42.jpg`).
- Distribuição nas subtarefas por tema: equipamento → categoria; intervenção → onde atuou; painéis normalizados → religamento/resultado. **Cada subtarefa com pelo menos uma foto.**
- `evidencias.json`:
```json
{"os":"19097","inicio":"AAAA-MM-DDTHH:MM","fim":"AAAA-MM-DDTHH:MM",
 "subtarefas":[{"titulo":"<título exato>","texto":"...","anexos":["foto.jpg"]},
               {"titulo":"<subtarefa Lista>","opcao":"<opção exata>","anexos":["foto.jpg"]}],
 "anexos_os":["01_Relatorio....pdf"]}
```
- **Fim = hora da normalização.** Início = início da tratativa (se houver indício de atuação anterior, confirmar com o Fred).

### 9.3 Pontos de parada obrigatórios (pedir OK do Fred)
- Baixar mídias para o computador dele
- Apagar qualquer coisa
- Clicar "Enviar para verificação"
- Qualquer divergência (proteção diferente na nota automática, horário de início)

### 9.4 Restrições técnicas
- Tudo pelo **Nexus** — não abrir `app.fracttal.com` durante o processo (sessão única derruba o Nexus).
- Upload de fotos **uma por vez**, aguardando "Enviando para o Fracttal" sumir (~30–40 s) — em sequência rápida o Fracttal duplica.
- "Anexar na OS" aceita image, pdf, doc(x), xls(x), txt — **sem vídeo/áudio**.
- Pacote no servidor expira em 2 h; apagar com `DELETE` ao final. O secret de deploy **nunca** vai para o front-end nem para o repositório.

---

## 10. Roteamento: usina → cliente → destinatários

A fonte de verdade é o mapeamento oficial do dashboard (`MAPEAMENTO_UFVS` no `app.py` + edições do painel, servido em `GET /mapeamento-ufvs`; 46 UFVs em 17/11/2026). Campos: Cluster, Cliente, UFV, Cidade/UF, Responsável (função), Demais membros, Alternativo, Grupo WhatsApp.

Regras de roteamento:
- **Mensagem a técnico:** destinatário = Responsável da UFV; se houver "Demais membros", incluir no grupo do cluster quando o assunto envolver a equipe. Agrupar por técnico (seção 4.5).
- ~~Contato fixo por cliente (2C → Carol, Thopen → Iago, Renogrid → Vitor + técnico)~~ → **removido em 17/11/2026**: o interlocutor muda conforme o assunto; o Fred informa "Para quem" quando quiser.
- Nome da usina sempre normalizado para "UFV <Nome do mapeamento>".

Modelo:
```ts
interface UFV {
  cluster: string; cliente: '2C Energia'|'Thopen'|'Renogrid'|string;
  ufv: string; cidadeUf: string;
  responsavel: { nome: string; funcao: 'Técnico'|'Eletricista'|'Mantenedor'|string };
  membros: { nome: string; funcao: string }[];
  alternativo?: string; grupoWhatsapp?: string;
}
interface ContatoCliente { cliente: string; nome: string; incluirTecnico?: boolean }
const CONTATOS_CLIENTE: ContatoCliente[] = [
  { cliente: '2C Energia', nome: 'Carol' },
  { cliente: 'Thopen',     nome: 'Iago' },
  { cliente: 'Renogrid',   nome: 'Vitor', incluirTecnico: true },
];
```

---

## 11. Implementação no dashboard

### 11.1 Arquitetura sugerida
```
/comunicacao
  templates/           → funções puras que montam texto (cliente, técnico, e-mail, envio de relatório)
  formatWhatsApp.ts    → sanitização (seção 5)
  validators.ts        → regras da seção 11.4
  prompt.ts            → system prompt da IA (seção 11.5)
  roteamento.ts        → usina → destinatários (seção 10)
/relatorios
  ocorrencia/
    assets.js          → gera capa_bg.png e logo_icon.png (Anexo C parte 1)
    builder.js         → buildReport(data, outPath) (Anexo C parte 2, parametrizado)
    toPdf.sh           → soffice headless + pdftoppm para preview
  evidencias-os/
    builder.py         → reportlab (seção 9.1)
    pacote.ts          → renomeação de fotos + evidencias.json
/ui
  CopyBox.tsx          → caixa com botão Copiar (texto cru)
  MensagemResultado.tsx→ introducao | mensagens[] | observacoes
  PreviewPdf.tsx       → miniaturas das páginas antes do download
```

### 11.2 Modelo de saída de mensagem
```ts
interface SaidaComunicacao {
  tipo: 'cliente'|'tecnico'|'email'|'envio_relatorio';
  canal: 'whatsapp'|'email';
  destinatarios: string[];
  introducao?: string;          // fora da caixa
  mensagens: { titulo?: string; assunto?: string; texto: string }[]; // 1 caixa cada
  observacoes?: string[];       // depois das caixas
  versao: number;               // incrementa a cada ajuste; sempre texto completo
}
```

### 11.3 Fluxo de UI
1. Usuário escolhe **tipo** (cliente / técnico / e-mail / relatório) e **UFV(s)** — o roteamento preenche cliente, cidade, destinatário e técnico.
2. Cola o **rascunho/relato/áudio transcrito** e anexa fotos (se relatório).
3. Sistema gera `SaidaComunicacao` (template ou IA) → roda **validadores** → mostra caixas + observações.
4. Botão **Ajustar**: usuário descreve o ajuste → nova versão **completa** (nunca diff).
5. Botão **Dividir em 2 mensagens** (diagnóstico | encaminhamento) para comunicados longos ao cliente.
6. Para relatórios: preview das páginas (PDF renderizado) → download DOCX + PDF → caixa com texto de envio.

### 11.4 Validadores (lint antes de exibir)
| Regra | Aplica a | Severidade |
|---|---|---|
| ~~Começa com saudação padrão~~ → **removida (17/11/2026)**: a saudação é do Fred; avisa se a IA escrever uma | todas | aviso |
| ~~Período da saudação coerente com o horário de envio~~ → **removida (17/11/2026)** | — | — |
| Termina com encerramento padrão (cliente) ou "Aguardo retorno." (técnico) — conferido só na **última** caixa | todas | aviso |
| Cordialidade anunciada ("de forma cordial", "gentilmente"...) — **nova (17/11/2026)** | todas | aviso |
| Sem metalinguagem ("Aqui está", "Segue a mensagem", "Espero ter ajudado") | todas | erro |
| Sem termos proibidos da seção 7 | relatórios e textos formais | erro |
| Nome da usina no formato "UFV <Nome>" existente no mapeamento | todas | erro |
| Usina em `*negrito*` | WhatsApp | aviso |
| Bullets só com "•" | WhatsApp | aviso |
| Sem `**`, `#`, tabelas, links Markdown | WhatsApp | erro |
| Data fechada + dependência de terceiro (fabricante/concessionária/homologação) | cliente | aviso |
| Atividade após 17h, fim de semana ou feriado sem ressalva de HH Extra | cliente | aviso |
| Termos de culpa/afirmação de causa sem confirmação ("culpa", "negligência", "por erro de") | técnico/cliente | aviso |
| Mais de uma usina do mesmo técnico em mensagens separadas | técnico | erro |
| Tom punitivo ("advertência", "punição", "último aviso") | técnico | erro |
| Campos obrigatórios do relatório vazios (data, usina, responsavel, cronologia) | relatório | erro |
| `responsavel` genérico ("equipe de campo") com nome disponível no mapeamento | relatório | aviso |
| Relatório versão cliente contendo `analisePreliminar` | relatório | erro |
| OS: evento na cronologia após a hora de normalização | evidências OS | erro |
| OS: subtarefa sem foto | evidências OS | erro |

### 11.5 System prompt para a IA do dashboard (copiar e usar)
```
Você é o redator de comunicação operacional da Grid Co. (O&M de usinas fotovoltaicas). Escreve em português do Brasil, em nome de Fred Alexandrino, Supervisor de O&M.

SAÍDA: responda SOMENTE em JSON no formato:
{"introducao": "<opcional, curta>", "mensagens": [{"titulo": "<opcional>", "assunto": "<só e-mail>", "texto": "<texto pronto para envio>"}], "observacoes": ["<inconsistências reais nos dados, se houver>"]}

REGRAS GERAIS
- O campo "texto" contém apenas o que será enviado: sem "Aqui está", "Segue", "Espero ter ajudado".
- Comunicados longos ao cliente: dividir em mensagens (diagnóstico | opções/encaminhamento).
- Nunca invente datas, nomes, causas ou culpados. Faltou dado essencial: use "a confirmar" e registre em "observacoes".
- Elimine bastidores internos, desabafos e ruídos interpessoais. Foque em: diagnóstico técnico, impacto/risco, ações da equipe, próximos passos.
- Usinas sempre como "UFV <Nome>", em *negrito* no WhatsApp.
- WhatsApp: *negrito*, _itálico_, bullets "•", listas numeradas para ações. Sem Markdown de títulos, tabelas ou links. Emojis só 🔴🟠🟡✅⚠️ com função.

CLIENTE
- Saudação: "Olá, <Nome>. Tudo bem?" / "Bom dia|Boa tarde, <Nome>. Tudo bem?" / "Prezados, bom dia." (coletivo).
- Estrutura: saudação → diagnóstico (equipamento + causa-raiz confirmada) → opções com riscos (Opção A/B) → alinhamento contratual se aplicável → próximos passos → encerramento ("Seguimos à disposição." | "Qualquer dúvida, sigo à disposição!").
- Tom político e cordial; em apontamentos do cliente, valide o fluxo, acolha e esclareça sem confronto.
- Nunca prometa data fechada que dependa de fabricante, concessionária ou homologação.
- Atividade fora de dias úteis 07h–17h: inclua a ressalva de Homem-Hora Extra/Noturno conforme contrato.
- Grid = monitoramento, acompanhamento de segurança, manobras de abertura/religamento, validação de laudos. Obras civis e serviços especializados = contratada do cliente.
- Preventiva: "como parte do cronograma de manutenção preventiva mensal sob responsabilidade da Grid".
- Anexos sempre explicados ("encaminhamos em anexo a OS <nº> com as fotos de ...").
- Falha grave: tom firme e estruturado, enfatizando risco e necessidade de posicionamento urgente.

TÉCNICO
- "Olá, <Nome>. Tudo bem?" ou "Bom dia, <Nome>." → fato com fonte ("Conforme levantamento do PCM...") → dados exatos em bullets "•" (mais crítico primeiro) → pedidos numerados ("Preciso que você...") → prazo explícito → "Aguardo retorno."
- Uma mensagem por técnico, agrupando todas as usinas dele. Um assunto por mensagem.
- Sem ameaça, sem tom punitivo, sem sarcasmo, sem presumir causa — pergunte o motivo.
- Sem assinatura no WhatsApp.

E-MAIL
- Inclua "assunto". Corpo formal estruturado. Assinatura: "Atenciosamente,\n\nFred Alexandrino\nSupervisor de O&M\nGrid Co."

TEXTOS FORMAIS/RELATÓRIOS
- Nunca cite WhatsApp, grupo, áudio, print, "conforme conversa" nem frases literais entre aspas. Atribua orientações à área ("De acordo com a engenharia, ...").
```

Contexto a injetar no prompt do usuário (montado pelo backend):
```
TIPO: cliente|tecnico|email|envio_relatorio
DESTINATÁRIO(S): <nome(s) do roteamento>
UFV(s): <nome formal, cidade/UF, cliente, técnico responsável>
DATA/HORA DE ENVIO: <dd/mm/aaaa HH:MM>
RASCUNHO/RELATO:
<texto colado pelo usuário>
AJUSTE PEDIDO (se houver): <...>  → devolver o texto COMPLETO corrigido
```

### 11.6 Prompt para extrair dados do Relatório de Ocorrência
```
A partir do relato abaixo (texto, transcrição de áudio, anotações), preencha o JSON RelatorioOcorrencia (schema anexo).
- Não invente datas, nomes, horários ou causas: ausente → "A definir" e liste em "pendencias_de_dados".
- "responsavel" = nomes reais de quem atendeu em campo.
- cronologia: itens curtos, factuais, em ordem; "critico": true para o evento danoso/de risco.
- danos/riscos: Item | Situação | Status (Crítico, Alto, Médio, Pendente, Recuperado, Substituição necessária).
- acoes: Data | Ação | Status (Concluído, Em andamento, Pendente, Aguardando cliente).
- Legendas de foto: objetivas, até ~12 palavras.
- Versão cliente: sem análise interna; ponto de atenção cordial no tom, sem anunciar a cordialidade ("Solicitamos o posicionamento ...").
- Não cite WhatsApp, grupos, áudios ou prints.
Responda só com o JSON + "pendencias_de_dados": [].
```

---

## 12. Checklists de QA

**Mensagem (antes de liberar o Copiar)**
- [ ] Saudação e encerramento padrão
- [ ] Usina com nome formal e em negrito
- [ ] Dados concretos (datas, números) — nada arredondado ou inventado
- [ ] Sem prazo fechado dependente de terceiros
- [ ] Ressalva de HH Extra quando fora do horário
- [ ] Sem bastidores, sem metalinguagem
- [ ] Técnico: uma mensagem por pessoa, itens por severidade, prazo explícito
- [ ] Observações fora da caixa

**Relatório de Ocorrência**
- [ ] Capa de página inteira sem página em branco depois
- [ ] Numeração de seções sequencial sem buracos
- [ ] Cabeçalho/rodapé corretos; página começa em 2
- [ ] Status coloridos na última coluna
- [ ] Uma foto por página, orientação correta, legenda + linha cinza
- [ ] Nomes reais no responsável; assinatura do Fred
- [ ] Versão cliente sem análise interna
- [ ] DOCX e PDF gerados e conferidos visualmente
- [ ] Texto de envio em caixa separada

**Evidências de OS**
- [ ] Nada após a normalização
- [ ] Só fotos de campo; nomes no padrão `NN_desc_dd-mm_HHhMM.jpg`
- [ ] Cada subtarefa com ao menos uma foto
- [ ] Início/Fim corretos (Fim = normalização)
- [ ] Divergências levadas ao Fred; OK antes de "Enviar para verificação"
- [ ] Pacote apagado do servidor ao final

---

## 13. Prompt para pedir a implementação no chat (Claude Code / dashboard Central O&M)

Coloque este arquivo em `docs/PADRAO_COMUNICACAO_RELATORIOS_GRID.md` no repositório do dashboard e cole o texto abaixo no chat. Ele está dividido em fases para não virar um "faz tudo de uma vez" que quebra o projeto. Mande a Fase 1, valide, depois as seguintes.

### 13.1 Mensagem inicial (contexto + Fase 1 — Comunicação)
```
Leia por completo o arquivo docs/PADRAO_COMUNICACAO_RELATORIOS_GRID.md antes de qualquer coisa. Ele é a fonte de verdade do padrão de comunicação da Grid Co. e tem prioridade sobre qualquer suposição sua.

Depois:
1. Explore o repositório do dashboard Central O&M e me diga em poucas linhas: stack (front/back), onde fica o roteamento de páginas, onde estão os dados do mapeamento de UFVs (clusters, técnicos, clientes) e se já existe alguma integração com IA ou WhatsApp. Não altere nada ainda.
2. Proponha um plano de implementação do MÓDULO DE COMUNICAÇÃO (seções 2 a 7, 10 e 11 do documento), adaptado à stack existente, listando os arquivos que vai criar/alterar. Aguarde meu OK antes de codar.

Escopo da Fase 1 (só comunicação, sem relatórios ainda):
- Nova aba/página "Comunicação" no dashboard.
- Formulário: tipo (Cliente | Técnico | E-mail | Texto de envio de relatório), seleção de UFV(s) puxando do mapeamento existente, campo de rascunho/relato, data/hora de envio (padrão = agora, fuso America/Sao_Paulo).
- Roteamento automático (seção 10): cliente → contato (2C = Carol, Thopen = Iago, Renogrid = Vitor + técnico da usina); técnico → responsável da UFV; agrupar por técnico quando várias UFVs forem do mesmo técnico; aviso para UFV com situação "Temporária".
- Geração do texto via IA usando EXATAMENTE o system prompt da seção 11.5 e o contexto de usuário descrito logo abaixo dele, com saída em JSON {introducao, mensagens[], observacoes[]}.
- Componente CopyBox: uma caixa por mensagem, botão Copiar que copia o texto cru (sem HTML), preservando *negrito*, _itálico_ e "•". Introdução acima das caixas, observações abaixo, nunca dentro.
- Botões "Ajustar" (gera nova versão COMPLETA, guardando histórico de versões) e "Dividir em 2 mensagens".
- formatWhatsApp() com as regras de sanitização da seção 5.
- validators.ts com TODAS as regras da tabela 11.4 que se aplicam a mensagens; erros bloqueiam o Copiar, avisos aparecem em amarelo abaixo das caixas.
- Testes unitários para formatWhatsApp, roteamento e validadores, usando os exemplos das seções 3.8 e 4.6 como casos que DEVEM passar.

Regras de trabalho:
- Não invente contatos, usinas ou técnicos: use só o que existe no mapeamento do projeto e na seção 10.
- Chave de API e qualquer secret ficam em variável de ambiente no backend, nunca no front-end nem no repositório.
- Se algo do documento conflitar com o código existente, pare e me pergunte.
- Ao terminar, rode os testes, me mostre o resultado e um print/descrição da tela.
```

### 13.2 Fase 2 — Relatório de Ocorrência
```
Fase 2: implemente o gerador de Relatório de Ocorrência conforme a seção 8 e o Anexo C do docs/PADRAO_COMUNICACAO_RELATORIOS_GRID.md.

- Backend: módulo relatorios/ocorrencia com assets.js (capa_bg.png e logo_icon.png do Anexo C parte 1, cacheados) e builder.js exportando buildReport(data, outPath), parametrizando o script do Anexo C pelo modelo RelatorioOcorrencia da seção 8.5. O contador de seções deve zerar a cada geração; seção de evidências só entra se houver fotos.
- Conversão para PDF com LibreOffice headless e preview com pdftoppm (miniaturas das páginas na tela antes do download).
- Tela "Relatório de Ocorrência": formulário com os campos do modelo, upload de fotos (legenda, data, registro), escolha entre versão Cliente (Ponto de Atenção verde) e versão Interna (Análise preliminar âmbar). Versão Cliente NUNCA inclui a análise interna.
- Botão "Extrair do relato": cola o relato/transcrição e usa o prompt da seção 11.6 para pré-preencher o formulário; mostrar "pendencias_de_dados" em destaque e bloquear a geração se data, usina, responsável ou cronologia estiverem vazios.
- Edição = nova revisão (Revisão 02, 03...), mantendo histórico; nunca recriar do zero.
- Nome dos arquivos: Relatorio_Ocorrencia_<UFV>_<AAAA-MM-DD>_R<NN>.docx/.pdf.
- Ao gerar, mostrar também o texto de envio ao cliente numa CopyBox separada (modelo no fim da seção 8.7).
- Gere um relatório de teste com os dados do Anexo C (UFV Tupi Paulista I) e compare visualmente com a especificação da seção 8.3 (capa de página inteira sem página em branco, numeração sequencial, status coloridos, uma foto por página). Me mande o PDF de teste.
```

### 13.3 Fase 3 — Relatório de Evidências de OS (opcional)
```
Fase 3: implemente a montagem do pacote de evidências de OS conforme a seção 9 e o Anexo B do docs/PADRAO_COMUNICACAO_RELATORIOS_GRID.md.

- Tela "Evidências de OS": número da OS, início, normalização (fim), upload das fotos de campo, notas da OS.
- Renomeação automática das fotos (NN_<descricao>_<dd-mm>_<HHhMM>.jpg), distribuição por subtarefa (cada subtarefa com ao menos uma foto) e geração do evidencias.json.
- PDF 01_Relatorio_evidencias_OSNNNNN_<Usina>.pdf com as 8 seções da seção 9.1 (reportlab ou equivalente na stack), registro fotográfico em grade de 3 por linha.
- Validadores: nada depois da normalização, termos proibidos da seção 7, subtarefa sem foto.
- NÃO automatize o "Enviar para verificação" nem exclusões: o dashboard só monta e entrega o pacote; os pontos de parada da seção 9.3 exigem confirmação explícita minha.
- O secret de upload do servidor fica só no backend.
```

### 13.4 Mensagens curtas úteis durante a implementação
```
Confira a implementação contra o checklist da seção 12 do docs/PADRAO_COMUNICACAO_RELATORIOS_GRID.md e me liste o que está pendente ou divergente.
```
```
Gere 3 mensagens de teste (1 cliente Thopen, 1 técnico com 3 usinas do mesmo cluster, 1 e-mail 2C) e rode os validadores nelas. Me mostre as caixas como ficariam na tela.
```
```
Atualize o CLAUDE.md do repositório com uma linha dizendo que qualquer alteração em gerador de texto ou relatório deve seguir docs/PADRAO_COMUNICACAO_RELATORIOS_GRID.md.
```

---

## Anexo A — Skill `grid-relatorio-ocorrencia` (texto integral)

````markdown
---
name: grid-relatorio-ocorrencia
description: "Gera Relatórios de Ocorrência da Grid Co. (O&M) em Word/PDF — furtos, curtos-circuitos, incêndios, danos a equipamentos — a partir de relatos de campo, mensagens de WhatsApp, áudios transcritos e fotos de evidência. Use esta skill sempre que o usuário pedir um 'relatório de ocorrência', 'documento do caso', 'cronologia dos fatos' de um incidente em usina, ou mencionar furto/curto-circuito/incêndio/dano em equipamento — mesmo sem citar esta skill pelo nome. Também use para atualizar/corrigir um relatório de ocorrência já existente no projeto."
---

# Relatório de Ocorrência (Grid Co.)

Gera o documento Word (e opcionalmente PDF) do "Relatório de Ocorrência" no padrão visual oficial
da Grid Co. (mesma identidade visual do Relatório Operacional — ver skill irmã
`grid-relatorio-operacional`), adaptado para registrar incidentes: furtos, curtos-circuitos,
incêndios e danos a equipamentos.

## Quando usar

- Usuário relata um incidente (furto, curto-circuito, incêndio, dano) em uma usina, por texto solto,
  print de WhatsApp, áudio transcrito ou anotação manuscrita fotografada.
- Usuário pede para "montar um relatório da cronologia dos fatos", "documento do caso", "relatório
  de ocorrência".
- Usuário fornece correções/atualizações a um relatório de ocorrência já gerado (novas datas, danos
  confirmados, ações concluídas) — edite o arquivo de dados existente, não recrie do zero.
- Usuário pede uma versão para enviar ao cliente por e-mail, com as partes sensíveis internas
  omitidas.

## Workflow

1. **Leia `scripts/occurrence_report_builder.js`** — motor de geração (buildCover, sectionBar,
   timelineItem, dataTable, calloutBox, seção de evidências, buildReport). Não recrie do zero:
   importe e reuse via `buildReport(data, outPath)`.
2. **Extraia os fatos da fonte do usuário** e organize no formato de `data` — ver
   [Esquema de dados](#esquema-de-dados) e `examples/exemplo_dados.js` (caso real: curto-circuito
   no QGBT da UFV Morada Nova, cliente Alves Lima).
3. **Nunca invente datas, nomes ou causas.** Se um dado essencial não foi informado (data exata,
   nome de quem atendeu, causa raiz), pergunte ao usuário ou marque como "A definir" — nunca
   preencha com suposição.
4. **Copie `scripts/occurrence_report_builder.js` e `scripts/logo_gridco.png`** para o diretório de
   trabalho antes de rodar (o script espera o logo no mesmo diretório).
5. **Rode com Node** (`node build_<caso>.js`) — pacotes `docx` e `sharp` já vêm instalados, não
   rode `npm install`.
6. **Converta para PDF** com
   `python3 /mnt/skills/public/docx/scripts/office/soffice.py --headless --convert-to pdf arquivo.docx`.
7. **Sempre renderize e confira visualmente** (`pdftoppm -jpeg -r 100 arquivo.pdf pagina`) antes de
   entregar — especialmente a numeração das seções (é dinâmica, ver abaixo) e a paginação das
   evidências fotográficas.
8. Copie o(s) arquivo(s) final(is) para `/mnt/user-data/outputs/` e chame `present_files`.

## Esquema de dados

```js
{
  usina: "UFV Morada Nova",
  cliente: "Alves Lima",                 // opcional — aparece na capa se informado
  tituloOcorrencia: "Curto-circuito — Painel QGBT",  // subtítulo da capa
  data: "05/09/2026",                    // data (ou intervalo, ex. "05 a 06/09/2026") da ocorrência
  dataAssinatura: "10/09/2026",          // data em que o relatório está sendo formalizado/assinado
                                          // (pode ser diferente da data da ocorrência)
  responsavel: "Claudio Ferreira e Isake Costa.",  // NOMES REAIS de quem atendeu em campo —
                                          // nunca use um genérico como "Equipe de campo Grid Co."
                                          // se os nomes forem conhecidos ou puderem ser perguntados
  responsavelTecnico: "Fred Alexandrino", // quem assina/valida o relatório

  objetivo: "Este documento registra...",       // parágrafo da seção 1
  enquadramento: "ATENÇÃO — ...",               // callout verde da seção 1

  cronologia: [                          // seção "Cronologia da Ocorrência" (linha do tempo)
    { hora: "05/09", texto: "...", critico: false },
    { hora: "05/09", texto: "...causou curto-circuito...", critico: true },  // destaca em vermelho
    ...
  ],

  danos: [                               // tabela "Equipamentos e Danos Identificados"
    { item: "8 disjuntores do QGBT", situacao: "Danos irreversíveis...", status: "Substituição necessária" },
    { item: "Barramentos principais, portas e isoladores", situacao: "Recuperados após limpeza técnica", status: "Recuperado" },
    ...
  ],

  acoes: [                               // tabela "Ações Realizadas e Pendências"
    { data: "05/09", acao: "...", status: "Concluído" },
    { data: "A definir", acao: "...", status: "Pendente" },
    ...
  ],

  // Evidências fotográficas (seção opcional — inclui sempre que houver fotos disponíveis)
  evidencias: [
    { path: "/mnt/user-data/uploads/foto1.jpeg", legenda: "Descrição objetiva e específica da foto",
      data: "08/09/2026", local: "UFV Morada Nova" },
    ...
  ],

  // Seção de análise — DUAS variantes possíveis, escolha uma:

  // (A) Análise de uso interno (não deve ir ao cliente sem revisão) — usa caixa ÂMBAR
  analisePreliminar: [
    { runs: [{ text: "..." }] },
    { runs: [{ text: "Ponto de atenção 1: ", bold: true, color: "1C1F3B" }, { text: "..." }] },
    ...
  ],

  // (B) Ponto técnico cordial, para levantar questão específica (ex.: proteções que não atuaram) —
  //     usa caixa VERDE, tom educado, pode ser compartilhado com cliente/fabricante
  tituloSecao5: "PONTO DE ATENÇÃO — ATUAÇÃO DAS PROTEÇÕES",   // opcional, tem título padrão
  enquadramentoTecnico: "Resumo de 1 frase do ponto técnico.", // callout verde
  questaoTecnica: [
    { runs: [{ text: "..." }] },
    { runs: [{ text: "Solicitamos a avaliação de ..." }] },
    ...
  ],

  conclusaoParagrafos: [                 // seção final, antes do bloco de assinatura
    { runs: [{ text: "..." }] },
    ...
  ]
}
```

**A numeração das seções é automática** (a função conta quantas seções existem e numera em
sequência: Objetivo, Cronologia, Danos, Ações, Evidências [se houver], Análise/Ponto de Atenção,
Conclusão) — não hardcode números de seção ao editar `occurrence_report_builder.js`.

## Regras (não pule isso)

- **Nomes reais, não genéricos.** Sempre que o usuário informar (ou puder informar) quem atendeu a
  ocorrência em campo, use o nome da pessoa em `responsavel`. Só use uma descrição genérica
  ("equipe de campo") se realmente não houver como saber quem foi.
- **Nunca invente causa raiz, datas ou culpados.** Se a causa não está confirmada, registre como
  "sob investigação" ou "a confirmar" — nunca afirme como fato.
- **Atualizações são edições, não recriações.** Se o usuário corrigir um dado já usado (nova data,
  novo status de dano, nome correto), edite o arquivo `build_<caso>.js` existente linha a linha —
  não regenere a estrutura toda do zero.
- **Depois de qualquer edição, sempre regenere e confira visualmente** (render PDF) antes de
  reapresentar o arquivo.
- **E-mail para cliente**: ao formalizar a ocorrência por e-mail, omita a seção de análise interna
  (âmbar) e qualquer especulação de causa/culpa ainda não confirmada. Lembre o usuário de alinhar
  com a coordenação (ex. Marcelo) antes de enviar.
- **Evidências fotográficas**: uma foto por página, com legenda objetiva (o que a foto mostra,
  sem floreio). Corrija a orientação automaticamente (o script já faz isso via `sharp`). Evite
  legendas prolixas — prefira "Painel com disjuntor geral íntegro" a "Painel adjacente com disjuntor
  geral íntegro, ao fundo o quadro danificado".

## Arquivos desta skill

```
grid-relatorio-ocorrencia/
├── SKILL.md                       este arquivo
├── scripts/
│   ├── occurrence_report_builder.js   motor de geração (capa, cronologia, tabelas, evidências,
│   │                                  numeração dinâmica de seções)
│   └── logo_gridco.png                logo oficial Grid Co.
└── examples/
    └── exemplo_dados.js                caso real completo (curto-circuito QGBT, UFV Morada Nova,
                                         cliente Alves Lima) — copie e adapte
```
````

> **Importante para a implementação:** o padrão visual vigente é o da seção 8 / Anexo C (capa de página inteira definida na UFV Nova Xavantina II, 16–17/11/2026). Onde o `occurrence_report_builder.js` antigo divergir, **vale o Anexo C**. Os arquivos `scripts/` e `examples/` da skill não acompanham este documento — o Anexo C já contém o motor completo.

---

## Anexo B — Skill `evidencias-os-nexus` (texto integral)

````markdown
---
name: "evidencias-os-nexus"
description: "Preenche uma OS no Nexus (Fazer OS) de ponta a ponta: o Fred diz onde estão as informações (grupo/zip do WhatsApp) e qual OS, e o Claude monta as evidências, anexa e envia para verificação."
---

# Evidências e preenchimento de OS no Nexus (ponta a ponta)

O Fred só informa: (1) ONDE estão as informações (zip exportado do WhatsApp e/ou nome do grupo no WhatsApp Web), (2) QUAL OS preencher e, se souber, (3) a mensagem/hora da normalização (corte). O Claude faz TODO o resto e só para para pedir ok antes de: baixar mídias para o computador dele, apagar qualquer coisa e clicar "Enviar para verificação".

ANTES DE TUDO: ler no Projeto CENTRAL O&M `claude/runbook-evidencias-os-nexus.md` (fluxo validado, rotas do servidor, armadilhas; tem prioridade onde divergir) e `claude/deploy secret index html` (secret do upload).

## Regras fixas
- Escopo: só entra o que aconteceu ATÉ a normalização. O que vem depois é outro tema e NÃO entra no relatório nem na OS.
- Relatório e textos FORMAIS: nunca citar WhatsApp, grupo, mensagens, áudios, vídeos, prints, "conforme conversa", nem frases literais entre aspas. Orientações atribuídas à área, não à pessoa: "De acordo com a engenharia, ..." (Aury Albuquerque); "De acordo com a automação, ..." (Igor Saldanha); demais conforme a área (COS, supervisão de O&M). Equipe descrita por função. Não inventar nada que não esteja na conversa ou nas notas da OS.
- Evidências: APENAS fotos de campo/equipamento (nada de prints de conversa nem transcrições). Áudios são transcritos só para ENTENDER o caso.
- Tudo pelo NEXUS. Não abrir o site app.fracttal.com durante o processo: o Fracttal aceita UMA sessão por conta e isso derruba a sessão do Fracttal dentro do Nexus. Se cair ("Não consegui abrir as tarefas: sessão do Fracttal expirou"), abrir app.gridco.com.br/os/login e pedir ao Fred para clicar "Entrar" — o Claude não faz login com senha.
- Divergências (ex.: proteção diferente na nota automática, horário de início) são levadas ao Fred antes do envio.

## 1. Ler as informações
- Zip: descompactar em pasta própria; ler o .txt inteiro; ver cada imagem e anotar o que ela prova.
- Áudios (.opus) e áudio de vídeos: faster-whisper (`pip install --break-system-packages faster-whisper`, modelo `medium`, language='pt'). Converter antes para wav 16 kHz mono com ffmpeg e passar o array numpy (o decode interno falha com o PyAV do ambiente). Revisar a transcrição.
- `<Mídia oculta>` (não veio no export): buscar no WhatsApp Web do Chrome do Fred.
  1. Abrir web.whatsapp.com, buscar o grupo, rolar o chat (div com overflow) até a primeira mídia do período e clicar nela para abrir o visualizador.
  2. Para cada item: ler o rótulo "dd/mm/aaaa às HH:MM"; pegar a mídia com `document.elementsFromPoint(innerWidth/2, innerHeight/2-20)` (NÃO pela maior imagem da página — a bolha do chat atrás engana), `fetch(blob)` e baixar com `<a download>`; tecla →; parar ao passar do corte.
  3. O Chrome pode abrir "Salvar como" para cada arquivo, mas o arquivo já fica completo como `.tmp` em Downloads: identificar por ordem/tamanho, trazer com device_request_folder_access(~/Downloads) + device_stage_files e pedir ao Fred para cancelar as janelas.
- Se faltar evidência citada na OS (ex.: foto do trip), conferir primeiro se já está anexada na OS; depois procurar nos grupos relacionados; por fim perguntar ao Fred.
- De um vídeo de campo pode-se extrair um quadro (ffmpeg) como foto de equipamento.

## 2. Ler a OS no Nexus
- https://app.gridco.com.br/t/os/historico → campo "Nº da OS" → Enter. O conteúdo fica em iframes aninhados: `function docs(d,o=[]){o.push(d);for(const f of d.querySelectorAll('iframe')){try{docs(f.contentDocument,o)}catch(e){}}return o}` e `docs(document).find(x=>x.body&&x.body.innerText.includes('OS <nº>'))`. A posição do campo muda com o tamanho da janela: tirar screenshot antes de clicar.
- Ler título, notas (COS/Fracttal), subtarefas e anexos já existentes. "Fazer OS" abre o modal `.acoes-dlg-fazer`: subtarefas (texto = textarea; lista = `button.fz-op`), "Anexar foto" por subtarefa (image/*,.pdf), "Anexar na OS" (image, pdf, doc(x), xls(x), txt — sem vídeo/áudio) e Início/Fim (datetime-local).
- IDs: `performance.getEntriesByType('resource')` mostra `/os/api/os/<id_wo>/tarefas` e `/os/api/os/<id_wo>/tarefa/<id_tarefa>/checklist` (ler só campos específicos; a resposta bruta pode ser bloqueada).

## 3. Montar o pacote (pasta OSNNNNN/)
- `01_Relatorio_evidencias_OSNNNNN_<Usina>.pdf` (reportlab), formal e completo: 1) Identificação (OS, cliente/usina, ativo/código, início do evento, normalização, indisponibilidade, chamado concessionária); 2) Descrição da ocorrência (com as notas da OS); 3) Diagnóstico e estratégia; 4) Equipe, recursos e documentação técnica; 5) Medidas de segurança; 6) Cronologia hora a hora citando as fotos; 7) Resultado; 8) Registro fotográfico (grade 3 por linha, "Foto N – legenda técnica (hora)": equipamento, identificação, placas dos painéis, potência).
- Fotos renomeadas `NN_<descricao>_<dd-mm>_<HHhMM>.jpg`; distribuir nas subtarefas pelo tema (equipamento → categoria; intervenção → onde atuou; painéis normalizados → religamento/resultado). Cada subtarefa com pelo menos uma foto.
- `evidencias.json`:
```json
{"os":"19097","inicio":"AAAA-MM-DDTHH:MM","fim":"AAAA-MM-DDTHH:MM",
 "subtarefas":[{"titulo":"<título exato>","texto":"...","anexos":["foto.jpg"]},
               {"titulo":"<subtarefa Lista>","opcao":"<opção exata>","anexos":["foto.jpg"]}],
 "anexos_os":["01_Relatorio....pdf"]}
```
- Fim = hora da normalização. Início = início da tratativa; se houver indício de atuação anterior, confirmar com o Fred.
- Enviar o PDF ao Fred no chat.

## 4. Subir para o servidor da Central O&M
- Token: `python3 -c "import secrets;print(secrets.token_urlsafe(24))"`.
- Cada arquivo: `curl -X POST -H "X-Deploy-Secret: <secret>" --data-binary @arquivo "https://api.168.138.232.237.sslip.io/evidencias-os/<token>/<arquivo>"`. GET é público com CORS e expira em 2 h; `DELETE .../evidencias-os/<token>` (com o secret) apaga.

## 5. Preencher no Nexus (javascript_tool no Chrome do Fred)
- Abrir a OS → "Fazer OS" → esperar as textareas carregarem.
- `W = d.defaultView`. Textos com o setter nativo (`Object.getOwnPropertyDescriptor(W.HTMLTextAreaElement.prototype,'value').set.call(el,v)` + eventos input/change). Opções: clicar no `button.fz-op` com o texto exato (pular se já tiver classe `on`).
- Bloco da subtarefa = menor ancestral do título que contenha exatamente 1 `input[type=file]`.
- Fotos: `fetch` do servidor → `new W.File([blob], nome, {type})` → `const dt=new W.DataTransfer(); dt.items.add(f); input.files=dt.files` → change. UMA POR VEZ: esperar sumir "Enviando para o Fracttal" / "Esperando o servidor" (~30–40 s) antes da próxima; em sequência rápida o Fracttal duplica arquivos.
- PDF no input do bloco "Anexar na OS".
- Clicar "Salvar respostas" e conferir pela API `.../checklist` (valores, pendentes 0).
- Alternativa manual do Fred: script Tampermonkey v3 (doc `claude/nexus-fazer-os-evidencias.user.js.md`), botão "📎 Preencher com evidências", colando o token. Instalação: colar em Tampermonkey → ⊞ novo script (abrir a URL .user.js não instala no Tampermonkey 5.5).

## 6. Enviar para verificação (com ok do Fred)
- No modal: Início e Fim com o setter nativo → "Enviar para verificação" (só ele grava as datas e conclui a tarefa; o "X de 4 concluídas" só muda depois). Retorno esperado: "OS <nº> feita e enviada para verificação no Fracttal."
- Conferir `/os/api/os/<id_wo>/tarefas`: situacao "Finalizada", feita true, feitas = total; e "Data fim" no detalhe.
- No Fracttal as fotos das subtarefas ficam todas na aba "Anexos" da tarefa (normal). O contador de anexos do Nexus pode estar em cache.
- Duplicatas "(2)", "(3)": só se apagam no site do Fracttal (Anexos → ícone de seleção → marcar uma → lixeira → confirmar 2x), com ok do Fred, e depois reconectar a sessão do Nexus.

## 7. Fechamento
- Apagar o pacote do servidor (DELETE com o secret).
- Resposta curta: o que foi em cada subtarefa, anexos, datas, status final e divergências que ficaram.
- Atualizar o runbook do Projeto se aprender algo novo.
````

---

## Anexo C — Script de referência do Relatório de Ocorrência (Node: `docx` + `sharp`)

Caso real usado como modelo: UFV Tupi Paulista I (2C Energia) — condição crítica da via de acesso, 16–17/11/2026. **No dashboard, parametrizar:** trocar o objeto `D`, os arrays de cronologia/tabelas/evidências e os textos por campos de `RelatorioOcorrencia` (seção 8.5); trocar o caminho `Z` das fotos pelo storage do dashboard; o mês/ano do rodapé e o "Revisão 01" vêm de `dataAssinatura` e `revisao`.

Dependências: `npm i docx sharp`. Conversão PDF: LibreOffice (`soffice --headless --convert-to pdf`).

### Parte 1 — assets (capa e ícone)
```js
const sharp=require('sharp');
const NAVY='#1C1F3B',GREEN='#8DC63F';
(async()=>{
const W=1240,H=1754;
const bg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="${NAVY}"/>
<rect width="34" height="${H}" fill="${GREEN}"/>
<circle cx="${W+80}" cy="${H-120}" r="520" fill="none" stroke="${GREEN}" stroke-opacity="0.10" stroke-width="70"/>
<circle cx="${W+80}" cy="${H-120}" r="330" fill="none" stroke="#FFFFFF" stroke-opacity="0.04" stroke-width="40"/>
</svg>`;
await sharp(Buffer.from(bg)).png().toFile('capa_bg.png');
const ic=`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 100 100">
<path d="M78 30 A36 36 0 1 0 84 56" fill="none" stroke="${GREEN}" stroke-width="13" stroke-linecap="round"/>
<path d="M30 52 C42 40 52 62 66 50 L84 50" fill="none" stroke="${GREEN}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
await sharp(Buffer.from(ic)).png().toFile('logo_icon.png');
})();
```

### Parte 2 — documento (executar: `node build.js saida.docx`)
```js
const fs=require('fs');const sharp=require('sharp');
const {Document,Packer,Paragraph,TextRun,ImageRun,Table,TableRow,TableCell,WidthType,ShadingType,BorderStyle,AlignmentType,Header,Footer,PageNumber,PageBreak,VerticalAlign,HorizontalPositionRelativeFrom,VerticalPositionRelativeFrom,TextWrappingType}=require('docx');
const NAVY='1C1F3B',GREEN='8DC63F',GREY='F3F4F7',F='Calibri',W=9638;
const r=(t,o={})=>new TextRun({text:t,font:F,size:o.size||21,bold:o.bold,italics:o.it,color:o.color});
const p=(c,o={})=>new Paragraph({spacing:{after:o.after??120,before:o.before||0,line:o.line||276},alignment:o.align||AlignmentType.JUSTIFIED,children:typeof c==='string'?[r(c)]:c});
const gap=(a=160)=>new Paragraph({spacing:{after:a},children:[]});
const brk=()=>new Paragraph({children:[new PageBreak()]});
const NB={style:BorderStyle.NONE,size:0,color:'FFFFFF'};const noB={top:NB,bottom:NB,left:NB,right:NB,insideHorizontal:NB,insideVertical:NB};
const RB={top:NB,left:NB,right:NB,bottom:{style:BorderStyle.SINGLE,size:4,color:'D9DBE3'}};
const icon=fs.readFileSync('logo_icon.png');
let sec=0;
const bar=t=>new Table({width:{size:W,type:WidthType.DXA},columnWidths:[110,W-110],borders:noB,rows:[new TableRow({cantSplit:true,children:[
 new TableCell({width:{size:110,type:WidthType.DXA},shading:{type:ShadingType.CLEAR,fill:GREEN},borders:noB,children:[new Paragraph('')]}),
 new TableCell({width:{size:W-110,type:WidthType.DXA},shading:{type:ShadingType.CLEAR,fill:NAVY},borders:noB,margins:{top:90,bottom:90,left:180,right:120},children:[new Paragraph({keepNext:true,children:[r(`${++sec}. ${t}`,{bold:true,color:'FFFFFF',size:23})]})]})]})]});
const callout=(label,text)=>new Table({width:{size:W,type:WidthType.DXA},columnWidths:[80,W-80],borders:noB,rows:[new TableRow({cantSplit:true,children:[
 new TableCell({width:{size:80,type:WidthType.DXA},shading:{type:ShadingType.CLEAR,fill:GREEN},borders:noB,children:[new Paragraph('')]}),
 new TableCell({width:{size:W-80,type:WidthType.DXA},shading:{type:ShadingType.CLEAR,fill:'EEF5DA'},borders:noB,margins:{top:110,bottom:110,left:180,right:160},children:[p([r(label+' ',{bold:true,color:NAVY,size:20}),r(text,{size:20})],{after:0})]})]})]});
const STATUS={'Concluído':'2E7D32','Pendente':'B26A00','Em andamento':'1565C0','Crítico':'C62828','Alto':'C62828','Médio':'B26A00','Aguardando cliente':'B26A00'};
function tbl(cols,head,rows){
 const cell=(c,i,o={})=>new TableCell({width:{size:cols[i],type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,borders:o.hd?noB:RB,
  shading:o.fill?{type:ShadingType.CLEAR,fill:o.fill}:undefined,margins:{top:70,bottom:70,left:110,right:110},
  children:[new Paragraph({alignment:o.al||AlignmentType.LEFT,children:[r(c,{size:19,bold:o.hd||o.st,color:o.hd?'FFFFFF':(o.st?STATUS[c]||NAVY:undefined)})]})]});
 return new Table({width:{size:W,type:WidthType.DXA},columnWidths:cols,rows:[
  new TableRow({tableHeader:true,children:head.map((h,i)=>cell(h,i,{hd:true,fill:NAVY}))}),
  ...rows.map((row,k)=>new TableRow({cantSplit:true,children:row.map((c,i)=>cell(c,i,{fill:k%2?GREY:undefined,st:i===row.length-1,al:i===row.length-1?AlignmentType.CENTER:AlignmentType.LEFT}))}))]});
}
function timeline(items){
 return new Table({width:{size:W,type:WidthType.DXA},columnWidths:[1500,W-1500],borders:noB,rows:items.map(it=>new TableRow({cantSplit:true,children:[
  new TableCell({width:{size:1500,type:WidthType.DXA},borders:{...noB,right:{style:BorderStyle.SINGLE,size:12,color:it.c?'C62828':GREEN}},margins:{top:80,bottom:80,right:160},children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[r(it.h,{bold:true,color:it.c?'C62828':NAVY,size:19})]})]}),
  new TableCell({width:{size:W-1500,type:WidthType.DXA},borders:noB,shading:it.c?{type:ShadingType.CLEAR,fill:'FDECEA'}:undefined,margins:{top:80,bottom:80,left:220,right:120},children:[p(it.t,{after:0})]})]}))});
}
const bullet=t=>new Paragraph({spacing:{after:80},indent:{left:360,hanging:240},children:[r('•  ',{bold:true,color:GREEN}),r(t)]});

const D={usina:'UFV Tupi Paulista I',cliente:'2C Energia',titulo:'Condição crítica da via de acesso',
 dataOc:'Vistoria de campo em 16/11/2026',dataAss:'17 de novembro de 2026'};

const bgImg=new ImageRun({type:'png',data:fs.readFileSync('capa_bg.png'),transformation:{width:794,height:1123},
 floating:{horizontalPosition:{relative:HorizontalPositionRelativeFrom.PAGE,offset:0},verticalPosition:{relative:VerticalPositionRelativeFrom.PAGE,offset:0},behindDocument:true,allowOverlap:true,wrap:{type:TextWrappingType.NONE}},
 altText:{title:'capa',description:'capa',name:'capa'}});
const cw=(t,o)=>r(t,{color:'FFFFFF',...o});
const cover=[
 new Paragraph({spacing:{after:0},children:[bgImg,new ImageRun({type:'png',data:icon,transformation:{width:30,height:30},altText:{title:'logo',description:'logo',name:'logo'}}),cw('  Grid Co.',{bold:true,size:34})]}),
 new Paragraph({spacing:{after:3800},indent:{left:560},children:[r('Operação & Manutenção',{color:GREEN,size:17})]}),
 new Paragraph({spacing:{after:140},children:[r('RELATÓRIO DE OCORRÊNCIA',{color:'9A9DB8',size:18,bold:true})]}),
 new Paragraph({spacing:{after:80},children:[cw('Condição Crítica do Acesso —',{size:44})]}),
 new Paragraph({spacing:{after:360},border:{bottom:{style:BorderStyle.SINGLE,size:14,color:GREEN,space:14}},children:[r('UFV TUPI PAULISTA I',{bold:true,color:GREEN,size:60})]}),
 new Paragraph({spacing:{before:200,after:120},children:[r('VIA DE ACESSO À USINA E SEGURANÇA DA EQUIPE DE O&M',{color:'9A9DB8',size:17})]}),
 new Paragraph({spacing:{after:80},children:[cw('Erosão avançada no trecho de aclive e necessidade de recuperação do acesso',{bold:true,size:26})]}),
 new Paragraph({spacing:{after:2400},children:[r(D.dataOc,{color:GREEN,size:22})]}),
 ...[['Cliente',D.cliente],['Usina',D.usina+' — Tupi Paulista/SP'],['Data do relatório',D.dataAss],['Responsável técnico','Fred Alexandrino — Supervisor de O&M']].map(([k,v])=>
  new Paragraph({spacing:{after:70},children:[r(k.toUpperCase()+'   ',{color:'9A9DB8',size:16,bold:true}),cw(v,{size:20})]})),
];

const body=[];
body.push(bar('OBJETIVO DO DOCUMENTO'),gap(140),
 p('Este documento registra as condições atuais da via de acesso à UFV Tupi Paulista I, utilizada praticamente todos os dias pela equipe de O&M da Grid nas rotinas de inspeção, manutenção preventiva e atendimentos corretivos. O objetivo é formalizar ao cliente os riscos identificados e solicitar providências para a recuperação do acesso.'),
 gap(60),callout('ENQUADRAMENTO —','Ocorrência de infraestrutura e segurança. O acesso apresenta processo erosivo ativo que se agrava a cada chuva, com risco à equipe, aos veículos e à continuidade do atendimento à usina.'),gap(280));
body.push(bar('CRONOLOGIA DA OCORRÊNCIA'),gap(140),timeline([
 {h:'Rotina',t:'O trecho de subida junto ao alambrado é o caminho usado pela equipe Grid para chegar à usina, praticamente todos os dias.'},
 {h:'16/11 17h23',t:'Início da vistoria na base da subida. Sulco de erosão profundo na faixa de rodagem, parcialmente encoberto pela vegetação.',c:true},
 {h:'16/11 17h24',t:'Ao longo do trecho: cratera na lateral da via e ravina longitudinal no eixo do acesso, com desnível acentuado entre as trilhas de roda.',c:true},
 {h:'16/11 17h24',t:'Rampa final até o platô da usina: sulcos profundos nas trilhas de roda, solo arenoso solto e ausência de drenagem.',c:true},
 {h:'17/11/2026',t:'Emissão deste relatório e comunicação formal ao cliente.'},
]),gap(280));
body.push(brk(),bar('CONDIÇÕES E RISCOS IDENTIFICADOS'),gap(140),tbl([3000,4938,1700],['Item','Situação identificada','Criticidade'],[
 ['Sulcos e ravinas no leito da via','Erosão profunda no eixo do acesso e nas trilhas de roda, causada pelo escoamento da chuva','Crítico'],
 ['Crateras na lateral do acesso','Bordas instáveis e solo exposto, com risco de a roda do veículo ceder','Crítico'],
 ['Drenagem superficial','Inexistente: a água da chuva corre pela própria via e aprofunda a erosão','Alto'],
 ['Revestimento do leito','Solo arenoso solto, sem compactação ou cascalhamento','Alto'],
 ['Segurança da equipe e veículos','Risco de tombamento ou atolamento do veículo e de queda de quem transita a pé','Crítico'],
 ['Atendimento à usina','Após chuvas, o acesso pode ficar intransitável e atrasar respostas a falhas e emergências','Alto'],
]),gap(280));
body.push(bar('AÇÕES REALIZADAS E PENDÊNCIAS'),gap(140),tbl([1500,6138,2000],['Data','Ação','Status'],[
 ['16/11/2026','Vistoria do trecho e registro fotográfico georreferenciado (João Salles)','Concluído'],
 ['17/11/2026','Emissão do relatório e comunicação ao cliente','Concluído'],
 ['Em curso','Avaliação das condições do trecho pela equipe Grid antes de cada deslocamento','Em andamento'],
 ['A definir','Posicionamento do cliente e previsão de recuperação do acesso','Aguardando cliente'],
 ['A definir','Execução da recuperação da via (contratada do cliente)','Pendente'],
]),gap(280));

const Z='/home/claude/zip/'; // → no dashboard: diretório/storage das fotos do caso
const ev=[
 [Z+'WhatsApp Image 2026-11-17 at 08.55.25 (3).jpeg','Base da subida: sulco de erosão profundo na faixa de rodagem','16/11/2026, 17h23'],
 [Z+'WhatsApp Image 2026-11-17 at 08.55.25 (2).jpeg','Cratera na lateral da via, com bordas instáveis e solo exposto','16/11/2026, 17h24'],
 [Z+'WhatsApp Image 2026-11-17 at 08.55.25 (1).jpeg','Ravina no eixo do acesso, com desnível entre as trilhas de roda','16/11/2026, 17h24'],
 [Z+'WhatsApp Image 2026-11-17 at 08.55.25 (4).jpeg','Leito da via: solo arenoso solto e canais abertos pela água','16/11/2026, 17h24'],
 [Z+'WhatsApp Image 2026-11-17 at 08.55.25.jpeg','Rampa final até o platô: sulcos profundos nas trilhas de roda','16/11/2026, 17h24'],
];
async function evid(){
 const out=[];let first=true;
 for(const [path,leg,quando] of ev){
  const buf=await sharp(path).rotate().jpeg({quality:85}).toBuffer();const m=await sharp(buf).metadata();
  const maxW=600,maxH=680;let w=maxW,h=Math.round(m.height*maxW/m.width);if(h>maxH){h=maxH;w=Math.round(m.width*maxH/m.height);}
  out.push(brk());
  if(first){out.push(bar('EVIDÊNCIAS FOTOGRÁFICAS'),gap(200));first=false;}
  out.push(new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:120},children:[new ImageRun({type:'jpg',data:buf,transformation:{width:w,height:h},altText:{title:'f',description:leg,name:'f'}})]}),
   new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:40},children:[r(leg,{bold:true,color:NAVY,size:20})]}),
   new Paragraph({alignment:AlignmentType.CENTER,children:[r(`${quando}  |  Registro: João Salles  |  ${D.usina}`,{size:18,color:'777777'})]}));
 }
 return out;
}
(async()=>{
 body.push(...await evid());
 body.push(brk(),bar('PONTO DE ATENÇÃO — RECUPERAÇÃO DO ACESSO'),gap(140),
  callout('RESUMO —','A segurança da equipe e a continuidade do atendimento dependem da recuperação da via antes do agravamento pelas chuvas.'),gap(160),
  p('Recomendamos que o cliente avalie, em caráter prioritário, a recuperação da via de acesso, contemplando, a critério da contratada responsável pela execução civil:'),
  bullet('Recomposição das erosões, regularização e compactação do leito da via;'),
  bullet('Revestimento primário (cascalhamento ou material equivalente) no trecho de aclive;'),
  bullet('Drenagem superficial (lombadas de desvio, canaletas e saídas laterais) para impedir que a água escoe pela via;'),
  bullet('Inspeção periódica do trecho após o período de chuvas.'),gap(80),
  p('Até a regularização, a equipe da Grid seguirá avaliando as condições do trecho antes de cada deslocamento, priorizando a segurança. Após chuvas intensas, o acesso poderá ser temporariamente suspenso, o que pode impactar o tempo de atendimento à usina.'),gap(280));
 body.push(bar('CONCLUSÃO'),gap(140),
  p('A via de acesso à UFV Tupi Paulista I encontra-se em condição crítica, com processo erosivo ativo que tende a se agravar ao longo do período chuvoso. Por se tratar de trajeto utilizado quase diariamente pela equipe de O&M, a situação representa risco direto à segurança das pessoas e à continuidade da operação e manutenção da usina.'),
  p('Solicitamos o posicionamento da 2C Energia quanto à recuperação do acesso, com previsão de execução. A Grid permanece à disposição para acompanhar a vistoria no local com a empresa contratada.'),
  gap(500),p(`Tupi Paulista (SP), ${D.dataAss}.`,{align:AlignmentType.LEFT}),gap(600),
  new Paragraph({spacing:{after:0},indent:{right:5600},border:{top:{style:BorderStyle.SINGLE,size:6,color:NAVY,space:4}},children:[r('Fred Alexandrino',{bold:true,color:NAVY})]}),
  new Paragraph({children:[r('Supervisor de O&M — Grid Co.',{size:19})]}));
 const header=new Header({children:[new Paragraph({border:{bottom:{style:BorderStyle.SINGLE,size:4,color:'D9DBE3',space:4}},children:[new ImageRun({type:'png',data:icon,transformation:{width:13,height:13},altText:{title:'l',description:'l',name:'l'}}),r('  RELATÓRIO DE OCORRÊNCIA  |  '+D.titulo+' — '+D.usina,{size:15,color:'555555'})]})]});
 const footer=new Footer({children:[new Paragraph({border:{top:{style:BorderStyle.SINGLE,size:4,color:'D9DBE3',space:4}},tabStops:[{type:'right',position:W}],children:[r('Grid Co.  |  '+D.usina+'  |  Revisão 01  |  novembro 2026',{size:15,color:'777777'}),new TextRun({children:['\t',PageNumber.CURRENT],font:F,size:15,color:'777777'})]})]});
 const pg={size:{width:11906,height:16838}};
 const doc=new Document({styles:{default:{document:{run:{font:F,size:21}}}},sections:[
  {properties:{page:{...pg,margin:{top:1100,bottom:600,left:1500,right:1300,header:0,footer:0}}},children:cover},
  {properties:{page:{...pg,margin:{top:1300,bottom:1200,left:1134,right:1134,header:500,footer:500},pageNumbers:{start:2}}},headers:{default:header},footers:{default:footer},children:body}]});
 fs.writeFileSync(process.argv[2],await Packer.toBuffer(doc));console.log('ok');
})();
```

Notas de parametrização do script:
- `STATUS` do script cobre os principais; somar `Recuperado` (verde) e `Substituição necessária` (âmbar) conforme seção 8.2.
- `sec` é o contador das barras — **zerar a cada geração** (no servidor, ele é global ao módulo; mova para dentro de `buildReport`).
- Seção de evidências só entra se `evidencias.length > 0`.
- Variante interna (análise preliminar âmbar): mesma estrutura do `callout`, com aba `B26A00` e fundo `FFF4E0`; nunca na versão cliente.
- "Revisão NN" e "<mês ano>" do rodapé: derivar de `revisao` e `dataAssinatura`.

# HISTÓRICO COMPILADO — Painel de Falhas O&M
**Data:** 29/06/2026 · Versão final publicada no GitHub

---

## ARQUIVOS PUBLICADOS

| Arquivo | Repositório | Linhas | Publicado via |
|---------|-------------|--------|---------------|
| `app.py` | `Fred-Alexandrino/painel-falhas` | 2173 | API GitHub ✅ |
| `index.html` | `Fred-Alexandrino/PAINELDEFALHAS` | 2687 | API GitHub ✅ |
| `sw.js` | `Fred-Alexandrino/PAINELDEFALHAS` | 134 | API GitHub ✅ |

---

## TODAS AS CORREÇÕES E FEATURES IMPLEMENTADAS

### app.py — Correções

| # | Problema | Solução | Função |
|---|----------|---------|--------|
| 1 | Causa vazia — Descrição dos Problemas não gravada | `causa = descricao` no parse COS Grid | `parse_bloco_cos_grid()` |
| 2 | Status "Em Aberto" com equipe acionada | Equipe preenchida → `Em Andamento` | `parse_bloco_cos_grid()` |
| 3 | Normalização criando 8+ duplicatas (Araputanga) | Busca em concluídas antes de criar nova | `processar_texto()` |
| 4 | Switch deferida OS 981 ≠ Tracker 2 OS 981 | OS + Usina = mesma ocorrência | `buscar_por_fingerprint()` |
| 5 | Reincidência criando nova linha | Reabre concluída há ≤ 7 dias | `buscar_por_fingerprint()` |
| 6 | Mensagens de grupo alterando status de ocorrências | Status NUNCA alterado em updates — só na criação e normalização | `atualizar_ocorrencia()` |
| 7 | Chamado fabricante + campo normal sem status correto | Detecta e define "Aguardando Fabricante" | `detectar_aguardando_fabricante()` |
| 8 | Ronda diária "Sem Ocorrência" criando registro | `eh_ronda_status_ok()` filtra antes de processar | `webhook` + `/rondas` |
| 9 | Ibaté I / INV-03 / OS 7937 duplicado | Normaliza OS antes de comparar (`_norm_os`) | `buscar_por_fingerprint()` |
| 10 | Histórico com "Garantia" repetido sem contexto | `acao_resumida` mapeado para texto descritivo | `extrair_atualizacoes_por_ativo()` |
| 11 | Log de mensagens crescendo indefinidamente | Limpeza automática > 5 dias | `limpar_log_antigo()` |
| 12 | `/rondas/grupos` não mostrava mensagens processadas | Nova `ler_log_historico()` inclui todas | `rondas_por_grupo()` |

### Regra de status (definitiva)

O status de uma ocorrência **só é escrito em 2 lugares em todo o código:**

| Onde | Status | Condição |
|------|--------|----------|
| `gravar_nova_ocorrencia()` | Status do parse (Em Aberto / Em Andamento) | Somente na **criação** |
| `normalizar_ocorrencia()` | `Concluído` | Somente quando chega ✅ NORMALIZADO |
| `atualizar_ocorrencia()` | `Aguardando Fabricante` | Somente se chamado + campo normal detectados |

Qualquer outra mensagem que chegue (webhook ou ronda) e encontre ocorrência existente → acrescenta no histórico/ação, **status intocado**.

---

### index.html — Features e melhorias

| # | Feature | Descrição |
|---|---------|-----------|
| 1 | Modal rondas em tela cheia | Layout 2 colunas: sidebar de grupos + área de mensagens |
| 2 | Sidebar de grupos | Ponto colorido: teal (processado), âmbar pulsante (pendente), cinza (vazio) |
| 3 | Cards de mensagem com scroll | Altura fixa + `overflow-y:auto` independente por card |
| 4 | Última mensagem com destaque | Borda teal, label "↑ mais recente", aberta por padrão; antigas fechadas |
| 5 | Badge processado/pendente | `✅ processado` ou `⏳ pendente` por mensagem |
| 6 | Timestamp por mensagem | Horário visível no cabeçalho de cada card |
| 7 | Botão 🔔 toggle | Ativa e desativa notificações (hover vermelho "Desativar" quando ativo) |
| 8 | Ordenar por "Registradas recentemente" | ID decrescente = última linha da planilha primeiro |
| 9 | Renomeado "Mais recentes" → "Por data ocorrência" | Evita confusão com o novo botão de registro |

---

## ESTRUTURA DO app.py — FUNÇÕES PRINCIPAIS

### Google Sheets
- `get_gc()` — autenticação com service account
- `get_log_sheet()` — acessa aba "Log de Mensagens"
- `gravar_log_mensagem()` — grava mensagem recebida no log
- `ler_log_mensagens()` — lê mensagens NÃO processadas (para /rondas)
- `ler_log_historico()` — lê TODAS as mensagens (para visualização histórica)
- `marcar_processado()` — marca linha com ✅
- `limpar_log_antigo()` — remove linhas > 5 dias automaticamente

### Catálogo de usinas (24 usinas)
- `canonizar_usina()` — resolve qualquer variação → nome oficial
- `inferir_cliente()` — retorna cliente dado a usina canônica
- `usina_permitida()` — verifica se usina está no catálogo

### Detecção de estado
- `eh_ronda_status_ok()` — detecta ronda diária sem falha → ignora (não cria ocorrência)
- `detectar_aguardando_fabricante()` — chamado + campo normal → "Aguardando Fabricante"
- `eh_normalizacao()` — detecta ✅ NORMALIZADO
- `detectar_status_emoji()` — 🔴🟡🟢 → status

### Parse de mensagens
- `parse_bloco_cos_grid()` — formato COS Grid (🔴 + bullets ·)
- `parse_bloco()` — formato original (emojis 🔴🟡🟢 + *)
- `extrair_atualizacoes_por_ativo()` — extrai por equipamento das rondas
- `separar_blocos()` — divide texto com múltiplos blocos

### Deduplicação (4 níveis)
- `buscar_por_fingerprint()`:
  1. OS + Usina (mais forte — independente do equipamento)
  2. Usina + tipo/número do equipamento
  3. Fingerprint de palavras-chave
  4. Reincidência ≤ 7 dias → reabre ocorrência concluída

### Operações na planilha
- `atualizar_ocorrencia()` — acrescenta histórico/ação; **NUNCA altera status**
- `normalizar_ocorrencia()` — fecha ocorrência → Concluído
- `gravar_nova_ocorrencia()` — cria nova linha com status do parse
- `processar_texto(texto, origem)` — orquestra tudo

### Endpoints Flask
| Endpoint | Descrição |
|----------|-----------|
| `POST /webhook` | Recebe mensagens em tempo real do server.js |
| `POST /rondas` | Reprocessa últimas 6h + limpeza automática do log |
| `POST /rondas/grupos` | Histórico visual por grupo (somente leitura) |
| `POST /push/subscribe` | Registra dispositivo VAPID |
| `POST /push/test` | Testa notificação push |
| `GET /health` | Status do servidor (UptimeRobot) |
| `GET /limpar-duplicatas?secret=falhas2026` | Limpeza manual |
| `POST /test` | Debug de parse sem gravar |

---

## FORMATOS DE MENSAGEM SUPORTADOS

### COS Grid (bullets ·)
```
🔴Usina: Araputanga
· Problemas: Usina desligada
· Descrição dos Problemas: Atuação das proteções 27/59  → CAUSA
· Impacto: Usina toda                                   → EQUIP. IMPACTADOS
· Ação: Técnico acionado
· Equipe Acionada: @driano                              → status = Em Andamento
· Nº da OS: 8576
```

### Original (emojis + asteriscos)
```
🔴 DESVIO: Boa Esperança do Sul 1
* Problema: Tracker 2 com defeito interno
* Ação: Acionamento de garantia
* Equipe Acionada: sim, Rodolfo
* Nº da OS: 981
```

### Normalização
```
✅ NORMALIZADO: Araputanga
· Fim da Ocorrência: 29/06/2026 - 08:30
· Nº da OS: 8576
```

### Ronda diária OK → IGNORADA
```
RONDA DIÁRIA - 29/06/2026
⚠ Status operacional da usina Alves Lima:
1. Status Atual: ✅ABC Morada Nova OK.
2. Ocorrências durante o turno: Sem Ocorrência.
3. Ocorrências pendentes: Sem Ocorrência.
```

---

## CATÁLOGO DE USINAS (24 usinas)

| Cliente | Usinas |
|---------|--------|
| RENOGRID | Nova Xavantina I/II, Colíder I/II, Nobres, Elias Fausto, Crateús |
| THOPEN | Boa Esperança do Sul I/II, Ibaté I/II, Matão 1, Matão II-Topázio, Sítio Bonfim, Poconé, Canarana I/II, Ribeirão Cascalheira |
| 2C | Araputanga, Sete Lagoas |
| GD Energy | Guajirú, Sol do Norte I/II |
| Alves Lima | ABC Morada Nova |

---

## CONFIGURAÇÕES COMPLETAS

### Variáveis de ambiente — `whatsapp-painel-falhas` (Render)

| Chave | Valor |
|-------|-------|
| `GOOGLE_CREDENTIALS_JSON` | JSON completo da service account |
| `SHEET_ID` | `1VLo8__wxSJVWiUIFd_JTcOnadJlUt440i1M1pC0ehTs` |
| `SHEET_NAME` | `Painel de Falhas - Fred Alexandrino` |
| `WEBHOOK_SECRET` | `falhas2026` |
| `WPP_SERVER_URL` | `https://wppconnect-painel.onrender.com` |
| `GRUPOS_IDS` | `120363423233716775@g.us,120363423427343356@g.us,120363402559504115@g.us,120363426381032089@g.us,120363423844956611@g.us,120363421162420788@g.us,120363425837962709@g.us,120363402176878100@g.us,120363423533840348@g.us,120363421052607450@g.us` |
| `VAPID_PUBLIC_KEY` | `BPU55JogEEcV6GlCUONmzkVam8Tt9a0DuX3FYfn_ltgKc8p1fahQiE8v5RGECnMkSYEXMyUzOYBtslhUdiOJ6Jk` |
| `VAPID_PRIVATE_KEY` | `LS0tLS1CRUdJTiBFQyBQUklWQVRFIEtFWS0tLS0tCk1IY0NBUUVFSUZBY24vUm9vM05kejQreHVNQ0NHcWxreHVYeE9RMng2RGpnTjFoTnhzZW1vQW9HQ0NxR1NNNDkKQXdFSG9VUURRZ0FFOVRua21pQVFSeFhvYVVKUTQyYk9SVnFieE8zMXJRTzVmY1ZoK2YrVzJBcHp5blY5cUZDSQpUeS9sRVlRS2N5UkpnUmN6SlRNNWdHMnlXRlIySTRub21RPT0KLS0tLS1FTkQgRUMgUFJJVkFURSBLRVktLS0tLQo=` |

### Variáveis de ambiente — `wppconnect-painel` (Render)

| Chave | Valor |
|-------|-------|
| `GRUPOS_IDS` | *(mesmo valor acima)* |
| `SERVIDOR_URL` | `https://whatsapp-painel-falhas.onrender.com` |
| `WEBHOOK_SECRET` | `falhas2026` |
| `SESSION_NAME` | `gridco-oem` |

### Credenciais do dashboard

| Usuário | Senha | Perfil |
|---------|-------|--------|
| `fredalexandrino` | `Fred2004@` | manager — acesso completo |
| `admin` | `gridco2026` | admin — somente visualização |
| `thopen` | `thopen2026` | client — só usinas THOPEN |
| `renogrid` | `reno2026` | client — só usinas RENOGRID |

### URLs importantes

| Serviço | URL |
|---------|-----|
| Dashboard | `https://fred-alexandrino.github.io/PAINELDEFALHAS/` |
| App.py health | `https://whatsapp-painel-falhas.onrender.com/health` |
| Server.js status | `https://wppconnect-painel.onrender.com/status` |
| QR Code WhatsApp | `https://wppconnect-painel.onrender.com/qr` |
| Planilha | `https://docs.google.com/spreadsheets/d/1VLo8__wxSJVWiUIFd_JTcOnadJlUt440i1M1pC0ehTs` |
| Apps Script | `https://script.google.com/macros/s/AKfycbya1PLWxm1quM889etDastzC4BMUOQCy6wYVZfWTFY5jy9jLKQR32XJdco7ywPaxmVm3g/exec` |

### UptimeRobot — 2 monitores (intervalo: 5 min)
- `https://whatsapp-painel-falhas.onrender.com/health`
- `https://wppconnect-painel.onrender.com/health`

### Grupos monitorados

| Nome | ID |
|------|----|
| [O&M] Renogrid | `120363423233716775@g.us` |
| [O&M] Thopen | `120363423427343356@g.us` |
| [O&M] 2C | `120363402559504115@g.us` |
| [O&M] Alves Lima | `120363426381032089@g.us` |
| [O&M] GD Energy | `120363423844956611@g.us` |
| COS Centro-Oeste | `120363421162420788@g.us` |
| COS Sul | `120363425837962709@g.us` |
| COS Nordeste | `120363402176878100@g.us` |
| COS Sudeste | `120363423533840348@g.us` |
| COS Norte | `120363421052607450@g.us` |

---

## STATUS ATUAL (29/06/2026)

### ✅ Funcionando
- WhatsApp conectado (10 grupos)
- Monitoramento em tempo real
- Parse dos 2 formatos de mensagem
- 24 usinas no catálogo canônico
- Deduplicação em 4 níveis
- Status imutável em updates (só muda na criação/normalização)
- Rondas "Sem Ocorrência" ignoradas
- "Aguardando Fabricante" detectado automaticamente
- Histórico descritivo por tipo de evento
- Log com limpeza automática > 5 dias
- Modal "Últimas rondas" em tela cheia com sidebar
- Cards com scroll independente + última mensagem em destaque
- Botão 🔔 toggle ativar/desativar notificações
- Ordenar por "Registradas recentemente" (ID decrescente)
- Abas Ativas/Histórico
- Banner + KPI desligamentos
- Admin = somente visualização
- Filtros multiselect
- Drawer com edição (manager)
- Mobile responsivo
- sw.js com cache offline
- UptimeRobot mantendo serviços ativos
- Publicação direta no GitHub via API

### ⚠ Pendente
- Ativar notificações push no celular (clicar 🔔)
- Limpar duplicatas antigas de Araputanga (IDs 63-70)

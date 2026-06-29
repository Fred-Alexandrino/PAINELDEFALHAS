# HISTÓRICO COMPILADO — Painel de Falhas O&M
**Data:** 29/06/2026 · Versão final publicada no GitHub

---

## ARQUIVOS DESTA SESSÃO

| Arquivo | Repositório | Linhas |
|---------|-------------|--------|
| `app.py` | `Fred-Alexandrino/painel-falhas` | 2173 |
| `index.html` | `Fred-Alexandrino/PAINELDEFALHAS` | 2687 |
| `sw.js` | `Fred-Alexandrino/PAINELDEFALHAS` | 134 |

> Todos publicados diretamente via API do GitHub — sem push manual.

---

## COMO PUBLICAR ARQUIVOS DIRETAMENTE NO GITHUB

```python
import requests, base64

TOKEN = "ghp_SEU_TOKEN_AQUI"
HEADERS = {"Authorization": f"token {TOKEN}", "Accept": "application/vnd.github.v3+json"}

def get_sha(repo, path):
    r = requests.get(
        f"https://api.github.com/repos/Fred-Alexandrino/{repo}/contents/{path}",
        headers=HEADERS)
    return r.json().get("sha") if r.status_code == 200 else None

def push_file(repo, path, local_path, message):
    with open(local_path, "rb") as f:
        content = base64.b64encode(f.read()).decode()
    sha = get_sha(repo, path)
    payload = {"message": message, "content": content}
    if sha: payload["sha"] = sha
    r = requests.put(
        f"https://api.github.com/repos/Fred-Alexandrino/{repo}/contents/{path}",
        headers=HEADERS, json=payload)
    return r.status_code

# Uso:
push_file("painel-falhas",  "app.py",     "/caminho/app.py",     "fix: descrição")
push_file("PAINELDEFALHAS", "index.html", "/caminho/index.html", "feat: descrição")
push_file("PAINELDEFALHAS", "sw.js",      "/caminho/sw.js",      "feat: descrição")
```

**Gerar token:** github.com → foto → Settings → Developer settings →
Personal access tokens → Tokens (classic) → Generate → marque ✅ `repo` → copie (`ghp_...`)

---

## TODAS AS CORREÇÕES E FEATURES

### app.py

| # | Problema | Solução | Função |
|---|----------|---------|--------|
| 1 | Causa vazia — Descrição dos Problemas não gravada | `causa = descricao` no parse COS Grid | `parse_bloco_cos_grid()` |
| 2 | Status "Em Aberto" com equipe acionada | Equipe preenchida → `Em Andamento` | `parse_bloco_cos_grid()` |
| 3 | Normalização criando 8+ duplicatas | Busca em concluídas antes de criar nova | `processar_texto()` |
| 4 | Switch deferida OS 981 ≠ Tracker 2 OS 981 | OS + Usina = mesma ocorrência | `buscar_por_fingerprint()` |
| 5 | Reincidência criando nova linha | Reabre concluída há ≤ 7 dias | `buscar_por_fingerprint()` |
| 6 | Mensagens de grupo alterando status | Status NUNCA alterado em updates | `atualizar_ocorrencia()` |
| 7 | Chamado fabricante + campo normal | Detecta → "Aguardando Fabricante" | `detectar_aguardando_fabricante()` |
| 8 | Ronda diária "Sem Ocorrência" criando registro | `eh_ronda_status_ok()` filtra antes | `webhook` + `/rondas` |
| 9 | Ibaté I / INV-03 / OS 7937 duplicado | Normaliza OS antes de comparar | `_norm_os()` |
| 10 | Histórico com "Garantia" repetido | `acao_resumida` com texto descritivo | `extrair_atualizacoes_por_ativo()` |
| 11 | Log crescendo indefinidamente | Limpeza automática > 5 dias | `limpar_log_antigo()` |
| 12 | `/rondas/grupos` não mostrava processadas | Nova `ler_log_historico()` | `rondas_por_grupo()` |

### Regra de status (definitiva)

Status só é escrito em **3 pontos** em todo o código:

| Onde | Status | Condição |
|------|--------|----------|
| `gravar_nova_ocorrencia()` | Status do parse | Somente na **criação** |
| `normalizar_ocorrencia()` | `Concluído` | Somente quando ✅ NORMALIZADO |
| `atualizar_ocorrencia()` | `Aguardando Fabricante` | Chamado + campo normal detectados |

### index.html

| # | Feature | Descrição |
|---|---------|-----------|
| 1 | Modal rondas em tela cheia | Sidebar de grupos + área de mensagens navegável |
| 2 | Cards de mensagem com scroll | Altura fixa + scroll independente por card |
| 3 | Última mensagem em destaque | Borda teal, label "↑ mais recente", aberta por padrão |
| 4 | Badge processado/pendente | `✅ processado` ou `⏳ pendente` por mensagem |
| 5 | Botão 🔔 toggle | Ativa e desativa notificações |
| 6 | Ordenar "Registradas recentemente" | ID decrescente = última linha da planilha primeiro |
| 7 | Barras pulsantes | "Em Aberto" (laranja) e "Abrir Chamado" (âmbar) pulsam |
| 8 | Status idênticos à planilha | 12 status com cores distintas |
| 9 | Vermelho exclusivo para desligamentos | Laranja/âmbar para urgência, vermelho só para usinas desligadas |

---

## LISTA DE STATUS (12 — idênticos à planilha)

| Status | Cor | Pulsa | Aba |
|--------|-----|-------|-----|
| Em Aberto | 🟠 Laranja `#F97316` | ✅ | Ativas |
| Pausado | ⚫ Cinza `#64748B` | — | Ativas |
| Aguardando Cliente | 🟣 Roxo `#A855F7` | — | Ativas |
| Aguardando Fabricante | 🟧 Laranja claro `#FB923C` | — | Ativas |
| Aguardando Equipamento | 🟡 Âmbar `#F59E0B` | — | Ativas |
| Em Andamento | 🩵 Teal `#3FC1B0` | — | Ativas |
| Corrigir Ronda - COS | 🔵 Azul `#60A5FA` | — | Ativas |
| Abrir Chamado | 🟡 Âmbar vivo `#FBBF24` | ✅ | Ativas |
| Solicitar OS | 💜 Lilás `#C084FC` | — | Ativas |
| Análise de Performance | 🩵 Ciano `#38BDF8` | — | Ativas |
| Análise Engenharia | 💙 Índigo `#818CF8` | — | Ativas |
| Concluído | 🟢 Verde `#22C55E` | — | Histórico |

---

## ESTRUTURA DO app.py

### Endpoints Flask

| Endpoint | Descrição |
|----------|-----------|
| `POST /webhook` | Recebe mensagens em tempo real do server.js |
| `POST /rondas` | Reprocessa últimas 6h + limpeza log |
| `POST /rondas/grupos` | Histórico visual por grupo (somente leitura) |
| `POST /push/subscribe` | Registra dispositivo VAPID |
| `GET /health` | Status do servidor (UptimeRobot) |
| `GET /limpar-duplicatas?secret=falhas2026` | Limpeza manual de duplicatas |

### Funções principais

| Função | Descrição |
|--------|-----------|
| `eh_ronda_status_ok()` | Detecta ronda sem falha → ignora |
| `detectar_aguardando_fabricante()` | Chamado + campo normal → status |
| `buscar_por_fingerprint()` | Deduplicação 4 níveis |
| `atualizar_ocorrencia()` | Acrescenta histórico; NUNCA altera status |
| `normalizar_ocorrencia()` | Fecha ocorrência → Concluído |
| `gravar_nova_ocorrencia()` | Cria linha com status do parse |
| `processar_texto(texto, origem)` | Orquestra tudo |
| `limpar_log_antigo()` | Remove linhas > 5 dias |
| `ler_log_historico()` | Lê todas as msgs (inclui processadas) |

### Formatos de mensagem suportados

**COS Grid (bullets ·)**
```
🔴Usina: Araputanga
· Problemas: Usina desligada
· Descrição dos Problemas: Atuação das proteções 27/59  → CAUSA
· Impacto: Usina toda                                   → EQUIP. IMPACTADOS
· Equipe Acionada: @driano                              → status = Em Andamento
· Nº da OS: 8576
```

**Original (emojis + asteriscos)**
```
🔴 DESVIO: Boa Esperança do Sul 1
* Problema: Tracker 2 com defeito interno
* Equipe Acionada: sim, Rodolfo
* Nº da OS: 981
```

**Ronda diária OK → IGNORADA (não cria ocorrência)**
```
RONDA DIÁRIA - 29/06/2026
2. Ocorrências durante o turno: Sem Ocorrência.
3. Ocorrências pendentes: Sem Ocorrência.
```

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
| `thopen` | `thopen2026` | client — só THOPEN |
| `renogrid` | `reno2026` | client — só RENOGRID |

### URLs importantes

| Serviço | URL |
|---------|-----|
| Dashboard | `https://fred-alexandrino.github.io/PAINELDEFALHAS/` |
| App.py health | `https://whatsapp-painel-falhas.onrender.com/health` |
| Server.js status | `https://wppconnect-painel.onrender.com/status` |
| QR Code WhatsApp | `https://wppconnect-painel.onrender.com/qr` |
| Planilha | `https://docs.google.com/spreadsheets/d/1VLo8__wxSJVWiUIFd_JTcOnadJlUt440i1M1pC0ehTs` |
| Apps Script | `https://script.google.com/macros/s/AKfycbya1PLWxm1quM889etDastzC4BMUOQCy6wYVZfWTFY5jy9jLKQR32XJdco7ywPaxmVm3g/exec` |

### UptimeRobot (intervalo: 5 min)
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

### Catálogo de usinas (24)

| Cliente | Usinas |
|---------|--------|
| RENOGRID | Nova Xavantina I/II, Colíder I/II, Nobres, Elias Fausto, Crateús |
| THOPEN | Boa Esperança do Sul I/II, Ibaté I/II, Matão 1, Matão II-Topázio, Sítio Bonfim, Poconé, Canarana I/II, Ribeirão Cascalheira |
| 2C | Araputanga, Sete Lagoas |
| GD Energy | Guajirú, Sol do Norte I/II |
| Alves Lima | ABC Morada Nova |

---

## STATUS ATUAL (29/06/2026)

### ✅ Funcionando
- WhatsApp conectado (10 grupos)
- Parse dos 2 formatos + ronda diária OK ignorada
- Status imutável em updates (só muda na criação/normalização)
- Deduplicação em 4 níveis
- "Aguardando Fabricante" detectado automaticamente
- Log com limpeza automática > 5 dias
- Modal rondas em tela cheia com sidebar
- 12 status idênticos à planilha com cores distintas
- "Em Aberto" (laranja) e "Abrir Chamado" (âmbar) pulsam
- Vermelho exclusivo para desligamentos
- Ordenar por "Registradas recentemente" (ID decrescente)
- Botão 🔔 toggle ativar/desativar notificações
- sw.js com cache offline
- Publicação direta no GitHub via API

### ⚠ Pendente
- Ativar notificações push no celular (clicar 🔔)
- Limpar duplicatas antigas de Araputanga (IDs 63-70)

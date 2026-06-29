# GUIA COMPLETO — Painel de Falhas O&M
## Todas as plataformas · Configurações · Passo a passo
**Fred Alexandrino · Grid Co. · 29/06/2026**

---

# 1. VISÃO GERAL

## Fluxo completo

```
WhatsApp (10 grupos)
       │
       ▼
server.js — Node.js/Baileys          ← UptimeRobot pinga /health (5 min)
wppconnect-painel.onrender.com
       │ POST /webhook
       ▼
app.py — Python/Flask                ← UptimeRobot pinga /health (5 min)
whatsapp-painel-falhas.onrender.com
       │ gspread (Google Sheets API)
       ▼
Google Sheets
├─ "Painel de Falhas - Fred Alexandrino"  (ocorrências)
└─ "Log de Mensagens"  (histórico · limpeza auto > 5 dias)
       │ CSV público / gviz
       ▼
index.html — GitHub Pages
fred-alexandrino.github.io/PAINELDEFALHAS
       │ Apps Script (edições do drawer)
       ▼
Google Sheets (gravação)
```

## Plataformas

| Plataforma | Função | Custo |
|------------|--------|-------|
| GitHub | Repositórios + Pages (dashboard) | Gratuito |
| Render | Executa app.py e server.js | Gratuito |
| Google Cloud | Service Account para Sheets API | Gratuito |
| Google Sheets | Banco de dados das ocorrências | Gratuito |
| Google Apps Script | Salva edições do drawer | Gratuito |
| UptimeRobot | Mantém servidores acordados | Gratuito |

---

# 2. GITHUB

## Repositórios

| Repositório | Conteúdo | URL |
|-------------|----------|-----|
| `painel-falhas` | `app.py`, `requirements.txt`, `render.yaml` | github.com/Fred-Alexandrino/painel-falhas |
| `wppconnect-server` | `server.js`, `package.json` | github.com/Fred-Alexandrino/wppconnect-server |
| `PAINELDEFALHAS` | `index.html`, `sw.js` | github.com/Fred-Alexandrino/PAINELDEFALHAS |

## Ativar GitHub Pages (PAINELDEFALHAS)

1. Repositório → **Settings** → **Pages**
2. Source: **Deploy from a branch** → `main` → `/ (root)`
3. **Save** → aguarda ~1 min
4. URL: `https://fred-alexandrino.github.io/PAINELDEFALHAS/`

## Deploy automático

Qualquer `git push` para `main` → Render redeploya em ~3 min (Python/Node) ou GitHub Pages atualiza em ~1 min (dashboard).

---

# 3. GOOGLE CLOUD — SERVICE ACCOUNT

## Criar (uma vez só)

1. **console.cloud.google.com** → criar projeto `painel-falhas`
2. **APIs e Serviços** → **Biblioteca** → ativar **"Google Sheets API"**
3. **Credenciais** → **"+ Criar credenciais"** → **"Conta de serviço"**
4. Nome: `painel-falhas-bot` → papel: **Editor**
5. Clique na conta criada → aba **"Chaves"** → **"Adicionar chave"** → **JSON**
6. Baixa o arquivo `.json` — **guarde com segurança**

O `client_email` do JSON é o email usado para compartilhar a planilha.

---

# 4. GOOGLE SHEETS

**ID:** `1VLo8__wxSJVWiUIFd_JTcOnadJlUt440i1M1pC0ehTs`

## Dar acesso à service account

1. Abra a planilha → **"Compartilhar"**
2. Cole o email da service account → nível **Editor** → **Enviar**

## Tornar legível publicamente (para o dashboard)

**"Compartilhar"** → **"Qualquer pessoa com o link"** → **Visualizador**

## Aba 1 — `Painel de Falhas - Fred Alexandrino`
*(nome exato com acentos)*

| Col | Campo |
|-----|-------|
| A | ID |
| B | Cliente |
| C | Usina |
| D | Equipamento |
| E | Falha |
| F | Causa |
| G | Equip. Impactados |
| H | Ações Realizadas |
| I | Status atual |
| J | Ticket Fabricante |
| K | Nº OS |
| L | Histórico Cronológico |

## Aba 2 — `Log de Mensagens`

| Col | Campo |
|-----|-------|
| A | Timestamp (`29/06/2026 07:48:32`) |
| B | GrupoId |
| C | GrupoNome |
| D | Texto |
| E | Processado (`✅`) |

> Linhas com mais de 5 dias são removidas automaticamente a cada "Verificar Rondas"

---

# 5. APPS SCRIPT

**URL atual:** `https://script.google.com/macros/s/AKfycbya1PLWxm1quM889etDastzC4BMUOQCy6wYVZfWTFY5jy9jLKQR32XJdco7ywPaxmVm3g/exec`

## Recriar (se necessário)

Planilha → **Extensões** → **Apps Script** → cole e implante:

```javascript
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName("Painel de Falhas - Fred Alexandrino");
    var rows = sheet.getDataRange().getValues();
    var FIELD_MAP = {
      "status":9,"falha":5,"causa":6,"impactados":7,
      "acao":8,"ticketFabricante":10,"numeroOS":11,"historico":12
    };
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(data.id)) {
        var col = FIELD_MAP[data.field];
        if (!col) break;
        if (data.append) {
          var hoje = Utilities.formatDate(new Date(),"America/Sao_Paulo","dd/MM");
          var atual = sheet.getRange(i+1,col).getValue()||"";
          data.value = atual ? atual+"\n"+hoje+" - "+data.value : hoje+" - "+data.value;
        }
        sheet.getRange(i+1,col).setValue(data.value);
        return ContentService.createTextOutput(JSON.stringify({ok:true}))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ok:false}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

**Implantar** → Aplicativo da Web → Executar como: **Eu** → Acesso: **Qualquer pessoa** → copie a URL → cole em `APPS_SCRIPT_URL` no `index.html`

---

# 6. RENDER — PYTHON (app.py)

## `requirements.txt`
```
flask==3.0.3
flask-cors==4.0.1
gspread==6.1.2
google-auth==2.29.0
gunicorn==22.0.0
pywebpush
```

## `render.yaml`
```yaml
services:
  - type: web
    name: whatsapp-painel-falhas
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120
    plan: free
```

## Criar o serviço

1. **render.com** → **"New +"** → **"Web Service"**
2. Repositório: `Fred-Alexandrino/painel-falhas`
3. Preencha:

| Campo | Valor |
|-------|-------|
| Name | `whatsapp-painel-falhas` |
| Runtime | `Python 3` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120` |
| Instance Type | `Free` |

4. **"Advanced"** → **"Add Environment Variable"** → adicione todas da tabela abaixo

## Variáveis de ambiente

| Chave | Valor |
|-------|-------|
| `GOOGLE_CREDENTIALS_JSON` | *(conteúdo completo do .json)* |
| `SHEET_ID` | `1VLo8__wxSJVWiUIFd_JTcOnadJlUt440i1M1pC0ehTs` |
| `SHEET_NAME` | `Painel de Falhas - Fred Alexandrino` |
| `WEBHOOK_SECRET` | `falhas2026` |
| `WPP_SERVER_URL` | `https://wppconnect-painel.onrender.com` |
| `GRUPOS_IDS` | `120363423233716775@g.us,120363423427343356@g.us,120363402559504115@g.us,120363426381032089@g.us,120363423844956611@g.us,120363421162420788@g.us,120363425837962709@g.us,120363402176878100@g.us,120363423533840348@g.us,120363421052607450@g.us` |
| `VAPID_PUBLIC_KEY` | `BPU55JogEEcV6GlCUONmzkVam8Tt9a0DuX3FYfn_ltgKc8p1fahQiE8v5RGECnMkSYEXMyUzOYBtslhUdiOJ6Jk` |
| `VAPID_PRIVATE_KEY` | `LS0tLS1CRUdJTiBFQyBQUklWQVRFIEtFWS0tLS0tCk1IY0NBUUVFSUZBY24vUm9vM05kejQreHVNQ0NHcWxreHVYeE9RMng2RGpnTjFoTnhzZW1vQW9HQ0NxR1NNNDkKQXdFSG9VUURRZ0FFOVRua21pQVFSeFhvYVVKUTQyYk9SVnFieE8zMXJRTzVmY1ZoK2YrVzJBcHp5blY5cUZDSQpUeS9sRVlRS2N5UkpnUmN6SlRNNWdHMnlXRlIySTRub21RPT0KLS0tLS1FTkQgRUMgUFJJVkFURSBLRVktLS0tLQo=` |

5. **"Create Web Service"** → aguarda build (~3-5 min)
6. Confirma: `https://whatsapp-painel-falhas.onrender.com/health` → `{"status":"ok"}`

---

# 7. RENDER — NODE.JS (server.js)

1. **"New +"** → **"Web Service"**
2. Repositório: `Fred-Alexandrino/wppconnect-server`

| Campo | Valor |
|-------|-------|
| Name | `wppconnect-painel` |
| Runtime | `Node` |
| Build Command | `npm install` |
| Start Command | `node server.js` |
| Instance Type | `Free` |

## Variáveis de ambiente

| Chave | Valor |
|-------|-------|
| `GRUPOS_IDS` | *(mesmo valor acima)* |
| `SERVIDOR_URL` | `https://whatsapp-painel-falhas.onrender.com` |
| `WEBHOOK_SECRET` | `falhas2026` |
| `SESSION_NAME` | `gridco-oem` |

---

# 8. UPTIMEROBOT

Render free tier hiberna após ~15 min sem requisições → sessão WhatsApp perdida.
UptimeRobot pinga a cada 5 min → mantém acordado 24/7.

1. **uptimerobot.com** → criar conta gratuita
2. **"Add New Monitor"** × 2:

| Campo | Monitor 1 | Monitor 2 |
|-------|-----------|-----------|
| Type | HTTP(s) | HTTP(s) |
| Name | `Painel — Python` | `Painel — Node` |
| URL | `https://whatsapp-painel-falhas.onrender.com/health` | `https://wppconnect-painel.onrender.com/health` |
| Interval | 5 minutes | 5 minutes |

Ambos devem ficar **verdes (Up)** permanentemente.

---

# 9. WHATSAPP — CONECTAR

1. `https://wppconnect-painel.onrender.com/qr`
2. WhatsApp → **Dispositivos conectados** → **Conectar dispositivo** → escaneie
3. Confirme: `https://wppconnect-painel.onrender.com/status` → `"connected":true`

Reconectar quando: UptimeRobot estava desligado, redeploy com "Clear build cache", WhatsApp desconectou.

---

# 10. CREDENCIAIS

## Dashboard

| Usuário | Senha | Perfil | Acesso |
|---------|-------|--------|--------|
| `fredalexandrino` | `Fred2004@` | manager | Tudo: edição, rondas, processos |
| `admin` | `gridco2026` | admin | Somente visualização |
| `thopen` | `thopen2026` | client | Só usinas THOPEN |
| `renogrid` | `reno2026` | client | Só usinas RENOGRID |

## VAPID

| | Valor |
|-|-------|
| Public | `BPU55JogEEcV6GlCUONmzkVam8Tt9a0DuX3FYfn_ltgKc8p1fahQiE8v5RGECnMkSYEXMyUzOYBtslhUdiOJ6Jk` |
| Private | `LS0tLS1CRUdJTiBFQyBQUklWQVRFIEtFWS0tLS0tCk1IY0NBUUVFSUZBY24vUm9vM05kejQreHVNQ0NHcWxreHVYeE9RMng2RGpnTjFoTnhzZW1vQW9HQ0NxR1NNNDkKQXdFSG9VUURRZ0FFOVRua21pQVFSeFhvYVVKUTQyYk9SVnFieE8zMXJRTzVmY1ZoK2YrVzJBcHp5blY5cUZDSQpUeS9sRVlRS2N5UkpnUmN6SlRNNWdHMnlXRlIySTRub21RPT0KLS0tLS1FTkQgRUMgUFJJVkFURSBLRVktLS0tLQo=` |

---

# 11. CHECKLIST

- [ ] `https://whatsapp-painel-falhas.onrender.com/health` → `{"status":"ok"}`
- [ ] `https://wppconnect-painel.onrender.com/status` → `"connected":true`
- [ ] UptimeRobot: 2 monitores verdes
- [ ] Dashboard carrega em `https://fred-alexandrino.github.io/PAINELDEFALHAS/`
- [ ] Login `fredalexandrino` / `Fred2004@` funciona
- [ ] Cards aparecem com dados da planilha
- [ ] Botão "Verificar Rondas" responde
- [ ] "Registradas recentemente" ordena por ID decrescente
- [ ] Ronda "Sem Ocorrência" não cria ocorrência
- [ ] Mensagem nova não altera status de ocorrência existente

---

# 12. TROUBLESHOOTING

## Dashboard sem dados
→ Confirme planilha compartilhada publicamente (Visualizador)
→ F12 → Console → verifique erros CORS

## WhatsApp desconectado
→ `/status` → `connected:false` → escaneie QR em `/qr`
→ Confirme UptimeRobot ativo

## Render com erro
→ Render → serviço → aba **"Logs"**
→ `SyntaxError: invalid character` → arquivo errado no repositório (HTML em vez de Python)
→ Forçar redeploy: **"Manual Deploy"** → **"Deploy latest commit"**

## Ocorrência duplicada
→ `https://whatsapp-painel-falhas.onrender.com/limpar-duplicatas?secret=falhas2026`

## Sessão WhatsApp perdida com frequência
→ UptimeRobot deve estar com intervalo de **5 minutos** e ativo
